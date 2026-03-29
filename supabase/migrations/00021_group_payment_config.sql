-- ============================================================================
-- GROUP PAYMENT CONFIGURATION
-- Stores which payment methods a group accepts and their details.
-- ============================================================================

-- Add new payment method values to the enum
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'cashapp';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'zelle';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'other';

CREATE TABLE IF NOT EXISTS public.group_payment_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,

  -- Which methods are enabled
  cash_enabled BOOLEAN DEFAULT true,
  mobile_money_enabled BOOLEAN DEFAULT false,
  bank_transfer_enabled BOOLEAN DEFAULT false,
  cashapp_enabled BOOLEAN DEFAULT false,
  zelle_enabled BOOLEAN DEFAULT false,
  flutterwave_enabled BOOLEAN DEFAULT false,

  -- CashApp details
  cashapp_tag TEXT DEFAULT NULL,
  cashapp_display_name TEXT DEFAULT NULL,

  -- Zelle details
  zelle_email TEXT DEFAULT NULL,
  zelle_phone TEXT DEFAULT NULL,
  zelle_display_name TEXT DEFAULT NULL,

  -- Mobile Money providers (JSON array)
  -- Format: [{ "provider": "MTN MoMo", "number": "+237...", "name": "..." }]
  mobile_money_providers JSONB DEFAULT '[]'::jsonb,

  -- Bank Transfer details
  bank_name TEXT DEFAULT NULL,
  bank_account_name TEXT DEFAULT NULL,
  bank_account_number TEXT DEFAULT NULL,
  bank_routing_number TEXT DEFAULT NULL,
  bank_swift_code TEXT DEFAULT NULL,
  bank_branch TEXT DEFAULT NULL,

  -- Flutterwave (keys in env vars — just toggle + currency here)
  flutterwave_currency TEXT DEFAULT NULL,

  -- Freeform payment instructions
  payment_instructions TEXT DEFAULT NULL,
  payment_instructions_fr TEXT DEFAULT NULL,

  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  UNIQUE(group_id)
);

-- RLS
ALTER TABLE public.group_payment_config ENABLE ROW LEVEL SECURITY;

-- Members can view their own group's payment config
CREATE POLICY "Group members can view payment config"
  ON public.group_payment_config FOR SELECT
  USING (group_id IN (SELECT get_user_group_ids()));

-- Admins can insert/update/delete
CREATE POLICY "Group admins can manage payment config"
  ON public.group_payment_config FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE memberships.group_id = group_payment_config.group_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE memberships.group_id = group_payment_config.group_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

-- Platform admins can view all
CREATE POLICY "Platform admins can view all payment configs"
  ON public.group_payment_config FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM platform_staff WHERE user_id = auth.uid())
  );

-- Index
CREATE INDEX IF NOT EXISTS idx_group_payment_config_group ON public.group_payment_config(group_id);
