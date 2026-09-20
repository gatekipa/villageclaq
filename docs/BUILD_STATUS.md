# Current status — VillageClaq F3 Daybreak qualification

**Status:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  
**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT  
**This file is the current remainder record.** Historical packages are linked, not copied.

Working rules: [AGENTS.md](../AGENTS.md). Product conventions: [CLAUDE.md](../CLAUDE.md).  
F23 closeout decision inputs: [docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/CHIEF_HANDOFF.md](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/CHIEF_HANDOFF.md).  
Authorized local-capture attempt (this record): [docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/CHIEF_HANDOFF.md](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/CHIEF_HANDOFF.md).

## Authorization (do not collapse these)

| Action | Status |
|--------|--------|
| **Local fingerprint capture** (one normal-application prove with committed `--fingerprint-diff-out`) | **Already authorized.** Prior F23 closeout host lacked PostgreSQL / CLI 2.117.0 and therefore did not execute. This host **attempted once** and **did not execute** the DB capture: same missing capability (no `psql`, no PostgreSQL 17 server, no CLI 2.117.0). The one authorized complete capture remains unused. Do not ask again for capture permission. |
| **Fingerprint mapping or waiver** | **Not approved.** Do not align roles, alter grants, normalize differences, or change fingerprint acceptance. |
| **Hosted reset / hosted qualification / hosted or local repair experiments** | **Not authorized.** PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE. |
| **Merge / deploy / `origin/main` / F3-06 / Daybreak–Astra contact** | **Not authorized.** |

Owner remains **Jude Anyere** for the two contract decisions after a successful capture (fingerprint alignment vs mandatory equality; authorize existing CLI repair **or** amend the contract). Next Daybreak closeout is still **one** consolidated review of fingerprint + repair. Carry [REPAIR_FEASIBILITY.md](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/REPAIR_FEASIBILITY.md) forward as review input — do not run repair experiments or amend the repair requirement here.

## Authoritative build-plan reference — missing

No repository file is identified as the approved product build plan with explicit acceptance criteria for the remaining F3 outcome. This record does **not** invent one and does **not** reconstruct a roadmap from tests.

Closest linked artifacts (none of these is that missing plan):

| Artifact | Role |
|----------|------|
| [F21 preserve-baseline contract](evidence/M3_F3_DAYBREAK_CATALOG_V5_F21_PRESERVE_BASELINE_CONTRACT_20260919/) | Accepted contract for the preserve-`btree_gist` baseline |
| [F23 proposed hosted requal plan](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/PROPOSED_HOSTED_REQUAL_PLAN.md) | **PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE** |
| [F23 historical package](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/) | Authoritative local-application HOLD package |
| [F23 capture attempt 2026-09-20](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/) | Authorized local capture **blocked**; not a completed comparison |

## Pins

| Role | Value |
|------|-------|
| FUNCTIONAL_TIP | `77fd61dbf51652acabec0093d2a8549524b2dd75` |
| F23 evidence / prior #84 head | `a41549e9f5463f02993be6e5e72ee8bde4852d80` |
| Process/status closeout | `98c8c3d2d2164defef95b715e8f3258bad4e819d` |
| Fingerprint-retention executable | `8346c856b7ddbb75b7e4dbaf57a42fc14e6d8f78` |
| Documentation/evidence head at capture attempt | `94b7b53f01c707bbbeda5416f4ab555393f9ce08` |
| Capture-addendum content | `f26b91e433c2dd6324c13560b9a8e7659d895a9e` |
| SHA-bind / shared head after this addendum | `8ec79fd34ba30857763e733c76ba69dcbd40dd2f` |
| Helper blob at that checkout | `4099edd183a3ec0b73302b80ac7fd0f126d6f6de` (`scripts/prove-f3-qualification-reset-local.mjs`) |
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
- Six earlier successful migration applications remain credited. This blocked attempt does **not** consume or retry them.

Evidence: [F23 package](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/), [F22 package](evidence/M3_F3_DAYBREAK_CATALOG_V5_F22_PRESERVE_BASELINE_QUAL_GATE_LOCAL_20260919/).

## Incomplete requirements (why they matter)

1. **Fingerprint qualification** — `F23_FINGERPRINT_MISMATCH`. Hosted-oracle fingerprints are not canonically equal to the local fixture after the six applies. QUALIFICATION PASS / `localApplicationComplete` remain false. Field-level expected/observed pairs were **not retained** in the F23 package and were **not captured** on this authorized attempt (environment blocker). Frozen SQL must not be patched to manufacture a match. See [capture package](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/).
2. **Mandatory positive repair** — post-commit filename-version repair after objects remain is unexercised. Local current inject was classified atomic rollback and correctly refused repair. The approved CLI path can still produce the committed-objects / missing-history state (in-file `COMMIT` then CLI history `INSERT`). See [repair feasibility](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/REPAIR_FEASIBILITY.md). **Do not re-execute repair.**
3. **F3-06** — separate and unstarted.

## Local versus hosted / production

| Surface | Status |
|---------|--------|
| Prior F23 prove host | PostgreSQL 17.11 + CLI 2.117.0; six applies credited; field diffs not retained |
| Prior closeout host | No local PG / no CLI 2.117.0 — capture not executed |
| This capture host (`bld-20260920-f00b54bc-98db-45ae-b093-2c8e3399ff71`) | No `psql`, no PostgreSQL server, no `/var/run/postgresql`, no `supabase` binary. Ubuntu 24.04 archive candidate is PostgreSQL **16**, not 17. Helper requires PostgreSQL **17** (`server_version_num` `^17`) and CLI **2.117.0**. Capture command **not run**. |
| Hosted disposable / production | **Not contacted.** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN |
| Production | Forever denied from this work |

## Owner, next action, remaining review budget

| Field | Value |
|-------|-------|
| Owner | Jude Anyere — two remaining contract decisions (fingerprint alignment; positive-repair authorization or amendment) |
| Next bounded action | Place the one authorized capture on a host that already has PostgreSQL 17 + CLI 2.117.0 (smallest capability below). Then one consolidated Daybreak closeout of fingerprint + repair. Not a fresh audit of accepted history. Not a new sibling PR. |
| Permitted scope | Review the closeout decision inputs plus this blocked-capture addendum. No hosted/disposable/production contact. No merge. No deploy. No F3-06. |
| Remaining acceptance | Fingerprint equality or an explicit founder waiver; authentic post-commit repair or an explicit founder amendment |
| Review / run budget | Ordinary documentation: **zero** adversarial rounds. The one authorized complete local capture is **still unused**. Next Daybreak closeout of the two remaining issues is one risky-work round against the existing budget — renaming F-numbers does not restart it. |
| Stop | Return the environment blocker. Do not install PGDG, do not download a CLI, do not start another general remediation campaign. |

## Smallest required capability (not built here)

To execute the already-authorized capture, a host must already provide:

1. PostgreSQL **17** server (F23 used `17.11 (Ubuntu 17.11-1.pgdg24.04+2)`) with Unix socket `/var/run/postgresql`, maintenance DB `postgres`, and role `ubuntu` able to `CREATE DATABASE` `f3_*`.
2. `psql` on `PATH`.
3. Supabase CLI **exactly 2.117.0** on `PATH` or `$HOME/.local/bin/supabase` (`discoverSupabaseCli().matchesPin === true`).
4. Then one run of the unmodified helper: `node scripts/prove-f3-qualification-reset-local.mjs --normal-application-only --fingerprint-diff-out <path>`.

This snapshot does not have those binaries. Adding the PGDG apt repo, installing PostgreSQL 17, or fetching CLI 2.117.0 would be new infrastructure and was not done.

## One small nonblocking backlog

- Add a single authoritative build-plan document (location still missing) so later outcomes can cite acceptance criteria without reconstructing them from tests or evidence packages.

DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  
Any future execution procedure remains: PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE  
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
