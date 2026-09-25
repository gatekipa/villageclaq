-- supabase/migrations/00133_m12_01_security_hardening.sql

-- PREFLIGHT SAFETY CHECK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'notifications_queue'
  ) THEN
    RAISE EXCEPTION 'Preflight check failed: public.notifications_queue is missing. M11 must be applied first.';
  END IF;
END $$;

-- 1. COMPREHENSIVE SEARCH_PATH REMEDIATION
-- Dynamically enforce SET search_path = '' on all SECURITY DEFINER functions in public and financial_core
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT 
      p.proname, 
      n.nspname, 
      pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname IN ('public', 'financial_core')
      AND p.prosecdef = true
  LOOP
    EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = ''''', rec.nspname, rec.proname, rec.args);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 2. RLS DEFENSE-IN-DEPTH FOR epoch_transitions
ALTER TABLE public.epoch_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS epoch_transitions_tenant_select ON public.epoch_transitions;
CREATE POLICY epoch_transitions_tenant_select ON public.epoch_transitions
  FOR SELECT TO authenticated
  USING (public.has_group_permission(group_id, auth.uid(), 'finances.view'));

-- (Direct INSERT/UPDATE/DELETE implicitly denied by lack of policies)

-- 3. PERMISSION & EXECUTION GRANT HARDENING
-- Revoke all access to financial_core from anon and public, grant only to authenticated and service_role
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT 
      p.proname, 
      n.nspname, 
      pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'financial_core'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM public, anon', rec.nspname, rec.proname, rec.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role', rec.nspname, rec.proname, rec.args);
  END LOOP;
END;
$$ LANGUAGE plpgsql;
