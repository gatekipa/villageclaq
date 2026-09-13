# F3 founder-controlled migration history repair

**NOT FOR PRODUCTION USE BY THIS TASK.**  
This runbook is write+test only. It does not authorize production apply, repair, deploy, merge, or any financial / notification write.

`supabase migration repair --status applied` is **NEVER automatic**. No script, cron, CI job, or agent may run it against production. Only the founder, after every gate below is green, may run the exact version-pinned command.

## Intended production apply runner (do not invent another)

| Item | Pin |
|------|-----|
| Production apply | Management API **FILE-STREAMED** `POST /v1/projects/{ref}/database/migrations` `{ query, name }` |
| Large-SQL disqualification | MCP `apply_migration` is **DISQUALIFIED** (Cut 1 precedent) |
| Not the production apply runner | `supabase db push`, `supabase migration up` |
| History version format | `YYYYMMDDHHMMSS` (14-digit UTC timestamp generated at apply) |
| History name | snake_case after stripping the source `NNNNN_` prefix |

S0/M2 mapping precedent (source label is **not** the production history key):

| Source file | Production version | Production name | Runner |
|-------------|--------------------|-----------------|--------|
| `00114_s0_p0a_cut1_active_authorization.sql` | `20260911183755` | `s0_p0a_cut1_active_authorization` | Management API file-stream |
| `00115_s0_p0b_cut2_notification_queue.sql` | `20260912033612` | `s0_p0b_cut2_notification_queue` | Management API file-stream |
| `00116_s0_p0c_cut3_storage_path_fail_closed.sql` | `20260912134123` | `s0_p0c_cut3_storage_path_fail_closed` | Management API file-stream |
| `00117_m2_notification_policy_foundation.sql` | `20260912174049` | `m2_notification_policy_foundation` | connected `apply_migration` MCP (small SQL) |

F3 `00118`–`00123` files are large. Eventual production apply is expected to follow Cut 1–3 Management API file-stream (not `db push`, not MCP for the large body).

Installed disposable CLI pin used to prove this runbook: **Supabase CLI 2.117.0**. Re-read `--help` before any founder command; do not guess flags.

## Failure modes (do not conflate)

1. **Before final `COMMIT`** — security-tail / SQL error rolls back objects. Proven by `scripts/test-financial-f3-migration-atomicity.mjs` (**14/14 SQL pre-commit rollback only**; not CLI-equivalent).
2. **After final `COMMIT`, before external history insert** — secured objects remain; target timestamp is **absent** from `supabase_migrations.schema_migrations`. This is the only case this repair runbook addresses. Proven by `scripts/test-financial-f3-external-ledger.mjs`.

If objects are missing, extra, owner-drifted, RLS-drifted, or SQL bytes do not match the authorized SHA-256 → **HOLD**. Do not repair.

## Pre-repair gates (all required; any miss → HOLD)

1. Production apply is **stopped**. No in-flight Management API / MCP apply.
2. The missing history version is known in the **actual runner format** (`YYYYMMDDHHMMSS`), captured from the failed apply response or apply-time clock. Do **not** invent that `00118` is the history key.
3. Every **earlier** authorized version is already recorded (S0/M2 pins plus any earlier F3 timestamps that were successfully applied).
4. The **target version is absent** from `supabase_migrations.schema_migrations`.
5. **No later** version was attempted or recorded.
6. Deployed / on-disk SQL bytes for the target file match the authorized SHA-256 (F3 freeze):
   - `00118` `517774fd883ecc8c8ba7d2e287c7245a1289b21623c839f594b0801611968f3c`
   - `00119` `9b09a733ed848e2a88a894db0815bd0f33f86335b58f7c9cd58845b6607d785d`
   - `00120` `4b870418ea15160a7aec0e6df707d9c8a3afc435f2d8bd1c861e0af7c47eb505`
   - `00121` `568ae0b15b1b6e6c0a7effd9e9b5644a294cc22d76dbbf0e6714a28888825cf5`
   - `00122` `fd2c6e8729d1c7983421804b5f028edd16170c9f9056c8db2f3994f4dff8bdf9`
   - `00123` `848b7cbe7e4e20e2e284d88f9954be0be8ffdfe4fc6d7c649e536d0c09aab699`
7. Every expected object / owner / empty `search_path` / RLS / policy / grant / revoke / ACL / HGP pin is **exact**. No extras.
8. Financial / recognition invariants are exact. Allowlist remains `["manual_income"]`.
9. Read-only evidence is captured (catalog fingerprint, history dump, digest, CLI version, exact command).
10. CLI 2.117.0 `migration repair --help` still shows `--status applied|reverted` and `--db-url`.

CLI 2.117.0 requires a local lookup file `supabase/migrations/<timestamp>_<name>.sql` or it errors `LegacyMigrationFileNotFoundError`. That lookup file is a **disposable copy of the authorized bytes** named with the **actual timestamp**. Do **not** rename or replace `00118`–`00123` in the repo. Do **not** `repair 00118`.

## Founder-authorized command (after every gate)

Syntax from `supabase migration repair --help` (CLI 2.117.0):

```bash
supabase migration repair <ACTUAL_TIMESTAMP_VERSION> --status applied --db-url <PERCENT_ENCODED_DB_URL> --yes
```

`--workdir` must see the disposable `supabase/migrations/<ACTUAL_TIMESTAMP_VERSION>_<snake_case_name>.sql` whose SHA-256 equals the authorized digest. Substitute only the real timestamp captured from the failed apply. Never a source label.

This command updates **history only**. It does not re-run SQL.

## Post-repair verification

1. `schema_migrations` contains exactly that timestamp + snake_case name.
2. Catalog fingerprint (schemas/tables/types/views/functions, defs+owners, `search_path`, RLS+policies, grants/revokes/ACLs, HGP) is unchanged vs the post-COMMIT / pre-repair capture.
3. No data drift. Recognition allowlist still `["manual_income"]`.
4. Subsequent apply/check of the **same timestamp** skips; it must not rerun SQL (00118+ abort if objects already exist).
5. The next legitimate unused timestamp can apply without object-collision.
6. `supabase db push` remains **not** the production runner and must not be used to “fix” a timestamp/source-label mismatch.

Any mismatch → **HOLD**. Do not invent a second repair. Do not force-push. Do not apply F3-06+ / M4.
