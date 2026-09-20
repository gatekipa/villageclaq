# Commands captured in this package

Reviewed pin: `77fd61dbf51652acabec0093d2a8549524b2dd75`

```bash
node --test scripts/test-f3-qualification-reset-design.mjs
node --test scripts/test-f3-qualification-reset.mjs
node --test scripts/test-f3-db-push-harness.mjs
node scripts/prove-f3-qualification-reset-local.mjs
```

No hosted/disposable/production URL. Admin used local maintenance `postgres` only to create task-owned `f3_*` databases.
Verification mode is recorded before database operations. Default remains `fault-injection`. F23 used `--verification-mode=normal-application` via the shared qualify entrypoint.
