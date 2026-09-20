# F23 fingerprint difference table

Compare function: `fingerprintCompleteAndExact` → `canonicalFingerprintEqual` after `canonicalizeFingerprintForCompare`.  
Reason recorded by F23: `fingerprint expected and observed are not canonically equal`.  
Failed file is **not retained** (qualify stops QUALIFICATION PASS on first inequality; sequence length was 6, so compare ran per file, but per-file reasons were not persisted).

Authoritative expectation for every row: sealed hosted-oracle fingerprint for that migration file (`FROZEN_EXPECTED_FINGERPRINTS` / `FROZEN_EXPECTED_FINGERPRINT_SHA256`). Local ubuntu/fixture roles are not hosted identity proof.

| migration/object | field | expected value | observed value | authoritative expectation | security significance |
|------------------|-------|----------------|----------------|---------------------------|------------------------|
| 00118–00123 (file not isolated in retained artifacts) | canonical fingerprint equality | `canonicalFingerprintEqual(expected, observed) === true` | `false` (`F23_FINGERPRINT_MISMATCH`) | Sealed hosted-oracle fingerprint for the applied file | Required-acceptance: QUALIFICATION PASS withheld. May hide owner, GRANT/REVOKE, RLS, or object-shape drift. |
| 00118–00123 | `schema` / `schemas` | hosted-oracle schema↔owner records (not re-copied here) | **NOT RETAINED** | Frozen expected `schema` / `schemas` | Owner of schemas is a privilege boundary. |
| 00118–00123 | `owner` | hosted-oracle owner records if present on either side | **NOT RETAINED** | Frozen expected `owner` when the key is present | Object ownership. |
| 00118–00123 | `function_owner` | hosted-oracle function↔owner / security_definer / search_path | **NOT RETAINED** | Frozen expected `function_owner` | SECURITY DEFINER + owner is an execution-privilege boundary. |
| 00118–00123 | `acl` / `acls` | hosted-oracle privilege tuples (grantee/grantor/privilege/grantable) | **NOT RETAINED** | Frozen expected `acl` / `acls` | GRANT/REVOKE surface. |
| 00118–00123 | `policy` / `policies` | hosted-oracle RLS policy records | **NOT RETAINED** | Frozen expected `policy` / `policies` | Row-level access. |
| 00118–00123 | `relations` | hosted-oracle relation records | **NOT RETAINED** | Frozen expected `relations` | Missing/extra relations are data-integrity failures. |
| 00118–00123 | `columns` | hosted-oracle column records (incl. attacl) | **NOT RETAINED** | Frozen expected `columns` | Column ACL and type drift. |
| 00118–00123 | `types` | hosted-oracle type records | **NOT RETAINED** | Frozen expected `types` | Type-identity / enum completeness. |
| 00118–00123 | `views` | hosted-oracle view records | **NOT RETAINED** | Frozen expected `views` | View definition / security_barrier. |
| 00118–00123 | `routines` | hosted-oracle routine records | **NOT RETAINED** | Frozen expected `routines` | Routine identity and body. |
| 00118–00123 | `rls` | hosted-oracle RLS enablement | **NOT RETAINED** | Frozen expected `rls` | RLS on/off is an access-control failure. |
| 00118–00123 | `constraints` | hosted-oracle constraint records | **NOT RETAINED** | Frozen expected `constraints` | Integrity constraints. |
| 00118–00123 | `indexes` | hosted-oracle index records | **NOT RETAINED** | Frozen expected `indexes` | Uniqueness / lookup integrity. |
| 00118–00123 | `triggers` | hosted-oracle trigger records | **NOT RETAINED** | Frozen expected `triggers` | Trigger timing/level/function. |
| 00118–00123 | `hgp` / `hgp_pin` / `enqueue` | hosted-oracle pin records | **NOT RETAINED** | Frozen expected keys | Permission and queue pins. |
| 00118–00123 | `f3_objects_absent` | `false` after successful apply | **NOT RETAINED** (normal path recorded `objectsPresent: true`) | Must be false after target apply | Absence after apply is an install failure. |
| 00118–00123 | `function_definition` / `search_path` / `object_identity` | hosted-oracle optional catalog keys if present | **NOT RETAINED** | Frozen expected when the key is present on either side | Definition / search_path / identity drift. |
| 00118–00123 history (not a fingerprint field; retained) | `schema_migrations` version/name | six exact identities `20260913173000`–`005` | six exact identities present | Frozen `PREASSIGNED_VERSIONS` / `PREASSIGNED_NAMES` | History matched. This is **not** fingerprint equality. |

No additional observed field values were recovered from F23 local-pg-proof, prove-helper.out, or prior fingerprint-mismatch packages.

Required keys that must exist on both sides (from `FINGERPRINT_REQUIRED_KEYS`): `schema_version`, `schema`, `schemas`, `function_owner`, `acl`, `acls`, `policy`, `policies`, `relations`, `columns`, `types`, `views`, `routines`, `rls`, `constraints`, `indexes`, `triggers`, `hgp`, `enqueue`, `f3_objects_absent`. Optional catalog keys, if present on either side: `owner`, `function_definition`, `search_path`, `hgp_pin`, `object_identity`.

The F23 compare reached `canonicalFingerprintEqual` (it did not fail earlier on missing keys, ACL-contract, or canonicalization reject). Therefore at least one canonical catalog field differed. Which field(s) is **not retained**.
