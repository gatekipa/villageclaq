-- Migration 00039: Add RPC function to safely increment join code use_count
-- This avoids race conditions when multiple users join simultaneously.

CREATE OR REPLACE FUNCTION public.increment_join_code_use_count(p_code TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.join_codes
  SET use_count = COALESCE(use_count, 0) + 1
  WHERE code = p_code;
END;
$$;

-- Also ensure notification_preferences column exists on profiles
-- (may already exist from an earlier migration or manual addition)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'notification_preferences'
  ) THEN
    ALTER TABLE public.profiles
    ADD COLUMN notification_preferences JSONB DEFAULT '{}';
  END IF;
END $$;
