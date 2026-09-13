# M3 F3 Management API live disposable probe — 2026-09-13

**FOUNDER-REPORT STATUS: HOLD — MANAGEMENT API VERSION UNRECOVERABLE**

Do **not** convert this artifact to PASS.  
Do **not** claim REMEDIATION PASS.  
Do **not** claim hosted Management API fidelity PASS.  
Do **not** attempt or claim repair.  
Do **not** claim full `00118`–`00123` remote apply completed.  
Do **not** create, infer, or guess timestamps.

This file is the current hosted-truth artifact. It incorporates the Chief live disposable probe on `jkorwnwwmdeflfntxntl` exactly. Token was never printed. No recovery was invented. This revision adds the exact sanitized Management API request/response, disposable leftover inventory (read-only), and a docs-only fail-closed production-runner proposal.

`docs/evidence/M3_F3_MANAGEMENT_API_RUNNER_FIDELITY_20260913.md` (tip `74e001e`) is **SUPERSEDED** insofar as it presented “GATED SCAFFOLDING READY / hosted NOT RUN” as current hosted truth.

**All prior Management API equivalence / repair / skip / continuation claims that depended on version recovery are SUPERSEDED.**

**DO NOT MERGE.**  
**DO NOT APPLY 00118+ TO PRODUCTION.**  
**NO ASTRA / DAYBREAK CONTACT.**  
**DO NOT DELETE OR PAUSE** disposable `jkorwnwwmdeflfntxntl`.  
**DO NOT MODIFY** leftover disposable DB objects.  
**DO NOT** remotely POST another Management API migration.

Draft PR: https://github.com/gatekipa/villageclaq/pull/84 (OPEN DRAFT UNMERGED)

## Pins (this evidence revision — HOLD, not PASS)

| Pin | Value |
|-----|-------|
| Base main | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| Planning PR #83 (unchanged) | `a293f5958b31548ccec7591b653eff2857ae9a90` |
| Start tip / previous head | `440ca02316f60750034943a479215e7b992e6c70` |
| Prior functional | `0c2fe83107fe440b46f978baf56ffd12db4f8cd4` |
| Prior evidence | `235116f9d9cb4665dd8d5385ac4b6af7ebc279f5` |
| Harness unlock | `483e47f59927a11faeef305a33570e9976f48757` |
| Gate-sync fix | `96bed5a4cdccb71c977536265fead8c9f28529bb` |
| Superseded scaffolding evidence | `74e001eb2fd336924497b45f8db243da1f672f2c` |
| **Functional SHA** | `0c2fe83107fe440b46f978baf56ffd12db4f8cd4` (unchanged; no functional commit this revision) |
| **Evidence tip** | *(this counts commit; SHA filled next)* |
| Recognition | exactly `["manual_income"]` |
| Founder-report status | **HOLD — MANAGEMENT API VERSION UNRECOVERABLE** |
| Remediation PASS | **NOT CLAIMED** |
| Hosted fidelity PASS | **NOT CLAIMED** |

## Authorized disposable (do not substitute)

| Item | Value |
|------|-------|
| Name | `villageclaq-f3-management-api-disposable-20260913` |
| Ref | `jkorwnwwmdeflfntxntl` |
| Org | `eyztkzkprpmlmcabrfef` |
| Sentinel | `villageclaq-f3-mapi-20260913-authorized` via `F3_DISPOSABLE_MAPI_SENTINEL` |
| Token | env `VILLAGECLAQ_F3_DISPOSABLE_MGMT_TOKEN` only (never print / commit) |
| Destructive opt-in | `F3_REMOTE_DESTRUCTIVE_TEST=1` |
| Production ref | `llbnliixczcqfftxpsmb` — **not contacted** |

This VM still has token length 0. It did **not** re-run hosted POST/GET. Facts below are the Chief live probe, copied exactly. Hosted re-run: **NOT RUN**.

## Exact sanitized Management API migration request

No `Authorization` header was logged. Body keys only `query` and `name`.

```
POST /v1/projects/jkorwnwwmdeflfntxntl/database/migrations
```

```json
{"query": "create table if not exists public.f3_mapi_throwaway_probe (\n  id bigint primary key generated always as identity,\n  note text default 'f3-mapi-disposable-probe'\n);\nCOMMIT;", "name": "f3_mapi_fail_probe_throwaway"}
```

## Exact sanitized response

- Status: **HTTP/2 400**
- Body (verbatim):

```json
{"message":"Failed to apply database migration: ERROR:  P0001: F3_MAPI_DISPOSABLE_HISTORY_INJECT: blocked INSERT into schema_migrations (probe)\nCONTEXT:  PL/pgSQL function supabase_migrations.f3_mapi_block_history_insert() line 3 at RAISE\n"}
```

- No version or name in the body.
- No useful version/name headers.
- `Authorization` never logged.

## Facts that must remain explicit

1. SQL **committed** despite HTTP 400 (`public.f3_mapi_throwaway_probe` exists).
2. History insertion **failed**.
3. No exact server-generated version or name is recoverable.
4. Migration history remained empty (`GET …/migrations` → `[]`).
5. Repair was correctly **NOT attempted**.
6. The probe was runner-faithful but limited to **one tiny disposable fixture**.
7. `00118`–`00123` were **NOT remotely applied**.
8. Production `llbnliixczcqfftxpsmb` was **untouched**.
9. All prior Management API equivalence / repair / skip / continuation claims that depended on version recovery are **SUPERSEDED**.

## Chief live result on `jkorwnwwmdeflfntxntl` (unchanged hosted truth)

- Identity GET 200: name `villageclaq-f3-management-api-disposable-20260913`, ref `jkorwnwwmdeflfntxntl`, ACTIVE_HEALTHY, ≠ production.
- Baseline GET migrations: `[]`
- POST `/database/query` works (201) for SQL.
- Failure injection: created `schema_migrations` + BEFORE INSERT trigger raising `F3_MAPI_DISPOSABLE_HISTORY_INJECT`; then POST `/database/migrations` `{query,name}` tiny SQL creating `public.f3_mapi_throwaway_probe` ending COMMIT.
- Migration POST → HTTP 400; error mentions history INSERT blocked; list still `[]`; `schema_migrations` rows=0; `to_regclass` shows table EXISTS.
- Conclusion: SQL committed, history failed.
- Version recovery from response body / list_migrations / schema_migrations → **NONE**.
- **Verdict required: HOLD — MANAGEMENT API VERSION UNRECOVERABLE**
- Repair: DO NOT attempt / DO NOT claim.
- Full 00118–00123 remote apply: DO NOT claim completed; limitation that one runner-faithful case established universal unrecoverability under history-insert failure.

## Limitation

One runner-faithful case established **universal unrecoverability under history-insert failure**. Do not treat a parser-only `version= name=` extract as hosted recovery. Do not clock, guess, or nearest-match a version. Repair is forbidden when the history phase fails before version persistence.

## Disposable object inventory (read-only 2026-09-13; do not modify objects)

**poison_still_installed: false** (already dropped by earlier probe cleanup BEFORE founder freeze-on-objects note; do **not** reinstall; do **not** drop remaining objects)

**ABSENT:** function `supabase_migrations.f3_mapi_block_history_insert`  
**ABSENT:** any trigger with `F3_MAPI_DISPOSABLE_HISTORY_INJECT`

**Still present:**

1. `public.f3_mapi_throwaway_probe` — table (0 rows; cols `id` bigint NOT NULL, `note` text default `'f3-mapi-disposable-probe'`)
2. `public.f3_mapi_throwaway_probe_id_seq` — sequence
3. `public.f3_mapi_throwaway_probe_pkey` — index
4. `supabase_migrations.schema_migrations` — table (0 rows; leftover from poison install)
5. `supabase_migrations.schema_migrations_pkey` — index
6. `supabase_migrations.schema_migrations_idempotency_key_key` — index

Migrations list still `[]`.

**DO NOT** delete/pause disposable `jkorwnwwmdeflfntxntl`.  
**DO NOT** modify these leftover objects from this task.

## Smallest fail-closed alternative production-runner proposal (PROPOSAL ONLY — not implemented)

Treat Management API file-stream `POST {query,name}` as the apply transport, but **fail closed** if the apply response is non-2xx **OR** if post-apply `GET …/migrations` does not show a new authoritative server version+name that VillageClaq can map to the exact authorized SQL digest. In that case:

- STOP with **HOLD — MANAGEMENT API VERSION UNRECOVERABLE**
- do not repair
- do not guess timestamps
- do not continue the queue
- escalate to founder

Optionally (future, separate auth): require an out-of-band pre-agreed “history attestation” channel only if Supabase later exposes an authoritative failed-apply version artifact — until then, absence of persisted version is terminal HOLD.

Do **not** fall back to `db push`, MCP for large SQL, caller-generated timestamps, or local two-phase as production apply.

This is **docs-only proposal text**. There is **no** code path that auto-repairs or auto-continues after unrecoverable HOLD.

## What prior functional revision encoded (local + gated; SHA unchanged)

1. Harness remains unlocked only for ref `jkorwnwwmdeflfntxntl` + sentinel `villageclaq-f3-mapi-20260913-authorized` + `F3_REMOTE_DESTRUCTIVE_TEST=1` + env token. Token is never hardcoded.
2. `classifyHistoryInsertFailure()` HOLDs and sets `repairForbidden` for HTTP 400 + history INSERT blocked / inject marker + empty list + empty schema.
3. Qualifier refuses repair and does not continue 00118–00123 on that HOLD.
4. Runbook uses the exact HOLD wording and forbids repair for this failure mode.

## Fresh local counts (this revision; 2026-09-13T17:18Z; PostgreSQL 17.11; CLI 2.117.0)

Local remediable gates remain green. Combined founder status is still HOLD. Environmental limitation: agent VM has no disposable token → hosted re-run **NOT RUN**; Chief live probe remains authoritative hosted evidence. No remote migration POST was performed.

| Suite | Result |
|-------|--------|
| Remote Management API hosted re-run in this VM | **NOT RUN** (token absent) |
| Chief live probe (hosted) | **HOLD — MANAGEMENT API VERSION UNRECOVERABLE** |
| Version recovery (hosted) | **NONE** (response / list / schema) |
| Repair + continuation (hosted) | **FORBIDDEN / NOT ATTEMPTED** |
| Sequential 00118–00123 via Management API | **NOT COMPLETED** |
| Management API custom skip | **NOT OBSERVED — not claimed** |
| Management API harness (local unit) | **22/22 PASS** |
| Local disposable safety | **45/45 PASS** |
| SQL pre-commit atomicity | **14/14 PASS** |
| Local two-phase external-ledger (NON-API) | **9/9 PASS** |
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
| Post-S0 regression | **14/14 PASS** |
| Combined `npm run test:f3` | **962/962 PASS** |
| `test:m2` | **111/111 PASS** |
| M2 static | **9/9 PASS** |
| Cut 1 static | **11/11 PASS** |
| Cut 2 non-regression (`test:m2-cut2-nonregression`, M2-C2-01..20) | **20/20 PASS** |
| Cut 3 storage buckets | **11/11 PASS** |
| `tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** (dummy `https://example.invalid.supabase.local`) |
| Qualify without env | exit 2 `NOT_RUN`; runbook HOLD + repair FORBIDDEN |

Digest confirmation this revision: all six `00118`–`00123` SHA-256 values **UNCHANGED**.

Prior 17:03Z table listed cut2 as 21/21; this fresh run of the same npm script is **20/20** (file contains M2-C2-01..20 only). Other suite counts match the prior table.

## Frozen digests (must remain unchanged)

| File | SHA-256 |
|------|---------|
| `00118` | `517774fd883ecc8c8ba7d2e287c7245a1289b21623c839f594b0801611968f3c` |
| `00119` | `9b09a733ed848e2a88a894db0815bd0f33f86335b58f7c9cd58845b6607d785d` |
| `00120` | `4b870418ea15160a7aec0e6df707d9c8a3afc435f2d8bd1c861e0af7c47eb505` |
| `00121` | `568ae0b15b1b6e6c0a7effd9e9b5644a294cc22d76dbbf0e6714a28888825cf5` |
| `00122` | `fd2c6e8729d1c7983421804b5f028edd16170c9f9056c8db2f3994f4dff8bdf9` |
| `00123` | `848b7cbe7e4e20e2e284d88f9954be0be8ffdfe4fc6d7c649e536d0c09aab699` |

## Withdrawn / not claimed / SUPERSEDED

- REMEDIATION PASS
- Hosted Management API fidelity PASS
- Recovered version from the live 400 body / list_migrations / schema_migrations
- CLI repair attempted or completed
- Full 00118–00123 Management API apply completed
- Apply-time clock / guessed / nearest timestamp as a repaired version
- Management API custom skip / skip-if-present
- Local two-phase helper is API-equivalent
- Clean 00001–00117 disposable replay
- Any prior equivalence / repair / skip / continuation claim that depended on version recovery

## Cleanup recommendation (do not execute)

Leave disposable project `jkorwnwwmdeflfntxntl` in place. Do **not** delete or pause it from this task. Do **not** modify leftover objects. Poison trigger/function already dropped (`poison_still_installed: false`). Throwaway table `public.f3_mapi_throwaway_probe` and leftover `schema_migrations` objects remain.

## Chief-ready 19-field HOLD report draft (this revision)

1. `verdict` = **HOLD — MANAGEMENT API VERSION UNRECOVERABLE** (do not convert to PASS)
2. `functional_sha` = `0c2fe83107fe440b46f978baf56ffd12db4f8cd4` (unchanged)
3. `evidence_sha` = *(this counts commit; SHA filled next)*
4. `starting_ref` = `440ca02316f60750034943a479215e7b992e6c70`
5. `prior_evidence` = `235116f9d9cb4665dd8d5385ac4b6af7ebc279f5`
6. `pr` = **#84 OPEN DRAFT UNMERGED** (https://github.com/gatekipa/villageclaq/pull/84)
7. `production_contacted` = **false** (`llbnliixczcqfftxpsmb` untouched)
8. `remote_00118_00123` = **NOT remotely applied**; SQL bytes/digests frozen
9. `repair` = **NOT attempted**; repair forbidden
10. `version_recovered` = **NONE** (no exact server-generated version or name)
11. `apply_request` = `POST /v1/projects/jkorwnwwmdeflfntxntl/database/migrations` body keys only `query`,`name`; name `f3_mapi_fail_probe_throwaway`
12. `apply_response` = **HTTP/2 400**; body `Failed to apply database migration: ERROR:  P0001: F3_MAPI_DISPOSABLE_HISTORY_INJECT: blocked INSERT into schema_migrations (probe)` + PL/pgSQL context; no version/name; Authorization never logged
13. `sql_committed` = **true** (`public.f3_mapi_throwaway_probe` exists despite HTTP 400)
14. `history_failed` = **true**; `GET …/migrations` → `[]`
15. `poison_still_installed` = **false**; leftover objects 1–6 listed above; do not modify
16. `hosted_rerun` = **NOT RUN** (this VM token length 0); Chief live probe remains authoritative hosted evidence
17. `local_counts` = harness 22/22; local safety 45/45; atomicity 14/14; external-ledger NON-API 9/9; recognition 40/40; F3-01..05 DB+Astra 43/159/169/25/80/23/170/31/118; post-S0 14/14; test:f3 962/962; m2 111/111; m2 static 9/9; cut1 11/11; cut2 20/20; storage 11/11; tsc PASS; build PASS; qualify exit 2 NOT_RUN
18. `fail_closed_proposal` = docs-only; file-stream `{query,name}`; fail closed on non-2xx **or** missing authoritative GET version+name mapped to authorized digest; STOP HOLD; no repair; no guessed timestamps; no queue continuation; no `db push` / large-SQL MCP / caller timestamps / local two-phase as production apply
19. `merge_deploy` = **DO NOT MERGE / DO NOT DEPLOY**; PR #83 untouched; no Astra/Daybreak contact
