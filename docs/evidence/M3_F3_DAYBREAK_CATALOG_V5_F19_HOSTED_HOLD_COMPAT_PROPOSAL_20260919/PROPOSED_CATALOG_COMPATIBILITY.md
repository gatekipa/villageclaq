# Minimal catalog-compatibility proposal (docs only — NOT AUTHORIZED)

**Status:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  
**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

**Pins:** functional `dfbeb11b49f7e9b061a4c700e0335d125ac669e2` · hosted HOLD tip `35b5be82acf01d11dd9f6578e8da7f384d8f925d` · prior evidence `20b4b340b49bccfc96f23333c731bac54056ea9c`

This proposal does **not** apply functional changes. It does **not** reopen accepted F19 findings. It does **not** authorize hosted contact, reset, qual, wipe, merge, or F3-06.

## Problem (authenticated offline)

Pre-apply `validateObjectAllowlist` rejected the disposable inventory with `F13_UNEXPECTED_OBJECT_OR_DEPENDENCY` before any mutation:

1. **188** public function identities (176 `gbt_*` family + 12 `*_dist`) not on `FINITE_OBJECT_ALLOWLIST`.
2. **6** complete FK tuples among allowlisted tables not on `FINITE_DEPENDENCY_ALLOWLIST`.

See `MISMATCH_ANALYSIS.md`. Extension membership of (1) is **CANNOT CONFIRM** from retained evidence.

## Design intent to preserve

- Finite allowlists only; RESTRICT only; no CASCADE; wipe stays `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`.
- `DROP EXTENSION btree_gist RESTRICT` remains the sole destructive authority for the extension (already on object allowlist).
- `historicalNoticeOnly` dependency tuples = **recognition** during inventory, not expanded delete scope.
- Distinguishing **preserve/recognize** from **authorize delete**.

## Smallest justified correction (two coordinated parts)

### Part A — Extension-member recognition (preserve, do not expand delete list)

**Goal:** Stop treating confirmed extension members of an **already-allowlisted** extension as “unexpected destructive leftovers,” without adding hundreds of individual `DROP FUNCTION` allowlist rows.

**Required evidence gate (blocking):** Inventory capture must record, for each discovered function (and type if needed), whether it is an extension member and which `extname` owns it (`pg_depend` / `pg_extension`). Until that field exists in capture + evidence, classification must keep failing closed on name-only guesses.

**Classification rule (proposed):** If and only if retained/captured evidence shows `extensionMemberOf === '<allowlisted-extension-identity>'` (here `btree_gist`), classify as:

`EXTENSION_SCOPED_DEPENDENT` — recognized as preserved with the allowlisted extension’s DROP EXTENSION RESTRICT path — **not** an unexpected object, **not** an individual destructive allowlist entry.

Non-members remain unexpected (BLOCK).

**Not proposed:** blanket `public.gbt_*` patterns, dropping membership checks, CASCADE, or adding 188 DROP FUNCTION rows.

### Part B — Six FK recognition tuples (historicalNoticeOnly)

**Goal:** Recognize the six live FK tuples among tables **already** on `FINITE_OBJECT_ALLOWLIST`, matching the existing six `historicalNoticeOnly` floor FKs.

Add **exactly** these complete tuples to `FINITE_DEPENDENCY_ALLOWLIST` with `historicalNoticeOnly: true` (recognition only):

| identity | from | to |
|----------|------|-----|
| `group_positions_group_id_fkey` | `public.group_positions` | `public.groups` |
| `groups_organization_id_fkey` | `public.groups` | `public.organizations` |
| `memberships_user_id_fkey` | `public.memberships` | `public.profiles` |
| `notification_policy_occurrences_superseded_by_fkey` | `public.notification_policy_occurrences` | `public.notification_policy_occurrences` |
| `position_assignments_position_id_fkey` | `public.position_assignments` | `public.group_positions` |
| `position_permissions_position_id_fkey` | `public.position_permissions` | `public.group_positions` |

Provenance labels: floor DDL `00001_core_tables.sql` / `00117_m2_notification_policy_foundation.sql` @ functional tip (offline). Handling text: drop endpoint tables by existing dropOrder; **no CASCADE**; no new object identities on `FINITE_OBJECT_ALLOWLIST`.

**Not proposed:** broadening dependency discovery, name-only FK matching, or deleting non-allowlisted tables.

## Exact proposed file scope (when later authorized as F3-06 / correction)

| File | Change type |
|------|-------------|
| `scripts/lib/f3-db-push-inventory.mjs` | Enrich `DISCOVERED_OBJECT_SQL` (+ parsers) with extension-membership fields; keep fail-closed if absent |
| `scripts/lib/f3-db-push-qualification-reset-design.mjs` | Part A classification helper; Part B six `historicalNoticeOnly` deps; update dependency count constants/comments |
| `scripts/lib/f3-db-push-qualification-reset.mjs` | Only if emitter final-assertions must accept extension-scoped dependents consistently (no CASCADE; no wipe) |
| `scripts/test-f3-qualification-reset-design.mjs` (+ related offline tests) | Focused cases below |
| Evidence package / proposed plan docs | Refresh after implementation — separate from this proposal |

**Out of scope:** migrations 00118–00123, product schema, wipe path, Management API apply, hosted execution.

## Preservation rules

1. Accepted F19 functional/evidence findings stay closed unless concrete regression evidence appears.
2. Do not add financial_* prefix selectors or unbounded pg_depend walks without finite checks.
3. Do not weaken unexpected-object BLOCK for non-extension, non-allowlisted identities.
4. Do not authorize DROP of objects solely because they appeared in hosted inventory.
5. `--wipe-to-baseline` remains rejected.
6. Production `llbnliixczcqfftxpsmb` remains forbidden.

## Focused verification cases (offline first)

1. **Name-only gbt_*** without membership field → still BLOCK (`CANNOT CONFIRM` path).
2. **Membership field `btree_gist`** on allowlisted extension → classify EXTENSION_SCOPED_DEPENDENT; validateObjectAllowlist OK for that identity; still no individual DROP FUNCTION row.
3. **Membership of a non-allowlisted extension** → still BLOCK.
4. **Each of the six FK tuples** present → OK as historicalNoticeOnly; altered from/to → BLOCK.
5. **Unrelated unexpected FK** (not listed) → still BLOCK.
6. **Wipe flag** → still `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`.
7. **Emitter:** DROP EXTENSION RESTRICT still present; no CASCADE introduced; dependent-leftover RAISE retained.
8. Prior F19 process-integrity / concurrency suites: **do not rerun** under this docs task; after a future authorized implementation, run only the focused design/reset offline tests plus any explicitly frozen delta suite.

## What this proposal is not

- Not hosted requal authorization  
- Not an F3-06 start  
- Not a claim that the 188 functions are proven extension members today  
- Not a blanket allowlist  

## Next founder decision

Choose one:

1. **Authorize a bounded docs→implementation correction** implementing Part A (capture+classify) and Part B (six historicalNoticeOnly deps) under a new ticket — still no hosted run until that lands and is independently reviewed.  
2. **Defer Part A** until a one-time founder-authorized **read-only** inventory enrichment capture is approved (separate auth) to close the ownership CANNOT CONFIRM gap, then revisit.  
3. **Reject / redirect** with alternate scope.

Return to founder for routing. Do not contact Daybreak or Astra from this package.
