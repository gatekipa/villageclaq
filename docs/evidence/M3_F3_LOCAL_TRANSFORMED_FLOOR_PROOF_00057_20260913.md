# M3 F3 local transformed floor proof (00057 auth) — 2026-09-13

**LOCAL THROUGH 00117: HOLD** at `00061_batch3_fixes.sql`

Do **not** convert to PASS. Hosted floor / db-push was **not started** because this local proof is required first and failed after the authorized 00057 transform.

## Results (Chief)

| Phase | Result |
|-------|--------|
| Deterministic executable unnest scan | **PASS** — only 00030 (14) + 00057 (1); 00048 comment-only |
| Local 00030 exact-14 transform | **PASS** — orig `366ee277…669f` → `f4223e8a…54e5` |
| Original 00057 without shim | **FAIL as expected** — `function unnest(uuid) does not exist` |
| Ephemeral 00057 transform apply | **PASS** — orig `85355a38…1cdc` → `2a3c4685…cf4d`; one-line hunk; temp deleted; repo unchanged |
| Full local floor through 00117 | **HOLD** — aborted at `00061_batch3_fixes.sql` |
| 00061 error | `cannot change name of input parameter "p_group_id"` on `is_group_admin_or_owner(uuid)` — **not an unnest site** |
| Shim | none |
| Repo 00030 / 00057 / 00118–00123 | unmodified |
| Hosted disposable | **CLEAN** — not wiped |
| Hosted floor / db-push | **NOT STARTED** |

## Why HOLD

Founder authorized ephemeral transforms of 00030 (14) and 00057 (1) only. Both applied locally without a shim. A later historical file (`00061`) cannot `CREATE OR REPLACE` `is_group_admin_or_owner(uuid)` because the existing parameter name is `p_group_id`. That is outside this authorization. No further replay exceptions. Local FAIL → stop; do not start hosted.
