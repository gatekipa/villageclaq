# Chief handoff — F23 closeout decision inputs

| Field | Value |
|-------|-------|
| Owner | Jude Anyere |
| Intended outcome | Repository-enforced working rules plus two decision inputs (fingerprint alignment; positive-repair authorization or amendment) |
| Permitted scope | Process/status documentation on existing shared head. No hosted/disposable/production contact. No merge. No deploy. No F3-06. No Daybreak/Astra contact. No sibling PRs. |
| Remaining acceptance | (1) fingerprint equality or explicit founder waiver; (2) authentic post-commit repair or explicit founder amendment |
| Review / run budget | Ordinary documentation: **zero** adversarial rounds. Next review is **one** consolidated Daybreak closeout of the two remaining issues (risky-work budget does not reset). |
| Stop | Return any unresolved contract conflict to Jude. Do not start another general remediation campaign. |
| Rules | [AGENTS.md](../../../AGENTS.md) |
| Current status | [docs/BUILD_STATUS.md](../../../BUILD_STATUS.md) |

**HOLD: F23_FINGERPRINT_MISMATCH**  
**HOLD: F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED** (mandatory positive repair still unexercised)  
**LOCAL APPLICATION COMPLETE:** false  
FUNCTIONAL_TIP: `77fd61dbf51652acabec0093d2a8549524b2dd75`  
Starting evidence/head: `a41549e9f5463f02993be6e5e72ee8bde4852d80`  
F23 historical base: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/`

DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  
Any future execution procedure remains: PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE  
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

## Commit SHAs (filled after land)

| Deliverable | Path | Commit |
|-------------|------|--------|
| Working rules | `AGENTS.md` | *(this closeout commit)* |
| Authorization rules | `CLAUDE.md` (git/deploy; product conventions preserved) | *(this closeout commit)* |
| Current-status record | `docs/BUILD_STATUS.md` | *(this closeout commit)* |
| Fingerprint table | `fingerprint-diff/DIFFERENCE_TABLE.md` | *(this closeout commit)* |
| Repair decision | `REPAIR_FEASIBILITY.md` | *(this closeout commit)* |

## Fingerprint difference table + smallest recommendation

Table: [fingerprint-diff/DIFFERENCE_TABLE.md](fingerprint-diff/DIFFERENCE_TABLE.md).

F23 did **not** retain phase-matched expected/observed catalog pairs. Every catalog field is listed; observed values are **NOT RETAINED** except the compare verdict `canonicalFingerprintEqual === false`. Prior fingerprint packages were not F23-phase-matched.

**Recommendation (proposal until reviewed):** do not waive equality from the ACL/owner slogan; do not patch frozen SQL. Smallest alignment is a reviewed local-fixture role/owner/ACL mapping that preserves effective ownership, privileges, and grant options — enumerable only after one instrumented local capture.

## Supported repair procedure or contract decision

See [REPAIR_FEASIBILITY.md](REPAIR_FEASIBILITY.md).

**Supported procedure (separate authorization, do not execute):** existing CLI 2.117.0 `supabase migration repair <filename version> --status applied --db-url … --workdir … --yes` after authentic `POST_COMMIT_HISTORY_FAILURE` and repair-safety gate pass.

**If that is not authorized — one contract decision:** amend the contract so post-commit repair is not mandatory for local qualification, while remaining mandatory before any hosted/production CLI 2.117.0 candidate.

## Fresh executions vs inherited vs limitations

| Kind | What |
|------|------|
| Fresh this closeout | Direct read of F23/F22 packages, frozen `00118`, qualify/CLI pins, and CLI 2.117.0 `ExecBatch` source. Direct diff of process docs. |
| Inherited | F23 six applies + identities + membership sets + QA HOLD PACKAGE ACCEPT. F22 atomic-rollback refuse. Hosted 2026-09-15 POST_COMMIT + `migration repair` records. |
| Not run | Fresh local prove, fault injection, hosted requal, fingerprint recapture (this host: no PG / no CLI 2.117.0). |
| Limitation | Field-level F23 observed fingerprints were never persisted. Local `objectsPresent=false` vs protocol-possible POST_COMMIT is unresolved without a new authentic objects-present check — do not manufacture it. |

## Next bounded owner / action

Jude: decide fingerprint alignment vs mandatory equality, and authorize the existing repair procedure **or** amend the contract. Next agent review: one Daybreak closeout of those two issues only.

#84 remains authoritative; #85/#86 aligned; #126/#127 non-authoritative. Titles remain DAYBREAK HOLD. OPEN DRAFT UNMERGED.
