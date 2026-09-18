# Transaction contract (design)

Executable encoding: `TRANSACTION_PHASES` and `UNCERTAIN_COMMIT_POLICY` in `scripts/lib/f3-db-push-qualification-reset-design.mjs`.

Cooperation assumption that is **rejected**: “an advisory lock is enough because other sessions will take the same lock.” Hostile or unaware sessions will not. SERIALIZABLE + relation locks + post-lock revalidation are required.

Timeouts (Phase 2 emitter must set, values to pin at implement time):

- `lock_timeout`
- `statement_timeout`
- `idle_in_transaction_session_timeout`

Any timeout is a rollback trigger, not a retry.

Affected-row rule: if the pre-validated permitted history set has N matching rows, T5 must authenticate exactly those N identities. If T3 said a key was absent, T5 must see 0 for that key — and must not have committed drops in a different transaction.
