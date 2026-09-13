# M3 F3 runner contract from S0/M2 evidence — 2026-09-13

**Verdict: BLOCKED (remote Management API fidelity) with local safety REMEDIATED.**

**Founder path B confirmed:** finish local-only remediation. Do not create or access any remote Supabase project. Do not attempt Management API writes.

**Daybreak’s Management API fidelity requirement remains BLOCKED** pending a founder-approved disposable project, credentials, and sentinel.

This evidence tip **supersedes** overstated Management API-equivalence and apply-time-clock claims bound to functional SHA `968660d4e079ceb6c8d081be9f985597eaed0465` and tip `3937b01bff0bc37ed4035e8f708cf10e355f3eae`. Historical `M3_F3_EXTERNAL_LEDGER_REMEDIATION_20260913.md` is stamped SUPERSEDED and must not be read as current. It does **not** claim hosted Management API tests ran.

**DO NOT MERGE.**  
**DO NOT APPLY 00118+ TO PRODUCTION.**  
**NO ASTRA / DAYBREAK CONTACT.**  
**NO REMOTE Management API WRITE.**

Draft PR: https://github.com/gatekipa/villageclaq/pull/84

## Pins

| Pin | Value |
|-----|-------|
| Base main | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| Planning PR #83 (unchanged) | `a293f5958b31548ccec7591b653eff2857ae9a90` |
| Start tip | `3937b01bff0bc37ed4035e8f708cf10e355f3eae` |
| Superseded functional | `968660d4e079ceb6c8d081be9f985597eaed0465` |
| Intermediate functional | `c926ea5338b7dfd9840bccf3496fe5f884e64bdd` |
| **NEW functional SHA** | `1ca63d9fe0d82a74a761fb742be87642b55329d6` |
| Evidence artifact | `9055a2b478f115602579547aeb14335436a5bd90` |
| Recognition | exactly `["manual_income"]` |
| 00118–00123 digests | byte-identical to freeze (see below) |

## Scope A — proven S0/M2 runner facts only

Official Management API contract (do not invent): `POST /v1/projects/{ref}/database/migrations` body accepts **only** `query` (required), `name` (optional), `rollback` (optional). It does **not** accept a caller-selected timestamp/version. Docs: https://supabase.com/docs/reference/api/v1-apply-a-migration. Documented 200 body is `{}`.

### Historical request (what is proven)

| Apply | Proven runner | Proven body / tool | Proven headers |
|-------|---------------|--------------------|----------------|
| Cut 1 `00114` | Management API FILE-STREAMED POST `/v1/projects/{ref}/database/migrations` | `{ query: <exact SQL bytes>, name: s0_p0a_cut1_active_authorization }` | **UNPROVEN in-repo** whether `Authorization: Bearer <PAT>` / `Content-Type: application/json` / `Idempotency-Key` were the exact headers used. Official docs show Bearer + JSON. VillageClaq apply script with those bytes is **not** in this branch. |
| Cut 2 `00115` | same file-stream POST | `{ query, name: s0_p0b_cut2_notification_queue }` | same UNPROVEN |
| Cut 3 `00116` | same file-stream POST | `{ query, name: s0_p0c_cut3_storage_path_fail_closed }` | same UNPROVEN |
| M2 `00117` | connected Supabase `apply_migration` MCP | MCP tool `apply_migration` (small SQL only) | MCP session; not a file-stream POST |

MCP `apply_migration` is **DISQUALIFIED** for large F3 SQL (Cut 1 precedent). `supabase db push` is **not** the production apply runner.

### How `name` is selected (proven)

snake_case from the source filename after stripping the leading `NNNNN_` prefix. Live names match that derivation:

| Source file | Observed name |
|-------------|----------------|
| `00114_s0_p0a_cut1_active_authorization.sql` | `s0_p0a_cut1_active_authorization` |
| `00115_s0_p0b_cut2_notification_queue.sql` | `s0_p0b_cut2_notification_queue` |
| `00116_s0_p0c_cut3_storage_path_fail_closed.sql` | `s0_p0c_cut3_storage_path_fail_closed` |
| `00117_m2_notification_policy_foundation.sql` | `m2_notification_policy_foundation` |

### How version is observed after success (proven)

Server-generated 14-digit `YYYYMMDDHHMMSS`. Observed **after success** in `supabase_migrations.schema_migrations` / list_migrations (live inventory pins):

| Source | Observed version | Observed via |
|--------|------------------|--------------|
| 00114 | `20260911183755` | live `schema_migrations` after Cut 1 closed |
| 00115 | `20260912033612` | live `schema_migrations` after Cut 2 |
| 00116 | `20260912134123` | live `schema_migrations` after Cut 3 |
| 00117 | `20260912174049` | live `schema_migrations` after M2 |

Caller-generated / apply-time-clock timestamps are **not** Management API behavior.

### Failed-response identifier

**UNKNOWN / UNPROVEN.** No captured Management API failure body in S0/M2 evidence on this branch shows a migration version. Official 200 schema is an empty object; 401/403/429/500 bodies are not captured here. Do not invent.

### History query by name afterward

**PROVEN after success:** live inventory queried `schema_migrations` by the observed `name` + `version` pair. **UNPROVEN** whether Management API list_migrations filters by name as a first-class query, versus returning the full list for VillageClaq to match.

### Sequencing / continuation

**VillageClaq orchestration** (one authorized file at a time; next file only after prior success). The Management API does not own source-label `00114`→`00117` order and does not accept a caller version.

### Skip

VillageClaq `skipIfPresent` and caller-generated timestamps are **local helpers**. They are **NOT** Management API behavior. Those claims are **withdrawn**.

### Orphan example `20260911164346`

Cited as an example of a server-generated version recoverable by listing history after the fact. **This branch's S0/M2 evidence files do not contain that row.** Treat the recovery *method* (list_migrations / `schema_migrations` after the fact) as the proven path. Treat that specific orphan identity as **UNPROVEN here** unless the founder attaches the capture.

## Scope B/C

`BLOCKED — DISPOSABLE PROJECT AUTHORIZATION REQUIRED`

No runner-faithful Management API failure / version-provenance / repair-continuation proofs were executed. No hosted POST was attempted.

## Proposed smallest fail-closed runner change (NOT implemented)

If version is unrecoverable after a post-COMMIT / pre-history hosted failure:

1. **STOP.** Do not guess, clock, or nearest-match a version.
2. Persist the exact HTTP status + response body (if any) and an immediate `GET /v1/projects/{ref}/database/migrations` + `schema_migrations` snapshot.
3. Repair only if server identity shows the exact version/name pair. If neither the failure body nor the list contains it → **UNRECOVERABLE**.
4. Do not add caller-selected timestamps to the POST body (the API does not accept them).
5. Founder decides later whether VillageClaq orchestration should add that capture step. This task does not implement it.

## Local safety (this run)

- Local targets only: `localhost` / `127.0.0.1` / `::1` / `/var/run/postgresql`
- Work DB names must begin with `f3_`
- Validation before any child process
- Minimal allowlisted subprocess env + isolated CLI HOME
- Remote Management API harness separate and blocked
- Local two-phase helper labeled **NON-API simulation**

## Fresh local counts (do not reuse; no remote API tests)

| Suite | Result |
|-------|--------|
| Local disposable safety | **45/45 PASS** |
| SQL pre-commit atomicity | **14/14 PASS** |
| Local two-phase external-ledger (NON-API simulation) | **9/9 PASS** |
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
| Combined `npm run test:f3` | **940/940 PASS** (895 prior + 45 local safety) |
| `test:m2` | **111/111 PASS** |
| M2 static | **9/9 PASS** |
| Cut 1 static | **11/11 PASS** |
| Cut 2 non-regression | **20/20 PASS** |
| Cut 3 storage buckets | **11/11 PASS** |
| `tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** (dummy `https://example.invalid.supabase.local`) |
| Remote Management API fidelity | **BLOCKED / NOT RUN** |

PostgreSQL 17.11 local disposable. Production URL not used.

## Frozen digests (unchanged)

| File | SHA-256 |
|------|---------|
| `00118` | `517774fd883ecc8c8ba7d2e287c7245a1289b21623c839f594b0801611968f3c` |
| `00119` | `9b09a733ed848e2a88a894db0815bd0f33f86335b58f7c9cd58845b6607d785d` |
| `00120` | `4b870418ea15160a7aec0e6df707d9c8a3afc435f2d8bd1c861e0af7c47eb505` |
| `00121` | `568ae0b15b1b6e6c0a7effd9e9b5644a294cc22d76dbbf0e6714a28888825cf5` |
| `00122` | `fd2c6e8729d1c7983421804b5f028edd16170c9f9056c8db2f3994f4dff8bdf9` |
| `00123` | `848b7cbe7e4e20e2e284d88f9954be0be8ffdfe4fc6d7c649e536d0c09aab699` |
