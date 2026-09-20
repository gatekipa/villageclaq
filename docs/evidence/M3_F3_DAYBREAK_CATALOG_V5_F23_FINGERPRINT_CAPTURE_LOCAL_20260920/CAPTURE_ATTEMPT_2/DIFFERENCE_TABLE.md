# CAPTURE_ATTEMPT_2 fingerprint difference table — 2026-09-20

Compare function (unchanged): `fingerprintCompleteAndExact` → `canonicalFingerprintEqual` after `canonicalizeFingerprintForCompare`.  
Fingerprint acceptance is unchanged. Frozen SQL / frozen oracle were not patched.

**This table is the actual authorized SUPERUSER-fixture capture.** The prove command ran once. Mismatch is preserved. This is not equality and not a mapping.

Attempt 1 empty `files` table remains at [../DIFFERENCE_TABLE.md](../DIFFERENCE_TABLE.md).

## Capture result

| Item | Value |
|------|-------|
| Prove command | **ran once** (`--normal-application-only --fingerprint-diff-out`) |
| `captureExecuted` | `true` |
| `proveExitCode` | `0` |
| Window (UTC) | `2026-09-20T06:26:46Z` → `2026-09-20T06:27:01Z` |
| Classification | `LOCAL_PG_EXECUTED` |
| Server | `17.11 (Ubuntu 17.11-1.pgdg24.04+2)` |
| CLI | `2.117.0` (`matchesPin=true`) |
| Role `ubuntu` | `rolsuper=true`, `rolcanlogin=true` |
| Pre-floor verdict | `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` |
| Qualify status | `HOLD` |
| `remainingHold` | `F23_FINGERPRINT_MISMATCH` |
| Qualify error | `fingerprint expected and observed are not canonically equal` |
| `floorInstalled` | `true` |
| `preDbPushGatesOk` | `true` |
| `sequenceLength` | `6` |
| `files` in [fingerprint-diff.json](fingerprint-diff.json) | 6 |
| Phase reached | `after_successful_normal_application` for all six files |

## Six migrations and operation counts

| Item | Observed |
|------|----------|
| Expected history identities | `20260913173000` / `f3_bounded_financial_epoch_foundation` … `20260913173005` / `f3_05_opening_cash_command` |
| Observed history rows | all six present, names match |
| Missing versions | none |
| `migrationsAppliedThrough00123` | `true` |
| `completeThrough00123` | `false` (fingerprint HOLD) |
| `localApplicationComplete` | `false` |
| `operationCounts.calibrationProbes` | `6` |
| `operationCounts.migrationApplications` | `6` |
| `operationCounts.retries` | `0` |
| `operationCounts.repairs` | `0` |
| `operationCounts.historyInjects` | `0` |
| `floorCalls` | `2` |
| `dbPushCalls` | `12` |
| `repairCalls` | `0` |

Membership (not a fingerprint field; retained): 264 `deptype=e` tuples; exact sets equal before reset / after reset / after qualification (`countsAloneInsufficient=true`).

## Canonical SHA per file

| file | expectedSha256 | observedSha256 | exactOk |
|------|----------------|----------------|---------|
| `00118_f3_bounded_financial_epoch_foundation.sql` | `888c794355982346573a3353caa7fa74181bc0048cc95990de60416de893ab1d` | `556e331d47842748e3dd612aa3d0d2e8ca6f59771c248f67a72e5bb23facfaff` | false |
| `00119_f3_01_core_ledger_foundation.sql` | `5e03111ffb34be3ed76a714370c93e70210a9741a25ac7b9158a9a9ad22f12f4` | `0c6e11b4c6473472e58bb6ef1b6c265f2259115cc2d50ab430e10d8e2a6c19f4` | false |
| `00120_f3_02_secure_posting_idempotency.sql` | `35eba6966d2c077a9467f09adc6c85306b951c9d8388ee758a60d924c05ae51a` | `5b67f3ae0c5d37445d581e020be0cddeb3d9fc6827bb510f0915107b8bb36f5e` | false |
| `00121_f3_03_projection_read_proof.sql` | `8f65797949d8c5afb7dfa99b8020da52385347099b2a5b9be5148b253e76bde6` | `340f5746700d74a92ae66c65d95ed074ed2d330d7001405aa80670d7c5b06752` | false |
| `00122_f3_04_correction_reversal.sql` | `6e3240759aec64d4692422aac006b4fb865e3039832be84efea86b39c0253175` | `75c4f8b0c77d56955611fc9de57b2c817bcc85c02ded779a7f79e0f499e9fcbc` | false |
| `00123_f3_05_opening_cash_command.sql` | `d5e50fd760a9629bf4e1574fd256ecf0d4a108df83dec27323a608e0466dcb34` | `ba24bf71766a73f1e6132c5e92fbd4b97631a0137b501c287bffa92887fffadd` | false |

## Fields that differed vs matched

Equal on every file (when present): `columns`, `constraints`, `indexes`, `triggers`, `views`, `rls`, `policy`, `policies`, `hgp`, `enqueue`, `f3_objects_absent`, `schema_version`, plus migration identity keys.

Differed:

| file | differing fields |
|------|------------------|
| 00118 | `acl`, `acls`, `relations`, `schema`, `schemas`, `types` |
| 00119–00123 | `acl`, `acls`, `function_owner`, `relations`, `routines`, `schema`, `schemas`, `types` |

## Non-ACL differences (every pair)

**347 record pairs.** Every pair is `owner` expected `postgres` / observed `ubuntu`.  
`security_definer`, `functiondef`, and `rls_enabled` matched whenever both sides had the key.

Full object list: [NON_ACL_OBJECTS.md](NON_ACL_OBJECTS.md).

| field | pattern | expected | observed |
|-------|---------|----------|----------|
| `schema` / `schemas` | `financial_private`; from 00119 also `financial_core` | owner `postgres` | owner `ubuntu` |
| `relations` | all captured financial tables (3 on 00118 → 11 on 00123) | owner `postgres` | owner `ubuntu` |
| `types` | matching composites/enums | owner `postgres` | owner `ubuntu` |
| `function_owner` | 7 on 00119 → 28 on 00123 | owner `postgres` | owner `ubuntu` |
| `routines` | same functions as `function_owner` | owner `postgres` | owner `ubuntu` |

00118 has no `function_owner` / `routines` diffs (those keys matched / were absent as diffs).

## ACL / owner-default privilege differences

Top-level `acl` / `acls` counts (helper `record_set`):

| file | expectedCount | observedCount | onlyInExpected | onlyInObserved |
|------|---------------|---------------|----------------|----------------|
| 00118 | 34 | 27 | 33 | 26 |
| 00119 | 109 | 102 | 98 | 91 |
| 00120 | 131 | 124 | 115 | 108 |
| 00121 | 135 | 128 | 115 | 108 |
| 00122 | 158 | 151 | 131 | 124 |
| 00123 | 171 | 164 | 141 | 134 |

Role names on differing tuples:

| side | grantee / grantor |
|------|-------------------|
| expected | grantee `authenticated` / `postgres` / `service_role`; grantor `postgres` |
| observed | grantee `authenticated` / `service_role` / `ubuntu`; grantor `ubuntu` |

Owner-default table privileges (DELETE/INSERT/MAINTAIN/REFERENCES/SELECT/TRIGGER/TRUNCATE/UPDATE) appear as `postgres`/`postgres` in the oracle and `ubuntu`/`ubuntu` locally. Function EXECUTE and schema CREATE/USAGE follow the same owner-name substitution, with `authenticated` and `service_role` remaining as grantees.

**Remainder that is not a postgres↔ubuntu rename** (same on every file after mapping expected `postgres`→`ubuntu` on owner/grantee/grantor only):

| object | privilege | expected (hosted oracle) | observed (this capture) |
|--------|-----------|--------------------------|-------------------------|
| `public.financial_ledger_epochs` | `service_role` DELETE | present (`grantor=postgres`) | **absent** |
| `public.financial_ledger_epochs` | `service_role` INSERT | present | **absent** |
| `public.financial_ledger_epochs` | `service_role` MAINTAIN | present | **absent** |
| `public.financial_ledger_epochs` | `service_role` REFERENCES | present | **absent** |
| `public.financial_ledger_epochs` | `service_role` TRIGGER | present | **absent** |
| `public.financial_ledger_epochs` | `service_role` TRUNCATE | present | **absent** |
| `public.financial_ledger_epochs` | `service_role` UPDATE | present | **absent** |
| `public.financial_ledger_epochs` | `service_role` SELECT | present | present (`grantor=ubuntu`) |
| `public.financial_ledger_epochs` | `authenticated` SELECT | present | present |

Local `service_role` keeps SELECT only on that table. Nested `relations` ACL for `public.financial_ledger_epochs` shows the same remainder (this is why that one relation pair does not collapse after owner remap even though both owners become `ubuntu`).

Complete ACL tuples remain in [fingerprint-diff.json](fingerprint-diff.json). They were not normalized.

## Smallest fixture-alignment proposal

**Proposal only — not authorized — do not apply. No second capture. Mapping and waiver remain unapproved.**

Two evidence-supported pieces, not one waiver:

1. **Owner / grantor / grantee name** — every non-ACL pair, and almost all ACL tuples, are hosted `postgres` versus local fixture `ubuntu` (the role that ran `db push` as SUPERUSER). Smallest compare-side proposal: a reviewed map of catalog `postgres`↔`ubuntu` for owner/grantee/grantor **after** object identity matches. This is not a GRANT/REVOKE change and is not hosted identity proof. SUPERUSER execution must not be treated as restricted-role authorization or RLS enforcement (`rls` / `policy` already matched).

2. **Privilege-set remainder** — mapping (1) does **not** absorb `service_role` DML on `public.financial_ledger_epochs` (seven privileges present in the sealed oracle, absent locally; SELECT remains). Do not grant-align this to manufacture a match. Founder decision later: investigate default-privilege / GRANT origin, or an explicit scoped waiver of those seven tuples only — not authorized here.

Do not patch frozen SQL. Do not change fingerprint acceptance. Do not treat empty attempt-1 `files` as this result.

## What this package does not do

- Does not treat the mismatch as equality
- Does not apply a postgres↔ubuntu map
- Does not waive the `service_role` DML remainder
- Does not patch frozen oracle or migrations
- Does not run repair
- Does not consume another capture
- Does not credit SUPERUSER as RLS / restricted-role proof
