-- 00107: Announcement delivery state — enum values + per-recipient columns (Build 8)
-- ===========================================================================
-- CREATED, NOT APPLIED. Additive, re-runnable (IF NOT EXISTS / ADD VALUE IF NOT
-- EXISTS). Builds ON TOP OF 00106 (which is also create-not-applied). Together
-- they make per-recipient announcement delivery tracking possible. Neither is
-- applied by Build 8 — the producer/mapper/rollup are DORMANT until the cutover.
--
-- WHY 00106 ALONE IS INSUFFICIENT
-- -------------------------------
-- 00106 adds only the unique index (announcement_id, membership_id, channel),
-- a rollup index, and updated_at + trigger. It adds ZERO new delivery_status
-- enum values and ZERO new columns. But the producer must write
-- status='queued' / 'in_app_published' (enum values that DO NOT EXIST in the
-- live type `delivery_status` = pending|sent|delivered|read|failed, from 00008),
-- must link webhooks via provider_message_id, and must scope by group_id — none
-- of which exist. A live producer call today would throw 22P02 (invalid enum
-- input). Hence this 00107.
--
-- WHAT THIS ADDS
-- --------------
-- Part A — extend the delivery_status enum (honest states):
--   queued, sent_to_provider, in_app_published, blocked_by_policy, unavailable,
--   skipped_no_recipient, skipped_channel_disabled.
--   (Existing pending/sent/delivered/read/failed are retained.)
--   sent_to_provider distinguishes "Meta accepted (wamid)" from "delivered"
--   (webhook-proven); blocked_by_policy is the Meta 131049 US MARKETING block,
--   surfaced specifically instead of a generic "failed".
-- Part B — announcement_deliveries columns the producer/webhook need:
--   group_id (denorm for RLS + per-group rollup; FK groups(id)), queued_at,
--   failed_at, failure_reason (a structured token like 'whatsapp_us_marketing_block'
--   / 'invalid_phone' / 'channel_disabled' — NOT raw provider text), and
--   provider_message_id (webhook match key; NEVER rendered in customer UI).
--   updated_at is already added by 00106.
-- Part C — supporting indexes (group rollup, webhook match).
--
-- POSTGRES ALTER TYPE ... ADD VALUE CAVEAT (IMPORTANT)
-- ---------------------------------------------------
-- `ALTER TYPE ... ADD VALUE` cannot run inside the same transaction that then
-- USES the new value, and historically could not run inside a transaction block
-- at all. The Supabase SQL editor auto-commits each top-level statement, so the
-- ADD VALUE statements below (run FIRST, alone) commit before anything uses
-- them. Nothing later in this file references a NEW enum value (the column adds
-- and indexes do not), so there is no cross-statement dependency.
--   IF your client wraps the whole file in one transaction, split it: run the
--   "Part A" enum block as 00107a first (commit), then "Part B/C" as 00107b.
--
-- BINDING RELEASE SEQUENCING (this is the cutover checklist — a FUTURE PR, not
-- Build 8). Apply + wire ALL of the following together, in order:
--   1. Apply 00106, then 00107 (00106 first: its unique index backs the
--      producer's 23505 idempotency; 00107 second: enum values committed before
--      any insert uses them).
--   2. Live-wire produceAnnouncementDeliveries (src/lib/announcement-producer.ts)
--      into BOTH dispatch paths: the composer send and the
--      send-scheduled-announcements cron (replace the fire-and-forget /
--      direct-dispatch loops with producer enqueue).
--   3. Extend the drain (drain-notification-queue) to patch the matching
--      announcement_deliveries row to status='sent_to_provider' + set
--      provider_message_id when it sends an announcement queue row.
--   4. Extend the webhook (whatsapp-webhook-status :: persistWhatsAppStatusEvent)
--      to UPDATE announcement_deliveries matched by provider_message_id using
--      mapWhatsAppStatusToDeliveryStatus (131049 -> blocked_by_policy).
--   5. Remove 'send-scheduled-announcements' from the audit's
--      cronDirectDispatchAllowlist AND add a "producer is invoked" audit check —
--      same commit.
--   6. Swap the history UI to getAnnouncementDeliveryRollup (evidence-backed
--      counts) instead of the Build-7 derived labels.
--   7. (Optional, after the producer always sets group_id) backfill + tighten
--      group_id to NOT NULL.
--
-- PREFLIGHT (read-only — confirm before applying):
--   SELECT enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid
--     WHERE t.typname='delivery_status'; -- expect only pending/sent/delivered/read/failed
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='announcement_deliveries'
--       AND column_name IN ('group_id','queued_at','failed_at','failure_reason','provider_message_id'); -- expect 0 rows
--
-- ROLLBACK: enum values cannot be dropped in Postgres without recreating the
--   type; treat the enum additions as forward-only. Columns/indexes:
--   DROP INDEX IF EXISTS idx_announcement_deliveries_group, idx_announcement_deliveries_provider_msg;
--   ALTER TABLE public.announcement_deliveries
--     DROP COLUMN IF EXISTS group_id, DROP COLUMN IF EXISTS queued_at,
--     DROP COLUMN IF EXISTS failed_at, DROP COLUMN IF EXISTS failure_reason,
--     DROP COLUMN IF EXISTS provider_message_id;
-- ===========================================================================

-- ── Part A: extend delivery_status (run FIRST, each statement standalone) ────
ALTER TYPE delivery_status ADD VALUE IF NOT EXISTS 'queued';
ALTER TYPE delivery_status ADD VALUE IF NOT EXISTS 'sent_to_provider';
ALTER TYPE delivery_status ADD VALUE IF NOT EXISTS 'in_app_published';
ALTER TYPE delivery_status ADD VALUE IF NOT EXISTS 'blocked_by_policy';
ALTER TYPE delivery_status ADD VALUE IF NOT EXISTS 'unavailable';
ALTER TYPE delivery_status ADD VALUE IF NOT EXISTS 'skipped_no_recipient';
ALTER TYPE delivery_status ADD VALUE IF NOT EXISTS 'skipped_channel_disabled';

-- ── Part B: per-recipient columns (none reference a NEW enum value) ──────────
-- group_id is NULLABLE here: announcement_deliveries may hold legacy rows at
-- apply time and a NOT NULL add without a default would fail. The producer
-- always populates it; the cutover backfills + tightens to NOT NULL (step 7).
ALTER TABLE public.announcement_deliveries
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE public.announcement_deliveries
  ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ;

ALTER TABLE public.announcement_deliveries
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

ALTER TABLE public.announcement_deliveries
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

ALTER TABLE public.announcement_deliveries
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

-- ── Part C: supporting indexes ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_announcement_deliveries_group
  ON public.announcement_deliveries (group_id, channel, status);

CREATE INDEX IF NOT EXISTS idx_announcement_deliveries_provider_msg
  ON public.announcement_deliveries (provider_message_id)
  WHERE provider_message_id IS NOT NULL;
