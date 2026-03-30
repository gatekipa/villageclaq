-- ============================================================================
-- ADD STATUS COLUMN TO PAYMENTS TABLE
-- Enables self-service payment flow where members submit payments
-- that require treasurer confirmation before being applied.
-- ============================================================================

-- Add status column (defaults to 'confirmed' so all existing payments stay valid)
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed';

-- Add check constraint for allowed statuses
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('confirmed', 'pending_confirmation', 'rejected'));

-- Index for filtering pending payments
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_group_status ON public.payments(group_id, status);
