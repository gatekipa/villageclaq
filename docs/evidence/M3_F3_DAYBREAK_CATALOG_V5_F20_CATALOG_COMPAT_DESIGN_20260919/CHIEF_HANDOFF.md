# Chief handoff — F20b catalog-compatibility foundation design (corrected)

**Overall status:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN

**Design verdict:** `DESIGN_HOLD`

**Hold code:** `F20_EXTENSION_MEMBERSHIP_SERIALIZATION_UNSUPPORTED`

**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

This package is **design-only**. No executable behavior change. No hosted/disposable contact. No Daybreak/Astra contact.

## Package / head identities

| Role | SHA / path |
|------|------------|
| Start proposal (HOLDed Part A wording) | `7e3b90abeea2f957a1ac332ba727cec4abbbfc67` |
| Hosted HOLD ancestor | `35b5be82acf01d11dd9f6578e8da7f384d8f925d` |
| Accepted F19 functional | `dfbeb11b49f7e9b061a4c700e0335d125ac669e2` |
| Evidence before hosted | `20b4b340b49bccfc96f23333c731bac54056ea9c` |
| This design root | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F20_CATALOG_COMPAT_DESIGN_20260919/` |
| PRs | #84 / #85 / #86 OPEN DRAFT UNMERGED, head-identical, DAYBREAK HOLD titles |

## What this correction changes vs 7e3b90ab

The F19 proposal classified confirmed `btree_gist` members as `EXTENSION_SCOPED_DEPENDENT` “preserved with the allowlisted extension’s DROP EXTENSION RESTRICT path.” That wording is **withdrawn**.

Correct semantics (F20-R1): `DROP EXTENSION btree_gist RESTRICT` **removes** authenticated extension members (`pg_depend.deptype = 'e'`). Classification is `EXTENSION_REMOVAL_SCOPED`. Individual `DROP FUNCTION` allowlist rows for `gbt_*` / `*_dist` are **not** authorized. Caller-supplied `extensionMemberOf` labels and name/prefix matches **cannot** establish membership.

Part B (F20-R6) remains the accepted six `historicalNoticeOnly` FK tuples. Intended allowlist size becomes **43 = 31 migration-created + 12 historical**. No new table-deletion authority. No CASCADE.

## Exact HOLD gap (do not paper over)

F20-R5 requires a lock that:

1. serializes competing sessions against **extension membership changes**;
2. takes effect **before** fresh membership comparison (T3);
3. remains effective **through** `DROP EXTENSION`;
4. is **not** satisfied by existing table/history locks alone;
5. works under ordinary privileges — no superuser assumptions beyond the existing local proof helper (`ubuntu` as `f3_*` DB owner; `SELECT` on catalogs; `pg_advisory_xact_lock`; `LOCK TABLE` on user relations only).

Evaluated candidates and why none is a supported path:

| Candidate | Privilege under helper contract | Serializes non-cooperative `ALTER EXTENSION ADD/DROP`? | Verdict |
|-----------|--------------------------------|------------------------------------------------------|---------|
| `SELECT … FROM pg_extension WHERE extname=$1 FOR UPDATE` | PostgreSQL 17 requires `UPDATE` on at least one column. `pg_extension` is a catalog; helper never holds catalog `UPDATE`. | Even with `UPDATE`: heap tuple lock does not conflict with `LockDatabaseObject` used by `ALTER EXTENSION ADD` (inserts `pg_depend`, typically does not update the `pg_extension` row). | Unsupported |
| Transaction-scoped advisory lock keyed by authenticated extension OID | Works (`pg_advisory_xact_lock` is PUBLIC). | No. Hostile / dashboard / other-admin sessions ignore it. Existing contract already rejects `advisoryLockOnly`. | Weaker substitute — **not proposed** |
| `LOCK TABLE pg_depend` / `pg_extension` | Catalog owner / superuser. Helper does not use this. | Would block membership inserts if privilege existed. | Outside privilege/scope |
| Existing ACCESS EXCLUSIVE + SHARE ROW EXCLUSIVE + T3 | Already implemented. | Does not lock extension membership. Founder: not sufficient. | Insufficient |

**No supported mechanism works within existing privileges/scope.** This package does **not** invent a weaker substitute.

## Smallest founder decision

Choose exactly one:

1. **Authorize a catalog-privilege exception** (superuser, or `GRANT UPDATE`/`LOCK` on `pg_depend`/`pg_extension`) and name `LOCK TABLE pg_depend IN SHARE ROW EXCLUSIVE MODE` (or stronger) in the reset TX **before T3**, held through `DROP EXTENSION`. Then Part A may proceed to a later implementation ticket.
2. **Defer Part A** until PostgreSQL exposes a privilege-safe extension object lock, or until founder writes a residual-race acceptance (not proposed here).
3. **Reject Part A.** Keep current fail-closed `F13_UNEXPECTED_OBJECT_OR_DEPENDENCY` on non-allowlisted function identities. Part B may still be authorized separately.

Part B design is complete and does not depend on F20-R5. It is **not** authorized to implement by this package.

## What QA should do

Independent Grok QA: ACCEPT or HOLD each F20-R* against `CORRECTED_DESIGN.md` + `DESIGN_REQUIREMENTS_TRACE.json`.

- If F20-R5 remains unsatisfied, overall verdict stays `DESIGN_HOLD` even if R1–R4 / R6–R9 are accepted as wording.
- Do not treat this package as hosted requal PASS.
- Do not implement. Do not contact Daybreak/Astra.

## Not authorized

Merge, functional/script changes, hosted/disposable contact, wipe, CASCADE, F3-06, Management API apply, production contact, Daybreak/Astra contact, or treating `EXTENSION_REMOVAL_SCOPED` as “preserve members.”
