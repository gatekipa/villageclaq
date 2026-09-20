# Current status — VillageClaq F3 Daybreak qualification

**Status:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  
**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT  
**This file is the current remainder record.** Historical packages are linked, not copied.

Working rules: [AGENTS.md](../AGENTS.md). Product conventions: [CLAUDE.md](../CLAUDE.md).  
F23 closeout decision inputs: [docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/CHIEF_HANDOFF.md](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/CHIEF_HANDOFF.md).

## Authoritative build-plan reference — missing

No repository file is identified as the approved product build plan with explicit acceptance criteria for the remaining F3 outcome. This record does **not** invent one and does **not** reconstruct a roadmap from tests.

Closest linked artifacts (none of these is that missing plan):

| Artifact | Role |
|----------|------|
| [F21 preserve-baseline contract](evidence/M3_F3_DAYBREAK_CATALOG_V5_F21_PRESERVE_BASELINE_CONTRACT_20260919/) | Accepted contract for the preserve-`btree_gist` baseline |
| [F23 proposed hosted requal plan](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/PROPOSED_HOSTED_REQUAL_PLAN.md) | **PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE** |
| [F23 historical package](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/) | Authoritative local-application HOLD package |

## Pins

| Role | Value |
|------|-------|
| FUNCTIONAL_TIP | `77fd61dbf51652acabec0093d2a8549524b2dd75` |
| F23 evidence / prior #84 head | `a41549e9f5463f02993be6e5e72ee8bde4852d80` |
| Process/status closeout | `98c8c3d2d2164defef95b715e8f3258bad4e819d` |
| Fingerprint-retention executable | `8346c856b7ddbb75b7e4dbaf57a42fc14e6d8f78` |
| Authoritative PR | [#84](https://github.com/gatekipa/villageclaq/pull/84) OPEN DRAFT UNMERGED, title DAYBREAK HOLD |
| Aligned PRs | #85 / #86 (same title, same head) |
| Non-authoritative | #126 / #127 |
| Shared branch | `feat/m3-f3-01-05-forward-foundation-9b17` |

## Accepted work and evidence

Local F23 normal application (historical package; HOLD-package integrity accepted; **not** LOCAL APPLICATION COMPLETE):

- Six frozen migrations applied with exact identities: `20260913173000` / `f3_bounded_financial_epoch_foundation` … `20260913173005` / `f3_05_opening_cash_command`
- `operationCounts`: calibrationProbes=6, migrationApplications=6, retries=0, repairs=0, historyInjects=0
- Membership sets preserved: 264 `deptype=e` tuples; exact OID-bearing sets equal before reset / after reset / after qualification (counts alone insufficient)
- Fault-injection (separate database): `PRE_COMMIT_OR_ATOMIC_ROLLBACK`; repair-safety gate refused; `repairCalls=0` — correct atomic-rollback repair refusal (`F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED`)
- Independent QA: VillageClaq QA — **F23 HOLD PACKAGE ACCEPT** (HOLD-package integrity only)
- Combined `completeThrough00123 OR documentedAtomicRollbackHold` acceptance remains rejected

Evidence: [F23 package](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/), [F22 package](evidence/M3_F3_DAYBREAK_CATALOG_V5_F22_PRESERVE_BASELINE_QUAL_GATE_LOCAL_20260919/).

## Incomplete requirements (why they matter)

1. **Fingerprint qualification** — `F23_FINGERPRINT_MISMATCH`. Hosted-oracle fingerprints are not canonically equal to the local fixture after the six applies. QUALIFICATION PASS / `localApplicationComplete` remain false. Field-level expected/observed pairs were **not retained** in the F23 package; see [fingerprint-diff](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/fingerprint-diff/). Frozen SQL must not be patched to manufacture a match.
2. **Mandatory positive repair** — post-commit filename-version repair after objects remain is unexercised. Local current inject was classified atomic rollback and correctly refused repair. The approved CLI path can still produce the committed-objects / missing-history state (in-file `COMMIT` then CLI history `INSERT`). See [repair feasibility](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/REPAIR_FEASIBILITY.md).
3. **F3-06** — separate and unstarted.

## Local versus hosted / production

| Surface | Status |
|---------|--------|
| Local PostgreSQL 17.11 F23 prove | Executed on the F23 evidence host. This closeout host has no local PG / no CLI 2.117.0 — no fresh prove rerun here. |
| Hosted disposable / production | **Not contacted.** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN |
| Production | Forever denied from this work |

## Owner, next action, remaining review budget

| Field | Value |
|-------|-------|
| Owner | Jude Anyere — two remaining contract decisions (fingerprint alignment; positive-repair authorization or amendment) |
| Next bounded action | One consolidated Daybreak closeout of those two issues. Not a fresh audit of accepted history. |
| Permitted scope | Review the closeout decision inputs. No hosted/disposable/production contact. No merge. No deploy. No F3-06. |
| Remaining acceptance | Fingerprint equality or an explicit founder waiver; authentic post-commit repair or an explicit founder amendment |
| Review / run budget | Ordinary documentation: **zero** adversarial rounds (this closeout). Next Daybreak closeout of the two remaining issues is one risky-work round against the existing budget — renaming F-numbers does not restart it. |
| Stop | Return any unresolved contract conflict to Jude. Do not start another general remediation campaign. |

## One small nonblocking backlog

- Add a single authoritative build-plan document (location still missing) so later outcomes can cite acceptance criteria without reconstructing them from tests or evidence packages.

DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  
Any future execution procedure remains: PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE  
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
