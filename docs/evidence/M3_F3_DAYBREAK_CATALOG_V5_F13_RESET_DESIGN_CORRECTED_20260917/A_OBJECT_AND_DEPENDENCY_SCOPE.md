# Finding A — object and dependency scope

**Closed in design. Not implemented as a live mutation.**

## Rejected F12/historical actions

- `DROP SCHEMA IF EXISTS financial_core CASCADE`
- `DROP SCHEMA IF EXISTS financial_private CASCADE`
- `DROP TABLE/FUNCTION/TYPE/EXTENSION/SEQUENCE … CASCADE`
- Treating `financial_*` / `financial_object` as a drop selector

## Replacement

Exact identities live in `FINITE_OBJECT_ALLOWLIST` (design module) and `object-allowlist/FINITE_OBJECT_ALLOWLIST.json`.

Categories:

- Public F3 RPCs with full identity arguments (00120–00123)
- Public leftover floor functions cited by historical SQL object identity (not as approved SQL)
- `financial_core` / `financial_private` functions and tables from 00118–00123 at F12 tip
- Public F3 tables (`financial_accounts` … `financial_ledger_epochs`)
- Public leftover floor tables cited by historical SQL (37-name set)
- Canary table/sequence (absence is success)
- Public F3 enum types + `notification_channel`
- Empty-schema `RESTRICT` drops
- `btree_gist` `RESTRICT` only if unused

## Dependency handling

`FINITE_DEPENDENCY_ALLOWLIST` enumerates the F9-noticed FKs plus F3-internal FKs from 00120–00123. Handling is **drop dependents first**. No `CASCADE`.

Owned dependents (indexes, triggers, RLS policies, constraints **on the relation being dropped**) are permitted effects of `DROP TABLE … RESTRICT`. They are listed per object.

Any `pg_depend` edge whose other end is not on the finite lists **blocks**.

## Prefix rule

`financial_*` is a HOLD classifier hint in F12 `classifyInventory`. It is not permission to destroy unknown `financial_*` names. An unexpected `financial_core.something_else` blocks.
