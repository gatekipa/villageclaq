-- 00083: Final-pass hardening
-- ---------------------------------------------------------------------------
-- Closes the last four open audit items:
--   1. storage.buckets.public flip for receipts + group-documents
--      (DASHBOARD-ONLY — the MCP service role cannot modify storage.buckets,
--      so this block must be copy-pasted into the Supabase Dashboard SQL
--      Editor by an operator with storage_owner permission).
--   2. get_org_transfers(organization_id) — HQ admins can see every
--      transfer across every branch in the org.
--   3. notifications.dedup_key column + supporting index — replaces the
--      locale-fragile `title LIKE` dedup pattern in subscription-reminders
--      with an explicit key column.
--   4. (No schema change needed for Items 3/7 — they are UI / assessment.)

-- ---------------------------------------------------------------------------
-- ██ DASHBOARD-ONLY BLOCK ██
-- ---------------------------------------------------------------------------
-- The MCP service role does not have privileges on storage.buckets. Run the
-- following by hand via the Supabase Dashboard SQL Editor (or via the
-- storage API with an operator key). Nothing below this comment block runs
-- from `apply_migration`.
--
--   UPDATE storage.buckets SET public = false WHERE id IN ('receipts', 'group-documents');
--   SELECT id, public FROM storage.buckets WHERE id IN ('avatars', 'receipts', 'group-documents');
--   -- Expected: avatars public=true, receipts public=false, group-documents public=false.
--
-- Once flipped, all client-side code in this repo will sign URLs via
-- createSignedUrl. Pre-existing rows that stored a public URL in
-- payments.receipt_url / documents.file_url / groups.logo_url etc. may
-- need admin re-upload — src/lib/storage-urls.ts::normaliseObjectPath
-- can extract the bare object key from a legacy public URL for display
-- code that wants to regenerate on demand.
--
-- Group logos live in the `avatars` bucket after 00083 (intentional
-- public branding) — no legacy-URL backfill needed for NEW uploads.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Item 2: HQ org-wide transfer view
-- ---------------------------------------------------------------------------
-- Filters member_transfers by organization_id via both source and
-- destination group joins, so an HQ admin sees branch-to-branch
-- transfers that don't directly involve HQ. Gated by HQ-admin check
-- or platform_staff.
CREATE OR REPLACE FUNCTION public.get_org_transfers(p_organization_id uuid)
RETURNS SETOF public.member_transfers
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM memberships m
    JOIN groups g ON g.id = m.group_id
    WHERE g.organization_id = p_organization_id
      AND g.group_level = 'hq'
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'admin')
      AND m.membership_status = 'active'
  ) AND NOT is_platform_staff() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT mt.*
  FROM member_transfers mt
  JOIN groups src ON src.id = mt.source_group_id
  JOIN groups dst ON dst.id = mt.dest_group_id
  WHERE src.organization_id = p_organization_id
     OR dst.organization_id = p_organization_id
  ORDER BY mt.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_transfers(uuid)
  TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Item 4: notifications.dedup_key
-- ---------------------------------------------------------------------------
-- Replaces the `title LIKE '%subscription%expir%'` dedup in
-- /api/cron/subscription-reminders, which only worked for EN+FR titles
-- and would miss a third locale silently. The new column is a stable
-- string key (e.g., "subscription_expiring_{groupId}_{daysLeft}") that
--'s locale-agnostic.
--
-- Partial index: only rows with a key are indexed, keeping the
-- existing index set cheap for the majority of notifications.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedup_key text;

CREATE INDEX IF NOT EXISTS idx_notifications_dedup
  ON public.notifications (user_id, dedup_key)
  WHERE dedup_key IS NOT NULL;
