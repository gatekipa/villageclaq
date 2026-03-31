-- Migration 00035: Enhance group_audit_logs for proper audit trail
-- Existing table has: id, group_id, actor_id, action, details (JSONB), created_at
-- Adding: entity_type, entity_id, description, ip_address

ALTER TABLE group_audit_logs ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE group_audit_logs ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE group_audit_logs ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE group_audit_logs ADD COLUMN IF NOT EXISTS ip_address TEXT;

-- Fix RLS: audit logs should be readable by admin/owner only (not all members)
-- and immutable (no UPDATE or DELETE)
DROP POLICY IF EXISTS "Members view group audit" ON group_audit_logs;
DROP POLICY IF EXISTS "System insert audit" ON group_audit_logs;
DROP POLICY IF EXISTS "rls_gal_select" ON group_audit_logs;
DROP POLICY IF EXISTS "rls_gal_insert" ON group_audit_logs;

-- SELECT: admin/owner only
CREATE POLICY "admin_select_audit_logs" ON group_audit_logs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM memberships
    WHERE memberships.group_id = group_audit_logs.group_id
    AND memberships.user_id = auth.uid()
    AND memberships.role IN ('admin', 'owner')
  )
);

-- INSERT: any authenticated group member (system logs during mutations)
CREATE POLICY "member_insert_audit_logs" ON group_audit_logs FOR INSERT TO authenticated
WITH CHECK (group_id IN (SELECT get_user_group_ids()));

-- No UPDATE or DELETE policies — audit logs are immutable

GRANT ALL ON group_audit_logs TO authenticated;

-- Index for entity queries
CREATE INDEX IF NOT EXISTS idx_group_audit_entity ON group_audit_logs(group_id, entity_type, created_at DESC);
