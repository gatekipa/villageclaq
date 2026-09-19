# Chief handoff — hosted HOLD finalize + compatibility proposal

**Overall status:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN

**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

## Package / head identities

| Role | SHA / path |
|------|------------|
| Accepted F19 functional | `dfbeb11b49f7e9b061a4c700e0335d125ac669e2` |
| F19 evidence before hosted | `20b4b340b49bccfc96f23333c731bac54056ea9c` |
| Hosted HOLD package tip (cited, not duplicated) | `35b5be82acf01d11dd9f6578e8da7f384d8f925d` |
| Hosted HOLD root | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F19_QUALIFICATION_RESET_HOSTED_REQUAL/` |
| This offline analysis / proposal root | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F19_HOSTED_HOLD_COMPAT_PROPOSAL_20260919/` |
| PRs | #84 / #85 / #86 OPEN DRAFT UNMERGED aligned |

## Exact mismatch findings

- Offline `validateObjectAllowlist` reproduces `F13_UNEXPECTED_OBJECT_OR_DEPENDENCY`.
- **188** unexpected functions: 176 `gbt_*` family + 12 `*_dist` — **CANNOT CONFIRM** `btree_gist` ownership (no `pg_depend` in retained capture).
- **6** unexpected FK tuples among allowlisted tables; DDL provenance `00001` / `00117` (offline). Recognition gap vs `FINITE_DEPENDENCY_ALLOWLIST`.

## Minimal proposal

See `PROPOSED_CATALOG_COMPATIBILITY.md`: (A) evidence-gated extension-member recognition; (B) six `historicalNoticeOnly` FK tuples. Preserve ≠ delete-authority expansion. No functional changes in this task.

## Unresolved evidence gaps

1. Extension membership map for the 188 functions.  
2. Kind-preserving raw discovery blob in committed hosted evidence.  
3. Any post-fix hosted inventory (not authorized).

## Next decision needed

Founder routing among authorize bounded correction / defer for read-only enriched capture / reject-redirect. No Daybreak/Astra contact from Chief under this task.
