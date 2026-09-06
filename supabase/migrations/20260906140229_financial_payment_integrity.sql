-- P1 payment boundary. CREATE/TEST ONLY: apply separately after review, never via a broad runner.
-- Existing payments/obligations/application rows remain the accounting records.
BEGIN;

CREATE SCHEMA IF NOT EXISTS financial_private;
REVOKE ALL ON SCHEMA financial_private FROM PUBLIC, anon, authenticated;
ALTER TABLE public.payments ADD COLUMN financial_version integer NOT NULL DEFAULT 1;

-- A committed command is both a durable retry result and immutable correction evidence.
CREATE TABLE financial_private.payment_commands (
  group_id uuid NOT NULL,
  request_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  transaction_id bigint NOT NULL DEFAULT txid_current(),
  request jsonb NOT NULL,
  before_record jsonb,
  after_record jsonb,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, request_id)
);
REVOKE ALL ON financial_private.payment_commands FROM PUBLIC, anon, authenticated;
CREATE INDEX payment_commands_payment ON financial_private.payment_commands(payment_id, created_at);
CREATE INDEX IF NOT EXISTS payment_applications_obligation ON public.payment_obligation_applications(obligation_id);

-- Private, transaction-local reconciliation proof. Empty after each successful call.
-- Unlike a caller-set GUC this cannot authorize a forged cached-balance write.
CREATE TABLE financial_private.reconciliations (
  transaction_id bigint NOT NULL, membership_id uuid NOT NULL,
  PRIMARY KEY(transaction_id,membership_id)
);
REVOKE ALL ON financial_private.reconciliations FROM PUBLIC, anon, authenticated;

-- Require active membership before consulting the existing officer permission policy.
CREATE FUNCTION financial_private.can_manage(gid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.memberships m WHERE m.group_id = gid
    AND m.user_id = auth.uid() AND m.membership_status = 'active')
    AND public.has_group_permission(gid, 'finances.manage', auth.uid());
$$;
CREATE FUNCTION financial_private.can_read(mid uuid, gid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.memberships subject WHERE subject.id = mid AND subject.group_id = gid)
    AND EXISTS (SELECT 1 FROM public.memberships viewer WHERE viewer.group_id = gid
      AND viewer.user_id = auth.uid() AND viewer.membership_status = 'active'
      AND (viewer.id = mid OR public.has_group_permission(gid, 'finances.view', auth.uid())
        OR public.has_group_permission(gid, 'finances.manage', auth.uid())));
$$;

-- Normalize ONLY known receipt object paths/legacy storage URLs. Never return a signed URL.
CREATE FUNCTION financial_private.decode_uri_path(raw text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE pos integer := 1; bytes bytea := ''::bytea; part text;
BEGIN
  WHILE pos <= length(raw) LOOP
    part := substr(raw,pos,1);
    IF part = '%' THEN
      part := substr(raw,pos+1,2);
      IF part !~ '^[0-9A-Fa-f]{2}$' THEN RETURN NULL; END IF;
      bytes := bytes || decode(part,'hex'); pos := pos+3;
    ELSE
      bytes := bytes || convert_to(part,'UTF8'); pos := pos+1;
    END IF;
  END LOOP;
  RETURN convert_from(bytes,'UTF8');
EXCEPTION WHEN character_not_in_repertoire THEN RETURN NULL;
END;
$$;
CREATE FUNCTION financial_private.receipt_path(raw text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN raw IS NULL OR raw = '' THEN NULL
    WHEN raw ~ '^https?://' THEN CASE
      WHEN raw ~ '/storage/v1/object/(public|sign|authenticated)/receipts/'
      THEN financial_private.decode_uri_path(split_part(split_part(regexp_replace(raw, '^.*/storage/v1/object/(public|sign|authenticated)/receipts/', ''), '?', 1), '#', 1))
      ELSE NULL END
    WHEN raw !~ '(^/|\.\.|[?#])' THEN raw ELSE NULL END;
$$;

-- Preserve every self-escalation freeze from 00098. Only a private financial
-- reconciliation may write its own calculated standing; caller-set GUCs cannot.
CREATE OR REPLACE FUNCTION public.prevent_membership_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  -- Skip entirely for service-role / background writes (auth.uid() is NULL).
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only intervene when the caller is editing their OWN membership row.
  -- Admin updates to other members' rows (approve, suspend RPCs, transfers)
  -- are governed by the existing rls_membership_role_guard policy and the
  -- RPCs' own self-blocks.
  IF OLD.user_id IS DISTINCT FROM v_caller THEN
    RETURN NEW;
  END IF;

  -- membership_status is frozen on ALL self-edits — admins included — with
  -- self-exit as the only carve-out. Runs BEFORE the admin bypass so a
  -- suspended/archived owner-admin cannot self-reactivate through
  -- is_group_admin() (which excludes only 'exited'), and a self-targeted
  -- unsuspend_platform_user call rolls back here.
  IF NEW.membership_status IS DISTINCT FROM OLD.membership_status
     AND NEW.membership_status <> 'exited' THEN
    RAISE EXCEPTION 'membership_status_change_requires_admin' USING ERRCODE = '42501';
  END IF;

  v_is_admin := is_group_admin(OLD.group_id);

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Non-admin self-edit: freeze every other privilege-bearing column.
  IF NEW.role           IS DISTINCT FROM OLD.role           THEN RAISE EXCEPTION 'role_change_requires_admin'           USING ERRCODE = '42501'; END IF;
  IF NEW.standing IS DISTINCT FROM OLD.standing AND NOT EXISTS (
    SELECT 1 FROM financial_private.reconciliations
    WHERE transaction_id=txid_current() AND membership_id=OLD.id
  ) THEN RAISE EXCEPTION 'standing_change_requires_admin' USING ERRCODE='42501'; END IF;
  IF NEW.group_id       IS DISTINCT FROM OLD.group_id       THEN RAISE EXCEPTION 'group_id_change_not_allowed'           USING ERRCODE = '42501'; END IF;
  IF NEW.user_id        IS DISTINCT FROM OLD.user_id        THEN RAISE EXCEPTION 'user_id_change_not_allowed'            USING ERRCODE = '42501'; END IF;
  IF NEW.is_proxy       IS DISTINCT FROM OLD.is_proxy       THEN RAISE EXCEPTION 'is_proxy_change_requires_admin'       USING ERRCODE = '42501'; END IF;
  IF NEW.proxy_manager_id IS DISTINCT FROM OLD.proxy_manager_id THEN RAISE EXCEPTION 'proxy_manager_change_requires_admin' USING ERRCODE = '42501'; END IF;

  RETURN NEW;
END;
$$;

-- One currency per group's dues ledger, no FX or silent historical conversion.
CREATE FUNCTION financial_private.assert_member_scope(gid uuid, mid uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE code text;
BEGIN
  SELECT currency INTO code FROM public.groups WHERE id = gid;
  IF NOT EXISTS (SELECT 1 FROM public.memberships WHERE id = mid AND group_id = gid)
    OR EXISTS (SELECT 1 FROM public.contribution_obligations o
      JOIN public.contribution_types t ON t.id = o.contribution_type_id
      WHERE o.membership_id = mid AND (o.group_id <> gid OR t.group_id <> gid OR o.currency <> code OR t.currency <> code))
    OR EXISTS (SELECT 1 FROM public.payments p WHERE p.membership_id = mid AND p.relief_plan_id IS NULL
      AND (p.group_id <> gid OR p.currency <> code
        OR (p.contribution_type_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.contribution_types t
          WHERE t.id = p.contribution_type_id AND t.group_id = gid AND t.currency = code))
        OR (p.obligation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.contribution_obligations o
          WHERE o.id = p.obligation_id AND o.group_id = gid AND o.membership_id = mid
            AND (p.contribution_type_id IS NULL OR o.contribution_type_id = p.contribution_type_id)))))
  THEN RAISE EXCEPTION 'FINANCIAL_SCOPE_REQUIRES_REVIEW'; END IF;
END;
$$;

-- Same rule as money.ts: typed funds first, then general funds, oldest due/id first.
-- Applications are rebuilt in the SAME transaction and capped at each assessment.
CREATE FUNCTION financial_private.reconcile_member(gid uuid, mid uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE pay_row record; obligation_row record; remaining numeric; applied numeric; paid numeric; old_standing text; new_standing text;
BEGIN
  PERFORM 1 FROM public.memberships WHERE id = mid AND group_id = gid FOR UPDATE;
  PERFORM financial_private.assert_member_scope(gid, mid);
  INSERT INTO financial_private.reconciliations VALUES(txid_current(),mid);
  DELETE FROM public.payment_obligation_applications a USING public.payments p
    WHERE a.payment_id = p.id AND p.group_id = gid AND p.membership_id = mid AND p.relief_plan_id IS NULL;
  FOR pay_row IN SELECT p.*, COALESCE(p.contribution_type_id, linked.contribution_type_id) AS allocation_type
    FROM public.payments p LEFT JOIN public.contribution_obligations linked ON linked.id = p.obligation_id
    WHERE p.group_id = gid AND p.membership_id = mid AND p.relief_plan_id IS NULL
      AND COALESCE(NULLIF(p.status, ''), 'confirmed') = 'confirmed'
    ORDER BY (COALESCE(p.contribution_type_id, linked.contribution_type_id) IS NULL), p.recorded_at, p.id
  LOOP
    remaining := pay_row.amount;
    FOR obligation_row IN SELECT * FROM public.contribution_obligations
      WHERE group_id = gid AND membership_id = mid AND status <> 'waived'
        AND (pay_row.allocation_type IS NULL OR contribution_type_id = pay_row.allocation_type)
      ORDER BY due_date NULLS LAST, id
    LOOP
      SELECT COALESCE(sum(amount_applied), 0) INTO paid FROM public.payment_obligation_applications WHERE obligation_id = obligation_row.id;
      applied := LEAST(remaining, GREATEST(0, obligation_row.amount - paid));
      IF applied > 0 THEN
        INSERT INTO public.payment_obligation_applications(payment_id, obligation_id, amount_applied) VALUES (pay_row.id, obligation_row.id, applied);
        remaining := remaining - applied;
      END IF;
      EXIT WHEN remaining <= 0;
    END LOOP;
  END LOOP;
  UPDATE public.contribution_obligations o SET amount_paid = x.paid,
    status = CASE WHEN o.status = 'waived' THEN 'waived'
      WHEN x.paid >= o.amount THEN 'paid'
      WHEN x.paid > 0 THEN 'partial'
      WHEN o.due_date < CURRENT_DATE THEN 'overdue' ELSE 'pending' END::public.obligation_status
    FROM (SELECT ob.id, COALESCE(sum(a.amount_applied), 0) AS paid
      FROM public.contribution_obligations ob LEFT JOIN public.payment_obligation_applications a ON a.obligation_id = ob.id
      WHERE ob.group_id = gid AND ob.membership_id = mid GROUP BY ob.id) x
    WHERE o.id = x.id;
  -- Preserve the existing standing policy, but do not swallow failures/evidence writes.
  SELECT standing::text INTO old_standing FROM public.memberships WHERE id = mid;
  new_standing := public.compute_member_standing(mid, NULL);
  IF old_standing IS DISTINCT FROM new_standing THEN
    UPDATE public.memberships SET standing = new_standing::public.membership_standing, updated_at = now() WHERE id = mid;
    INSERT INTO public.group_audit_logs(group_id, actor_id, action, entity_type, entity_id, details)
      VALUES (gid, auth.uid(), 'member.standing_recalculated', 'membership', mid,
        jsonb_build_object('oldStanding', old_standing, 'newStanding', new_standing, 'source', 'financial_transaction'));
  END IF;
  DELETE FROM financial_private.reconciliations WHERE transaction_id = txid_current() AND membership_id = mid;
END;
$$;

-- A caller-set GUC alone is NOT authorization: require the private in-flight command,
-- matching transaction, actor AND payment. Completed/replayed commands cannot write.
CREATE FUNCTION financial_private.guard_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PAYMENT_HISTORY_IMMUTABLE_USE_VOID';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.group_id, NEW.membership_id, NEW.relief_plan_id, NEW.contribution_type_id, NEW.obligation_id)
    IS DISTINCT FROM (OLD.group_id, OLD.membership_id, OLD.relief_plan_id, OLD.contribution_type_id, OLD.obligation_id)
  THEN RAISE EXCEPTION 'PAYMENT_ATTRIBUTION_IMMUTABLE'; END IF;
  row_id := NEW.id;
  IF NOT EXISTS (SELECT 1 FROM financial_private.payment_commands c
    WHERE c.group_id = NEW.group_id AND c.payment_id = row_id AND c.actor_id = auth.uid()
      AND c.transaction_id = txid_current() AND c.result IS NULL
      AND c.request_id::text = current_setting('villageclaq.payment_command', true))
  THEN RAISE EXCEPTION 'PAYMENT_COMMAND_REQUIRED'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER financial_payment_guard BEFORE INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION financial_private.guard_payment();

-- Replace linked-only/independent-standing payment triggers with one atomic reconciliation.
-- Preserve the existing relief period/required-amount policy, including admin suspension.
-- Run on corrections/rejections too, before standing; never allocate relief funds to dues.
CREATE FUNCTION financial_private.reconcile_relief(gid uuid, mid uuid, plan uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE enrollment record; frequency text; required numeric; period_start timestamptz; total numeric; next_status text; code text;
BEGIN
  SELECT g.currency,r.contribution_frequency::text,r.contribution_amount INTO code,frequency,required
    FROM public.relief_plans r JOIN public.groups g ON g.id=r.group_id WHERE r.id=plan AND r.group_id=gid;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_SCOPE_REQUIRES_REVIEW'; END IF;
  IF required IS NULL OR required <= 0 THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.payments WHERE relief_plan_id=plan AND membership_id=mid AND (group_id<>gid OR currency<>code))
    THEN RAISE EXCEPTION 'FINANCIAL_SCOPE_REQUIRES_REVIEW'; END IF;
  period_start := CASE WHEN frequency='per_event' THEN NULL WHEN frequency='annual'
    THEN date_trunc('year',CURRENT_DATE) WHEN frequency='quarterly' THEN date_trunc('quarter',CURRENT_DATE)
    ELSE date_trunc('month',CURRENT_DATE) END;
  SELECT COALESCE(sum(amount),0) INTO total FROM public.payments WHERE group_id=gid AND membership_id=mid AND relief_plan_id=plan
    AND COALESCE(NULLIF(status,''),'confirmed')='confirmed' AND (period_start IS NULL OR created_at>=period_start);
  next_status := CASE WHEN total>=required THEN 'up_to_date' ELSE 'behind' END;
  FOR enrollment IN SELECT id,contribution_status FROM public.relief_enrollments
    WHERE membership_id=mid AND plan_id=plan AND is_active AND contribution_status<>'suspended'
    FOR UPDATE
  LOOP
    IF enrollment.contribution_status IS DISTINCT FROM next_status THEN
      UPDATE public.relief_enrollments SET contribution_status=next_status,updated_at=now() WHERE id=enrollment.id;
      INSERT INTO public.group_audit_logs(group_id,actor_id,action,entity_type,entity_id,details)
        VALUES(gid,auth.uid(),'relief.contribution_status_recalculated','relief_enrollment',enrollment.id,
          jsonb_build_object('oldStatus',enrollment.contribution_status,'newStatus',next_status,'source','financial_transaction'));
    END IF;
  END LOOP;
END;
$$;
DROP TRIGGER IF EXISTS on_payment_recorded ON public.payments;
DROP TRIGGER IF EXISTS on_payment_changed ON public.payments;
DROP TRIGGER IF EXISTS recalc_standing_on_payment ON public.payments;
DROP TRIGGER IF EXISTS trigger_sync_relief_contribution_status ON public.payments;
CREATE FUNCTION financial_private.payment_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.relief_plan_id IS NOT NULL THEN
    PERFORM financial_private.reconcile_relief(NEW.group_id, NEW.membership_id, NEW.relief_plan_id);
  END IF;
  PERFORM financial_private.reconcile_member(NEW.group_id, NEW.membership_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER financial_payment_changed AFTER INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION financial_private.payment_changed();

-- Assessment edits/waivers must converge too. Derived balance/status writes recurse once.
CREATE FUNCTION financial_private.obligation_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE code text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.payments WHERE membership_id = OLD.membership_id AND group_id = OLD.group_id)
      THEN RAISE EXCEPTION 'FINANCIAL_HISTORY_REQUIRES_ARCHIVE'; END IF;
    RETURN OLD;
  END IF;
  PERFORM 1 FROM public.memberships WHERE id = NEW.membership_id AND group_id = NEW.group_id FOR UPDATE;
  SELECT currency INTO code FROM public.groups WHERE id = NEW.group_id;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.memberships WHERE id = NEW.membership_id AND group_id = NEW.group_id)
    OR NOT EXISTS (SELECT 1 FROM public.contribution_types WHERE id = NEW.contribution_type_id AND group_id = NEW.group_id AND currency = code)
    OR NEW.currency <> code THEN RAISE EXCEPTION 'FINANCIAL_SCOPE_REQUIRES_REVIEW'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.group_id, NEW.membership_id, NEW.contribution_type_id) IS DISTINCT FROM
    (OLD.group_id, OLD.membership_id, OLD.contribution_type_id)
    THEN RAISE EXCEPTION 'ASSESSMENT_ATTRIBUTION_IMMUTABLE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM financial_private.reconciliations WHERE transaction_id = txid_current() AND membership_id = NEW.membership_id) THEN
    IF TG_OP = 'INSERT' THEN NEW.amount_paid := 0; NEW.status := CASE WHEN NEW.status = 'waived' THEN 'waived' ELSE 'pending' END::public.obligation_status;
    ELSE NEW.amount_paid := OLD.amount_paid; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER financial_obligation_guard BEFORE INSERT OR UPDATE OR DELETE ON public.contribution_obligations
FOR EACH ROW EXECUTE FUNCTION financial_private.obligation_guard();
CREATE FUNCTION financial_private.obligation_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.memberships WHERE id=OLD.membership_id AND group_id=OLD.group_id) THEN
      PERFORM financial_private.reconcile_member(OLD.group_id,OLD.membership_id);
    END IF;
    RETURN OLD;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM financial_private.reconciliations WHERE transaction_id = txid_current() AND membership_id = NEW.membership_id) THEN
    PERFORM financial_private.reconcile_member(NEW.group_id, NEW.membership_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER financial_obligation_changed AFTER INSERT OR UPDATE OR DELETE ON public.contribution_obligations
FOR EACH ROW EXECUTE FUNCTION financial_private.obligation_changed();

-- New currencies must agree; existing history prevents silently changing a group's unit.
CREATE FUNCTION financial_private.currency_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME = 'groups' THEN
    IF NEW.currency IS DISTINCT FROM OLD.currency AND (
      EXISTS (SELECT 1 FROM public.payments WHERE group_id = OLD.id) OR
      EXISTS (SELECT 1 FROM public.contribution_types WHERE group_id = OLD.id))
    THEN RAISE EXCEPTION 'CURRENCY_HISTORY_IMMUTABLE'; END IF;
  ELSE
    IF TG_OP = 'UPDATE' AND NEW.group_id IS DISTINCT FROM OLD.group_id THEN
      RAISE EXCEPTION 'ASSESSMENT_ATTRIBUTION_IMMUTABLE';
    END IF;
    PERFORM 1 FROM public.groups WHERE id = NEW.group_id AND currency = NEW.currency FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'CURRENCY_MISMATCH'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER financial_group_currency BEFORE UPDATE OF currency ON public.groups
FOR EACH ROW EXECUTE FUNCTION financial_private.currency_guard();
CREATE TRIGGER financial_type_currency BEFORE INSERT OR UPDATE OF currency, group_id ON public.contribution_types
FOR EACH ROW EXECUTE FUNCTION financial_private.currency_guard();

CREATE FUNCTION public.apply_payment_command(
  p_group_id uuid, p_request_id uuid, p_action text, p_values jsonb,
  p_payment_id uuid DEFAULT NULL, p_expected_version integer DEFAULT NULL, p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  actor uuid := auth.uid(); mid uuid; code text; manager boolean; req jsonb; prior financial_private.payment_commands;
  before_row public.payments; after_row public.payments; pid uuid; typ uuid; obl uuid; plan uuid; receipt text;
  command_result jsonb; amount_value numeric; payment_day date; target_status text; member_status text;
BEGIN
  IF actor IS NULL OR p_request_id IS NULL OR p_group_id IS NULL OR p_values IS NULL OR jsonb_typeof(p_values) <> 'object'
    OR p_action NOT IN ('record', 'submit', 'confirm', 'reject', 'correct', 'void') OR p_action IS NULL
    THEN RAISE EXCEPTION 'INVALID_PAYMENT_COMMAND'; END IF;
  IF p_values - ARRAY['membership_id','contribution_type_id','obligation_id','relief_plan_id','amount','currency','payment_method',
    'reference_number','receipt_url','notes','payment_date'] <> '{}'::jsonb
    THEN RAISE EXCEPTION 'UNSUPPORTED_PAYMENT_FIELD'; END IF;
  SELECT currency INTO code FROM public.groups WHERE id = p_group_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_AUTHORIZED'; END IF;
  manager := financial_private.can_manage(p_group_id);
  IF p_action IN ('record', 'submit') THEN
    IF p_payment_id IS NOT NULL OR p_expected_version IS NOT NULL THEN RAISE EXCEPTION 'INVALID_PAYMENT_COMMAND'; END IF;
    mid := (p_values->>'membership_id')::uuid;
  ELSE
    SELECT membership_id INTO mid FROM public.payments WHERE id = p_payment_id AND group_id = p_group_id;
  END IF;
  SELECT membership_status::text INTO member_status FROM public.memberships WHERE id = mid AND group_id = p_group_id FOR UPDATE;
  IF NOT FOUND OR (NOT manager AND NOT (p_action = 'submit' AND member_status = 'active'
    AND EXISTS (SELECT 1 FROM public.memberships WHERE id = mid AND user_id = actor)))
    THEN RAISE EXCEPTION 'PAYMENT_NOT_AUTHORIZED'; END IF;
  IF p_action IN ('record', 'submit') AND member_status <> 'active' THEN RAISE EXCEPTION 'MEMBER_NOT_ACTIVE'; END IF;
  req := jsonb_build_object('action',p_action,'values',p_values,'paymentId',p_payment_id,'version',p_expected_version,'reason',p_reason);
  -- Lock the durable key, including retries that arrived before the first commit.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_group_id::text || ':' || p_request_id::text, 0));
  SELECT * INTO prior FROM financial_private.payment_commands WHERE group_id = p_group_id AND request_id = p_request_id;
  IF FOUND THEN
    IF prior.actor_id <> actor OR prior.request <> req THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT'; END IF;
    RETURN prior.result || jsonb_build_object('replayed', true);
  END IF;
  IF p_action NOT IN ('record','submit') THEN
    SELECT * INTO before_row FROM public.payments WHERE id = p_payment_id AND group_id = p_group_id FOR UPDATE;
    IF p_expected_version IS NULL OR before_row.financial_version <> p_expected_version THEN RAISE EXCEPTION 'PAYMENT_VERSION_CONFLICT'; END IF;
    IF p_action IN ('confirm','reject') AND before_row.status <> 'pending_confirmation' THEN RAISE EXCEPTION 'PAYMENT_TRANSITION_INVALID'; END IF;
    IF p_action IN ('correct','void') AND (before_row.status = 'rejected' OR length(trim(COALESCE(p_reason,''))) < 3)
      THEN RAISE EXCEPTION 'PAYMENT_CORRECTION_REASON_REQUIRED'; END IF;
    IF p_action <> 'correct' AND p_values <> '{}'::jsonb THEN RAISE EXCEPTION 'UNSUPPORTED_PAYMENT_FIELD'; END IF;
    IF p_action = 'correct' AND p_values ?| ARRAY['membership_id','contribution_type_id','obligation_id','relief_plan_id','currency']
      THEN RAISE EXCEPTION 'PAYMENT_ATTRIBUTION_IMMUTABLE'; END IF;
  END IF;
  pid := COALESCE(p_payment_id, gen_random_uuid());
  INSERT INTO financial_private.payment_commands(group_id,request_id,actor_id,payment_id,request,before_record)
    VALUES(p_group_id,p_request_id,actor,pid,req,
      CASE WHEN p_payment_id IS NULL THEN NULL ELSE to_jsonb(before_row) - 'receipt_url'
        || jsonb_build_object('receipt_path',financial_private.receipt_path(before_row.receipt_url)) END);
  PERFORM set_config('villageclaq.payment_command', p_request_id::text, true);
  IF p_action IN ('record','submit','correct') THEN
    amount_value := COALESCE((p_values->>'amount')::numeric, before_row.amount);
    IF amount_value IS NULL OR amount_value <= 0 OR amount_value <> round(amount_value,2) OR amount_value >= 10000000000
      THEN RAISE EXCEPTION 'INVALID_PAYMENT_AMOUNT'; END IF;
    IF COALESCE(p_values->>'currency', before_row.currency, code) <> code THEN RAISE EXCEPTION 'CURRENCY_MISMATCH'; END IF;
    receipt := COALESCE(p_values->>'receipt_url', before_row.receipt_url);
    IF receipt IS NOT NULL AND receipt <> '' AND (p_action <> 'correct' OR receipt IS DISTINCT FROM before_row.receipt_url) THEN
      IF receipt IS DISTINCT FROM financial_private.receipt_path(receipt)
        OR NOT EXISTS (SELECT 1 FROM storage.objects s WHERE s.bucket_id = 'receipts' AND s.name = receipt AND s.owner_id = actor::text)
        OR EXISTS (SELECT 1 FROM public.payments p WHERE financial_private.receipt_path(p.receipt_url) = receipt
          AND (p.membership_id <> mid OR p.group_id <> p_group_id))
        OR split_part(receipt,'/',1) <> p_group_id::text
        THEN RAISE EXCEPTION 'RECEIPT_ATTACHMENT_NOT_AUTHORIZED'; END IF;
    END IF;
    payment_day := COALESCE((p_values->>'payment_date')::date, before_row.payment_date, CURRENT_DATE);
    IF payment_day > CURRENT_DATE THEN RAISE EXCEPTION 'INVALID_PAYMENT_DATE'; END IF;
  END IF;
  IF p_action IN ('record','submit') THEN
    typ := (p_values->>'contribution_type_id')::uuid; obl := (p_values->>'obligation_id')::uuid;
    plan := (p_values->>'relief_plan_id')::uuid;
    IF plan IS NOT NULL AND (obl IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM public.relief_plans WHERE id = plan AND group_id = p_group_id AND is_active))
      THEN RAISE EXCEPTION 'PAYMENT_ATTRIBUTION_INVALID'; END IF;
    IF obl IS NOT NULL THEN
      SELECT contribution_type_id INTO typ FROM public.contribution_obligations
        WHERE id = obl AND group_id = p_group_id AND membership_id = mid
          AND (typ IS NULL OR contribution_type_id = typ);
      IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_ATTRIBUTION_INVALID'; END IF;
    END IF;
    IF typ IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.contribution_types WHERE id = typ AND group_id = p_group_id AND currency = code)
      THEN RAISE EXCEPTION 'PAYMENT_ATTRIBUTION_INVALID'; END IF;
    -- Preserve the officer's existing first typed-payment assessment, but never
    -- recreate a satisfied/waived assessment or invent a second year's liability.
    IF p_action = 'record' AND plan IS NULL AND typ IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.contribution_obligations WHERE group_id = p_group_id AND membership_id = mid AND contribution_type_id = typ)
    THEN
      INSERT INTO public.contribution_obligations(group_id,membership_id,contribution_type_id,amount,currency,due_date,period_label)
      SELECT p_group_id,mid,typ,COALESCE(NULLIF(amount,0),amount_value),code,
        make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int,12,31),EXTRACT(YEAR FROM CURRENT_DATE)::text
      FROM public.contribution_types WHERE id = typ;
    END IF;
    target_status := CASE WHEN p_action = 'submit' THEN 'pending_confirmation' ELSE 'confirmed' END;
    INSERT INTO public.payments(id,group_id,membership_id,contribution_type_id,obligation_id,relief_plan_id,amount,currency,payment_method,
      reference_number,receipt_url,notes,recorded_by,payment_date,recorded_at,status)
    VALUES(pid,p_group_id,mid,typ,obl,plan,amount_value,code,(p_values->>'payment_method')::public.payment_method,
      p_values->>'reference_number',NULLIF(receipt,''),p_values->>'notes',actor,payment_day,
      payment_day::timestamptz,target_status) RETURNING * INTO after_row;
  ELSE
    UPDATE public.payments SET
      amount = CASE WHEN p_action = 'correct' THEN amount_value ELSE amount END,
      payment_method = CASE WHEN p_action = 'correct' THEN COALESCE((p_values->>'payment_method')::public.payment_method,payment_method) ELSE payment_method END,
      reference_number = CASE WHEN p_values ? 'reference_number' THEN p_values->>'reference_number' ELSE reference_number END,
      notes = CASE WHEN p_values ? 'notes' THEN p_values->>'notes' ELSE notes END,
      receipt_url = CASE WHEN p_action = 'correct' THEN NULLIF(receipt,'') ELSE receipt_url END,
      payment_date = CASE WHEN p_action = 'correct' THEN payment_day ELSE payment_date END,
      recorded_at = CASE WHEN p_action = 'correct' AND payment_day IS DISTINCT FROM before_row.payment_date THEN payment_day::timestamptz ELSE recorded_at END,
      status = CASE WHEN p_action = 'confirm' THEN 'confirmed' WHEN p_action IN ('reject','void') THEN 'rejected' ELSE status END,
      financial_version = financial_version + 1
    WHERE id = pid RETURNING * INTO after_row;
  END IF;
  SELECT jsonb_build_object('payment', to_jsonb(after_row), 'replayed', false,
    'appliedTo', COALESCE(jsonb_agg(jsonb_build_object('obligationId',o.id,'typeName',t.name,'amountApplied',a.amount_applied))
      FILTER (WHERE a.payment_id IS NOT NULL),'[]'::jsonb),
    'creditRemaining', CASE WHEN after_row.status = 'confirmed' THEN after_row.amount - COALESCE(sum(a.amount_applied),0) ELSE 0 END)
    INTO command_result FROM public.payment_obligation_applications a
      JOIN public.contribution_obligations o ON o.id = a.obligation_id JOIN public.contribution_types t ON t.id = o.contribution_type_id
      WHERE a.payment_id = pid;
  UPDATE financial_private.payment_commands SET
    after_record = to_jsonb(after_row) - 'receipt_url' || jsonb_build_object('receipt_path',financial_private.receipt_path(after_row.receipt_url)),
    result = command_result WHERE group_id = p_group_id AND request_id = p_request_id;
  PERFORM set_config('villageclaq.payment_command','',true);
  RETURN command_result;
END;
$$;

-- Read-only history endpoint: no raw provider payloads or storage signing tokens.
CREATE FUNCTION public.payment_command_history(p_payment_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.payments;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND OR NOT financial_private.can_read(p.membership_id,p.group_id) THEN RAISE EXCEPTION 'PAYMENT_NOT_AUTHORIZED'; END IF;
  RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object('requestId',request_id,'actorId',actor_id,'at',created_at,
    'action',request->>'action','reason',request->>'reason','before',before_record,'after',after_record) ORDER BY created_at,request_id),'[]')
    FROM financial_private.payment_commands WHERE payment_id = p_payment_id);
END;
$$;

-- Receipt SELECT is based on the linked financial record, not just a group folder.
-- Ambiguous cross-member legacy references fail closed. Orphans are uploader-only.
CREATE FUNCTION public.can_access_payment_receipt(object_name text, object_owner text, write_access boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE link_count integer; allowed boolean; gid uuid; mid uuid; attached boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT count(DISTINCT (p.group_id,p.membership_id)), bool_and(financial_private.can_read(p.membership_id,p.group_id))
    INTO link_count,allowed FROM public.payments p WHERE financial_private.receipt_path(p.receipt_url) = object_name;
  IF link_count > 0 THEN RETURN NOT write_access AND link_count = 1 AND COALESCE(allowed,false); END IF;
  -- The same bucket also contains fine-dispute evidence. Preserve that uploader
  -- without reopening group-wide payment receipts or allowing evidence replacement.
  IF split_part(object_name,'/',1) = 'dispute-docs' THEN
    BEGIN
      gid := split_part(object_name,'/',2)::uuid;
      mid := split_part(object_name,'/',3)::uuid;
    EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
    IF NOT EXISTS (SELECT 1 FROM public.memberships WHERE id=mid AND group_id=gid) THEN RETURN false; END IF;
    SELECT EXISTS (SELECT 1 FROM public.disputes d,
      jsonb_array_elements_text(CASE WHEN jsonb_typeof(d.supporting_docs)='array' THEN d.supporting_docs ELSE '[]'::jsonb END) doc
      WHERE financial_private.receipt_path(doc)=object_name) INTO attached;
    RETURN EXISTS (SELECT 1 FROM public.memberships viewer WHERE viewer.user_id=auth.uid()
      AND viewer.group_id=gid AND viewer.membership_status='active'
      AND (viewer.id=mid OR public.has_group_permission(gid,'disputes.manage',auth.uid())
        OR public.has_group_permission(gid,'finances.manage',auth.uid())))
      AND (NOT write_access OR (NOT attached AND object_owner=auth.uid()::text));
  END IF;
  BEGIN gid := split_part(object_name,'/',1)::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
  RETURN object_owner = auth.uid()::text AND EXISTS (SELECT 1 FROM public.memberships
    WHERE user_id = auth.uid() AND group_id = gid AND membership_status = 'active');
END;
$$;
-- Restrictive overlays cannot be bypassed by older permissive policies.
-- Existing finance-read policies still decide owner/officer visibility. This
-- additional condition prevents stale/exited officer roles from retaining it.
CREATE FUNCTION public.is_active_financial_reader(gid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.memberships WHERE group_id=gid
    AND user_id=auth.uid() AND membership_status='active');
$$;
-- Existing permissive write policies continue to decide which active officers
-- have each financial permission. These restrictive overlays add the lifecycle
-- requirement that older role/permission helpers omit, so inactive roles cannot
-- reach reconciliation triggers.
CREATE FUNCTION public.is_active_financial_writer(gid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.memberships WHERE group_id=gid
    AND user_id=auth.uid() AND membership_status='active');
$$;
CREATE POLICY financial_payment_active_reader ON public.payments AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.is_active_financial_reader(group_id));
CREATE POLICY financial_obligation_active_reader ON public.contribution_obligations AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.is_active_financial_reader(group_id));
CREATE POLICY financial_type_active_writer_insert ON public.contribution_types AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.is_active_financial_writer(group_id));
CREATE POLICY financial_type_active_writer_update ON public.contribution_types AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.is_active_financial_writer(group_id))
  WITH CHECK (public.is_active_financial_writer(group_id));
CREATE POLICY financial_type_active_writer_delete ON public.contribution_types AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.is_active_financial_writer(group_id));
CREATE POLICY financial_obligation_active_writer_insert ON public.contribution_obligations AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.is_active_financial_writer(group_id));
CREATE POLICY financial_obligation_active_writer_update ON public.contribution_obligations AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.is_active_financial_writer(group_id))
  WITH CHECK (public.is_active_financial_writer(group_id));
CREATE POLICY financial_obligation_active_writer_delete ON public.contribution_obligations AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.is_active_financial_writer(group_id));
CREATE POLICY financial_receipt_read ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated, anon
  USING (bucket_id <> 'receipts' OR public.can_access_payment_receipt(name,owner_id,false));
CREATE POLICY financial_receipt_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated, anon
  WITH CHECK (bucket_id <> 'receipts' OR public.can_access_payment_receipt(name,owner_id,true));
CREATE POLICY financial_receipt_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated, anon
  USING (bucket_id <> 'receipts') WITH CHECK (bucket_id <> 'receipts');
CREATE POLICY financial_receipt_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated, anon
  USING (bucket_id <> 'receipts');
-- Uploaded evidence is immutable even before attachment: this closes the
-- upload/delete-versus-command race. Orphan retention cleanup needs a separate
-- privileged, audited policy; no automatic cleanup is enabled here.
-- A public bucket bypasses object SELECT policy. Fail installation rather than changing storage silently.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'receipts' AND public) THEN
    RAISE EXCEPTION 'RECEIPTS_BUCKET_MUST_ALREADY_BE_PRIVATE';
  END IF;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA financial_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_payment_command(uuid,uuid,text,jsonb,uuid,integer,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_command_history(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_payment_receipt(text,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_financial_reader(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_active_financial_writer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_payment_command(uuid,uuid,text,jsonb,uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payment_command_history(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_payment_receipt(text,text,boolean) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_active_financial_reader(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_financial_writer(uuid) TO authenticated;

-- Rebuild DERIVED applications/balances/standing only. No payment amounts, statuses,
-- assessments, notifications or storage objects are created by this backfill.
-- Any legacy mixed-currency/identity conflict aborts the entire migration for review.
DO $$
DECLARE member_row record; plan_row record;
BEGIN
  FOR member_row IN SELECT DISTINCT m.group_id,m.id FROM public.memberships m
    WHERE EXISTS (SELECT 1 FROM public.contribution_obligations o WHERE o.membership_id=m.id)
       OR EXISTS (SELECT 1 FROM public.payments p WHERE p.membership_id=m.id)
    ORDER BY m.group_id,m.id
  LOOP
    FOR plan_row IN SELECT DISTINCT relief_plan_id FROM public.payments WHERE membership_id=member_row.id AND relief_plan_id IS NOT NULL
    LOOP
      PERFORM financial_private.reconcile_relief(member_row.group_id,member_row.id,plan_row.relief_plan_id);
    END LOOP;
    PERFORM financial_private.reconcile_member(member_row.group_id,member_row.id);
  END LOOP;
END $$;
COMMIT;
