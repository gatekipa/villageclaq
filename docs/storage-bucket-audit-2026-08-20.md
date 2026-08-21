# Storage Bucket Audit — Phase 0B (2026-08-20)

## Live bucket state (verified read-only against project `llbnliixczcqfftxpsmb`)

| Bucket | public | Size limit | Allowed MIME | Required posture | Status |
|---|---|---|---|---|---|
| `receipts` | **false** | 5 MB | jpeg, png, webp, pdf | private, signed URLs | ✅ matches |
| `group-documents` | **false** | 10 MB | (any) | private, group-authorized | ✅ matches |
| `avatars` | **true** | 2 MB | jpeg, png, webp | public (UI uses `getPublicUrl`) | ✅ matches |

All three buckets already exist — **no bucket provisioning is needed**. The
`receipts`/`group-documents` public→private flip was done by migration 00083
(dashboard block) and is live. Note: the CLAUDE.md "Supabase Storage Buckets"
section still describes all three buckets as public — receipts and
group-documents have been private since 00083.

## Code paths per bucket (audited 2026-08-20)

**`receipts`** — always `createSignedUrl` (via `signedUrlFor`/direct), never
`getPublicUrl`:
- `src/components/payments/pay-now-dialog.tsx` — upload `{groupId}/{ts}-{name}`
- `src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx` — upload `{groupId}/{ts}-{name}`
- `src/app/[locale]/(dashboard)/dashboard/my-fines/page.tsx` — upload `dispute-docs/{groupId}/{membershipId}/…`
- `src/app/[locale]/(dashboard)/dashboard/contributions/history/page.tsx`, `…/my-payments/page.tsx` — display via `signedUrlFor(supabase, "receipts", …)`
- Helper: `src/lib/storage-urls.ts` (`signedUrlFor`, `normaliseObjectPath`)

**`group-documents`** — always `createSignedUrl`:
- `…/documents/page.tsx` — upload `{groupId}/{ts}-{name}`, signed download
- `…/minutes/page.tsx` — upload `minutes/{groupId}/…`
- `…/constitution/page.tsx` — upload `constitutions/{groupId}/…`
- `…/relief/my/page.tsx` — upload `relief-claims/{groupId}/{membershipId}/…`
- `…/projects/page.tsx` — upload `projects/{projectId}/…` (⚠ not group-derivable)

**`avatars`** — public by design, `getPublicUrl`:
- `…/my-profile/page.tsx`, `…/onboarding/member/page.tsx`, `…/onboarding/group/page.tsx` — upload `{userId}/{ts}.{ext}`
- `…/settings/page.tsx` — group logos `group-logos/{groupId}/…` (intentional public branding, per 00083)

## RLS policy state on `storage.objects` (live)

Write side (from 00078) is correctly scoped:
- `avatars_insert_own/update_own/delete_own` — path must start with `auth.uid()`
- `receipts_*_group`, `gdocs_*_group` — group member (writes) / group admin (deletes) via `storage_path_group_id()`

**Read side has a gap (the one Phase 0B remediates):**
- `"Anyone can view receipts"` and `"Anyone can view group documents"` are
  SELECT policies with an **empty role list (= PUBLIC, anon included)** and a
  bucket-only predicate. The buckets being private stops public CDN URLs, but
  any API caller can still list/download/sign any group's receipts and
  documents across tenants. 00078 flagged this as follow-up; 00083 closed the
  public-URL half only.
- `"Anyone can view avatars"` — correct as-is (public bucket by design).

## Remediation (prepared, NOT applied — dashboard-only, needs approval)

`supabase/migrations/00112_storage_select_policy_hardening.sql`:
1. Adds `public.storage_path_group_id_v2()` — parses both `{category}/{groupId}/…`
   and the bare `{groupId}/…` shape receipts/documents actually use.
2. Drops the two open SELECT policies.
3. Adds `receipts_select_group` / `gdocs_select_group` — `TO authenticated`,
   group-membership-scoped, with the same authenticated-only fallback for
   non-group-derivable paths (`projects/…`, legacy) as the 00078 write
   policies.
4. Leaves `"Anyone can view avatars"` untouched.

`createSignedUrl` checks SELECT permission, so group members keep working;
non-members and anon lose access. **The storage schema cannot be modified by
the MCP role — an operator must paste the block into the Dashboard SQL Editor
after approving it.**

## Static checks

`npm run test:storage-buckets` (`scripts/test-storage-buckets.mjs`) proves:
- the three buckets are documented (this file) and referenced by the expected
  upload paths;
- receipts/group-documents call-sites never use `getPublicUrl`;
- avatars display uses `getPublicUrl` (public bucket contract);
- 00112 exists, drops the open read policies, scopes the new ones
  `TO authenticated`, and does not touch the avatars read policy;
- no migration re-marks receipts/group-documents as `public: true`;
- `storage-urls.ts` logs no secrets/full URLs beyond bucket + object key.
