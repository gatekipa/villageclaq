# M3 F3 `supabase db push` qualification candidate — 2026-09-13

**FILE-BASED RUNNER QUALIFICATION: BLOCKED**

Do **not** convert this artifact to PASS.  
Do **not** claim production approval.  
Do **not** claim hosted db push fidelity PASS.  
Daybreak has **not** approved `db push` as the production runner.

Management API `POST /database/migrations {query,name}` remains **PERMANENTLY DISQUALIFIED**.

`supabase db push` CLI **2.117.0** is a **qualification candidate only**. This VM lacked `VILLAGECLAQ_F3_DISPOSABLE_DB_PASSWORD`. Hosted sequence (floor, six history-failure applies, six repairs, six retry-skips, large-SQL hosted apply) is **NOT RUN**. Local harness + static/DB suites were run fresh. Do not invent hosted PASS.

Chief live preflight on disposable `jkorwnwwmdeflfntxntl` is incorporated exactly below. It does **not** complete the six-file `db push` sequence.

**DO NOT MERGE.**  
**DO NOT APPLY 00118+ TO PRODUCTION.**  
**NO ASTRA / DAYBREAK CONTACT.**  
**DO NOT DELETE OR PAUSE** disposable `jkorwnwwmdeflfntxntl`.  
PR **#84** remains **OPEN DRAFT UNMERGED**. Companion agent branch PR **#85** is also draft.

## Pins

| Pin | Value |
|-----|-------|
| Base main | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| Planning PR #83 (unchanged) | `a293f5958b31548ccec7591b653eff2857ae9a90` |
| PR #84 functional start | `0c2fe83107fe440b46f978baf56ffd12db4f8cd4` |
| Evidence start | `35befd90f16ad37d78857c513831321699230b73` |
| Tip start | `2d9cb67202eb131b7f64a0d5898ded0999bea2e2` |
| Harness functional (first) | `dc7f68371ecee2f5f0dd81650a515da5884f3c88` |
| **Functional SHA** | `f6acf177e11b618fce1d5bc4086f19f78af3ffac` |
| **Evidence SHA** | `e85f56eba087b0c31936ad6e8f68f39305ce806f` |
| **Tip SHA** | `e85f56eba087b0c31936ad6e8f68f39305ce806f` |
| Recognition | exactly `["manual_income"]` |
| Verdict | **BLOCKED** — hosted password absent |
| Production approval | **NOT CLAIMED** |

## Authorized disposable (do not substitute)

| Item | Value |
|------|-------|
| Name | `villageclaq-f3-management-api-disposable-20260913` |
| Ref | `jkorwnwwmdeflfntxntl` |
| Org | `eyztkzkprpmlmcabrfef` |
| Identity host | `db.jkorwnwwmdeflfntxntl.supabase.co` |
| Session-mode pooler | `aws-0-us-east-1.pooler.supabase.com:5432` user `postgres.jkorwnwwmdeflfntxntl` `sslmode=require` |
| Sentinel | `villageclaq-f3-dbpush-20260913-authorized` via `F3_DBPUSH_DISPOSABLE_SENTINEL` |
| Password | env `VILLAGECLAQ_F3_DISPOSABLE_DB_PASSWORD` only (never print / commit / `-p`) |
| Token | optional `VILLAGECLAQ_F3_DISPOSABLE_MGMT_TOKEN` for identity GET only |
| Destructive opt-in | `F3_REMOTE_DESTRUCTIVE_TEST=1` |
| Production ref | `llbnliixczcqfftxpsmb` — **not contacted** |

## Chief live preflight (incorporated exactly)

- Identity **PASS**: name `villageclaq-f3-management-api-disposable-20260913`, org `eyztkzkprpmlmcabrfef`, host `db.jkorwnwwmdeflfntxntl.supabase.co`, `ACTIVE_HEALTHY`, ≠ production
- Migrations list: `[]`
- Cleanup: DROP `public.f3_mapi_throwaway_probe` CASCADE only; poison already absent; empty `supabase_migrations.schema_migrations` table+indexes **LEFT IN PLACE**
- `postgres_connect_ok: true` via **pooler** `aws-0-us-east-1.pooler.supabase.com:5432` user `postgres.jkorwnwwmdeflfntxntl` `sslmode=require`
- Direct `db.jkorwnwwmdeflfntxntl.supabase.co:5432` **FAILED** from that environment (AAAA/IPv6 unreachable)

Harness change shipped in functional SHA `f6acf17`: candidate `--db-url` is the session-mode pooler form. Identity gates still require exact ref/name/org/host. Transaction pooler `:6543` and production remain refused. No Management API POST `/database/migrations`.

## Collision reconfirm (local)

PASS vs production ceiling `20260912174049`. Disposable history reconfirmed by Chief preflight as `[]`. `supabase/migrations` has **no** timestamp filenames. Preassigned versions are known before execution:

| Source | Version | Isolated copy | Bytes | SHA-256 |
|--------|---------|---------------|------:|---------|
| 00118 | `20260913173000` | `20260913173000_f3_bounded_financial_epoch_foundation.sql` | 12150 | `517774fd883ecc8c8ba7d2e287c7245a1289b21623c839f594b0801611968f3c` |
| 00119 | `20260913173001` | `20260913173001_f3_01_core_ledger_foundation.sql` | 34878 | `9b09a733ed848e2a88a894db0815bd0f33f86335b58f7c9cd58845b6607d785d` |
| 00120 | `20260913173002` | `20260913173002_f3_02_secure_posting_idempotency.sql` | 32318 | `4b870418ea15160a7aec0e6df707d9c8a3afc435f2d8bd1c861e0af7c47eb505` |
| 00121 | `20260913173003` | `20260913173003_f3_03_projection_read_proof.sql` | 35291 | `568ae0b15b1b6e6c0a7effd9e9b5644a294cc22d76dbbf0e6714a28888825cf5` |
| 00122 | `20260913173004` | `20260913173004_f3_04_correction_reversal.sql` | 48436 | `fd2c6e8729d1c7983421804b5f028edd16170c9f9056c8db2f3994f4dff8bdf9` |
| 00123 | `20260913173005` | `20260913173005_f3_05_opening_cash_command.sql` | 19028 | `848b7cbe7e4e20e2e284d88f9954be0be8ffdfe4fc6d7c649e536d0c09aab699` |

Repo source files were **not** renamed. Isolated copies are proven byte-identical locally (sha256 before/after). Hosted `db push` of these bytes is **NOT RUN**.

All six source files end with `COMMIT;` — a post-COMMIT / history-INSERT split is the expected candidate failure shape when inject is installed for the exact filename version.

## CLI 2.117.0 help (discovered, not guessed)

```
supabase db push --db-url <URL> --workdir <ISOLATED> --yes --skip-vault
supabase migration repair <FILENAME_VERSION> --status applied --db-url <URL> --workdir <ISOLATED> --yes
supabase migration list --db-url <URL> --workdir <ISOLATED>
supabase db query --db-url <URL> --file <SQL> --workdir <ISOLATED>
```

Never `-p` / `--password`. Never `--linked` / `--local` / `--project-ref` for this candidate. URL built in-process from env as the **session-mode pooler** form. Isolated HOME. Ambient `DATABASE_URL` / `PG*` / tokens stripped.

## Hosted results (this VM)

| Check | Result |
|-------|--------|
| Identity GET | **Chief preflight PASS** (this VM did not re-GET; token absent) |
| History preflight | **Chief preflight `[]`** (this VM did not re-read) |
| Throwaway-probe cleanup | **Chief preflight**: DROP CASCADE only; this VM did not execute |
| Floor 00001–00117 | **NOT RUN** on this VM — if inexact, qualifier HOLDs |
| Six hosted history-failure `db push` | **NOT RUN** |
| Six filename-version repairs | **NOT RUN** |
| Six retry-skips / continuation through 00123 | **NOT RUN** |
| Large-SQL hosted apply | **NOT RUN** (MCP large-SQL remains disqualified and is not evidence about db push) |
| Production contacted | **false** |

## Fresh local counts (2026-09-13T19:10Z; PostgreSQL 17.11; CLI 2.117.0)

| Suite | Result |
|-------|--------|
| Target/credential guards + zero-spawn rejections | **PASS** (in db-push harness) |
| Version-collision | **PASS** |
| Exact-byte isolated mapping | **PASS** |
| Floor file-list through 00117 (excludes 00118+) | **PASS** (local list only) |
| Session-mode pooler URL + IPv6 direct-host refuse | **PASS** (local harness) |
| Hosted floor / six failure / six repair / six retry-skip | **NOT RUN / BLOCKED** |
| Large-SQL hosted | **NOT RUN** |
| SQL pre-commit atomicity | **14/14 PASS** (psql; not CLI-equivalent) |
| Recognition | **40/40 PASS** |
| F3-01 DB | **43/43 PASS** |
| F3-02 DB | **159/159 PASS** |
| F3-02 Astra | **169/169 PASS** |
| F3-03 DB | **25/25 PASS** |
| F3-03 Astra | **80/80 PASS** |
| F3-04 DB | **23/23 PASS** |
| F3-04 Astra | **170/170 PASS** |
| F3-05 DB | **31/31 PASS** |
| F3-05 Astra | **118/118 PASS** |
| Combined oracles (incl. recognition) | **577/577 PASS** |
| Post-S0 regression | **14/14 PASS** |
| Local two-phase external-ledger (NON-API) | **9/9 PASS** |
| Local disposable safety | **45/45 PASS** |
| Management API harness (local) | **22/22 PASS** |
| db push harness (local) | **26/26 PASS** |
| Combined `npm run test:f3` | **988/988 PASS** |
| `test:m2` | **111/111 PASS** |
| M2 static | **9/9 PASS** |
| Cut 1 static | **11/11 PASS** |
| Cut 2 non-regression | **20/20 PASS** |
| Cut 3 storage buckets | **11/11 PASS** |
| `tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** (dummy `https://example.invalid.supabase.local`) |
| Qualify db push without env | exit 2 `NOT_RUN` / verdict **BLOCKED** |
| Qualify Management API without env | exit 2 `NOT_RUN` |

## Changed files (functional SHA `f6acf17` increment; first harness `dc7f683`)

First functional (`dc7f683`):

- `scripts/lib/f3-db-push-pins.mjs`
- `scripts/lib/f3-db-push-version-map.mjs`
- `scripts/lib/f3-db-push-target-guard.mjs`
- `scripts/lib/f3-db-push-cli.mjs`
- `scripts/lib/f3-db-push-identity.mjs`
- `scripts/lib/f3-db-push-history-inject.mjs`
- `scripts/lib/f3-db-push-floor.mjs`
- `scripts/qualify-f3-db-push-disposable.mjs`
- `scripts/test-f3-db-push-harness.mjs`
- `scripts/_f3_apply_current_main_floor.mjs` (export `BOOTSTRAP` only)
- `scripts/lib/f3-management-api-remote-harness.mjs` (`MANAGEMENT_API_APPLY_PERMANENTLY_DISQUALIFIED`)
- `scripts/test-f3-management-api-remote-harness.mjs`
- `docs/runbooks/F3_FOUNDER_CONTROLLED_MIGRATION_REPAIR.md`
- `package.json`

Pooler increment (`f6acf17`):

- `scripts/lib/f3-db-push-pins.mjs`
- `scripts/lib/f3-db-push-target-guard.mjs`
- `scripts/qualify-f3-db-push-disposable.mjs`
- `scripts/test-f3-db-push-harness.mjs`
- `docs/runbooks/F3_FOUNDER_CONTROLLED_MIGRATION_REPAIR.md`

00118–00123 SQL bytes **UNCHANGED**.

## Disposable final state

This VM did **not** connect. Chief live preflight remains the last hosted inventory:

- Project left in place (not deleted / not paused)
- Identity ACTIVE_HEALTHY; ≠ production
- Migrations list `[]`
- Poison already absent
- Throwaway `public.f3_mapi_throwaway_probe` dropped CASCADE on the preflight
- Empty `supabase_migrations.schema_migrations` table+indexes left in place
- Do not drop `supabase_migrations` unless CLI 2.117.0 docs require init

## Chief live run (still required for hosted qualification)

```bash
export F3_DBPUSH_DISPOSABLE_SENTINEL=villageclaq-f3-dbpush-20260913-authorized
export F3_REMOTE_DESTRUCTIVE_TEST=1
export VILLAGECLAQ_F3_DISPOSABLE_DB_PASSWORD='<founder vault; do not commit>'
# optional identity GET only:
# export VILLAGECLAQ_F3_DISPOSABLE_MGMT_TOKEN='<founder vault; do not commit>'
node scripts/qualify-f3-db-push-disposable.mjs --prep-floor --sequence-f3
```

Repair is never automatic. Separate founder authentication is required before any production apply/repair.

## Withdrawn / not claimed

- FILE-BASED RUNNER QUALIFICATION PASS
- Production approval of `db push`
- Hosted six-file apply / repair / retry-skip
- Exact hosted pre-00118 floor on this VM
- Re-enabling Management API `{query,name}`
- Apply-time clock / guessed version
- Automatic repair
- Direct `db.{ref}.supabase.co:5432` as the candidate `--db-url`
