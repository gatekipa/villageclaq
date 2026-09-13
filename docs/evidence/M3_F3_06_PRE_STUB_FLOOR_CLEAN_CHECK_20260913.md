# M3 F3 06 — pre-stub-floor clean-check — 2026-09-13

**CLEAN-CHECK: PASS.** Disposable `jkorwnwwmdeflfntxntl` matches the post-wipe baseline.

Packaged from Chief box artifacts `06-pre-stub-floor-clean-check.json` / `.md` (not present on this VM). Facts below are exactly as Chief reported.

Do **not** wipe.  
Do **not** convert overall qualification to PASS.  
Do **not** claim production PASS, clean `00001`–`00117` replay PASS, or merge/deploy auth.  
Hosted stub+live-pin floor / db-push remains **Chief-run** (password).

Floor label: `DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT`  
(short form: `DOCUMENTED QUALIFICATION FIXTURE — NOT CLEAN 00001–00117 / NOT PRODUCTION-EQUIVALENT`)

## Chief result

| Field | Value |
|-------|-------|
| `clean_ok` | `true` |
| `residuals` | `[]` |
| public tables | `0` |
| migrations | `[]` |
| `schema_migrations` rows | `0` |
| F3 objects | **absent** |
| matches post-wipe baseline | **yes** |
| wipe | **DO NOT WIPE** |
| Disposable | `jkorwnwwmdeflfntxntl` |
| Production | `llbnliixczcqfftxpsmb` — not contacted |

## Pins

| Pin | Value |
|-----|-------|
| Functional SHA | `28cb53e87d4261b043e89186b57f137078923844` |
| Evidence SHA | `eaf84a83214cdbefa727e594e6cd7287a2df28df` |
| Tip SHA | `PENDING_TIP` |
| Prior functional | `906e12e31e10c5b7d5bb517b83623b9d16a5b6c7` |
| Prior evidence | `f4ffacd6397a192872cba22d98f79d56c530dcea` |
| Prior tip | `a181bea463b1b7d255d70ce2b6be18522994d086` |
| PR #83 | `a293f5958b31548ccec7591b653eff2857ae9a90` unchanged |
| Main | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| Recognition | exactly `["manual_income"]` |
| PR #84 | OPEN DRAFT (authoritative) |
| PR #85 / #86 | OPEN DRAFT companions; tree-identical |

## Next

Qualifier re-evaluates this clean-check before `--prep-floor`. Fail → HOLD, no wipe, no floor, no db push. Hosted sequence remains Chief-only.
