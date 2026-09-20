# F23 finding closure

## Connected
Normal application through frozen 00118–00123 is a separately selected verification mode on the shared qualify entrypoint. It does not share acceptance with the F22 fault-injection HOLD.

- Mode is recorded before any database operation (`hostedAuthority=false`)
- Default unspecified mode remains `fault-injection` so F22 behavior is unchanged
- Normal path requires inject objects absent, applies 00118–00123 with CLI 2.117.0, authenticates exact version/name identities, and withholds QUALIFICATION PASS unless hosted-oracle fingerprints are canonically equal
- Helper no longer accepts via `completeThrough00123 || documentedAtomicRollbackHold`
- Negative-test pass does not satisfy application completion; application of six migrations does not establish post-commit repair

## Normal application result
`HOLD: F23_FINGERPRINT_MISMATCH`

All six frozen migrations applied on a fresh run-owned PostgreSQL 17.11 fixture. Exact history identities match. Catalog objects present after each apply. Hosted-oracle fingerprint equality failed because local ubuntu/fixture roles are not hosted postgres/service_role/authenticated identity proof. Frozen SQL was not patched. QUALIFICATION PASS / localApplicationComplete remain false.

## Fault-injection result (re-executed)
`HOLD: F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED`

PRE_COMMIT_OR_ATOMIC_ROLLBACK; repairCalls=0 remains correct. Historical F22 package preserved. F22 HOLD PACKAGE ACCEPT remains inherited HOLD-package integrity only — not LOCAL CANDIDATE READY.

## Repair coverage
- Freshly exercised: F22 refuse (repair-safety gate; objects absent)
- Inherited accepted evidence: F22 HOLD PACKAGE ACCEPT for F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED
- Unexercised: post-commit filename-version repair after objects remain
- Mandatory under approved contract: yes
- Promoted not-exercised to PASS: no

## Independent QA
VillageClaq QA (independent Grok-family; distinct from builder) recorded **F23 HOLD PACKAGE ACCEPT** for functional tip `77fd61dbf51652acabec0093d2a8549524b2dd75` and evidence tip `c0a6746516b115b9e1db6ce311c4a4fe80113b01`. Material findings: none. Builder claim corroborated: `F23_FINGERPRINT_MISMATCH`; `migrationsAppliedThrough00123=true`; `completeThrough00123=false`. Fingerprint HOLD must not be credited as application success. Complete local prove re-run was NOT EXECUTED on the QA host (no local PG); check 2 is artifact-inspected only. See `qa-package/QA_PROVENANCE.md`.

## Not done
Hosted requalification, disposable contact, production, merge, F3-06, LOCAL APPLICATION COMPLETE, LOCAL CANDIDATE READY, fingerprint-equality waiver, post-commit repair, Astra verdict.
