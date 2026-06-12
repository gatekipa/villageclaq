-- ============================================================================
-- Invitee policy hardening: drop the 00027 UPDATE policy, gate SELECT on
-- email_verified
-- ============================================================================
-- SEQUENCING: migrations are run manually in the Supabase SQL Editor. This
-- file ships with the PR for review but must NOT be applied as part of the
-- PR itself — apply it after merge (apply 00099 first to keep numbering
-- order, though the two are independent).
--
-- BEFORE (00027, live today)
--   "Invitees can update their invitations": FOR UPDATE TO authenticated
--     USING (email = auth.jwt()->>'email') WITH CHECK (same predicate)
--   "Invitees can view their invitations": FOR SELECT TO authenticated
--     USING (email = auth.jwt()->>'email')
--
-- AFTER
--   - The invitee UPDATE policy is GONE. Invitee accept/decline already flow
--     exclusively through the SECURITY DEFINER RPCs accept_invitation
--     (00076, re-emitted in 00095) and decline_invitation (00095); the
--     my-invitations page has no direct .update() on invitations (pinned by
--     scripts/test-invitation-integrity.mjs).
--   - The invitee SELECT policy additionally requires the JWT's
--     email_verified claim to be true.
--
-- WHY DROP THE UPDATE POLICY (PR #14 precedent)
--   An RLS WITH CHECK can only validate the NEW row — it cannot pin
--   immutable columns against OLD. So an email-matching invitee could PATCH
--   their pending row's group_id / role / expires_at before accepting,
--   repointing the invitation at an arbitrary group or escalating the
--   granted role. This is exactly why 00095 deliberately shipped NO update
--   policy for phone invitees ("There is NO invitee UPDATE policy for phone
--   rows") and routed decline through decline_invitation(). Email invitees
--   now get the same treatment. Admin revocation is unaffected: it is
--   authorized by the separate "Group admins can update invitations"
--   policy, which this migration does not touch.
--
-- WHY THE VERIFIED-EMAIL GATE ON SELECT
--   Pre-verification, a Supabase signup (or pending email change) can claim
--   ANY address — someone holding a session whose JWT email claim matches
--   another person's invitations could, under the 00027 predicate, read
--   those rows, including the invitation token.
--   IMPORTANT IMPLEMENTATION NOTE: Supabase/GoTrue access tokens carry NO
--   top-level email_verified claim (it exists only inside user_metadata and
--   is unreliable there), so gating on auth.jwt()->>'email_verified' would
--   evaluate NULL -> false for EVERY session and silently hide all email
--   invitations from legitimate invitees. The authoritative source is
--   auth.users.email_confirmed_at, read through a SECURITY DEFINER helper —
--   the same pattern 00095 established with get_my_phone_digits(). Note
--   that 00095's caller_matches_invitation itself trusts the raw JWT email
--   claim (no verification predicate); this migration is therefore a
--   strictly stronger gate for direct SELECT visibility, not a mirror.
--   "Users can view their stamped invitations" (user_id = auth.uid()),
--   "Invitees can view their phone invitations" (00095), and all
--   admin/inviter policies are untouched.
--
-- PREFLIGHT
--   Informational only — the DO block below reports whether the two 00027
--   policies are currently present but does NOT fail if they are already
--   absent (the statements below are idempotent via IF EXISTS).
--
-- VERIFICATION (run after applying)
--   SELECT polname FROM pg_policy
--   WHERE polrelid = 'public.invitations'::regclass ORDER BY polname;
--     -- expect: "Invitees can update their invitations" ABSENT;
--     -- "Invitees can view their invitations" present; "Group admins can
--     -- update invitations", "Users can view their stamped invitations",
--     -- and "Invitees can view their phone invitations" still present.
--   SELECT pg_get_expr(polqual, polrelid) FROM pg_policy
--   WHERE polrelid = 'public.invitations'::regclass
--     AND polname = 'Invitees can view their invitations';
--     -- expect caller_email_is_verified() in the USING expression
--   SELECT public.caller_email_is_verified();
--     -- as a confirmed-email session: expect t
--   -- As a verified-email invitee session: my-invitations still lists the
--   -- rows, and accept/decline still work (RPC path, not row UPDATE).
--
-- ROLLBACK (re-create the 00027 originals verbatim)
--   DROP FUNCTION IF EXISTS public.caller_email_is_verified();
--   DROP POLICY IF EXISTS "Invitees can view their invitations" ON public.invitations;
--   CREATE POLICY "Invitees can view their invitations"
--     ON public.invitations FOR SELECT
--     TO authenticated
--     USING (
--       email = (auth.jwt()->>'email')
--     );
--   CREATE POLICY "Invitees can update their invitations"
--     ON public.invitations FOR UPDATE
--     TO authenticated
--     USING (
--       email = (auth.jwt()->>'email')
--     )
--     WITH CHECK (
--       email = (auth.jwt()->>'email')
--     );
--   -- Rolling back re-opens the WITH CHECK repoint vector and the
--   -- unverified-email read exposure documented above.

-- ── Preflight (informational): report current 00027 policy presence ────────
DO $$
DECLARE
  v_update_present boolean;
  v_select_present boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.invitations'::regclass
      AND polname = 'Invitees can update their invitations'
  ) INTO v_update_present;
  SELECT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.invitations'::regclass
      AND polname = 'Invitees can view their invitations'
  ) INTO v_select_present;
  RAISE NOTICE
    'preflight: invitee UPDATE policy present=%, invitee SELECT policy present=% (absence is fine — the statements below are idempotent)',
    v_update_present, v_select_present;
END;
$$;

-- ── 1. Remove the invitee UPDATE policy (accept/decline are RPC-only) ──────
DROP POLICY IF EXISTS "Invitees can update their invitations" ON public.invitations;

-- ── 2. Verified-email helper (get_my_phone_digits precedent, 00095) ────────
-- Supabase JWTs carry no usable top-level email_verified claim; the
-- authoritative flag is auth.users.email_confirmed_at. SECURITY DEFINER is
-- required because authenticated has no SELECT on auth.users. STABLE: one
-- value per statement, safe inside RLS.
CREATE OR REPLACE FUNCTION public.caller_email_is_verified()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
      AND u.email_confirmed_at IS NOT NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.caller_email_is_verified() TO authenticated;

-- ── 3. Re-create the invitee SELECT policy behind the verified-email gate ──
DROP POLICY IF EXISTS "Invitees can view their invitations" ON public.invitations;
CREATE POLICY "Invitees can view their invitations"
  ON public.invitations FOR SELECT
  TO authenticated
  USING (
    email = (auth.jwt()->>'email')
    AND public.caller_email_is_verified()
  );

NOTIFY pgrst, 'reload schema';
