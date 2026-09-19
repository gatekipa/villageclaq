# Commands run by independent F19 QA

Reviewed pin: `dfbeb11b49f7e9b061a4c700e0335d125ac669e2`  
F18 conceptual pin: `ca2c0d536037da8c7f55627ac1694cacb932d1d7`  
Worktrees: `[REDACTED_PATH]/f19-dfbeb11` and `[REDACTED_PATH]/f18-ca2c0d5`  
Date (UTC): 2026-09-18  
Reviewer bc id: `bc-8c2797cf-e789-5ab9-afd1-ff9a47a05cfa`

## Environment

```bash
uname -a
# Linux cursor 6.12.94+ ... x86_64 GNU/Linux
node -v
# v22.14.0
command -v psql || echo PSQL_MISSING
# PSQL_MISSING
```

Classification: `MUST_LOCAL`. PostgreSQL was **not** installed. F18 concurrency was **not** re-run.

## Functional checkouts (frozen bytes)

```bash
git worktree add [REDACTED_PATH]/f19-dfbeb11 dfbeb11b49f7e9b061a4c700e0335d125ac669e2
git worktree add [REDACTED_PATH]/f18-ca2c0d5 ca2c0d536037da8c7f55627ac1694cacb932d1d7
```

## Gates on F19 tip

```bash
cd [REDACTED_PATH]/f19-dfbeb11
npm run test:f3-reset-design
# 30 tests, 30 pass, 0 fail

npm run test:f3-reset
# 66 tests, 66 pass, 0 fail
# ok 63 F19-A01, ok 64 F19-A02, ok 65 F19-B01, ok 66 F19-B02

npm run test:f3-db-push
# 247 tests, 246 pass, 1 skip (identity GET is skipped without token)
# VillageClaq 242/1 is NOT claimed

node scripts/prove-f3-qualification-reset-local.mjs
# 24 checks / 9 scenarios / 0 executed TX / 33 pass / MUST_LOCAL
```

## Independent four-case + F18 conceptual reproduction

```bash
node [REDACTED_PATH]/f19-qa-independent.mjs [REDACTED_PATH]/f19-qa-out
# imports committed modules only; does not edit functional scripts
# F18 defects reproduced on ca2c0d5; F19 tip closes all four cases
```

## Not run

- Hosted requalification
- Disposable project contact
- Production contact
- Daybreak / Astra
- PostgreSQL install
- F18 backend-bound concurrency re-run
- Migration apply 00001–00117
- Merge
