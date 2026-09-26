-- Isolated PostgreSQL 17 fixture only. Mirrors the relevant 00011/00035/00114
-- audit columns and vulnerable active-member INSERT policy before 00137.
CREATE TABLE public.group_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  description text,
  ip_address text
);
ALTER TABLE public.group_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY member_insert_audit_logs ON public.group_audit_logs
  FOR INSERT TO authenticated WITH CHECK (
    group_id IN (
      SELECT m.group_id FROM public.memberships m
      WHERE m.user_id=auth.uid() AND m.membership_status='active'
    )
  );
GRANT ALL ON public.group_audit_logs TO authenticated;
