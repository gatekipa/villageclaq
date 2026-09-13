# F3 founder-controlled migration history repair

**NOT FOR PRODUCTION USE BY THIS TASK.**  
This runbook is write+test only. It does not authorize production apply, repair, deploy, merge, or any financial / notification write.

`supabase migration repair --status applied` is **NEVER automatic**. No script, cron, CI job, or agent may run it against production. Only the founder, after every gate below is green, and after founder authentication immediately before the command, may run the exact version-pinned command. Repair is **manual / exceptional**.

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

## Actual production runner (proven only)

| Item | Proven value | Source |
|------|----------------|--------|
| Cut 1–3 apply | Management API **FILE-STREAMED** `POST /v1/projects/{ref}/database/migrations` | S0 Cut 1–3 apply evidence / live history names |
| Official body fields | `query` (required), `name` (optional), `rollback` (optional) | https://supabase.com/docs/reference/api/v1-apply-a-migration |
| Caller-selected version in POST body | **NOT accepted** by the official contract | same docs |
| M2 00117 apply | connected `apply_migration` MCP (small SQL) | M2 evidence |
| Large-SQL MCP | **DISQUALIFIED** (Cut 1 precedent) | Cut 1 |
| Not the production apply runner | `supabase db push`, `supabase migration up` | S0/M2 |
| History name | snake_case after stripping source `NNNNN_` prefix | S0/M2 live `name` matches filename stem |
| History version | 14-digit `YYYYMMDDHHMMSS` **server-generated**; observed after success | live `schema_migrations` |
| Failed-response version (S0/M2 applies) | **UNKNOWN / UNPROVEN** for those successful applies | no captured failure body in S0/M2 evidence |
| Failed-response version after history INSERT blocked | **PROVEN UNRECOVERABLE** | Chief live probe 2026-09-13 on `jkorwnwwmdeflfntxntl`: HTTP 400, error mentions history INSERT blocked, list `[]`, `schema_migrations` rows=0, SQL committed. Recovery from response / list_migrations / schema_migrations → **NONE**. Verdict: **HOLD — MANAGEMENT API VERSION UNRECOVERABLE**. Repair forbidden. |
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

F3 `00118`–`00123` files are large. Eventual production apply is expected to follow Cut 1–3 Management API file-stream (not `db push`, not MCP for the large body). That apply is **not authorized** by this runbook.

Installed disposable CLI pin used to prove local CLI syntax: **Supabase CLI 2.117.0**. Re-read `--help` before any founder command; do not guess flags.

## Authoritative source of a repaired version

The repaired version MUST come from **server identity**:

1. `GET /v1/projects/{ref}/database/migrations` (list_migrations) after the failed apply, and/or
2. `supabase_migrations.schema_migrations` read after the failed apply

If the version is not present in that server identity, and the failed Management API response is not captured showing the identifier → emit **HOLD — MANAGEMENT API VERSION UNRECOVERABLE**. **STOP**. Do not repair.

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

CLI 2.117.0 requires a local lookup file `supabase/migrations/<timestamp>_<name>.sql` or it errors `LegacyMigrationFileNotFoundError`. That lookup file is a **disposable copy of the authorized bytes** named with the **server-identity timestamp**. Do **not** rename or replace `00118`–`00123` in the repo. Do **not** `repair 00118`.

## Founder-authorized command (after every gate)

Syntax from `supabase migration repair --help` (CLI 2.117.0):

```bash
supabase migration repair <SERVER_IDENTITY_TIMESTAMP_VERSION> --status applied --db-url <PERCENT_ENCODED_DB_URL> --yes
```

`--workdir` must see the disposable `supabase/migrations/<SERVER_IDENTITY_TIMESTAMP_VERSION>_<snake_case_name>.sql` whose SHA-256 equals the authorized digest. Substitute only the version captured from server identity. Never a source label. Never an apply-time clock.

This command updates **history only**. It does not re-run SQL.

## Post-repair verification

1. `schema_migrations` / list_migrations contains exactly that server-identity timestamp + snake_case name.
2. Catalog / security fingerprint is unchanged vs the post-COMMIT / pre-repair capture.
3. No data drift. Recognition allowlist still `["manual_income"]`.
4. Do **not** claim Management API will skip a caller-controlled timestamp. Re-apply behavior is **UNPROVEN** on the hosted API until a disposable Management API capture exists. Local `skipIfPresent` is a VillageClaq helper only.
5. The next legitimate unused **server-generated** version can apply without object-collision only after the repaired identity is recorded.
6. `supabase db push` remains **not** the production runner and must not be used to “fix” a timestamp/source-label mismatch.

Any mismatch → **HOLD**. Do not invent a second repair. Do not force-push. Do not apply F3-06+ / M4.

## Remote fidelity (founder-authorized disposable only)

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

### Chief remote execution

```bash
export F3_DISPOSABLE_MAPI_SENTINEL=villageclaq-f3-mapi-20260913-authorized
export F3_REMOTE_DESTRUCTIVE_TEST=1
export VILLAGECLAQ_F3_DISPOSABLE_MGMT_TOKEN='<founder vault; do not commit>'
# optional, only if CLI repair should execute:
# export F3_DISPOSABLE_DB_URL='<disposable db url; never production>'
node scripts/prep-f3-disposable-management-api-floor.mjs
node scripts/qualify-f3-management-api-disposable.mjs --prep-floor --inject-probe --apply-f3
```

Cleanup recommendation only: leave `jkorwnwwmdeflfntxntl` in place. Do **not** delete or pause it from this task.

Local two-phase proofs remain **NON-API simulation**. They are not Management API fidelity.
