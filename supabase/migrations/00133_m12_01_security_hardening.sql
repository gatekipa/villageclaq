-- M12 defense in depth on the actual F3 private boundary.
-- Existing SECURITY DEFINER paths and function grants are individually reviewed
-- by their owning migrations. A blanket ALTER/GRANT would break legacy functions
-- and expose private posting helpers to authenticated callers.
BEGIN;
DO $pre$
BEGIN
  IF to_regclass('public.notifications_queue') IS NULL
     OR to_regclass('financial_private.epoch_transitions') IS NULL
  THEN RAISE EXCEPTION 'M12_ABORT: M11/F3 prerequisites missing'; END IF;
  IF has_schema_privilege('anon','financial_core','USAGE')
     OR has_schema_privilege('authenticated','financial_private','USAGE')
     OR has_function_privilege('authenticated',
        'financial_core.post_module_pair(uuid,text,text,text,numeric,text,uuid,uuid,uuid,uuid,timestamptz,text)',
        'EXECUTE')
  THEN RAISE EXCEPTION 'M12_ABORT: F3 private boundary broadened'; END IF;
END
$pre$;
ALTER TABLE financial_private.epoch_transitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financial_private.epoch_transitions FROM PUBLIC,anon,authenticated;
COMMIT;
