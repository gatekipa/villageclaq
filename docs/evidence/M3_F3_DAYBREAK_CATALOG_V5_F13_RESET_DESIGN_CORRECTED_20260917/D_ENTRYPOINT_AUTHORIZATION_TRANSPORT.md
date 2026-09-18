# Finding D — entrypoint, authorization, transport

**Closed in design. Mutation entrypoint remains closed.**

## Phase 1 (this package) — the only implemented interface

| Item | Contract |
|------|----------|
| Files | `scripts/lib/f3-db-push-qualification-reset-design.mjs`, `scripts/test-f3-qualification-reset-design.mjs` |
| Entrypoint | `npm run test:f3-reset-design` or `node --test scripts/test-f3-qualification-reset-design.mjs` |
| Flags | none that apply SQL. `--wipe-to-baseline` if parsed via qualify helpers still throws `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH` |
| Arg validation | `rejectLiveContact` refuses URLs, password env names, `execute`/`apply`/`connect` |
| Planner output | `planQualificationResetDesign` JSON: `executed=false`, `mutationEntrypointOpen=false` |
| Transport | none |
| Authorization | required fields validated offline; no signing service |
| Failure | `ok=false` + stable `code`; no retry; no hosted call |

## Proposed Phase 2 interface (not wired)

One concrete command after independent QA accept **and** a founder authorization artifact:

```text
node scripts/qualify-f3-db-push-disposable.mjs \
  --no-wipe \
  --qualification-reset \
  --founder-authorization-artifact=<repo-relative-path>
```

Supported qualify args that remain: `--no-wipe --prep-floor --sequence-f3` for the **subsequent** single qualify, after a successful reset. They do not authorize reset.

Forbidden: `--wipe-to-baseline`, Management API apply, transaction pooler `:6543`, production ref `llbnliixczcqfftxpsmb`.

### Founder authorization artifact fields

| Field | Binds |
|-------|-------|
| `targetRef` | `jkorwnwwmdeflfntxntl` only |
| `functionalCandidateSha` | the authorized functional tip |
| `closureDigest` | recursive runtime closure of that tip |
| `scopeSqlIdentitySha256` | digest of finite allowlist + history keys (`scopeSqlIdentityDigest()`) |
| `executionBudget` | `{ constrainedResets: 1, completeQualsFrom00118: 1, secondReset: false }` |

`--qualification-reset` without a satisfied artifact is `F13_FLAG_NOT_AUTHORIZATION`.

No new signing service, cloud, or general-purpose reset framework.

### Transport

Gated `psql -X -v ON_ERROR_STOP=1 -f` of SQL generated from the allowlist, inside the T0–T7 transaction. Planner writes the plan JSON first; apply is a separate authorized step in Phase 2. Phase 1 has no apply function.

### Failure

Whole operation aborts. No skip. No second reset. Uncertain commit follows Finding B.
