-- Internal point-of-use authority helper has no direct client caller. The
-- user-facing RPCs enforce self/member-manager or active group membership.
REVOKE ALL ON FUNCTION public.effective_standing_for_authority(uuid,timestamptz)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.effective_standing_for_authority(uuid,timestamptz)
  TO service_role;
