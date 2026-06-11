-- Ensure WhatsApp welcome production stays idempotent.
-- This migration is intentionally narrow: it only protects the new
-- welcome producer's queue rows (one WhatsApp welcome per membership).

-- Welcomes are strict exactly-once across all queue statuses. Failed rows
-- are not auto-reenqueued in this launch path; a controlled manual/admin
-- retry can be designed later.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_queue_whatsapp_welcome_unique
  ON public.notifications_queue ((data ->> 'membershipId'))
  WHERE channel = 'whatsapp'::notification_channel
    AND template = 'welcome'
    AND data ? 'membershipId';
