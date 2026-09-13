# M3 F3 External Migration-Ledger Remediation — 2026-09-13

**VERDICT: EXTERNAL-LEDGER REMEDIATION PASS**

**DO NOT MERGE.**  
**DO NOT APPLY 00118+ TO PRODUCTION.**  
**NO F3-06 UI. NO PRODUCTION FINANCIAL WRITES. NO M4.**  
**FCG-1 IS NOT CLOSED.**  
**NO CONTACT WITH ASTRA OR DAYBREAK.**  
**`migration repair --status applied` IS NEVER AUTOMATIC AND WAS NOT USED ON PRODUCTION.**

Draft PR: https://github.com/gatekipa/villageclaq/pull/84  
Branch: `feat/m3-f3-01-05-forward-foundation-9b17` (additive commits only; draft/unmerged)

## Supersession (explicit)

| Pin | SHA | Status |
|-----|-----|--------|
| Old functional | `fc3d4ff8cb59ad09abdc07033cbfd20cec75e585` | SUPERSEDED |
| Old evidence tip | `acd3b41bc04474cb9446e3d889c2b28425fdd901` | SUPERSEDED |
| **NEW functional SHA** | `968660d4e079ceb6c8d081be9f985597eaed0465` | CURRENT |
| Evidence tip | docs-only commit after that SHA | CURRENT |

The prior 14/14 suite remains valid as **SQL pre-commit rollback only**. Any implication that the in-transaction `schema_migrations` insert of source labels `00118`…`00123` was CLI-equivalent or used the production history key is **withdrawn**.

## 1. Real runner pin

| Item | Established value |
|------|-------------------|
| Installed CLI | **Supabase CLI 2.117.0** (`supabase --version`) |
| Production apply | Management API **FILE-STREAMED** `POST /v1/projects/{ref}/database/migrations` `{ query, name }` |
| Large SQL | MCP `apply_migration` **DISQUALIFIED** (Cut 1) |
| Not production apply | `supabase db push`, `supabase migration up` |
| History version format | `YYYYMMDDHHMMSS` (14-digit UTC timestamp generated at apply) |
| History name | snake_case after stripping source `NNNNN_` prefix |

S0/M2 mapping precedent (source label ≠ production history version):

| Source | Production version | Production name | Runner |
|--------|--------------------|-----------------|--------|
| 00114 | `20260911183755` | `s0_p0a_cut1_active_authorization` | Management API file-stream |
| 00115 | `20260912033612` | `s0_p0b_cut2_notification_queue` | Management API file-stream |
| 00116 | `20260912134123` | `s0_p0c_cut3_storage_path_fail_closed` | Management API file-stream |
| 00117 | `20260912174049` | `m2_notification_policy_foundation` | connected `apply_migration` MCP (small SQL) |

F3 00118+ files are large → eventual production apply is expected to follow Cut 1–3 Management API file-stream.

CLI `--help` captured from 2.117.0 (disposable pin):

- `supabase migration repair [flags] [<version...>]`
- `--status` choices: `applied`, `reverted` (required for a useful repair)
- `--db-url` percent-encoded connection string
- CLI repair **requires** a local lookup file `supabase/migrations/<version>_*.sql` or it errors `LegacyMigrationFileNotFoundError`
- Unix-socket URLs of the form `postgresql://ubuntu@/db?host=/var/run/postgresql` fail CLI parse (`LegacyDbConfigParseUrlError`); disposable proofs used `postgresql://ubuntu@127.0.0.1:5432/<db>`

## 2. Failure-mode distinction

| Mode | Ordering | Objects after failure | History | Suite |
|------|----------|----------------------|---------|-------|
| **Before final COMMIT** | inject inside the migration transaction → rollback | absent / unchanged predecessor | source-label row rolled back | `test-financial-f3-migration-atomicity.mjs` **14/14** (SQL only; not CLI-equivalent) |
| **After COMMIT / before external history** | file-stream SQL COMMIT → external INSERT → trigger fail | secured objects **remain** | target timestamp **absent** | `test-financial-f3-external-ledger.mjs` **6/6** plus runner/runbook pins |

Injected failure for mode 2: disposable `BEFORE INSERT` trigger on `supabase_migrations.schema_migrations` that raises **only** for the target timestamp. Removed before founder CLI repair.

## 3. Faithful disposable equivalent (not a different production runner)

Cannot point Management API at local PG. Disposable equivalent preserves the **same two-phase order** as Management API file-stream apply:

1. File-stream exact authorized SQL (`psql -f`; migration `COMMIT` happens here)
2. Separate `INSERT` into `supabase_migrations.schema_migrations(version, name)` with a generated 14-digit timestamp + snake_case name
3. Runner exits nonzero if phase 2 fails; SQL stays committed

`supabase db push` was not used as the apply runner and is not claimed as production.

## 4. Per-migration proof (all six)

For each of 00118–00123 on disposable PostgreSQL 17.11:

1. Legitimate pre-target state (stub + HGP pin + earlier F3 files via the same runner)
2. Target-version-specific BEFORE INSERT trigger
3. Exact migration through the disposable Management API-equivalent runner
4. Proved: final COMMIT reached; external history insert failed; nonzero exit; secured objects remain; target timestamp absent
5. Trigger removed only
6. Catalog fingerprint (schemas/tables/types/views/functions; defs+owners; empty `search_path`; RLS+policies; grants/revokes/ACLs; HGP pin) captured; recognition allowlist `["manual_income"]`; SQL digest unchanged
7. Founder CLI repair with **actual** syntax:
   `supabase migration repair <ACTUAL_TIMESTAMP> --status applied --db-url <tcp-url> --workdir <disposable lookup dir> --yes`
8. After repair: exact timestamp+name recorded; no catalog drift; skip-if-present does not rerun SQL; next legitimate migration proceeds without object-collision

CLI repair used a disposable workdir copy named `<timestamp>_<name>.sql` whose SHA-256 equals the frozen authorized file. Repo `00118`–`00123` filenames were not renamed.

## 5. Founder runbook

`docs/runbooks/F3_FOUNDER_CONTROLLED_MIGRATION_REPAIR.md` — write+test only; **NOT for production use**. Repair is never automatic. All pre-repair gates required; any mismatch → HOLD.

## 6. Frozen digests (byte-identical)

| File | SHA-256 |
|------|---------|
| `00118_f3_bounded_financial_epoch_foundation.sql` | `517774fd883ecc8c8ba7d2e287c7245a1289b21623c839f594b0801611968f3c` |
| `00119_f3_01_core_ledger_foundation.sql` | `9b09a733ed848e2a88a894db0815bd0f33f86335b58f7c9cd58845b6607d785d` |
| `00120_f3_02_secure_posting_idempotency.sql` | `4b870418ea15160a7aec0e6df707d9c8a3afc435f2d8bd1c861e0af7c47eb505` |
| `00121_f3_03_projection_read_proof.sql` | `568ae0b15b1b6e6c0a7effd9e9b5644a294cc22d76dbbf0e6714a28888825cf5` |
| `00122_f3_04_correction_reversal.sql` | `fd2c6e8729d1c7983421804b5f028edd16170c9f9056c8db2f3994f4dff8bdf9` |
| `00123_f3_05_opening_cash_command.sql` | `848b7cbe7e4e20e2e284d88f9954be0be8ffdfe4fc6d7c649e536d0c09aab699` |

## 7. Fresh disposable qualification (do not reuse old counts)

| Suite | Result |
|-------|--------|
| Post-commit / pre-ledger failure+repair (00118–00123) | **6/6 PASS** |
| External-ledger suite (6 + runner pin + digest/label + runbook) | **9/9 PASS** |
| SQL pre-commit atomicity | **14/14 PASS** |
| Recognition direct | **40/40 PASS** |
| F3-01 DB | **43/43 PASS** |
| F3-02 DB | **159/159 PASS** |
| F3-02 Astra | **169/169 PASS** |
| F3-03 DB | **25/25 PASS** |
| F3-03 Astra | **80/80 PASS** |
| F3-04 DB | **23/23 PASS** |
| F3-04 Astra | **170/170 PASS** |
| F3-05 DB | **31/31 PASS** |
| F3-05 Astra | **118/118 PASS** |
| Post-S0 regression | **14/14 PASS** |
| Combined `npm run test:f3` | **895/895 PASS** |
| M2 combined `npm run test:m2` | **111/111 PASS** |
| M2 static security | **9/9 PASS** |
| Cut 1 static | **11/11 PASS** |
| Cut 2 non-regression | **20/20 PASS** |
| Cut 3 storage buckets | **11/11 PASS** |
| `./node_modules/.bin/tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** (dummy URL `https://example.invalid.supabase.local` — not production) |

PostgreSQL 17.11 (Ubuntu 17.11-1.pgdg24.04+2). Production URL not used.

## Confirmations

- Recognition allowlist EXACTLY `["manual_income"]`
- PR #83 unchanged at `a293f5958b31548ccec7591b653eff2857ae9a90`
- Production unchanged: no apply / SQL / financial writes / storage mutation / queue insert / send / deploy / merge / repair
- No F3-06+ / M4
- No Astra / Daybreak contact
- No force-push
