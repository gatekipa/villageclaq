# Deletion authority did not expand

Approved tables already permit removal of **their own** policies, triggers, and constraints when the table is dropped. This correction only reorders existing `DROP FUNCTION` / `DROP TABLE` statements.

| Guard | Status |
|-------|--------|
| Object allowlist count | **113** unchanged (112 destructive + 1 preserve `ext.btree_gist`) |
| Dependency allowlist | **43** unchanged (31 migration-created + 12 historicalNoticeOnly) |
| History keys | **6** unchanged; exact predicates unchanged |
| `DROP POLICY` statements | **none** in generated reset SQL |
| `DROP TRIGGER` statements | **none** |
| `CASCADE` | **absent**; RESTRICT only |
| Policies on retained / out-of-scope tables | **not deleted**; leftover `leftover_hgp` survived the blocked path |
| RLS weakened | **no** |
| Wipe | still `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH` |
| Table FK dropOrder sequence | still strictly increasing 700–1210 |
| Unsupported dependent | still `F13_UNEXPECTED_OBJECT_OR_DEPENDENCY`; durable leftover verified on a subsequent connection |

Emitter (`scripts/lib/f3-db-push-qualification-reset.mjs`) was not modified. It already sorts by `dropOrder` and emits `RESTRICT`.
