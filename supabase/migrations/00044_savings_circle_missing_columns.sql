-- Migration 00044: Add missing columns to savings circle tables
-- The UI code references these columns but they were never added to the schema.

-- ═══════════════════════════════════════════════════════════════
-- savings_cycles: add JSONB columns for fines, issues, and meeting info
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.savings_cycles
  ADD COLUMN IF NOT EXISTS fine_rules JSONB DEFAULT '{"late_contribution": 0, "absence": 0, "default_penalty": 0}'::jsonb,
  ADD COLUMN IF NOT EXISTS fines_ledger JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS issues_log JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS meeting_schedule TEXT,
  ADD COLUMN IF NOT EXISTS meeting_location TEXT;

-- ═══════════════════════════════════════════════════════════════
-- savings_contributions: add payment_method and recorded_by for audit
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.savings_contributions
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ═══════════════════════════════════════════════════════════════
-- savings_participants: add payout tracking columns
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.savings_participants
  ADD COLUMN IF NOT EXISTS payout_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS payout_method TEXT,
  ADD COLUMN IF NOT EXISTS payout_notes TEXT;

-- ═══════════════════════════════════════════════════════════════
-- Performance index: fast lookup for contributions by round
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_savings_contributions_cycle_round_status
  ON public.savings_contributions(cycle_id, round_number, status);

CREATE INDEX IF NOT EXISTS idx_savings_participants_cycle_round
  ON public.savings_participants(cycle_id, collection_round);
