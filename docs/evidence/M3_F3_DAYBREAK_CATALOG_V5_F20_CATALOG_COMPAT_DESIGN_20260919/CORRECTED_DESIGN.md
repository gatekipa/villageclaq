# F20b corrected catalog-compatibility design (Part A + accepted Part B)

**Status:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  
**Design verdict:** `DESIGN_HOLD` (`F20_EXTENSION_MEMBERSHIP_SERIALIZATION_UNSUPPORTED`)  
**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

**This package does not implement executable behavior.** It replaces the HOLDed F19 Part A “preserved extension members” wording with **removal** semantics and a hard membership contract. Part B records the accepted six `historicalNoticeOnly` FK tuples.

Pins: start proposal `7e3b90abeea2f957a1ac332ba727cec4abbbfc67` · hosted HOLD ancestor `35b5be82acf01d11dd9f6578e8da7f384d8f925d` · F19 functional `dfbeb11b49f7e9b061a4c700e0335d125ac669e2` · evidence before hosted `20b4b340b49bccfc96f23333c731bac54056ea9c`.

Supersedes (does not rewrite): `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F19_HOSTED_HOLD_COMPAT_PROPOSAL_20260919/PROPOSED_CATALOG_COMPATIBILITY.md`.

---

## F20-R1 — Removal semantics (not “preserve members”)

### Withdrawn wording

The 7e3b90ab proposal’s classification `EXTENSION_SCOPED_DEPENDENT` — “recognized as **preserved** with the allowlisted extension’s DROP EXTENSION RESTRICT path” — is **incorrect** and **not** the contract.

### Required semantics (testable)

`DROP EXTENSION btree_gist RESTRICT` **removes** every object that is an authenticated extension member of `btree_gist`.

PostgreSQL 17 `pg_depend` (`deptype = 'e'`, `DEPENDENCY_EXTENSION`): the dependent object is a member of the referenced extension and **can be dropped only via `DROP EXTENSION`** on that extension. Functionally this is an internal membership link, not an external leftover.

| Claim | Required value | Forbidden value |
|-------|----------------|-----------------|
| Effect of authenticated `deptype='e'` members under `DROP EXTENSION btree_gist RESTRICT` | **Removed** by that DROP | “Preserved leftovers,” “kept with the extension,” “recognized and left in place” |
| Classification label | `EXTENSION_REMOVAL_SCOPED` | `EXTENSION_SCOPED_DEPENDENT` as a preserve class |
| Individual `DROP FUNCTION` allowlist rows for `gbt_*` / `*_dist` | **Not authorized** | Adding 188 (or any) `DROP FUNCTION` rows to `FINITE_OBJECT_ALLOWLIST` |
| Caller-supplied `extensionMemberOf` string | **Cannot** establish membership | Treating a client label as `pg_depend` evidence |
| Name or prefix match (`public.gbt_*`, `*_dist`, `gbtreekey*`) | **Cannot** establish membership | Pattern allowlist / `CANNOT CONFIRM` bypass |

### Classification algorithm (fail closed)

For each discovered object identity `O` not in `FINITE_OBJECT_ALLOWLIST`:

1. If `O` does not present a membership claim, `O` is unexpected → `F13_UNEXPECTED_OBJECT_OR_DEPENDENCY`.
2. If `O` presents a membership claim, authenticate it under F20-R2 / F20-R3. Success ⇒ classify `EXTENSION_REMOVAL_SCOPED` and **schedule removal via the already-allowlisted** `DROP EXTENSION btree_gist RESTRICT` (object allowlist id `ext.btree_gist`, `dropOrder` 1500). Failure ⇒ BLOCK.
3. `EXTENSION_REMOVAL_SCOPED` is **not** an object-allowlist entry, **not** a preserve bit, and **not** delete-authority expansion beyond the existing extension DROP.

`btree_gist` remains the sole destructive authority for those members. Skip DROP only if the identity probe shows the extension already absent. Absence after the probe is success for the extension row; leftover **non-member** objects still BLOCK.

---

## F20-R2 — Versioned typed capture contract

### Schema constants (required)

| Constant | Value |
|----------|-------|
| Inventory envelope schema name | `f20-qualification-reset-inventory-v2` |
| Inventory envelope schema version | `2` (integer; current live constant is `f13-qualification-reset-inventory-v1` / `1`) |
| Membership record schema name | `f20-qualification-reset-membership-v1` |
| Membership record schema version | `1` |
| Membership policy id | `f20-btree-gist-extension-removal-scoped-v1` |
| Authorized extension identity | `btree_gist` (exact `pg_extension.extname`; already on `FINITE_OBJECT_ALLOWLIST`) |

Stale envelope `schema !== f20-qualification-reset-inventory-v2` or `schema_version !== 2` → fail closed (`F13_INVENTORY_CAPTURE_INCOMPLETE` / dedicated `F20_MEMBERSHIP_SCHEMA_STALE`). No implicit upgrade. No v1 membership inference.

### Membership record (mandatory when a discovered object claims extension membership)

Every claim **must** bind all of the following. Types are exact. No optional aliases.

| Field | Source | Constraint |
|-------|--------|------------|
| `schema` | constant | `f20-qualification-reset-membership-v1` |
| `schemaVersion` | constant | `1` |
| `kind` | capture kind | Same kind as the discovered object (`function`, `type`, `extension`, …). Wrong-kind BLOCK. |
| `identity` | canonical schema-qualified identity/signature | Functions: `CANONICAL_FUNCTION_IDENTITY_SQL` / `canonicalizeFunctionIdentity()`. Tables/types/schemas/extensions: existing identity rules. |
| `classid` | `pg_depend.classid` | OID of the dependent object’s catalog class. |
| `objid` | `pg_depend.objid` | OID of the dependent object. Must resolve to `identity` for `kind`. |
| `objsubid` | `pg_depend.objsubid` | Integer from the same `pg_depend` row (typically `0` for whole-object membership). |
| `refclassid` | `pg_depend.refclassid` | **Must equal** `'pg_extension'::regclass` (live OID of `pg_catalog.pg_extension`). Any other class BLOCK. |
| `refobjid` | `pg_depend.refobjid` | **Exact** OID of the referenced extension row. |
| `extname` | `pg_extension.extname` joined on `oid = refobjid` | **Must equal** `btree_gist`. Must match the live row `pg_extension.oid = refobjid`. |
| `deptype` | `pg_depend.deptype` | **Must be** `'e'`. Any other value presented as membership BLOCK (F20-R3 / F20-R4). |

`extensionMemberOf` is **not** a contract field. If present on input, ignore-as-evidence and BLOCK if it is the only membership claim.

Capture SQL must emit these fields from `pg_depend ⋈ pg_extension` in the same statement that emits `kind` + `identity`. Parser must reject missing/null/wrong-typed fields. Snapshot, serialize, reread, and evidence writers must persist the full record (not identity-only strings).

### Survival chain (each hop is a fail-closed gate)

```
capture SQL
  → parse (validateQualificationResetInventoryBody)
  → snapshot (observedFromQualificationResetCapture / in-memory typed objects)
  → serialize / reread (JSON durable write + byte reread)
  → evidence (qualify-result / inventory body)
  → validateObjectAllowlist (typed objects, not identity strings alone)
  → SQL emitter / T3 (fresh pg_depend re-read; do not substitute earlier JS capture)
```

| Hop | Must retain | Fail-closed if |
|-----|-------------|----------------|
| Capture SQL | All F20-R2 fields from live catalogs | Column omitted, join guessed, name-only function row |
| Parse | Typed record; schema/version constants | Flattening to `identity` string; extra unknown membership keys used as authority |
| Snapshot | Same record object (frozen) | Re-deriving membership from `gbt_*` / caller label |
| Serialize / reread | Byte-stable JSON of the typed record | Round-trip drops OIDs / `deptype` / `refclassid` |
| Evidence | Indexed body contains the typed records | Evidence stores only `observedObjects: string[]` for claimed members |
| `validateObjectAllowlist` | Authenticates the typed record before `EXTENSION_REMOVAL_SCOPED` | Identity string without membership record treated as scoped |
| Emitter / T3 | Re-queries `pg_depend` after the F20-R5 lock (when one exists) | Using pre-lock JS capture as the T3 membership set |

Current gap (documented, not filled by this package): `DISCOVERED_OBJECT_SQL` emits only `{kind, identity}`; `discoveredObjectRecord()` / `identityFromDiscovered()` strip to kind+identity; `evaluateQualificationResetEligibility` calls `validateObjectAllowlist(identities, …)` with strings. Implementation (later) must stop that lossy reduction for membership claims.

---

## F20-R3 — Rejection rules (fail closed)

Any of the following BLOCKS the whole operation (`F13_UNEXPECTED_OBJECT_OR_DEPENDENCY` or a more specific `F20_*` code). No partial classify. No skip.

| ID | Rule | Testable predicate |
|----|------|--------------------|
| R3.1 | Missing fields | Any F20-R2 field null, `""`, or absent |
| R3.2 | Conflicting OID / name | `refobjid` ≠ live `pg_extension.oid` for `extname`, **or** `objid` does not resolve to `identity` for `kind`, **or** `extname` ≠ `btree_gist` while `refobjid` is that extension |
| R3.3 | Wrong-kind | Record `kind` ≠ discovered object kind, or kind unsupported by the identity probe |
| R3.4 | Wrong-OID | `classid`/`objid`/`refobjid` not positive OIDs, or `refobjid` is not an installed extension |
| R3.5 | Wrong `refclassid` | `refclassid` ≠ `'pg_extension'::regclass` |
| R3.6 | Non-`'e'` presented as membership | `deptype` ∈ `{n,a,i,p,x,…}` used to claim `EXTENSION_REMOVAL_SCOPED` |
| R3.7 | Forged / partial records | Caller-built object missing catalog join provenance; only `extensionMemberOf`; only prefix; only `extname` without OIDs |
| R3.8 | Stale schema version | Envelope ≠ v2 or membership schema ≠ `f20-qualification-reset-membership-v1` / version `1` |
| R3.9 | Incompatible scope / authorization identity | `scopeSqlIdentitySha256` or founder-auth / runtime-closure binding ≠ live digest that includes F20-R2 constants + F20-R1 policy + F20-R6 tuples (see F20-R7) |

Name-only `gbt_*` without a passing membership record remains unexpected (retains today’s `CANNOT CONFIRM` fail-closed path).

---

## F20-R4 — Automatic removal effects of `DROP EXTENSION … RESTRICT`

Grounded in PostgreSQL 17 `pg_depend` + `DROP EXTENSION`:

| `deptype` | PostgreSQL meaning | Required F20 handling |
|-----------|--------------------|------------------------|
| `'e'` | Extension **member**. Dropped only by `DROP EXTENSION`. | `EXTENSION_REMOVAL_SCOPED` after F20-R2 authentication. Removed by the allowlisted DROP. |
| `'n'` | `DEPENDENCY_NORMAL`. External dependent. | **Must continue to prevent RESTRICT removal.** Existing emitter already `RAISE EXCEPTION 'F13_UNEXPECTED_OBJECT_OR_DEPENDENCY: leftover dependents'` when any `deptype='n'` row references the extension. Whole TX rolls back. **Retain.** |
| `'x'` | `DEPENDENCY_AUTO_EXTENSION`. **Not** a member; auto-dropped with the extension even under RESTRICT (includes `ALTER ROUTINE … DEPENDS ON EXTENSION`). | **BLOCK.** Unexpected automatic destruction. Not `EXTENSION_REMOVAL_SCOPED`. Not silently dropped. |
| `'a'`, `'i'`, `'p'`, any other | Auto / internal / pin / future | **BLOCK.** Unapproved automatic effect. |

### Pre-DROP / T3 membership comparison (design)

After locks (F20-R5, when authorized) and **before** `EXECUTE 'DROP EXTENSION IF EXISTS btree_gist RESTRICT'`:

1. Resolve `ext_oid` + `extname` from `pg_extension` where `extname = 'btree_gist'`. If absent, skip DROP (existing identity probe). If present, bind `ext_oid` as the only authorized `refobjid`.
2. Read **all** `pg_depend` rows with `refclassid = 'pg_extension'::regclass AND refobjid = ext_oid`.
3. Partition by `deptype`:
   - `'e'`: must equal the captured approved membership set (kind + identity + classid/objid/objsubid + ref* + extname). Extra, missing, or changed → BLOCK.
   - `'n'`: leftover dependents → existing RAISE / rollback.
   - `'x'` or any other → BLOCK (`F20_UNAPPROVED_EXTENSION_AUTODROP` or `F13_UNEXPECTED_OBJECT_OR_DEPENDENCY`).
4. Only then emit the existing RESTRICT DROP. No CASCADE. No walk of member graphs as a delete selector.

T3 today revalidates leftover relations, functions, types, FK tuples, and history. It does **not** yet re-read extension membership. A later implementation must add this comparison **after** the F20-R5 lock and must **not** treat JS capture as a substitute (same rule as live FK tuples).

Current emitter leftover check (retain):

```sql
-- deptype = 'n' only; leftover normal dependents BLOCK
FROM pg_depend d
JOIN pg_extension e ON e.oid = d.refobjid
WHERE e.extname = 'btree_gist' AND d.deptype = 'n'
```

Design addition: a **separate** scan for `deptype <> 'e' AND deptype <> 'n'` (and explicitly `'x'`) that BLOCKs; `'e'` rows are the removal set, not leftovers.

---

## F20-R5 — Transaction serialization of extension membership

### Current emitter phases (grounded)

From `scripts/lib/f3-db-push-qualification-reset.mjs` `buildQualificationResetSql` / `QUALIFICATION_RESET_LOCK_ORDER`:

| Phase | What exists today | Covers extension membership? |
|-------|-------------------|------------------------------|
| T1 | `BEGIN ISOLATION LEVEL READ COMMITTED`; `pg_advisory_xact_lock(k1,k2)` keyed by **scope digest** (helper only) | No. Cooperative. Different key than extension OID. Existing comments: hostile sessions may ignore it. |
| T2 | `LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE`; `LOCK TABLE <allowlisted table/sequence> IN ACCESS EXCLUSIVE MODE` | No. Does not lock `pg_extension` / `pg_depend`. Founder: **not sufficient**. |
| T3 | Live leftover objects + exact FK tuples + history | No membership `pg_depend` comparison today. |
| T4 | Allowlisted drops including `DROP EXTENSION btree_gist RESTRICT` after leftover `'n'` check | Mutation. Lock must already be held. |

SERIALIZABLE is already rejected: first query (T1 observation / advisory DO) assigns a snapshot **before** T2, so T3 would miss drift committed while waiting.

### Required properties (founder)

The mechanism must:

1. Serialize competing sessions against **extension membership changes** (`ALTER EXTENSION … ADD/DROP`, `ALTER ROUTINE … DEPENDS ON EXTENSION`, other `pg_depend` membership writes against the authenticated extension OID).
2. Take effect **before** fresh membership comparison (T3).
3. Remain effective **through** `DROP EXTENSION`.
4. **Not** be satisfied by existing table/history locks alone.

### Candidate evaluation

Investigation method: PostgreSQL 17 documentation + existing helper privilege model. This environment had **no** local `psql` / PostgreSQL 17 (client binary absent; approved local socket not present). No hosted/disposable contact. Findings are therefore catalog/privilege conclusions, not a new live lock proof.

#### Candidate A — `SELECT … FROM pg_extension WHERE extname = $1 FOR UPDATE` in the reset TX

- **Privilege:** PostgreSQL 17 `SELECT` docs: `FOR UPDATE` requires `UPDATE` privilege on at least one column **in addition to** `SELECT`. `ddl-priv`: same. `pg_catalog.pg_extension` is a system catalog. PUBLIC has `SELECT`. The local proof helper (`scripts/fixtures/disposable-postgres.mjs`) connects as `ubuntu`, `CREATE DATABASE … OWNER ubuntu`. That is DB-owner privilege on `f3_*` user objects, **not** catalog `UPDATE`. Existing helper SQL never `UPDATE`s / `LOCK`s catalogs. Granting catalog `UPDATE` is a **new superuser-adjacent assumption**.
- **Lock semantics:** `FOR UPDATE` is a **heap tuple** lock on the `pg_extension` row. `DROP EXTENSION` eventually `heap_delete`s that row and would wait — so this *would* remain held through DROP **if** the `SELECT` succeeded. `ALTER EXTENSION ADD` takes `LockDatabaseObject(ExtensionRelationId, oid, 0, AccessExclusiveLock)` and inserts `pg_depend`; it typically does **not** update the `pg_extension` heap tuple. Object locks and tuple locks **do not conflict**. Therefore Candidate A does **not** serialize membership ADD against a non-cooperative session even for a superuser.
- **Verdict:** Unsupported under helper privileges; incomplete even with privilege.

#### Candidate B — transaction-scoped advisory lock keyed by authenticated extension OID

- **Privilege:** `pg_advisory_xact_lock(ext_oid)` (or a 2-int key derived from that OID) is available to ordinary roles. Fits helper privileges.
- **Lock semantics:** Only sessions that take the **same** advisory key wait. `ALTER EXTENSION` / dashboard SQL / a second admin does not take that key. Existing `validateTransactionContract` already fails `advisoryLockOnly`. Existing T1 comments: “advisory lock remains helper-only.”
- **Verdict:** Weaker substitute. **Not proposed.** Founder forbids inventing one.

#### Candidate C — other catalog-safe lock

| Mechanism | Privilege | Serializes membership writes? | Verdict |
|-----------|-----------|-------------------------------|---------|
| Existing T2 relation locks | Already used | No | Forbidden as the sole answer |
| `LOCK TABLE pg_extension IN ACCESS EXCLUSIVE MODE` | Catalog owner / superuser | Blocks heap access; still not the object lock `ALTER EXTENSION` uses | Outside privilege/scope |
| `LOCK TABLE pg_depend IN SHARE ROW EXCLUSIVE MODE` (or stronger) **before T3**, held through DROP | Catalog owner / superuser | Would block `pg_depend` inserts/deletes that implement membership change | **Would meet the serialization properties if privilege existed.** Helper does not have it. |
| SQL `LOCK EXTENSION btree_gist` | Does not exist | — | Unavailable |
| Take `LockDatabaseObject` on the extension without DROP/ALTER | No ordinary SQL | That is the lock `ALTER`/`DROP EXTENSION` use | Unavailable |

### F20-R5 decision

**No supported mechanism works within existing privileges/scope.**

Overall design verdict is `DESIGN_HOLD` with code `F20_EXTENSION_MEMBERSHIP_SERIALIZATION_UNSUPPORTED`.

Smallest founder decision (repeat of `CHIEF_HANDOFF.md`): (1) authorize catalog-privilege exception and name `LOCK TABLE pg_depend …` before T3 through DROP; (2) defer Part A; (3) reject Part A. Do not implement a cooperative advisory lock as if it satisfied F20-R5.

Until that decision, Part A must not be implemented. Pre-apply `validateObjectAllowlist` remains fail-closed on unauthenticated function identities.

---

## F20-R6 — Part B FK tuples (accepted; design specification)

Add **exactly** these six complete tuples to `FINITE_DEPENDENCY_ALLOWLIST` as `historicalNoticeOnly: true`. Recognition during inventory / T3 only. **No** new `FINITE_OBJECT_ALLOWLIST` identities. **No** new table-deletion authority. **No** CASCADE.

Intended contract: **43 = 31 migration-created + 12 historical** (existing 6 historical + these 6).

Pinned DDL provenance: `supabase/migrations/00001_core_tables.sql` and `supabase/migrations/00117_m2_notification_policy_foundation.sql` @ functional tip `dfbeb11b49f7e9b061a4c700e0335d125ac669e2`. Constraint names are PostgreSQL default `{table}_{column}_fkey` from those `REFERENCES` clauses (offline). Hosted HOLD retained inventory already observed these exact `(kind,identity,from,to)` tuples.

| # | identity | from | to | DDL pin |
|---|----------|------|----|---------|
| 1 | `group_positions_group_id_fkey` | `public.group_positions` | `public.groups` | `00001_core_tables.sql` `group_positions.group_id` → `groups(id)` |
| 2 | `groups_organization_id_fkey` | `public.groups` | `public.organizations` | `00001_core_tables.sql` `groups.organization_id` → `organizations(id)` |
| 3 | `memberships_user_id_fkey` | `public.memberships` | `public.profiles` | `00001_core_tables.sql` `memberships.user_id` → `profiles(id)` |
| 4 | `notification_policy_occurrences_superseded_by_fkey` | `public.notification_policy_occurrences` | `public.notification_policy_occurrences` | `00117_m2_notification_policy_foundation.sql` `superseded_by` → `notification_policy_occurrences(id)` |
| 5 | `position_assignments_position_id_fkey` | `public.position_assignments` | `public.group_positions` | `00001_core_tables.sql` `position_assignments.position_id` → `group_positions(id)` |
| 6 | `position_permissions_position_id_fkey` | `public.position_permissions` | `public.group_positions` | `00001_core_tables.sql` `position_permissions.position_id` → `group_positions(id)` |

Exact intended `dep({…})` fields (all six):

- `kind`: `"foreign_key"`
- `historicalNoticeOnly`: `true`
- `naming`: `"historical catalog name"`
- `handling` (non-self): `drop <from> before <to> when distinct; table-owned FK; RESTRICT table drop; no CASCADE; no DROP CONSTRAINT allowlist row`
- `handling` (row 4, self-FK): `drop public.notification_policy_occurrences; self-FK is table-owned; no separate DROP CONSTRAINT; no CASCADE; T3 still requires the live self-tuple`

### Preserved validation (must not weaken)

- Complete `(kind,identity,from,to)` only. Name-only FK strings still BLOCK.
- Altered `from` / `to` / `kind` still BLOCK.
- Unlisted FK still BLOCK.
- T3 still: live catalog tuples ⊆ `FINITE_DEPENDENCY_ALLOWLIST` **and** equal the captured approved starting set (unexpected / missing / changed BLOCK).
- Drop order remains `FINITE_OBJECT_ALLOWLIST.dropOrder`. Self-reference does not introduce a second drop of the same table.
- Floor DDL `ON DELETE CASCADE` on some of these columns is **table DML** behavior, not reset DROP CASCADE, and does **not** authorize `DROP … CASCADE`.

`scopeSqlIdentityDigest()` currently hashes dependency `id/kind/identity/from/to`. Adding these six tuples **changes** the digest. That is required (F20-R7). Existing founder-auth artifacts bound to the 37-tuple digest become stale and must fail closed.

---

## F20-R7 — Scope / authorization / runtime-closure binding

### What must enter the live digest

`scopeSqlIdentityDigest()` (today: SHA-256 of canonical JSON of allowlisted objects + dependencies + history) **must** also bind:

```json
{
  "inventorySchema": "f20-qualification-reset-inventory-v2",
  "inventorySchemaVersion": 2,
  "membershipSchema": "f20-qualification-reset-membership-v1",
  "membershipSchemaVersion": 1,
  "membershipPolicyId": "f20-btree-gist-extension-removal-scoped-v1",
  "membershipPolicy": {
    "classification": "EXTENSION_REMOVAL_SCOPED",
    "authorizedExtensionIdentity": "btree_gist",
    "deptype": "e",
    "individualDropFunctionAllowlist": false,
    "callerExtensionMemberOfInsufficient": true,
    "namePrefixInsufficient": true
  }
}
```

plus the expanded `FINITE_DEPENDENCY_ALLOWLIST` (43 tuples).

### Fail-closed bindings already in the runtime

| Binding | Code path today | Stale / incompatible effect |
|---------|-----------------|-----------------------------|
| `scopeSqlIdentitySha256` | `validateFounderAuthorizationBinding` / `bindFounderAuthorizationArtifact` | `F13_FOUNDER_AUTH_MISMATCH` |
| `closureDigest` | same; recursive closure from `scripts/qualify-f3-db-push-disposable.mjs` | `F13_FOUNDER_AUTH_STALE` |
| `functionalCandidateSha` | same | `F13_FOUNDER_AUTH_STALE` |
| Inventory `schema` + `schema_version` | `validateQualificationResetInventoryBody` | `F13_INVENTORY_CAPTURE_INCOMPLETE` |
| T0 before T1 | emitter / planner | No mutation |

A v1 inventory body, a forged membership record, or an old 37-tuple digest **cannot** authorize `EXTENSION_REMOVAL_SCOPED` or the six new FKs.

Editing the later implementation files changes the runtime-closure digest automatically. Re-issue founder auth after implementation; do not reuse F19 artifacts.

---

## F20-R8 — Implementation scope preview (do not implement now)

Intended edits, **when later authorized**, limited to:

| File | Intended change |
|------|-----------------|
| `scripts/lib/f3-db-push-inventory.mjs` | Envelope v2; `DISCOVERED_OBJECT_SQL` membership fields; parse/snapshot retain typed records; stop identity-only reduction for claims |
| `scripts/lib/f3-db-push-qualification-reset-design.mjs` | F20-R1 classifier; F20-R3 gates; six F20-R6 tuples; digest includes F20-R7 constants; T3 comment 43-tuple; **no** lock invention unless founder chooses decision (1) |
| `scripts/lib/f3-db-push-qualification-reset.mjs` | T3 live membership + `'x'`/unapproved autodrop BLOCK; DROP path retains `'n'` rollback; emit F20-R5 lock **only** after founder decision (1) |
| `scripts/test-f3-qualification-reset-design.mjs` | Offline cases in F20-R9; 43-tuple counts |
| `scripts/test-f3-qualification-reset.mjs` | Emitter/T3/auth/digest cases |
| `scripts/prove-f3-qualification-reset-local.mjs` | Local membership/autodrop/`'n'` cases; **no** hosted contact |

### Additional executable paths (identify only — not in the intended set)

| Path | When it would become necessary |
|------|--------------------------------|
| `scripts/qualify-f3-db-push-disposable.mjs` | Only if it **rebuilds** `observedObjects` as identity strings and drops typed membership records. If it only forwards parsed inventory, no structural edit. Closure entrypoint: digest changes when the listed modules change. |
| Founder-authorization JSON artifacts | Re-issue after digest/closure change. Not an executable path. |
| `scripts/test-f3-db-push-harness.mjs` | Only if a later change pins inventory schema v1 or identity-only discovery. Not required for the listed contract. |
| `scripts/lib/f3-db-push-repair-safety-gate.mjs` | Not required. Do not extract membership policy there. |

Out of scope: migrations 00118–00123, product schema, wipe path, Management API apply, hosted execution, Daybreak/Astra contact.

---

## F20-R9 — Verification matrix (design-level QA acceptance)

Map founder verification bullets → requirement IDs. QA ACCEPT/HOLD is against this table. A HOLD on F20-R5 holds the **package** even if other rows ACCEPT as wording.

| Founder verification bullet | Req | Design-level pass criterion |
|-----------------------------|-----|-----------------------------|
| `DROP EXTENSION btree_gist RESTRICT` removes authenticated `deptype='e'` members | F20-R1, F20-R4 | Design text says **removed**, not preserved; classifier is `EXTENSION_REMOVAL_SCOPED` |
| Classification is removal-scoped, not leftover-preserve | F20-R1 | `EXTENSION_SCOPED_DEPENDENT` / “preserve members” withdrawn |
| No individual `DROP FUNCTION` allowlist for `gbt_*` / `*_dist` | F20-R1, F20-R8 | Forbidden in policy + implementation preview |
| Caller `extensionMemberOf` cannot establish membership | F20-R1, F20-R3.7 | Not a contract field; sole claim BLOCK |
| Name/prefix match cannot establish membership | F20-R1, F20-R3.7 | `gbt_*` / `*_dist` without typed record BLOCK |
| Typed capture binds kind, identity, classid, objid, objsubid, refclassid, refobjid, extname, deptype='e' | F20-R2 | Schema constants + mandatory field table |
| Survival through capture → parse → snapshot → serialize/reread → evidence → validateObjectAllowlist → emitter/T3 | F20-R2 | Survival-chain table; lossy identity reduction called out |
| Fail closed: missing / conflicting OID-name / wrong-kind / wrong-OID / wrong refclassid / deptype≠e / forged / stale schema / incompatible scope | F20-R3, F20-R7 | R3.1–R3.9 listed with predicates |
| Unexpected `deptype='x'` and other unapproved autodrop effects BLOCK | F20-R4 | `'x'` and non-`e`/`n` BLOCK; not silently dropped |
| Normal external dependents (`deptype='n'`) still prevent RESTRICT and roll back the TX | F20-R4 | Existing leftover RAISE retained |
| Serialization before T3, through DROP, not table/history locks alone | F20-R5 | **HOLD** — no supported privilege-safe mechanism |
| Ordinary privileges only (no extra superuser vs local helper) | F20-R5 | Helper contract documented; catalog `UPDATE`/`LOCK` not assumed |
| If no mechanism: HOLD with exact gap + smallest founder decision | F20-R5, CHIEF | `DESIGN_HOLD` / `F20_EXTENSION_MEMBERSHIP_SERIALIZATION_UNSUPPORTED` |
| Part B exact six tuples, 43 = 31 + 12, historicalNoticeOnly | F20-R6 | Exact identity/from/to table |
| Pinned DDL 00001 / 00117 @ `dfbeb11…` | F20-R6, PINS | Provenance rows |
| No new table-deletion authority; no CASCADE | F20-R6, F20-R1 | Stated; wipe still `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH` |
| Preserve captured-set/T3 validation, ordering, self-FK handling | F20-R6 | Self-FK handling row; T3 equality retained |
| New schema version + membership policy bind into scope/auth/closure | F20-R7 | Digest JSON + existing mismatch/stale codes |
| Implementation file list + extra paths identified only | F20-R8 | Six files + identify-only table |
| Docs-only; no hosted contact; #84/#85/#86 remain OPEN DRAFT | package | This commit |

### Focused offline cases (for a later implementation ticket — not run here)

1. Name-only `gbt_*` without membership record → BLOCK.
2. Caller `extensionMemberOf: "btree_gist"` only → BLOCK.
3. Complete typed `'e'` record for `btree_gist` → `EXTENSION_REMOVAL_SCOPED`; still no `DROP FUNCTION` row; DROP EXTENSION RESTRICT remains the authority.
4. Same record with `deptype: "x"` or `"n"` as membership → BLOCK.
5. Wrong `refclassid` / conflicting `refobjid` vs `extname` → BLOCK.
6. Envelope v1 body → BLOCK (stale schema).
7. Each of the six F20-R6 tuples present → OK as `historicalNoticeOnly`; altered from/to → BLOCK.
8. Unrelated unexpected FK → BLOCK.
9. Live `'n'` leftover on `btree_gist` → RAISE / rollback (existing).
10. Live `'x'` on `btree_gist` → BLOCK (new).
11. Wipe flag → `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`.
12. Old scope digest / old closure → `F13_FOUNDER_AUTH_MISMATCH` / `STALE`.
13. Emitter still has `DROP EXTENSION … RESTRICT`; no CASCADE.

Do not rerun F18/F19 concurrency suites under this docs task.

---

## What this package is not

- Not hosted requal authorization  
- Not an F3-06 start  
- Not a claim that the 188 hosted functions are proven members today (retained capture still lacks `pg_depend`)  
- Not a blanket allowlist  
- Not authorization to implement Part A while F20-R5 is HOLD  
- Not contact with Daybreak or Astra  

## Next routing

Return to founder for the F20-R5 decision (1 / 2 / 3). Independent QA may ACCEPT wording of R1–R4 and R6–R9 and must HOLD the package on R5 until that decision.
