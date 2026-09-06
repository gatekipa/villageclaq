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
WITH row_currency AS (
  SELECT group_id,currency FROM public.contribution_types
  UNION ALL SELECT group_id,currency FROM public.contribution_obligations
  UNION ALL SELECT group_id,currency FROM public.payments
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
  FROM public.contribution_types t JOIN public.groups g ON g.id=t.group_id
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
  FROM public.contribution_obligations o JOIN public.groups g ON g.id=o.group_id
  LEFT JOIN public.contribution_types t ON t.id=o.contribution_type_id
  LEFT JOIN public.financial_ledger_epochs e ON e.id=o.ledger_epoch_id
  LEFT JOIN mixed_group mg ON mg.group_id=o.group_id
), payment_base AS (
  SELECT p.*,g.currency group_currency,e.currency epoch_currency,e.group_id epoch_group,
    t.currency type_currency,t.group_id type_group,t.ledger_epoch_id type_epoch,
    o.currency obligation_currency,o.group_id obligation_group,o.membership_id obligation_member,
    o.contribution_type_id obligation_type,o.ledger_epoch_id obligation_epoch,mg.group_id mixed_group_id
  FROM public.payments p JOIN public.groups g ON g.id=p.group_id
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
  JOIN public.payments p ON p.id=a.payment_id
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

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA financial_private FROM PUBLIC, anon, authenticated;
COMMIT;
