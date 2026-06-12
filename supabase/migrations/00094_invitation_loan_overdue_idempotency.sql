-- Ensure WhatsApp member-invitation and loan-overdue production stays
-- idempotent. This migration is intentionally narrow: it only protects
-- those two producers' queue rows.

-- Late-apply safety (00093 precedent): the producers go live on deploy,
-- and until these indexes exist their check-before-insert is racy.
-- Remove any race duplicates (keeping the earliest row per key) so
-- CREATE UNIQUE INDEX cannot fail no matter when this is applied. Legacy
-- /api/whatsapp/send retry rows never carry these data keys, so they are
-- untouched.
DELETE FROM public.notifications_queue nq
USING public.notifications_queue keeper
WHERE nq.channel = 'whatsapp'::notification_channel
  AND keeper.channel = 'whatsapp'::notification_channel
  AND nq.template = keeper.template
  AND nq.template IN ('member_invitation', 'loan_overdue')
  AND COALESCE(nq.data ->> 'invitationId', nq.data ->> 'loanId') IS NOT NULL
  AND COALESCE(nq.data ->> 'invitationId', nq.data ->> 'loanId')
      = COALESCE(keeper.data ->> 'invitationId', keeper.data ->> 'loanId')
  AND COALESCE(nq.data ->> 'sendDate', nq.data ->> 'reminderDate', '')
      = COALESCE(keeper.data ->> 'sendDate', keeper.data ->> 'reminderDate', '')
  AND (keeper.created_at, keeper.id) < (nq.created_at, nq.id);

-- Member invitations are a DAY BUCKET on (invitationId, sendDate):
-- same-day double-clicks and races dedupe, while the existing resend
-- feature still re-delivers on a later day.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_queue_whatsapp_member_invitation_unique
  ON public.notifications_queue ((data ->> 'invitationId'), (data ->> 'sendDate'))
  WHERE channel = 'whatsapp'::notification_channel
    AND template = 'member_invitation'
    AND data ? 'invitationId'
    AND data ? 'sendDate'
    AND (data ->> 'invitationId') IS NOT NULL
    AND (data ->> 'sendDate') IS NOT NULL;

-- Loan overdue reminders are a DAY BUCKET on (loanId, reminderDate):
-- one reminder per loan per UTC day regardless of how many installments
-- are overdue; tomorrow's cron run reminds again while the loan stays
-- overdue. The template predicate keeps this disjoint from 00093's
-- loan_approved index on the same loanId key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_queue_whatsapp_loan_overdue_unique
  ON public.notifications_queue ((data ->> 'loanId'), (data ->> 'reminderDate'))
  WHERE channel = 'whatsapp'::notification_channel
    AND template = 'loan_overdue'
    AND data ? 'loanId'
    AND data ? 'reminderDate'
    AND (data ->> 'loanId') IS NOT NULL
    AND (data ->> 'reminderDate') IS NOT NULL;
