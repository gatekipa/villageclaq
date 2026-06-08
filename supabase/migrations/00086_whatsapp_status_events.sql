-- ============================================================
-- WhatsApp Provider Status Events
-- Stores Meta webhook status callbacks by provider wamid.
-- Full recipient phone numbers must not be stored here.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_message_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_message_id TEXT NOT NULL,
  status TEXT NOT NULL,
  recipient_phone_mask TEXT,
  meta_timestamp TIMESTAMPTZ,
  raw_event JSONB NOT NULL DEFAULT '{}',
  error_code TEXT,
  error_title TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_status_events_provider_message_id
  ON public.whatsapp_message_status_events(provider_message_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_status_events_status
  ON public.whatsapp_message_status_events(status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_status_events_meta_timestamp
  ON public.whatsapp_message_status_events(meta_timestamp DESC);

ALTER TABLE public.whatsapp_message_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform staff can view WhatsApp status events"
  ON public.whatsapp_message_status_events;
CREATE POLICY "Platform staff can view WhatsApp status events"
  ON public.whatsapp_message_status_events
  FOR SELECT
  TO authenticated
  USING (is_platform_staff());

GRANT SELECT ON public.whatsapp_message_status_events TO authenticated;
GRANT ALL ON public.whatsapp_message_status_events TO service_role;
