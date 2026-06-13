-- 00103: Join-system + platform-admin control-plane hardening (Build 3)
-- ===========================================================================
-- CREATED, NOT APPLIED. Single-file manual migration. Apply only after the
-- Build 3 deploy is READY, as a verbatim single-file execution — do NOT run a
-- broad migration runner. Re-runnable (guards on IF NOT EXISTS / OR REPLACE).
--
-- FINDINGS ADDRESSED (from the Build 3 join/platform-admin audit)
-- ---------------------------------------------------------------------------
-- 1. [HIGH — group lifecycle unmodeled] The platform-admin control plane needs
--    Suspend / Archive / Activate, but `groups` has only `is_active boolean` —
--    no way to tell a suspended group from an archived one. Add an explicit
--    `groups.status` lifecycle ('active','suspended','archived') plus reason +
--    timestamp columns, backfilled from is_active. `is_active` is KEPT (RLS and
--    app queries still read it). Because is_active is ALSO owner-controlled
--    (owners self-deactivate their own group), a one-directional mirror is
--    unsafe — an owner's is_active=true write could un-suspend a
--    platform-suspended group. So a BEFORE-UPDATE trigger makes the platform
--    lifecycle AUTHORITATIVE: status in ('suspended','archived') always forces
--    is_active=false (an owner can never reactivate out of a platform action), a
--    platform reactivate sets is_active true, and while status='active' the
--    owner's own on/off write is respected.
--
-- 2. [CRITICAL — proxy-claim account takeover] claim_membership_with_token
--    (00071) trusted a client-supplied p_user_id and NEVER compared the
--    claiming user against the token's stored email/phone. A claim link for
--    Proxy A could be redeemed by ANY logged-in account, binding the wrong
--    human to A's membership. Fix: derive the claimer from auth.uid() (reject a
--    mismatched p_user_id), and when the token carries an email or phone,
--    require the claimer's verified JWT email OR verified phone digits to match
--    before the claim proceeds. Legacy tokens carrying neither identity field
--    keep working (nothing to bind to) — proxy-claim/send always writes at
--    least one, so every real claim link is now identity-bound.
--
-- 3. [HIGH — proxy creation privilege escalation] create_proxy_member (00015)
--    let ANY plain member of the group create proxies AND cast p_role straight
--    from client input (so a member could mint an 'admin'/'owner' proxy). Fix:
--    require the caller to be owner/admin/moderator, and whitelist the role to
--    non-privileged values ('member','moderator') — proxies have no account and
--    must never hold owner/admin.
--
-- 4. [MEDIUM — token info disclosure] proxy_claim_tokens had GRANT SELECT TO
--    anon (00071). The public claim page reads tokens only through the
--    verify_claim_token() SECURITY DEFINER RPC (which stays granted to anon and
--    returns minimal data), so the raw-table anon grant is unnecessary surface.
--    Fix: REVOKE SELECT ON proxy_claim_tokens FROM anon.
--
-- 5. [FUNCTIONAL/COMPLIANCE — support impersonation unreachable] start_imper-
--    sonation (00085) gates support-role sessions on ticket.status = 'open', but
--    the enquiry_status enum is ('new','in_progress','resolved') — there is no
--    'open', so support staff can NEVER start an (audit-record) support session.
--    Fix: accept an actively-worked ticket (status IN ('new','in_progress')).
--    NOTE: this feature remains AUDIT-RECORD-ONLY — it does not switch effective
--    user/group context (see DOCUMENTED FOLLOW-UPS). This migration only repairs
--    the broken gate so an authorized support session can be opened + audited.
--
-- DOCUMENTED FOLLOW-UPS (NOT in this migration — own design + migration each):
--   * Real read-only "view-as-group" support mode (an effective-context switch
--     with hard send-blocking, per-group scoping, and a real DB-level session
--     expiry). platform_impersonation_sessions has no group_id/expiry column;
--     building this safely is a separate Build 3 / Build 4 follow-up.
--   * create_proxy_member tier-cap: the per-tier member limit is still enforced
--     only in the members-page UI, so a direct bulk RPC loop can exceed it.
--     Adding the cap to the RPC needs the active-member count + tier lookup;
--     scope + test separately.
--
-- PREFLIGHT (read-only — confirm before applying):
--   SELECT
--     (SELECT count(*) FROM information_schema.columns
--        WHERE table_schema='public' AND table_name='groups'
--          AND column_name='status') AS groups_status_exists,          -- expect 0 (pre-apply)
--     (SELECT count(*) FROM pg_proc WHERE proname='get_my_phone_digits')=1 AS has_phone_helper,
--     (SELECT count(*) FROM pg_proc WHERE proname='claim_membership_with_token')=1 AS has_claim_fn,
--     (SELECT count(*) FROM pg_proc WHERE proname='create_proxy_member')=1 AS has_proxy_fn,
--     (SELECT count(*) FROM pg_proc WHERE proname='start_impersonation')=1 AS has_imp_fn,
--     (SELECT count(*) FROM information_schema.role_table_grants
--        WHERE table_name='proxy_claim_tokens' AND grantee='anon'
--          AND privilege_type='SELECT') AS anon_token_select;          -- expect 1 (pre-apply)
--
-- VERIFICATION (after apply):
--   -- lifecycle columns + constraint present, backfill correct:
--   SELECT status, is_active, count(*) FROM public.groups GROUP BY 1,2 ORDER BY 1,2;
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='groups_status_check';
--   -- claim function now identity-bound (source carries the guard):
--   SELECT pg_get_functiondef('public.claim_membership_with_token(text,uuid)'::regprocedure)
--          ILIKE '%claim_identity_mismatch%';
--   -- proxy creation hardened:
--   SELECT pg_get_functiondef('public.create_proxy_member(uuid,text,text,text)'::regprocedure)
--          ILIKE '%invalid_proxy_role%';
--   -- anon table grant gone:
--   SELECT count(*) FROM information_schema.role_table_grants
--     WHERE table_name='proxy_claim_tokens' AND grantee='anon' AND privilege_type='SELECT'; -- expect 0
--   -- support ticket gate repaired:
--   SELECT pg_get_functiondef('public.start_impersonation(uuid,text,uuid)'::regprocedure)
--          ILIKE '%ticket_not_active%';
--   -- lifecycle-enforcement trigger present:
--   SELECT count(*) FROM pg_trigger WHERE tgname='trg_enforce_group_lifecycle'; -- expect 1
--   -- a platform-suspended group is forced is_active=false even if an owner
--   -- writes is_active=true (run as that owner, expect is_active stays false):
--   --   UPDATE groups SET is_active=true WHERE id='<suspended-group>'; then re-read.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_enforce_group_lifecycle ON public.groups;
--   DROP FUNCTION IF EXISTS public.enforce_group_lifecycle();
--   ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_status_check;
--   ALTER TABLE public.groups
--     DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS suspended_at,
--     DROP COLUMN IF EXISTS suspension_reason, DROP COLUMN IF EXISTS archived_at,
--     DROP COLUMN IF EXISTS archived_reason;
--   -- re-apply the 00071 claim fn, 00015 proxy fn, and 00085 start_impersonation
--   -- bodies verbatim; re-GRANT SELECT ON proxy_claim_tokens TO anon.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. groups lifecycle: status + reason/timestamp columns (is_active retained).
-- ---------------------------------------------------------------------------
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS suspension_reason text;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS archived_reason text;

-- Backfill BEFORE adding the CHECK so the constraint validates clean. Existing
-- inactive groups become 'suspended' (the reversible state); 'archived' is only
-- ever reached through an explicit platform-admin action.
UPDATE public.groups SET status = 'suspended'
  WHERE is_active = false AND status = 'active';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'groups_status_check') THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT groups_status_check CHECK (status IN ('active','suspended','archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_groups_status ON public.groups(status);

-- Enforce the platform lifecycle as AUTHORITATIVE over is_active.
--
-- is_active is deliberately overloaded: a group OWNER can self-deactivate their
-- own group (dashboard "Reactivate" screen writes is_active directly), AND the
-- platform control plane suspends/archives. These are different authorities, so
-- a one-directional status->is_active mirror is NOT enough — an owner's
-- `is_active = true` write could otherwise silently un-suspend a
-- platform-suspended group (the trigger wouldn't fire because status didn't
-- change), leaving status='suspended' while is_active=true.
--
-- Rule, enforced on EVERY update:
--   * status IN ('suspended','archived')  => is_active is FORCED false. A
--     platform-suspended/archived group can never be operationally live, no
--     matter who writes is_active. This is the authorization guard: an owner
--     cannot reactivate out of a platform suspension/archive.
--   * a platform reactivate (status transitions back to 'active')  => is_active
--     is set true.
--   * status='active' and unchanged  => is_active is left to the caller's write,
--     so an owner's own self-deactivate / self-reactivate keeps working while
--     the group is in good platform standing.
CREATE OR REPLACE FUNCTION public.enforce_group_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('suspended', 'archived') THEN
    NEW.is_active := false;
  ELSIF NEW.status = 'active' AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.is_active := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_group_is_active_from_status ON public.groups;
DROP TRIGGER IF EXISTS trg_enforce_group_lifecycle ON public.groups;
CREATE TRIGGER trg_enforce_group_lifecycle
  BEFORE UPDATE ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_group_lifecycle();

-- ---------------------------------------------------------------------------
-- 2. claim_membership_with_token: bind the claim to the claimer's identity.
--    (Replaces the 00071 body. Same signature + same downstream side effects:
--     PERFORM claim_proxy_membership, mark token claimed, accept matching
--     invitation. Adds the auth.uid() derivation + identity gate.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_membership_with_token(p_token TEXT, p_user_id UUID)
RETURNS VOID
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller        UUID := auth.uid();
  v_tok           RECORD;
  v_email_match   boolean;
  v_phone_match   boolean;
  v_has_identity  boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  -- Never act on behalf of an arbitrary user id supplied by the client.
  IF p_user_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'claim_user_mismatch';
  END IF;

  -- Load the live token row (unclaimed + unexpired).
  SELECT t.membership_id, t.email, t.phone
    INTO v_tok
  FROM proxy_claim_tokens t
  WHERE t.token = p_token
    AND t.claimed_at IS NULL
    AND t.expires_at > NOW();

  IF v_tok.membership_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired claim token';
  END IF;

  -- Identity binding. When the token carries an email and/or phone (every link
  -- issued by proxy-claim/send does), the claimer must match at least one:
  --   email leg — verified JWT email equals the token email (case-insensitive)
  --   phone leg — the claimer's verified phone digits equal the token phone
  -- COALESCE pins each leg to a strict boolean: SQL three-valued logic would
  -- otherwise let a NULL comparison (e.g. a phone-only claimer with no JWT email
  -- against an email-bound token) collapse `NOT (NULL OR false)` to NULL, which
  -- a plpgsql IF treats as not-true — silently allowing a mismatched claim.
  v_email_match := COALESCE(
    NULLIF(v_tok.email, '') IS NOT NULL
    AND lower(v_tok.email) = lower(NULLIF(auth.jwt() ->> 'email', '')),
    false
  );
  v_phone_match := COALESCE(
    NULLIF(v_tok.phone, '') IS NOT NULL
    AND public.get_my_phone_digits() IS NOT NULL
    AND NULLIF(regexp_replace(v_tok.phone, '\D', '', 'g'), '') = public.get_my_phone_digits(),
    false
  );
  v_has_identity := (NULLIF(v_tok.email, '') IS NOT NULL OR NULLIF(v_tok.phone, '') IS NOT NULL);

  IF v_has_identity AND NOT (v_email_match OR v_phone_match) THEN
    RAISE EXCEPTION 'claim_identity_mismatch';
  END IF;

  -- Claim against the caller (handles proxy validation + duplicate check).
  PERFORM claim_proxy_membership(v_tok.membership_id, v_caller);

  UPDATE proxy_claim_tokens
  SET claimed_at = NOW(), claimed_by = v_caller
  WHERE token = p_token;

  UPDATE invitations
  SET status = 'accepted', user_id = v_caller
  WHERE claim_membership_id = v_tok.membership_id
    AND status = 'pending';
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.claim_membership_with_token(TEXT, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. create_proxy_member: require an officer caller + whitelist the role.
--    (Replaces the 00015 body. Same signature, return, and INSERT shape; adds
--     the caller-role gate and the role whitelist.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_proxy_member(
  p_group_id UUID,
  p_display_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'member'
) RETURNS UUID AS $$
DECLARE
  new_membership_id UUID;
  caller_id UUID;
BEGIN
  caller_id := auth.uid();

  -- Caller must be an OFFICER of the target group. Proxy members are an
  -- admin-managed feature; a plain member can no longer mint them.
  IF NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE group_id = p_group_id
      AND user_id = caller_id
      AND role IN ('owner', 'admin', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Not authorized to create proxy members in this group';
  END IF;

  -- Proxies have no account and must never hold a privileged role. Whitelist
  -- the requested role instead of casting raw client input.
  IF COALESCE(p_role, 'member') NOT IN ('member', 'moderator') THEN
    RAISE EXCEPTION 'invalid_proxy_role';
  END IF;

  new_membership_id := gen_random_uuid();

  INSERT INTO memberships (
    id, user_id, group_id, display_name, role, standing,
    is_proxy, proxy_manager_id, joined_at, privacy_settings
  ) VALUES (
    new_membership_id,
    NULL,
    p_group_id,
    p_display_name,
    COALESCE(p_role, 'member')::membership_role,
    'good'::membership_standing,
    true,
    caller_id,
    now(),
    jsonb_build_object(
      'proxy_phone', COALESCE(p_phone, ''),
      'proxy_name', p_display_name,
      'show_phone', false,
      'show_email', false
    )
  );

  RETURN new_membership_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_proxy_member TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Remove the unnecessary anon raw-table grant on proxy_claim_tokens.
--    The public claim page reads tokens only through verify_claim_token().
-- ---------------------------------------------------------------------------
REVOKE SELECT ON public.proxy_claim_tokens FROM anon;

-- ---------------------------------------------------------------------------
-- 5. start_impersonation: repair the support-role ticket gate.
--    (Replaces the 00085 body VERBATIM except the support ticket-status check,
--     which moves from `= 'open'` [a non-existent enquiry_status] to the real
--     actively-worked states. Everything else — super_admin bypass, single
--     active session, session + audit inserts, return shape — is unchanged.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_impersonation(
  p_target_user_id uuid,
  p_reason text,
  p_ticket_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role text;
  v_staff_id uuid;
  v_session_id uuid;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_ticket RECORD;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;
  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;
  IF v_caller = p_target_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_impersonate_self');
  END IF;

  SELECT ps.id, ps.role::text INTO v_staff_id, v_role
  FROM platform_staff ps
  WHERE ps.user_id = v_caller AND ps.is_active = true
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  IF v_role NOT IN ('super_admin', 'support') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'role_not_permitted');
  END IF;

  -- Support must supply an actively-worked ticket they own. enquiry_status is
  -- ('new','in_progress','resolved'); an open support session may attach to a
  -- ticket that is not yet resolved.
  IF v_role = 'support' THEN
    IF p_ticket_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ticket_required');
    END IF;
    SELECT id, status, assigned_to INTO v_ticket
    FROM contact_enquiries
    WHERE id = p_ticket_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ticket_not_found');
    END IF;
    -- contact_enquiries.assigned_to REFERENCES platform_staff(id), so it must be
    -- compared to the caller's STAFF id (v_staff_id), NOT auth.uid() (v_caller).
    -- The 00085 original compared to v_caller — two independent id spaces that can
    -- never be equal — so this gate was unreachable for every support agent.
    IF v_ticket.assigned_to IS DISTINCT FROM v_staff_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ticket_not_assigned_to_caller');
    END IF;
    IF v_ticket.status NOT IN ('new', 'in_progress') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ticket_not_active');
    END IF;
  END IF;

  -- Max one active session per impersonator.
  IF EXISTS (
    SELECT 1 FROM platform_impersonation_sessions
    WHERE impersonator_id = v_caller AND ended_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_already_active');
  END IF;

  INSERT INTO platform_impersonation_sessions
    (impersonator_id, impersonated_user_id, support_ticket_id, reason)
  VALUES (v_caller, p_target_user_id, p_ticket_id, v_reason)
  RETURNING id INTO v_session_id;

  INSERT INTO platform_audit_logs (staff_id, action, target_type, target_id, details)
  VALUES (
    v_staff_id,
    'impersonation.start',
    'auth.users',
    p_target_user_id,
    jsonb_build_object(
      'session_id', v_session_id,
      'reason', v_reason,
      'support_ticket_id', p_ticket_id,
      'role', v_role
    )
  );

  RETURN jsonb_build_object('ok', true, 'session_id', v_session_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_impersonation(uuid, text, uuid)
  TO authenticated, service_role;
