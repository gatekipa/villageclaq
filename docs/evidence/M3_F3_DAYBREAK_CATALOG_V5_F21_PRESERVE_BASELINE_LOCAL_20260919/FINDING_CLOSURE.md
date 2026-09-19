# F21 local evidence — tip-bound LOCAL_PG_EXECUTED

**Supersedes** incomplete stub `64b4abe65e938daac32b160882e358253c141015` (evidence was not on functional tip; QA HOLD `LOCAL_EVIDENCE_NOT_ON_FUNCTIONAL_TIP` / `MUST_LOCAL_LIVE_PG`).

## Status
- Local: **LOCAL CANDIDATE READY** — independent QA **IMPLEMENTATION ACCEPT** — `LOCAL_PG_EXECUTED=true`
- Overall: **DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN**
- Functional tip (unchanged bytes): `3fe7314ab7cfb2abbcd66d8eb09f26ba2ed0a9e0`
- HEAD during prove: `3fe7314ab7cfb2abbcd66d8eb09f26ba2ed0a9e0` (git rev-parse HEAD equal)
- PostgreSQL: 17.11 (Ubuntu 17.11-1.pgdg24.04+2)
- Fixture: `scripts/fixtures/disposable-postgres.mjs` isolated `f3_*` only
- Helper: `scripts/prove-f3-qualification-reset-local.mjs` (no script edit on this commit)

## QA HOLDs closed locally
| HOLD | Closure |
| --- | --- |
| LOCAL_EVIDENCE_NOT_ON_FUNCTIONAL_TIP | Complete package lives on a descendant of `3fe7314ab7cfb2abbcd66d8eb09f26ba2ed0a9e0` and records prove HEAD=`3fe7314ab7cfb2abbcd66d8eb09f26ba2ed0a9e0` |
| MUST_LOCAL_LIVE_PG | Committed helper returned `localPg.classification=LOCAL_PG_EXECUTED`, mustLocal=false, 42/42 |

## Preserve catalog
- Extension `btree_gist` present before and after
- deptype='e' members 264 → 264
- Typed captured members 188 (local fixture; hosted 188 CANNOT CONFIRM)
- Approved leftover `public.financial_accounts` / `post_financial_opening_cash` / authenticated history removed
- No DROP EXTENSION / CASCADE

## Closures (tip bytes)
- Runtime `F19_QUALIFICATION_RESET_RUNTIME_CLOSURE`: `c0f06211aa6018c153f9b735ce489aba50274ce997d627a1619803b24c5804e3` (count 45)
- Verification union `F19_QUALIFICATION_RESET_VERIFICATION_UNION`: `5194bd761e183c48752bd232da18840ad8327d09f95369d195a84ef285dd0d43` (count 48)
- ≠ forbidden summary `16e4757840aec5f4fb44504fbd33e8480de169553f9a1ccfb180dbde051cb66d`

## Floor
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
