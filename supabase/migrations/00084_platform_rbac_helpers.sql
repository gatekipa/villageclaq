-- 00084: Platform RBAC helpers
-- ---------------------------------------------------------------------------
-- Final-pass platform-admin audit turned up three exploitable gaps:
--   (a) /api/admin/query ran under the service role with NO role filter,
--       letting any active staff read any table (including payments,
--       platform_staff, memberships). Closed in code: src/lib/admin-rbac.ts
--       is now consulted before every query/mutate/export.
--   (b) /api/admin/mutate's super-admin check read an `is_super_admin`
--       column that doesn't exist on platform_staff (the actual role
--       lives in a platform_role enum). The comparison resolved to
--       `undefined === true` → false, denying every super-admin write
--       to platform_staff — Staff Management was dead. Closed in code:
--       canManageStaff(role) checks role === 'super_admin' correctly.
--   (c) platform_audit_logs had no UPDATE/DELETE policies; RLS default-
--       denies authenticated writes, but the admin API uses the
--       service-role client which bypasses RLS. That meant the routes
--       themselves (or any future code using the service role) could
--       rewrite the audit trail. Closed below via BEFORE UPDATE/DELETE
--       triggers that raise 42501 regardless of the caller's role.
--
-- Additions:
--   1. platform_role_has(role, user_id) — SECURITY DEFINER helper for
--      RLS policies to gate a table to a specific platform role.
--      Example use: USING (platform_role_has('finance'))
--      Called from SQL in future per-table RLS work.
--   2. Immutability triggers on platform_audit_logs — raise 42501 on
--      any UPDATE or DELETE, regardless of RLS bypass status.

CREATE OR REPLACE FUNCTION public.platform_role_has(p_role text, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_staff
    WHERE user_id = p_user_id
      AND is_active = true
      AND role::text = p_role
  );
$$;

GRANT EXECUTE ON FUNCTION public.platform_role_has(text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_audit_logs_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'platform_audit_logs is immutable' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS no_update_platform_audit_logs ON public.platform_audit_logs;
CREATE TRIGGER no_update_platform_audit_logs
  BEFORE UPDATE ON public.platform_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.platform_audit_logs_immutable();

DROP TRIGGER IF EXISTS no_delete_platform_audit_logs ON public.platform_audit_logs;
CREATE TRIGGER no_delete_platform_audit_logs
  BEFORE DELETE ON public.platform_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.platform_audit_logs_immutable();
