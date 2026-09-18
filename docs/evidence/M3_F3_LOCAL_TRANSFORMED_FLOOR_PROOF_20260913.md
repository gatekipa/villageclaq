# M3 F3 local transformed floor proof — 2026-09-13

**LOCAL THROUGH 00117: HOLD**

Do **not** convert to PASS. Hosted floor / db-push was **not started** because this local proof is required first and failed.

## Results (Chief)

| Phase | Result |
|-------|--------|
| Local 00030 exact-14 transform | **PASS** — orig `366ee277…669f` → `f4223e8a…54e5`; count 14; 00030 alone without shim |
| Full local floor through 00117 | **HOLD** — aborted at `00057_profiles_rls_allow_co_members.sql` |
| 00057 executable `unnest(get_user_group_ids())` | count **1**, outside authorized 00030 transform |
| Shim | none |
| Repo 00030 / 00118–00123 | unmodified |
| Hosted floor / db-push | **NOT STARTED** |

## Why HOLD

Founder authorized ephemeral transform of **exactly 14** `unnest(get_user_group_ids())` sites in **00030 only**. A later floor file still contains the same historical defect. Applying it without a shim (forbidden) or a new authorized transform would create another mid-file partial. No further replay exceptions without new founder auth.
