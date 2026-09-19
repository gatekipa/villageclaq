# M3 F3 ephemeral 00030 floor-replay transform

**Label:** historical disposable floor reconstruction — NOT production migration correction, NOT candidate runner. Do **not** claim byte-identical historical replay.

Repo `supabase/migrations/00030_enterprise_branches_committees.sql` was **not** modified.

## Exact-14 pin (local)

| Item | Value |
|------|-------|
| Original SHA-256 | `366ee277f8d659d4194340ebbcb93f4191e0ee64820d391999938596474f669f` |
| Transformed SHA-256 | `f4223e8a33f6b9dc367057ca638ae52d795b01a6796325f760db6f63849854e5` |
| `unnest(get_user_group_ids())` count | **14** (else HOLD) |
| Replacement | those 14 only → `get_user_group_ids()` |
| Other textual change | none |
| Local 00030 alone without shim | **PASS** |
| Shim | **none** |

## Justification

`00048` documents the historical defect: 00030 uses `unnest(get_user_group_ids())` instead of `IN (SELECT get_user_group_ids())`. `00014` returns `SETOF uuid`, so `unnest(setof)` is invalid without a `unnest(uuid)` overload. Founder forbids any function shim.

## Scope

Authorized for **00030 only**. `00057_profiles_rls_allow_co_members.sql` still has **one** executable `unnest(get_user_group_ids())`. That site is **outside** this authorization. No further replay exceptions without new founder auth.
