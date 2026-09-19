# F19 QA local PG / concurrency

F18 actual-reset-backend concurrency proof **PASSED** and remains **INHERITED**.

This QA VM has no `psql` binary. Helper classification: `MUST_LOCAL`.

PG concurrency was **not** re-run. Focused F19 process-record / thrown cases do not change lock-order SQL or T3 contract.

Wipe remains `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`.
