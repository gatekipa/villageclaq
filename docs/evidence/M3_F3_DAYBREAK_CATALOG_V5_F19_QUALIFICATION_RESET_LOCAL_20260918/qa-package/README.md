# F19 independent QA package

Authoritative independent Grok QA for VillageClaq F19 qualification-reset process-record integrity and thrown rejection.

- **Verdict:** F19 ACCEPT (local). Overall DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN.
- **Reviewer bc id:** `bc-8c2797cf-e789-5ab9-afd1-ff9a47a05cfa`
- **Reviewed pin:** `dfbeb11b49f7e9b061a4c700e0335d125ac669e2`
- **Classification:** `MUST_LOCAL` (no psql). F18 concurrency INHERITED, not re-run.
- Start at `score.md`. Score alone is insufficient.

| Path | Contents |
| --- | --- |
| `score.md` | Verdict + dispositions |
| `IDENTITY.json` | Reviewer / task / pin / environment |
| `COMMANDS.md` | Commands actually run |
| `environment/` | Host + pin checks |
| `logs/` | Raw sanitized gate + helper logs |
| `process-evidence/` | Four cases + F18 conceptual defects |
| `local-pg-proof/` | Concurrency INHERITED, not re-run |
| `postconditions.json` | Wipe, C4, identity, no 242/1 claim |
