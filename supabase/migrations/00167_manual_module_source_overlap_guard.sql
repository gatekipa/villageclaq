-- F4-007 / FCG-1: when a manual entry declares the same source reference
-- as a module event, the two paths cannot both post. This does not infer
-- identity from amount/date and is not the complete source-link cutover gate.
BEGIN;
CREATE OR REPLACE FUNCTION financial_core.guard_manual_module_source_overlap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_source text;
BEGIN
  IF NEW.source_module='manual_finance' THEN
    v_source:=nullif(pg_catalog.btrim(
      NEW.reference_metadata->>'reference'),'');
  ELSIF NEW.source_module<>'opening_finance' THEN
    v_source:=NEW.source_record_id;
  ELSE
    RETURN NEW;
  END IF;
  IF v_source IS NULL THEN RETURN NEW; END IF;

  -- Serialize opposite insert orders for the declared source within a group.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    NEW.group_id::text||'/economic-source/'||pg_catalog.lower(v_source),0));
  IF NEW.source_module='manual_finance' THEN
    IF EXISTS (SELECT 1 FROM public.financial_events e
      WHERE e.group_id=NEW.group_id
        AND e.source_module NOT IN ('manual_finance','opening_finance')
        AND pg_catalog.lower(e.source_record_id)=pg_catalog.lower(v_source))
    THEN RAISE EXCEPTION 'OCCURRENCE_INTEGRITY'; END IF;
  ELSIF EXISTS (SELECT 1 FROM public.financial_events e
      WHERE e.group_id=NEW.group_id AND e.source_module='manual_finance'
        AND pg_catalog.lower(e.reference_metadata->>'reference')=
          pg_catalog.lower(v_source))
  THEN RAISE EXCEPTION 'OCCURRENCE_INTEGRITY'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION financial_core.guard_manual_module_source_overlap()
  FROM PUBLIC,anon,authenticated,service_role;
DO $pre$
BEGIN
  IF EXISTS (SELECT 1 FROM public.financial_events manual_event
    JOIN public.financial_events module_event
      ON module_event.group_id=manual_event.group_id
        AND module_event.source_module NOT IN ('manual_finance','opening_finance')
        AND pg_catalog.lower(module_event.source_record_id)=
          pg_catalog.lower(manual_event.reference_metadata->>'reference')
    WHERE manual_event.source_module='manual_finance')
  THEN RAISE EXCEPTION 'PREEXISTING_MANUAL_MODULE_OVERLAP'; END IF;
END
$pre$;
CREATE TRIGGER financial_events_manual_module_source_overlap
  BEFORE INSERT ON public.financial_events FOR EACH ROW
  EXECUTE FUNCTION financial_core.guard_manual_module_source_overlap();
COMMIT;
