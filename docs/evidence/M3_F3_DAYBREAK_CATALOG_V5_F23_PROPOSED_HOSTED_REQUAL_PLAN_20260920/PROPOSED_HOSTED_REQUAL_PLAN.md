# PROPOSED HOSTED REQUALIFICATION PLAN — PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE

**Status:** PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE  
**Selected verification mode:** `fault-injection`  
**Local comparison:** ACCEPTED under `LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1` (derived only; grants **no** hosted acceptance or repair authority)  
**Raw local hold (unchanged):** `F23_FINGERPRINT_MISMATCH`  
**QA identity (already landed; not repeated):** VillageClaq QA — F23 LOCAL ACCEPTANCE CONTRACT ACCEPT  
**Overall status:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  
**Label:** F23 CURRENT PROPOSED HOSTED REQUAL — ONE PRESERVE RESET + ONE FAULT-INJECTION QUAL 00118–00123  
**Policy / success identity:** `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`  
**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**  
This document does not authorize wipe, hosted reset, credential use, Daybreak/Astra contact, Management API apply, enriched hosted capture, repair execution, merge, or deploy.  
Do **not** obtain credentials or contact any database now.

Historical proposed plans remain historical. This file is the **current** proposed hosted plan.

## Bound identities

| Role | Value |
|------|-------|
| Functional tip (frozen, unchanged) | `66be2b4797515975d737a0fd66656bc4c0de2145` |
| Starting #84/#85/#86 head | `9a78e2713d59c2656ca749ee63930bceb8d233fb` |
| QA package content | `b71e07ef6f1736438631034d6fe82328998b4c60` |
| QA-reviewed evidence tip / prior bind | `b71f6fa37ac27dd559d9af09aa5fb0f3d9e74367` |
| Accepted local contract | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/` |
| Local comparison profile | `LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1` |
| Repair amendment | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/REPAIR_AMENDMENT.md` |
| Finalized capture | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/CAPTURE_ATTEMPT_2/` |
| Historical F23 HOLD package | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/` |
| Historical F23 hosted plan (superseded as current) | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/PROPOSED_HOSTED_REQUAL_PLAN.md` |
| Sealed platform-ACL envelope | `eb58900b492b95371decfdab86b3786afc2c8089c6b0a117497f9e0b22c41a2a` |
| Policy / success / already-clean | `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` |
| Inventory schema | `f21-qualification-reset-inventory-v1` / `1` |
| Membership schema | `f21-qualification-reset-membership-v1` / `1` |
| Membership policy | `f21-btree-gist-extension-preserve-scoped-v1` |
| Classification | `EXTENSION_PRESERVE_SCOPED` |
| Authorized extension | `btree_gist` |
| Runtime closure | `b276d0cb9b39efd10f67422948b4cf9a6353359c116ab657d379c7c7f467a211` (count **47**) |
| Verification union | `89e4f0d80ff24d0aa705b79210073e2316667317b50d2d82a69808e8d7ff1f50` (count **49**) |
| Scope/SQL identity SHA-256 | `d95d96e02a3a1844977d852fa23a64f742b79b5f767984b6a2d4512cbe02632f` |
| Forbidden summary (must remain unequal) | `16e4757840aec5f4fb44504fbd33e8480de169553f9a1ccfb180dbde051cb66d` |
| Independent reference | `3742c0396903f3e91a779deec9b62d93a879f134c186f3b4b817a19c6ca99c91` |
| CLI pin | `2.117.0` |
| Shared branch | `feat/m3-f3-01-05-forward-foundation-9b17` |
| PRs | #84 authoritative; #85 / #86 aligned; OPEN DRAFT UNMERGED DAYBREAK HOLD; no sibling PR |

Runtime and union identities were recomputed with `publishQualificationResetClosures()` from current functional bytes (identical to functional tip `66be2b47…`). Recursive runtime `F3_FUNCTIONAL_RECURSIVE_CLOSURE.closure_sha256` matches the published runtime digest. `closure_complete=true`, missing=0, unresolved=0. Counts rose from the historical F23 pair (46/48) because `scripts/lib/f3-local-fingerprint-comparison.mjs` is now in the qualify recursive closure via the proof helper. That local profile still grants **no** hosted equality or repair authority.

Cited-not-expected baselines (must not be used as this plan's identity):

| Baseline | Runtime | Union |
|----------|---------|-------|
| Historical F23 package (`77fd61db…`) | `8b6bf5aff5f4448df9a7bc7791b9db63c24d800c43dbd81a39dfcef141ecc95a` (46) | `9c2e5d63bd30723b331d49c76fb66d05951e1ef68b9615c907ab8bf23c597815` (48) |
| F18 | `c6ecf620e41dbbce340e2207b2b9b793c8df750c703d245363139b497526a392` | `b9a9e6b7ad95f6e5935d05bb6c41bdabe543f0f88a086bc6b28fcb07dd03be78` |
| F17 | `0db1c600c620c0e406038fa3ebc5c4d7df6104bce64545ef9e16a63a6237c741` | `d3fd2eb52a2adc2a1f963a54955b888b2d3e8eadea0283894c4a51f5effc41cb` |

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**

## Mode selection (offline source check)

Existing modes in `QUALIFICATION_VERIFICATION_MODES` (`scripts/qualify-f3-db-push-disposable.mjs`):

| Mode | CLI | What the source does | Combined hosted requirement |
|------|-----|----------------------|-----------------------------|
| `normal-application` | `--verification-mode=normal-application` | Inject objects **must be absent** (`F23_INJECT_OBJECTS_PRESENT` if present). Applies 00118–00123. Exact history required after each push. Raw `fingerprintCompleteAndExact`. `repairCalls=0`, `historyInjects=0`, `retries=0`. | **Cannot** produce authentic `POST_COMMIT_HISTORY_FAILURE` or exercise CLI filename-version repair. |
| `fault-injection` | `--verification-mode=fault-injection` (also the unspecified default) | For **each** of the six `F3_FORWARD_FILES`: install exact-version history inject → `db push` → classify → existing repair-safety + **raw** fingerprint gates → supported CLI 2.117.0 `migration repair <filename version> --status applied` → per-file retry → continuation. Final six-row exact history and poison-absent check can complete through 00123. | **Selected.** One existing `--sequence-f3` command carries application **and** positive repair proof. |
| unknown | any other value | `F23_UNKNOWN_VERIFICATION_MODE` HOLD **before** identity/DB work | Rejected |

`normal-application` is an existing mode and remains available, but it is **incompatible** with the approved hosted repair requirement. This plan does **not** invent a third mode, combine flags into a hybrid command, or follow a preliminary repair experiment with a second full qualification.

The local comparison profile is **not** an input to `evaluateRepairSafetyGate` or hosted `fingerprintCompleteAndExact`. Hosted fingerprints stay **raw and unnormalized**.

Mode must be selected **before** database operations. This plan selects `fault-injection` **explicitly**.

## One qualification procedure

Budget (`F13_EXECUTION_BUDGET`, unchanged):

| Item | Count | Meaning |
|------|-------|---------|
| Constrained preserve resets | **1** | `--qualification-reset` under `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`. `alreadyClean` is a no-op and does **not** consume the reset. Consumed only after a confirmed committed mutation. |
| Complete quals from 00118 | **1** | One `--no-wipe --prep-floor --sequence-f3 --floor-mode=stub-live-pin --verification-mode=fault-injection` through 00123. Positive repair proof is **inside** this command. |
| Second reset | **false** | No second reset. No overall qualification rerun. No silent patch. No uncertain replay. |
| Unauthorized overall retry | **0** | Per-file retry after authorized repair is **not** a second qualification. |

### Expected per-file counts (fault-injection loop over six `F3_FORWARD_FILES`)

From `runQualifyDisposablePath` when `verification.mode === fault-injection` and `--sequence-f3` (not `runNormalApplicationSequence.operationCounts`):

| Counter | Per file if `POST_COMMIT_HISTORY_FAILURE` + gates pass | If all six files succeed |
|---------|--------------------------------------------------------|--------------------------|
| Platform-ACL calibration (`evaluatePlatformAclCalibration`) | 1 | 6 |
| History inject (`historyInjectSqlForFile`) | 1 | 6 |
| Initial `db push` application | 1 | 6 |
| Repair-safety gate (`evaluateRepairSafetyGate` + raw `fingerprintCompleteAndExact`) | 1 | 6 |
| Inject cleanup (`REMOVE_HISTORY_INJECT_SQL`) | 1 | 6 |
| CLI 2.117.0 filename-version repair | 1 | 6 |
| Per-file retry `db push` (PREFIX-COMPLETE, SINGLE-PENDING, **same file**) | 1 | 6 |

These per-file retries are the existing hosted F10 retry after authorized repair. They are **not** an unauthorized retry of the entire qualification.

If any file classifies `PRE_COMMIT_OR_ATOMIC_ROLLBACK`, fails `expected_objects`, fails raw `fingerprint_exact`, or fails any other required gate: **stop**. `repairCalls` for that file stay 0. Do not continue to later files. Do not start a second qualification.

### Expected induced failures (continue only as the source already does)

- Per-file history inject causing nonzero `db push` exit, target-specific inject marker, **intended objects present**, and **exact filename version absent** → classify `POST_COMMIT_HISTORY_FAILURE`. This is the required induced split.
- `--wipe-to-baseline` → `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`
- `--qualification-reset` without founder artifact → `F13_FLAG_NOT_AUTHORIZATION`
- `--qualification-reset` combined with `--prep-floor` / `--sequence-f3` / `--greenfield` → `F13_INVALID_FLAG_COMBINATION`
- Unknown `--verification-mode` → `F23_UNKNOWN_VERIFICATION_MODE` before DB work
- Production ref `llbnliixczcqfftxpsmb` → immediate refuse
- Missing preserve verdict on reset emit → `F21_PRESERVE_BASELINE_VERDICT_REQUIRED` (must not fall back to `CLEAN_BASELINE`)
- Stale founder-auth / old closure / old scope digest → `F13_FOUNDER_AUTH_STALE` / `F13_FOUNDER_AUTH_MISMATCH`
- `alreadyClean` `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` → no-op; reset budget unused; still exactly one complete qual

### Unexpected failures (STOP; no second reset; no overall rerun)

- `PRE_COMMIT_OR_ATOMIC_ROLLBACK` / `objectsPresent !== true` (the authenticated **local** F22 shape). Hosted procedure requires surviving intended objects. Existing repair-safety `expected_objects` fails closed. Do not invent a substitute command.
- Raw fingerprint inequality (`fingerprint_exact` / `F23_FINGERPRINT_MISMATCH`). Local profile acceptance is irrelevant.
- Exact filename history **present** after the induced failure (`target_history_absent` fails).
- Name-only or incomplete extension-membership tuples → `F13_UNEXPECTED_OBJECT_OR_DEPENDENCY` / historical `F20_EXTENSION_MEMBERSHIP_SERIALIZATION_UNSUPPORTED`. **Stop before mutation.**
- `UNCERTAIN_COMMIT`
- CASCADE, Management API apply, privilege expansion, wipe, production contact
- Failed required check of any kind

Repair proof is authenticated from each sequence step (`classification.split === POST_COMMIT_HISTORY_FAILURE`, `repairSafety.repairAuthorized === true`, CLI repair process, `historyAfterRepair`, post-repair raw fingerprints). The qualify PASS branch still records `claims.repairExercised = false` in current source; do **not** treat that claim field as the repair proof, and do **not** change executable code to flip it.

## Exact commands (NOT AUTHORIZED)

Execution checkout **must** be functional tip `66be2b4797515975d737a0fd66656bc4c0de2145`. `readBoundFunctionalCandidateSha()` is `git rev-parse HEAD`. Founder-auth `functionalCandidateSha` is compared to that HEAD. A docs-only successor HEAD fails `F13_FOUNDER_AUTH_STALE`. Functional bytes at later evidence commits are unchanged; they still must not be the execution HEAD unless Jude rebinds a new artifact (out of scope here).

### 0) Preconditions (read-only; still not authorized until Jude issues the artifact and credentials)

```bash
git rev-parse HEAD
# must equal 66be2b4797515975d737a0fd66656bc4c0de2145
```

Refuse production `llbnliixczcqfftxpsmb` and transaction pooler `:6543` before any SQL.

### 1) Exactly one constrained preserve reset

```bash
node scripts/qualify-f3-db-push-disposable.mjs \
  --qualification-reset \
  --founder-authorization-artifact=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_HOSTED_REQUAL/hosted/qualification-reset/FOUNDER_AUTH.json \
  --evidence-out=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_HOSTED_REQUAL/hosted/qualification-reset/qualify-result.json
```

Reset apply argv (existing): `psql -X -q -t -A -w -v ON_ERROR_STOP=1 -f [FILE]`.

This command already performs the required **fresh read-only inventory** via `QUALIFICATION_RESET_INVENTORY_CAPTURE_SQL` (`scripts/lib/f3-db-push-inventory.mjs`) and typed membership capture under `f21-qualification-reset-membership-v1` (required fields: `schema`, `schemaVersion`, `kind`, `identity`, `classid`, `objid`, `objsubid`, `refclassid`, `refobjid`, `extname`, `deptype`). Name-only `gbt_*` / `*_dist` rows HOLD. Incomplete starting-state dependencies HOLD (`F13_UNEXPECTED_OBJECT_OR_DEPENDENCY`; name-only fallback forbidden). Hosted 188-function ownership remains **CANNOT CONFIRM** until that live typed capture authenticates it. **Stop before mutation** on unsupported inventory.

### 2) Exactly one complete qualification 00118–00123 with repair inside

```bash
node scripts/qualify-f3-db-push-disposable.mjs \
  --no-wipe \
  --prep-floor \
  --sequence-f3 \
  --floor-mode=stub-live-pin \
  --verification-mode=fault-injection \
  --evidence-out=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_HOSTED_REQUAL/hosted/qualify-from-00118/qualify-result.json
```

Existing apply / repair remain **separate** CLI 2.117.0 commands spawned by that runner:

```text
supabase db push --db-url [REDACTED] --workdir [ISOLATED] --yes --skip-vault
supabase migration repair <FILENAME_VERSION> --status applied --db-url [REDACTED] --workdir [ISOLATED] --yes
```

`<FILENAME_VERSION>` is the preassigned fourteen-digit version for the current file only:

| File | Version | Name |
|------|---------|------|
| `00118_f3_bounded_financial_epoch_foundation.sql` | `20260913173000` | `f3_bounded_financial_epoch_foundation` |
| `00119_f3_01_core_ledger_foundation.sql` | `20260913173001` | `f3_01_core_ledger_foundation` |
| `00120_f3_02_secure_posting_idempotency.sql` | `20260913173002` | `f3_02_secure_posting_idempotency` |
| `00121_f3_03_projection_read_proof.sql` | `20260913173003` | `f3_03_projection_read_proof` |
| `00122_f3_04_correction_reversal.sql` | `20260913173004` | `f3_04_correction_reversal` |
| `00123_f3_05_opening_cash_command.sql` | `20260913173005` | `f3_05_opening_cash_command` |

Do **not** run `--verification-mode=normal-application` as a second qualification. Do **not** run a preliminary repair experiment.

## Founder-authorization artifact (existing contract; do not create or execute now)

Flag alone is not authorization (`F13_FLAG_NOT_AUTHORIZATION`). Artifact must be a repo-relative JSON object with **no** connection material (`F13_AUTH_ARTIFACT_SECRET` if `DATABASE_URL`, `DISPOSABLE_DB_URL`, `VILLAGECLAQ_F3_DISPOSABLE_DB_PASSWORD`, `postgresql://`, or `postgres://` appear).

Required fields (`F13_REQUIRED_AUTH_FIELDS` / `validateFounderAuthorizationBinding`):

```json
{
  "targetRef": "jkorwnwwmdeflfntxntl",
  "functionalCandidateSha": "66be2b4797515975d737a0fd66656bc4c0de2145",
  "closureDigest": "b276d0cb9b39efd10f67422948b4cf9a6353359c116ab657d379c7c7f467a211",
  "scopeSqlIdentitySha256": "d95d96e02a3a1844977d852fa23a64f742b79b5f767984b6a2d4512cbe02632f",
  "executionBudget": {
    "constrainedResets": 1,
    "completeQualsFrom00118": 1,
    "secondReset": false
  }
}
```

Stale artifacts (F19 `FOUNDER_AUTH.json`, F21/F22/F23 historical closures, production ref, wipe flag, budget ≠ 1/1/false) must HOLD. This docs package does **not** write that artifact.

Success / already-clean identity on the reset path remains `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`. Missing explicit preserve verdict → `F21_PRESERVE_BASELINE_VERDICT_REQUIRED`.

## Secure credential placeholders (do not obtain now)

When a later ticket authorizes hosted requalification:

1. Provision a **new dedicated disposable** password/URL for project `jkorwnwwmdeflfntxntl` only.
2. Process-local environment consumed by the existing gated constructors. Never commit, never print, never write into founder-auth artifacts.
3. Existing env names (placeholders only):
   - `VILLAGECLAQ_F3_DISPOSABLE_DB_PASSWORD=[REDACTED]`
   - `F3_DBPUSH_DISPOSABLE_SENTINEL=villageclaq-f3-dbpush-20260913-authorized`
   - `F3_REMOTE_DESTRUCTIVE_TEST=1`
   - Database URL: `[REDACTED]` (session-mode pooler identity; never `:6543`)
4. Isolated subprocess env; `sanitizeForLog` / evidence sanitization before hash; no `PGPASSWORD` inheritance into unsanitized logs.
5. Target checks **before any SQL**: accept `jkorwnwwmdeflfntxntl` only; reject `llbnliixczcqfftxpsmb`; reject transaction pooler `:6543`.
6. Management API token is **not** an apply path. `VILLAGECLAQ_F3_DISPOSABLE_MGMT_TOKEN` must not be used to apply migrations.

## Target

- Disposable only: `jkorwnwwmdeflfntxntl` (`db.jkorwnwwmdeflfntxntl.supabase.co`, org `eyztkzkprpmlmcabrfef`)
- Production forbidden: `llbnliixczcqfftxpsmb` (even for read/inventory)
- Reject transaction pooler `:6543`
- Daybreak / Astra contact is forbidden

## Wipe / preserve / finite scope

- Wipe remains `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`
- Success identity is `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` — **not** `CLEAN_BASELINE`
- Extension preservation: `btree_gist` PRESERVE; no `DROP EXTENSION`; no `ALTER EXTENSION`; no individual DROP of authenticated `deptype='e'` members
- Object count **113** (112 destructive + 1 preserve-only `ext.btree_gist`)
- Dependency count **43** = 31 migration-created + 12 historicalNoticeOnly
- History key count **6** (table above)
- Scope/SQL identity `d95d96e02a3a1844977d852fa23a64f742b79b5f767984b6a2d4512cbe02632f` (unchanged)
- Full object/dependency allowlist: `scripts/lib/f3-db-push-qualification-reset-design.mjs` (`FINITE_OBJECT_ALLOWLIST`, `FINITE_DEPENDENCY_ALLOWLIST`) and the retained F21 list in `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F21_PRESERVE_BASELINE_PROPOSED_PLAN_20260919/PROPOSED_HOSTED_REQUAL_PLAN.md`
- No CASCADE. No invented `schema_migrations` DELETE. `classifyInventory` `CLEAN_BASELINE` meaning unchanged and not reused for this path

## Hosted 188 — CANNOT CONFIRM

Local 264 `deptype='e'` tuples and local 188 typed members do **not** authenticate hosted ownership. The existing capture path is `QUALIFICATION_RESET_INVENTORY_CAPTURE_SQL` + `f21-qualification-reset-membership-v1` (OID-bearing). Name-only rows HOLD. Retain **CANNOT CONFIRM** until authenticated live evidence exists. Stop before mutation on unsupported inventory. This plan does **not** authorize a separate enriched-capture experiment.

## Execution evidence and cleanup (after future authorization only)

Evidence destinations (must **not** be created by this docs-only package):

- Reset: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_HOSTED_REQUAL/hosted/qualification-reset/qualify-result.json`
- Founder auth: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_HOSTED_REQUAL/hosted/qualification-reset/FOUNDER_AUTH.json`
- Complete qual: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_HOSTED_REQUAL/hosted/qualify-from-00118/qualify-result.json`

Existing runner evidence already includes inventories (`BEFORE_RESET`, `AFTER_FLOOR`, `AFTER_FAILED_HISTORY`, `AFTER_REPAIR`, `AFTER_RETRY`, `AFTER_CONTINUATION`, `FINAL`), per-file classification, raw fingerprints, repair-authorization records, and outer `evidence-index.json` + detached checksum.

Cleanup required by current source:

- Leave disposable project `jkorwnwwmdeflfntxntl` in place. Do not delete or pause.
- Drop throwaway probe (`DROP_THROWAWAY_PROBE_SQL`) unless `--skip-cleanup`.
- Remove history inject after authorized repair (`REMOVE_HISTORY_INJECT_SQL`).
- Do not drop `supabase_migrations` unless CLI docs require init.
- Residual failed-floor storage-policy leftovers are narrow DROP, not `--wipe-to-baseline`.

## What this package is not

- Not hosted requalification authorization
- Not hosted requalification PASS
- Not a wipe
- Not Management API apply
- Not production contact
- Not Daybreak / Astra contact
- Not repair execution
- Not a local-profile hosted waiver
- Not a second F-number
- Not a sibling PR
- Not merge / deploy / `origin/main` / F3-06
- Not a clean 00001–00117 replay and not production-equivalent

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**  
DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
