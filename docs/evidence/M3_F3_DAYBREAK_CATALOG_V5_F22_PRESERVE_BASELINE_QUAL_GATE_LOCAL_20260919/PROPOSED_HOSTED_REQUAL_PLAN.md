# PROPOSED HOSTED REQUALIFICATION PLAN — PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE

**Status:** PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE
**Local status:** HOLD: F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED
**QA identity:** NOT CLAIMED
**Overall status:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN
**Label:** F22 PRESERVE-BASELINE QUAL GATE — PROPOSED HOSTED REQUAL ONLY
**Policy / success identity:** `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`
**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**
This document does not authorize wipe, hosted reset, credential use, Daybreak/Astra contact, Management API apply, enriched hosted capture, or merge.

## Bound identities (rebound to F22 functional tip)

| Role | Value |
|------|-------|
| Functional tip (frozen) | `f1d30b28830db902962467f801932254997e64c3` |
| Starting head | `a38db9c1c0e122dcc5900e1bd41c3857ecca6bd5` |
| F21 functional ancestor | `3fe7314ab7cfb2abbcd66d8eb09f26ba2ed0a9e0` |
| Contract tip | `b7d16544cdbb86ce47baba329835bd93dcb16d6d` |
| Policy / success / already-clean | `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` |
| Runtime closure | `89e46973eb9312e35dff9efda30505b0c9ce140d83ff7246f7fd9c12097b8a3b` (count 45) |
| Verification union | `64dfd55296d3c287a56499a47e749122269f00311920f5f3ad9c4d39b56dbc1c` (count 48) |
| Scope/SQL identity SHA-256 | `d95d96e02a3a1844977d852fa23a64f742b79b5f767984b6a2d4512cbe02632f` |
| CLI pin | `2.117.0` |
| Remaining local HOLD | `F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED` |
| PRs | #84 / #85 / #86 OPEN DRAFT UNMERGED DAYBREAK HOLD; #126 |

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**

## Supported commands (after future authorization only)

1. Exactly one constrained `--qualification-reset` under preserve policy `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`.
2. Exactly one complete qual-from-00118: `--no-wipe --prep-floor --sequence-f3 --floor-mode=stub-live-pin`.
3. Stop on unexpected failure. No second reset. No uncertain replay.
4. No wipe, CASCADE, Management API apply, or privilege expansion.
5. Enriched hosted capture is separately authorized.
6. Historical 188 hosted functions remain CANNOT CONFIRM; local 264 tuples do not authenticate hosted ownership.

### Exact reset command (NOT AUTHORIZED)

```bash
node scripts/qualify-f3-db-push-disposable.mjs --qualification-reset --founder-authorization-artifact=[FUTURE_F22_ARTIFACT] --evidence-out=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F22_PRESERVE_BASELINE_HOSTED_REQUAL/hosted/qualification-reset/qualify-result.json
```

Missing verdict must HOLD `F21_PRESERVE_BASELINE_VERDICT_REQUIRED`.

### Exact qualify-from-00118 command (NOT AUTHORIZED)

The hosted path must now pass the F22 preserve-baseline pre-floor gate (fresh capture + typed membership). Historical CLEAN_BASELINE remains valid for empty post-wipe inventory.

```bash
node scripts/qualify-f3-db-push-disposable.mjs --no-wipe --prep-floor --sequence-f3 --floor-mode=stub-live-pin --evidence-out=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F22_PRESERVE_BASELINE_HOSTED_REQUAL/hosted/qualify-from-00118/qualify-result.json
```

## Dedicated disposable credential provision (AFTER future authorization)

Do **not** acquire credentials now.

When a later ticket authorizes hosted requal:

1. Provision a **new dedicated disposable** password/URL for project `jkorwnwwmdeflfntxntl` only.
2. Input mechanism: process-local environment consumed by the existing gated constructors; never commit, never print, never write into founder-auth artifacts.
3. Secure handling: isolated subprocess env; `sanitizeForLog` / evidence sanitization before hash; no `PGPASSWORD` inheritance into unsanitized logs.
4. Target checks before any SQL: reject `llbnliixczcqfftxpsmb`; reject pooler `:6543`; require disposable ref `jkorwnwwmdeflfntxntl`.
5. One constrained reset + one complete qualification from 00118. Stop on unexpected failure.

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

## Local remaining HOLD inherited by this plan

Local CLI 2.117.0 against run-owned PostgreSQL atomically rolled back 00118 when history inject blocked `schema_migrations` INSERT. Hosted filename-version split (objects remain) was **not** reproduced locally. This plan must not assume local complete-through-00123 success.

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**
