# Positive-repair feasibility — F23 closeout

**This is not authorization to execute.**  
PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE  
No hosted/disposable/production contact in this closeout.

## Why the current local injection is classified atomic rollback

F22 / F23 fault-injection (separate `f22_fault_inject` database):

1. Install `F3_DBPUSH_DISPOSABLE_HISTORY_INJECT` (`BEFORE INSERT` on `supabase_migrations.schema_migrations`, SQLSTATE `P0001`) for filename version `20260913173000`.
2. Run CLI **2.117.0**: `supabase db push --db-url <local run-owned f3_*> --workdir <isolated> --yes --skip-vault`.
3. CLI stderr (local and hosted, same text): history INSERT blocked **at statement 28**:
   `INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES($1, $2, $3)`.
4. Local classify: `objectsPresent=false` → `PRE_COMMIT_OR_ATOMIC_ROLLBACK` → `repairAuthorizedByFilenameVersion=false` → repair-safety gate refuses → `repairCalls=0`. That refusal is correct **given the probe result**.

Pinned CLI 2.117.0 source (`apps/cli-go/pkg/migration/file.go` `ExecBatch`, tag `v2.117.0`):

- Migration file statements are queued with `batch.ExecParams`.
- History INSERT is appended to the **same** batch (`insertVersionSQL`).
- The batch is flushed with `conn.PgConn().ExecBatch(...).ReadAll()`.
- There is **no** outer `BEGIN`/`COMMIT` around file + history.

Frozen `00118` itself contains `BEGIN;` (line 71) and `COMMIT;` (line 295). The file commits its objects **before** the CLI history INSERT (statement 28). That is CLI + frozen-SQL protocol, not a hosted-only assumption.

A pipeline/ExecBatch is not a PostgreSQL transaction block (CLI issue #6347: `LOCK TABLE` → `25P01`). Combined with the in-file `COMMIT`, the approved apply path **can** leave objects committed when statement 28 fails.

## Can the required committed-objects / missing-history state occur on the approved path?

**Yes.** Approved apply is CLI 2.117.0 `db push` (Management API apply is permanently disqualified). Protocol: in-file `COMMIT`, then separate history `INSERT`. Authentic hosted execution of that same command recorded `POST_COMMIT_HISTORY_FAILURE` (`sqlCommitted=true`, version absent, `repairAuthorizedByFilenameVersion=true`).

Local `objectsPresent=false` does **not** prove the protocol cannot split. It also does **not** authorize manufacturing objects or marking unapplied SQL applied. This closeout does not assume a hosted database “changes” the transaction; the split is explained by CLI batching + frozen `COMMIT`.

Do not treat the local slogan “atomic rollback, therefore repair is impossible on the approved path” as a protocol incompatibility.

## Historical positive-repair proof (exact)

| Item | Value |
|------|-------|
| Command | `supabase migration repair <FILENAME_VERSION> --status applied --db-url [REDACTED] --workdir [ISOLATED] --yes` |
| First version repaired in the hosted six-file sequence | `20260913173000` (then `…001`–`…005` after each later split) |
| CLI version | **2.117.0** |
| Transport | CLI `--db-url` (hosted session-mode pooler in the 2026-09-15 catalog-v5 hosted qualify). **Not** Management API. **Not** transaction pooler `:6543`. |
| Preceding apply | `supabase db push --db-url [REDACTED] --workdir [ISOLATED] --yes --skip-vault` → statement-28 history inject → `POST_COMMIT_HISTORY_FAILURE` |
| Evidence | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_SELF_FK_REQUAL_20260915/hosted/qualify-evidence/qualify-result.json` (and earlier hosted six-positive-scenario packages) |
| F8/F9 `positive_repairCalls: 1` | Local-proof **spy callback** after a `psql` poison-absent probe (`repair_is_spy: true`). **Not** this CLI repair command. |

## Original approved requirement that makes the proof mandatory

`scripts/lib/f3-db-push-pins.mjs`: Management API `POST /database/migrations {query,name}` is permanently disqualified because SQL can COMMIT while history INSERT fails with no recoverable version (Chief live probe 2026-09-13). CLI 2.117.0 `db push` is the qualification **candidate**. Repair is a **separate** command (`scripts/lib/f3-db-push-cli.mjs` `buildRepairCommand`) and is never automatic.

`classifyDbPushHistoryFailure` authorizes filename-version repair only when `objectsPresent === true` and the target version is absent (`POST_COMMIT_HISTORY_FAILURE`). The qualify contract requires that path to be exercised before repair coverage is complete. F23 records `mandatoryUnderApprovedContract: true` and `promotedNotExercisedToPass: false`.

## Supported procedure (separate authorization) — do not execute

This is the existing qualify recovery, not a new invention:

1. Authentic `POST_COMMIT_HISTORY_FAILURE` on CLI 2.117.0 `db push` (objects remain; filename version absent; inject still the disposable history trigger).
2. Repair-safety gate pass (poison cleaned/absent, identity, CLI pin, prefix staging, fingerprints as already required).
3. `supabase migration repair <preassigned filename version> --status applied --db-url <same constructed URL> --workdir <isolated> --yes`.
4. Continue remaining files. Stop on first unexpected failure. No silent patch. No second reset. No marking unapplied SQL applied. No manufactured objects.

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**

If Jude does **not** authorize that procedure, the one precise contract decision is:

> Amend the approved contract so post-commit filename-version repair is no longer a mandatory acceptance criterion for local qualification, while remaining mandatory before any hosted/production candidate that uses CLI 2.117.0 `db push`. Inherited hosted 2026-09-15 repair records stay historical; they do not become current authorization.

Do not resolve this by deleting history, manufacturing committed objects, or weakening the repair-safety gate.
