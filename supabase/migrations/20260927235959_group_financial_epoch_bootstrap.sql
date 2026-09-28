-- New groups created after the F3 foundation need an active ledger epoch before
-- an authorized finance manager can open custody accounts. Bootstrap that
-- empty epoch in the same transaction as group creation. This creates no
-- balance, posting, event, fund, category, or opening-cash assertion.

BEGIN;

CREATE OR REPLACE FUNCTION financial_private.bootstrap_group_ledger_epoch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.financial_ledger_epochs (
    group_id,
    currency,
    effective_from,
    source_kind,
    source_reference,
    approval_note,
    created_by,
    approved_by
  )
  VALUES (
    NEW.id,
    COALESCE(NULLIF(pg_catalog.btrim(NEW.currency), ''), 'XAF'),
    COALESCE(NEW.created_at, pg_catalog.clock_timestamp()),
    'cutover',
    'new-group:' || NEW.id::text,
    'Initial empty ledger epoch created with group',
    NEW.created_by,
    NEW.created_by
  )
  ON CONFLICT (group_id) WHERE effective_to IS NULL DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION financial_private.bootstrap_group_ledger_epoch()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS group_financial_epoch_bootstrap ON public.groups;
CREATE TRIGGER group_financial_epoch_bootstrap
AFTER INSERT ON public.groups
FOR EACH ROW EXECUTE FUNCTION financial_private.bootstrap_group_ledger_epoch();

-- Compatibility backfill for groups created after 00118 but before this
-- trigger existed. It is empty-ledger metadata only and preserves group time,
-- currency, and creator identity.
INSERT INTO public.financial_ledger_epochs (
  group_id,
  currency,
  effective_from,
  source_kind,
  source_reference,
  approval_note,
  created_by,
  approved_by
)
SELECT
  g.id,
  COALESCE(NULLIF(pg_catalog.btrim(g.currency), ''), 'XAF'),
  COALESCE(g.created_at, pg_catalog.clock_timestamp()),
  'cutover',
  'new-group-backfill:' || g.id::text,
  'Initial empty ledger epoch for post-F3 group',
  g.created_by,
  g.created_by
FROM public.groups g
WHERE NOT EXISTS (
  SELECT 1
  FROM public.financial_ledger_epochs e
  WHERE e.group_id = g.id
);

COMMIT;
