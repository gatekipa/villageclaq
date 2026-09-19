# Commands run by independent F18 QA

Reviewed pin: `ca2c0d536037da8c7f55627ac1694cacb932d1d7`  
Worktree: `[REDACTED_PATH]/f18-ca2c0d5`  
Date (UTC): 2026-09-18

## Local PostgreSQL (this reviewer)

LOCAL_PG was unavailable at start (`psql` missing). Installed and started locally:

```bash
# PGDG PostgreSQL 17.11
sudo apt-get install -y postgresql-17 postgresql-client-17
sudo pg_ctlcluster 17 main start
sudo -u postgres psql -c 'CREATE ROLE ubuntu SUPERUSER LOGIN;'
psql -h /var/run/postgresql -U ubuntu -d postgres -Atc 'SHOW server_version;'
# → 17.11 (Ubuntu 17.11-1.pgdg24.04+2)
```

No hosted/disposable/production URL. Admin used local maintenance `postgres` only to create task-owned `f3_*` databases via the committed fixture.

## Functional checkout

```bash
git worktree add [REDACTED_PATH]/f18-ca2c0d5 ca2c0d536037da8c7f55627ac1694cacb932d1d7
cd [REDACTED_PATH]/f18-ca2c0d5
```

## Gates

```bash
npm run test:f3-reset-design
# 30 tests, 30 pass, 0 fail

npm run test:f3-reset
# 62 tests, 62 pass, 0 fail

npm run test:f3-db-push
# 243 tests, 243 pass, 0 fail

node scripts/prove-f3-qualification-reset-local.mjs
# 24 checks / 9 scenarios / 8 executed TX / 33 pass / LOCAL_PG_EXECUTED
```

## Independent A/B/C requalify

- Process E2E: `[REDACTED_PATH]/f18-qa-process-e2e.mjs` importing committed modules from the `ca2c0d5` worktree only (not a functional-script edit).
- Lock/reparse: `evaluateBackendBoundLockProof` + `attestQualificationResetReparse` on this run’s helper JSON.

## Not run

- Hosted requalification
- Disposable project contact
- Production contact
- Migration apply 00001–00117
