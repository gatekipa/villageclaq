# S0 Cut 2 Disposable No-Send Rehearsal — 2026-09-11

**Method:** local PostgreSQL 16 cluster (`16 main`), empty structural database `s0p0b_cut2_disposable`.  
**Fixture:** `scripts/_cut2_disposable_fixture.sql` (not a migration).  
**Apply:** exact file `supabase/migrations/00115_s0_p0b_cut2_notification_queue.sql` via `psql -v ON_ERROR_STOP=1`. Not the full backlog runner.  
**Production:** never contacted. Project `llbnliixczcqfftxpsmb` not migrated.  
**Provider keys:** unset. Drain provider suppressed. Synthetic UUIDs and `+237…` / `@example.test` only.

## Apply

- Precondition fingerprints matched the disposable live-shaped catalog (17 old WA `indexdef`s, INSERT policy, staff UPDATE policy, INSERT grants, Cut 1 `schema_migrations.version=20260911183755`, no `group_id`, status vocab `queued|sent|failed`).
- Transaction **COMMIT**.
- NOTICE: `legacy_quarantine_count=0`.

## 17/17 WA collision

For each frozen matrix row:

1. Seed synthetic domain row + prefs-on profile + African test phone.
2. Insert NULL-provenance poison fixture occupying the old WA key.
3. First trusted RPC → `inserted`, `cut2_provenance_version=1`, new UUID.
4. Second trusted RPC → `duplicate`, same trusted UUID.
5. Legacy poison row MD5 unchanged.
6. Legacy id never returned.

Result: **17/17 PASS**. See `S0_CUT2_17_WA_COLLISION_RESULTS_20260911.json`. **ZERO sends.**

## Provenance / grants (disposable)

| Check | Result |
|-------|--------|
| Existing rows NULL (no DEFAULT) | PASS |
| RPC hardcodes provenance=1 | PASS |
| anon/authenticated/service_role table INSERT | DENY |
| anon/authenticated EXECUTE enqueue | DENY |
| service_role EXECUTE | ALLOW |
| service_role UPDATE provenance/channel/template/user_id/created_at/id | DENY |
| service_role UPDATE status | ALLOW |
| `loan_overdue` + SMS | denied |
| `proxy_claim` + email | denied |
| `push` | denied |
| Immutability trigger present | PASS |

## App / CI

- `node --test scripts/test-s0-cut2-*.mjs` → **15/15 PASS**
- `npm run build` → **PASS** (TypeScript + Next compile)
- Existing `test-*-producer.mjs` suites still assert historic queue-insert payloads; adapter mock covers enqueue but not every payload field. **Frozen Cut 2 CI is the release gate**, not those historic payload inspections.

## Browser

Not exercised (no production/preview deploy authorized; no real members). Closest substitute: disposable SQL rehearsals + static CI + `npm run build`.
