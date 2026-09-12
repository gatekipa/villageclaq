-- M3 forward rematerialization of F3-01 onto post-S0 / post-M2 main (after 00117).
-- DO NOT APPLY TO PRODUCTION from the M3 draft PR.
-- DO NOT MERGE as a production financial write path.
-- Oracle (REFERENCE ONLY, not applied): 20260908154824_f3_core_ledger_foundation.sql on c7b4cd535d7125737eab2ec0fad27cae9432e8c3
-- Planning: PR #83 tip a178068384290b37ec6c17b02428b399d52ddd10
-- CALL public.has_group_permission(gid, perm_key, uid) only. NEVER CREATE OR REPLACE it.
-- NEVER add a 2-arg overload. NEVER touch Cut 3 storage / Cut 2 queue / M2 policy tables.
-- No F3-06 UI, no F3-07 Record Transaction, no FCG-1 close, no F3-08/09, no M4.
-- No notifications_queue / enqueue / producer wiring.
-- No opening-cash product UX (command only; UI remains hidden).

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

  IF to_regclass('public.financial_ledger_epochs') IS NULL THEN
    RAISE EXCEPTION 'F3_ABORT: financial_ledger_epochs missing — apply 00118 first';
  END IF;
  IF to_regnamespace('financial_core') IS NOT NULL
     OR to_regclass('public.financial_accounts') IS NOT NULL
     OR to_regclass('public.financial_events') IS NOT NULL
     OR to_regclass('public.financial_postings') IS NOT NULL
     OR to_regtype('public.financial_event_class') IS NOT NULL THEN
    RAISE EXCEPTION 'F3_ABORT: F3-01 objects already present';
  END IF;
  IF to_regclass('public.memberships') IS NULL OR to_regclass('public.projects') IS NULL THEN
    RAISE EXCEPTION 'F3_ABORT: memberships/projects missing (current-main floor required)';
  END IF;
END
$f3_pre$;

-- F3-01: secure core-ledger schema foundation only.
-- No posting command, projection, correction command, UI, data backfill, or
-- production cutover is included in this migration.
BEGIN;

CREATE SCHEMA IF NOT EXISTS financial_core;
REVOKE ALL ON SCHEMA financial_core FROM PUBLIC, anon, authenticated, service_role;

CREATE TYPE public.financial_account_kind AS ENUM
  ('bank', 'cash', 'mobile_money', 'wallet', 'other');
CREATE TYPE public.financial_config_status AS ENUM ('active', 'inactive');
CREATE TYPE public.financial_account_status AS ENUM ('active', 'inactive', 'closed');
CREATE TYPE public.financial_category_class AS ENUM ('income', 'expense');
CREATE TYPE public.financial_event_class AS ENUM
  ('money_in', 'money_out', 'transfer', 'opening_adjustment');
CREATE TYPE public.financial_event_status AS ENUM ('posted', 'corrected', 'reversed');
CREATE TYPE public.financial_control_class AS ENUM
  ('custody', 'income', 'expense', 'opening_position', 'receivable', 'liability');

-- Mirrors the product currency catalog in src/lib/currencies.ts. This is
-- precision metadata only; financial_ledger_epochs remains currency authority.
CREATE FUNCTION financial_core.currency_scale(p_currency text)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE upper(p_currency)
    WHEN 'XAF' THEN 0 WHEN 'XOF' THEN 0 WHEN 'TZS' THEN 0
    WHEN 'UGX' THEN 0 WHEN 'RWF' THEN 0
    WHEN 'NGN' THEN 2 WHEN 'GHS' THEN 2 WHEN 'KES' THEN 2
    WHEN 'ZAR' THEN 2 WHEN 'ETB' THEN 2 WHEN 'CDF' THEN 2
    WHEN 'USD' THEN 2 WHEN 'EUR' THEN 2 WHEN 'GBP' THEN 2
    WHEN 'CAD' THEN 2 WHEN 'CHF' THEN 2 WHEN 'AUD' THEN 2
    WHEN 'AED' THEN 2
    ELSE NULL
  END;
$$;

-- Composite scope keys let every optional dimension be constrained to the
-- event tenant structurally, rather than relying on application validation.
ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_id_group_financial_scope UNIQUE (id, group_id);
ALTER TABLE public.projects
  ADD CONSTRAINT projects_id_group_financial_scope UNIQUE (id, group_id);

CREATE TABLE public.financial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  opened_ledger_epoch_id uuid NOT NULL,
  currency text NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  description text,
  kind public.financial_account_kind NOT NULL,
  status public.financial_account_status NOT NULL DEFAULT 'active',
  inactive_at timestamptz,
  closed_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_accounts_currency_supported CHECK (
    currency = upper(currency)
    AND financial_core.currency_scale(currency) IS NOT NULL
  ),
  CONSTRAINT financial_accounts_lifecycle CHECK (
    (status = 'active' AND inactive_at IS NULL AND closed_at IS NULL)
    OR (status = 'inactive' AND inactive_at IS NOT NULL AND closed_at IS NULL)
    OR (status = 'closed' AND inactive_at IS NOT NULL AND closed_at IS NOT NULL)
  ),
  CONSTRAINT financial_accounts_epoch_scope
    FOREIGN KEY (opened_ledger_epoch_id, group_id, currency)
    REFERENCES public.financial_ledger_epochs(id, group_id, currency)
    ON DELETE RESTRICT,
  CONSTRAINT financial_accounts_id_group_currency UNIQUE (id, group_id, currency)
);
CREATE UNIQUE INDEX financial_accounts_group_name
  ON public.financial_accounts(group_id, lower(name));
CREATE INDEX financial_accounts_group_status
  ON public.financial_accounts(group_id, status, name);
CREATE INDEX financial_accounts_opened_epoch
  ON public.financial_accounts(opened_ledger_epoch_id);

CREATE TABLE public.financial_funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  description text,
  is_restricted boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  status public.financial_config_status NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_funds_default_general CHECK (
    NOT is_default OR (NOT is_restricted AND status = 'active')
  ),
  CONSTRAINT financial_funds_id_group UNIQUE (id, group_id)
);
CREATE UNIQUE INDEX financial_funds_group_name
  ON public.financial_funds(group_id, lower(name));
CREATE UNIQUE INDEX financial_funds_one_default
  ON public.financial_funds(group_id) WHERE is_default;
CREATE INDEX financial_funds_group_status
  ON public.financial_funds(group_id, status, name);

CREATE TABLE public.financial_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  description text,
  category_class public.financial_category_class NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  status public.financial_config_status NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_categories_id_group_class
    UNIQUE (id, group_id, category_class)
);
CREATE UNIQUE INDEX financial_categories_group_class_name
  ON public.financial_categories(group_id, category_class, lower(name));
CREATE INDEX financial_categories_group_status
  ON public.financial_categories(group_id, category_class, status, name);

CREATE TABLE public.financial_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  ledger_epoch_id uuid NOT NULL,
  currency text NOT NULL,
  event_class public.financial_event_class NOT NULL,
  source_module text NOT NULL
    CHECK (source_module ~ '^[a-z][a-z0-9_]{0,63}$'),
  source_record_id text NOT NULL
    CHECK (length(source_record_id) BETWEEN 1 AND 256 AND source_record_id = trim(source_record_id)),
  effect_kind text NOT NULL
    CHECK (effect_kind ~ '^[a-z][a-z0-9_]{0,63}$'),
  request_id uuid,
  economic_payload_fingerprint text NOT NULL
    CHECK (economic_payload_fingerprint ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  description text,
  reference_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(reference_metadata) = 'object'),
  status public.financial_event_status NOT NULL DEFAULT 'posted',
  reversal_of_event_id uuid,
  replacement_event_id uuid,
  corrected_at timestamptz,
  correction_reason text,
  CONSTRAINT financial_events_currency_supported CHECK (
    currency = upper(currency)
    AND financial_core.currency_scale(currency) IS NOT NULL
  ),
  CONSTRAINT financial_events_epoch_scope
    FOREIGN KEY (ledger_epoch_id, group_id, currency)
    REFERENCES public.financial_ledger_epochs(id, group_id, currency)
    ON DELETE RESTRICT,
  CONSTRAINT financial_events_source_identity UNIQUE
    (group_id, source_module, source_record_id, effect_kind, ledger_epoch_id),
  CONSTRAINT financial_events_id_group UNIQUE (id, group_id),
  CONSTRAINT financial_events_posting_scope
    UNIQUE (id, group_id, ledger_epoch_id, currency, occurred_at),
  CONSTRAINT financial_events_not_self_linked CHECK (
    reversal_of_event_id IS DISTINCT FROM id
    AND replacement_event_id IS DISTINCT FROM id
  ),
  CONSTRAINT financial_events_correction_state CHECK (
    (status = 'posted' AND corrected_at IS NULL
      AND replacement_event_id IS NULL AND correction_reason IS NULL)
    OR (status = 'corrected' AND corrected_at IS NOT NULL
      AND replacement_event_id IS NOT NULL
      AND length(trim(correction_reason)) >= 3)
    OR (status = 'reversed' AND corrected_at IS NOT NULL
      AND replacement_event_id IS NULL
      AND length(trim(correction_reason)) >= 3)
  )
);
ALTER TABLE public.financial_events
  ADD CONSTRAINT financial_events_reversal_scope
  FOREIGN KEY (reversal_of_event_id, group_id)
  REFERENCES public.financial_events(id, group_id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.financial_events
  ADD CONSTRAINT financial_events_replacement_scope
  FOREIGN KEY (replacement_event_id, group_id)
  REFERENCES public.financial_events(id, group_id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX financial_events_one_reversal
  ON public.financial_events(group_id, reversal_of_event_id)
  WHERE reversal_of_event_id IS NOT NULL;
CREATE UNIQUE INDEX financial_events_manual_request
  ON public.financial_events(group_id, request_id)
  WHERE request_id IS NOT NULL;
CREATE INDEX financial_events_group_occurred
  ON public.financial_events(group_id, occurred_at DESC, id);
CREATE INDEX financial_events_group_epoch_occurred
  ON public.financial_events(group_id, ledger_epoch_id, occurred_at DESC);

CREATE TABLE public.financial_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  group_id uuid NOT NULL,
  ledger_epoch_id uuid NOT NULL,
  currency text NOT NULL,
  occurred_at timestamptz NOT NULL,
  amount_signed numeric(30,8) NOT NULL,
  control_class public.financial_control_class NOT NULL,
  account_id uuid,
  fund_id uuid NOT NULL,
  category_id uuid,
  category_class public.financial_category_class,
  member_id uuid,
  project_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_postings_amount_nonzero CHECK (amount_signed <> 0),
  CONSTRAINT financial_postings_amount_precision CHECK (
    financial_core.currency_scale(currency) IS NOT NULL
    AND amount_signed = round(amount_signed, financial_core.currency_scale(currency))
  ),
  CONSTRAINT financial_postings_custody_shape CHECK (
    (control_class = 'custody' AND account_id IS NOT NULL)
    OR (control_class <> 'custody' AND account_id IS NULL)
  ),
  CONSTRAINT financial_postings_category_shape CHECK (
    (control_class = 'income' AND category_id IS NOT NULL
      AND category_class IS NOT NULL AND category_class = 'income')
    OR (control_class = 'expense' AND category_id IS NOT NULL
      AND category_class IS NOT NULL AND category_class = 'expense')
    OR (control_class NOT IN ('income', 'expense')
      AND category_id IS NULL AND category_class IS NULL)
  ),
  CONSTRAINT financial_postings_event_scope
    FOREIGN KEY (event_id, group_id, ledger_epoch_id, currency, occurred_at)
    REFERENCES public.financial_events(id, group_id, ledger_epoch_id, currency, occurred_at)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT financial_postings_account_scope
    FOREIGN KEY (account_id, group_id, currency)
    REFERENCES public.financial_accounts(id, group_id, currency)
    ON DELETE RESTRICT,
  CONSTRAINT financial_postings_fund_scope
    FOREIGN KEY (fund_id, group_id)
    REFERENCES public.financial_funds(id, group_id)
    ON DELETE RESTRICT,
  CONSTRAINT financial_postings_category_scope
    FOREIGN KEY (category_id, group_id, category_class)
    REFERENCES public.financial_categories(id, group_id, category_class)
    ON DELETE RESTRICT,
  CONSTRAINT financial_postings_member_scope
    FOREIGN KEY (member_id, group_id)
    REFERENCES public.memberships(id, group_id)
    ON DELETE RESTRICT,
  CONSTRAINT financial_postings_project_scope
    FOREIGN KEY (project_id, group_id)
    REFERENCES public.projects(id, group_id)
    ON DELETE RESTRICT
);
CREATE INDEX financial_postings_event
  ON public.financial_postings(event_id);
CREATE INDEX financial_postings_account_period
  ON public.financial_postings(group_id, account_id, occurred_at DESC)
  WHERE account_id IS NOT NULL;
CREATE INDEX financial_postings_fund_period
  ON public.financial_postings(group_id, fund_id, occurred_at DESC);
CREATE INDEX financial_postings_category_period
  ON public.financial_postings(group_id, category_id, occurred_at DESC)
  WHERE category_id IS NOT NULL;
CREATE INDEX financial_postings_member_period
  ON public.financial_postings(group_id, member_id, occurred_at DESC)
  WHERE member_id IS NOT NULL;

-- Account currency and tenant identity never change in place. Lifecycle moves
-- forward only; inactive/closed rows remain available to historical postings.
CREATE FUNCTION financial_core.guard_financial_account()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'FINANCIAL_ACCOUNT_DELETE_FORBIDDEN' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'active' OR NEW.inactive_at IS NOT NULL OR NEW.closed_at IS NOT NULL THEN
      RAISE EXCEPTION 'FINANCIAL_ACCOUNT_MUST_START_ACTIVE' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.group_id, NEW.opened_ledger_epoch_id, NEW.currency, NEW.kind,
      NEW.created_by, NEW.opened_at, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.group_id, OLD.opened_ledger_epoch_id, OLD.currency, OLD.kind,
      OLD.created_by, OLD.opened_at, OLD.created_at) THEN
    RAISE EXCEPTION 'FINANCIAL_ACCOUNT_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'active' AND NEW.status = 'inactive' THEN
      NEW.inactive_at := clock_timestamp();
      NEW.closed_at := NULL;
    ELSIF OLD.status = 'inactive' AND NEW.status = 'closed' THEN
      NEW.inactive_at := OLD.inactive_at;
      NEW.closed_at := clock_timestamp();
    ELSE
      RAISE EXCEPTION 'INVALID_FINANCIAL_ACCOUNT_TRANSITION' USING ERRCODE = '23514';
    END IF;
  ELSIF (NEW.inactive_at, NEW.closed_at) IS DISTINCT FROM (OLD.inactive_at, OLD.closed_at) THEN
    RAISE EXCEPTION 'FINANCIAL_ACCOUNT_LIFECYCLE_AUDIT_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER financial_accounts_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.financial_accounts
FOR EACH ROW EXECUTE FUNCTION financial_core.guard_financial_account();

CREATE FUNCTION financial_core.guard_financial_fund()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'FINANCIAL_FUND_DELETE_FORBIDDEN' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.group_id, NEW.is_restricted, NEW.created_by, NEW.created_at)
       IS DISTINCT FROM
       (OLD.id, OLD.group_id, OLD.is_restricted, OLD.created_by, OLD.created_at) THEN
      RAISE EXCEPTION 'FINANCIAL_FUND_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'active' AND NEW.status = 'inactive') THEN
      RAISE EXCEPTION 'INVALID_FINANCIAL_FUND_TRANSITION' USING ERRCODE = '23514';
    END IF;
    NEW.updated_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER financial_funds_guard
BEFORE UPDATE OR DELETE ON public.financial_funds
FOR EACH ROW EXECUTE FUNCTION financial_core.guard_financial_fund();

CREATE FUNCTION financial_core.guard_financial_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'FINANCIAL_CATEGORY_DELETE_FORBIDDEN' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.group_id, NEW.category_class, NEW.is_system,
        NEW.created_by, NEW.created_at)
       IS DISTINCT FROM
       (OLD.id, OLD.group_id, OLD.category_class, OLD.is_system,
        OLD.created_by, OLD.created_at) THEN
      RAISE EXCEPTION 'FINANCIAL_CATEGORY_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'active' AND NEW.status = 'inactive') THEN
      RAISE EXCEPTION 'INVALID_FINANCIAL_CATEGORY_TRANSITION' USING ERRCODE = '23514';
    END IF;
    NEW.updated_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER financial_categories_guard
BEFORE UPDATE OR DELETE ON public.financial_categories
FOR EACH ROW EXECUTE FUNCTION financial_core.guard_financial_category();

-- Binding an occurrence to a same-currency epoch is not enough: its effective
-- date must also fall inside that epoch's immutable half-open date range.
CREATE FUNCTION financial_core.guard_financial_event_epoch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  epoch_from timestamptz;
  epoch_to timestamptz;
BEGIN
  SELECT e.effective_from, e.effective_to
    INTO epoch_from, epoch_to
  FROM public.financial_ledger_epochs e
  WHERE e.id = NEW.ledger_epoch_id
    AND e.group_id = NEW.group_id
    AND e.currency = NEW.currency;
  IF FOUND AND (
    NEW.occurred_at < epoch_from
    OR (epoch_to IS NOT NULL AND NEW.occurred_at >= epoch_to)
  ) THEN
    RAISE EXCEPTION 'FINANCIAL_EVENT_OUTSIDE_LEDGER_EPOCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER financial_events_epoch_guard
BEFORE INSERT ON public.financial_events
FOR EACH ROW EXECUTE FUNCTION financial_core.guard_financial_event_epoch();

-- Posted economic identity is append-only. F3-04 may only advance status and
-- attach mandatory correction audit/linkage; it cannot rewrite the occurrence.
CREATE FUNCTION financial_core.guard_financial_event_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'POSTED_FINANCIAL_EVENT_DELETE_FORBIDDEN' USING ERRCODE = '55000';
  END IF;
  IF (NEW.id, NEW.group_id, NEW.ledger_epoch_id, NEW.currency, NEW.event_class,
      NEW.source_module, NEW.source_record_id, NEW.effect_kind, NEW.request_id,
      NEW.economic_payload_fingerprint, NEW.occurred_at, NEW.posted_at,
      NEW.created_at, NEW.created_by, NEW.description, NEW.reference_metadata,
      NEW.reversal_of_event_id)
     IS DISTINCT FROM
     (OLD.id, OLD.group_id, OLD.ledger_epoch_id, OLD.currency, OLD.event_class,
      OLD.source_module, OLD.source_record_id, OLD.effect_kind, OLD.request_id,
      OLD.economic_payload_fingerprint, OLD.occurred_at, OLD.posted_at,
      OLD.created_at, OLD.created_by, OLD.description, OLD.reference_metadata,
      OLD.reversal_of_event_id) THEN
    RAISE EXCEPTION 'POSTED_FINANCIAL_EVENT_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF NEW.status = OLD.status THEN
    IF (NEW.replacement_event_id, NEW.corrected_at, NEW.correction_reason)
       IS DISTINCT FROM
       (OLD.replacement_event_id, OLD.corrected_at, OLD.correction_reason) THEN
      RAISE EXCEPTION 'FINANCIAL_CORRECTION_LINKAGE_REQUIRES_STATUS_TRANSITION'
        USING ERRCODE = '55000';
    END IF;
  ELSIF NOT (OLD.status = 'posted' AND NEW.status IN ('corrected', 'reversed')) THEN
    RAISE EXCEPTION 'INVALID_FINANCIAL_EVENT_TRANSITION' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER financial_events_history_guard
BEFORE UPDATE OR DELETE ON public.financial_events
FOR EACH ROW EXECUTE FUNCTION financial_core.guard_financial_event_history();

CREATE FUNCTION financial_core.guard_financial_posting_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'POSTED_FINANCIAL_POSTING_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER financial_postings_history_guard
BEFORE UPDATE OR DELETE ON public.financial_postings
FOR EACH ROW EXECUTE FUNCTION financial_core.guard_financial_posting_history();

-- Cross-row balance is checked at transaction end, so the future atomic F3-02
-- command can insert the event before its posting set without an integrity gap.
CREATE FUNCTION financial_core.assert_financial_event_balanced(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  posting_count bigint;
  posting_total numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.financial_events e WHERE e.id = p_event_id) THEN
    RETURN;
  END IF;
  SELECT count(*), COALESCE(sum(p.amount_signed), 0)
    INTO posting_count, posting_total
  FROM public.financial_postings p
  WHERE p.event_id = p_event_id;
  IF posting_count = 0 THEN
    RAISE EXCEPTION 'POSTED_FINANCIAL_EVENT_REQUIRES_POSTINGS' USING ERRCODE = '23514';
  END IF;
  IF posting_total <> 0 THEN
    RAISE EXCEPTION 'POSTED_FINANCIAL_EVENT_UNBALANCED' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION financial_core.check_event_balance_from_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM financial_core.assert_financial_event_balanced(NEW.id);
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER financial_events_balance_guard
AFTER INSERT OR UPDATE ON public.financial_events
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION financial_core.check_event_balance_from_event();

CREATE FUNCTION financial_core.check_event_balance_from_posting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM financial_core.assert_financial_event_balanced(OLD.event_id);
  ELSE
    PERFORM financial_core.assert_financial_event_balanced(NEW.event_id);
    IF TG_OP = 'UPDATE' AND OLD.event_id IS DISTINCT FROM NEW.event_id THEN
      PERFORM financial_core.assert_financial_event_balanced(OLD.event_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER financial_postings_balance_guard
AFTER INSERT OR UPDATE OR DELETE ON public.financial_postings
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION financial_core.check_event_balance_from_posting();

-- Narrow authorization contract for F3-02. The existing position-permission
-- model remains authoritative; active membership is an additional hard gate.
CREATE FUNCTION financial_core.can_manage_finances(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.group_id = p_group_id
        AND m.user_id = (SELECT auth.uid())
        AND m.membership_status = 'active'
    )
    AND public.has_group_permission(
      p_group_id, 'finances.manage', (SELECT auth.uid()));
$$;

CREATE FUNCTION financial_core.can_view_finances(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.group_id = p_group_id
        AND m.user_id = (SELECT auth.uid())
        AND m.membership_status = 'active'
    )
    AND (
      public.has_group_permission(
        p_group_id, 'finances.view', (SELECT auth.uid()))
      OR public.has_group_permission(
        p_group_id, 'finances.manage', (SELECT auth.uid()))
    );
$$;

CREATE FUNCTION financial_core.assert_finances_manage(p_group_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT financial_core.can_manage_finances(p_group_id) THEN
    RAISE EXCEPTION 'ACTIVE_FINANCES_MANAGE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN actor;
END;
$$;

-- Tuple-keyed transaction advisory lock. It works before an event row exists;
-- the natural unique constraint remains the final race guard.
CREATE FUNCTION financial_core.lock_financial_occurrence(
  p_group_id uuid,
  p_source_module text,
  p_source_record_id text,
  p_effect_kind text,
  p_ledger_epoch_id uuid
) RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF p_group_id IS NULL OR p_source_module IS NULL OR p_source_record_id IS NULL
     OR p_effect_kind IS NULL OR p_ledger_epoch_id IS NULL THEN
    RAISE EXCEPTION 'FINANCIAL_OCCURRENCE_LOCK_KEY_REQUIRED' USING ERRCODE = '22004';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.jsonb_build_array(
        p_group_id, p_source_module, p_source_record_id,
        p_effect_kind, p_ledger_epoch_id
      )::text,
      0
    )
  );
END;
$$;

ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.financial_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_funds FORCE ROW LEVEL SECURITY;
ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.financial_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.financial_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_postings FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.financial_accounts, public.financial_funds,
  public.financial_categories, public.financial_events,
  public.financial_postings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.financial_accounts,
  public.financial_funds, public.financial_categories TO authenticated;
GRANT SELECT ON public.financial_events, public.financial_postings TO authenticated;
GRANT SELECT ON public.financial_accounts, public.financial_funds,
  public.financial_categories, public.financial_events,
  public.financial_postings TO service_role;

CREATE POLICY financial_accounts_manager_select
  ON public.financial_accounts FOR SELECT TO authenticated
  USING ((SELECT financial_core.can_manage_finances(group_id)));
CREATE POLICY financial_accounts_manager_insert
  ON public.financial_accounts FOR INSERT TO authenticated
  WITH CHECK ((SELECT financial_core.can_manage_finances(group_id)));
CREATE POLICY financial_accounts_manager_update
  ON public.financial_accounts FOR UPDATE TO authenticated
  USING ((SELECT financial_core.can_manage_finances(group_id)))
  WITH CHECK ((SELECT financial_core.can_manage_finances(group_id)));

CREATE POLICY financial_funds_manager_select
  ON public.financial_funds FOR SELECT TO authenticated
  USING ((SELECT financial_core.can_manage_finances(group_id)));
CREATE POLICY financial_funds_manager_insert
  ON public.financial_funds FOR INSERT TO authenticated
  WITH CHECK ((SELECT financial_core.can_manage_finances(group_id)));
CREATE POLICY financial_funds_manager_update
  ON public.financial_funds FOR UPDATE TO authenticated
  USING ((SELECT financial_core.can_manage_finances(group_id)))
  WITH CHECK ((SELECT financial_core.can_manage_finances(group_id)));

CREATE POLICY financial_categories_manager_select
  ON public.financial_categories FOR SELECT TO authenticated
  USING ((SELECT financial_core.can_manage_finances(group_id)));
CREATE POLICY financial_categories_manager_insert
  ON public.financial_categories FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT financial_core.can_manage_finances(group_id))
    AND NOT is_system
  );
CREATE POLICY financial_categories_manager_update
  ON public.financial_categories FOR UPDATE TO authenticated
  USING (
    (SELECT financial_core.can_manage_finances(group_id))
    AND NOT is_system
  )
  WITH CHECK (
    (SELECT financial_core.can_manage_finances(group_id))
    AND NOT is_system
  );

-- Raw truth is officer/auditor-readable only. Member self-read remains for a
-- later dedicated projection/RPC and cannot leak peers through these tables.
CREATE POLICY financial_events_finance_reader
  ON public.financial_events FOR SELECT TO authenticated
  USING ((SELECT financial_core.can_view_finances(group_id)));
CREATE POLICY financial_postings_finance_reader
  ON public.financial_postings FOR SELECT TO authenticated
  USING ((SELECT financial_core.can_view_finances(group_id)));

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA financial_core
  FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA financial_core TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION financial_core.currency_scale(text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION financial_core.can_manage_finances(uuid),
  financial_core.can_view_finances(uuid),
  financial_core.assert_finances_manage(uuid)
  TO authenticated;

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
    RAISE EXCEPTION 'F3_ABORT: has_group_permission fingerprint changed by F3 migration';
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
