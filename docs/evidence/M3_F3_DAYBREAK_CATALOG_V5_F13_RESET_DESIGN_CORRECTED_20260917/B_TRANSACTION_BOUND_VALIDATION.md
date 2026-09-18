# Finding B — transaction-bound validation

**Closed in design. Not implemented as a live mutation.**

## Complete transaction

| Phase | Name | Mutation? | Must hold or the TX cannot succeed |
|-------|------|-----------|-------------------------------------|
| T0 | identity and state assertions | no | candidate SHA, disposable pins, founder binding, production refuse |
| T1 | begin serializable | no | `BEGIN ISOLATION LEVEL SERIALIZABLE`; lock/statement/idle timeouts |
| T2 | locking | no | `LOCK` history + allowlisted relations; advisory xact lock helper only |
| T3 | revalidate before mutation | no | objects, dependents, history keys after locks |
| T4 | mutation order | yes | `dropOrder` + `RESTRICT`; exact history `DELETE` |
| T5 | affected-row checks | no | identities + counts; mismatch aborts all |
| T6 | final assertions | no | allowlisted identities gone; permitted history gone |
| T7 | commit or uncertain | no | `COMMIT` only after T6 |

## Concurrent-change prevention

Not advisory-lock-only. Required together:

1. `SERIALIZABLE` (write-skew / concurrent DDL visibility)
2. `ACCESS EXCLUSIVE` on each allowlisted relation that will be dropped or deleted-from
3. `SHARE ROW EXCLUSIVE` (or stronger) on `supabase_migrations.schema_migrations`
4. Re-read after locks (T3). A change that arrived before the lock is visible; a change that does not match the bound set blocks
5. Treat a non-cooperating session as able to ignore advisory locks

## Rollback triggers (no successful reset)

- unexpected object
- unexpected dependency
- history key mismatch or extra/missing permitted row
- affected-row / identity mismatch
- any SQL error
- failed T6 postcondition
- production-ref or wipe-flag appearance
- serialization failure / deadlock / timeout (ROLLBACK; no retry loop; no second reset)

## Uncertain commit

If the session dies during `COMMIT`, the client cannot honestly claim applied or rolled back.

- Label: `UNCERTAIN_COMMIT`
- Automatic replay: **forbidden**
- Unverifiable rollback claim: **forbidden**
- Next step: stop. Later independent live inventory under a **new** founder authorization artifact
