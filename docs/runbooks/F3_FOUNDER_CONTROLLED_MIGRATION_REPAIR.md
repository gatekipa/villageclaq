# F3 founder-controlled migration history repair

**NOT FOR PRODUCTION USE BY THIS TASK.**  
This runbook is write+test only. It does not authorize production apply, repair, deploy, merge, or any financial / notification write.

## Current runner status (2026-09-13)

| Runner | Status |
|--------|--------|
| Management API `POST /v1/projects/{ref}/database/migrations` `{query,name}` | **PERMANENTLY DISQUALIFIED** as VillageClaq’s production migration guarantee. Chief live probe: SQL can `COMMIT` while history INSERT fails with **no recoverable version**. Verdict remains **HOLD — MANAGEMENT API VERSION UNRECOVERABLE**. Repair is **FORBIDDEN** for that failure mode. |
| Large-SQL MCP `apply_migration` | **DISQUALIFIED** (Cut 1 precedent). Not evidence about db push. |
| Local two-phase (`psql -f` then INSERT) | **NON-API simulation only**. Not a production runner. |
| `supabase db push` CLI **2.117.0** | **QUALIFICATION CANDIDATE ONLY**. Not production-approved until Daybreak approves. Do not claim production approval from this runbook. |

`supabase migration repair --status applied` is **NEVER automatic**. No script, cron, CI job, or agent may run it against production. Repair runs only after every gate below is green, and only after **separate founder authentication** immediately before the command. Founder auth for any production apply/repair is distinct from disposable qualification credentials. Repair is **manual / exceptional**.

If exact identity, state, or provenance cannot be established → **STOP and escalate**. Do not guess.

## SUPERSEDED CLAIMS (withdrawn)

The following claims from earlier F3 external-ledger evidence are **withdrawn**:

- That the local two-phase helper (`psql -f` then `INSERT` with a caller-generated `YYYYMMDDHHMMSS`) is Management API-equivalent.
- That an apply-time clock, inferred timestamp, or nearest timestamp may be used as a repaired version.
- That Management API skips or continues from a caller-controlled timestamp.
- That VillageClaq `skipIfPresent` is Management API continuation.

Those behaviors belong to **VillageClaq local helpers** only. They are **NOT** Management API behavior.

## Failure modes (do not conflate)

1. **SQL rollback (before final `COMMIT`)** — security-tail / SQL error rolls back objects. Proven by `scripts/test-financial-f3-migration-atomicity.mjs` (**14/14 SQL pre-commit rollback only**; not CLI-equivalent; not Management API).
2. **Post-COMMIT history failure** — SQL committed; target version is **absent** from `supabase_migrations.schema_migrations` (or list_migrations). Objects remain. This is the only case this repair runbook addresses. Local two-phase simulation can demonstrate the *shape* of this split; it is **NOT** runner-faithful Management API proof.

If objects are missing, extra, owner-drifted, RLS-drifted, or SQL bytes do not match the authorized SHA-256 → **HOLD**. Do not repair.

## Historical S0/M2 apply (superseded as future production runner)

S0 Cut 1–3 and M2 00117 **did** apply via Management API file-stream / small-SQL MCP. That history is still the live production ledger through `20260912174049`. It does **not** authorize using Management API `{query,name}` for F3 `00118`–`00123`.

| Item | Proven value | Source |
|------|----------------|--------|
| Cut 1–3 apply (historical) | Management API **FILE-STREAMED** `POST /v1/projects/{ref}/database/migrations` | S0 Cut 1–3 apply evidence / live history names |
| Official body fields | `query` (required), `name` (optional), `rollback` (optional) | https://supabase.com/docs/reference/api/v1-apply-a-migration |
| Caller-selected version in POST body | **NOT accepted** by the official contract | same docs |
| M2 00117 apply (historical) | connected `apply_migration` MCP (small SQL) | M2 evidence |
| Large-SQL MCP | **DISQUALIFIED** (Cut 1 precedent) | Cut 1 |
| Management API `{query,name}` for future F3 apply | **PERMANENTLY DISQUALIFIED** | Chief live probe 2026-09-13 |
| `supabase db push` CLI 2.117.0 | **QUALIFICATION CANDIDATE ONLY** until Daybreak approves | this runbook |
| History name (S0/M2) | snake_case after stripping source `NNNNN_` prefix | S0/M2 live `name` matches filename stem |
| History version (S0/M2 Management API) | 14-digit `YYYYMMDDHHMMSS` **server-generated**; observed after success | live `schema_migrations` |
| History version (db push candidate) | 14-digit **filename version known before execution** | isolated workdir mapping |
| Failed-response version (S0/M2 applies) | **UNKNOWN / UNPROVEN** for those successful applies | no captured failure body in S0/M2 evidence |
| Failed-response version after Management API history INSERT blocked | **PROVEN UNRECOVERABLE** | Chief live probe 2026-09-13 on `jkorwnwwmdeflfntxntl`: HTTP 400, error mentions history INSERT blocked, list `[]`, `schema_migrations` rows=0, SQL committed. Recovery from response / list_migrations / schema_migrations → **NONE**. Verdict: **HOLD — MANAGEMENT API VERSION UNRECOVERABLE**. Repair forbidden. |
| API skip-if-present | **NOT proven** | do not claim |

S0/M2 mapping (source label is **not** the production history key). Versions below were observed in `schema_migrations` **after success**, not recovered from a failed apply:

| Source file | Observed version | Observed name | Runner |
|-------------|------------------|---------------|--------|
| `00114_s0_p0a_cut1_active_authorization.sql` | `20260911183755` | `s0_p0a_cut1_active_authorization` | Management API file-stream |
| `00115_s0_p0b_cut2_notification_queue.sql` | `20260912033612` | `s0_p0b_cut2_notification_queue` | Management API file-stream |
| `00116_s0_p0c_cut3_storage_path_fail_closed.sql` | `20260912134123` | `s0_p0c_cut3_storage_path_fail_closed` | Management API file-stream |
| `00117_m2_notification_policy_foundation.sql` | `20260912174049` | `m2_notification_policy_foundation` | connected `apply_migration` MCP (small SQL) |

Orphan example `20260911164346` is cited as a server-generated version that can be listed after the fact. In-repo S0/M2 evidence files on this branch do **not** contain that row; treat listing-by-version after success as the proven recovery path, and treat any specific orphan identity as **UNPROVEN here** unless the founder attaches the list_migrations / `schema_migrations` capture.

Sequencing and continuation are **VillageClaq orchestration** (one authorized file at a time; next file only after prior success). The Management API does not own VillageClaq source-label order.

F3 `00118`–`00123` files are large. Management API `{query,name}` is **PERMANENTLY DISQUALIFIED** for that apply. `supabase db push` CLI 2.117.0 is the **qualification candidate only** until Daybreak approves. MCP large-SQL remains disqualified and is not evidence about db push. No production apply is authorized by this runbook.

Installed disposable CLI pin used to prove local CLI syntax: **Supabase CLI 2.117.0**. Re-read `--help` before any founder command; do not guess flags.

## Preassigned db push filename versions (known before execution)

Isolated workdir copies **only**. Never rename repository `00118`–`00123` source files. Collision vs production ceiling `20260912174049` is PASS; disposable history starts `[]`; `supabase/migrations` has no timestamp filenames.

| Source file | Filename version | Isolated copy |
|-------------|------------------|---------------|
| `00118_f3_bounded_financial_epoch_foundation.sql` | `20260913173000` | `20260913173000_f3_bounded_financial_epoch_foundation.sql` |
| `00119_f3_01_core_ledger_foundation.sql` | `20260913173001` | `20260913173001_f3_01_core_ledger_foundation.sql` |
| `00120_f3_02_secure_posting_idempotency.sql` | `20260913173002` | `20260913173002_f3_02_secure_posting_idempotency.sql` |
| `00121_f3_03_projection_read_proof.sql` | `20260913173003` | `20260913173003_f3_03_projection_read_proof.sql` |
| `00122_f3_04_correction_reversal.sql` | `20260913173004` | `20260913173004_f3_04_correction_reversal.sql` |
| `00123_f3_05_opening_cash_command.sql` | `20260913173005` | `20260913173005_f3_05_opening_cash_command.sql` |

Candidate command (CLI 2.117.0 `db push --help`; `--db-url` built in-process from env; never `-p`):

```bash
supabase db push --db-url <PERCENT_ENCODED_DISPOSABLE_SESSION_POOLER_URL> --workdir <ISOLATED> --yes --skip-vault
```

**Connection form (Chief live preflight 2026-09-13, incorporate exactly):** identity gates still require exact project ref `jkorwnwwmdeflfntxntl` / name `villageclaq-f3-management-api-disposable-20260913` / org `eyztkzkprpmlmcabrfef` / host `db.jkorwnwwmdeflfntxntl.supabase.co`. Direct `db.jkorwnwwmdeflfntxntl.supabase.co:5432` **FAILED** (AAAA/IPv6 unreachable). Postgres connect succeeded via session-mode pooler `aws-0-us-east-1.pooler.supabase.com:5432` user `postgres.jkorwnwwmdeflfntxntl` `sslmode=require`. Transaction pooler `:6543` is never a db-push target. Production is forever denied. Password from env only; never argv / never log the URL.

**Floor install (Chief hosted HOLD on tip `ca6df98`, then 00030 HOLD on `164f579`):** `supabase db query --file` **cannot** execute multi-statement SQL. Hosted disposable floor is now: **no-shim** bootstrap + 00001–00029 + **ephemeral transformed 00030** (exactly 14 `unnest(get_user_group_ids())` → `get_user_group_ids()`) + 00031–00117 + HGP pins, via gated remote `psql -f`. Repo `00030` bytes are never rewritten. `public.unnest(uuid)` must **not** be installed on the hosted path. If a later floor file still contains `unnest(get_user_group_ids())` (currently `00057`, count 1), hosted apply **HOLDs before that file** to avoid a second mid-file partial. 00118–00123 candidate runner remains `supabase db push` only.

When a post-COMMIT split occurs on this candidate: COMMIT → history INSERT fail → **known filename version** → founder-controlled repair → retry skip → next continues. Do not invent a server-generated version. Do not use an apply-time clock.

## Authoritative source of a repaired version

### Management API `{query,name}` (permanently disqualified)

The repaired version MUST come from **server identity**:

1. `GET /v1/projects/{ref}/database/migrations` (list_migrations) after the failed apply, and/or
2. `supabase_migrations.schema_migrations` read after the failed apply

If the version is not present in that server identity, and the failed Management API response is not captured showing the identifier → emit **HOLD — MANAGEMENT API VERSION UNRECOVERABLE**. **STOP**. Do not repair.

### db push qualification candidate (filename version)

For the isolated timestamp copies, the repaired version is the **preassigned filename version** (`20260913173000`–`20260913173005`). That version is known before execution. Repair still requires every gate below. Never automatic. Never `repair 00118`.

### History-insert failure before version persistence (Chief live probe 2026-09-13)

When the history phase fails **before version persistence**, the version is **UNRECOVERABLE**. Repair is **FORBIDDEN**. Do not attempt. Do not claim.

Observed on authorized disposable `jkorwnwwmdeflfntxntl` / `villageclaq-f3-management-api-disposable-20260913` (ACTIVE_HEALTHY, ≠ production):

1. Identity GET 200; baseline GET migrations `[]`.
2. POST `/database/query` works (201) for SQL.
3. Failure injection created `schema_migrations` + BEFORE INSERT trigger raising `F3_MAPI_DISPOSABLE_HISTORY_INJECT`.
4. POST `/database/migrations` `{query,name}` tiny SQL creating `public.f3_mapi_throwaway_probe` ending `COMMIT`.
5. Migration POST → **HTTP 400**; error mentions **history INSERT blocked**.
6. List still `[]`; `schema_migrations` rows=0; `to_regclass` shows the throwaway table **EXISTS**.
7. SQL committed; history failed.
8. Version recovery from response body / list_migrations / schema_migrations → **NONE**.

**HOLD — MANAGEMENT API VERSION UNRECOVERABLE**

One runner-faithful case established **universal unrecoverability under history-insert failure**. Do **not** claim full `00118`–`00123` remote apply completed. Do **not** clock, guess, or nearest-match a version. Poison trigger/function were dropped; throwaway table left; project not deleted.

The next section (CLI repair after a *persisted* server identity) does **not** apply to this failure mode.

Do **not** invent, guess, infer, nearest-match, or use an apply-time clock.

Management API skip of a caller-controlled timestamp is **NOT proven**. Never claim it.

## Pre-repair gates (all required; any miss → HOLD)

1. Production apply is **stopped**. No in-flight Management API / MCP apply.
2. Founder authentication is completed **immediately before** the repair command.
3. Full catalog / security fingerprint is captured **before** repair (schemas/tables/types/views/functions; defs+owners; empty `search_path`; RLS+policies; grants/revokes/ACLs; HGP pin).
4. The missing history version is known from **server identity** (list_migrations / `schema_migrations`). Format `YYYYMMDDHHMMSS`. Do **not** invent that `00118` is the history key. Do **not** use apply-time clock.
5. Exact authorized SQL digest + version/name mapping is established from that server identity only.
6. Every **earlier** authorized version is already recorded (S0/M2 pins plus any earlier F3 timestamps that were successfully applied).
7. The **target version is absent** from `supabase_migrations.schema_migrations` (or list_migrations shows the post-COMMIT / pre-history gap).
8. **No later** version was attempted or recorded.
9. Deployed / on-disk SQL bytes for the target file match the authorized SHA-256 (F3 freeze):
   - `00118` `517774fd883ecc8c8ba7d2e287c7245a1289b21623c839f594b0801611968f3c`
   - `00119` `9b09a733ed848e2a88a894db0815bd0f33f86335b58f7c9cd58845b6607d785d`
   - `00120` `4b870418ea15160a7aec0e6df707d9c8a3afc435f2d8bd1c861e0af7c47eb505`
   - `00121` `568ae0b15b1b6e6c0a7effd9e9b5644a294cc22d76dbbf0e6714a28888825cf5`
   - `00122` `fd2c6e8729d1c7983421804b5f028edd16170c9f9056c8db2f3994f4dff8bdf9`
   - `00123` `848b7cbe7e4e20e2e284d88f9954be0be8ffdfe4fc6d7c649e536d0c09aab699`
10. Every expected object / owner / empty `search_path` / RLS / policy / grant / revoke / ACL / HGP pin is **exact**. No extras.
11. Financial / recognition invariants are exact. Allowlist remains `["manual_income"]`.
12. Read-only evidence is captured (catalog fingerprint, history dump, digest, CLI version, exact command, version provenance).
13. CLI 2.117.0 `migration repair --help` still shows `--status applied|reverted` and `--db-url`.

CLI 2.117.0 requires a local lookup file `supabase/migrations/<timestamp>_<name>.sql` or it errors `LegacyMigrationFileNotFoundError`. That lookup file is a **disposable copy of the authorized bytes**. For the disqualified Management API path the timestamp would have been server-identity (unrecoverable after the live probe). For the db push **qualification candidate** the timestamp is the **preassigned filename version**. Do **not** rename or replace `00118`–`00123` in the repo. Do **not** `repair 00118`.

## Founder-authorized command (after every gate)

Syntax from `supabase migration repair --help` (CLI 2.117.0):

```bash
supabase migration repair <FILENAME_VERSION> --status applied --db-url <PERCENT_ENCODED_DB_URL> --yes
```

`--workdir` must see the disposable `supabase/migrations/<FILENAME_VERSION>_<snake_case_name>.sql` whose SHA-256 equals the authorized digest. For the db push candidate, substitute only the preassigned filename version (`20260913173000`–`20260913173005`). Never a source label. Never an apply-time clock.

This command updates **history only**. It does not re-run SQL. Separate founder authentication is required immediately before any production apply/repair. Disposable qualification credentials do not authorize production.

## Post-repair verification

1. `schema_migrations` / list_migrations contains exactly that server-identity timestamp + snake_case name.
2. Catalog / security fingerprint is unchanged vs the post-COMMIT / pre-repair capture.
3. No data drift. Recognition allowlist still `["manual_income"]`.
4. Do **not** claim Management API will skip a caller-controlled timestamp. Re-apply behavior is **UNPROVEN** on the hosted API until a disposable Management API capture exists. Local `skipIfPresent` is a VillageClaq helper only.
5. The next legitimate unused **server-generated** version can apply without object-collision only after the repaired identity is recorded.
6. `supabase db push` is a **qualification candidate only** until Daybreak approves. It is **not** production-approved. Do not use it to “fix” a Management API timestamp/source-label mismatch. Do not treat a candidate PASS as production authorization.

Any mismatch → **HOLD**. Do not invent a second repair. Do not force-push. Do not apply F3-06+ / M4.

## Remote fidelity (founder-authorized disposable only)

### db push qualification candidate (current)

Harness: `scripts/lib/f3-db-push-target-guard.mjs` + `scripts/lib/f3-db-push-cli.mjs`  
Qualifier: `scripts/qualify-f3-db-push-disposable.mjs`  
Isolated versions: `scripts/lib/f3-db-push-version-map.mjs`

Management API POST `{query,name}` is **PERMANENTLY DISQUALIFIED** and is never the candidate command.

### Management API (permanently disqualified apply path; identity GET only)

Harness: `scripts/lib/f3-management-api-remote-harness.mjs`  
Qualifier: `scripts/qualify-f3-management-api-disposable.mjs`  
Floor prep: `scripts/prep-f3-disposable-management-api-floor.mjs`

Approved disposable (do not substitute):

| Item | Value |
|------|-------|
| Name | `villageclaq-f3-management-api-disposable-20260913` |
| Ref | `jkorwnwwmdeflfntxntl` |
| Org | `eyztkzkprpmlmcabrfef` |
| Sentinel | `villageclaq-f3-mapi-20260913-authorized` via `F3_DISPOSABLE_MAPI_SENTINEL` |
| Token | `VILLAGECLAQ_F3_DISPOSABLE_MGMT_TOKEN` only (never print / commit) |
| Destructive opt-in | `F3_REMOTE_DESTRUCTIVE_TEST=1` |
| Production ref | `llbnliixczcqfftxpsmb` — always refused |

The harness requires **all** of: exact approved ref, exact sentinel, destructive opt-in, token present, and positive project-identity verification (name match). Local connection-guard strength is unchanged.

### Disclosed floor limitation

Disposable floor is **NOT** a clean `00001`–`00117` replay. Install only: prerequisite stub + live HGP/enqueue/queue pins + real `00117` + exact frozen `00118`+ bytes. Record that limitation on every run.

### Post-COMMIT history failure

Disposable-only trigger on `supabase_migrations.schema_migrations` raises after the server assigns `version`+`name`, so the Management API response can expose that identity. Recover **only** from:

1. apply response
2. `GET /v1/projects/{ref}/database/migrations`
3. `supabase_migrations.schema_migrations`

If those artifacts do not agree on one `YYYYMMDDHHMMSS` + name → **HOLD — MANAGEMENT API VERSION UNRECOVERABLE**. Do not repair. Do not use an apply-time clock, guess, infer, or nearest-match.

### Recoverable version → CLI repair + continuation (NOT this live failure mode)

**Does not apply** when history INSERT failed before version persistence. After the 2026-09-13 live probe that case is **HOLD — MANAGEMENT API VERSION UNRECOVERABLE**; repair is forbidden.

This subsection remains only for a later case where list_migrations / `schema_migrations` actually persist one `YYYYMMDDHHMMSS` + name (the live history-insert failure did **not**). Until that different observation exists, do not treat the following as authorized:

1. Discover `supabase --version` (do not guess).
2. Run `supabase migration repair --help` and use only flags it shows.
3. Write a timestamp-named lookup file whose bytes equal the authorized SQL digest.
4. Repair **only** the recovered version as `--status applied`.
5. Verify zero catalog drift / no SQL re-exec.
6. Continue VillageClaq Management API orchestration (next authorized file via file-stream POST). Record whether the next file advances, retries, or errors. **Do not claim API custom skip unless a live re-POST observation shows it.**

CLI repair against the hosted disposable also needs `F3_DISPOSABLE_DB_URL` (never production). If that URL is absent, prepare the lookup file and stop at `REPAIR_AWAITING_DISPOSABLE_DB_URL`. After a HOLD for history-insert failure, do not prepare a lookup and do not set that URL.

### Chief remote execution — db push candidate

Password is env-only. Never print it. Never pass `-p`. The qualifier builds `--db-url` in-process.

**STOP (2026-09-13 Chief):** hosted wipe already **SUCCESS**. Disposable `jkorwnwwmdeflfntxntl` is a **CLEAN baseline**. Do **not** `--prep-floor`. Do **not** `--sequence-f3`. Do **not** re-wipe. No further replay exceptions (including ephemeral `00057` transform) without new founder authorization. Hosted floor / db-push is **NOT STARTED**.

```bash
# Inventory / wipe already completed by Chief (02 pre-wipe, 03 wipe SUCCESS).
# Do not run --prep-floor or --sequence-f3 on the clean baseline.
# Qualifier without env still exits 2 NOT_RUN.
node scripts/qualify-f3-db-push-disposable.mjs
```

Harness still accepts `--wipe-to-baseline` / `--prep-floor` / `--sequence-f3` for a later authorized retry. Those flags are **not** authorized now. `--prep-floor` uses hosted bootstrap **without** `public.unnest(uuid)` and an ephemeral 00030-only transform (exactly 14). `00057` still has one executable `unnest(get_user_group_ids())` outside that authorization — local through-00117 **HOLD**. Local `_f3_apply_current_main_floor.mjs` may still shim for existing local F3 suites.

Do **not** claim hosted PASS. Do **not** claim FILE-BASED RUNNER QUALIFICATION PASS.

Repair is **NEVER automatic**. The qualifier may record a founder-controlled `migration repair <FILENAME_VERSION> --status applied` only after gates, identity/history preflight, exact-byte isolated copies, and the per-file history-failure proof. Separate founder authentication is required before any production apply/repair.

### Chief remote execution — Management API (apply permanently disqualified)

```bash
export F3_DISPOSABLE_MAPI_SENTINEL=villageclaq-f3-mapi-20260913-authorized
export F3_REMOTE_DESTRUCTIVE_TEST=1
export VILLAGECLAQ_F3_DISPOSABLE_MGMT_TOKEN='<founder vault; do not commit>'
# Do not POST /database/migrations. Apply is permanently disqualified.
```

Cleanup recommendation only: leave `jkorwnwwmdeflfntxntl` in place. Do **not** delete or pause it from this task. After inventory reconfirm, `public.f3_mapi_throwaway_probe` (and dependent sequence/index) may be dropped. Do **not** drop standard `supabase_migrations` schema/table/indexes unless CLI 2.117.0 docs require init.

Local two-phase proofs remain **NON-API simulation**. They are not Management API fidelity and are not db push fidelity.
