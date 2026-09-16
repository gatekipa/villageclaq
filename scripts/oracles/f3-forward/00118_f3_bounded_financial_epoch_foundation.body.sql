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
