-- Enum change is its own migration so the next transactional step can use it.
DO $pre$
BEGIN
  IF to_regtype('public.notification_channel') IS NULL THEN
    RAISE EXCEPTION 'M11_ABORT: S0/M2 notification_channel missing';
  END IF;
END
$pre$;
ALTER TYPE public.notification_channel ADD VALUE IF NOT EXISTS 'in_app';
ALTER TYPE public.notification_queue_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE public.notification_queue_status ADD VALUE IF NOT EXISTS 'processing';
ALTER TYPE public.notification_queue_status ADD VALUE IF NOT EXISTS 'dead_letter';
