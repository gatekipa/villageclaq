# PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE

**Status:** RESET PROPOSAL READY — DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN

**This packaging agent did not obtain credentials, probe disposable `jkorwnwwmdeflfntxntl`, contact production `llbnliixczcqfftxpsmb`, run a reset, enable `--wipe-to-baseline`, apply SQL, or execute any part of this proposal.**

## Wipe flag (unchanged rejection)

`--wipe-to-baseline` remains unconditionally rejected (`F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`). Do not enable, weaken, or bypass.

## Bound identities

| Role | Value |
|------|-------|
| Repo | gatekipa/villageclaq |
| Main | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| PR #83 | `a293f5958b31548ccec7591b653eff2857ae9a90` |
| **F12 functional tip (frozen)** | `1ec0e4da782ed7715a543be23f79bc0f10a28af2` |
| F12 evidence head (package descent) | `2c5d5ec92f0a113245aa7b22ae73643208bbb7d1` |
| Closure | 43 paths / `08c2d46d7ff0d7e80d4df30342ca804cd7f1ddc408951491f77d5bb92ce1157b` |
| Disposable (only) | `jkorwnwwmdeflfntxntl` |
| Production (reject) | `llbnliixczcqfftxpsmb` |
| CLI pin | `2.117.0` |
| Existing F12 plan | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F12_LOCAL_SYNTHETIC_20260917/PROPOSED_HOSTED_REQUAL_PLAN.md` |
| Existing F12 plan SHA-256 | `344b1072e204803e82bb7f994481dd8a3cd6307566d058443b40b90d329deea7` |
| Existing F12 evidence-index.sha256 | `2527aa7056939eeb88dcf2822ed3cf10358b2945f340ef66f745d431b0d8ae0d` |

## 1. Already-completed work (do not reopen)

From existing F12 package / plan at evidence tip `2c5d5ec92f0a113245aa7b22ae73643208bbb7d1`:

- Three local code defects closed pending independent verification (live repair orchestration; immutable Checkpoint A receipt; structured Error through catch).
- Offline wipe rejection proof: `wipeToBaselineStillRejected=true` / `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`.
- Remaining HOLD already disclosed: **`F12-RESET-HOLD-HISTORY-OR-F3-OBJECTS`**.
- Offline: `noResetOccurred=true`, `noServiceConnection=true`, transports disabled.
- Hosted requalification **not run**. Disposable **not reset**.

This package adds reset-scope design + historical F8/F9 reconciliation only. It does **not** relabel inherited results as fresh.

## 2. Precise reset gap from F12 tip `1ec0e4da782ed7715a543be23f79bc0f10a28af2`

### Pinned entrypoint / guards / supported arguments

| Item | F12 tip fact |
|------|----------------|
| Qualify entrypoint | `scripts/qualify-f3-db-push-disposable.mjs` |
| Wipe library | `scripts/lib/f3-db-push-wipe.mjs` (`planWipe` / `buildWipeSql`) |
| Inventory classifier | `scripts/lib/f3-db-push-inventory.mjs` (`classifyInventory`) |
| Supported qualify argv | `--no-wipe --prep-floor --sequence-f3` |
| Forbidden apply flag | `--wipe-to-baseline` → `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH` |
| Eligible wipe transport | gated `psql -f` of `buildWipeSql` (**not** the wipe flag) |

### Tip script identities @ `1ec0e4da782ed7715a543be23f79bc0f10a28af2`

| Path | git blob | content SHA-256 | bytes |
|------|----------|-----------------|-------|
| `scripts/qualify-f3-db-push-disposable.mjs` | `163448d92c6d3035ee418435545a2166d53d1c6a` | `3116906451a3d08c481548583a60be1efbef1cffa760a8b3fdd6846992526299` | 148611 |
| `scripts/test-f3-db-push-harness.mjs` | `c76e6814dfee117916ecfab8f34225b4eb7f4bdb` | `a507653ff237c1223d596358ce61f00cfe1588e49739d51ad6588b1d42aeb4ba` | 380897 |
| `scripts/lib/f3-db-push-repair-safety-gate.mjs` | `d22fb1660f06ba36403c94c9b5ca9bdafaad8a21` | `405e1c5a672c30895ca2089c1eb078605551a2725699672bb51dfd7c43f205df` | 2039958 |
| `scripts/lib/f3-db-push-wipe.mjs` | `43f728335922ec53338a0ca1766b6e3fe99c772a` | `c0d2224bcabefa0de4cfac6cac86db174d6334bb6634cd8d81b93b106c36e7bb` | 5708 |
| `scripts/lib/f3-db-push-inventory.mjs` | `2825b2691458439bb3c3b3a2b1faa8b76b6662ff` | `28e7a9606dc343c57595bd60adeb345ff0bd37798a7cd22825b2fc1fa2615da2` | 13050 |
| `scripts/lib/f3-db-push-pins.mjs` | `14c99b61638b0b14ad8a55054bfe0a6e4d41aab2` | `9ce282bed1c4ea3b81f0e2ba9bedd5c7a928ecdccc1e23c867c86ac0f8969412` | 8485 |

### Exact conditions producing `F12-RESET-HOLD-HISTORY-OR-F3-OBJECTS`

From `classifyInventory` (F12 tip `scripts/lib/f3-db-push-inventory.mjs`):

1. `financialPresent = financial_private || financial_core || financial_ledger_epochs` → ambiguous `financial_object` → **HOLD**
2. `historyRows = Number(schema_migrations_rows) > 0` → ambiguous `schema_migrations_rows` → **HOLD**
3. Any other non-failed-floor extras → **HOLD**
4. `planWipe` returns `action: "HOLD"` when verdict is neither `CLEAN_BASELINE` nor `WIPE_ELIGIBLE`
5. `buildWipeSql` throws `F3_WIPE_AMBIGUOUS_HOLD` on HOLD
6. Wipe library **REFUSE**s SQL containing `DROP SCHEMA`

Qualify offline procedure encodes remainingHold id **`F12-RESET-HOLD-HISTORY-OR-F3-OBJECTS`**: pinned wipe HOLDs when `schema_migrations_rows>0` or `financial_*` present; **no authorized DELETE** for PREASSIGNED versions/names exists in pinned source. Do not invent that SQL as if it were already supported. Do not use `--wipe-to-baseline`.

### Supports vs deliberately rejects vs missing

| Class | Behavior |
|-------|----------|
| **Supports** | `CLEAN_BASELINE` → no mutation; `WIPE_ELIGIBLE` → drop **failed-floor catalog only** (00001–00029 + partial 00030) via `buildWipeSql` + gated `psql -f`; managed schemas preserved; never drop `storage.buckets` |
| **Deliberately rejects** | `--wipe-to-baseline` (`F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`); ambiguous inventory; `DROP SCHEMA` inside wipe SQL; production `llbnliixczcqfftxpsmb` |
| **Missing** | Authorized `DELETE` for PREASSIGNED `20260913173000`–`005` / PREASSIGNED_NAMES; DROP of F3 `financial_*` schemas/objects; any supported qualification-reset entrypoint on tip `1ec0e4da782ed7715a543be23f79bc0f10a28af2` |

### Fresh founder authorization required for

- Any live disposable access / inventory / reset / hosted qualify
- Any SQL deleting PREASSIGNED history or dropping `financial_*` F3 residue
- Any new functional candidate adding a supported qualification-reset path
- Execution of the NEW/UNAPPROVED procedure in §4

## 3. Earlier recorded F8/F9 resets (preserved evidence)

| Field | F8 | F9 |
|-------|----|----|
| Method | `proven_qualification_reset_sql` | `proven_qualification_reset_sql` |
| Restart at | `00118` | `00118` |
| Reset count | 1 | 1 |
| SQL SHA-256 | `0d3de029828173d5287694e61b4ca3394c4a57e81182cade059bf88d86515011` | `0d3de029828173d5287694e61b4ca3394c4a57e81182cade059bf88d86515011` (identical bytes) |
| Functional SHA (artifact) | `83c48192ef0309ae2ebdd1f087994319b19fc024` | `268f974a1adec7d3525beb850f7768137262c135` |
| Project ref | `jkorwnwwmdeflfntxntl` | `jkorwnwwmdeflfntxntl` |
| Production contacted | `false` | `false` |
| Pre-reset class | `NOT_CLEAN` ambiguous=["financial_schemas","financial_public_tables","f3_history"] | (F9 pre-inventory: see hosted package if needed) |
| Post-reset class | `CLEAN_BASELINE` | CLEAN_BASELINE (F9 FOUNDER_REPORT / reset-result) |

**Procedure (evidence):** founder-authorized **qualification-reset SQL** applied once via gated psql — **NOT** `--wipe-to-baseline`, **NOT** `buildWipeSql`. SQL drops `financial_core` / `financial_private`, listed public tables/functions/types, and **DELETE**s six history versions matching PREASSIGNED timestamps.

**Can it support this qualification under current constraints?**  
**No as an F12-supported command.** Tip `1ec0e4da782ed7715a543be23f79bc0f10a28af2` HOLDs on that inventory and has no qualification-reset entrypoint. F8/F9 SQL is **historical evidence** of a prior founder-authorized procedure — **not** newly approved for F12, and **not** claimed as previously approved for tip `1ec0e4da782ed7715a543be23f79bc0f10a28af2`. Re-use requires **fresh founder authorization** and must be labeled **NEW and UNAPPROVED** relative to frozen F12 functional source.

Preserved copies: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F12_RESET_PROPOSAL_20260917/historical-f8-f9/`

## 4. Complete proposed reset scope (**NEW / UNAPPROVED**)

### Target

- Exact disposable: `jkorwnwwmdeflfntxntl` only
- Reject: `llbnliixczcqfftxpsmb`; transaction pooler :6543; Management API apply permanently disqualified

### Object allowlist + history predicates

**Schemas:** `financial_core`, `financial_private` (DROP SCHEMA … CASCADE) — from F8/F9 historical SQL

**Public tables / functions / types / extension / canary:** exact statements in historical SQL `0d3de029828173d5287694e61b4ca3394c4a57e81182cade059bf88d86515011`

**Migration-history predicates (F12 tip PREASSIGNED):**

| File | version | name |
|------|---------|------|
| `00118_f3_bounded_financial_epoch_foundation.sql` | `20260913173000` | `f3_bounded_financial_epoch_foundation` |
| `00119_f3_01_core_ledger_foundation.sql` | `20260913173001` | `f3_01_core_ledger_foundation` |
| `00120_f3_02_secure_posting_idempotency.sql` | `20260913173002` | `f3_02_secure_posting_idempotency` |
| `00121_f3_03_projection_read_proof.sql` | `20260913173003` | `f3_03_projection_read_proof` |
| `00122_f3_04_correction_reversal.sql` | `20260913173004` | `f3_04_correction_reversal` |
| `00123_f3_05_opening_cash_command.sql` | `20260913173005` | `f3_05_opening_cash_command` |

Proposed DELETE predicate:  
`DELETE FROM supabase_migrations.schema_migrations WHERE version = '<version>' AND (name = '<name>' OR name IS NULL OR name = '');`

### Dependency / cascade

`DROP SCHEMA … CASCADE` removes contained `financial_*` objects; F8 notices showed FK cascades within allowlisted floor tables. Stay within allowlist.

### Required scripts / transports / identities

Tip blobs in table above. Transports (proposed; placeholders only):

1. Read-only inventory via existing `INVENTORY_CAPTURE_SQL` + disposable credentials — **not run here**
2. Offline `classifyInventory` / `planWipe` — expect HOLD today if history/financial present
3. **NEW/UNAPPROVED** qualification-reset SQL via gated `psql -X -v ON_ERROR_STOP=1 -f` — **not** `--wipe-to-baseline`
4. `proveCleanBaseline` / `evaluatePreStubFloorCleanCheck`
5. Exactly one: `node scripts/qualify-f3-db-push-disposable.mjs --no-wipe --prep-floor --sequence-f3`
6. Apply/repair remain separate CLI `2.117.0` commands

### Target-binding + stop-before-mutation

1. HEAD equals authorized functional tip
2. Connection ref/host/user == `jkorwnwwmdeflfntxntl`; refuse `llbnliixczcqfftxpsmb`
3. Live inventory must match allowlist + PREASSIGNED history — else **STOP**
4. No mutation until binding + allowlist checks pass
5. Stop on first unexpected failure; no silent patch; no second reset

### CLEAN_BASELINE; preserve unrelated

Post-reset must classify `CLEAN_BASELINE`. Managed schemas preserved. Unrelated history outside PREASSIGNED must not be deleted — **live verification required** (not performed now).

### One constrained reset

Exactly **one** constrained reset + exactly **one** qualify from 00118.

### Expected vs live

| Kind | Status |
|------|--------|
| Expected post-reset shape | From F8 post-reset inventory: `CLEAN_BASELINE`, F3 history absent, financial schemas/tables absent |
| Live disposable inventory now | **NOT CAPTURED** |
| PREASSIGNED rows currently present? | **UNKNOWN live** (F8 pre-reset had all six) |

### Proposed commands (placeholders — DO NOT EXECUTE)

```bash
# PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE
git rev-parse HEAD  # must equal authorized functional tip
# DO NOT: node scripts/qualify-f3-db-push-disposable.mjs --wipe-to-baseline  → F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH

# 1) Read-only inventory (credential placeholders only)
# supabase db query --db-url "$DISPOSABLE_DB_URL" --output-format json  # INVENTORY_CAPTURE_SQL

# 2) Offline classifyInventory/planWipe
#    CLEAN_BASELINE → skip mutation
#    WIPE_ELIGIBLE (failed-floor only) → gated psql -f buildWipeSql
#    HOLD (F12-RESET-HOLD-HISTORY-OR-F3-OBJECTS) → do NOT use wipe library

# 3) NEW/UNAPPROVED (not an F12-supported command):
# psql -X -v ON_ERROR_STOP=1 -f docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F12_RESET_PROPOSAL_20260917/proposed-procedure/PROPOSED_QUALIFICATION_RESET.sql "$DISPOSABLE_DB_URL"

# 4) proveCleanBaseline / evaluatePreStubFloorCleanCheck

# 5) exactly one qualify
node scripts/qualify-f3-db-push-disposable.mjs --no-wipe --prep-floor --sequence-f3
```

Proposed SQL SHA-256: `1b8cc9c21a14f1016329f7b49681566d37841de8877b369c596f687e57d72ae1`  
**Label: NEW and UNAPPROVED — not an existing supported command on tip `1ec0e4da782ed7715a543be23f79bc0f10a28af2`.**

## 5. Future execution proposal (prominent)

# PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE

### Functional tip compatibility (honest)

**Requires a new functional candidate first** for any **supported** qualification-reset command.

**Does NOT operate as a supported feature on unchanged F12 functional SHA `1ec0e4da782ed7715a543be23f79bc0f10a28af2`.** Tip `1ec0e4da782ed7715a543be23f79bc0f10a28af2` deliberately HOLDs and lacks DELETE/DROP-SCHEMA qualification-reset support.

A founder may separately authorize the **NEW/UNAPPROVED** one-shot SQL in §4 as an out-of-band disposable procedure; that is **not** F12-tip compatibility and still requires fresh authorization, dedicated disposable credentials, evidence, and independent review.

### Retain

- Dedicated disposable credentials securely; production-ref rejection
- CLI `2.117.0`; separate apply/repair
- One constrained reset + one qual from 00118
- Deliberate vs unexpected failures; stop on unexpected
- No silent patch / rerun / second reset
- Evidence + independent review afterward
- No Management API apply; no new project; no broadened scope
- `--wipe-to-baseline` remains rejected

## 6. Additional implementation required (NOT APPLIED)

**Yes — for a supported path.** Proposed scope only:

| Proposed path | Minimal change (proposed) |
|---------------|---------------------------|
| `scripts/lib/f3-db-push-qualification-reset.mjs` (**new**) | Allowlisted planner separate from wipe; PREASSIGNED DELETE + financial_* DROP; refuse production/extras |
| `scripts/lib/f3-db-push-inventory.mjs` | Optional `QUALIFICATION_RESET_ELIGIBLE` when ambiguous ⊆ allowlist |
| `scripts/qualify-f3-db-push-disposable.mjs` | Explicit founder-gated flag ≠ `--wipe-to-baseline` (still rejected) |
| `scripts/test-f3-db-push-harness.mjs` | Local cases: allowlist eligible; extras HOLD; wipe flag still rejected; production refuse |

**DO NOT APPLY** these runtime changes in this packaging. See `proposed-implementation/PROPOSED_DIFF_NOTES.md`.

## 7. Closure path 42→43

| Field | Value |
|-------|-------|
| F11 closure | 42 files (digest must not be reused as F12) |
| F12 closure | 43 files / `08c2d46d7ff0d7e80d4df30342ca804cd7f1ddc408951491f77d5bb92ce1157b` |
| **Additional input** | `scripts/lib/f3-db-push-wipe.mjs` |
| **Reason** | F12 qualify imports wipe for offline reset-plan / HOLD disclosure; `buildFunctionalRecursiveRuntimeClosure` recursive walk includes that import. Absent from F11 closure set. |

## 8. Unresolved questions (no assumptions)

1. Live disposable inventory now — **not captured**
2. Non-PREASSIGNED `schema_migrations` rows to preserve — **unknown live**
3. Founder chooses (A) new functional candidate with supported qualification-reset, or (B) one-shot NEW/UNAPPROVED SQL only
4. Live `name` column values for the six versions — **unknown live**
5. Confirm live history versions equal tip PREASSIGNED_VERSIONS byte-for-byte before DELETE

## Verbatim floor limitation

**DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT**
