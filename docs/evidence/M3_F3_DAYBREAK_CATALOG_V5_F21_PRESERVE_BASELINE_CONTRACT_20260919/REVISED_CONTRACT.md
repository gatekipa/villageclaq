# F21 revised contract — preserve-`btree_gist` qualification baseline

**Status:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  
**Contract verdict:** `CONTRACT_READY_FOR_QA`  
**Ticket label:** catalog-compatibility foundation qualification (**not** F3-06)  
**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

**This package does not implement executable behavior.** It is the design/contract evidence package Independent VillageClaq Grok QA must ACCEPT or HOLD **before** any script change. No hosted/disposable contact. No catalog-privilege exception. No Daybreak/Astra contact.

Grounded at functional tip `dfbeb11b49f7e9b061a4c700e0335d125ac669e2` (scripts identical through start `3389901d32c99df9623a6f066e9986f972743c13`). Feasibility ancestor: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F20_EXTENSION_PRESERVE_FEASIBILITY_20260919/` (`NOT FEASIBLE UNDER THE CURRENT CONTRACT`). This package is founder Option B from that note: an explicit revised baseline + preserve policy. It is **not** a silent reinterpretation of `CLEAN_BASELINE`.

F20 `DESIGN_HOLD` / `F20_EXTENSION_MEMBERSHIP_SERIALIZATION_UNSUPPORTED` (`docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F20_CATALOG_COMPAT_DESIGN_20260919/`) is **preserved as historical**. This contract does **not** authorize extension-removal or Part A catalog-lock work.

---

## F21-C0 — Baseline identity (do not reuse `CLEAN_BASELINE`)

Historical meaning of `CLEAN_BASELINE` is **frozen**. Live constants at `dfbeb11…`:

| Live constant | File | Value |
|---------------|------|-------|
| `F13_RESET_SUCCESS_VERDICT` | `scripts/lib/f3-db-push-qualification-reset.mjs` | `"CLEAN_BASELINE"` |
| `F13_RESET_ALREADY_CLEAN_VERDICT` | same | `"CLEAN_BASELINE"` |
| `QUALIFICATION_RESET_INVENTORY_SCHEMA` | `scripts/lib/f3-db-push-inventory.mjs` | `"f13-qualification-reset-inventory-v1"` |
| `QUALIFICATION_RESET_INVENTORY_SCHEMA_VERSION` | same | `1` |
| `classifyInventory` success | same | `verdict === "CLEAN_BASELINE"` iff `extraFunctions.length === 0` (among other predicates) |

`CLEAN_BASELINE` today means: public VillageClaq floor objects absent, **no extra public functions**, no financial leftovers, history empty. Authenticated `btree_gist` member routines in `public` are `extraFunctions` and make `CLEAN_BASELINE` false. Wipe (`scripts/lib/f3-db-push-wipe.mjs`) and pre-stub-floor clean-check consume that meaning. **This contract does not reassign that string.**

### Required new constants (exact)

| Role | Constant | Value |
|------|----------|-------|
| Qualification-reset success / already-clean identity | `F21_RESET_SUCCESS_VERDICT` / `F21_RESET_ALREADY_CLEAN_VERDICT` | `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` |
| Capture envelope schema name | `F21_QUALIFICATION_RESET_INVENTORY_SCHEMA` | `f21-qualification-reset-inventory-v1` |
| Capture envelope schema version | `F21_QUALIFICATION_RESET_INVENTORY_SCHEMA_VERSION` | `1` (integer) |
| Membership record schema name | `F21_QUALIFICATION_RESET_MEMBERSHIP_SCHEMA` | `f21-qualification-reset-membership-v1` |
| Membership record schema version | `F21_QUALIFICATION_RESET_MEMBERSHIP_SCHEMA_VERSION` | `1` |
| Membership policy id | `F21_MEMBERSHIP_POLICY_ID` | `f21-btree-gist-extension-preserve-scoped-v1` |
| Classification label | — | `EXTENSION_PRESERVE_SCOPED` |
| Authorized preserve extension | — | `btree_gist` (exact `pg_extension.extname`) |

The envelope pair `(f21-qualification-reset-inventory-v1, 1)` is fail-closed-distinct from live `(f13-qualification-reset-inventory-v1, 1)` by **name**. It is fail-closed-distinct from unimplemented F20 `(f20-qualification-reset-inventory-v2, 2)` by name **and** version. No implicit upgrade. A v1 F13 body, a v2 F20 body, or an F20 removal-policy id **cannot** authorize this path.

`F13_RESET_SUCCESS_VERDICT` remains `"CLEAN_BASELINE"`. Implementation must **not** retarget that export. Qualification-reset success under this policy must use the F21 constants only.

### Membership record (retain F20 typed fields)

Every claim that an object is a preserved `btree_gist` member **must** bind all of the following. Types are exact. No optional aliases. Caller `extensionMemberOf` and name/prefix matches are **not** contract fields.

| Field | Source | Constraint |
|-------|--------|------------|
| `schema` | constant | `f21-qualification-reset-membership-v1` |
| `schemaVersion` | constant | `1` |
| `kind` | capture kind | Same kind as the discovered object. Wrong-kind BLOCK. |
| `identity` | canonical schema-qualified identity/signature | Functions: `CANONICAL_FUNCTION_IDENTITY_SQL` / `canonicalizeFunctionIdentity()`. Other kinds: existing identity rules. |
| `classid` | `pg_depend.classid` | OID of the dependent object’s catalog class. |
| `objid` | `pg_depend.objid` | OID of the dependent object. Must resolve to `identity` for `kind`. |
| `objsubid` | `pg_depend.objsubid` | Integer from the same `pg_depend` row (typically `0` for whole-object membership). |
| `refclassid` | `pg_depend.refclassid` | **Must equal** `'pg_extension'::regclass` (live OID of `pg_catalog.pg_extension`). Any other class BLOCK. |
| `refobjid` | `pg_depend.refobjid` | **Exact** OID of the referenced extension row. |
| `extname` | `pg_extension.extname` joined on `oid = refobjid` | **Must equal** `btree_gist`. Must match the live row `pg_extension.oid = refobjid`. |
| `deptype` | `pg_depend.deptype` | **Must be** `'e'`. Any other value presented as membership BLOCK. |

### Policy binding (fail closed)

`scopeSqlIdentityDigest()` today hashes allowlisted objects + dependencies + `AUTHENTICATED_HISTORY_KEYS` only (`scripts/lib/f3-db-push-qualification-reset-design.mjs`). Under this policy the live digest **must** also bind:

```json
{
  "inventorySchema": "f21-qualification-reset-inventory-v1",
  "inventorySchemaVersion": 1,
  "membershipSchema": "f21-qualification-reset-membership-v1",
  "membershipSchemaVersion": 1,
  "membershipPolicyId": "f21-btree-gist-extension-preserve-scoped-v1",
  "membershipPolicy": {
    "classification": "EXTENSION_PRESERVE_SCOPED",
    "authorizedExtensionIdentity": "btree_gist",
    "deptype": "e",
    "destructiveExtensionDrop": false,
    "individualDropFunctionAllowlist": false,
    "alterExtensionForbidden": true,
    "callerExtensionMemberOfInsufficient": true,
    "namePrefixInsufficient": true,
    "cleanBaselineNotReused": true
  }
}
```

plus the expanded `FINITE_DEPENDENCY_ALLOWLIST` (43 tuples; F21-C9) and the reclassified object allowlist (F21-C3).

Existing fail-closed codes remain effective:

| Binding | Code path today | Stale / incompatible effect |
|---------|-----------------|-----------------------------|
| `scopeSqlIdentitySha256` | `validateFounderAuthorizationBinding` / `bindFounderAuthorizationArtifact` | `F13_FOUNDER_AUTH_MISMATCH` |
| `closureDigest` | same | `F13_FOUNDER_AUTH_STALE` |
| `functionalCandidateSha` | same | `F13_FOUNDER_AUTH_STALE` |
| Inventory `schema` + `schema_version` | `validateQualificationResetInventoryBody` | `F13_INVENTORY_CAPTURE_INCOMPLETE` / dedicated `F21_MEMBERSHIP_SCHEMA_STALE` |
| T0 before T1 | emitter / planner | No mutation |

F19 founder-auth artifacts, F13 v1 inventory bodies, and F20 removal-scoped constants **cannot** authorize `EXTENSION_PRESERVE_SCOPED` or the six new FKs.

---

## F21-C1 — Application objects + constrained history reset as today

Approved application leftovers continue to reset through the existing destructive `FINITE_OBJECT_ALLOWLIST` (functions, tables, types, sequences, `financial_core` / `financial_private` schemas) by `dropOrder`, `RESTRICT` only.

Constrained history is unchanged. `AUTHENTICATED_HISTORY_KEYS` at `dfbeb11…` (`F3_FORWARD_FILES` × `PREASSIGNED_VERSIONS` / `PREASSIGNED_NAMES` @ F12 tip `1ec0e4da…`):

| version | name |
|---------|------|
| `20260913173000` | `f3_bounded_financial_epoch_foundation` |
| `20260913173001` | `f3_01_core_ledger_foundation` |
| `20260913173002` | `f3_02_secure_posting_idempotency` |
| `20260913173003` | `f3_03_projection_read_proof` |
| `20260913173004` | `f3_04_correction_reversal` |
| `20260913173005` | `f3_05_opening_cash_command` |

T4/T5 still `DELETE` those rows by version **and** name equality. Extra / missing / renamed history still `F13_HISTORY_KEY_MISMATCH`. Wipe remains `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`.

00118 (`CREATE EXTENSION IF NOT EXISTS btree_gist` plus `EXCLUDE USING gist`) remains compatible with a preinstalled extension at SQL level. Retention does not contradict 00118’s install statement. Full `--no-wipe --prep-floor --sequence-f3 --floor-mode=stub-live-pin` with a preinstalled extension is **future local PG verification**, not claimed by this docs package.

---

## F21-C2 — `btree_gist` and authenticated `deptype='e'` members remain installed

Under this policy the disposable qualification-reset path:

- does **not** emit `DROP EXTENSION` (RESTRICT or CASCADE);
- does **not** emit `ALTER EXTENSION … ADD/DROP`;
- does **not** add individual `DROP FUNCTION` / `DROP TYPE` / `DROP OPERATOR` allowlist rows for authenticated members;
- does **not** drop authenticated members by walking `pg_depend`.

Live `pg_depend` rows with `refclassid = 'pg_extension'::regclass`, `refobjid` = the live `btree_gist` OID, and `deptype = 'e'`, after F21-C0 authentication, classify `EXTENSION_PRESERVE_SCOPED` and **remain**.

PostgreSQL 17: `deptype = 'e'` (`DEPENDENCY_EXTENSION`) means the object is a member and can be dropped only via `DROP EXTENSION`. Because this path does not drop the extension, those members stay. That is the intended residual, **not** a leftover-preserve of unauthenticated names.

---

## F21-C3 — Reclassify `ext.btree_gist` (remove from destructive allowlist)

Live row at `dfbeb11…` (`FINITE_OBJECT_ALLOWLIST`, `dropOrder` 1500):

| Field | Live value |
|-------|------------|
| `id` | `ext.btree_gist` |
| `kind` | `extension` |
| `identity` | `btree_gist` |
| `provenance` | `00118_f3_bounded_financial_epoch_foundation.sql` @ F12 tip `1ec0e4da…` (`P118`) |
| `intendedAction` | `DROP EXTENSION btree_gist RESTRICT. Skip only if identity probe shows already absent. BLOCK if dependents remain.` |

Emitter (`buildQualificationResetSql`): `kind === "extension"` emits leftover-`'n'` check then `DROP EXTENSION IF EXISTS btree_gist RESTRICT`. T6 `presenceProbe(extension)` requires NULL or `F13_FINAL_BASELINE_FAILED: btree_gist still present`.

### Required reclassification (this policy only)

`ext.btree_gist` is **removed from the destructive allowlist** used as a drop selector. It is **reclassified preserve-only**. Preview shape (not implemented):

| Field | Required value |
|-------|----------------|
| `id` | `ext.btree_gist` (stable id; not a new destructive identity) |
| `kind` | `extension` |
| `identity` | `btree_gist` |
| `intendedAction` | `PRESERVE EXTENSION btree_gist. No DROP EXTENSION. No ALTER EXTENSION. No individual DROP of members.` |
| `destructive` | `false` |
| `dropOrder` | **not** a T4 mutate target |

Implementation may keep the row on a parallel `FINITE_PRESERVE_EXTENSION_ALLOWLIST` **or** mark it non-destructive on the object list. Either way:

1. `ordered.filter` used for T4 drops **must exclude** it.
2. T6 **must not** require the extension absent.
3. `scopeSqlIdentityDigest()` **must** hash the preserve classification (`intendedAction` / `destructive: false`) so a stale destructive digest cannot authorize this path.
4. No new `DROP FUNCTION` rows for `gbt_*` / `*_dist` / `gbtreekey*`.

---

## F21-C4 — Unrelated objects, unsupported leftovers, unapproved deps still HOLD

Unchanged fail-closed outcomes:

| Condition | Code (live) |
|-----------|-------------|
| Identity not on destructive allowlist and not an authenticated `EXTENSION_PRESERVE_SCOPED` member | `F13_UNEXPECTED_OBJECT_OR_DEPENDENCY` |
| Incomplete / name-only dependency | `F13_UNEXPECTED_OBJECT_OR_DEPENDENCY` |
| FK tuple not in `FINITE_DEPENDENCY_ALLOWLIST` | `F13_UNEXPECTED_OBJECT_OR_DEPENDENCY` |
| Auth/Storage/managed leftovers (`listUnsupportedManagedLeftovers`) | `F13_UNSUPPORTED_MANAGED_LEFTOVER` |
| Broad CASCADE | `F13_BROAD_CASCADE_FORBIDDEN` |
| History version/name mismatch | `F13_HISTORY_KEY_MISMATCH` |
| Incomplete capture | `F13_INVENTORY_CAPTURE_INCOMPLETE` / `F13_INVENTORY_CAPTURE_REQUIRED` |

No blanket allowlist. No `financial_*` prefix selector. Preserve classification is **not** a bypass for unrelated public functions, views, types, tables, or unapproved FKs.

---

## F21-C5 — Forged membership cannot escape application reset

An object whose canonical identity is on the **destructive** application allowlist **cannot** classify `EXTENSION_PRESERVE_SCOPED`, even if a typed membership record is presented.

| Overlap | Required outcome |
|---------|------------------|
| Destructive allowlist identity + any membership claim | **HOLD** (`F21_UNEXPECTED_MEMBERSHIP_OVERLAP` or `F13_UNEXPECTED_OBJECT_OR_DEPENDENCY`) |
| Forged `deptype='e'` record pointing at an application function/table/type | **HOLD** — overlap, and/or `objid` does not resolve as a live extension member |
| Caller `extensionMemberOf` on an allowlisted reset target | **HOLD** — not a contract field |

Application reset targets remain subject to T3 unexpected-object checks, T4 `RESTRICT` drops, and T6 absence probes. Membership is not a hide/skip bit.

---

## F21-C6 — Non-members and unexpected `deptype='x'` stay on unexpected-object checks

Retain F20-R3 authentication gates (renamed as F21 predicates; same BLOCK semantics):

| ID | Rule |
|----|------|
| C6.1 | Missing / null / empty F21-C0 field |
| C6.2 | Conflicting OID / name (`refobjid` ≠ live `btree_gist` OID, or `objid` does not resolve to `identity`/`kind`) |
| C6.3 | Wrong-kind |
| C6.4 | Wrong-OID (non-positive, or `refobjid` is not an installed extension) |
| C6.5 | `refclassid` ≠ `'pg_extension'::regclass` |
| C6.6 | `deptype ≠ 'e'` presented as membership (including `'n'`, `'a'`, `'i'`, `'p'`, `'x'`) |
| C6.7 | Forged / partial records; only `extensionMemberOf`; only prefix; only `extname` without OIDs |
| C6.8 | Stale envelope or membership schema (F13 v1, F20 v2, F20 membership-v1, F20 removal policy id) |
| C6.9 | Incompatible `scopeSqlIdentitySha256` / founder-auth / runtime-closure |

Name-only `gbt_*` / `*_dist` without a passing `'e'` record remains unexpected (today’s hosted `CANNOT CONFIRM` fail-closed path).

`deptype='x'` (`DEPENDENCY_AUTO_EXTENSION`, including `ALTER ROUTINE … DEPENDS ON EXTENSION`) is **not** a member. It is **not** `EXTENSION_PRESERVE_SCOPED`. It remains subject to unexpected-object / unapproved-autodrop BLOCK (`F21_UNAPPROVED_EXTENSION_AUTODROP` or `F13_UNEXPECTED_OBJECT_OR_DEPENDENCY`). This path does not DROP the extension, so `'x'` is not silently auto-dropped here either; it is still an unapproved leftover.

`deptype='n'` (normal external dependent) is not a member. It does not authorize preserve. It does not authorize DROP. Unexpected `'n'` leftovers against application objects still BLOCK as today.

---

## F21-C7 — Existing target / auth / process-evidence / TX checks remain effective

Live phases (`TRANSACTION_PHASES` at `dfbeb11…`) stay required:

| Phase | Retained effect under this policy |
|-------|-----------------------------------|
| T0 | HEAD / disposable pins / production refuse / pooler `:6543` refuse / founder artifact (target+candidate+closure+scope+budget) |
| T1 | `BEGIN ISOLATION LEVEL READ COMMITTED`; timeouts; helper-only advisory lock; F18 backend identity NOTICE |
| T2 | `LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE`; `LOCK TABLE` allowlisted **destructive** tables/sequences `IN ACCESS EXCLUSIVE MODE` |
| T3 | Live leftover relations/functions/types/FKs/history after locks; extras BLOCK; live tuples ⊆ allowlist **and** equal captured approved set |
| T4 | Destructive allowlist by `dropOrder`, `RESTRICT` only; history DELETE by version+name; **no** extension DROP |
| T5 | Affected-row identity/count; mismatch aborts TX |
| T6 | Destructive identities absent; history versions absent; preserve invariants (F21-C2/C3); no unexpected leftovers |
| T7 | COMMIT only after T6; serialization/deadlock/timeout → ROLLBACK, no retry loop, no second reset; uncertain commit labeled `UNCERTAIN_COMMIT` |

Process-evidence (`f18-qualification-reset-process-evidence-v1` / `f18-process-evidence-boundary-v1`) remains: `thrown:true` rejects interpretation/attestation/finalization; status 0 / T7 / a success verdict cannot override; `rolledBack=null` where unproven. Implementation must teach consistency checks that **F21** success ≡ `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`, and must **not** treat that string as interchangeable with `CLEAN_BASELINE`.

Execution budget unchanged: `constrainedResets: 1`, `completeQualsFrom00118: 1`, `secondReset: false`.

---

## F21-C8 — Disposable qualification-reset path only (do not relax `classifyInventory`)

`classifyInventory` / `evaluateQualificationResetCleanBaseline` / `isCleanBaseline` / wipe `planWipe` / `proveCleanBaseline` **keep today’s `CLEAN_BASELINE` predicates**. Member function names remain `extraFunctions`. A post-reset DB that still has `btree_gist` + members is **not** `CLEAN_BASELINE` and must not be labeled as such.

This policy adds a **scoped** success evaluator (preview name `evaluateQualificationResetPreserveBaseline`) used only by the disposable `--qualification-reset` path. Wipe, pre-stub-floor clean-check, and repair-safety-gate stay on `CLEAN_BASELINE`.

Already-clean under this policy: no **destructive** leftovers, history empty, capture complete, unsupported leftovers absent, and every remaining discovered object is either absent or an authenticated `EXTENSION_PRESERVE_SCOPED` residual (or the preserve extension itself). Verdict is `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`, **not** `CLEAN_BASELINE`.

`evaluateQualificationResetEligibility` today calls `evaluateQualificationResetCleanBaseline` when `leftovers.length === 0`. After preserve residuals remain, leftovers are non-empty unless preserve identities are excluded from the destructive leftover set. The eligibility function must be revised **inside the qualification-reset modules** so authenticated preserve residuals do not force `RESET_ELIGIBLE` mutation and do not route through `CLEAN_BASELINE`. That revision is **not** a global classifier change.

---

## F21-C9 — Part B: exact six `historicalNoticeOnly` FK tuples; 43 = 31 + 12

Add **exactly** these six complete tuples to `FINITE_DEPENDENCY_ALLOWLIST` as `historicalNoticeOnly: true`. Recognition during inventory / T3 only. **No** new `FINITE_OBJECT_ALLOWLIST` identities. **No** new table-deletion authority. **No** CASCADE.

Live counts at `dfbeb11…`: `APPROVED_DEPENDENCY_TUPLE_COUNT` = 37 = 31 migration-created + 6 historical. Intended after this policy: **43 = 31 + 12**.

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

Preserved validation: complete `(kind,identity,from,to)` only; altered `from`/`to`/`kind` BLOCK; unlisted FK BLOCK; T3 live tuples ⊆ allowlist **and** equal captured approved starting set; drop order remains destructive `FINITE_OBJECT_ALLOWLIST.dropOrder`; floor DDL `ON DELETE CASCADE` is table DML, **not** reset `DROP … CASCADE`.

Adding these six tuples **changes** `scopeSqlIdentityDigest()`. Required. Old 37-tuple founder-auth artifacts fail closed (`F13_FOUNDER_AUTH_MISMATCH`).

---

## F21-C10 — Concurrency guarantee (honest; no Part A catalog lock)

F20-R5 required a lock that serializes extension membership changes **before T3 and through `DROP EXTENSION`**. That requirement applied to a **removal** design. This policy **does not drop or alter the extension** and **does not drop authenticated members**. The F20 serialization-through-DROP problem is **out of scope**. This package does **not** reopen catalog privileges and does **not** implement Part A.

### What this path claims

1. It does **not** remove `btree_gist` or authenticated `deptype='e'` members.
2. Remaining **destructive** operations (allowlisted table/function/type/schema drops + authenticated history deletes) retain today’s protections: T2 relation locks on destructive tables/sequences + `SHARE ROW EXCLUSIVE` on `schema_migrations`; T3 live revalidation; T5 affected-row checks; T6 absence of destructive identities and history keys; whole-TX rollback on error.
3. Advisory `pg_advisory_xact_lock` remains helper-only. Hostile sessions may ignore it. Existing comments stay true.

### What this path does **not** claim

1. It does **not** claim global extension DDL is frozen (`ALTER EXTENSION … ADD/DROP`, `ALTER ROUTINE … DEPENDS ON EXTENSION`, other `pg_depend` membership writes).
2. It does **not** claim a privilege-safe catalog lock on `pg_depend` / `pg_extension`.
3. It does **not** invent a cooperative advisory lock as if it froze extension membership.
4. It does **not** satisfy F20-R5. F20 `DESIGN_HOLD` / `F20_EXTENSION_MEMBERSHIP_SERIALIZATION_UNSUPPORTED` remains the historical verdict for **removal**.

Honest residual race: a non-cooperative session can change extension membership while reset runs. T3/T6 under this policy must still fail closed on **unauthenticated** leftovers and unexpected `'x'` (F21-C6). A newly added **authenticated** `'e'` member after T3 is **not** a claimed freeze; it is an unclaimed extension-DDL race, not a silent drop. Do not paper over that with a lock invention.

---

## F21-C11 — Hosted 188 ownership remains `CANNOT CONFIRM`

Retained hosted capture (`docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F19_QUALIFICATION_RESET_HOSTED_REQUAL/` @ `35b5be82acf01d11dd9f6578e8da7f384d8f925d`) records function-like identities only. `DISCOVERED_OBJECT_SQL` at `dfbeb11…` emits `{kind, identity}` only. No `pg_depend` / `extname` / OID fields. **CANNOT CONFIRM** that those ~188 functions are `btree_gist` members.

This contract does **not** authorize enriched capture, hosted contact, or treating names as membership. Synthetic or local fixtures do not authenticate hosted objects. Implementation later must fail closed on name-only rows until a founder-authorized typed capture exists.

---

## F21-C12 — F20 DESIGN_HOLD package remains historical; no extension-removal implementation

Do not implement `DROP EXTENSION btree_gist`, `EXTENSION_REMOVAL_SCOPED`, `f20-btree-gist-extension-removal-scoped-v1`, or F20-R5 catalog locks.

Preserve as historical (do not rewrite):

- `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F20_CATALOG_COMPAT_DESIGN_20260919/` (`DESIGN_HOLD` / `F20_EXTENSION_MEMBERSHIP_SERIALIZATION_UNSUPPORTED`)
- `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F20_EXTENSION_PRESERVE_FEASIBILITY_20260919/` (`NOT FEASIBLE UNDER THE CURRENT CONTRACT`)

This F21 contract is the revised **preserve** baseline. It supersedes the feasibility note’s “not feasible under the **current** contract” for **policy drafting only**. It does not implement Option B. It does not authorize merge.

---

## F21-C13 — Capture survival chain

Current gap (unchanged until a later implementation ticket): `DISCOVERED_OBJECT_SQL` emits only `{kind, identity}`; `discoveredObjectRecord()` / `identityFromDiscovered()` strip to kind+identity; `evaluateQualificationResetEligibility` calls `validateObjectAllowlist` with strings.

Required survival (each hop fail-closed):

```
capture SQL
  → parse (validateQualificationResetInventoryBody)
  → snapshot (typed objects; no identity-only reduction for claims)
  → serialize / reread
  → evidence
  → validateObjectAllowlist (typed records)
  → SQL emitter / T3 (fresh pg_depend re-read; do not substitute earlier JS capture)
```

T3 function leftover SQL today builds `functionIdentities` only from `kind === "function"` **destructive** allowlist rows, then `RAISE` on any other `public`/`financial_*` function. Under this policy T3 must exempt **only** identities that re-authenticate as live `'e'` members of `btree_gist` in the same TX. JS capture is not a substitute (same rule as live FK tuples).

T6 today iterates **all** `FINITE_OBJECT_ALLOWLIST` rows including `ext.btree_gist`. Under this policy T6 iterates **destructive** rows only, asserts history absent, re-reads preserve membership, and BLOCKs unexpected leftovers. T6 must **not** emit `F13_FINAL_BASELINE_FAILED: btree_gist still present` as a success requirement.

---

## F21-C14 — Implementation scope preview (do not implement now)

Intended edits, **when later authorized after QA ACCEPT**, limited to:

| File | Intended change |
|------|-----------------|
| `scripts/lib/f3-db-push-qualification-reset-design.mjs` | Reclassify `ext.btree_gist` preserve-only; F21-C0 digest constants; F21-C5/C6 gates; six F21-C9 tuples; T3 comment 43-tuple; **no** catalog lock |
| `scripts/lib/f3-db-push-inventory.mjs` | Add F21 envelope constants **without** retargeting live `QUALIFICATION_RESET_INVENTORY_SCHEMA`; membership fields in discovery; stop identity-only reduction for claims; **new** preserve-baseline evaluator; **do not** change `classifyInventory` `CLEAN_BASELINE` predicates |
| `scripts/lib/f3-db-push-qualification-reset.mjs` | New `F21_RESET_*` verdict exports; keep `F13_RESET_SUCCESS_VERDICT = "CLEAN_BASELINE"`; T3/T6/T4 as F21-C2/C3/C7/C13; process-evidence consistency vs F21 verdict; no `DROP EXTENSION` for preserve ext |
| `scripts/test-f3-qualification-reset-design.mjs` | Offline cases in F21-C15 |
| `scripts/test-f3-qualification-reset.mjs` | Emitter/T3/T6/auth/digest cases |
| `scripts/prove-f3-qualification-reset-local.mjs` | Local preserve/overlap/`'x'`/name-only cases; **no** hosted contact |

### Extra paths — identify only; authorize before editing

| Path | Why it may become necessary |
|------|-----------------------------|
| `scripts/qualify-f3-db-push-disposable.mjs` | `qualificationResetQualifyEmitPayload` **forwards** `resetResult.verdict` when set, but **falls back** to `F13_RESET_SUCCESS_VERDICT` / `F13_RESET_ALREADY_CLEAN_VERDICT` (`CLEAN_BASELINE`) when verdict is missing. Comments/preconditions still say success is `CLEAN_BASELINE`. **Authorize this extra edit before implementation** if fallback/comments would reintroduce `CLEAN_BASELINE` as a qualification-reset success identity. Also inspect any flatten of `observedObjects` to identity strings. |
| `scripts/lib/f3-db-push-wipe.mjs` | **Must not** treat `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` as `CLEAN_BASELINE`. Identify-only unless a later ticket proves a wipe consumer reads the F21 verdict. |
| `scripts/lib/f3-db-push-pre-stub-floor-clean-check.mjs` | Uses `classifyInventory`. Do not relax. |
| `scripts/test-f3-db-push-harness.mjs` | Only if a later change pins inventory schema v1 or identity-only discovery. |
| `scripts/lib/f3-db-push-repair-safety-gate.mjs` | Not required. Do not extract membership policy there. |
| Founder-authorization JSON artifacts | Re-issue after digest/closure change. Not an executable path. |

Out of scope: migrations 00118–00123, product schema, wipe path, Management API apply, hosted execution, Daybreak/Astra contact, catalog privileges, F3-06, Part A locking.

---

## F21-C15 — QA acceptance checklist

Independent VillageClaq Grok QA: **ACCEPT** or **HOLD** each row. Overall `CONTRACT_READY_FOR_QA` stands only if every row ACCEPTs as wording. A single HOLD holds the package. This is **not** hosted requal PASS and **not** implementation authorization.

| # | Founder requirement | Section | PASS | FAIL / HOLD |
|---|---------------------|---------|------|-------------|
| Q1 | New success identity is `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`; `CLEAN_BASELINE` historical meaning preserved | F21-C0, F21-C8 | Distinct constants; no reuse of the `CLEAN_BASELINE` string for the preserve state | Relabels preserve residuals as `CLEAN_BASELINE`; retargets `F13_RESET_SUCCESS_VERDICT` |
| Q2 | Envelope schema + version distinct from live F13 inventory | F21-C0 | `f21-qualification-reset-inventory-v1` / `1`; F13 v1 and F20 v2 fail closed | Same name as `f13-qualification-reset-inventory-v1`; implicit upgrade |
| Q3 | Membership record retains F20 typed fields; `deptype='e'` only; `refclassid=pg_extension` | F21-C0 | Mandatory field table complete | Name/prefix/`extensionMemberOf` can establish membership |
| Q4 | Policy id bound into scope / founder-auth / runtime closure | F21-C0 | Digest JSON includes schema + policy + 43-tuple allowlist | Stale F19/F20/37-tuple auth can authorize |
| Q5 | Approved application objects + 00118–00123 history keys reset as today | F21-C1 | Destructive allowlist + six history keys unchanged in effect | History keys relaxed; wipe used |
| Q6 | `btree_gist` + authenticated `'e'` members remain; no DROP/ALTER EXTENSION; no individual DROP of members | F21-C2, F21-C3 | Preserve-only reclassification; no member DROP FUNCTION rows | Any DROP EXTENSION / ALTER EXTENSION / member DROP |
| Q7 | `ext.btree_gist` removed from **destructive** allowlist (or preserve-only) | F21-C3 | T4/T6 no longer treat it as a drop/absence target | Remains `intendedAction: DROP EXTENSION` under this policy |
| Q8 | Unrelated objects / unsupported leftovers / unapproved deps still HOLD | F21-C4 | Existing HOLD codes retained | Blanket allowlist / prefix selector |
| Q9 | Application reset targets cannot escape via forged membership; unexpected overlap HOLD | F21-C5 | Overlap table is HOLD | Membership hides a destructive identity |
| Q10 | Non-members and unexpected `deptype='x'` still unexpected-object | F21-C6 | C6.1–C6.9 BLOCK; `'x'` not preserve-scoped | `'x'` or name-only `gbt_*` accepted |
| Q11 | Target / auth / process-evidence / TX checks remain effective | F21-C7 | T0–T7 + thrown + budget retained | Weakens T3 equality, thrown, or production refuse |
| Q12 | Scope is disposable qualification-reset only; `classifyInventory` `CLEAN_BASELINE` not globally relaxed | F21-C8 | Wipe/other consumers unchanged | `classifyInventory` treats members as clean |
| Q13 | Exact six historical FK tuples; 43 = 31 + 12; no CASCADE; no new table deletion | F21-C9 | Identity/from/to table exact | Wrong tuples; CASCADE; new DROP TABLE authority |
| Q14 | Concurrency documented honestly: no extension/member removal; no global extension-DDL freeze; destructive ops retain T2/T3/T5/T6; no Part A catalog lock | F21-C10 | Honest residual race stated; no invented freeze | Claims catalog lock, advisory freeze, or F20-R5 satisfaction |
| Q15 | Hosted 188 ownership `CANNOT CONFIRM` | F21-C11 | Stated; no name-as-proof | Treats hosted `gbt_*` as proven members |
| Q16 | F20 DESIGN_HOLD preserved; no extension-removal implementation | F21-C12 | Historical packages unrewritten; this commit docs-only | Implements DROP EXTENSION or Part A lock |
| Q17 | Intended edits limited to authorized files; extra paths identified before editing | F21-C14 | Six files + extra-path table (especially qualify emit fallback) | Hidden script edits; extra path omitted |
| Q18 | Docs-only; no hosted contact; #84/#85/#86 OPEN DRAFT UNMERGED; DAYBREAK HOLD titles | package | This commit | Implementation, hosted contact, merge, title rewrite to PASS |

### Focused offline cases (later implementation ticket — not run here)

1. Typed valid `'e'` membership → `EXTENSION_PRESERVE_SCOPED`; extension remains; no `DROP EXTENSION` in emitted SQL.
2. Forged / missing / wrong-OID / wrong `refclassid` / `deptype='x'` → BLOCK.
3. Name-only `gbt_*` → BLOCK.
4. Destructive allowlist identity + membership claim → overlap HOLD; object still reset-checked.
5. T6 does not require `btree_gist` absent; does require destructive identities + history absent.
6. Unrelated unexpected object / FK → HOLD.
7. Each of the six F21-C9 tuples present → OK as `historicalNoticeOnly`; altered from/to → BLOCK.
8. Wipe flag → `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`.
9. `classifyInventory` on a preserve-residual inventory is **not** `CLEAN_BASELINE`.
10. Success / already-clean verdict is `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`, never `CLEAN_BASELINE`.
11. Old scope digest / F20 removal policy / F13 v1 envelope → auth/schema fail closed.
12. Emitted SQL: no `DROP EXTENSION`, no `ALTER EXTENSION`, no `CASCADE`.

Do not rerun F18/F19 concurrency suites under this docs task. Do not contact hosted disposable.

---

## What this package is not

- Not hosted requal authorization  
- Not an F3-06 start  
- Not implementation of Option B  
- Not a claim that the 188 hosted functions are proven members  
- Not a global `CLEAN_BASELINE` relaxation  
- Not authorization to implement extension-removal or catalog privileges  
- Not contact with Daybreak or Astra  

## Next routing

Independent VillageClaq Grok QA ACCEPT or HOLD this contract. Implementation is forbidden until ACCEPT. Hosted requalification remains **not run**.
