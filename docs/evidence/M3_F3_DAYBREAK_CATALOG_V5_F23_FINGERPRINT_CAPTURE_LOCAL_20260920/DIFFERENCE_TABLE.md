# F23 fingerprint difference table — authorized local capture attempt 2026-09-20

Compare function (unchanged): `fingerprintCompleteAndExact` → `canonicalFingerprintEqual` after `canonicalizeFingerprintForCompare`.  
Fingerprint acceptance is unchanged. Frozen SQL / frozen oracle were not patched.

**This table is not a completed comparison.** The authorized prove command was **not executed**. There are **no** phase-matched expected/observed catalog pairs from this host.

The prior closeout [NOT RETAINED table](../M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/fingerprint-diff/DIFFERENCE_TABLE.md) remains a disclosure that F23 did not persist field values. It is **not** reused here as if those slogans were observations.

## Capture result

| Item | Value |
|------|-------|
| Prove command | **not run** |
| `captureExecuted` | `false` |
| `files` in [fingerprint-diff.json](fingerprint-diff.json) | `[]` |
| Phase | would have been `after_successful_normal_application` per file `00118`–`00123` |
| Blocker | `MUST_LOCAL` / `LOCAL_PG17_AND_CLI_2_117_0_ABSENT` |

## Differing fields

**None observed.** A continued `F23_FINGERPRINT_MISMATCH` remains the inherited F23 verdict. It is not a new compare from this run.

## Explicitly missing observations

Every catalog field that a successful `--fingerprint-diff-out` capture would have retained is **missing** on this attempt. Missing is an environment/execution gap, not an equality result.

Required keys (`FINGERPRINT_REQUIRED_KEYS`) with **no expected value, no observed value, no owner/ACL grantee/grantor/privilege/grant-option tuples, no identity** from this run:

| migration/object | field | expected | observed | phase |
|------------------|-------|----------|----------|-------|
| `00118`–`00123` (no file isolated) | `schema` / `schemas` | **MISSING** | **MISSING** | after_successful_normal_application — not reached |
| same | `owner` | **MISSING** | **MISSING** | not reached |
| same | `function_owner` | **MISSING** | **MISSING** | not reached |
| same | `acl` / `acls` (grantee, grantor, privilege, grantable) | **MISSING** | **MISSING** | not reached |
| same | `policy` / `policies` | **MISSING** | **MISSING** | not reached |
| same | `relations` | **MISSING** | **MISSING** | not reached |
| same | `columns` (incl. attacl) | **MISSING** | **MISSING** | not reached |
| same | `types` | **MISSING** | **MISSING** | not reached |
| same | `views` | **MISSING** | **MISSING** | not reached |
| same | `routines` | **MISSING** | **MISSING** | not reached |
| same | `rls` | **MISSING** | **MISSING** | not reached |
| same | `constraints` | **MISSING** | **MISSING** | not reached |
| same | `indexes` | **MISSING** | **MISSING** | not reached |
| same | `triggers` | **MISSING** | **MISSING** | not reached |
| same | `hgp` / `enqueue` / optional `hgp_pin` | **MISSING** | **MISSING** | not reached |
| same | `f3_objects_absent` | **MISSING** | **MISSING** | not reached |
| same | `function_definition` / `search_path` / `object_identity` | **MISSING** | **MISSING** | not reached |
| same | `schema_version` | **MISSING** | **MISSING** | not reached |

Non-ACL differences: **not observed** (cannot say they exist or do not exist).

History identities from the credited F23 six-apply remain historical only. They were not re-read here.

## Smallest fixture-alignment proposal

**Cannot be enumerated.** Mapping or waiver is **not approved**. Do not apply a role/owner/ACL map from the slogan “hosted postgres vs local ubuntu.”

Once a host with PostgreSQL 17 + CLI 2.117.0 completes the one authorized capture, the smallest proposal remains: map only those fixture role/owner/ACL records that actually differ, and only if each mapped difference preserves effective ownership, privileges, and grant options. That is still a **proposal until Jude reviews**. Security implication of guessing the map now: it could hide a real GRANT/REVOKE, SECURITY DEFINER owner, or RLS drift.

## What this package does not do

- Does not treat the old NOT RETAINED rows as field-level evidence
- Does not waive equality
- Does not patch frozen oracle or migrations
- Does not run repair
- Does not consume the one authorized complete capture
