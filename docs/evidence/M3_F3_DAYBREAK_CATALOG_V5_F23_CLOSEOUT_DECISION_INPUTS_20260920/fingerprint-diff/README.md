# F23 fingerprint difference evidence

Phase: after successful CLI 2.117.0 apply of each frozen file `00118`–`00123` (`after_successful_normal_application`), compared to the sealed hosted-oracle expected fingerprint for that file.

Authoritative expectation: `getFrozenExpectedFingerprint(file)` / `FROZEN_EXPECTED_FINGERPRINTS` in `scripts/lib/f3-db-push-repair-safety-gate.mjs`. Fingerprint acceptance is unchanged.

## Retention search (this closeout)

| Source | Phase-matched expected/observed catalog pairs |
|--------|-----------------------------------------------|
| F23 `local-pg-proof/RESULTS.json` case `F23_NORMAL_APPLICATION_LOCAL_QUALIFICATION` | **Not retained.** Records `qualifyError: fingerprint expected and observed are not canonically equal` and history identities only. |
| F23 `local-pg-proof/COMPLETE_SEQUENCE.json` | **Not retained.** Same error string; no field values. |
| F23 `suite-logs/prove-helper.out` | Same RESULTS JSON. No fingerprint objects. |
| Prior `docs/evidence/**/*FINGERPRINT*` packages | Not F23-phase-matched (older files, hosted-only, or hash-only). Not used as F23 observed. |

**Disclosure:** F23 did not persist `qualify.sequence[].fingerprintAfterApply` / expected catalog / field diffs. The slogan “hosted ACL/owner versus local ubuntu” is not a substitute for those values.

A fresh normal-application capture was **not** executed on this closeout host (no local PostgreSQL, no CLI 2.117.0).

If a later authorized local run is needed, `scripts/prove-f3-qualification-reset-local.mjs` can retain field diffs without changing fingerprint acceptance:

`node scripts/prove-f3-qualification-reset-local.mjs --normal-application-only --fingerprint-diff-out <path>`

That command is **not** authorized by this closeout. Do not run fault injection or unrelated suites for this remainder.

## Difference table

See [DIFFERENCE_TABLE.md](DIFFERENCE_TABLE.md). Every known inequality is listed. Observed catalog values are **NOT RETAINED** except the compare verdict itself.

## Smallest recommendation (proposal until reviewed)

Do **not** waive hosted-oracle equality from the slogan. Do **not** patch frozen SQL.

Smallest local-fixture alignment, once observed values exist: map only those fixture role/owner/ACL records that differ, and only if each mapped difference preserves effective ownership, privileges, and grant options. Any role mapping remains a **proposal until reviewed**.

Until a phase-matched observed capture is retained, the alignment set cannot be enumerated. Next action is one instrumented local normal-application capture in an isolated run-owned `f3_*` database — not a hosted run, not fault injection.
