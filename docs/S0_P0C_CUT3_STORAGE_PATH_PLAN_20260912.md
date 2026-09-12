# S0 P0-C Cut 3 — Storage path fail-closed boundary (PLANNING ONLY)

**Date:** 2026-09-12  
**Status:** **PLANNING ONLY — READY FOR DAYBREAK REVIEW**  
**Implementation:** **NOT AUTHORIZED**. This PR must not be treated as permission to author or apply `00116`.  
**This PR:** docs / evidence only. **No** `00116` SQL. **No** application code. **No** edits to `00001`–`00115`. **No** Cut 2 / `notifications_queue` files.  
**Production mutation:** **ZERO**. This task did not query live SQL, list objects, or touch Storage.  
**Overall recommended verdict (planning):** **PASS to implement later on a dedicated branch only**, after Daybreak review. PASS here authorizes **implementation planning acceptance**, **NOT** production apply.

**Primary question (answered):** Are `group-documents` / `receipts` **INSERT** (and the same-boundary **UPDATE** / **DELETE**) fail-open when the path parser returns NULL?  
**Answer:** **YES — CONFIRMED.** Live write policies allow the row when `storage_path_group_id(name) IS NULL`. UUID-first paths (the live receipts majority and a live group-documents minority) are unparsed by v1. Invalid UUID under a listed prefix raises `22P02` instead of FALSE.

**Chosen parser strategy:** **B** — single boolean helper: valid frozen grammar **AND** authorized. Invalid / NULL / extra / ambiguous / exception ⇒ **FALSE**. Justify in R3.

---

## Pins (do not drift)

| Pin | Value |
|-----|-------|
| Planning base / branch HEAD | `1f1221eeb9207b692a7e507ae95acfc9aabac113` (ancestor/tip of `main`; PR #78 Cut 2 merge) |
| Repo | `https://github.com/gatekipa/villageclaq` |
| Planning branch | `planning/s0-p0c-cut3-storage-insert-20260912` |
| Live project | `llbnliixczcqfftxpsmb` — migrations **30** |
| Cut 1 CLOSED prod | version `20260911183755` name `s0_p0a_cut1_active_authorization` — **DO NOT MODIFY** |
| Cut 2 | `00115_s0_p0b_cut2_notification_queue.sql` + queue/drain — **DO NOT TOUCH** |
| Future migration **name only** | `00116_s0_p0c_cut3_storage_path_fail_closed.sql` — **DO NOT CREATE IN THIS PR** |
| Authoritative live predicates | Chief inventory below — **do not invent different live SQL** |
| Storage schema apply path | Dashboard-only (same constraint as `00112`) — MCP/service role cannot modify `storage` |

### Evidence (this PR)

- `docs/evidence/S0_CUT3_STORAGE_LIVE_POLICY_INVENTORY_20260912.json`
- `docs/evidence/S0_CUT3_STORAGE_BUCKET_MATRIX_20260912.json`
- `docs/evidence/S0_CUT3_STORAGE_PATH_GRAMMAR_MATRIX_20260912.json`
- `docs/evidence/S0_CUT3_STORAGE_CALLER_INVENTORY_20260912.json`
- `docs/evidence/S0_CUT3_STORAGE_TRUTH_TABLE_20260912.json`

Unknown **upload** callers: **0**. No HOLD.

---

## R1 — Primary question and proven fail-open

Cut 3 exists because write RLS on the two private group buckets is **fail-open on parse miss**.

Chief-confirmed INSERT `WITH CHECK` for `gdocs_insert_group` and `receipts_insert_group`:

```
((storage_path_group_id(name) IS NOT NULL) AND is_group_member(storage_path_group_id(name)))
OR (storage_path_group_id(name) IS NULL)
```

**NULL parse ⇒ ALLOW INSERT for any `authenticated` user.**

That is not a theoretical gap:

1. Live v1 only returns a UUID when `foldername[1]` is one of `logos`, `relief-claims`, `constitutions`, `minutes`, `dispute-docs`.
2. Live receipts objects: **3 / 3** are **2-seg UUID-first** → v1 **NULL** → INSERT/UPDATE/DELETE fail-open.
3. Live group-documents: **5 / 25** are **2-seg UUID-first** → same.
4. Caller code at `1f1221e` **intentionally writes** those UUID-first keys (`pay-now-dialog`, `contributions/record`, `documents` vault).
5. Prefix `projects/` is not in the v1 list → v1 **NULL** → fail-open for project attachments.

Repo ancestry `00078` used `storage.path_group_id` with the same `OR IS NULL` fallback, documented as “legacy / projects / authenticated-only.” **Live** helper name is `public.storage_path_group_id`. Chief is authoritative for the live name and body.

---

## R2 — Target: FAIL CLOSED

After Cut 3, for `receipts` and `group-documents` **INSERT / UPDATE / DELETE**:

| Condition | Decision |
|-----------|----------|
| Parser / grammar miss (NULL) | **DENY** |
| Segment is not a regex-guarded UUID where a UUID is required | **DENY** as **FALSE** — never `::uuid` exception (`22P02`) |
| Missing segment vs frozen arity | **DENY** |
| Extra segment vs frozen arity | **DENY** |
| Ambiguous / unknown prefix | **DENY** (exact `foldername[1]` equality only) |
| Canonical grammar + authorized | **ALLOW** |
| Unauthenticated | **DENY** (policies stay `TO authenticated`) |

**No** `OR parse IS NULL` on write policies.  
**No** “any authenticated” write fallback for `projects/` or garbage keys.

---

## R3 — Parser strategy (choose B)

### Strategy A (rejected as the *policy* shape)

```
storage_path_group_id_safe(name) IS NOT NULL
AND <auth>(storage_path_group_id_safe(name))
```

Correct **if** the parser never throws and policies never re-add `OR IS NULL`. History is exactly that fallback. A is acceptable **inside** a helper, not as six copy-pasted policy clauses.

### Strategy B (FROZEN)

One (or two, by op) **boolean** helper(s), `SECURITY DEFINER`, `SET search_path TO ''`:

```
public.storage_group_object_write_allowed(p_name text, p_op text) RETURNS boolean
```

`p_op` ∈ `{insert, update, delete}`.  
Returns **TRUE** only when:

1. `p_name` matches **exactly one** frozen grammar (R5) with regex-guarded UUIDs and exact arity; **and**
2. The resolved `group_id` is authorized for that op (R8).

Otherwise **FALSE**. Never raises.

**Why B**

- Fail-closed is the default return, not an afterthought `IS NOT NULL`.
- Invalid UUID cannot throw inside a policy (v1 `22P02` is proven).
- `projects/{projectId}/…` can resolve `group_id` from `public.projects` without pretending `projectId` is `groupId`.
- Six policies become `bucket_id = '…' AND storage_group_object_write_allowed(name, 'insert'|'update'|'delete')` — no place to re-insert `OR IS NULL`.
- SELECT keeps using **v2 + existing predicate** (R7). Do **not** reuse a write boolean for SELECT in this cut.

Internal implementation may parse-then-auth (A-inside-B). The **policy contract** is B.

---

## R4 — Live helpers (Chief — do not invent)

### `public.storage_path_group_id(p_name text) RETURNS uuid`

- `IMMUTABLE` SQL. **Not** security definer. **No** `search_path` pin.
- Body (Chief verbatim):

```
CASE WHEN (storage.foldername(p_name))[1] IN
  ('logos','relief-claims','constitutions','minutes','dispute-docs')
THEN NULLIF((storage.foldername(p_name))[2], '')::uuid
ELSE NULL END
```

- UUID-first paths → **NULL**.
- `logos/…/not-a-uuid` → **ERROR 22P02** (proven).

### `public.storage_path_group_id_v2`

- Regex-guards UUID; also accepts UUID-first segment.
- **SELECT only** today.
- Repo definition: `00112_storage_select_policy_hardening.sql` at this SHA. Cut 3 must not invent a different live v2.

### Stock

`storage.foldername` / `filename` / `extension` — do not reimplement.

### Membership

| Helper | Live (Chief) | Cut 3 use |
|--------|----------------|-----------|
| `is_group_member(gid, uid default auth.uid())` | SECURITY DEFINER, **status-blind** (any membership row), **no** empty `search_path` pin | **Keep for SELECT only.** Do not rewrite the body (Cut 1 freeze). |
| `is_active_group_member(gid)` | Cut 1, active-only, `search_path ''` | **Preferred for member writes** |
| `is_group_admin` | Active owner/admin only, `search_path ''` | **Deletes** (already live when parse works) + admin-only workflows (constitution, projects) |

---

## R5 — Canonical path grammars (from code — do not invent)

Frozen at SHA `1f1221e`. Machine copy: `S0_CUT3_STORAGE_PATH_GRAMMAR_MATRIX_20260912.json`.

| ID | Bucket | Pattern (arity) | Group id source |
|----|--------|-----------------|-----------------|
| G-RECEIPT-UUID-FIRST | receipts | `{groupId}/{ts}-{filename}` (2) | seg1 |
| G-DISPUTE-DOCS | receipts | `dispute-docs/{groupId}/{membershipId}/{ts}-{filename}` (4) | seg2 |
| G-GDOCS-UUID-FIRST | group-documents | `{groupId}/{ts}-{filename}` (2) | seg1 |
| G-MINUTES | group-documents | `minutes/{groupId}/{ts}-{filename}` (3) | seg2 |
| G-CONSTITUTIONS | group-documents | `constitutions/{groupId}/{ts}-{filename}` (3) | seg2 |
| G-RELIEF-CLAIMS | group-documents | `relief-claims/{groupId}/{membershipId}/{ts}-{filename}` (4) | seg2 |
| G-PROJECTS-PROJECTID-FIRST | group-documents | `projects/{projectId}/{ts}-{filename}` (3) | **`projects.group_id` lookup** — `projectId` ≠ `groupId` |
| G-AVATAR-UID-FIRST | avatars | `{userId}/{ts}.{ext}` (2) | n/a (uid policy) |
| G-GROUP-LOGOS-ON-AVATARS | avatars | `group-logos/{groupId}/{ts}-{filename}` (3) | n/a (avatars; **not** v1 token `logos`) |

**Parser-only token `logos`:** listed in v1/v2. **No current caller** writes `logos/{groupId}/…`. Do not invent a writer. Do not `LIKE 'logo%'` (would collide with `group-logos`).

**Projects:** table `public.projects.group_id` exists (`00010_stickiness_features.sql`). Fail-closed without this lookup **breaks** admin project uploads (R26). Looking up the existing path is **not** a new grammar and **not** an object rename (R14).

---

## R6 — Bucket matrix

| Bucket | public | size | mime | Cut 3 writes |
|--------|--------|------|------|----------------|
| avatars | true | 2 MiB | jpeg/png/webp | **NOT AFFECTED** (inventory only) |
| group-documents | false | 10 MiB | null | **IN SCOPE** INSERT/UPDATE/DELETE |
| receipts | false | 5 MiB | jpeg/png/webp/pdf | **IN SCOPE** INSERT/UPDATE/DELETE |

No other buckets in Chief inventory or repo callers.

Do not flip `public`, mime, or size in Cut 3.

---

## R7 — SELECT posture (do not broaden; do not fail-close reads here)

Live SELECT (`receipts_select_group`, `gdocs_select_group`):

- Parser: **v2**
- Predicate: `(storage_path_group_id_v2(name) IS NULL) OR is_group_member(v2(name))`
- Role: `TO authenticated`

This still allows any authenticated read of **unparsed** keys (`projects/…`, garbage). That is the **existing read posture**. Cut 3 **must not**:

- switch SELECT to fail-closed (would break project attachment preview unless SELECT also gained the lookup — out of this cut);
- widen SELECT (no anon, no `OR true`);
- change avatars `"Anyone can view avatars"`.

**Write-hardening must be safer-or-unchanged for legitimate canonical reads.**  
UUID-first receipts/docs already parse on v2 — members who can read them today still can. Signing (`createSignedUrl` / `signedUrlFor`) stays on SELECT.

---

## R8 — UPDATE and DELETE are the same security boundary (IN SCOPE)

Chief: **INCLUDE in Cut 3**.

| Command | Live boundary | Fail-open when |
|---------|---------------|----------------|
| UPDATE | `NULL OR is_group_member(v1)` | v1 NULL |
| DELETE | `NULL OR is_group_admin(v1)` | v1 NULL |

Callers that need UPDATE: **upsert** on documents vault and constitution (`upsert: true`). Supabase upsert requires INSERT + SELECT + UPDATE.

Callers that DELETE objects: documents vault, projects attachments. Avatars removes are out of group-path scope.

After Cut 3, UUID-first DELETE is no longer available to every authenticated user — only `is_group_admin` of the parsed group (or project’s group).

---

## R9 — Active membership: per-workflow freeze

Do **not** blindly replace every `is_group_member` with `is_group_admin`. UI uses **position permissions**; many writers are not owner/admin.

| Workflow | UI evidence | Write RLS freeze |
|----------|-------------|------------------|
| Pay Now receipt (U01) | Any member; no PermissionGate | INSERT: **`is_active_group_member`**. Admin-only would break payers. |
| Record payment receipt (U02) | `finances.record` \| `finances.manage` | INSERT: **`is_active_group_member`**. Treasurer may not be owner/admin. |
| Dispute docs (U03) | Any member on My Fines | INSERT: **`is_active_group_member`** |
| Document vault (U04) | `documents.manage` | INSERT/UPDATE: **`is_active_group_member`** (RLS **floor**). UI stays `documents.manage`. Not `is_group_admin` (secretaries). DELETE: **`is_group_admin`** (already live when parse works). Non-admin `documents.manage` delete may fail — **R26**. |
| Minutes (U05) | `minutes.manage` | INSERT: **`is_active_group_member`** floor |
| Constitution (U06) | `useGroup().isAdmin` | INSERT/UPDATE: **`is_group_admin`** |
| Relief claim (U07) | Any member on My Relief | INSERT: **`is_active_group_member`** |
| Projects (U08/R02) | `isAdmin` | INSERT/DELETE: **`is_group_admin(projects.group_id)`** after lookup |
| Avatars (U09–U12, R03–R05) | self / `settings.manage` | **Unchanged uid policies** |

**Do not rewrite `is_group_member`.** SELECT continues to use it (status-blind), matching live SELECT.

Pending / exited users lose **writes** they only had via fail-open or status-blind member checks. That is intended alignment with Cut 1 for **operational writes**.

---

## R10 — Caller inventory complete

See `S0_CUT3_STORAGE_CALLER_INVENTORY_20260912.json`.

| Class | Count | Unknown |
|-------|-------|---------|
| Upload call sites | 12 | **0** |
| Remove call sites | 6 | **0** |
| Direct `createSignedUrl` | 8 | **0** |
| `signedUrlFor` displays | 2 | **0** |
| `download` | 1 | **0** |
| `getPublicUrl` (avatars only) | 4 | **0** |
| `createSignedUrls` / `move` / `copy` / `list` / storage `.update` | 0 | n/a |

**HOLD:** none.  
False positives excluded: `SendReviewContext "receipts"`; PostgREST `.update()`.

---

## R11 — Avatars classification

Write policies: `foldername[1] = auth.uid()::text`.  
Live objects: 6, all 2-seg, seg1 uuid-shaped.

**NOT AFFECTED** by group-path fail-open. Still inventoried.

`group-logos/{groupId}/…` (settings) does **not** satisfy the uid first-segment rule. Chief counts show **no** 3-seg avatar objects. Pre-existing caller/policy mismatch — **R26**. Cut 3 must **not** open avatars or rewrite this to `logos/` on `group-documents`.

---

## R12 — Future migration (name only)

**Filename (do not create now):** `00116_s0_p0c_cut3_storage_path_fail_closed.sql`

Expected **later** contents (planning, not authored):

1. Create `storage_group_object_write_allowed` (B) with regex-guarded grammars + projects lookup + `search_path ''`.
2. `DROP POLICY` / `CREATE POLICY` for the six gdocs/receipts write policies — fail-closed B predicate; `TO authenticated`.
3. **Do not** replace SELECT policies.
4. **Do not** replace avatars policies.
5. **Do not** `CREATE OR REPLACE` `is_group_member`.
6. **Do not** touch `notifications_queue` / `enqueue_outbound_notification` / `00115`.
7. Dashboard-only header (storage schema), re-runnable `DROP POLICY IF EXISTS` before each `CREATE POLICY` (same lesson as `00112`).
8. No `UPDATE storage.objects`. No bucket `public` flips.

---

## R13 — Live object shapes (sanitized)

| Bucket | n | Shapes |
|--------|---|--------|
| avatars | 6 | all 2-seg, seg1 uuid-shaped |
| group-documents | 25 | 5× 2-seg uuid-first; 20× 3-seg non-uuid-first |
| receipts | 3 | all 2-seg uuid-first |

No names, no filenames. Prefix breakdown of the 20× 3-seg gdocs objects was **not** provided — do not invent (`minutes` / `constitutions` / `projects` / `logos` are all 3-seg compatible). Implementation rehearsal classifies prefixes without logging object names.

---

## R14 — No data cleanup / rename / move

Cut 3 **must not**:

- rename, move, or delete existing objects;
- backfill paths to a new grammar;
- “fix” UUID-first objects by rewriting them to `category/{groupId}/…`.

Existing UUID-first keys become **correctly authorized** once B accepts that grammar. Existing `projects/{projectId}/…` objects stay; **writes** use lookup; **reads** stay on current SELECT.

---

## R15 — Invalid UUID is FALSE, not exception

v1 `NULLIF(seg,'')::uuid` is unsafe. Cut 3 write helper **must** regex-guard (same spirit as v2):

```
^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$
```

Guard and cast in the **same** branch. Disposable test: `logos/not-a-uuid/x` ⇒ policy **DENY**, SQLSTATE **not** `22P02`.

---

## R16 — Missing / extra / ambiguous segments

Arity is part of the grammar, not “best effort”:

- `minutes/{uuid}` with no file token → DENY  
- `minutes/{uuid}/a/b` → DENY  
- First segment both “looks like” a prefix via substring → DENY (equality only)

Membership UUID in relief/dispute paths is **shape-checked** (regex UUID). Cut 3 does **not** require `memberships.id` ownership match in RLS unless Daybreak adds it; UI already binds `currentMembership.id`. Cross-tenant attack is stopped by **group** authorization on seg2.

---

## R17 — Projects lookup (existing path, not a new path)

`projects/{projectId}/{file}` cannot use v1/v2 group parse.

B helper branch (frozen):

1. `foldername[1] = 'projects'` (exact);
2. `foldername[2]` regex UUID;
3. no extra folder segment;
4. `EXISTS (SELECT 1 FROM public.projects p WHERE p.id = <uuid> AND <auth>(p.group_id))`;
5. missing project → **FALSE**.

Do not add `projects` to v1’s unguarded `::uuid` list (would treat project id as group id — wrong allow or wrong deny).

---

## R18 — Collision / prefix safety

**Forbidden in 00116:**

- `name LIKE '%uuid%'`
- `name LIKE 'minutes%'` / `logo%` / `project%`
- `position('@' || name)` hacks
- Casting any segment that failed the regex

**Required:** `storage.foldername(p_name)[1] = '<token>'` or `IN (exact list)`.  
`logos` ≠ `group-logos`. `projects` ≠ `project`.

---

## R19 — Disposable RLS test matrix (writes)

Rehearse on a **disposable** project/branch DB. Never first-apply on prod. No real member names/files in logs.

Roles to seed: anon; authenticated no membership; active member G1; pending/exited G1; active owner/admin G1; active member G2; treasurer-equivalent active member (not admin) G1.

| # | Case | Expect |
|---|------|--------|
| D01 | Non-member INSERT `{G1}/{file}` on receipts | DENY |
| D02 | Active member G1 INSERT `{G1}/{file}` receipts | ALLOW |
| D03 | Active member G1 INSERT `{G2}/{file}` receipts | DENY |
| D04 | Pending/exited G1 INSERT `{G1}/{file}` | DENY |
| D05 | Anon INSERT any | DENY |
| D06 | INSERT `logos/not-a-uuid/x` | DENY, no `22P02` |
| D07 | INSERT `garbage/foo` | DENY |
| D08 | INSERT `minutes/{G1}/{file}` as active member | ALLOW |
| D09 | INSERT `minutes/{G1}/a/b` | DENY |
| D10 | INSERT `constitutions/{G1}/{file}` as non-admin member | DENY |
| D11 | INSERT `constitutions/{G1}/{file}` as admin | ALLOW |
| D12 | INSERT `relief-claims/{G1}/{mem}/{file}` active member | ALLOW |
| D13 | INSERT `dispute-docs/{G1}/{mem}/{file}` active member | ALLOW |
| D14 | INSERT `projects/{randomUuid}/{file}` | DENY |
| D15 | INSERT `projects/{existingProjectG1}/{file}` as admin G1 | ALLOW |
| D16 | Same as D15 as non-admin member G1 | DENY |
| D17 | UPDATE `{G1}/{file}` as non-member | DENY |
| D18 | UPDATE `{G1}/{file}` as active member (vault upsert) | ALLOW |
| D19 | DELETE `{G1}/{file}` as non-admin | DENY |
| D20 | DELETE `{G1}/{file}` as admin G1 | ALLOW |
| D21 | DELETE v1-NULL garbage path as authenticated | DENY (closes live fail-open delete) |
| D22 | Avatars INSERT `{ownUid}/x` | ALLOW (regression) |
| D23 | Avatars INSERT `{otherUid}/x` | DENY (regression) |
| D24 | Empty name INSERT | DENY |

---

## R20 — Disposable RLS test matrix (reads + upsert coupling)

| # | Case | Expect |
|---|------|--------|
| R01 | Active member G1 `createSignedUrl` on `{G1}/{file}` receipts | ALLOW (SELECT unchanged / v2) |
| R02 | Non-member `createSignedUrl` on `{G1}/{file}` | DENY if v2 parses (unchanged) |
| R03 | Authenticated `createSignedUrl` on `projects/{id}/{file}` | **Unchanged** — v2 NULL still allows authenticated SELECT |
| R04 | Anon SELECT private buckets | DENY (unchanged) |
| R05 | Constitution upsert (INSERT then UPDATE same key) as admin | both succeed |
| R06 | Documents upsert as active member | INSERT+UPDATE succeed; SELECT for sign succeeds |
| R07 | Avatars public SELECT | unchanged |
| R08 | Confirm SELECT policies still named `receipts_select_group` / `gdocs_select_group` with v2 + NULL OR member | no drift |

R03 is **not** a Cut 3 write bug. Closing project **reads** is a later cut.

---

## R21 — Helper / grant hygiene

Write helper(s):

- `SECURITY DEFINER`
- `SET search_path TO ''`
- Qualify `public.memberships`, `public.projects`, `storage.foldername`
- `REVOKE ALL FROM PUBLIC, anon`
- `GRANT EXECUTE TO authenticated` (policies run as invoker but call the helper)
- Do **not** grant to `anon`
- Do **not** put the helper in a shape that browsers can use to enumerate groups (boolean on a caller-supplied path only)

Do not change grants on `is_group_member` / Cut 1 helpers except to **call** them.

---

## R22 — Exception path is a defect

Any write policy that can surface `22P02` (or other cast errors) **fails Cut 3**. Disposable D06 is mandatory. Implementation must wrap the helper so unexpected errors are not required for deny (helper itself must not raise on bad text).

---

## R23 — Existing objects after apply

| Shape | Write after Cut 3 | Read after Cut 3 |
|-------|-------------------|------------------|
| UUID-first receipts/gdocs | member/admin per R8–R9 (no longer world-writable) | unchanged v2 member read |
| 3-seg category (`minutes` / `constitutions` / …) | same as today when v1 parsed, plus active/admin freeze | unchanged |
| `projects/{projectId}/…` | admin of looked-up group only | unchanged authenticated fallback |
| Unknown 3-seg prefix among the 20 | new writes DENY; UPDATE/DELETE DENY | unchanged if v2 NULL |
| Avatars 2-seg uid | unchanged | unchanged |

No cleanup job.

---

## R24 — Rollout sequence

1. **This PR:** Daybreak review of R1–R26. Docs only.
2. **After PASS:** dedicated implementation branch from latest `main` (not this planning branch).
3. Author `00116_s0_p0c_cut3_storage_path_fail_closed.sql` as **dashboard-only** reference SQL (do not `apply_migration` to prod from MCP).
4. Disposable DB: apply 00116, run R19–R20, record sanitized results.
5. Daybreak implementation PASS.
6. Operator pastes 00116 into **prod Dashboard SQL Editor** (storage schema).
7. Smoke: Pay Now, record payment, documents upsert, minutes, constitution, relief, project attach/delete, avatar upload, receipt `signedUrlFor`, Cut 2 drain still healthy.
8. **No** app path rewrite in the same change-set unless Daybreak rejects projects lookup (then a **separate** app PR — not a silent rename of live objects).

Cut 3 SQL-only is sufficient **if** B includes the projects lookup. That is the frozen default (R17) so UI is not lost (R26).

---

## R25 — Cut 2 non-regression

`00116` / Cut 3 implementation **must not**:

- edit `00115` or any `00001`–`00115` file;
- alter `notifications_queue`, `enqueue_outbound_notification`, drain cron, channel routers;
- change invitation `redirectTo` / onboarding redirect / SMS Africa-only rules.

Static proof later: `git diff` file list ⊆ new `00116` + optional later tests. This planning PR already touches **only** `docs/**`.

---

## R26 — UI / UX TRACKED / NOT LOST

Every current storage UX is listed. Cut 3 must not drop a workflow without an explicit Daybreak exception.

| UX | After fail-closed writes | Lost? |
|----|--------------------------|-------|
| Member Pay Now receipt | Active member, UUID-first grammar | **Kept** |
| Officer record-payment receipt | Active member floor; `finances.*` UI | **Kept** (not admin-only RLS) |
| Dispute attachment | Active member, `dispute-docs/…` | **Kept** |
| Document vault upload/upsert | Active member floor; `documents.manage` UI | **Kept** |
| Document vault delete | `is_group_admin` (already live when parsed) | **Tracked:** `documents.manage` non-admin may already fail object delete; fail-open UUID-first delete **closes** |
| Document download / sign | SELECT unchanged | **Kept** |
| Minutes attachment | Active member floor; `minutes.manage` UI | **Kept** |
| Constitution file + upsert | `is_group_admin` | **Kept** for admins; **tighter** than live member-parse (UI was already admin) |
| Relief claim doc | Active member | **Kept** |
| Project attach/delete | Lookup + `is_group_admin` | **Kept** for admins; **not** lost if R17 ships in 00116 |
| Receipt history / my-payments viewers | `signedUrlFor` + SELECT | **Kept** |
| Avatar photo upload/remove | Unchanged | **Kept** |
| Group logo in settings | Unchanged avatars policy; path `group-logos/…` already mismatches uid rule; **0** live 3-seg avatar objects | **Tracked pre-existing** — not a Cut 3 regression; do not “fix” by opening group-path writes |
| Translated `uploadFailed` | Storage RLS deny still maps to existing client errors | **Kept** (no raw SQL in UI) |

If Daybreak rejects the projects lookup, project upload/delete becomes a **known break** and this R26 row must be re-opened as HOLD before apply.

---

## Out of scope (explicit)

- Cut 2 / notification queue / `00115`
- Cut 1 helper body of `is_group_member`
- SELECT fail-closed / cross-tenant read of unparsed keys
- Avatars policy redesign / group-logo path repair
- Object migration, filename normalization, MIME/size changes
- App code path rewrites
- Authoring or applying `00116`
- Production SQL / Storage API

---

## Success criteria for **this** PR

- [x] Branch from `1f1221eeb9207b692a7e507ae95acfc9aabac113`
- [x] Docs + evidence only
- [x] Full R1–R26
- [x] Unknown upload callers = 0
- [x] UPDATE/DELETE included as same boundary
- [x] Strategy B frozen
- [x] Draft PR: PLANNING ONLY; NO IMPLEMENTATION; NO 00116; production mutation ZERO; Daybreak review next

---

## Recommended Daybreak checklist

1. Confirm fail-open INSERT/UPDATE/DELETE as stated (Chief).  
2. Accept Strategy B + projects lookup (or formally HOLD projects UX).  
3. Accept per-workflow active-member vs admin table (R9).  
4. Confirm SELECT left alone.  
5. Confirm avatars out of write scope.  
6. Authorize a **later** implementation PR to create `00116` — not this PR.
