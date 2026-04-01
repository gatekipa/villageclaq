-- Migration: QA Batch B fixes
-- Bug #225: Add meeting_link column to events table
-- Bug #263: No schema changes needed (UI-only progress indicator)

-- ==================== Bug #225: Meeting Link Field ====================
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS meeting_link TEXT;
COMMENT ON COLUMN public.events.meeting_link IS 'Virtual meeting URL (Zoom, Google Meet, Teams, etc.)';
