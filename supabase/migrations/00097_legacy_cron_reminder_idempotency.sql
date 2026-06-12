-- Ensure the legacy-cron WhatsApp reminder producers stay idempotent.
-- This migration is intentionally narrow: it only protects the queue rows
-- written by the hosting-reminder, event-reminder, and subscription-expiring
-- producers (PR: legacy cron producerization), plus a race backstop for the
-- hosting cron's cross-channel dedup marker.
--
-- WHY THIS IS NEEDED
--   The producers' primary defense is check-before-insert, which works
--   without these indexes but is racy under concurrent cron invocations.
--   These partial unique indexes turn that race into a 23505 the producers
--   already treat as a duplicate-skip (same pattern as 00088-00096).
--
-- READINESS / APPLY NOTES
--   - Run manually in the Supabase SQL Editor (project convention).
--   - Safe to apply at any time relative to the deploy (late-apply safe):
--     the dedupe preamble below clears any race duplicates first so index
--     creation cannot fail. At the time this migration was authored,
--     notifications_queue contained ZERO rows for these three template
--     values (the legacy crons dispatched directly and never queued), so
--     the preamble is expected to be a no-op.
--   - No table rewrites; partial index builds on small predicates. No
--     downtime expected.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS idx_notifications_queue_whatsapp_hosting_reminder_unique;
--   DROP INDEX IF EXISTS idx_notifications_queue_whatsapp_event_reminder_unique;
--   DROP INDEX IF EXISTS idx_notifications_queue_whatsapp_subscription_expiring_unique;
--   DROP INDEX IF EXISTS idx_notifications_hosting_reminder_dedup_unique;
--   (Rollback restores the pre-index state; the producers keep their
--   check-before-insert behavior and remain functional, just without the
--   concurrency backstop.)

-- Late-apply safety (00093/00094/00096 precedent): remove any race
-- duplicates before creating the unique indexes, keeping the row that
-- reached the provider ('sent', which carries the providerMessageId audit
-- trail) over 'queued' and 'failed'; ties break to the earliest row.
DELETE FROM public.notifications_queue nq
USING public.notifications_queue keeper
WHERE nq.channel = 'whatsapp'::notification_channel
  AND keeper.channel = 'whatsapp'::notification_channel
  AND nq.template = keeper.template
  AND nq.template IN ('hosting_reminder', 'event_reminder', 'subscription_expiring')
  AND nq.id <> keeper.id
  AND (
    CASE nq.template
      WHEN 'hosting_reminder' THEN
        nq.data ->> 'assignmentId' IS NOT NULL
        AND nq.data ->> 'assignmentId' = keeper.data ->> 'assignmentId'
        AND COALESCE(nq.data ->> 'assignedDate', '') = COALESCE(keeper.data ->> 'assignedDate', '')
      WHEN 'event_reminder' THEN
        nq.data ->> 'eventId' IS NOT NULL
        AND nq.data ->> 'eventId' = keeper.data ->> 'eventId'
        AND COALESCE(nq.data ->> 'userId', '') = COALESCE(keeper.data ->> 'userId', '')
      ELSE
        nq.data ->> 'subscriptionId' IS NOT NULL
        AND nq.data ->> 'subscriptionId' = keeper.data ->> 'subscriptionId'
        AND COALESCE(nq.data ->> 'reminderDate', '') = COALESCE(keeper.data ->> 'reminderDate', '')
        AND COALESCE(nq.data ->> 'userId', '') = COALESCE(keeper.data ->> 'userId', '')
    END
  )
  AND (
    CASE keeper.status WHEN 'sent' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
    keeper.created_at,
    keeper.id
  ) < (
    CASE nq.status WHEN 'sent' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
    nq.created_at,
    nq.id
  );

-- Hosting reminders are STRICT per assignment occurrence: exactly one
-- WhatsApp reminder per (assignmentId, assignedDate), ever. A rescheduled
-- assignment carries a new assignedDate and legitimately re-reminds. This
-- replaces the legacy cron's broken body-LIKE dedup (ISO date vs formatted
-- date, never matched -> daily duplicate sends).
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_queue_whatsapp_hosting_reminder_unique
  ON public.notifications_queue ((data ->> 'assignmentId'), (data ->> 'assignedDate'))
  WHERE channel = 'whatsapp'::notification_channel
    AND template = 'hosting_reminder'
    AND data ? 'assignmentId'
    AND data ? 'assignedDate'
    AND (data ->> 'assignmentId') IS NOT NULL
    AND (data ->> 'assignedDate') IS NOT NULL;

-- Event reminders notify EVERY eligible group member once per event
-- (parity with events.reminder_sent_at), so uniqueness is per
-- (eventId, recipient user).
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_queue_whatsapp_event_reminder_unique
  ON public.notifications_queue ((data ->> 'eventId'), (data ->> 'userId'))
  WHERE channel = 'whatsapp'::notification_channel
    AND template = 'event_reminder'
    AND data ? 'eventId'
    AND data ? 'userId'
    AND (data ->> 'eventId') IS NOT NULL
    AND (data ->> 'userId') IS NOT NULL;

-- Subscription-expiring reminders use a DAY BUCKET per recipient: one
-- WhatsApp per (subscriptionId, reminderDate, userId). The daily cadence
-- inside the 7-day expiry window (daysLeft countdown) is intentional;
-- same-day cron reruns are idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_queue_whatsapp_subscription_expiring_unique
  ON public.notifications_queue ((data ->> 'subscriptionId'), (data ->> 'reminderDate'), (data ->> 'userId'))
  WHERE channel = 'whatsapp'::notification_channel
    AND template = 'subscription_expiring'
    AND data ? 'subscriptionId'
    AND data ? 'reminderDate'
    AND data ? 'userId'
    AND (data ->> 'subscriptionId') IS NOT NULL
    AND (data ->> 'reminderDate') IS NOT NULL
    AND (data ->> 'userId') IS NOT NULL;

-- Race backstop for the hosting cron's cross-channel (in-app/email/SMS)
-- dedup marker, mirroring idx_notifications_payment_receipt_dedup_unique
-- (00088). Keys look like 'hosting_reminder_<assignmentId>_<assignedDate>',
-- so the same (user, key) pair never legitimately repeats. No dedupe
-- preamble is needed: the legacy cron's in-app insert used an invalid
-- notification_type enum value and always failed, so no rows with this
-- key prefix can exist before this migration.
-- NOTE: deliberately NO equivalent unique index for the existing
-- 'subscription_expiring_%' dedup keys — those repeat legitimately across
-- billing years (same group, same daysLeft), and the cron's 24h-windowed
-- check is the correct guard there.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_hosting_reminder_dedup_unique
  ON public.notifications (user_id, dedup_key)
  WHERE dedup_key LIKE 'hosting_reminder_%';
