-- ============================================================================
-- Migration 00066: Add reminder_sent_at to events table
-- ============================================================================
-- PURPOSE:
--   Adds a nullable timestamp column to track when event reminders were sent.
--   The cron job uses this to prevent duplicate reminders (filters by
--   reminder_sent_at IS NULL) and expands the window from 24-48h to 0-48h
--   so same-day events also receive reminders.
--
-- Run manually in Supabase SQL Editor.
-- ============================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.events.reminder_sent_at IS 'Timestamp when event reminder was sent by cron. NULL = not yet reminded.';
