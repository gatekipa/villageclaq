# Chief handoff — F21 tip-bound local PostgreSQL proof

**Local classification:** `LOCAL_PG_EXECUTED`
**Overall status:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN
**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

This package is **evidence-only**. Functional bytes at `3fe7314ab7cfb2abbcd66d8eb09f26ba2ed0a9e0` are unchanged. No hosted/disposable contact. No contract change. No merge.

## Pins

| Role | SHA / value |
|------|-------------|
| Functional tip (prove HEAD) | `3fe7314ab7cfb2abbcd66d8eb09f26ba2ed0a9e0` |
| Contract tip | `b7d16544cdbb86ce47baba329835bd93dcb16d6d` |
| Accepted F19 ancestor | `dfbeb11b49f7e9b061a4c700e0335d125ac669e2` |
| Superseded stub | `64b4abe65e938daac32b160882e358253c141015` |
| This evidence root | `docs/evidence/M3_f3_[REDACTED_DB]/` |
| PRs | #84 / #85 / #86 OPEN DRAFT UNMERGED, head-identical, DAYBREAK HOLD titles |

## Prove

- Helper: `scripts/prove-f3-qualification-reset-local.mjs`
- `LOCAL_PG_EXECUTED=true`, `mustLocal=false`, `overallOk=true`
- 30 checks / 12 scenarios / 9 executed TX / 42 pass / 0 fail
- PostgreSQL 17.11 (Ubuntu 17.11-1.pgdg24.04+2), unix socket `[SANITIZED_ABS_PATH] role `ubuntu`, `f3_*` only

## Focused tests (same tip)

| Suite | Result |
|-------|--------|
| `scripts/test-f3-qualification-reset-design.mjs` | 33/33 |
| `scripts/test-f3-qualification-reset.mjs` | 70/70 |
| design+reset combined | 103/103 |
| `scripts/test-f3-db-push-harness.mjs` | 115/115 |

Do not claim inherited F19 combined suites as this run's hosted identity.

## Not authorized

Hosted/disposable contact, wipe, CASCADE, F3-06, Management API apply, production contact, Daybreak/Astra contact, catalog privileges, extension-removal, merge.
