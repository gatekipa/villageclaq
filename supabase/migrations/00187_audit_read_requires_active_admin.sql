-- Consequential group audit details, including dues waiver reasons, require
-- current group-admin membership when read through an ordinary client role.
BEGIN;
DROP POLICY IF EXISTS admin_select_audit_logs ON public.group_audit_logs;
CREATE POLICY admin_select_audit_logs ON public.group_audit_logs
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.group_id=group_audit_logs.group_id
      AND m.user_id=auth.uid()
      AND m.membership_status='active'
      AND m.role IN ('admin','owner')
  ));
COMMIT;
