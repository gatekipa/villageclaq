# S0 Cut 2 Implementation Summary — 2026-09-11

**Branch:** `security/s0-p0b-cut2-implementation-20260911`  
**Created from:** `5c3c1cce458cd13f9525eb21c6366f8877d3c51d` (PR #77 Daybreak PASS tip)  
**PR base:** `main` @ `1693b806beaf80d1c8101c8011874a2a2bcbb642`  
**Contract ancestor:** PR #77 tip is an ancestor. Frozen SR4 files were not edited.

## Verdict for this implementation PR

Layer B trusted-enqueue boundary implemented on a dedicated branch.  
**PRODUCTION DEPLOY NOT AUTHORIZED.**  
**00115 PRODUCTION APPLY NOT AUTHORIZED.**  
**NO REAL SENDS PERFORMED.**

## What landed

1. **Exactly one new migration:** `supabase/migrations/00115_s0_p0b_cut2_notification_queue.sql`
   - Preconditions fingerprint live queue shape, status vocab, INSERT/staff UPDATE policies, grants, all 17 old WA `indexdef`s, reviewed indexes, absent `notification_policies` / RPC / provenance column.
   - Adds `cut2_provenance_version smallint` with **no DEFAULT**; CHECK NULL OR 1; no backfill.
   - DROP+CREATE same 17 WA unique names with `AND cut2_provenance_version = 1` using frozen CREATE text (`future_exact_indexdef`). No `CONCURRENTLY`.
   - Canonical `idx_notifications_queue_cut2_semantic_idempotency_unique` as frozen (provenance=1 + non-empty idempotencyKey; no status filter).
   - `enqueue_outbound_notification(...)` exact R2 signature; SECURITY DEFINER; `search_path ''`; hardcodes provenance=1 and `status='queued'`.
   - Duplicate lookup trusted-only; failed/sent/queued → `duplicate` no mutation; mismatch → `trusted_idempotency_conflict_mismatch`.
   - Drops unsafe INSERT + staff UPDATE policies. Column-scoped service_role UPDATE only.
   - COMMIT only if postconditions pass.
   - PostgreSQL 16 stores a flattened equivalent `indexdef` of the frozen CREATE; postcondition accepts the frozen string **or** that equivalent stored form. CREATE statements remain verbatim frozen.

2. **App Layer B**
   - Semantic adapter: production missing-RPC → FAIL CLOSED / no raw INSERT.
   - All 15 live named producers call `enqueueCut2ProducerChannels`.
   - `/api/sms/send` and `/api/whatsapp/send` → 410 GONE.
   - `sms-sender.ts` is AT transport only (no queue INSERT).
   - Raw Meta gated to drain (`CUT2_RAW_META_CONTEXT=drain`).
   - Drain: pre-00115 `cut2_db_not_ready` processed=sent=failed=0; after, only `queued AND provenance=1`; TypeScript semantic render.
   - Proxy-claim: ACTIVE owner/admin same group; DB phone; enqueue `proxy_claim` only.
   - Crons no longer happy-path `sendSmsNotification` / `dispatchWhatsApp` / `sendEmail`.
   - New JWT+id routes: minutes / elections / announcements / hosting-swap.

3. **Tests:** all 15 frozen CI script names implemented and passing against disposable PG + static scans.

4. **Disposable qualification:** local PostgreSQL 16 database `s0p0b_cut2_disposable`. Exact 00115 file applied (COMMIT). 17/17 WA collisions: first `inserted` provenance=1 new UUID; second `duplicate` same trusted UUID; legacy unchanged; zero sends.

## Explicit non-actions

- PR #77 left OPEN DRAFT UNMERGED.
- PR #69 / #70 / #71 not merged.
- 00115 not applied to `llbnliixczcqfftxpsmb`.
- No production Vercel deploy. No merge to main.
- No Cut 3 / M2 / F3-06. No 00116. No edits to 00001–00114.
- `announcement-producer.ts` remains DORMANT.

## Next gate

Daybreak BLUE on exact functional SHA + 00115 SHA-256 + evidence tip.  
Do not merge, deploy, or apply 00115 to production.
