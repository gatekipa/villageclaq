-- Ensure WhatsApp relief-enrollment and hosting-assignment production
-- stays idempotent. This migration is intentionally narrow: it only
-- protects the two new producers' queue rows (one WhatsApp notice per
-- enrollment / per assignment).

-- Both notices are strict exactly-once across all queue statuses. Failed
-- rows are not auto-reenqueued in this launch path; a controlled
-- manual/admin retry can be designed later.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_queue_whatsapp_relief_enrollment_unique
  ON public.notifications_queue ((data ->> 'enrollmentId'))
  WHERE channel = 'whatsapp'::notification_channel
    AND template = 'relief_enrollment'
    AND data ? 'enrollmentId'
    AND (data ->> 'enrollmentId') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_queue_whatsapp_hosting_assignment_unique
  ON public.notifications_queue ((data ->> 'assignmentId'))
  WHERE channel = 'whatsapp'::notification_channel
    AND template = 'hosting_assignment'
    AND data ? 'assignmentId'
    AND (data ->> 'assignmentId') IS NOT NULL;
