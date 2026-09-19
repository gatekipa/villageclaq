# M3 F3 03 — wipe SUCCESS / clean baseline

**WIPE: SUCCESS.** Disposable `jkorwnwwmdeflfntxntl` restored to **CLEAN baseline**.

Do **not** convert overall qualification to PASS.  
Do **not** re-floor.  
Do **not** re-wipe.  
Do **not** `--prep-floor` / `--sequence-f3`.  
Hosted floor / db-push: **NOT STARTED**.

## Pins

| Item | Value |
|------|-------|
| Disposable | `jkorwnwwmdeflfntxntl` / `villageclaq-f3-management-api-disposable-20260913` |
| Production | `llbnliixczcqfftxpsmb` — not contacted |
| Pre-wipe inventory | `M3_F3_02_PRE_WIPE_INVENTORY_20260913` (preserved) |
| Recognition | exactly `["manual_income"]` |

## Result (Chief)

Wipe compared the PARTIAL failed floor to stock Supabase + empty `schema_migrations` leftover (or pure stock), dropped only objects demonstrably from 00001–00029 + partial 00030, preserved managed schemas, and proved clean baseline.

Post-wipe:

- VillageClaq public floor objects **absent**
- Managed schemas **preserved**
- `schema_migrations` leftover empty or absent
- No `public.unnest(uuid)` shim
- No F3 / financial_* objects
- Disposable **remains CLEAN** — do not re-floor

## Forbidden without new founder auth

- Hosted `--prep-floor`
- Hosted `--sequence-f3`
- Ephemeral transform of `00057` or any other remaining `unnest(get_user_group_ids())` site
- Any other replay exception
