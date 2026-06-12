-- Phone-invitee invitation matching: visibility + acceptance + decline.
--
-- PR #13 delivers the WhatsApp invitation notice to phone-only invitees,
-- but the completion path was email/user_id-only at every layer:
--   1. The original phone-matching SELECT predicate (00001) subqueried
--      auth.users, which RLS policies cannot do — 00015 dropped it and the
--      phone leg was never restored.
--   2. accept_invitation (00076) hard-rejects email-NULL invitations
--      ('email_mismatch'), so phone rows could never be accepted.
--   3. The invitee UPDATE policy (00027) is email-gated, so phone invitees
--      could not decline either.
-- This migration restores the phone leg safely.
--
-- MATCHING RULE: exact normalized digits (strip all non-digits, compare
-- the full strings). No suffix/partial matching — profiles.phone is
-- self-asserted free text, and loose matching would let one account link
-- itself to another person's invitations. Format divergence (local
-- "0677..." invitation vs E.164 profile) yields a false NEGATIVE only.
--
-- TRUST TRADE-OFF (deliberate, see also the role/group bounds below): the
-- caller's phone comes from auth.users.phone when set (phone auth is
-- currently disabled, so usually empty) falling back to profiles.phone,
-- which the user can freely set on their own profile row (my-profile page,
-- USING auth.uid() = id) and is NOT verified (no OTP). So "I am the
-- invitee for phone N" is a self-asserted claim. The exposure is bounded:
--   - Phone matching applies ONLY to email-NULL invitations: invitations
--     carrying an email (including branch owner-invitations) stay
--     verified-email-only and never fall through to the phone leg.
--   - Phone ACCEPTANCE and DECLINE are restricted to member-role
--     invitations — a self-asserted phone can never yield (or refuse) an
--     admin/owner/moderator membership.
--   - There is NO invitee UPDATE policy for phone rows. The invitee can
--     SELECT (see) the row and call accept_invitation / decline_invitation
--     (which re-read the row server-side); they cannot PATCH the row, so
--     they cannot repoint group_id/role/expiry — acceptance is bounded to
--     exactly the group the inviting admin targeted, as a member.
--   - accept/decline stamp user_id, preserving the audit trail.

-- ── 1. Caller-phone helper ───────────────────────────────────────────────
-- RLS policies cannot subquery auth.users (the authenticated role has no
-- SELECT on it — the exact breakage 00015 fixed by dropping the original
-- policy). A SECURITY DEFINER helper is the established pattern
-- (precedents: get_user_group_ids, get_user_email in 00065).
CREATE OR REPLACE FUNCTION public.get_my_phone_digits()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(
    regexp_replace(
      COALESCE(
        NULLIF((SELECT u.phone FROM auth.users u WHERE u.id = auth.uid()), ''),
        (SELECT p.phone FROM public.profiles p WHERE p.id = auth.uid())
      ),
      '\D', '', 'g'
    ),
    ''
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_phone_digits() TO authenticated;

-- ── 2. Invitee phone visibility (SELECT only) ───────────────────────────
-- SELECT lets the phone invitee see their invitation. There is
-- deliberately NO matching UPDATE policy: an RLS WITH CHECK can only
-- validate the NEW row (it cannot pin immutable columns against OLD), so a
-- phone-matching UPDATE policy would let a caller repoint group_id/role and
-- then accept into an arbitrary group. Decline therefore goes through the
-- decline_invitation() RPC below, which never lets the caller choose the
-- target.
DROP POLICY IF EXISTS "Invitees can view their phone invitations" ON public.invitations;
CREATE POLICY "Invitees can view their phone invitations"
  ON public.invitations FOR SELECT
  TO authenticated
  USING (
    invitations.email IS NULL
    AND invitations.phone IS NOT NULL
    AND NULLIF(regexp_replace(invitations.phone, '\D', '', 'g'), '') = public.get_my_phone_digits()
  );

-- Remove any earlier-iteration phone UPDATE policy (defensive — this
-- migration never ships one; decline is RPC-only).
DROP POLICY IF EXISTS "Invitees can update their phone invitations" ON public.invitations;

-- ── 3. Shared identity gate (email OR member-role phone) ────────────────
-- Returns true when the caller may act on this invitation. Email leg:
-- verified JWT email (NULLIF guards the empty-string trap so a caller with
-- no email can never match an email='' row). Phone leg: email-NULL,
-- member-role, exact normalized-digit match.
CREATE OR REPLACE FUNCTION public.caller_matches_invitation(
  p_email text,
  p_phone text,
  p_role text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (
      NULLIF(p_email, '') IS NOT NULL
      AND lower(p_email) = lower(NULLIF(auth.jwt() ->> 'email', ''))
    )
    OR (
      NULLIF(p_email, '') IS NULL
      AND p_phone IS NOT NULL
      AND public.get_my_phone_digits() IS NOT NULL
      AND NULLIF(regexp_replace(p_phone, '\D', '', 'g'), '') = public.get_my_phone_digits()
      AND COALESCE(p_role, 'member') = 'member'
    );
$$;

GRANT EXECUTE ON FUNCTION public.caller_matches_invitation(text, text, text) TO authenticated;

-- ── 4. accept_invitation: widen the identity gate via the shared helper ──
-- Verbatim 00076 body except: `phone` added to the SELECT INTO, and the
-- email-only gate replaced by caller_matches_invitation(). The claim guard
-- (use_claim_rpc), status/expiry checks, already-member short-circuit,
-- tier caps, memberships INSERT shape, user_id stamping, and the jsonb
-- return shape are unchanged — the welcome producer chain consumes
-- {ok, membership_id, already_member} and must keep working byte-for-byte.
CREATE OR REPLACE FUNCTION public.accept_invitation(
  p_invitation_id uuid,
  p_display_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text := auth.jwt() ->> 'email';
  v_invitation RECORD;
  v_existing_id uuid;
  v_tier text;
  v_max_members integer;
  v_member_count integer;
  v_membership_id uuid;
  v_display text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  SELECT id, group_id, email, phone, role, status, expires_at, claim_membership_id
    INTO v_invitation
  FROM public.invitations
  WHERE id = p_invitation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_not_found');
  END IF;

  -- Identity gate: verified email OR member-role phone match. Error code
  -- stays 'email_mismatch' so existing client mappings and i18n keys apply.
  IF NOT public.caller_matches_invitation(
       v_invitation.email, v_invitation.phone, v_invitation.role::text
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch');
  END IF;

  IF v_invitation.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_not_pending');
  END IF;

  IF v_invitation.expires_at IS NOT NULL AND v_invitation.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_expired');
  END IF;

  -- Proxy claim invitations are handled by claim_proxy_membership().
  IF v_invitation.claim_membership_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'use_claim_rpc');
  END IF;

  -- Short-circuit if the user is already a member of this group.
  SELECT id INTO v_existing_id
  FROM public.memberships
  WHERE group_id = v_invitation.group_id AND user_id = v_user_id
  LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    UPDATE public.invitations
    SET status = 'accepted', accepted_at = now(), user_id = v_user_id
    WHERE id = p_invitation_id;
    RETURN jsonb_build_object('ok', true, 'membership_id', v_existing_id, 'already_member', true);
  END IF;

  -- Tier limit check — mirrors check_member_limit().
  SELECT COALESCE(tier, 'free') INTO v_tier
  FROM public.group_subscriptions WHERE group_id = v_invitation.group_id;
  v_tier := COALESCE(v_tier, 'free');

  IF v_tier <> 'enterprise' THEN
    v_max_members := CASE v_tier
      WHEN 'free' THEN 15
      WHEN 'starter' THEN 50
      WHEN 'pro' THEN 200
      ELSE 15
    END;
    SELECT COUNT(*) INTO v_member_count
    FROM public.memberships
    WHERE group_id = v_invitation.group_id
      AND membership_status IN ('active', 'pending_approval');
    IF v_member_count >= v_max_members THEN
      RETURN jsonb_build_object('ok', false, 'error', 'group_full');
    END IF;
  END IF;

  -- Derive display_name with a safe fallback from the caller's profile.
  v_display := COALESCE(
    NULLIF(trim(p_display_name), ''),
    (SELECT full_name FROM public.profiles WHERE id = v_user_id),
    split_part(COALESCE(v_user_email, 'Member'), '@', 1)
  );

  INSERT INTO public.memberships (user_id, group_id, role, standing, is_proxy, display_name, membership_status)
  VALUES (
    v_user_id,
    v_invitation.group_id,
    COALESCE(v_invitation.role, 'member')::membership_role,
    'good'::membership_standing,
    false,
    v_display,
    'active'
  )
  RETURNING id INTO v_membership_id;

  UPDATE public.invitations
  SET status = 'accepted', accepted_at = now(), user_id = v_user_id
  WHERE id = p_invitation_id;

  RETURN jsonb_build_object('ok', true, 'membership_id', v_membership_id, 'group_id', v_invitation.group_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid, text) TO authenticated;

-- ── 5. decline_invitation: invitee-driven decline through a controlled RPC
-- Replaces the raw client UPDATE for the decline path so neither email nor
-- phone invitees need a row-mutating RLS policy. Only flips a pending
-- invitation to 'declined' and stamps user_id — never touches group_id,
-- role, or any other field, closing the repoint vector.
CREATE OR REPLACE FUNCTION public.decline_invitation(
  p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_invitation RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  SELECT id, email, phone, role, status, claim_membership_id
    INTO v_invitation
  FROM public.invitations
  WHERE id = p_invitation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_not_found');
  END IF;

  IF NOT public.caller_matches_invitation(
       v_invitation.email, v_invitation.phone, v_invitation.role::text
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch');
  END IF;

  IF v_invitation.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_not_pending');
  END IF;

  UPDATE public.invitations
  SET status = 'declined', user_id = v_user_id
  WHERE id = p_invitation_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.decline_invitation(uuid) TO authenticated;

-- ── 6. count_my_pending_invitations: invitee-scoped routing count ────────
-- The post-auth redirect counts pending invitations addressed to the
-- caller. It must count ONLY invitee-visible rows (email / stamped user_id
-- / member-role phone match) — NOT the inviter or group-member SELECT legs
-- (00015), or a former inviter with 0 memberships would be miscounted and
-- misrouted to my-invitations instead of onboarding.
CREATE OR REPLACE FUNCTION public.count_my_pending_invitations()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.invitations i
  WHERE i.status = 'pending'
    AND (
      i.user_id = auth.uid()
      OR public.caller_matches_invitation(i.email, i.phone, i.role::text)
    );
$$;

GRANT EXECUTE ON FUNCTION public.count_my_pending_invitations() TO authenticated;

NOTIFY pgrst, 'reload schema';
