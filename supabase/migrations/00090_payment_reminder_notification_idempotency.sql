-- Ensure WhatsApp payment reminder production stays idempotent per day.
-- This migration is intentionally narrow: it only protects the payment
-- reminder producer's queue rows.

-- Payment reminders repeat on later scheduled days BY DESIGN (the cron
-- runs daily at 08:00 UTC and re-reminds while an obligation stays
-- unpaid), so uniqueness is a DAY BUCKET — one WhatsApp reminder per
-- obligation per UTC reminder date — not the strict per-entity
-- exactly-once used by 00087/00088/00089. Same-day cron reruns, manual
-- re-triggers, and races are blocked; tomorrow's run reminds again.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_queue_whatsapp_payment_reminder_unique
  ON public.notifications_queue ((data ->> 'obligationId'), (data ->> 'reminderDate'))
  WHERE channel = 'whatsapp'::notification_channel
    AND template = 'payment_reminder'
    AND data ? 'obligationId'
    AND data ? 'reminderDate'
    AND (data ->> 'obligationId') IS NOT NULL
    AND (data ->> 'reminderDate') IS NOT NULL;
