-- ============================================================================
-- FIX: Ensure all group_payment_config columns exist
-- The table may have been deployed from an earlier version missing columns.
-- All statements are idempotent (ADD COLUMN IF NOT EXISTS).
-- ============================================================================

-- Toggle columns
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS cash_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS mobile_money_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS bank_transfer_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS cashapp_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS zelle_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS flutterwave_enabled BOOLEAN DEFAULT false;

-- CashApp details
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS cashapp_tag TEXT DEFAULT NULL;
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS cashapp_display_name TEXT DEFAULT NULL;

-- Zelle details
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS zelle_email TEXT DEFAULT NULL;
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS zelle_phone TEXT DEFAULT NULL;
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS zelle_display_name TEXT DEFAULT NULL;

-- Mobile Money
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS mobile_money_providers JSONB DEFAULT '[]'::jsonb;

-- Bank Transfer details
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT NULL;
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS bank_account_name TEXT DEFAULT NULL;
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS bank_account_number TEXT DEFAULT NULL;
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS bank_routing_number TEXT DEFAULT NULL;
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS bank_swift_code TEXT DEFAULT NULL;
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS bank_branch TEXT DEFAULT NULL;

-- Flutterwave
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS flutterwave_currency TEXT DEFAULT NULL;

-- Payment instructions
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS payment_instructions TEXT DEFAULT NULL;
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS payment_instructions_fr TEXT DEFAULT NULL;

-- Timestamps
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now() NOT NULL;
ALTER TABLE public.group_payment_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now() NOT NULL;
