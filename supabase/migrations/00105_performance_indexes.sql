-- 00105: Performance indexes (Build 5)
-- ===========================================================================
-- CREATED, NOT APPLIED. Pure additive indexes — no schema/data change, fully
-- re-runnable (IF NOT EXISTS). Apply after the Build 5 deploy is READY, as a
-- single-file manual execution — do NOT run a broad migration runner.
--
-- WHY: the Build-5 performance audit (live EXPLAIN on project llbnliixczcqfftxpsmb)
-- found several hot query paths backed only by single-column or cross-tenant
-- indexes. At today's data volume (≈122 payments / 649 obligations / 24 groups)
-- these are seq-scans/sorts that cost microseconds, so this migration is
-- FORWARD-LOOKING: it keeps the hottest routes index-only as groups scale to
-- thousands of members × billing periods. The application is already correct and
-- adequately fast without it; nothing in the app depends on these indexes.
--
-- INDEXES ADDED
-- -------------
-- 1. payments(group_id, contribution_type_id) WHERE relief_plan_id IS NULL
--    Build-4 per-type collection (per-object report + finances Collection-by-Type
--    + confirmedPaidByType). payments.contribution_type_id was UNINDEXED; the
--    partial predicate matches the queries' `.is('relief_plan_id', null)`.
-- 2. payments(group_id, recorded_at DESC)
--    Dashboard "recent payments" (usePayments(5)) + history ordering. Replaces a
--    backward scan of the GLOBAL idx_payments_recorded_at that filters out other
--    tenants' rows.
-- 3. payments(membership_id, contribution_type_id, recorded_at)
--    checkDuplicatePayment (runs on every payment insert: member+type+day-range)
--    and per-member/per-type money drill-downs. Replaces a 5-predicate in-memory
--    filter over the group_status index.
-- 4. payments(obligation_id, status)
--    The 00104 recompute path (recalc_obligation_amount_paid sums confirmed
--    payments WHERE obligation_id = ? AND status NOT IN (...)) fired by the
--    on_payment_changed trigger on every payment write.
-- 5. contribution_obligations(group_id, status, due_date)
--    Group-scoped money rollup + derived-overdue (group complement to the
--    existing member-leading (membership_id, status, due_date) index).
-- 6. notifications_queue(status, created_at) WHERE status = 'queued'
--    The drain cron orders queued rows by created_at; the partial index removes
--    the Sort node and is tiny (only un-drained rows).
-- 7. group_audit_logs(entity_id, created_at DESC)
--    Member-detail standing/financial history filters by entity_id then orders
--    by created_at.
-- 8. memberships(is_proxy) WHERE is_proxy = true
--    Proxy-member lookups (admin proxy management, claim flows). Partial index
--    is small (proxies are a minority).
--
-- EXPECTED IMPROVEMENT: each listed query moves from Seq Scan / cross-tenant
-- index scan + in-memory Filter/Sort to a direct index seek. Most material at
-- scale on payments (1,3) and the trigger path (4); negligible regression risk
-- (writes gain a few small index maintenance ops on low-write tables).
--
-- PREFLIGHT (read-only — confirm before applying):
--   SELECT indexname FROM pg_indexes WHERE indexname IN (
--     'idx_payments_group_type_active','idx_payments_group_recorded',
--     'idx_payments_member_type_recorded','idx_payments_obligation_status',
--     'idx_obligations_group_status_due','idx_notifications_queue_queued',
--     'idx_group_audit_logs_entity_created','idx_memberships_is_proxy'); -- expect 0 rows
--
-- VERIFICATION (after apply): same query → expect 8 rows. Then re-EXPLAIN a
--   representative query, e.g.:
--     EXPLAIN SELECT id,amount,status FROM payments
--       WHERE group_id = '<g>' AND contribution_type_id = '<t>' AND relief_plan_id IS NULL;
--   → expect "Index Scan using idx_payments_group_type_active".
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_payments_group_type_active, idx_payments_group_recorded,
--     idx_payments_member_type_recorded, idx_payments_obligation_status,
--     idx_obligations_group_status_due, idx_notifications_queue_queued,
--     idx_group_audit_logs_entity_created, idx_memberships_is_proxy;
--
-- RELEASE SEQUENCING: independent of application code (purely additive). Apply
--   any time after the Build 5 deploy is READY. At today's tiny volume a plain
--   CREATE INDEX locks each table for milliseconds; at large scale, run each
--   statement with CREATE INDEX CONCURRENTLY (outside a transaction) instead.
-- ===========================================================================

CREATE INDEX IF NOT EXISTS idx_payments_group_type_active
  ON public.payments (group_id, contribution_type_id)
  WHERE relief_plan_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_payments_group_recorded
  ON public.payments (group_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_member_type_recorded
  ON public.payments (membership_id, contribution_type_id, recorded_at);

CREATE INDEX IF NOT EXISTS idx_payments_obligation_status
  ON public.payments (obligation_id, status);

CREATE INDEX IF NOT EXISTS idx_obligations_group_status_due
  ON public.contribution_obligations (group_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_notifications_queue_queued
  ON public.notifications_queue (status, created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_group_audit_logs_entity_created
  ON public.group_audit_logs (entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memberships_is_proxy
  ON public.memberships (is_proxy)
  WHERE is_proxy = true;
