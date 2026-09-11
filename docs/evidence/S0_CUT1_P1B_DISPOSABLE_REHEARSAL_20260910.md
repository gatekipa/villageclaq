# P1-B disposable rehearsal summary (sanitized)

**Overall:** `HOLD`  
**Paid restore required:** no  
**Implementation SHA:** `027e362994598655c4914016d65b9bbdbe91163c`  
**Migration blob:** `2711e498a4860e607d73a1e4a70cbcfbdadd6f9f`

## Method
Schema-only reconstruction from production catalog (`execute_sql` READ-ONLY on `llbnliixczcqfftxpsmb`): 375 policies, enums, columns/indexes for 88 RLS tables, exact helper bodies. Local PostgreSQL 17 disposable DB with `anon`/`authenticated`/`service_role` and auth stubs. **No** paid restore, **no** prod apply, **no** customer rows.

## Results
| Gate | Result |
|------|--------|
| Pre-migration parity | **PASS** (375/145/mismatch0/fingerprints/23 rewrite names) |
| Apply 00114 only | **PASS** |
| P1-A search_path="" | **PASS** (8/8) |
| Visibility helpers unchanged | **PASS** |
| Actor matrix | **PASS** |
| RLS collision (inactive WRITE via permissive OR) | **HOLD** — 3 bypasses, 0 unknown |
| PostgREST | CANNOT REPRODUCE LOCALLY |

## Collision bypasses
1. `feed_reactions` DELETE — `rls_fr_delete` own-membership, no active gate (OR vs neutralized `Members react`)
2. `feed_reactions` UPDATE — `rls_fr_update` same
3. `hosting_swap_requests` INSERT — `Members can create swap requests` (`requested_by = auth.uid()`) OR vs rewritten `rls_hsr_insert`

## Recommendation
Do **not** treat P1-B as full PASS until the three OR-bypasses are remediated or explicitly carved out in contract. Schema-only disposable was sufficient; **paid isolated restore not required** for this rehearsal class.
