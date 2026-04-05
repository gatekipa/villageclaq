-- ================================================
-- MIGRATION 00061: Batch 3 bug fixes
-- Fix 2: membership_status 'exited' for leave-group soft-delete
-- Fix 4: GRANT EXECUTE on claim_proxy_membership (was missing — caused permission denied)
-- Fix 5: is_group_member/is_group_admin exclude exited members
-- Run in Supabase SQL Editor
-- ================================================


-- ── 1. Extend membership_status CHECK to include 'exited' ───────────────────
-- PostgreSQL requires DROP + ADD to modify a check constraint.
-- The auto-generated constraint name from the inline CHECK in 00058 is
-- memberships_membership_status_check — use IF EXISTS to be safe.

ALTER TABLE public.memberships
  DROP CONSTRAINT IF EXISTS memberships_membership_status_check;

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_membership_status_check
  CHECK (membership_status IN ('active', 'pending_approval', 'exited'));


-- ── 2. Update is_group_member — exclude exited members ──────────────────────
-- Without this, an exited member's session could still pass RLS.

CREATE OR REPLACE FUNCTION public.is_group_member(gid UUID, uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE group_id = gid
      AND user_id = uid
      AND membership_status != 'exited'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.is_group_member(UUID, UUID) TO authenticated;


-- ── 3. Update is_group_admin — exclude exited members ───────────────────────

CREATE OR REPLACE FUNCTION public.is_group_admin(gid UUID, uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE group_id = gid
      AND user_id = uid
      AND role IN ('owner', 'admin')
      AND membership_status != 'exited'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.is_group_admin(UUID, UUID) TO authenticated;


-- ── 4. Update is_group_admin_or_owner — exclude exited members ──────────────

CREATE OR REPLACE FUNCTION public.is_group_admin_or_owner(gid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE group_id = gid
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND membership_status != 'exited'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.is_group_admin_or_owner(UUID) TO authenticated;


-- ── 5. Update is_group_owner — exclude exited members (defensive) ───────────

CREATE OR REPLACE FUNCTION public.is_group_owner(gid UUID, uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE group_id = gid
      AND user_id = uid
      AND role = 'owner'
      AND membership_status != 'exited'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.is_group_owner(UUID, UUID) TO authenticated;


-- ── 6. GRANT EXECUTE on claim_proxy_membership (was missing in 00020) ───────
-- Without this, authenticated users get "permission denied for function" when
-- claiming a proxy membership. This was the root cause of Bug #350.

GRANT EXECUTE ON FUNCTION public.claim_proxy_membership(UUID, UUID) TO authenticated;


-- ── 7. Index on membership_status for faster exited-member exclusion ─────────
DROP INDEX IF EXISTS idx_memberships_status_user;
CREATE INDEX idx_memberships_status_user
  ON public.memberships (user_id, membership_status)
  WHERE membership_status != 'exited';


-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
