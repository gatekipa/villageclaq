-- ============================================================================
-- Migration: Add standing_updated_at to memberships
-- Purpose: Track when standing was last recalculated so the client can
--          skip expensive recalculation if the value is fresh.
-- ============================================================================

-- Add the column (nullable — NULL means "never calculated, please recalculate")
ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS standing_updated_at TIMESTAMPTZ DEFAULT NULL;

-- Index for queries that filter on stale standing (e.g. "recalculate all stale")
CREATE INDEX IF NOT EXISTS idx_memberships_standing_updated_at
  ON public.memberships (standing_updated_at)
  WHERE standing_updated_at IS NOT NULL;

-- Backfill: set standing_updated_at = now() for all members whose standing is
-- already set to something other than the default 'good', indicating it was
-- manually recalculated at some point. Leave 'good' members as NULL so the
-- client triggers a fresh calculation on first view.
UPDATE public.memberships
  SET standing_updated_at = now()
  WHERE standing != 'good';
