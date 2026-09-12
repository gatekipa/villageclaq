-- M3 F3 bounded financial epoch foundation (minimum for F3-01…05).
-- DO NOT APPLY TO PRODUCTION from the M3 draft PR.
-- DO NOT MERGE as a production financial write path.
-- NEW sequential file after 00117. Not a rename of 20260906140228.
-- Excludes: transfer RPC replacements, legacy ledger_epoch_id columns,
--           payment-integrity replay (00104 / Cut 3 collision),
--           standing hotfix (00101 + money.ts already own confirmed-basis;
--           SQL compute_member_standing remains pre-existing status-path —
--           NO standing migration in this batch).
-- Compatible with S0-008 / 00082 member-transfer RPCs (left unchanged).
-- CALL has_group_permission only. NEVER CREATE OR REPLACE it.

DO $f3_pre$
DECLARE
  v_hgp_count int;
  v_hgp_ident text;
  v_hgp_result text;
  v_hgp_owner text;
  v_hgp_definer boolean;
  v_hgp_cfg text[];
  v_hgp_def_md5 text;
  v_hgp_src_md5 text;
BEGIN
  SELECT count(*) INTO v_hgp_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';
  IF v_hgp_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'F3_ABORT: has_group_permission overload count=% (expected 1; do not add 2-arg)', v_hgp_count;
  END IF;
  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_result(p.oid),
         pg_get_userbyid(p.proowner),
         p.prosecdef,
         p.proconfig,
         md5(pg_get_functiondef(p.oid)),
         md5(p.prosrc)
    INTO v_hgp_ident, v_hgp_result, v_hgp_owner, v_hgp_definer, v_hgp_cfg,
         v_hgp_def_md5, v_hgp_src_md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';
  IF v_hgp_ident IS DISTINCT FROM 'gid uuid, perm_key text, uid uuid'
     OR v_hgp_result IS DISTINCT FROM 'boolean'
     OR v_hgp_owner IS DISTINCT FROM 'postgres'
     OR v_hgp_definer IS NOT TRUE
     OR v_hgp_cfg IS DISTINCT FROM ARRAY['search_path=""']::text[]
     OR v_hgp_def_md5 IS DISTINCT FROM '695368464e97297fbf0f90ce7345162f'
     OR v_hgp_src_md5 IS DISTINCT FROM '96a296dfd541c7fc75ec68c4da1d92ff' THEN
    RAISE EXCEPTION
      'F3_ABORT: has_group_permission pin mismatch ident=% result=% owner=% definer=% cfg=% def_md5=% src_md5=%',
      v_hgp_ident, v_hgp_result, v_hgp_owner, v_hgp_definer, v_hgp_cfg,
      v_hgp_def_md5, v_hgp_src_md5;
  END IF;

  IF to_regclass('public.financial_ledger_epochs') IS NOT NULL THEN
    RAISE EXCEPTION 'F3_ABORT: financial_ledger_epochs already present';
  END IF;
  IF to_regnamespace('financial_core') IS NOT NULL THEN
    RAISE EXCEPTION 'F3_ABORT: financial_core already present';
  END IF;
  IF to_regclass('public.financial_events') IS NOT NULL
     OR to_regclass('public.financial_postings') IS NOT NULL
     OR to_regclass('public.financial_accounts') IS NOT NULL THEN
    RAISE EXCEPTION 'F3_ABORT: F3 ledger objects already present';
  END IF;
  IF to_regclass('public.groups') IS NULL THEN
    RAISE EXCEPTION 'F3_ABORT: public.groups missing (current-main floor required)';
  END IF;
END
$f3_pre$;

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
  CONSTRAINT financial_ledger_epoch_range
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT financial_ledger_epoch_scope
    UNIQUE (id, group_id, currency),
  CONSTRAINT financial_ledger_epoch_no_overlap EXCLUDE USING gist (
    group_id WITH =,
    tstzrange(effective_from, COALESCE(effective_to, 'infinity'::timestamptz), '[)') WITH &&
  )
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
      AND m.user_id = auth.uid()
      AND m.membership_status = 'active'
  ));

-- Private transition proof. Lets a controlled close/open update groups.currency
-- atomically. No public transition RPC in this bounded foundation.
CREATE TABLE financial_private.epoch_transitions (
  transaction_id bigint NOT NULL,
  group_id uuid NOT NULL,
  PRIMARY KEY (transaction_id, group_id)
);
REVOKE ALL ON financial_private.epoch_transitions FROM PUBLIC, anon, authenticated;

-- Internal QA/demo classification used by F3-01 isolation tests. Not a
-- customer-editable attribute. No public designation RPC in 00118.
CREATE TABLE financial_private.internal_financial_tenants (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE RESTRICT,
  tenant_kind text NOT NULL CHECK (tenant_kind IN ('test','qa','demo')),
  reason text NOT NULL DEFAULT 'disposable-qualification-fixture' CHECK (length(trim(reason)) >= 8),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT
);
ALTER TABLE financial_private.internal_financial_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_private.internal_financial_tenants FORCE ROW LEVEL SECURITY;
REVOKE ALL ON financial_private.internal_financial_tenants
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION financial_private.guard_ledger_epoch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  group_currency text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'LEDGER_EPOCH_IMMUTABLE';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NOT EXISTS (
      SELECT 1 FROM financial_private.epoch_transitions x
      WHERE x.transaction_id = txid_current() AND x.group_id = OLD.group_id
    )
      OR (NEW.group_id, NEW.currency, NEW.effective_from, NEW.source_kind,
          NEW.source_reference, NEW.approval_note, NEW.created_by,
          NEW.approved_by, NEW.approved_at, NEW.created_at)
         IS DISTINCT FROM
         (OLD.group_id, OLD.currency, OLD.effective_from, OLD.source_kind,
          OLD.source_reference, OLD.approval_note, OLD.created_by,
          OLD.approved_by, OLD.approved_at, OLD.created_at)
      OR OLD.effective_to IS NOT NULL
      OR NEW.effective_to IS NULL
    THEN
      RAISE EXCEPTION 'LEDGER_EPOCH_IMMUTABLE';
    END IF;
  END IF;
  IF NEW.effective_to IS NULL THEN
    IF NEW.effective_from > clock_timestamp() THEN
      RAISE EXCEPTION 'FUTURE_LEDGER_EPOCH_NOT_ACTIVE';
    END IF;
    SELECT currency INTO group_currency FROM public.groups WHERE id = NEW.group_id;
    IF group_currency IS DISTINCT FROM NEW.currency
      AND NOT EXISTS (
        SELECT 1 FROM financial_private.epoch_transitions x
        WHERE x.transaction_id = txid_current() AND x.group_id = NEW.group_id
      )
    THEN
      RAISE EXCEPTION 'ACTIVE_LEDGER_CURRENCY_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER financial_ledger_epoch_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.financial_ledger_epochs
FOR EACH ROW EXECUTE FUNCTION financial_private.guard_ledger_epoch();

-- One active epoch per group matching groups.currency. Empty on a fresh
-- disposable floor with no groups. Does not invent FX or rewrite history.
INSERT INTO public.financial_ledger_epochs (
  group_id, currency, effective_from, source_kind, source_reference, approval_note
)
SELECT
  g.id,
  COALESCE(NULLIF(trim(g.currency), ''), 'XAF'),
  COALESCE(g.created_at, now()),
  'migration_backfill',
  '00118',
  'Deterministic clean single-currency backfill'
FROM public.groups g
WHERE NOT EXISTS (
  SELECT 1 FROM public.financial_ledger_epochs e WHERE e.group_id = g.id
);

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA financial_private FROM PUBLIC, anon, authenticated;

COMMIT;

DO $f3_hgp_post$
DECLARE
  v_hgp_def_md5 text;
  v_hgp_src_md5 text;
  v_hgp_count int;
BEGIN
  SELECT count(*) INTO v_hgp_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';
  IF v_hgp_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'F3_ABORT: has_group_permission overload count changed to %', v_hgp_count;
  END IF;
  SELECT md5(pg_get_functiondef(p.oid)), md5(p.prosrc)
    INTO v_hgp_def_md5, v_hgp_src_md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';
  IF v_hgp_def_md5 IS DISTINCT FROM '695368464e97297fbf0f90ce7345162f'
     OR v_hgp_src_md5 IS DISTINCT FROM '96a296dfd541c7fc75ec68c4da1d92ff' THEN
    RAISE EXCEPTION 'F3_ABORT: has_group_permission fingerprint changed by 00118';
  END IF;
END
$f3_hgp_post$;

-- Pin F3 SECURITY DEFINER owner to postgres (M2/Cut 1 disposable parity).
-- Never touches has_group_permission or enqueue_outbound_notification.
DO $f3_owner_pin$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS ident
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname IN ('public','financial_core','financial_private')
      AND p.proname NOT IN ('has_group_permission','enqueue_outbound_notification')
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) OWNER TO postgres',
      r.nspname, r.proname, r.ident
    );
  END LOOP;
END
$f3_owner_pin$;

SET ROLE postgres;
DO $f3_owner_acl$
BEGIN
  IF to_regprocedure('public.post_financial_command(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.post_financial_command(jsonb) FROM PUBLIC, anon, authenticated, service_role, ubuntu';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.post_financial_command(jsonb) TO authenticated';
  END IF;
  IF to_regprocedure('public.correct_financial_event(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.correct_financial_event(jsonb) FROM PUBLIC, anon, authenticated, service_role, ubuntu';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.correct_financial_event(jsonb) TO authenticated';
  END IF;
  IF to_regprocedure('public.post_financial_opening_cash(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.post_financial_opening_cash(jsonb) FROM PUBLIC, anon, authenticated, service_role, ubuntu';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.post_financial_opening_cash(jsonb) TO authenticated';
  END IF;
  IF to_regprocedure('public.get_financial_projection_bundle(uuid,timestamptz,timestamptz,timestamptz)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_financial_projection_bundle(uuid,timestamptz,timestamptz,timestamptz), public.get_financial_cashbook(uuid,timestamptz,timestamptz,uuid,text,integer,integer) FROM PUBLIC, anon, authenticated, service_role, ubuntu';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_financial_projection_bundle(uuid,timestamptz,timestamptz,timestamptz), public.get_financial_cashbook(uuid,timestamptz,timestamptz,uuid,text,integer,integer) TO authenticated';
  END IF;
END
$f3_owner_acl$;
RESET ROLE;
