# Finding C — exact history matching

**Closed in design. Not implemented as a live mutation.**

## Authenticated keys

Taken from F12 tip pins `PREASSIGNED_VERSIONS` and `PREASSIGNED_NAMES` at `1ec0e4da782ed7715a543be23f79bc0f10a28af2`. Filename / source-label timestamps are not history keys.

See `history/PREASSIGNED_HISTORY_KEYS.json`.

## Rejected predicates

- `WHERE version = '…'` only (historical SQL `0d3de029…`)
- `AND (name = '…' OR name IS NULL OR name = '')` (reviewed F12 SQL `1b8cc9c2…`)

Those are source-label substitutions. They are not current procedure.

## Null / empty names

Rejected unless authenticated provenance exists **in this finite scope**. The recorded set of such provenance entries is empty (`NULL_OR_EMPTY_NAME_PROVENANCE.authenticated = false`). Therefore null/empty names abort the whole operation.

## Mismatch behavior

A single mismatched name aborts the **whole transaction**. Object drops and history deletes commit together or not at all. Skipping a `DELETE` while drops commit is forbidden.

## Before / after

- **Before mutation (T3):** the live permitted set must be exactly the authenticated keys that the identity probe found, each with matching name. Extra versions block.
- **After mutation (T5):** deleted identities and counts must equal that pre-validated set (absent-and-expected-absent counts as 0, not as skip-after-partial-destroy).

## Live state

F8/F9 six-row deletion is historical evidence only. It does **not** establish the current disposable state. A later fail-closed live check is required. **No live contact in this phase.**
