-- Financial ledger epochs: EXPAND / INVENTORY phase.
-- Apply this file separately. It is intentionally compatible with the old
-- application and does not install the P1 payment-write enforcement boundary.
-- Phase B (20260906140229) must not run until every conflict inventoried here
-- has been corrected and explicitly approved in a separate reviewed change.
BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE SCHEMA IF NOT EXISTS financial_private;
REVOKE ALL ON SCHEMA financial_private FROM PUBLIC, anon, authenticated;

CREATE TABLE public.financial_ledger_epochs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  currency text NOT NULL CHECK (length(trim(currency)) BETWEEN 3 AND 8),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  source_kind text NOT NULL CHECK (source_kind IN
    ('migration_backfill','currency_transition','legacy_resolution','cutover')),
  source_reference text,
  approval_note text NOT NULL CHECK (length(trim(approval_note)) >= 3),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_ledger_epoch_range CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT financial_ledger_epoch_scope UNIQUE (id, group_id, currency),
  CONSTRAINT financial_ledger_epoch_no_overlap EXCLUDE USING gist
    (group_id WITH =, tstzrange(effective_from, COALESCE(effective_to, 'infinity'::timestamptz), '[)') WITH &&)
);
CREATE UNIQUE INDEX financial_ledger_epoch_one_active
  ON public.financial_ledger_epochs(group_id) WHERE effective_to IS NULL;
CREATE INDEX financial_ledger_epoch_group_period
  ON public.financial_ledger_epochs(group_id, effective_from DESC);

ALTER TABLE public.financial_ledger_epochs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_ledger_epochs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.financial_ledger_epochs TO authenticated, service_role;
CREATE POLICY financial_ledger_epoch_active_reader
  ON public.financial_ledger_epochs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.group_id = financial_ledger_epochs.group_id
      AND m.user_id = auth.uid() AND m.membership_status = 'active'
  ));

ALTER TABLE public.contribution_types ADD COLUMN ledger_epoch_id uuid;
ALTER TABLE public.contribution_obligations ADD COLUMN ledger_epoch_id uuid;
ALTER TABLE public.payments ADD COLUMN ledger_epoch_id uuid;
ALTER TABLE public.payment_obligation_applications ADD COLUMN ledger_epoch_id uuid;
CREATE INDEX contribution_types_epoch ON public.contribution_types(ledger_epoch_id);
CREATE INDEX contribution_obligations_epoch ON public.contribution_obligations(ledger_epoch_id);
CREATE INDEX payments_epoch ON public.payments(ledger_epoch_id);
CREATE INDEX payment_applications_epoch ON public.payment_obligation_applications(ledger_epoch_id);

-- Current conflict inventory. It contains record identifiers and currency
-- metadata only: never member names, phone numbers, receipt paths or notes.
CREATE TABLE financial_private.ledger_epoch_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  record_type text NOT NULL CHECK (record_type IN
    ('contribution_type','obligation','payment','application')),
  record_id uuid NOT NULL,
  record_currency text,
  expected_currency text,
  linked_currency text,
  conflict_category text NOT NULL,
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_detected_at timestamptz NOT NULL DEFAULT now(),
  resolution_status text NOT NULL DEFAULT 'unresolved'
    CHECK (resolution_status IN ('unresolved','approved')),
  resolution_note text,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  resolved_at timestamptz,
  CONSTRAINT ledger_epoch_conflict_identity UNIQUE(record_type, record_id, conflict_category),
  CONSTRAINT ledger_epoch_conflict_resolution CHECK (
    (resolution_status = 'unresolved' AND resolved_by IS NULL AND resolved_at IS NULL)
    OR (resolution_status = 'approved' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL
      AND length(trim(resolution_note)) >= 3)
  )
);
REVOKE ALL ON financial_private.ledger_epoch_conflicts FROM PUBLIC, anon, authenticated;
CREATE INDEX ledger_epoch_conflicts_open
  ON financial_private.ledger_epoch_conflicts(group_id, resolution_status);

-- Founder-approved legacy pollution remains as immutable historical evidence.
-- This private registry contains identifiers and financial state only: no
-- member contact data, receipt paths, provider payloads or free-form PII.
CREATE TABLE financial_private.legacy_financial_neutralizations (
  batch_id uuid NOT NULL,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  record_type text NOT NULL CHECK (record_type IN ('contribution_type','obligation','payment')),
  record_id uuid NOT NULL,
  record_currency text NOT NULL CHECK (length(trim(record_currency)) BETWEEN 3 AND 8),
  founder_decision text NOT NULL CHECK (founder_decision = 'C'),
  reason text NOT NULL CHECK (length(trim(reason)) >= 3),
  prior_state jsonb NOT NULL,
  resulting_state jsonb NOT NULL,
  authorized_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  applied_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  applied_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(record_type,record_id),
  CONSTRAINT legacy_financial_neutralization_batch_record
    UNIQUE(batch_id,record_type,record_id)
);
ALTER TABLE financial_private.legacy_financial_neutralizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_private.legacy_financial_neutralizations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON financial_private.legacy_financial_neutralizations FROM PUBLIC, anon, authenticated, service_role;
CREATE INDEX legacy_financial_neutralizations_group_batch
  ON financial_private.legacy_financial_neutralizations(group_id,batch_id);

CREATE FUNCTION financial_private.guard_legacy_financial_neutralization() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'LEGACY_FINANCIAL_NEUTRALIZATION_IMMUTABLE';
END;
$$;
CREATE TRIGGER legacy_financial_neutralization_immutable
BEFORE UPDATE OR DELETE ON financial_private.legacy_financial_neutralizations
FOR EACH ROW EXECUTE FUNCTION financial_private.guard_legacy_financial_neutralization();

-- The one batch audit entry created by the controlled package is immutable.
CREATE FUNCTION financial_private.guard_legacy_financial_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.action='financial.legacy_pollution_neutralized' THEN
    RAISE EXCEPTION 'LEGACY_FINANCIAL_AUDIT_IMMUTABLE';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER legacy_financial_audit_immutable
BEFORE UPDATE OR DELETE ON public.group_audit_logs
FOR EACH ROW EXECUTE FUNCTION financial_private.guard_legacy_financial_audit();

-- A private transaction proof permits the controlled transition helper to
-- close one epoch, open the next, and update groups.currency atomically.
CREATE TABLE financial_private.epoch_transitions (
  transaction_id bigint NOT NULL,
  group_id uuid NOT NULL,
  PRIMARY KEY(transaction_id, group_id)
);
REVOKE ALL ON financial_private.epoch_transitions FROM PUBLIC, anon, authenticated;

CREATE FUNCTION financial_private.guard_ledger_epoch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE group_currency text;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'LEDGER_EPOCH_IMMUTABLE'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NOT EXISTS (SELECT 1 FROM financial_private.epoch_transitions x
      WHERE x.transaction_id = txid_current() AND x.group_id = OLD.group_id)
      OR (NEW.group_id,NEW.currency,NEW.effective_from,NEW.source_kind,NEW.source_reference,
          NEW.approval_note,NEW.created_by,NEW.approved_by,NEW.approved_at,NEW.created_at)
         IS DISTINCT FROM
         (OLD.group_id,OLD.currency,OLD.effective_from,OLD.source_kind,OLD.source_reference,
          OLD.approval_note,OLD.created_by,OLD.approved_by,OLD.approved_at,OLD.created_at)
      OR OLD.effective_to IS NOT NULL OR NEW.effective_to IS NULL
    THEN RAISE EXCEPTION 'LEDGER_EPOCH_IMMUTABLE'; END IF;
  END IF;
  IF NEW.effective_to IS NULL THEN
    IF NEW.effective_from > clock_timestamp() THEN
      RAISE EXCEPTION 'FUTURE_LEDGER_EPOCH_NOT_ACTIVE';
    END IF;
    SELECT currency INTO group_currency FROM public.groups WHERE id = NEW.group_id;
    IF group_currency IS DISTINCT FROM NEW.currency
      AND NOT EXISTS (SELECT 1 FROM financial_private.epoch_transitions x
        WHERE x.transaction_id = txid_current() AND x.group_id = NEW.group_id)
    THEN RAISE EXCEPTION 'ACTIVE_LEDGER_CURRENCY_MISMATCH'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER financial_ledger_epoch_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.financial_ledger_epochs
FOR EACH ROW EXECUTE FUNCTION financial_private.guard_ledger_epoch();

-- This view is the non-PII, live truth used by both migration phases. A human
-- cannot clear a conflict merely by editing the inventory table.
CREATE VIEW financial_private.current_ledger_epoch_conflicts AS
WITH authoritative_types AS (
  SELECT t.* FROM public.contribution_types t
  WHERE NOT EXISTS (SELECT 1 FROM financial_private.legacy_financial_neutralizations n
    WHERE n.record_type='contribution_type' AND n.record_id=t.id
      AND n.group_id=t.group_id AND n.record_currency=t.currency AND t.is_active=false)
), authoritative_obligations AS (
  SELECT o.* FROM public.contribution_obligations o
  WHERE NOT EXISTS (SELECT 1 FROM financial_private.legacy_financial_neutralizations n
    WHERE n.record_type='obligation' AND n.record_id=o.id
      AND n.group_id=o.group_id AND n.record_currency=o.currency AND o.status='waived')
), authoritative_payments AS (
  SELECT p.* FROM public.payments p
  WHERE NOT EXISTS (SELECT 1 FROM financial_private.legacy_financial_neutralizations n
    WHERE n.record_type='payment' AND n.record_id=p.id
      AND n.group_id=p.group_id AND n.record_currency=p.currency AND p.status='rejected')
), row_currency AS (
  SELECT group_id,currency FROM authoritative_types
  UNION ALL SELECT group_id,currency FROM authoritative_obligations
  UNION ALL SELECT group_id,currency FROM authoritative_payments
), mixed_group AS (
  SELECT group_id FROM row_currency GROUP BY group_id HAVING count(DISTINCT currency) > 1
), type_scope AS (
  SELECT t.group_id,'contribution_type'::text record_type,t.id record_id,t.currency record_currency,
    COALESCE(e.currency,g.currency) expected_currency,NULL::text linked_currency,
    CASE
      WHEN t.ledger_epoch_id IS NULL AND mg.group_id IS NOT NULL THEN 'UNSCOPED_MIXED_CURRENCY_HISTORY'
      WHEN t.ledger_epoch_id IS NULL AND t.currency IS DISTINCT FROM g.currency THEN 'UNSCOPED_CURRENT_CURRENCY_MISMATCH'
      WHEN t.ledger_epoch_id IS NOT NULL AND (e.id IS NULL OR e.group_id<>t.group_id OR e.currency<>t.currency)
        THEN 'EPOCH_SCOPE_MISMATCH'
    END conflict_category
  FROM authoritative_types t JOIN public.groups g ON g.id=t.group_id
  LEFT JOIN public.financial_ledger_epochs e ON e.id=t.ledger_epoch_id
  LEFT JOIN mixed_group mg ON mg.group_id=t.group_id
), obligation_scope AS (
  SELECT o.group_id,'obligation'::text record_type,o.id record_id,o.currency record_currency,
    COALESCE(e.currency,g.currency) expected_currency,t.currency linked_currency,
    CASE
      WHEN t.id IS NULL OR t.group_id<>o.group_id OR t.currency<>o.currency
        OR (o.ledger_epoch_id IS NOT NULL AND t.ledger_epoch_id<>o.ledger_epoch_id)
        THEN 'OBLIGATION_TYPE_SCOPE_MISMATCH'
      WHEN o.ledger_epoch_id IS NULL AND mg.group_id IS NOT NULL THEN 'UNSCOPED_MIXED_CURRENCY_HISTORY'
      WHEN o.ledger_epoch_id IS NULL AND o.currency IS DISTINCT FROM g.currency THEN 'UNSCOPED_CURRENT_CURRENCY_MISMATCH'
      WHEN o.ledger_epoch_id IS NOT NULL AND (e.id IS NULL OR e.group_id<>o.group_id OR e.currency<>o.currency)
        THEN 'EPOCH_SCOPE_MISMATCH'
    END conflict_category
  FROM authoritative_obligations o JOIN public.groups g ON g.id=o.group_id
  LEFT JOIN public.contribution_types t ON t.id=o.contribution_type_id
  LEFT JOIN public.financial_ledger_epochs e ON e.id=o.ledger_epoch_id
  LEFT JOIN mixed_group mg ON mg.group_id=o.group_id
), payment_base AS (
  SELECT p.*,g.currency group_currency,e.currency epoch_currency,e.group_id epoch_group,
    t.currency type_currency,t.group_id type_group,t.ledger_epoch_id type_epoch,
    o.currency obligation_currency,o.group_id obligation_group,o.membership_id obligation_member,
    o.contribution_type_id obligation_type,o.ledger_epoch_id obligation_epoch,mg.group_id mixed_group_id
  FROM authoritative_payments p JOIN public.groups g ON g.id=p.group_id
  LEFT JOIN public.financial_ledger_epochs e ON e.id=p.ledger_epoch_id
  LEFT JOIN public.contribution_types t ON t.id=p.contribution_type_id
  LEFT JOIN public.contribution_obligations o ON o.id=p.obligation_id
  LEFT JOIN mixed_group mg ON mg.group_id=p.group_id
), payment_scope AS (
  SELECT group_id,'payment'::text record_type,id record_id,currency record_currency,
    COALESCE(epoch_currency,group_currency) expected_currency,type_currency linked_currency,
    CASE
      WHEN contribution_type_id IS NOT NULL AND (type_group IS DISTINCT FROM group_id
        OR type_currency IS DISTINCT FROM currency
        OR (ledger_epoch_id IS NOT NULL AND type_epoch IS DISTINCT FROM ledger_epoch_id))
        THEN 'PAYMENT_TYPE_SCOPE_MISMATCH'
      WHEN obligation_id IS NOT NULL AND (obligation_group IS DISTINCT FROM group_id
        OR obligation_member IS DISTINCT FROM membership_id
        OR obligation_currency IS DISTINCT FROM currency
        OR obligation_epoch IS DISTINCT FROM ledger_epoch_id
        OR (contribution_type_id IS NOT NULL AND obligation_type IS DISTINCT FROM contribution_type_id))
        THEN 'PAYMENT_OBLIGATION_SCOPE_MISMATCH'
      WHEN ledger_epoch_id IS NULL AND mixed_group_id IS NOT NULL THEN 'UNSCOPED_MIXED_CURRENCY_HISTORY'
      WHEN ledger_epoch_id IS NULL AND currency IS DISTINCT FROM group_currency THEN 'UNSCOPED_CURRENT_CURRENCY_MISMATCH'
      WHEN ledger_epoch_id IS NOT NULL AND (epoch_group IS DISTINCT FROM group_id OR epoch_currency IS DISTINCT FROM currency)
        THEN 'EPOCH_SCOPE_MISMATCH'
    END conflict_category
  FROM payment_base
), application_scope AS (
  SELECT p.group_id,'application'::text record_type,a.payment_id record_id,p.currency record_currency,
    pe.currency expected_currency,min(o.currency::text) linked_currency,
    'APPLICATION_EPOCH_MISMATCH'::text conflict_category
  FROM public.payment_obligation_applications a
  JOIN authoritative_payments p ON p.id=a.payment_id
  JOIN public.contribution_obligations o ON o.id=a.obligation_id
  LEFT JOIN public.financial_ledger_epochs pe ON pe.id=p.ledger_epoch_id
  GROUP BY p.group_id,a.payment_id,p.currency,pe.currency
  HAVING bool_or(a.ledger_epoch_id IS NULL OR a.ledger_epoch_id IS DISTINCT FROM p.ledger_epoch_id
    OR a.ledger_epoch_id IS DISTINCT FROM o.ledger_epoch_id)
)
SELECT * FROM type_scope WHERE conflict_category IS NOT NULL
UNION ALL SELECT * FROM obligation_scope WHERE conflict_category IS NOT NULL
UNION ALL SELECT * FROM payment_scope WHERE conflict_category IS NOT NULL
UNION ALL SELECT * FROM application_scope WHERE conflict_category IS NOT NULL;
REVOKE ALL ON financial_private.current_ledger_epoch_conflicts FROM PUBLIC, anon, authenticated;

CREATE FUNCTION financial_private.refresh_ledger_epoch_conflicts() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE conflict_count integer;
BEGIN
  INSERT INTO financial_private.ledger_epoch_conflicts(
    group_id,record_type,record_id,record_currency,expected_currency,linked_currency,conflict_category)
  SELECT group_id,record_type,record_id,record_currency,expected_currency,linked_currency,conflict_category
  FROM financial_private.current_ledger_epoch_conflicts
  ON CONFLICT(record_type,record_id,conflict_category) DO UPDATE SET
    group_id=EXCLUDED.group_id,record_currency=EXCLUDED.record_currency,
    expected_currency=EXCLUDED.expected_currency,linked_currency=EXCLUDED.linked_currency,
    last_detected_at=now(),resolution_status='unresolved',resolution_note=NULL,
    resolved_by=NULL,resolved_at=NULL;
  SELECT count(*) INTO conflict_count FROM financial_private.current_ledger_epoch_conflicts;
  RETURN conflict_count;
END;
$$;

SELECT financial_private.refresh_ledger_epoch_conflicts();

-- Only groups that are provably single-currency and internally consistent are
-- backfilled. Mixed/linked conflicts remain unscoped and visible in inventory.
INSERT INTO public.financial_ledger_epochs(
  group_id,currency,effective_from,source_kind,source_reference,approval_note)
SELECT g.id,g.currency,COALESCE(first_record.created_at,g.created_at,now()),
  'migration_backfill','20260906140228','Deterministic clean single-currency backfill'
FROM public.groups g
LEFT JOIN LATERAL (
  SELECT min(x.created_at) created_at FROM (
    SELECT t.created_at FROM public.contribution_types t WHERE t.group_id=g.id
    UNION ALL SELECT o.created_at FROM public.contribution_obligations o WHERE o.group_id=g.id
    UNION ALL SELECT p.created_at FROM public.payments p WHERE p.group_id=g.id
  ) x
) first_record ON true
WHERE NOT EXISTS (SELECT 1 FROM financial_private.ledger_epoch_conflicts c
  WHERE c.group_id=g.id AND c.resolution_status='unresolved');

UPDATE public.contribution_types t SET ledger_epoch_id=e.id
FROM public.financial_ledger_epochs e
WHERE t.ledger_epoch_id IS NULL AND e.group_id=t.group_id AND e.currency=t.currency AND e.effective_to IS NULL;
UPDATE public.contribution_obligations o SET ledger_epoch_id=e.id
FROM public.financial_ledger_epochs e
WHERE o.ledger_epoch_id IS NULL AND e.group_id=o.group_id AND e.currency=o.currency AND e.effective_to IS NULL;
UPDATE public.payments p SET ledger_epoch_id=e.id
FROM public.financial_ledger_epochs e
WHERE p.ledger_epoch_id IS NULL AND e.group_id=p.group_id AND e.currency=p.currency AND e.effective_to IS NULL;
UPDATE public.payment_obligation_applications a SET ledger_epoch_id=p.ledger_epoch_id
FROM public.payments p,public.contribution_obligations o
WHERE a.payment_id=p.id AND a.obligation_id=o.id AND p.ledger_epoch_id=o.ledger_epoch_id
  AND a.ledger_epoch_id IS NULL;

-- Bridge assignment keeps old insert payloads compatible during the expand
-- window. It assigns only when exactly one matching active epoch exists; it
-- deliberately leaves ambiguous groups unscoped for Phase B to block.
CREATE FUNCTION financial_private.assign_epoch_if_unambiguous() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.ledger_epoch_id IS NULL THEN
    SELECT e.id INTO NEW.ledger_epoch_id FROM public.financial_ledger_epochs e
    WHERE e.group_id=NEW.group_id AND e.currency=NEW.currency AND e.effective_to IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER financial_00_type_epoch_bridge BEFORE INSERT OR UPDATE OF group_id,currency,ledger_epoch_id
ON public.contribution_types FOR EACH ROW EXECUTE FUNCTION financial_private.assign_epoch_if_unambiguous();
CREATE TRIGGER financial_00_obligation_epoch_bridge BEFORE INSERT OR UPDATE OF group_id,currency,ledger_epoch_id
ON public.contribution_obligations FOR EACH ROW EXECUTE FUNCTION financial_private.assign_epoch_if_unambiguous();
CREATE TRIGGER financial_00_payment_epoch_bridge BEFORE INSERT OR UPDATE OF group_id,currency,ledger_epoch_id
ON public.payments FOR EACH ROW EXECUTE FUNCTION financial_private.assign_epoch_if_unambiguous();

CREATE FUNCTION financial_private.assign_application_epoch_if_unambiguous() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.ledger_epoch_id IS NULL THEN
    SELECT p.ledger_epoch_id INTO NEW.ledger_epoch_id
    FROM public.payments p JOIN public.contribution_obligations o
      ON o.id=NEW.obligation_id AND o.ledger_epoch_id=p.ledger_epoch_id
    WHERE p.id=NEW.payment_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER financial_00_application_epoch_bridge BEFORE INSERT OR UPDATE OF payment_id,obligation_id,ledger_epoch_id
ON public.payment_obligation_applications FOR EACH ROW
EXECUTE FUNCTION financial_private.assign_application_epoch_if_unambiguous();

-- Member-transfer RPC hardening belongs in Phase A. The epoch table is now
-- available, and installing these replacements in the same transaction closes
-- the old/direct-client gap before the epoch-aware application is cut over.
-- Phase B is deliberately not a prerequisite for this authorization boundary.
--
-- A transfer moves membership, never money. Source financial rows remain on
-- the exited source membership. Only the standing enum may be carried, and
-- only when both groups' current authoritative ledger epochs use the same
-- currency. Cross-currency transfers must explicitly request a fresh standing.
CREATE OR REPLACE FUNCTION public.request_member_transfer(
  p_member_id uuid,
  p_source_group_id uuid,
  p_dest_group_id uuid,
  p_reason text DEFAULT NULL,
  p_carry_over_standing boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_transfer_id uuid;
  v_source_organization_id uuid;
  v_dest_organization_id uuid;
  v_dest_active boolean;
  v_source_group_currency text;
  v_dest_group_currency text;
  v_source_epoch_currency text;
  v_dest_epoch_currency text;
  v_carry_over boolean := COALESCE(p_carry_over_standing, true);
  v_is_source_admin boolean;
  v_is_platform_staff boolean;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  IF p_source_group_id = p_dest_group_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'same_group');
  END IF;

  -- Serialize duplicate requests for the same member and route, including
  -- direct clients racing before either insert commits.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'member-transfer-request:' || p_member_id::text || ':' ||
    p_source_group_id::text || ':' || p_dest_group_id::text, 0));

  -- Lock mutable authorization and tenant context before evaluating it.
  PERFORM 1
  FROM public.groups g
  WHERE g.id IN (p_source_group_id, p_dest_group_id)
  ORDER BY g.id
  FOR SHARE;

  PERFORM 1
  FROM public.memberships m
  WHERE m.user_id = v_caller
    AND m.group_id = p_source_group_id
  ORDER BY m.id
  FOR SHARE;

  PERFORM 1
  FROM public.platform_staff ps
  WHERE ps.user_id = v_caller
  FOR SHARE;

  PERFORM 1
  FROM public.memberships m
  WHERE m.user_id = p_member_id
    AND m.group_id = p_source_group_id
    AND m.membership_status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'source_membership_missing');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = v_caller
      AND m.group_id = p_source_group_id
      AND m.role IN ('owner', 'admin')
      AND m.membership_status = 'active'
  ) INTO v_is_source_admin;

  SELECT EXISTS (
    SELECT 1
    FROM public.platform_staff ps
    WHERE ps.user_id = v_caller
      AND ps.is_active = true
  ) INTO v_is_platform_staff;

  IF NOT (v_caller = p_member_id OR v_is_source_admin OR v_is_platform_staff) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  SELECT g.organization_id, g.currency
    INTO v_source_organization_id, v_source_group_currency
  FROM public.groups g
  WHERE g.id = p_source_group_id;

  SELECT g.organization_id, g.is_active, g.currency
    INTO v_dest_organization_id, v_dest_active, v_dest_group_currency
  FROM public.groups g
  WHERE g.id = p_dest_group_id;

  IF v_source_organization_id IS NULL
     OR v_dest_organization_id IS DISTINCT FROM v_source_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'groups_not_related');
  END IF;

  IF v_dest_active IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dest_group_inactive');
  END IF;

  -- Lock both active epochs in deterministic order. A concurrent epoch
  -- transition must finish before this request decides compatibility.
  PERFORM 1
  FROM public.financial_ledger_epochs e
  WHERE e.group_id IN (p_source_group_id, p_dest_group_id)
    AND e.effective_to IS NULL
  ORDER BY e.group_id
  FOR SHARE;

  SELECT upper(trim(e.currency)) INTO v_source_epoch_currency
  FROM public.financial_ledger_epochs e
  WHERE e.group_id = p_source_group_id
    AND e.effective_to IS NULL;

  SELECT upper(trim(e.currency)) INTO v_dest_epoch_currency
  FROM public.financial_ledger_epochs e
  WHERE e.group_id = p_dest_group_id
    AND e.effective_to IS NULL;

  IF v_source_epoch_currency IS NULL OR v_dest_epoch_currency IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'active_ledger_epoch_missing');
  END IF;

  IF v_source_epoch_currency IS DISTINCT FROM upper(trim(v_source_group_currency))
     OR v_dest_epoch_currency IS DISTINCT FROM upper(trim(v_dest_group_currency)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'active_ledger_epoch_mismatch');
  END IF;

  IF v_carry_over
     AND v_source_epoch_currency IS DISTINCT FROM v_dest_epoch_currency THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'cross_currency_standing_not_allowed'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.member_transfers mt
    WHERE mt.member_id = p_member_id
      AND mt.source_group_id = p_source_group_id
      AND mt.dest_group_id = p_dest_group_id
      AND mt.status IN ('requested', 'approved')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_open_transfer');
  END IF;

  INSERT INTO public.member_transfers (
    member_id, source_group_id, dest_group_id, reason,
    carry_over_standing, requested_by, status
  )
  VALUES (
    p_member_id, p_source_group_id, p_dest_group_id,
    NULLIF(btrim(p_reason), ''), v_carry_over, v_caller, 'requested'
  )
  RETURNING id INTO v_transfer_id;

  RETURN jsonb_build_object('ok', true, 'transfer_id', v_transfer_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_member_transfer(p_transfer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_transfer public.member_transfers;
  v_source_membership_id uuid;
  v_new_membership_id uuid;
  v_display_name text;
  v_source_standing public.membership_standing;
  v_dest_standing public.membership_standing;
  v_source_organization_id uuid;
  v_dest_organization_id uuid;
  v_dest_active boolean;
  v_source_group_currency text;
  v_dest_group_currency text;
  v_source_epoch_currency text;
  v_dest_epoch_currency text;
  v_is_group_admin boolean;
  v_is_platform_staff boolean;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  -- The row lock makes status/version evaluation and completion single-use.
  SELECT * INTO v_transfer
  FROM public.member_transfers mt
  WHERE mt.id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transfer_not_found');
  END IF;

  IF v_transfer.status::text <> 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transfer_not_approved');
  END IF;

  IF v_transfer.completed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_completed');
  END IF;

  -- Lock current tenant and actor state. Suspended, archived, pending and
  -- exited officer rows cannot authorize this SECURITY DEFINER function.
  PERFORM 1
  FROM public.groups g
  WHERE g.id IN (v_transfer.source_group_id, v_transfer.dest_group_id)
  ORDER BY g.id
  FOR SHARE;

  PERFORM 1
  FROM public.memberships m
  WHERE m.user_id = v_caller
    AND m.group_id IN (v_transfer.source_group_id, v_transfer.dest_group_id)
  ORDER BY m.id
  FOR SHARE;

  PERFORM 1
  FROM public.platform_staff ps
  WHERE ps.user_id = v_caller
  FOR SHARE;

  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = v_caller
      AND m.group_id IN (v_transfer.source_group_id, v_transfer.dest_group_id)
      AND m.role IN ('owner', 'admin')
      AND m.membership_status = 'active'
  ) INTO v_is_group_admin;

  SELECT EXISTS (
    SELECT 1
    FROM public.platform_staff ps
    WHERE ps.user_id = v_caller
      AND ps.is_active = true
  ) INTO v_is_platform_staff;

  IF NOT (v_is_group_admin OR v_is_platform_staff) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  SELECT g.organization_id, g.currency
    INTO v_source_organization_id, v_source_group_currency
  FROM public.groups g
  WHERE g.id = v_transfer.source_group_id;

  SELECT g.organization_id, g.is_active, g.currency
    INTO v_dest_organization_id, v_dest_active, v_dest_group_currency
  FROM public.groups g
  WHERE g.id = v_transfer.dest_group_id;

  IF v_source_organization_id IS NULL
     OR v_dest_organization_id IS DISTINCT FROM v_source_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'groups_not_related');
  END IF;

  IF v_dest_active IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dest_group_inactive');
  END IF;

  -- Re-read and lock the live epochs at execution. The request-time result is
  -- intentionally not persisted as authority: a legitimate currency
  -- transition between request and execution must change this decision.
  PERFORM 1
  FROM public.financial_ledger_epochs e
  WHERE e.group_id IN (v_transfer.source_group_id, v_transfer.dest_group_id)
    AND e.effective_to IS NULL
  ORDER BY e.group_id
  FOR SHARE;

  SELECT upper(trim(e.currency)) INTO v_source_epoch_currency
  FROM public.financial_ledger_epochs e
  WHERE e.group_id = v_transfer.source_group_id
    AND e.effective_to IS NULL;

  SELECT upper(trim(e.currency)) INTO v_dest_epoch_currency
  FROM public.financial_ledger_epochs e
  WHERE e.group_id = v_transfer.dest_group_id
    AND e.effective_to IS NULL;

  IF v_source_epoch_currency IS NULL OR v_dest_epoch_currency IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'active_ledger_epoch_missing');
  END IF;

  IF v_source_epoch_currency IS DISTINCT FROM upper(trim(v_source_group_currency))
     OR v_dest_epoch_currency IS DISTINCT FROM upper(trim(v_dest_group_currency)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'active_ledger_epoch_mismatch');
  END IF;

  IF v_transfer.carry_over_standing
     AND v_source_epoch_currency IS DISTINCT FROM v_dest_epoch_currency THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'cross_currency_standing_not_allowed'
    );
  END IF;

  SELECT m.id, m.display_name, m.standing
    INTO v_source_membership_id, v_display_name, v_source_standing
  FROM public.memberships m
  WHERE m.group_id = v_transfer.source_group_id
    AND m.user_id = v_transfer.member_id
    AND m.membership_status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'source_membership_missing');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.group_id = v_transfer.dest_group_id
      AND m.user_id = v_transfer.member_id
      AND m.membership_status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_in_destination');
  END IF;

  IF v_transfer.carry_over_standing THEN
    v_dest_standing := v_source_standing;
  ELSE
    v_dest_standing := 'good'::public.membership_standing;
  END IF;

  -- membership_status is the transfer audit marker. Keep the source standing
  -- and every source financial row intact; membership_standing has no
  -- 'transferred' value in the canonical schema.
  UPDATE public.memberships
  SET membership_status = 'exited',
      updated_at = now()
  WHERE id = v_source_membership_id;

  INSERT INTO public.memberships (
    user_id, group_id, role, standing, is_proxy, display_name,
    membership_status, joined_at
  )
  VALUES (
    v_transfer.member_id, v_transfer.dest_group_id, 'member',
    v_dest_standing, false, v_display_name, 'active', now()
  )
  RETURNING id INTO v_new_membership_id;

  UPDATE public.member_transfers
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = p_transfer_id
    AND status::text = 'approved'
    AND completed_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRANSFER_STATE_CHANGED' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'new_membership_id', v_new_membership_id,
    'source_membership_id', v_source_membership_id,
    'dest_standing', v_dest_standing::text
  );
END;
$$;

-- SECURITY DEFINER RPCs are exposed only to authenticated callers and the
-- trusted service role. Internal authorization above remains mandatory.
REVOKE ALL ON FUNCTION public.request_member_transfer(uuid, uuid, uuid, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_member_transfer(uuid, uuid, uuid, text, boolean)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.execute_member_transfer(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_member_transfer(uuid)
  TO authenticated, service_role;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA financial_private FROM PUBLIC, anon, authenticated;
COMMIT;
