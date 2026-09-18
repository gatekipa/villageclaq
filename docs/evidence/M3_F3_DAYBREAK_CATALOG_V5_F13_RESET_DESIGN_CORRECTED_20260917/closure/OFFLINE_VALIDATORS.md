# Offline validators added in Phase 1

Not wired to live mutation.

| Path | Role |
|------|------|
| `scripts/lib/f3-db-push-qualification-reset-design.mjs` | Allowlist, history, auth-binding, transaction, live-contact refusal |
| `scripts/test-f3-qualification-reset-design.mjs` | `node --test` harness |
| `package.json` script `test:f3-reset-design` | Dedicated npm entry |

Wipe rejection is imported from `scripts/qualify-f3-db-push-disposable.mjs` in tests only to prove the existing guard is unchanged.
