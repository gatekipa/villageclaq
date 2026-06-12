-- ============================================================================
-- Phone-invitation duplicate guard: partial unique index on (group_id, digits)
-- ============================================================================
-- SEQUENCING: migrations are run manually in the Supabase SQL Editor. This
-- file ships with the PR for review but must NOT be applied as part of the
-- PR itself — apply it after merge. The same PR adds 23505 handling to the
-- three admin invite pages, which is a no-op until this index exists.
--
-- WHAT THIS FIXES
--   00029 added invitations_group_email_active_unique on
--   (group_id, lower(email)) WHERE status IN ('pending', 'accepted'), so one
--   email can never hold two active invitations to the same group. Phone
--   invitations (onboarding wizard, branch founding president, WhatsApp
--   notices — PRs #13/#14) never got the twin index: the same phone number
--   can accumulate unlimited active invitations per group, each a separate
--   WhatsApp-notice target and a separate acceptable row.
--
--   This is that twin. It mirrors 00029's lifecycle semantics exactly: only
--   'pending' and 'accepted' rows occupy the partial index, so terminal
--   rows ('declined' / 'revoked' / 'expired') never block history and a
--   revoked invitation can always be re-issued to the same phone.
--
-- MATCHING RULE
--   regexp_replace(phone, '\D', '', 'g') — exact normalized digits, the same
--   normalization used everywhere phone invitations are matched (00095
--   get_my_phone_digits / caller_matches_invitation, src/lib/phone-digits.ts).
--   Indexing the normalized form catches local-vs-E.164 formatting
--   divergence ("+1 (301) 555-0100" vs "13015550100") that an index on the
--   raw column would miss.
--
-- SAFETY
--   - Preflight aborts (with a count in the message) if any duplicate
--     (group_id, digits) pair already exists among active phone invitations.
--     NO automatic dedupe — destructive data rewrites are not justified
--     here, and prod was verified clean (0 duplicate pairs, 2026-06-13;
--     statuses: pending=33, accepted=12, revoked=8, declined=2).
--   - CREATE UNIQUE INDEX IF NOT EXISTS is idempotent and touches no rows.
--   - Rows with phone IS NULL (email-only invitations) are excluded; the
--     email side keeps its own 00029 index, unchanged.
--   - Edge case: a phone containing no digits at all normalizes to '' and
--     two such rows in one group would collide. The admin UIs only write
--     real numbers, so this is theoretical; the preflight would surface any
--     existing pair.
--
-- VERIFICATION (run after applying)
--   SELECT indexdef FROM pg_indexes
--   WHERE schemaname = 'public'
--     AND indexname = 'invitations_group_phone_active_unique';
--     -- expect the partial UNIQUE index with the regexp_replace expression
--     -- and the WHERE status IN ('pending', 'accepted') AND phone IS NOT
--     -- NULL predicate
--   -- Then: INSERT a second pending invitation with the same group_id and
--   -- the same phone digits (any formatting) -> expect SQLSTATE 23505.
--   -- And: re-invite a phone whose previous invitation is 'revoked' ->
--   -- expect success (terminal rows sit outside the partial index).
--
-- ROLLBACK
--   DROP INDEX IF EXISTS public.invitations_group_phone_active_unique;
--   -- Touches no rows; reverts to pre-guard behavior (duplicate active
--   -- phone invitations possible again). The 00029 email index is
--   -- unaffected either way.

-- ── Preflight: no duplicate active (group_id, digits) pair may exist ───────
DO $$
DECLARE
  v_dupes integer;
BEGIN
  SELECT count(*) INTO v_dupes
  FROM (
    SELECT group_id, regexp_replace(phone, '\D', '', 'g') AS digits
    FROM public.invitations
    WHERE phone IS NOT NULL
      AND status IN ('pending', 'accepted')
    GROUP BY group_id, regexp_replace(phone, '\D', '', 'g')
    HAVING count(*) > 1
  ) dupes;
  IF v_dupes > 0 THEN
    RAISE EXCEPTION
      'preflight failed: % duplicate (group_id, phone-digits) pairs exist among active phone invitations — resolve them manually (revoke the extras) before applying; this migration performs no automatic dedupe',
      v_dupes;
  END IF;
END;
$$;

-- ── Partial unique index: the phone twin of 00029's email index ────────────
CREATE UNIQUE INDEX IF NOT EXISTS invitations_group_phone_active_unique
  ON public.invitations (group_id, (regexp_replace(phone, '\D', '', 'g')))
  WHERE status IN ('pending', 'accepted') AND phone IS NOT NULL;
