# F19 QA layout

Functional tip (frozen): `dfbeb11b49f7e9b061a4c700e0335d125ac669e2` (`F19_FUNCTIONAL_TIP`).

Independent Grok QA **F19 ACCEPT** is in `qa-package/` (commit `c44f7fc20e93ca29e3010bfbdae8b0812f6cdf6a`), reviewer `bc-8c2797cf-e789-5ab9-afd1-ff9a47a05cfa`. Outer `evidence-index.json` covers the full tree including `qa-package/`.

## Layout
- `F19_FUNCTIONAL_TIP` — frozen functional SHA
- `qa-package/` — independent F19 ACCEPT package
- `qa-provenance/INDEPENDENT_QA.json` — F19 reviewer `bc-8c2797cf-e789-5ab9-afd1-ff9a47a05cfa`
- `qa-provenance/F18_INDEPENDENT_QA_INHERITED.json` — F18 reviewer `bc-49cebacf-a8b4-5f38-9609-95ffe86d6adf` labeled INHERITED
- `process-evidence/` — builder boundary cases (THROWN_EACCES, PATH_REDACT, THROWN_ONLY, SUCCESS)
- `closure/` — F19 runtime/union identities (≠ F18)
- `local-pg-proof/` — concurrency not re-run (INHERITED)
- `suite-logs/` — builder authentic counts

Overall remains DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN.
