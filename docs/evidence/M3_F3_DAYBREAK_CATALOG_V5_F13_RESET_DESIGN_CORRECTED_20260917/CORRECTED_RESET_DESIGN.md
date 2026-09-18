# F13 corrected qualification-reset design

**F13 RESET DESIGN CORRECTED — AWAITING INDEPENDENT QA — NOT IMPLEMENTED YET**

**LOCAL_SYNTHETIC. PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE**

This package closes Daybreak/Astra findings A–E against the reviewed F12 proposal (`PROPOSED_RESET_SCOPE.md` sha256 `8553888b…`; proposed SQL sha256 `1b8cc9c2…`; historical SQL sha256 `0d3de029…`). It does **not** implement a live mutation path.

`--wipe-to-baseline` remains unconditionally rejected (`F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`). Do not enable, weaken, or bypass.

## Bound identities

| Role | Value |
|------|-------|
| Starting ref | `020bb9ef23d5e6a9f4b75e0fbb800acc24786300` |
| Accepted F12 functional (do not relabel) | `1ec0e4da782ed7715a543be23f79bc0f10a28af2` |
| Disposable (only future target) | `jkorwnwwmdeflfntxntl` |
| Production (reject) | `llbnliixczcqfftxpsmb` |
| CLI pin | `2.117.0` |
| Offline design module | `scripts/lib/f3-db-push-qualification-reset-design.mjs` |
| Offline tests | `scripts/test-f3-qualification-reset-design.mjs` |

## What F12 proposed that this package rejects

| F12 element | Status now |
|-------------|------------|
| `DROP SCHEMA financial_core/financial_private CASCADE` | Rejected. Exact contained objects + `DROP SCHEMA … RESTRICT` after emptiness proof |
| `DROP TABLE/FUNCTION/TYPE/EXTENSION … CASCADE` | Rejected as a design action. Explicit order; owned dependents only |
| `financial_*` as a destructive selector | Rejected. Prefix is not an allowlist |
| `DELETE … AND (name = '<name>' OR name IS NULL OR name = '')` | Rejected. Exact authenticated version **and** name |
| Historical version-only `DELETE` | Rejected as current procedure |
| One-shot SQL file as the supported interface | Rejected. One concrete future interface with founder-authorization binding |
| Altered F9 result copy (absolute executor paths in `stderr_tail`) | Replaced by finalized sanitized F9 bytes |
| Mutation / hosted reset tonight | Not opened |

Reviewed F12 SQL `1b8cc9c2…` and historical SQL `0d3de029…` remain in the **unchanged** F12 package as reviewed artifacts. They are **not** the F13 procedure.

## A. Object and dependency scope

Canonical machine list: `scripts/lib/f3-db-push-qualification-reset-design.mjs` (`FINITE_OBJECT_ALLOWLIST`, `FINITE_DEPENDENCY_ALLOWLIST`). Dump: `object-allowlist/`.

Every allowed object has:

- schema-qualified identity (functions include identity arguments)
- provenance (F12-tip migration path or historical F8/F9 object-identity citation)
- required starting state
- intended action (`RESTRICT` only)
- permitted dependent effects (owned indexes/triggers/policies/constraints on that relation)
- explicit `dropOrder`

Rules:

1. `financial_*` prefix is **not** a destructive allowlist. Inventory classifier language that buckets `financial_private \|\| financial_core \|\| financial_ledger_epochs` as `financial_object` remains a **HOLD signal**, not a drop selector.
2. Unexpected object or dependency **blocks** the whole operation.
3. Broad `CASCADE` is eliminated. Historical F9 cascade notices are accounted as **finite FK allowlist entries** and are handled by drop order, not by re-enabling `CASCADE`.
4. `DROP SCHEMA financial_core` / `financial_private` is permitted only after those schemas contain no unexpected objects and listed contents are gone (`RESTRICT`).
5. `DROP EXTENSION btree_gist RESTRICT` proceeds only if no dependents remain. Leftover dependents block. Absence of the extension after the identity probe is success.
6. Managed schemas stay preserved. `storage.buckets` is never dropped.

## B. Transaction-bound validation

See `transaction/TRANSACTION_CONTRACT.md` and `TRANSACTION_PHASES` in the design module.

Complete transaction, in order:

1. **T0** identity/state assertions (candidate SHA, disposable pins, founder binding, production refuse)
2. **T1** `BEGIN ISOLATION LEVEL SERIALIZABLE` plus timeouts
3. **T2** relation locks on history + allowlisted identities; advisory xact lock is a **helper only**
4. **T3** revalidate objects, `pg_depend`, and history keys **after** locks
5. **T4** mutate in `dropOrder` with `RESTRICT`; history `DELETE` uses version **and** name
6. **T5** affected-row / `RETURNING` identity+count checks
7. **T6** final assertions (allowlisted identities absent; permitted history absent; no unexpected leftovers)
8. **T7** `COMMIT` only after T6. Serialization/deadlock/timeout → `ROLLBACK`, no retry loop, no second reset

Concurrent-change prevention is **SERIALIZABLE + ACCESS EXCLUSIVE locks on allowlisted relations + post-lock revalidation**. Advisory locking is insufficient because a non-cooperating session can ignore it.

Rollback triggers: unexpected object, unexpected dependency, history mismatch, affected-row mismatch, SQL error, failed postcondition. Any of these ⇒ no successful reset.

Uncertain commit (session drop during `COMMIT`): label `UNCERTAIN_COMMIT`. **No automatic replay. No unverifiable rollback claim.** Stop. Later live inventory under fresh founder authorization.

## C. Exact history matching

Authenticated keys from F12 tip `PREASSIGNED_VERSIONS` + `PREASSIGNED_NAMES` (not source-label / filename substitution):

| File | version | name |
|------|---------|------|
| `00118_f3_bounded_financial_epoch_foundation.sql` | `20260913173000` | `f3_bounded_financial_epoch_foundation` |
| `00119_f3_01_core_ledger_foundation.sql` | `20260913173001` | `f3_01_core_ledger_foundation` |
| `00120_f3_02_secure_posting_idempotency.sql` | `20260913173002` | `f3_02_secure_posting_idempotency` |
| `00121_f3_03_projection_read_proof.sql` | `20260913173003` | `f3_03_projection_read_proof` |
| `00122_f3_04_correction_reversal.sql` | `20260913173004` | `f3_04_correction_reversal` |
| `00123_f3_05_opening_cash_command.sql` | `20260913173005` | `f3_05_opening_cash_command` |

Rules:

- Verify the permitted history set **before** mutation (T3).
- `DELETE` predicate: `version = '<version>' AND name = '<name>'` only.
- Null/empty names are rejected. No authenticated null-name provenance exists in this finite scope.
- Mismatched name **aborts the whole transaction**. Never skip a `DELETE` while object destruction commits.
- After mutation, authenticate deleted identities **and** counts (T5).
- Historical six-row deletion (F8/F9) does **not** establish current live state. A later fail-closed live check is required. **No live contact in this phase.**

## D. Entrypoint, authorization, transport

Phase 1 supported interface is **offline design only**:

| Item | Value |
|------|-------|
| Design module | `scripts/lib/f3-db-push-qualification-reset-design.mjs` |
| Tests | `scripts/test-f3-qualification-reset-design.mjs` / `npm run test:f3-reset-design` |
| Functions | `planQualificationResetDesign`, `validateObjectAllowlist`, `validateHistoryKeys`, `validateFounderAuthorizationBinding` |
| Execute / apply / connect | refused |
| `--wipe-to-baseline` | still rejected |

Proposed Phase 2 interface (not wired, not authorized):

```text
node scripts/qualify-f3-db-push-disposable.mjs \
  --no-wipe \
  --qualification-reset \
  --founder-authorization-artifact=<repo-relative-path>
```

A flag alone is **not** founder authorization. The artifact must bind all of:

- target disposable `jkorwnwwmdeflfntxntl`
- functional candidate SHA
- runtime closure digest
- scope/SQL identity (`scopeSqlIdentityDigest()` of the finite allowlist + history keys)
- execution budget: exactly one constrained reset + one qualify from 00118; `secondReset=false`

Transport contract (Phase 2 only, after QA accept + founder artifact): gated `psql -X -v ON_ERROR_STOP=1 -f` of SQL **generated from the allowlist** inside one SERIALIZABLE transaction. Not Management API apply. Not `--wipe-to-baseline`. Not `buildWipeSql`. Not transaction pooler `:6543`.

Failure behavior: stop the whole operation; no silent skip; no second reset; no new signing service; no general-purpose reset framework.

See `entrypoint/SUPPORTED_INTERFACE.md`.

## E. Evidence provenance

Finalized sanitized F9 reset-result (byte-for-byte):

| Field | Value |
|-------|-------|
| Source commit | `f5727733a036536c0374d93570f61e80a127d428` |
| Repo-relative path | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F9_EVENT_DURABLE_REQUAL_20260916/hosted/reset/reset-result.json` |
| SHA-256 | `dddf20e1c0762515a4132c77550f96665d2c56476780a9abc65f03a92bb127b6` |
| Bytes | `2749` |
| This package copy | `provenance/F9-reset-result.sanitized.json` (identical digest) |

The F12 proposal copy (`historical-f8-f9/F9-reset-result.json`, digest `eb2c6fac…`) is **not** reused. That copy is observably not the finalized sanitized bytes (absolute executor paths in `stderr_tail`). This package does **not** invent a transformation story for that difference.

F8 reset-result is cited by source commit + repo-relative path + digest only. Its bytes contain absolute executor paths, so they are **not** copied here.

Historical complete argv: **CANNOT CONFIRM**. No authentic complete reset argv artifact was found (F9 `hosted/STATUS.json` records a poison-probe argv, not the qualification-reset invocation).

This new package contains zero workspace-path disclosures.

## Phase 2 file list

See `PHASE2_PROPOSED_FILE_LIST.md` and `proposed-implementation/PROPOSED_DIFF_NOTES.md`. Runtime mutation remains **not implemented**.

## Offline validators added in this phase

| Path | Purpose |
|------|---------|
| `scripts/lib/f3-db-push-qualification-reset-design.mjs` | Fail-closed planner/validator stubs; no live I/O |
| `scripts/test-f3-qualification-reset-design.mjs` | Allowlist, history, auth-binding, wipe-rejection, provenance tests |
| `package.json` `test:f3-reset-design` | Dedicated npm script |

These modules are **not** wired into `qualify-f3-db-push-disposable.mjs` mutation control flow.

## Verbatim floor limitation

**DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT**
