-- ============================================================
-- Migration 00053: Enable WhatsApp + SMS by default (opt-OUT model)
--
-- ROOT CAUSE: notification_preferences column defaulted to
-- whatsapp: false and sms: false for all channels and types.
-- This meant WhatsApp/SMS would NEVER send unless each member
-- manually went to Settings → Notifications and enabled them.
-- Since this is a group communication tool, the default should
-- be opt-OUT (enabled by default, member can disable).
--
-- This migration:
-- 1. Updates ALL existing profiles to enable whatsapp + sms
--    in both global channels and per-type preferences
-- 2. Changes the column DEFAULT for new profiles
-- ============================================================

-- Step 1: Update global channel defaults for ALL existing profiles
UPDATE profiles
SET notification_preferences = jsonb_set(
  jsonb_set(
    COALESCE(notification_preferences, '{}'::jsonb),
    '{channels,sms}', 'true'::jsonb
  ),
  '{channels,whatsapp}', 'true'::jsonb
)
WHERE notification_preferences IS NULL
   OR notification_preferences->'channels'->>'whatsapp' = 'false'
   OR notification_preferences->'channels'->>'sms' = 'false';

-- Step 2: Update per-type preferences — enable whatsapp + sms for each type
-- (except new_member and subscription_updates which stay off)
DO $$
DECLARE
  type_key TEXT;
BEGIN
  FOREACH type_key IN ARRAY ARRAY[
    'payment_reminders', 'event_reminders', 'minutes_published',
    'relief_updates', 'standing_changes', 'announcements',
    'hosting_reminders', 'loan_updates', 'fine_updates'
  ]
  LOOP
    UPDATE profiles
    SET notification_preferences = jsonb_set(
      jsonb_set(
        notification_preferences,
        ARRAY['types', type_key, 'sms'], 'true'::jsonb
      ),
      ARRAY['types', type_key, 'whatsapp'], 'true'::jsonb
    )
    WHERE notification_preferences->'types'->type_key->>'whatsapp' = 'false'
       OR notification_preferences->'types'->type_key->>'sms' = 'false';
  END LOOP;
END $$;

-- Step 3: Change column DEFAULT for new profiles
ALTER TABLE profiles
ALTER COLUMN notification_preferences
SET DEFAULT '{
  "channels": {
    "in_app": true,
    "email": true,
    "sms": true,
    "whatsapp": true,
    "push": false
  },
  "types": {
    "payment_reminders": {"in_app": true, "email": true, "sms": true, "whatsapp": true},
    "event_reminders": {"in_app": true, "email": true, "sms": true, "whatsapp": true},
    "minutes_published": {"in_app": true, "email": true, "sms": true, "whatsapp": true},
    "relief_updates": {"in_app": true, "email": true, "sms": true, "whatsapp": true},
    "standing_changes": {"in_app": true, "email": true, "sms": true, "whatsapp": true},
    "announcements": {"in_app": true, "email": true, "sms": true, "whatsapp": true},
    "hosting_reminders": {"in_app": true, "email": true, "sms": true, "whatsapp": true},
    "new_member": {"in_app": true, "email": false, "sms": false, "whatsapp": false},
    "loan_updates": {"in_app": true, "email": true, "sms": true, "whatsapp": true},
    "fine_updates": {"in_app": true, "email": true, "sms": true, "whatsapp": true},
    "subscription_updates": {"in_app": true, "email": true, "sms": false, "whatsapp": false}
  },
  "quiet_hours": {"enabled": false, "start": "22:00", "end": "07:00"},
  "muted_groups": []
}'::jsonb;
