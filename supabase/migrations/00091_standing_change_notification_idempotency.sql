-- Ensure WhatsApp standing-change production stays idempotent per day.
-- This migration is intentionally narrow: it only protects the standing
-- change producer's queue rows.

-- Standing changes recur (a member can move good -> warning -> good over
-- time), so uniqueness is a DAY BUCKET keyed on the membership AND the new
-- standing value: repeated same-day recalcs and concurrent races for the
-- same standing are blocked, while a later genuine transition to a
-- DIFFERENT standing has a different key and still notifies. Same-day
-- A -> B -> A -> B re-fires only the first occurrence of each value that
-- day; the activity_feed remains the complete transition audit trail.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_queue_whatsapp_standing_changed_unique
  ON public.notifications_queue ((data ->> 'membershipId'), (data ->> 'newStanding'), (data ->> 'changeDate'))
  WHERE channel = 'whatsapp'::notification_channel
    AND template = 'standing_changed'
    AND data ? 'membershipId'
    AND data ? 'newStanding'
    AND data ? 'changeDate'
    AND (data ->> 'membershipId') IS NOT NULL
    AND (data ->> 'newStanding') IS NOT NULL
    AND (data ->> 'changeDate') IS NOT NULL;
