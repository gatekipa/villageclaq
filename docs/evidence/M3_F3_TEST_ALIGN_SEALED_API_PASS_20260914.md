# M3 F3 — test-align sealed hosted-run APIs PASS (2026-09-14)

## Verdict
**PASS** — local harness aligned to sealed hosted-run APIs.

Supersedes: exact-byte restore HOLD (local harness import gap).

## Tip
- Functional/evidence parent chain tip: `e159bf7762d2674676513ea406a3290f42388aed`
- Parent: `58f767dca033c2044b07c08bb6e018345e4c85b3`
- PRs #84 / #85 / #86: identical tip (OPEN DRAFT)

## Scope
Test-only edits:
- `scripts/test-f3-db-push-harness.mjs`
- `scripts/test-f3-stub-live-pin-floor.mjs`

Six sealed hosted PASS executables **untouched** (0 seal mismatches, 0 closure mismatches).
Migrations **untouched** (0 digest mismatches).

## Alignment
- Drop tip-era imports of non-exported APIs (`objectsPresentFromProbe`, `listIsolatedMigrationFilenames`, `stageIsolatedWorkdirTarget`).
- Exercise sealed public APIs (`rowsFromQuery`, `createIsolatedDbPushWorkdir`, `readAuthorizedSourceBytes`, repair gate).
- Assert sealed floor order includes `public_uuid_generate_v5_wrapper`.
- Source-contract qualify: private `objectsPresentFromProbe`; `syncIsolatedMigrationsThrough` once before first push; retry after repair; poison cleanup before repair.

## Local suites
| Suite | Result |
| --- | --- |
| test:f3-db-push | 70/71 PASS (1 skip) |
| test:f3-recognition | 40/40 PASS |
| test:f3-oracles | 577/577 PASS |
| test:f3-mapi-harness | 22/22 PASS |
| test:f3-local-safety | 45/45 PASS |
| test:m2 | 111/111 PASS |
| test:m2-cut2-nonregression | 20/20 PASS |
| test:storage-buckets | 11/11 PASS |
| test:s0-cut1-active-authorization | 11/11 PASS |
| test:f3-acl-portability | 3 pass / 1 skip / 0 fail |
| tsc | PASS |
| build | PASS |
| test:f3 (full) | 719/313/1 — local PG peer-auth env failures only |

## Still out of scope
No merge, deploy, production, disposable access, hosted requal, Daybreak/Astra.
Hosted qualification remains the stub/live-pin floor limitation PASS (unchanged).
