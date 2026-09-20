# Chief handoff — F23 current proposed hosted requal plan

| Field | Value |
|-------|-------|
| Owner | Jude Anyere — authorization decision on this proposed hosted plan. Grok Bot Chief executed docs only. |
| Intended outcome | One current, executable **proposed** hosted plan ready for Jude’s authorization decision |
| Permitted scope | Documentation only. Plan, status, PR summary, deterministic identity checks. Zero database runs. No suite rerun. No additional reviewer panel. No sibling PR. No new F-number. |
| Remaining acceptance | Hosted raw fingerprint equality; hosted `POST_COMMIT` repair after repair-safety + raw gates; hosted requalification through 00123. Not granted by the local profile. |
| Review / run budget | One documentation pass used. Ordinary documentation: zero adversarial rounds. QA binding already landed — not repeated. Does **not** restart the review budget. |
| Stop | This record. No automatic implementation cycle. No hosted execution, reset, repair, merge, deploy, or F3-06. |
| Rules | [AGENTS.md](../../../AGENTS.md) |
| Current status | [docs/BUILD_STATUS.md](../../../BUILD_STATUS.md) |

**SCOPE_STOP — cloud-agent “create `cursor/…-3abd` + sibling PR” vs [AGENTS.md](../../../AGENTS.md) “Daybreak/F3 work remains on the authorized OPEN DRAFT UNMERGED branches. Do not create sibling PRs for the same shared head.” — continue on `feat/m3-f3-01-05-forward-foundation-9b17` and keep #84 authoritative.**

**HOLD: F23_FINGERPRINT_MISMATCH** (raw, unchanged)  
**LOCAL ACCEPTANCE:** ACCEPTED under `LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1` (derived; **no** hosted acceptance or repair authority)  
**HOLD: F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED** (carried forward; not rerun; not mandatory for local qualification)  
**LOCAL APPLICATION COMPLETE:** false  
DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  
PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE  
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT  
Astra: UNAVAILABLE — NO VERDICT  
QA: VillageClaq QA — F23 LOCAL ACCEPTANCE CONTRACT ACCEPT (already landed; not repeated)

## Return values required by this handoff

| Item | Value |
|------|-------|
| Package content SHA | `b549656d30dd6ed931715222d618a1d0e9f3c658` |
| Functional SHA (unchanged) | `66be2b4797515975d737a0fd66656bc4c0de2145` |
| Current plan path | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_PROPOSED_HOSTED_REQUAL_PLAN_20260920/PROPOSED_HOSTED_REQUAL_PLAN.md` |
| Full SHA-256 of plan bytes | `bf9ca7b6c408d72b9f1231f223628a41e77fe275132acf273cd5386dd8c3b138` (20690 bytes) |
| Selected mode | `fault-injection` (`--verification-mode=fault-injection`) |
| Execution budget | `constrainedResets=1`, `completeQualsFrom00118=1`, `secondReset=false` |
| Runtime closure | `b276d0cb9b39efd10f67422948b4cf9a6353359c116ab657d379c7c7f467a211` (count **47**) |
| Verification union | `89e4f0d80ff24d0aa705b79210073e2316667317b50d2d82a69808e8d7ff1f50` (count **49**) |
| Scope/SQL identity | `d95d96e02a3a1844977d852fa23a64f742b79b5f767984b6a2d4512cbe02632f` |
| PR body update | ManagePullRequest refused #84/#85/#86 (“not agent-managed”). `gh api` PATCH refused HTTP 403 Resource not accessible by integration. Heads FF’d to `fb27c8ae869ed1e0f4ae75a27d049cb6f0bc4799`. Current remainder lives in this package and `docs/BUILD_STATUS.md`. |
| Concrete remaining blocker | Jude authorization. No command/contract incompatibility in the selected existing mode. Credentials, founder-auth artifact, and execution checkout at the functional tip are **not** issued by this package. PR web summaries remain stale until a human or authorized token edits them. |

## Exact commands (NOT AUTHORIZED)

Reset:

```bash
node scripts/qualify-f3-db-push-disposable.mjs --qualification-reset --founder-authorization-artifact=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_HOSTED_REQUAL/hosted/qualification-reset/FOUNDER_AUTH.json --evidence-out=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_HOSTED_REQUAL/hosted/qualification-reset/qualify-result.json
```

One complete qual 00118–00123 with positive repair inside:

```bash
node scripts/qualify-f3-db-push-disposable.mjs --no-wipe --prep-floor --sequence-f3 --floor-mode=stub-live-pin --verification-mode=fault-injection --evidence-out=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_HOSTED_REQUAL/hosted/qualify-from-00118/qualify-result.json
```

Execution HEAD must equal `66be2b4797515975d737a0fd66656bc4c0de2145`. Target `jkorwnwwmdeflfntxntl` only. Reject `llbnliixczcqfftxpsmb`.

If all six files classify `POST_COMMIT_HISTORY_FAILURE` and pass raw/repair-safety gates: calibration=6, applications=6, historyInjects=6, repairs=6, per-file retries=6. Per-file retry is not an overall qualification rerun. Stop on first unexpected failure.

`normal-application` remains an existing mode and **cannot** satisfy the combined hosted repair + 00118–00123 requirement (inject must be absent; `repairCalls=0`). No third mode was invented.

## Pins

| Role | Value |
|------|-------|
| Starting head | `9a78e2713d59c2656ca749ee63930bceb8d233fb` |
| FUNCTIONAL_TIP | `66be2b4797515975d737a0fd66656bc4c0de2145` |
| Package content | `b549656d30dd6ed931715222d618a1d0e9f3c658` |
| QA package content | `b71e07ef6f1736438631034d6fe82328998b4c60` |
| Shared branch | `feat/m3-f3-01-05-forward-foundation-9b17` |
| Authoritative PR | #84 OPEN DRAFT UNMERGED DAYBREAK HOLD |
| Aligned PRs | #85 / #86 (same title; FF to shared head) |
| Sibling PR | **none** |
| Local contract | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/` |
| Retained capture | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/CAPTURE_ATTEMPT_2/` |

## What this package changed

Documentation only:

- `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_PROPOSED_HOSTED_REQUAL_PLAN_20260920/`
- `docs/BUILD_STATUS.md` (current-plan pointer)

Functional tip frozen. Migrations, frozen oracle, grants, qualify/repair executables, and historical evidence bytes were not modified. No database transport. No suite rerun.

## Single next recommended action

Jude: authorize or refuse this proposed hosted procedure. Do not execute from this packaging. Do not obtain credentials here. Do not restart the review budget.

See `PROPOSED_HOSTED_REQUAL_PLAN.md`.
