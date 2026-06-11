-- Ensure WhatsApp money-path notification production stays idempotent.
-- This migration is intentionally narrow: it only protects the fine,
-- loan-approval, and relief-claim-decision producers' queue rows.

-- Late-apply safety: the producers go live on deploy, and until these
-- indexes exist their check-before-insert is racy — a concurrent pair of
-- triggers could enqueue twice. Remove any such race duplicates (keeping
-- the earliest row per key) so CREATE UNIQUE INDEX cannot fail no matter
-- when this migration is applied. Legacy /api/whatsapp/send retry rows
-- never carry these data keys, so they are untouched.
DELETE FROM public.notifications_queue nq
USING public.notifications_queue keeper
WHERE nq.channel = 'whatsapp'::notification_channel
  AND keeper.channel = 'whatsapp'::notification_channel
  AND nq.template = keeper.template
  AND nq.template IN ('fine_issued', 'loan_approved', 'relief_claim_approved', 'relief_claim_denied')
  AND COALESCE(nq.data ->> 'fineId', nq.data ->> 'loanId', nq.data ->> 'claimId') IS NOT NULL
  AND COALESCE(nq.data ->> 'fineId', nq.data ->> 'loanId', nq.data ->> 'claimId')
      = COALESCE(keeper.data ->> 'fineId', keeper.data ->> 'loanId', keeper.data ->> 'claimId')
  AND (keeper.created_at, keeper.id) < (nq.created_at, nq.id);

-- A fine is issued once: strict exactly-once per fineId.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_queue_whatsapp_fine_issued_unique
  ON public.notifications_queue ((data ->> 'fineId'))
  WHERE channel = 'whatsapp'::notification_channel
    AND template = 'fine_issued'
    AND data ? 'fineId'
    AND (data ->> 'fineId') IS NOT NULL;

-- A loan is approved once: strict exactly-once per loanId. This also
-- collapses the two-admin concurrent-approval race the old direct client
-- path double-sent on.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_queue_whatsapp_loan_approved_unique
  ON public.notifications_queue ((data ->> 'loanId'))
  WHERE channel = 'whatsapp'::notification_channel
    AND template = 'loan_approved'
    AND data ? 'loanId'
    AND (data ->> 'loanId') IS NOT NULL;

-- Relief claims are keyed per (claimId, decision template): a double-click
-- or rerun of the SAME decision dedupes, while a genuine reversal
-- (approved -> denied or vice versa) still notifies once per decision.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_queue_whatsapp_claim_approved_unique
  ON public.notifications_queue ((data ->> 'claimId'))
  WHERE channel = 'whatsapp'::notification_channel
    AND template = 'relief_claim_approved'
    AND data ? 'claimId'
    AND (data ->> 'claimId') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_queue_whatsapp_claim_denied_unique
  ON public.notifications_queue ((data ->> 'claimId'))
  WHERE channel = 'whatsapp'::notification_channel
    AND template = 'relief_claim_denied'
    AND data ? 'claimId'
    AND (data ->> 'claimId') IS NOT NULL;
