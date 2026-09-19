# Offline catalog mismatch analysis (hosted HOLD)

**Status:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN

**Method:** Re-ran `validateObjectAllowlist` from functional tip `dfbeb11b49f7e9b061a4c700e0335d125ac669e2` (`scripts/lib/f3-db-push-qualification-reset-design.mjs`) against retained `observedFromCapture` in committed `qualify-result.json`. No disposable contact.

## Exact rejection

- Code: `F13_UNEXPECTED_OBJECT_OR_DEPENDENCY`
- Unexpected objects: **188** (reason: `not in FINITE_OBJECT_ALLOWLIST`)
- Unexpected dependencies: **6** (reason: complete `(kind,identity,from,to)` not in `FINITE_DEPENDENCY_ALLOWLIST`)
- Categories: `{"public_dist_ops": 12, "public_gbt_family": 176}`

FINITE_OBJECT_ALLOWLIST size at functional tip: 113 (58 functions, 43 tables, 1 sequence, 8 types, 2 schemas, 1 extension `btree_gist`).
FINITE_DEPENDENCY_ALLOWLIST size: 37 (31 migration-created + 6 `historicalNoticeOnly`).

## Extension-owned vs name-only (btree_gist helpers)

### What retained evidence shows

- Observed identities include extension row `btree_gist` (on the **destructive** object allowlist as `DROP EXTENSION btree_gist RESTRICT`).
- Exactly **176** `public.gbt_*` / gbtreekey-family function identities and **12** `public.*_dist(...)` operator-support functions fail allowlist match.
- Full exact list is in `MISMATCH_ANALYSIS.json` → `unexpectedObjectsExact`.

### Extension ownership

**CANNOT CONFIRM** that those 188 functions are `btree_gist` extension members from retained catalog evidence.

Missing information (exact):
1. `DISCOVERED_OBJECT_SQL` emits only `{kind, identity}` for functions — **no** `pg_depend` / `extname` / `extowner` fields.
2. Committed `qualify-result.json` retains only flattened identity strings under `observedFromCapture.observedObjects` — **no** per-object extension-membership map.
3. Names (`gbt_*`, `*_dist`) are **insufficient** per founder instruction to establish ownership.

Pinned source note: `00118_f3_bounded_financial_epoch_foundation.sql` contains `CREATE EXTENSION IF NOT EXISTS btree_gist;` — that establishes why the extension row is expected on an F3 leftover database, not membership of each public function OID.

Apply-time SQL already intends: before `DROP EXTENSION btree_gist RESTRICT`, block if leftover dependents remain (`F13_UNEXPECTED_OBJECT_OR_DEPENDENCY`). Pre-apply `validateObjectAllowlist` currently treats non-allowlisted function identities as unexpected **before** that path runs.

## Six foreign keys (retained tuples)

Each tuple below is taken from retained `observedDependencies` (complete kind/identity/from/to). Offline match: both endpoints are on `FINITE_OBJECT_ALLOWLIST` as tables; none of the six tuples are on `FINITE_DEPENDENCY_ALLOWLIST`.

| identity | from | to | endpoints on object allowlist | on dep allowlist | DDL provenance (pinned source, offline) |
|---|---|---|---|---|---|
| `group_positions_group_id_fkey` | `public.group_positions` | `public.groups` | from=True to=True | False | `00001_core_tables.sql` — `group_positions.group_id` → `groups(id)` |
| `groups_organization_id_fkey` | `public.groups` | `public.organizations` | from=True to=True | False | `00001_core_tables.sql` — `groups.organization_id` → `organizations(id)` |
| `memberships_user_id_fkey` | `public.memberships` | `public.profiles` | from=True to=True | False | `00001_core_tables.sql` — `memberships.user_id` → `profiles(id)` |
| `notification_policy_occurrences_superseded_by_fkey` | `public.notification_policy_occurrences` | `public.notification_policy_occurrences` | from=True to=True | False | `00117_m2_notification_policy_foundation.sql` — `superseded_by` → `notification_policy_occurrences(id)` (self-FK) |
| `position_assignments_position_id_fkey` | `public.position_assignments` | `public.group_positions` | from=True to=True | False | `00001_core_tables.sql` — `position_assignments.position_id` → `group_positions(id)` |
| `position_permissions_position_id_fkey` | `public.position_permissions` | `public.group_positions` | from=True to=True | False | `00001_core_tables.sql` — `position_permissions.position_id` → `group_positions(id)` |

### Relationship to proposed reset

- These FKs connect **allowlisted reset-target tables** (finite drop set). They are **not** evidence of objects outside reset scope.
- Existing design already uses `historicalNoticeOnly` complete tuples for six other floor FKs among the same table set (recognition during inventory; drop order via table drops + RESTRICT — not CASCADE).
- Classification: **recognition gap** on `FINITE_DEPENDENCY_ALLOWLIST` relative to live inventory. This does **not** by itself authorize deleting additional objects.

## Baseline / allowlisted / unexpected

| Class | Finding |
|---|---|
| Allowlisted objects present | 111 of 113 allowlist identities observed (canary table+seq absent — already gone) |
| Extension row | `btree_gist` observed and allowlisted (destructive DROP EXTENSION) |
| Unexpected functions | 188 identities not on object allowlist; ownership **CANNOT CONFIRM** |
| Unexpected FKs | 6 complete tuples among allowlisted tables; missing from dep allowlist |
| History | Exact PREASSIGNED 00118–00123 keys present |

## Evidence gaps (no live fill-in)

1. **Extension membership map** for the 188 functions (`pg_depend` → `pg_extension.extname`).
2. Raw capture body with kind-preserving discovered objects (committed evidence flattened identities only).
3. Hosted re-inventory after any future capture enrichment (explicitly **not** authorized here).

