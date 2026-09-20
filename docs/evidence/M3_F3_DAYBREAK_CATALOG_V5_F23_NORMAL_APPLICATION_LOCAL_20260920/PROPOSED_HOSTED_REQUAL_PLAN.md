# PROPOSED HOSTED REQUALIFICATION PLAN — PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE

**Status:** PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE
**Local application status:** HOLD: F23_FINGERPRINT_MISMATCH
**Fault-injection status:** HOLD: F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED (authenticated negative test; re-executed)
**QA identity:** NOT CLAIMED
**Overall status:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN
**Label:** F23 NORMAL APPLICATION LOCAL — PROPOSED HOSTED REQUAL ONLY
**Policy / success identity:** `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`
**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**
This document does not authorize wipe, hosted reset, credential use, Daybreak/Astra contact, Management API apply, enriched hosted capture, or merge.
This local change supplies **no hosted authority**.

## Bound identities (rebound to F23 functional tip)

| Role | Value |
|------|-------|
| Functional tip (frozen) | `77fd61dbf51652acabec0093d2a8549524b2dd75` |
| Evidence tip (package content) | `dccaa795c800a2fe0b4f370b6234f875bd2655d9` |
| Starting #84/#85/#86/#126 head | `adb6ade2233f90aa34459bc8ac4fb381d23971a4` |
| F22 functional ancestor | `f1d30b28830db902962467f801932254997e64c3` |
| F22 QA content | `f18331337c36e7c50cd1323c0202a298a4704e03` |
| Policy / success / already-clean | `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` |
| Runtime closure | `8b6bf5aff5f4448df9a7bc7791b9db63c24d800c43dbd81a39dfcef141ecc95a` (count 46) |
| Verification union | `9c2e5d63bd30723b331d49c76fb66d05951e1ef68b9615c907ab8bf23c597815` (count 48) |
| Scope/SQL identity SHA-256 | `d95d96e02a3a1844977d852fa23a64f742b79b5f767984b6a2d4512cbe02632f` |
| CLI pin | `2.117.0` |
| Local application HOLD | `F23_FINGERPRINT_MISMATCH` |
| Fault-injection HOLD | `F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED` |
| PRs | #84 / #85 / #86 OPEN DRAFT UNMERGED DAYBREAK HOLD; #126 non-authoritative; builder #127 |

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**

## Supported verification modes (after future authorization only)

Any future hosted authorization **must identify the selected verification mode** before database operations.

1. `--verification-mode=fault-injection` (default if unspecified): induced history failure; repair-safety gate; do not claim application complete.
2. `--verification-mode=normal-application`: inject objects must be absent; apply frozen 00118–00123; exact history identities; hosted-oracle fingerprints; QUALIFICATION PASS only after all six complete with exact fingerprints. Does **not** claim repair was exercised.

Unknown mode → `F23_UNKNOWN_VERIFICATION_MODE` HOLD before identity/DB work.

## Supported commands (after future authorization only)

1. Exactly one constrained `--qualification-reset` under preserve policy `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`.
2. Exactly one complete qual-from-00118 with an **explicit** `--verification-mode`.
3. Stop on unexpected failure. No second reset. No uncertain replay.
4. No wipe, CASCADE, Management API apply, or privilege expansion.
5. Enriched hosted capture is separately authorized.
6. Historical 188 hosted functions remain CANNOT CONFIRM; local 264 tuples do not authenticate hosted ownership.

### Exact reset command (NOT AUTHORIZED)

```bash
node scripts/qualify-f3-db-push-disposable.mjs --qualification-reset --founder-authorization-artifact=[FUTURE_F23_ARTIFACT] --evidence-out=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_HOSTED_REQUAL/hosted/qualification-reset/qualify-result.json
```

### Exact normal-application qualify-from-00118 command (NOT AUTHORIZED)

```bash
node scripts/qualify-f3-db-push-disposable.mjs --no-wipe --prep-floor --sequence-f3 --floor-mode=stub-live-pin --verification-mode=normal-application --evidence-out=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_HOSTED_REQUAL/hosted/qualify-from-00118/qualify-result.json
```

### Exact fault-injection qualify command (NOT AUTHORIZED; negative test only)

```bash
node scripts/qualify-f3-db-push-disposable.mjs --no-wipe --prep-floor --sequence-f3 --floor-mode=stub-live-pin --verification-mode=fault-injection --evidence-out=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_HOSTED_REQUAL/hosted/qualify-fault-injection/qualify-result.json
```

## Remaining qualification requirements (not waived)

1. **Hosted-oracle fingerprint equality** after each of 00118–00123. Local ubuntu/fixture ACL/owner substitution does **not** satisfy this. Founder must decide whether local-fixture identity may be excluded for local application completion, or whether equality remains mandatory.
2. **Post-commit filename-version repair** after objects remain. Local CLI atomic rollback cannot produce this split. Fresh F22 refuse is authenticated; post-commit repair remains unexercised and mandatory under the approved contract. Founder must decide whether a hosted filename-version split can be authorized. Do not mark unapplied SQL applied or manufacture committed objects.
3. Dedicated disposable credential provision after future authorization (do not acquire now).
4. Historical hosted 188-function ownership remains CANNOT CONFIRM.

## Dedicated disposable credential provision (AFTER future authorization)

Do **not** acquire credentials now.

When a later ticket authorizes hosted requal:

1. Provision a **new dedicated disposable** password/URL for project `jkorwnwwmdeflfntxntl` only.
2. Input mechanism: process-local environment consumed by the existing gated constructors; never commit, never print, never write into founder-auth artifacts.
3. Secure handling: isolated subprocess env; `sanitizeForLog` / evidence sanitization before hash; no `PGPASSWORD` inheritance into unsanitized logs.
4. Target checks before any SQL: reject `llbnliixczcqfftxpsmb`; reject pooler `:6543`; require disposable ref `jkorwnwwmdeflfntxntl`.
5. Identify verification mode first. One constrained reset + one complete qualification from 00118. Stop on unexpected failure.

## Target

- Disposable only: `jkorwnwwmdeflfntxntl`
- Production rejection: `llbnliixczcqfftxpsmb`
- Daybreak / Astra contact is forbidden

## Wipe / preserve

- Wipe remains `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`
- Success identity is `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` — not `CLEAN_BASELINE`
- 43 dependency tuples (31 + 12 historicalNoticeOnly) unchanged
- Constrained history scope and target guards unchanged

## Hosted 188 — CANNOT CONFIRM

Local 264 `deptype='e'` tuples do not authenticate hosted ownership. Enriched hosted capture is separately authorized.

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**
