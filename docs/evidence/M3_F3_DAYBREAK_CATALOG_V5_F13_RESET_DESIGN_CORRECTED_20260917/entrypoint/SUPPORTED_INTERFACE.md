# Supported interface

## Phase 1 (implemented, offline)

```text
npm run test:f3-reset-design
node --test scripts/test-f3-qualification-reset-design.mjs
```

Planner (no I/O):

```js
import { planQualificationResetDesign } from "../scripts/lib/f3-db-push-qualification-reset-design.mjs";
```

Refuses connection material and `execute`/`apply`/`connect`.

## Phase 2 (proposed only)

```text
node scripts/qualify-f3-db-push-disposable.mjs \
  --no-wipe \
  --qualification-reset \
  --founder-authorization-artifact=<repo-relative-path>
```

Then, only after reset postcondition:

```text
node scripts/qualify-f3-db-push-disposable.mjs --no-wipe --prep-floor --sequence-f3
```

`--wipe-to-baseline` remains rejected.
