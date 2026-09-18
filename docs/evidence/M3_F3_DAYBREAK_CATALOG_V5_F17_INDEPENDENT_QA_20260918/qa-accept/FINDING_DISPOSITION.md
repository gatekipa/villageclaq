# F17 finding disposition (independent QA)

Every material finding below was reproduced or independently re-proven. Draft #114 claims were treated as hypotheses.

| ID | Material finding | Reproduced? | Closed? | Disposition |
| --- | --- | --- | --- | --- |
| A | `storage_buckets:["unexpected_secret_bucket"]` falsely CLEAN_BASELINE | Yes — F16 `dirtyBlocksCleanBaseline: false` on `b74c685`; F17 classifier/eligibility HOLD on `83b9f794` | Yes | CLOSED. Unexpected, unexpected+named, missing, and malformed buckets HOLD. Named residuals and empty still CLEAN_BASELINE. Auth / unnest / unexpected policy HOLDs preserved. Spies: capture 1, transport/apply/SQL 0. No wipe, no auto-allowlist. |
| B | SERIALIZABLE snapshot-before-lock misses wait-window drift | Yes — SQL now READ COMMITTED; T2 relation locks before T3 | Yes | CLOSED by **this QA's** `LOCAL_PG_EXECUTED` helper, not by builder RAW alone. Unapproved FK and retargeted FK: `pg_locks` waiter + `wait_event_type=Lock` / `wait_event=relation`, then holder-committed drift, T3 reject, `mutationPhaseReached=false`, drift retained, `rolledBack=null`. Approved set still T7 CLEAN_BASELINE. |
| C | F16 RAW path leaks; sanitizer dropped failure metadata / original hashes | Yes — F16 `TX_SUCCESS_RAW` still has `/tmp/...`; pack-summary claimed pathLeaks 0 | Yes | CLOSED. F16 package documented, not rewritten. F17 package scan pathLeaks 0. Original vs packaged hashes present. Failure/timeout reparse cannot become success. |
| D | destAbs forward-slash assertion | Yes — portable helper now used | Yes locally | CLOSED on Linux + string fixtures. Native Windows **not** executed; not claimed. |
| C4-R01–R04 | framing / EACCES / reorder | Suite PASS | Yes | PRESERVED |
| Wipe pin | `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH` | Suite + helper + direct eval | Yes | PRESERVED |
| Migrations | 00001–00117 / 00118–00123 bytes | `git diff` start→functional empty under `supabase/migrations` | Yes | PRESERVED |
| Allowlist | eight scripts + F17 evidence | start→functional = 8 scripts; functional→evidence = docs only | Yes | PRESERVED |

No additional P0/P1 HOLD opened.
