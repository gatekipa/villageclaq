-- Ensure payment receipt notification production stays idempotent.
-- This migration is intentionally narrow: it only protects the new
-- payment_receipt producer keys and queue rows.

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_payment_receipt_dedup_unique
  ON public.notifications (user_id, dedup_key)
  WHERE dedup_key LIKE 'payment_receipt:%';

-- Payment receipts are strict exactly-once across all queue statuses.
-- Failed rows are not auto-reenqueued in this launch path; a controlled
-- manual/admin retry can be designed later.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_queue_whatsapp_payment_receipt_unique
  ON public.notifications_queue ((data ->> 'paymentId'))
  WHERE channel = 'whatsapp'::notification_channel
    AND template = 'payment_receipt'
    AND data ? 'paymentId';
