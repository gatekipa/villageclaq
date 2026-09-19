# Chief handoff — F21 preserve-`btree_gist` qualification baseline contract

**Contract verdict:** `CONTRACT_READY_FOR_QA`

**Overall status:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN

**Ticket label:** catalog-compatibility foundation qualification (**not** F3-06)

**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

This package is **contract-only**. No executable behavior change. No hosted/disposable contact. No catalog-privilege exception. No Daybreak/Astra contact. No extension-removal implementation.

## Package / head identities

| Role | SHA / path |
|------|------------|
| Start (this task) | `3389901d32c99df9623a6f066e9986f972743c13` |
| Accepted F19 functional | `dfbeb11b49f7e9b061a4c700e0335d125ac669e2` |
| F20 DESIGN_HOLD (preserved historical) | `cc0ecacb55941ab038dd52095bd1be814569d1b0` |
| F20 feasibility HOLD | `3389901d32c99df9623a6f066e9986f972743c13` |
| Hosted HOLD ancestor | `35b5be82acf01d11dd9f6578e8da7f384d8f925d` |
| This contract root | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F21_PRESERVE_BASELINE_CONTRACT_20260919/` |
| PRs | #84 / #85 / #86 OPEN DRAFT UNMERGED, head-identical, DAYBREAK HOLD titles |

## What QA is asked to decide

Independent VillageClaq Grok QA: ACCEPT or HOLD each F21-C* / Q1–Q18 against `REVISED_CONTRACT.md` + `CONTRACT_REQUIREMENTS_TRACE.json`.

This is **not** implementation authorization. This is **not** hosted requal PASS.

## Exact new identity (do not reuse `CLEAN_BASELINE`)

| Role | Value |
|------|-------|
| Success / already-clean | `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` |
| Envelope | `f21-qualification-reset-inventory-v1` / `1` |
| Membership record | `f21-qualification-reset-membership-v1` / `1` (F20 typed fields retained) |
| Policy id | `f21-btree-gist-extension-preserve-scoped-v1` |
| Classification | `EXTENSION_PRESERVE_SCOPED` |
| Live success string (unchanged) | `CLEAN_BASELINE` (wipe / `classifyInventory` only) |

## Policy in one paragraph

Disposable qualification-reset still drops approved application objects and deletes 00118–00123 history keys. `btree_gist` and authenticated `deptype='e'` members **remain**. `ext.btree_gist` leaves the **destructive** allowlist. Unrelated leftovers, forged membership overlapping reset targets, non-members, and unexpected `deptype='x'` still HOLD. Part B six FKs make the dependency set **43 = 31 + 12**. No CASCADE. No new table-deletion authority. `classifyInventory` is **not** globally relaxed. Hosted 188 ownership remains **CANNOT CONFIRM**. F20 `DESIGN_HOLD` / `F20_EXTENSION_MEMBERSHIP_SERIALIZATION_UNSUPPORTED` stays historical.

## Honest concurrency (not a HOLD on this contract)

This path does **not** remove the extension or members, so F20-R5 (serialize membership through DROP) is out of scope. It does **not** claim global extension DDL is frozen. Remaining destructive table/function drops and history deletes retain T2/T3/T5/T6. No Part A catalog lock or privilege work. Advisory lock stays helper-only.

## Extra path identified before any later edit

`scripts/qualify-f3-db-push-disposable.mjs` `qualificationResetQualifyEmitPayload` falls back to `CLEAN_BASELINE` when `resetResult.verdict` is missing. Authorize that extra edit before implementation if the fallback would reintroduce `CLEAN_BASELINE` as qualification-reset success.

## Not authorized

Merge, functional/script changes, hosted/disposable contact, wipe, CASCADE, F3-06, Management API apply, production contact, Daybreak/Astra contact, catalog privileges, extension-removal, or treating preserve residuals as `CLEAN_BASELINE`.
