# F19 QA layout for independent Grok

Functional tip to review: `dfbeb11b49f7e9b061a4c700e0335d125ac669e2` (`F19_FUNCTIONAL_TIP`).

Review the committed helper + shared runner on that tip. Do not treat this builder evidence as raw independent proof.

## Layout
- `F19_FUNCTIONAL_TIP` — frozen functional SHA
- `process-evidence/` — builder boundary cases (THROWN_EACCES, PATH_REDACT, THROWN_ONLY, SUCCESS)
- `closure/` — F19 runtime/union identities (≠ F18)
- `qa-provenance/F18_INDEPENDENT_QA_INHERITED.json` — F18 reviewer `bc-49cebacf-a8b4-5f38-9609-95ffe86d6adf` labeled INHERITED
- `local-pg-proof/` — concurrency not re-run
- `suite-logs/` — this builder’s authentic counts

## Expected independent checks
1. Real thrown EACCES survives runner→helper→serialize→reread; cannot authorize successful finalization
2. Path-redacted stream: original identities ≠ relabeled sanitized; packaged identities match recovered bodies
3. Otherwise valid committed record with only `thrown:true` fails interpretation, attestation, finalization
4. Unchanged valid success still reparses committed CLEAN_BASELINE

Overall remains DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN.
