# M3 F3 ephemeral 00057 floor-replay transform

**Label:** historical disposable floor reconstruction — NOT production migration correction, NOT candidate runner. Do **not** claim byte-identical historical replay.

Repo `supabase/migrations/00057_profiles_rls_allow_co_members.sql` was **not** modified.

## Exact-1 pin (local)

| Item | Value |
|------|-------|
| Original SHA-256 | `85355a3808b6aa14362d0017272d5e1f3a82ed2e0179e717248a2d6b0d721cdc` |
| Transformed SHA-256 | `2a3c468537539bd45b0b285ece4e7bfe5204b898c9148345e1b88a43554dcf4d` |
| `unnest(get_user_group_ids())` count | **1** (else HOLD) |
| Replacement | that 1 only → `get_user_group_ids()` |
| One-line diff | line 45 `SELECT unnest(get_user_group_ids())` → `SELECT get_user_group_ids()` |
| Other textual change | none |
| Local 00057 alone without shim | **FAIL as expected** (`function unnest(uuid) does not exist`) |
| Local 00057 transform apply | **PASS** (then later floor HOLD at 00061) |
| Shim | **none** |

## Justification

Same historical defect as 00030 (documented in 00048): `unnest(get_user_group_ids())` while 00014 returns `SETOF uuid`. Founder forbids any function shim. Authorized ephemeral transform of **exactly 1** site in **00057 only**, in addition to the retained exact-14 00030 transform.

## Inventory

Executable `unnest(get_user_group_ids())` on the 00001–00117 floor is **only** 00030 (14) + 00057 (1). 00048 is comment-only. No additional executable site.
