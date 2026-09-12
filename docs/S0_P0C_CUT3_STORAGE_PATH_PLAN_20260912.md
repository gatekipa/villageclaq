# S0 P0-C Cut 3 — Storage path fail-closed boundary (PLANNING ONLY)

**Date:** 2026-09-12  
**Revision:** **CONTRACT REVISION 3** (closes Daybreak blockers A–G only)  
**Status:** **PLANNING ONLY — READY FOR DAYBREAK RE-REVIEW**  
**Implementation:** **NOT AUTHORIZED**. This PR must not be treated as permission to author or apply `00116`.  
**This PR (#79):** docs / evidence only. **No** `00116` SQL. **No** application / test / migration code. **No** edits to `00001`–`00115`. **No** Cut 2 / `notifications_queue` files. **Keep DRAFT OPEN UNMERGED.**  
**Production mutation:** **ZERO**. This task did not query live SQL, list objects, or sign/download private objects.  
**Previous planning SHA (parent — must be ancestor):** `c3eccaa63b63f3c1517306a12c6a2bd31aee7149`  
**Base main:** `1f1221eeb9207b692a7e507ae95acfc9aabac113`

**UI/UX EXCELLENCE TRACK: ACTIVE / DEFERRED BY S0 GATE, NOT CANCELLED.**  
Next UX gate: **ASTRA** fresh design-system + IA review. **No UI work now.**

---

## Contract Revision 3 — Daybreak A–G closeout (this revision)

Rev 2 A–H architecture **stays passed**. This revision closes **only** A–G below. Do not reopen helpers, 8-policy scope, SELECT fail-closed, UPDATE USING+WITH CHECK, avatars OOS, or v1/v2 keep-but-deauthorize unless live evidence requires.

| Blocker | Close |
|---------|--------|
| **A LOGOS** | Live proven on `group-documents`: `logos_prefix=6`, `logos_canonical=6` (3-seg, seg2 uuid), `logos_other=0`. Total gdocs `25 = 6 logos + 14 constitutions + 5 uuid-first`. Freeze **G-LOGOS** `logos/{groupId}/{file}`. Tenant: `groupId` → `groups.id`. SELECT/signed-url: `is_group_member(groupId)`; cross-tenant **DENY**; NULL/malformed/unknown **DENY**. WRITE caller: **NO** (settings writes avatars `group-logos/{groupId}/…`, not gdocs `logos/`). DELETE caller: **NO**. Do **not** invent write. Do **not** mutate objects. Live 6 remain readable/signable. Tests: `T-LOGOS-01..04`, `LOGOS-SIGN-01..03`. |
| **B U02** | Chief code at `1f1221ee`: U01 and U02 share `${groupId}/${Date.now()}-{name}` on receipts. **Shared UUID-first is NOT acceptable.** Class A: U01 **OLD/KEEP** `{groupId}/{ts}-{filename}` → INSERT `is_active_group_member`. U02 **NEW** `finance-record/{groupId}/{ts}-{filename}` → INSERT `has_group_permission(gid,'finances.record') OR has_group_permission(gid,'finances.manage')`; ordinary active member **DENY**. Later implementation changes **U02 caller path only** (planning freeze now). Historical UUID-first: SELECT `is_group_member`; **no rename/move**. U02 upsert without finance perms **DENY** (`UPS-10`). |
| **C U03/U07** | U03 `dispute-docs/{groupId}/{currentMembership.id}/{ts}-{file}` receipts. U07 `relief-claims/{groupId}/{membershipId}/{ts}-{file}` gdocs, `membershipId=currentMembership.id`. Binding for INSERT (and SELECT of those objects where applicable): `memberships.id = path.membershipId AND memberships.user_id = auth.uid() AND memberships.group_id = path.groupId AND (writes: membership_status='active')`. Proxy/admin-on-behalf: **NONE**. Same-group other membership **DENY**; cross-group **DENY**; nonexistent/malformed membershipId **DENY**. RLS negatives: `U03-NEG-*`, `U07-NEG-*`. |
| **D Upsert** | Individual IDs `UPS-01`–`UPS-12`: authorized same-tenant ALLOW (U04/U06); cross-tenant existing/new **DENY**; malformed/unknown **DENY**; old-auth→new-unauthorized-tenant **DENY**; U02-path without finance **DENY**; membership-mismatch upsert **DENY**. |
| **E Encoding** | Every class has its own behavioral test ID + bucket + operation + path + actor + expected DENY + reason in `S0_CUT3_STORAGE_ENCODING_TEST_MATRIX_20260912.json`. **No** umbrella “malformed encodings deny”. Classes: leading/trailing/double slash, empty middle, empty filename, literal backslash, `%2F`, `%2f`, encoded backslash, `.`, `..`, encoded dot, encoded dot-dot, percent-encoded UUID, mixed-case prefix, extra/missing/single segment, Unicode slash lookalikes, unknown prefix. |
| **F/G Fingerprints** | Exact live `pg_get_expr` / `pg_get_functiondef` / md5 / ACL / grants / Cut 2 pin / helper absence embedded in `S0_CUT3_STORAGE_LIVE_CATALOG_FINGERPRINTS_20260912.json`. v1 md5 **fb6155e6e3c996ad857208f717d981a8** oid 38662. v2 md5 **585e7bd017f5623aacf87407b1b11524** oid 39616. Auth helpers: `is_active_group_member` **26c12399…**, `is_group_member` **4b1bbd54…**, `is_group_admin` **d4090a33…**, `has_group_permission` **69536846…**. New helpers **absent** live — `CUT3_ABORT` if present at apply. Cut 2 pin: version **`20260912033612`** name **`s0_p0b_cut2_notification_queue`** — do **not** rely only on count=30. |

---

## Daybreak A–H closeout (Revision 2 — passed, not reopened)

| Blocker | Close |
|---------|--------|
| **A** Scope | Cut 3 = **8** private policies: `group-documents` + `receipts` × SELECT/INSERT/UPDATE/DELETE. **No** `NULL` authorization on any of the eight. Signed-URL authority = SELECT. |
| **B** Projects | Canonical `projects/{projectId}/{file-or-approved-subpath}`. Security id = **project id** → `public.projects.id` → `projects.group_id` (uuid **NOT NULL**) → actor auth in **that** group. Never treat `projectId` as `groupId`. Missing project → **DENY**. |
| **C** Helpers | Unbound `(p_name, p_op)` **rejected**. Two **bucket-bound** helpers (R3). v1/v2 **kept**, **removed from policy authority**. |
| **D** Per-workflow | Exact auth for 12 uploads + 6 removes + 8 `createSignedUrl` sites. **SAFER-OR-UNCHANGED.** Writes = active-equivalent. SELECT does **not** silently force active-only. |
| **E** UPDATE | **USING (OLD) and WITH CHECK (NEW)** both fail-closed on both buckets. |
| **F** Signed URL | All signers inventoried. **Unknown = 0.** No privileged / `service_role` signing. Browser JWT + fail-closed SELECT is the authority. |
| **G** Encoding | Complete matrix (R18). Default **DENY** if the stored literal cannot prove canonical. Prefixes = exact lowercase. |
| **H** Tests / abort / UX / avatars | Disposable RLS as authenticated A/B on `storage.objects`. `CUT3_ABORT` fingerprints. UX track deferred, not cancelled. Avatars out of scope with proof. |

---

## Pins (do not drift)

| Pin | Value |
|-----|-------|
| Planning base / `main` | `1f1221eeb9207b692a7e507ae95acfc9aabac113` |
| Previous planning tip (must be ancestor) | `c3eccaa63b63f3c1517306a12c6a2bd31aee7149` |
| Repo | `https://github.com/gatekipa/villageclaq` |
| Planning branch / PR | `planning/s0-p0c-cut3-storage-insert-20260912` / DRAFT **#79** |
| Live project | `llbnliixczcqfftxpsmb` |
| Cut 1 CLOSED prod | version `20260911183755` name `s0_p0a_cut1_active_authorization` — **DO NOT MODIFY** |
| Cut 2 pin (exact) | version **`20260912033612`** name **`s0_p0b_cut2_notification_queue`**. If this pair is absent OR unexpected drift vs pin → **CUT3_ABORT / requalify**. Do **not** rely only on migrations count=30. `00115` + queue/drain — **DO NOT TOUCH** |
| Future migration **name only** | `00116_s0_p0c_cut3_storage_path_fail_closed.sql` — **DO NOT CREATE IN THIS PR** |
| `projects.group_id` | `uuid NOT NULL` (Chief + `00010`) |
| Trusted DEFINER helpers | `is_active_group_member`, `is_group_admin`, `has_group_permission` — **owner = postgres**, `search_path ''` |
| `is_group_member` | Legacy: SECURITY DEFINER, **status-blind**, **no** `search_path` pin — **SELECT historical reads only**; **never write floor** |

### Evidence

- `docs/evidence/S0_CUT3_STORAGE_LIVE_POLICY_INVENTORY_20260912.json`
- `docs/evidence/S0_CUT3_STORAGE_BUCKET_MATRIX_20260912.json`
- `docs/evidence/S0_CUT3_STORAGE_PATH_GRAMMAR_MATRIX_20260912.json`
- `docs/evidence/S0_CUT3_STORAGE_CALLER_INVENTORY_20260912.json`
- `docs/evidence/S0_CUT3_STORAGE_TRUTH_TABLE_20260912.json`
- `docs/evidence/S0_CUT3_STORAGE_SIGNED_URL_MATRIX_20260912.json`
- `docs/evidence/S0_CUT3_STORAGE_LIVE_CATALOG_FINGERPRINTS_20260912.json` **(Rev 3)**
- `docs/evidence/S0_CUT3_STORAGE_ENCODING_TEST_MATRIX_20260912.json` **(Rev 3)**

Unknown upload callers: **0**. Unknown signed-URL callers: **0**. No HOLD.

---

## R1 — Proven fail-open (writes **and** private SELECT)

Chief-reconfirmed **eight** live policies (all `PERMISSIVE`, `TO authenticated`):

| # | Name | Cmd | Live predicate (abbrev) | Fail-open |
|---|------|-----|-------------------------|-----------|
| 1 | `gdocs_select_group` | SELECT | `bucket='group-documents' AND (v2 IS NULL OR is_group_member(v2))` | **YES** — v2 NULL ⇒ any authenticated **read / sign** |
| 2 | `receipts_select_group` | SELECT | same, `receipts` + v2 | **YES** |
| 3 | `gdocs_insert_group` | INSERT | `bucket AND ((v1 IS NOT NULL AND is_group_member(v1)) OR v1 IS NULL)` | **YES** |
| 4 | `receipts_insert_group` | INSERT | same | **YES** |
| 5 | `gdocs_update_group` | UPDATE | **USING** `bucket AND (v1 IS NULL OR is_group_member(v1))`; **WITH CHECK currently NULL/absent** | **YES** + missing NEW check |
| 6 | `receipts_update_group` | UPDATE | same | **YES** + missing NEW check |
| 7 | `gdocs_delete_group` | DELETE | `bucket AND (v1 IS NULL OR is_group_admin(v1))` | **YES** |
| 8 | `receipts_delete_group` | DELETE | same | **YES** |

v1 = `storage_path_group_id(name)` (unguarded `::uuid`, category-only).  
v2 = `storage_path_group_id_v2(name)` (regex-guarded; UUID-first + five prefixes).  
Both **owner = postgres**, **not** SECURITY DEFINER.

UUID-first live objects (receipts 3/3, gdocs 5/25) are **NULL on v1** → write fail-open. They **parse on v2** → SELECT already membership-scoped when the UUID is well-formed. `projects/{projectId}/…` is **NULL on both** → SELECT **and** writes fail-open today.

`createSignedUrl` is a SELECT. Fail-closed SELECT is therefore **signed-URL authority**.

---

## R2 — Target: FAIL CLOSED on all eight

After Cut 3, for **both** private buckets and **all four** commands:

| Condition | Decision |
|-----------|----------|
| NULL / unknown / malformed / ambiguous path | **DENY** |
| Invalid UUID | **DENY FALSE** — never `22P02` |
| Missing / extra segment vs frozen arity | **DENY** |
| Encoding that cannot prove canonical (R18) | **DENY** |
| Canonical grammar + authorized for that op | **ALLOW** |
| Unauthenticated | **DENY** (`TO authenticated`) |

**No** `OR parse IS NULL` on SELECT, INSERT, UPDATE USING, UPDATE WITH CHECK, or DELETE.

---

## R3 — Bucket-bound helpers (unbound Strategy B **rejected**)

Daybreak rejected a single `storage_group_object_write_allowed(p_name, p_op)` used for both buckets.

### Frozen names and signatures (do not rename without repo-forced evidence)

```
public.storage_group_documents_authorized(p_name text, p_operation text) RETURNS boolean
public.storage_receipts_authorized(p_name text, p_operation text) RETURNS boolean
```

| Property | Freeze |
|----------|--------|
| SECURITY DEFINER | **YES** |
| OWNER | **exactly `postgres`** (matches live Cut 1 DEFINER helpers) |
| `SET search_path` | `TO ''` |
| Qualifiers | all `public.*` and `storage.*` refs fully qualified |
| `p_operation` | only `'select'`, `'insert'`, `'update'`, `'delete'` — else **FALSE** |
| `p_uid` / browser bucket arg | **FORBIDDEN** |
| Grammar | **that bucket only** — receipts helper must **FALSE** on `minutes/…`, `projects/…`, `constitutions/…`, `relief-claims/…`, `logos/…`; gdocs helper must **FALSE** on `dispute-docs/…` |
| Policies bind bucket | `bucket_id = 'group-documents'` or `'receipts'` as a **literal** in every policy. Helpers assume they are called only from the matching policy. Helpers **do not** take a browser-supplied bucket string. |
| EXECUTE PUBLIC | **REVOKE** |
| EXECUTE anon | **NO** |
| EXECUTE authenticated | **YES** |
| EXECUTE postgres | **YES** (owner) |
| EXECUTE service_role | **NO** — helpers exist only for RLS evaluated as `authenticated` Storage API. `service_role` bypasses RLS and must not become a boolean-oracle grant. No current signer uses service_role (R15). |

Returns **TRUE** only when:

1. `p_name` is a **canonical literal** for **that** bucket (R5 + R18); **and**
2. The resolved tenant (`group_id`, or `projects.group_id` for the projects grammar) is authorized for `p_operation` (R9).

Otherwise **FALSE**. Never raises.

### Target policy shape

```
-- SELECT
USING (bucket_id = '<bucket>' AND public.storage_<bucket>_authorized(name, 'select'))

-- INSERT
WITH CHECK (bucket_id = '<bucket>' AND public.storage_<bucket>_authorized(name, 'insert'))

-- UPDATE (BOTH required)
USING      (bucket_id = '<bucket>' AND public.storage_<bucket>_authorized(name, 'update'))
WITH CHECK (bucket_id = '<bucket>' AND public.storage_<bucket>_authorized(name, 'update'))

-- DELETE
USING (bucket_id = '<bucket>' AND public.storage_<bucket>_authorized(name, 'delete'))
```

`<bucket>` is the literal `group-documents` or `receipts`. Function name matches the bucket (`storage_group_documents_authorized` / `storage_receipts_authorized`).

### v1 / v2 disposition

- **KEEP** function definitions (do **not** `DROP` in 00116 by default).
- **REMOVE** from affected policy authority (none of the eight policies may call v1 or v2).
- CUT3_ABORT fingerprints v1+v2 exact `pg_get_functiondef` / md5 **before** replace (R23).

**Rev 3 — fingerprints FROZEN NOW** (not deferred). Apply **must** `CUT3_ABORT` if live `md5(pg_get_functiondef)` disagrees with these pins (do **not** rehash chat-normalized text):

| Object | Live md5(`pg_get_functiondef`) | oid / notes |
|--------|-------------------------------|-------------|
| `storage_path_group_id` | **`fb6155e6e3c996ad857208f717d981a8`** | oid **38662**; owner postgres; not DEFINER; proconfig empty; EXECUTE PUBLIC/anon/authenticated/service_role. Chief dump has CR after `$function$`. |
| `storage_path_group_id_v2` | **`585e7bd017f5623aacf87407b1b11524`** | oid **39616**; LF only, no CR. |
| `is_active_group_member` | **`26c12399120587df3d066dd7819bdf5e`** | DEFINER; `search_path ''`; acl postgres/authenticated/service_role X |
| `is_group_member` | **`4b1bbd54719c129ef12f0ebc53463686`** | DEFINER; **no** search_path pin; acl includes PUBLIC+anon |
| `is_group_admin` | **`d4090a33af3a873873223416c204c913`** | DEFINER; `search_path ''` |
| `has_group_permission` | **`695368464e97297fbf0f90ce7345162f`** | DEFINER; `search_path ''` |

Full `pg_get_functiondef` text + exact 8-policy `using_expr`/`with_check_expr` + `storage.objects` grants: `S0_CUT3_STORAGE_LIVE_CATALOG_FINGERPRINTS_20260912.json`.

Reconstructed CASE-only md5 `becf7835…` / repo `00112` md5 `84b5a5ad…` are **ancestry only** — not abort keys.

---

## R4 — Live membership helpers (Chief)

| Helper | Live | Cut 3 use |
|--------|------|-----------|
| `is_group_member(gid, uid default auth.uid())` | DEFINER, **status-blind**, **no** `search_path` pin | **SELECT only** (historical / existing read posture). **Never** write floor. |
| `is_active_group_member(gid)` | DEFINER, owner **postgres**, `search_path ''`, active-only | Member **writes** with no stronger UI permission |
| `is_group_admin(gid, uid default auth.uid())` | DEFINER, owner **postgres**, `search_path ''`, active owner/admin | Admin-only writes/deletes where UI is `isAdmin` / live delete already admin |
| `has_group_permission(gid, perm_key, uid default auth.uid())` | DEFINER, owner **postgres**, `search_path ''`, **active** membership + owner/admin-without-assignments/position key (mirrors `usePermissions()`) | Writes whose UI already uses that permission key |

Do **not** rewrite `is_group_member`.

---

## R5 — Canonical path grammars (from code)

| ID | Bucket | Pattern | Tenant source |
|----|--------|---------|---------------|
| G-RECEIPT-UUID-FIRST | receipts | `{groupId}/{file}` (arity 2) | seg1 uuid — **U01 KEEP only** |
| G-FINANCE-RECORD | receipts | `finance-record/{groupId}/{file}` (arity 3) | seg2 uuid — **U02 NEW** |
| G-DISPUTE-DOCS | receipts | `dispute-docs/{groupId}/{membershipId}/{file}` (arity 4) | seg2 uuid + **member-self bind** |
| G-GDOCS-UUID-FIRST | group-documents | `{groupId}/{file}` (arity 2) | seg1 uuid |
| G-MINUTES | group-documents | `minutes/{groupId}/{file}` (arity 3) | seg2 |
| G-CONSTITUTIONS | group-documents | `constitutions/{groupId}/{file}` (arity 3) | seg2 |
| G-RELIEF-CLAIMS | group-documents | `relief-claims/{groupId}/{membershipId}/{file}` (arity 4) | seg2 + **member-self bind** |
| G-PROJECTS | group-documents | `projects/{projectId}/{file-or-approved-subpath}` | **`projects.id` = projectId → `projects.group_id`** |
| G-LOGOS | group-documents | `logos/{groupId}/{file}` (arity 3) | seg2 uuid → `groups.id` — **SELECT only** |
| G-AVATAR-UID-FIRST | avatars | `{userId}/{file}` | out of scope |
| G-GROUP-LOGOS-ON-AVATARS | avatars | `group-logos/{groupId}/{file}` | out of scope |

**Approved projects subpath (from code, do not invent):** exactly one final file token: `{Date.now()}-{filename}` as written by `projects/page.tsx`. **No** extra folders (`projects/{id}/a/b` → DENY). File token must be non-empty and must not be `.` / `..`.

**G-LOGOS (Rev 3 — live proven, not invented):** `group-documents` has **6** canonical `logos/{groupId}/{file}` objects (3-seg, seg2 uuid), `logos_other=0`. SELECT/signed-url: `is_group_member(groupId)`. INSERT/UPDATE/DELETE: **DENY** (no writer, no delete caller — settings writes avatars `group-logos/`, not this prefix). Do not invent write. Do not rename/move the live 6.

Prefixes are **exact lowercase** as in source: `minutes`, `constitutions`, `relief-claims`, `dispute-docs`, `projects`, `logos`, `finance-record`. Mixed-case → **DENY**.

---

## R6 — Bucket matrix

| Bucket | public | Cut 3 |
|--------|--------|-------|
| avatars | true | **OUT OF SCOPE** (R26 proof) |
| group-documents | **false** (CUT3_ABORT if not) | 4 policies fail-closed |
| receipts | **false** (CUT3_ABORT if not) | 4 policies fail-closed |

---

## R7 — SELECT + signed-URL (IN SCOPE)

SELECT is **in** Cut 3. Target: same helpers, `p_operation = 'select'`.

**Read visibility freeze (do not silently force active-only):**

- Canonical group-path SELECT: **`is_group_member(resolved_group_id)`** — matches today’s v2-success branch; preserves historical reads for non-active rows that still have a membership.
- Projects SELECT: **`is_group_member(projects.group_id)`** after lookup. Missing project → **DENY** (closes today’s any-authenticated read of `projects/…`).
- Pending / exited / suspended / archived: **SELECT may still succeed** if `is_group_member` is true. **Writes DENY** (active-equivalent).

This is **safer** than live NULL-OR for unparsed keys, and **unchanged** for already-parsed member reads.

`createSignedUrl` / `signedUrlFor` / `download` succeed only if SELECT allows. After Cut 3, signing a garbage or cross-tenant key **DENY**.

---

## R8 — UPDATE USING + WITH CHECK

Live UPDATE **WITH CHECK is NULL/absent**. Target **both**:

```
USING      (bucket_id = '<b>' AND storage_*_authorized(name, 'update'))
WITH CHECK (bucket_id = '<b>' AND storage_*_authorized(name, 'update'))
```

OLD and NEW `name` must each be canonical + authorized. Rename to another tenant or to an unknown grammar → **DENY**. Upsert (documents, constitution) needs INSERT + UPDATE + SELECT — all fail-closed independently.

---

## R9 — Per-workflow matrix (SAFER-OR-UNCHANGED)

**Writes:** pending / suspended / exited / archived → **DENY**. Use `is_active_group_member` / `is_group_admin` / `has_group_permission` only.  
**SELECT:** `is_group_member` after canonical resolve (R7).  
**Client:** all listed callers use **browser** `createClient()` (`@/lib/supabase/client`). **No** server `service_role` storage I/O.

### 12 uploads

| ID | File | Bucket / grammar | UI / code floor | Browser vs server | RLS write freeze |
|----|------|------------------|-----------------|-------------------|------------------|
| U01 | `pay-now-dialog.tsx` | receipts / UUID-first **KEEP** | any member; no PermissionGate | browser | INSERT: `is_active_group_member(gid)` |
| U02 | `contributions/record/page.tsx` | receipts / **`finance-record/{gid}/{ts}-{file}` NEW** (code at main still UUID-first — path change is implementation-only later) | `RequirePermission` `finances.record` \| `finances.manage` | browser | INSERT: `has_group_permission(gid,'finances.record') OR has_group_permission(gid,'finances.manage')` — ordinary active member **DENY** |
| U03 | `my-fines/page.tsx` | receipts / dispute-docs | any member **self** | browser | INSERT: **member-self bind** (active). Same-group other membership / cross-group / bad mid → **DENY** |
| U04 | `documents/page.tsx` | gdocs / UUID-first; **upsert** | `hasPermission('documents.manage')` | browser | INSERT+UPDATE: `has_group_permission(gid,'documents.manage')` |
| U05 | `minutes/page.tsx` | gdocs / minutes | `hasPermission('minutes.manage')` | browser | INSERT: `has_group_permission(gid,'minutes.manage')` |
| U06 | `constitution/page.tsx` | gdocs / constitutions; **upsert** | `useGroup().isAdmin` (role owner/admin) | browser | INSERT+UPDATE: `is_group_admin(gid)` |
| U07 | `relief/my/page.tsx` | gdocs / relief-claims (`membershipId=currentMembership.id`) | any member **self** | browser | INSERT: **member-self bind** (active). Same-group other membership / cross-group / bad mid → **DENY** |
| U08 | `projects/page.tsx` | gdocs / projects | `useGroup().isAdmin` | browser | INSERT: lookup project → `is_group_admin(projects.group_id)` |
| U09–U11 | profile + onboarding ×2 | avatars / uid-first | self | browser | **OUT OF SCOPE** |
| U12 | `settings/page.tsx` | avatars / group-logos | `settings.manage` | browser | **OUT OF SCOPE** |

### 6 removes

| ID | File | RLS delete freeze |
|----|------|-------------------|
| R01 | `documents/page.tsx` (`documents.manage` UI) | `is_group_admin(gid)` — **live parsed DELETE already admin**; safer than widening to `documents.manage`. Non-admin officers: **R26 tracked**. |
| R02 | `projects/page.tsx` (`isAdmin` UI) | lookup → `is_group_admin(projects.group_id)` |
| R03–R05 | avatars (profile ×2 sites, onboarding member, onboarding group) | **OUT OF SCOPE** (uid policy) |

R03 counts as two `remove` sites in one file (photo remove + replace). Inventory still **6** remove **call sites**.

### 8 direct `createSignedUrl` + helper consumers

| ID | File | Bucket | Privileged? | Auth before sign |
|----|------|--------|-------------|------------------|
| S01 | `storage-urls.ts` `signedUrlFor` | typed receipts \| gdocs | **NO** — browser client passed in | Fail-closed **SELECT** RLS. Callers: `history/page.tsx` (UI `finances.manage` for *actions*, but **any member** can open a receipt), `my-payments/page.tsx` (own payments). SELECT freeze: `is_group_member` on canonical path. |
| S02 | `documents/page.tsx` after upload | gdocs | NO | SELECT after INSERT |
| S03 | `documents/page.tsx` download fallback | gdocs | NO | SELECT; `documents.manage` not required to download |
| S04 | `minutes/page.tsx` | gdocs | NO | SELECT |
| S05 | `constitution/page.tsx` | gdocs | NO | SELECT |
| S06 | `relief/my/page.tsx` | gdocs | NO | SELECT |
| S07 | `projects/page.tsx` | gdocs | NO | SELECT via **project lookup** + `is_group_member(projects.group_id)` |
| S08 | `my-fines/page.tsx` | receipts | NO | SELECT |

**Privileged / service_role signing: none found.** If a later path adds service-role sign, it is **forbidden** until a server-side authz check (not browser path alone) is frozen. Not in this cut.

Unknown signed-URL callers: **0**.

### Helper op mapping (inside bucket helpers)

| Grammar | select | insert / update | delete |
|---------|--------|-----------------|--------|
| UUID-first receipts (U01) | `is_group_member` | `is_active_group_member` only | `is_group_admin` |
| `finance-record/` (U02) | `is_group_member` | `has_group_permission(finances.record) OR has_group_permission(finances.manage)` — ordinary active member **DENY**; upsert without finance **DENY** | `is_group_admin` |
| dispute-docs (U03) | **member-self bind** (no forced active) | **member-self bind + active** | `is_group_admin` |
| UUID-first gdocs | `is_group_member` | `has_group_permission(documents.manage)` | `is_group_admin` |
| minutes | `is_group_member` | `has_group_permission(minutes.manage)` | `is_group_admin` |
| constitutions | `is_group_member` | `is_group_admin` | `is_group_admin` |
| relief-claims (U07) | **member-self bind** (no forced active) | **member-self bind + active** | `is_group_admin` |
| projects | `is_group_member(projects.group_id)` | `is_group_admin(projects.group_id)` | `is_group_admin(projects.group_id)` |
| logos (G-LOGOS) | `is_group_member(groupId)` | **DENY** (no writer invented) | **DENY** (no delete caller) |

**Member-self bind:** `memberships.id = path.membershipId AND memberships.user_id = auth.uid() AND memberships.group_id = path.groupId`. Writes also require `membership_status='active'`. Proxy/admin-on-behalf: **NONE**.

U01 and U02 are **Class A distinct grammars**. Shared UUID-first is **not** acceptable. Historical UUID-first objects stay put; SELECT remains `is_group_member`.

---

## R10 — Caller counts

| Class | Count | Unknown |
|-------|-------|---------|
| Upload | 12 | **0** |
| Remove | 6 | **0** |
| Direct `createSignedUrl` | 8 | **0** |
| `signedUrlFor` consumers | 2 (via S01) | **0** |
| `download` | 1 | **0** |
| Privileged signers | 0 | **0** |
| `createSignedUrls` / `move` / `copy` / `list` / storage `.update` | 0 | n/a |

---

## R11 — Avatars **OUT OF SCOPE** (proof)

- Write policies: `foldername[1] = auth.uid()::text` — **no** v1/v2, **no** `NULL OR`.
- SELECT: `"Anyone can view avatars"` / public bucket — not group-path.
- Live objects: 6 × 2-seg uuid-first.
- Cut 3 **must not** alter avatars policies, helpers, or grants.

---

## R12 — Future 00116 (name only — do not author)

`00116_s0_p0c_cut3_storage_path_fail_closed.sql`

Later (not this PR):

1. `CUT3_ABORT` preflight (R23).
2. Create both bucket helpers (R3).
3. **One transaction:** drop+create **all eight** policies to the target shape.
4. Keep v1/v2 functions; stop calling them from these policies.
5. No avatars / queue / `00001`–`00115` edits.
6. Dashboard-only (storage schema).
7. No object rewrite (R14).

---

## R13 — Live object shapes (sanitized)

Chief counts **refined (Rev 3):** avatars 6 (2-seg uuid); gdocs **25 = 6 logos + 14 constitutions + 5 uuid-first** (`logos_canonical=6`, `logos_other=0`); receipts 3 (2-seg uuid-first). No names.

The 6 live logos are **G-LOGOS** — remain **readable/signable** for `is_group_member` after fail-closed SELECT. Do **not** rename/move them. Constitutions stay G-CONSTITUTIONS. UUID-first stay G-GDOCS-UUID-FIRST / G-RECEIPT-UUID-FIRST.

After SELECT fail-closed: unknown 3-seg prefixes (if any appear later) are **unreadable**. Rehearsal must classify **prefix tokens only** (no filenames). If an unknown prefix exists beyond logos/constitutions, **CUT3_ABORT or Daybreak HOLD** before prod apply — do not invent a fallback.

---

## R14 — No data cleanup / rename / move

Unchanged. Existing UUID-first keys stay; they become correctly authorized. Existing `projects/{id}/…` stay; SELECT/writes use lookup.

---

## R15 — Signed URL contract

See `S0_CUT3_STORAGE_SIGNED_URL_MATRIX_20260912.json`.

- Authority: **fail-closed SELECT** on the private bucket.
- All current signers: **browser JWT** via `createClient()`.
- `signedUrlFor` accepts a caller-supplied `SupabaseClient` but every consumer passes the browser client.
- `EXPORT_EXPIRY_SECONDS` is unused by app callers (helper export only).
- `normaliseObjectPath` strips `/object/public/{bucket}/` and `/object/sign/{bucket}/` — after strip, the remainder must still be a canonical **literal** (R18). A normalised garbage key **DENY**.
- **No real private object was signed in this planning task.**

---

## R16 — Invalid UUID / arity

Same as before: regex-guard; no `::uuid` exception. Extra/missing segments **DENY**. Membership UUID in relief/dispute: **not** shape-check only — **member-self bind** (Rev 3 C). Tenant groupId must match `memberships.group_id`.

---

## R17 — Projects lookup

```
foldername[1] = 'projects'                    -- exact lowercase
foldername[2] ~ uuid-regex
foldername[3] IS NULL                         -- file is storage.filename, not a third folder
filename non-empty and not '.' / '..'
EXISTS (
  SELECT 1 FROM public.projects p
  WHERE p.id = foldername[2]::uuid            -- only after regex
    AND p.group_id IS NOT NULL                -- column is NOT NULL
    AND <auth>(p.group_id)                    -- per op (R9)
)
```

Missing project → **FALSE**. Do **not** add `projects` to v1’s unguarded cast list.

---

## R18 — Encoding / collision matrix (complete)

Evaluate the **stored `storage.objects.name` literal** (what RLS sees). If it cannot be proven canonical **without decoding to a different segment tree**, **DENY**.

| Input class | Decision | Reason |
|-------------|----------|--------|
| Exact frozen grammar, lowercase prefix, regex UUID, correct arity, non-empty file | **VALID CANONICAL** | Code writers |
| Leading `/` | **DENY** | empty first segment |
| Trailing `/` | **DENY** | empty filename |
| Double `//` | **DENY** | empty segment |
| Empty segment (`minutes//file`) | **DENY** | |
| Empty filename | **DENY** | |
| Single segment (`{uuid}` or `minutes`) | **DENY** | no frozen 1-seg grammar |
| Extra folders beyond frozen arity | **DENY** | |
| Literal `%2F` or `%2f` in a segment | **DENY** | cannot prove it is not a hidden slash; default DENY |
| Encoded backslash (`%5C`) | **DENY** | |
| Encoded dot / uuid percent-escapes that are not a literal regex UUID | **DENY** | UUID segment must match regex on the **literal** |
| Mixed-case prefixes (`Minutes`, `PROJECTS`) | **DENY** | code uses lowercase only |
| UUID hex mixed case | **VALID** if regex `[0-9a-fA-F]` matches (v2 already allows) | |
| `.` or `..` as a segment or filename | **DENY** | |
| Unicode slash lookalikes (U+2215, U+2044, U+FF0F, …) | **DENY** | not ASCII `/` separators |
| Backslash `\` | **DENY** | not a foldername separator we trust |
| `logos/{groupId}/{file}` on **group-documents** (canonical 3-seg) | SELECT **VALID** if `is_group_member`; INSERT/UPDATE/DELETE **DENY** | G-LOGOS live 6 |
| `logos/…` on **receipts** | **DENY** | not a receipts grammar |
| `group-logos/…` on private buckets | **DENY** | avatars-only caller; exact token ≠ `logos` |
| `finance-record/…` | INSERT **VALID** only with finances.record\|manage | U02 Class A |
| `LIKE '%uuid%'` / `LIKE 'minutes%'` | **FORBIDDEN in SQL** | R18 collision |

No `LIKE` / substring prefix match.

**Individual encoding tests (Rev 3):** do **not** treat this table as an umbrella. Apply-time disposable RLS must execute each `ENC-*` ID in `S0_CUT3_STORAGE_ENCODING_TEST_MATRIX_20260912.json` (bucket + operation + path + actor + expected DENY + reason).

---

## R19 — Disposable RLS (writes) — authenticated A/B on `storage.objects`

**Not** helper-only unit tests. Two authenticated JWTs (A = G1 actor, B = G2 or non-member). Exercise real `storage.from().upload/update/remove`.

Keep D01–D24 from revision 1 **except**:

- D02 record-payment: officer A with `finances.record` ALLOW on **`finance-record/{G1}/…` only**. Active member **without** that permission **DENY** on `finance-record/` (`T-U02-02`). Pay Now remains UUID-first (`T-U01-01`).
- D08 minutes: require `minutes.manage` (or owner / unassigned admin).
- D18 documents upsert: require `documents.manage` (`UPS-01`).
- **D18-neg:** active member without `documents.manage` upsert UUID-first gdocs → **DENY**.

Add Daybreak cases:

| # | Case | Expect |
|---|------|--------|
| D25 | B SELECT/sign `{G1}/{file}` receipts | **DENY** |
| D26 | B SELECT/sign `projects/{P1}/{file}` (P1 in G1) | **DENY** |
| D27 | A (member G1) SELECT `projects/{P1}/{file}` | **ALLOW** (`is_group_member`) |
| D28 | Authenticated SELECT `garbage/foo` | **DENY** (NULL parse gone) |
| D29 | Authenticated SELECT unknown grammar | **DENY** |
| D30 | INSERT/SELECT `minutes/not-a-uuid/x` | **DENY**, no `22P02` |
| D31 | Pending G1 INSERT `{G1}/{file}` | **DENY** |
| D32 | Suspended G1 INSERT | **DENY** |
| D33 | Exited G1 INSERT | **DENY** |
| D34 | Archived G1 INSERT | **DENY** |
| D35 | Pending G1 SELECT `{G1}/{file}` if membership row exists | **ALLOW** (`is_group_member`) |
| D36 | UPDATE: OLD canonical G1, NEW `{G2}/{file}` | **DENY** (WITH CHECK) |
| D37 | UPDATE: OLD garbage, NEW canonical | **DENY** (USING) |
| D38 | UPDATE: both canonical same group, actor authorized for update | **ALLOW** |
| D39 | **Superseded umbrella** — execute every `ENC-*` ID (not a 4-row sample) | **DENY** each |
| D40 | service_role EXECUTE of new helpers | **denied** (no grant) |
| D41 | `T-LOGOS-01` member G1 SELECT/sign `logos/{G1}/{file}` | **ALLOW** |
| D42 | `T-LOGOS-02` / `LOGOS-SIGN-02` member G2 SELECT/sign `logos/{G1}/{file}` | **DENY** |
| D43 | `T-LOGOS-04` any role INSERT/UPDATE/DELETE `logos/…` | **DENY** |
| D44 | `T-U02-01` finance officer INSERT `finance-record/{G1}/…` | **ALLOW** |
| D45 | `T-U02-02` ordinary active member INSERT `finance-record/{G1}/…` | **DENY** |
| D46 | `U03-NEG-*` / `U07-NEG-*` membership mismatches | **DENY** |
| D47 | `UPS-01`–`UPS-12` upsert matrix | ALLOW/DENY per ID |

---

## R20 — Disposable RLS (SELECT / sign / upsert)

| # | Case | Expect |
|---|------|--------|
| R01 | A `createSignedUrl` `{G1}/{file}` receipts | ALLOW |
| R02 | B `createSignedUrl` `{G1}/{file}` | DENY |
| R03 | A `createSignedUrl` `projects/{P1}/{file}` | ALLOW |
| R04 | B `createSignedUrl` `projects/{P1}/{file}` | DENY |
| R05 | Anon SELECT / sign | DENY |
| R06 | Constitution upsert as admin (INSERT+UPDATE+SELECT) | ALLOW |
| R07 | Documents upsert without `documents.manage` | DENY |
| R08 | Avatars public SELECT / uid write | **unchanged** |
| R09 | Confirm none of the eight policies reference v1/v2 | pass |
| R10 | Confirm v1/v2 functions still **exist** | pass |
| R11 | Member G1 `createSignedUrl` `logos/{G1}/{file}` (`LOGOS-SIGN-01`) | ALLOW |
| R12 | Member G2 `createSignedUrl` `logos/{G1}/{file}` (`LOGOS-SIGN-02`) | DENY |
| R13 | Authenticated sign malformed/unknown logos path (`LOGOS-SIGN-03`) | DENY |

---

## R21 — Grants (repeat)

`REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, service_role;`  
`GRANT EXECUTE … TO authenticated;`  
Owner `postgres` retains execute.  
No `p_uid` argument.

---

## R22 — Exceptions

`22P02` or any raise inside the helpers **fails Cut 3**. Helpers catch nothing by swallowing security errors into TRUE. Invalid input → **FALSE** only.

---

## R23 — `CUT3_ABORT` preflight (exact)

Before replacing policies, **one** preflight. Any mismatch → `RAISE EXCEPTION 'CUT3_ABORT: …'` (not NOTICE+skip).

1. Cut 2 present as **exact pair** version **`20260912033612`** name **`s0_p0b_cut2_notification_queue`**. If absent **or** unexpected drift vs this pin → **CUT3_ABORT / requalify**. Do **not** treat `count=30` as sufficient (later founder-auth migrations must not hide a missing/renamed Cut 2).
2. `storage.buckets`: `receipts.public = false` AND `group-documents.public = false`.
3. All **eight** policy names exist on `storage.objects` with exact **cmd**, **roles = {authenticated}**, **permissive**, and exact live **`using_expr` / `with_check_expr`** strings in the catalog fingerprints JSON (UPDATE WITH CHECK **null** preserved).
4. `public.storage_path_group_id` md5 **`fb6155e6e3c996ad857208f717d981a8`**; `public.storage_path_group_id_v2` md5 **`585e7bd017f5623aacf87407b1b11524`**; owner **postgres**; **not** DEFINER. Compare live `md5(pg_get_functiondef)` to these pins — not a reconstructed hash.
5. `is_active_group_member` md5 **`26c12399120587df3d066dd7819bdf5e`**; `is_group_member` md5 **`4b1bbd54719c129ef12f0ebc53463686`**; `is_group_admin` md5 **`d4090a33af3a873873223416c204c913`**; `has_group_permission` md5 **`695368464e97297fbf0f90ce7345162f`**. Owner **postgres**. First/third/fourth: DEFINER + `search_path ''`. `is_group_member`: DEFINER, **no** search_path pin.
6. New helpers **`storage_group_documents_authorized(text,text)`** and **`storage_receipts_authorized(text,text)`** are **null / absent**. If present at apply → **CUT3_ABORT**.
7. `public.projects.id` uuid PK exists; `public.projects.group_id` uuid **NOT NULL**.
8. Avatars write policies still uid-first (regression pin).
9. `storage.objects` role_table_grants match the exact rows in the catalog fingerprints JSON (anon+authenticated+service_role INSERT/SELECT/UPDATE/DELETE/REFERENCES/TRIGGER/TRUNCATE `is_grantable=NO`; postgres all `YES`).

Then **atomic one-transaction** replace of **all eight** policies. Partial apply is a defect.

---

## R24 — Rollout

1. Daybreak PASS this revision (docs only).  
2. Later implementation branch; author 00116; disposable A/B RLS; Daybreak implementation PASS.  
3. Dashboard paste, one transaction.  
4. Smoke: Pay Now, record payment, vault, minutes, constitution, relief, projects attach/sign/delete, history/my-payments `signedUrlFor`, avatars, Cut 2 drain.  
5. No ASTRA / UI work in Cut 3.

---

## R25 — Cut 2 non-regression

Unchanged: no edits to `00115`, queue, drain, producers, invitation/onboarding/SMS rules.

---

## R26 — UI/UX EXCELLENCE TRACK

**State exactly:** **UI/UX EXCELLENCE TRACK: ACTIVE / DEFERRED BY S0 GATE, NOT CANCELLED.**  
**Next UX gate:** ASTRA fresh design-system + IA review.  
**No UI work now.**

Functional non-loss (security gate, not visual polish):

| UX | After fail-closed 8 policies | Lost? |
|----|------------------------------|-------|
| Pay Now receipt | Active member INSERT; member SELECT | Kept |
| Record-payment receipt | `finances.record`\|`manage` INSERT | Kept (stronger than rev1 floor) |
| Dispute attach + sign | Active INSERT; member SELECT | Kept |
| Vault upload/upsert | `documents.manage` | Kept |
| Vault delete | `is_group_admin` | Tracked: `documents.manage` non-admin |
| Vault download / sign | member SELECT | Kept for members; **non-members lose** unparsed-key reads |
| Minutes attach | `minutes.manage` INSERT; member SELECT | Kept |
| Constitution | `is_group_admin` write; member SELECT | Kept |
| Relief | Active INSERT; member SELECT | Kept |
| Projects attach/sign/delete | lookup + admin write / member SELECT | Kept; **non-members lose** world-readable project files (intended) |
| History / my-payments viewers | `signedUrlFor` + member SELECT | Kept for members |
| Avatars / settings logo | unchanged (avatars `group-logos/`) | Tracked pre-existing avatars mismatch. Live gdocs **G-LOGOS** SELECT/sign kept for members; no gdocs write invented |
| ASTRA visual / IA | **Deferred, not cancelled** | — |

---

## Out of scope

- Authoring / applying `00116`
- App / test / SQL under `src/`, `scripts/`, `supabase/migrations/`
- Cut 2 / Cut 1 `is_group_member` rewrite
- Avatars policy redesign
- Object moves
- ASTRA UI
- Production Storage API / real signing

---

## Success criteria (this revision)

- [x] Docs-only on PR **#79**, draft stays open unmerged  
- [x] Parent `c3eccaa63b63f3c1517306a12c6a2bd31aee7149`  
- [x] Blockers A–G closed (Rev 2 A–H not reopened)  
- [x] G-LOGOS / U02 Class A / U03–U07 bind / UPS-* / ENC-* / live fingerprints frozen  
- [x] Signed-URL unknown = 0; privileged = 0; logos SELECT auth tests added  
- [x] No 00116 / app / test / SQL code  
