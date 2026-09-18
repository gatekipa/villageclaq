# F18 independent QA package

Authoritative independent Grok QA for VillageClaq F18 qualification-reset.

- **Verdict:** F18 ACCEPT (local). Overall DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN.
- **Reviewer bc id:** `bc-49cebacf-a8b4-5f38-9609-95ffe86d6adf`
- **Reviewed pin:** `ca2c0d536037da8c7f55627ac1694cacb932d1d7`
- **Actual PG server version:** `17.11 (Ubuntu 17.11-1.pgdg24.04+2)`
- Start at `score.md`. Score alone is insufficient.

| Path | Contents |
| --- | --- |
| `score.md` | Verdict + dispositions |
| `IDENTITY.json` | Reviewer / task / pin / environment |
| `COMMANDS.md` | Commands actually run |
| `environment/` | Host + pin checks |
| `logs/` | Raw sanitized gate + helper logs |
| `lock-observations/` | Backend-bound lock proofs + independent requalify |
| `process-evidence/` | E2E success / EACCES / timeout / malformed |
| `local-pg-proof/` | Helper RESULTS + success/T3 reparse |
| `postconditions.json` | Wipe, buckets, approved-set, lock-wait flags |
