-- Ensure WhatsApp remittance-decision production stays idempotent.
-- This migration is intentionally narrow: it only protects the remittance
-- producer's queue rows.

-- Late-apply safety (00093/00094 precedent): the producer goes live on
-- deploy, and until these indexes exist its check-before-insert is racy.
-- Remove any race duplicates (keeping the earliest row per key) so
-- CREATE UNIQUE INDEX cannot fail no matter when this is applied. Legacy
-- /api/whatsapp/send retry rows never carry these data keys, so they are
-- untouched.
-- Keeper preference: a row that actually reached the provider ('sent',
-- which carries the providerMessageId audit trail) survives over 'queued'
-- and 'failed' duplicates; ties break to the earliest row. This matters
-- only if duplicates were drained before the migration ran.
DELETE FROM public.notifications_queue nq
USING public.notifications_queue keeper
WHERE nq.channel = 'whatsapp'::notification_channel
  AND keeper.channel = 'whatsapp'::notification_channel
  AND nq.template = keeper.template
  AND nq.template IN ('remittance_confirmed', 'remittance_disputed')
  AND nq.data ->> 'remittanceId' IS NOT NULL
  AND nq.data ->> 'remittanceId' = keeper.data ->> 'remittanceId'
  AND COALESCE(nq.data ->> 'recipientUserId', '') = COALESCE(keeper.data ->> 'recipientUserId', '')
  AND (
    CASE keeper.status WHEN 'sent' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
    keeper.created_at,
    keeper.id
  ) < (
    CASE nq.status WHEN 'sent' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
    nq.created_at,
    nq.id
  );

-- Remittance decisions notify EVERY branch owner/admin, so uniqueness is
-- per (remittanceId, decision template, recipient): reruns dedupe per
-- admin, while a genuine reversal (confirmed -> disputed) uses the other
-- template and still notifies once per decision.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_queue_whatsapp_remittance_confirmed_unique
  ON public.notifications_queue ((data ->> 'remittanceId'), (data ->> 'recipientUserId'))
  WHERE channel = 'whatsapp'::notification_channel
    AND template = 'remittance_confirmed'
    AND data ? 'remittanceId'
    AND data ? 'recipientUserId'
    AND (data ->> 'remittanceId') IS NOT NULL
    AND (data ->> 'recipientUserId') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_queue_whatsapp_remittance_disputed_unique
  ON public.notifications_queue ((data ->> 'remittanceId'), (data ->> 'recipientUserId'))
  WHERE channel = 'whatsapp'::notification_channel
    AND template = 'remittance_disputed'
    AND data ? 'remittanceId'
    AND data ? 'recipientUserId'
    AND (data ->> 'remittanceId') IS NOT NULL
    AND (data ->> 'recipientUserId') IS NOT NULL;
