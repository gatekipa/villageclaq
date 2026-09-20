# Chief handoff — F24 rebound proposed hosted requal plan

| Field | Value |
|-------|-------|
| Owner | Jude Anyere — authorization decision on this **new** proposed plan. |
| Intended outcome | Proposed hosted procedure rebound to the F24-corrected candidate. |
| Permitted scope | Documentation only. Zero hosted database runs. No sibling PR. No third hosted attempt. |
| Remaining acceptance | Hosted raw fingerprint equality; hosted POST_COMMIT repair; hosted requalification. |
| Review / run budget | Documentation pass. Does not restart the review budget. ATTEMPT_1 and ATTEMPT_2 consumed. |
| Stop | This record. No hosted execution, merge, deploy, or F3-06. |
| Rules | [AGENTS.md](../../../AGENTS.md) |
| Current status | [docs/BUILD_STATUS.md](../../../BUILD_STATUS.md) |

**SCOPE_STOP — sibling PR vs AGENTS.md shared-head rule — keep `feat/m3-f3-01-05-forward-foundation-9b17` and #84 authoritative.**

DAYBREAK HOLD — HOSTED ATTEMPT_2 STOPPED AT RESET; QUALIFICATION NOT STARTED  
PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE  
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

## Return values

| Item | Value |
|------|-------|
| FUNCTIONAL_TIP | `874d7c63868398ae6779feb0e9cfd9751a8e34c5` |
| F24 local proof tip | `724c7b9f5f751961dfd97c4dd3d00007f9c0cb11` |
| Current plan path | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_PROPOSED_HOSTED_REQUAL_PLAN_20260920/PROPOSED_HOSTED_REQUAL_PLAN.md` |
| Plan SHA-256 | `5b9bf55dab0ff98a2c94b4aa87ceecc481b55fe21ce60945c1f026082a64fd97` (10542 bytes) |
| Consumed ATTEMPT_2 plan SHA-256 | `bf9ca7b6c408d72b9f1231f223628a41e77fe275132acf273cd5386dd8c3b138` (preserved, not mutated) |
| Runtime | `a88f34b378aa683a9e6412b773beaad5fc71490c0bf85ad0384a64b077d3039f` (47) |
| Union | `b62c82e56072248cd08c56912d31304c1e31ee997b4613d411724ca90e45e19f` (49) |
| Scope/SQL | `efd00f25ec108ba0e8041ae8890905cd347d925a750b77ed083dcccd40ee33a8` |
| Hosted ATTEMPT_3 | **not run / not authorized** |
| Concrete remaining blocker | Jude authorization of **new** founder-auth for the new candidate. Plus PR web bodies remain stale until a human or authorized token edits them (ManagePullRequest historically refused). #85/#86 stay on other branches until Chief FF. |

## Exact commands (NOT AUTHORIZED)

Reset:

```bash
node scripts/qualify-f3-db-push-disposable.mjs --qualification-reset --founder-authorization-artifact=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_HOSTED_REQUAL/hosted/qualification-reset/FOUNDER_AUTH.json --evidence-out=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_HOSTED_REQUAL/hosted/qualification-reset/qualify-result.json
```

One complete qual 00118–00123:

```bash
node scripts/qualify-f3-db-push-disposable.mjs --no-wipe --prep-floor --sequence-f3 --floor-mode=stub-live-pin --verification-mode=fault-injection --evidence-out=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_HOSTED_REQUAL/hosted/qualify-from-00118/qualify-result.json
```

Execution HEAD must equal `874d7c63868398ae6779feb0e9cfd9751a8e34c5`. Target `jkorwnwwmdeflfntxntl` only.

## Single next recommended action

Jude: authorize or refuse this rebound plan. Do not execute from this packaging. Do not treat ATTEMPT_2 auth as valid. Do not start a third hosted attempt unless a new founder artifact is issued.
