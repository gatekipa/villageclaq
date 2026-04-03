-- ============================================================
-- Migration 00055: Fix handle_new_user to copy phone from auth
--
-- ROOT CAUSE: The handle_new_user() trigger only copies
-- full_name and avatar_url from auth.users metadata.
-- It never copies NEW.phone, so profiles.phone is NULL
-- for all phone-auth signups. This breaks WhatsApp
-- notifications which resolve UUID → profiles.phone.
--
-- FIX: Copy NEW.phone into profiles.phone on signup.
-- Also backfill existing profiles from auth.users.phone.
-- ============================================================

-- 1. Update the trigger to include phone
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.phone
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Backfill existing profiles: copy auth.users.phone where profiles.phone IS NULL
UPDATE public.profiles p
SET phone = u.phone
FROM auth.users u
WHERE p.id = u.id
  AND p.phone IS NULL
  AND u.phone IS NOT NULL
  AND u.phone != '';
