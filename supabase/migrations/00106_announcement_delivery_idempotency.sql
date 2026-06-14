-- 00106: Announcement per-recipient delivery idempotency (Build 7)
-- ===========================================================================
-- CREATED, NOT APPLIED. Additive only, fully re-runnable (IF NOT EXISTS).
-- FLAG-ONLY for Build 7: this migration is the documented PATH FORWARD for
-- honest per-recipient announcement delivery tracking. It is NOT wired by the
-- Build 7 honesty slice — the composer/history honesty derives entirely from
-- the existing `announcements.sent_at` + `channels` columns and never claims
-- delivery it cannot prove. Apply this ONLY together with the announcement
-- producerization change (see WHY below), never on its own as part of a UI PR.
--
-- WHY
-- ---
-- `announcement_deliveries` already exists (00008, RLS-hardened in 00048) with
-- (announcement_id, membership_id, channel, status, sent_at, delivered_at,
-- read_at, error_message, created_at) — but it is NEVER WRITTEN TO today, and
-- it has NO uniqueness constraint. Both announcement dispatch paths (the manual
-- composer send and the every-5-min `send-scheduled-announcements` cron) are
-- fire-and-forget with ROW-LEVEL-only idempotency: a mid-loop crash re-sends
-- email/SMS/WhatsApp to recipients already processed on the next tick. To make
-- "delivered"/"failed"/"partially failed" statuses HONEST (rather than the
-- Build-7 derived "published"/"published + sent (best-effort)"), a future
-- producerized path must write one row per (announcement, recipient, channel)
-- and check it before sending. This migration adds the constraint + bookkeeping
-- column that path needs.
--
-- CHANGES (additive, non-breaking)
-- --------------------------------
-- 1. UNIQUE index on (announcement_id, membership_id, channel) — backs an
--    idempotent upsert per recipient+channel so a retry/crash cannot double-send.
--    The table is empty today, so there are no existing rows to violate it.
-- 2. `updated_at` column + the standard update_updated_at() trigger (parity with
--    every other table) so honest state transitions (pending -> sent -> delivered
--    -> failed) carry a last-changed timestamp.
-- 3. A composite index (announcement_id, channel, status) for the per-announcement
--    delivery rollup the honest history UI will read once the writer exists.
--
-- RELEASE SEQUENCING (BINDING)
-- ---------------------------
-- Apply this migration ONLY in the same change that:
--   (a) wires the per-recipient dispatch log writer (manual + cron paths), AND
--   (b) removes `send-scheduled-announcements` from the audit's direct-dispatch
--       allowlist (scripts/audit-whatsapp.mjs) — the audit enforces
--       "allowlisted direct-dispatch OR producer-backed with per-recipient
--       idempotency, never neither". Applying this alone, without the writer,
--       changes nothing and is harmless; shipping the writer WITHOUT this
--       constraint would allow duplicate delivery rows. They belong together.
-- Does NOT remap any WhatsApp template, change any Meta/WABA config, or alter
-- payment/receipt behavior.
--
-- PREFLIGHT (read-only):
--   SELECT indexname FROM pg_indexes
--     WHERE indexname IN ('uq_announcement_deliveries_recipient_channel',
--                         'idx_announcement_deliveries_ann_channel_status'); -- expect 0 rows
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='announcement_deliveries' AND column_name='updated_at'; -- expect 0 rows
--
-- VERIFICATION (after apply): the two indexes exist + updated_at column present.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS uq_announcement_deliveries_recipient_channel,
--     idx_announcement_deliveries_ann_channel_status;
--   ALTER TABLE public.announcement_deliveries DROP COLUMN IF EXISTS updated_at;
--   DROP TRIGGER IF EXISTS set_announcement_deliveries_updated_at ON public.announcement_deliveries;
-- ===========================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_announcement_deliveries_recipient_channel
  ON public.announcement_deliveries (announcement_id, membership_id, channel);

CREATE INDEX IF NOT EXISTS idx_announcement_deliveries_ann_channel_status
  ON public.announcement_deliveries (announcement_id, channel, status);

ALTER TABLE public.announcement_deliveries
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS set_announcement_deliveries_updated_at ON public.announcement_deliveries;
CREATE TRIGGER set_announcement_deliveries_updated_at
  BEFORE UPDATE ON public.announcement_deliveries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
