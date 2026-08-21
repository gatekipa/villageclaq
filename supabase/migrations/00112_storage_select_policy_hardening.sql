-- 00112: Storage SELECT-policy hardening (Phase 0B)
--
-- ██ DASHBOARD-ONLY — DO NOT RUN VIA apply_migration ██
-- The MCP/service role cannot modify the `storage` schema. This file is
-- version-controlled reference SQL: an operator must copy-paste it into the
-- Supabase Dashboard SQL Editor AFTER explicit approval. Nothing in the
-- application depends on it being applied to run, but until it is applied the
-- gap below stays open.
--
-- ── The gap ────────────────────────────────────────────────────────────────
-- 00078 group-scoped the INSERT/UPDATE/DELETE storage policies and 00083
-- flipped `receipts` + `group-documents` to private (public=false, verified
-- live 2026-08-20), migrating the app to createSignedUrl(). But the read
-- side was left as flagged follow-up: the live SELECT policies
--   "Anyone can view receipts"          (roles: PUBLIC, qual: bucket only)
--   "Anyone can view group documents"   (roles: PUBLIC, qual: bucket only)
-- let ANY caller — anon key included — list, download, and sign objects
-- across every group in both private buckets. This closes that.
--
-- ── Behaviour after applying ───────────────────────────────────────────────
-- * receipts / group-documents reads require an authenticated caller AND
--   membership in the group encoded in the object path (createSignedUrl
--   checks SELECT, so signing keeps working for group members).
-- * Path shapes covered: `{groupId}/…` (pay-now + record-payment receipts,
--   documents page) and `{category}/{groupId}/…` (minutes, constitutions,
--   relief-claims, dispute-docs, logos).
-- * `projects/{projectId}/…` and other non-group-derivable legacy paths fall
--   back to any-authenticated — same acknowledged gap as the 00078 write
--   policies, kept to avoid breaking the projects feature.
-- * avatars stays public-read ("Anyone can view avatars" untouched) — the
--   bucket is public by design (profile avatars + group logos render via
--   getPublicUrl in the UI).

-- BEGIN DASHBOARD-ONLY BLOCK ------------------------------------------------

-- Helper v2: like public.storage_path_group_id() but ALSO recognises the
-- bare `{groupId}/…` shape used by receipt and document uploads (the v1
-- helper only parsed `{category}/{groupId}/…`). Kept as a separate function
-- so the existing 00078 write policies are not silently retightened in the
-- same change.
--
-- Both branches match the UUID pattern BEFORE casting. The v1 helper casts
-- the second segment unguarded, so a key like `minutes/not-a-uuid/file.pdf`
-- raises 22P02 (invalid input syntax for type uuid) instead of returning
-- NULL — inside a policy predicate that surfaces as a query error rather
-- than a clean authorization decision. v2 returns NULL for any segment that
-- is not a well-formed UUID, so such keys fall through to the
-- authenticated-only branch instead of erroring.
CREATE OR REPLACE FUNCTION public.storage_path_group_id_v2(p_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN (storage.foldername(p_name))[1] IN ('logos', 'relief-claims', 'constitutions', 'minutes', 'dispute-docs')
     AND (storage.foldername(p_name))[2] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN (storage.foldername(p_name))[2]::uuid
    WHEN (storage.foldername(p_name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN (storage.foldername(p_name))[1]::uuid
    ELSE NULL
  END;
$$;

-- Receipts: drop the open read policies, add group-member-scoped SELECT.
DROP POLICY IF EXISTS "Anyone can view receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view receipts" ON storage.objects;
DROP POLICY IF EXISTS "receipts_select_group" ON storage.objects;

CREATE POLICY "receipts_select_group" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      storage_path_group_id_v2(name) IS NULL -- legacy/non-standard paths: authenticated only
      OR is_group_member(storage_path_group_id_v2(name))
    )
  );

-- Group documents: same treatment.
DROP POLICY IF EXISTS "Anyone can view group documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view group documents" ON storage.objects;
DROP POLICY IF EXISTS "gdocs_select_group" ON storage.objects;

CREATE POLICY "gdocs_select_group" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'group-documents'
    AND (
      storage_path_group_id_v2(name) IS NULL -- projects/{projectId}/… and legacy shapes
      OR is_group_member(storage_path_group_id_v2(name))
    )
  );

-- Verification (run after applying):
--   SELECT polname, polcmd, ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(polroles))
--   FROM pg_policy WHERE polrelid = 'storage.objects'::regclass ORDER BY polname;
-- Expected: no "Anyone can view receipts" / "Anyone can view group documents";
-- receipts_select_group + gdocs_select_group scoped TO authenticated;
-- "Anyone can view avatars" still present.

-- END DASHBOARD-ONLY BLOCK --------------------------------------------------
