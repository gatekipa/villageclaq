# Five-finding closure table

**F13 RESET DESIGN CORRECTED — AWAITING INDEPENDENT QA — NOT IMPLEMENTED YET**

| ID | Finding | F12 defect (reviewed) | F13 correction | Offline proof | Remaining (not this phase) |
|----|---------|-----------------------|----------------|---------------|----------------------------|
| A | Object and dependency scope | Broad `CASCADE`; `financial_*` treated as destructive selector; schemas/functions not fully identified | Finite schema-qualified allowlist + signatures + provenance/state/action/effects + ordered `RESTRICT` drops; unexpected deps block | `validateObjectAllowlist`, `validateNoBroadCascade`, tests F13-A01–A07 | Live `pg_depend` inventory after founder auth |
| B | Transaction-bound validation | `BEGIN` + drops + `COMMIT` without lock/revalidate/row checks | T0–T7 contract: bind, SERIALIZABLE, locks, revalidate, ordered mutate, affected-row, final asserts, uncertain-commit policy | `validateTransactionContract`, tests F13-B01–B03 | Runtime SQL emitter + gated apply (Phase 2) |
| C | Exact history matching | `OR name IS NULL OR name = ''`; historical version-only DELETE; skip risk | Authenticated PREASSIGNED version+name; null/empty rejected; mismatch aborts whole TX; historical six-row delete ≠ live state | `validateHistoryKeys`, `validateHistorySqlPredicate`, tests F13-C01–C05 | Fail-closed live history probe (no contact tonight) |
| D | Entrypoint, authorization, transport | One-shot SQL + vague future flag | One Phase-1 offline interface; Phase-2 qualify flag **plus** founder artifact binding target/candidate/closure/scope/budget; flag ≠ auth | `validateFounderAuthorizationBinding`, `planQualificationResetDesign`, tests F13-D01–D05 | Wire flag after QA accept; still reject wipe |
| E | Evidence provenance | Altered F9 result copy; path disclosure | Finalized sanitized F9 bytes + source commit + repo-relative path + full digest; F8 cited not recopied; argv CANNOT CONFIRM | tests F13-E01–E04; `provenance/PROVENANCE.json` | None for this finding if QA accepts the citation |

Wipe flag: still rejected in all rows (`F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`).
