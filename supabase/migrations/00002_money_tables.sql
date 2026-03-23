-- VillageClaq Phase 2: Money Tables Migration
-- Contribution types, obligations, and payments

-- ============================================================================
-- ENUMS
-- ============================================================================
CREATE TYPE contribution_frequency AS ENUM ('one_time', 'monthly', 'quarterly', 'annual');
CREATE TYPE obligation_status AS ENUM ('pending', 'partial', 'paid', 'overdue', 'waived');
CREATE TYPE payment_method AS ENUM ('cash', 'mobile_money', 'bank_transfer', 'online');

-- ============================================================================
-- CONTRIBUTION TYPES
-- ============================================================================
CREATE TABLE public.contribution_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_fr TEXT,
  description TEXT,
  description_fr TEXT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'XAF',
  frequency contribution_frequency NOT NULL DEFAULT 'monthly',
  due_day INTEGER CHECK (due_day >= 1 AND due_day <= 31),
  due_month INTEGER CHECK (due_month >= 1 AND due_month <= 12),
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  enroll_all_members BOOLEAN DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  UNIQUE(group_id, name)
);

-- ============================================================================
-- CONTRIBUTION OBLIGATIONS
-- ============================================================================
CREATE TABLE public.contribution_obligations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contribution_type_id UUID NOT NULL REFERENCES public.contribution_types(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  amount_paid NUMERIC(12, 2) DEFAULT 0 CHECK (amount_paid >= 0),
  currency TEXT NOT NULL DEFAULT 'XAF',
  due_date DATE NOT NULL,
  status obligation_status DEFAULT 'pending' NOT NULL,
  period_label TEXT, -- e.g. "2026", "March 2026", "Q1 2026"
  notes TEXT,
  waived_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  waived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  UNIQUE(contribution_type_id, membership_id, due_date)
);

-- ============================================================================
-- PAYMENTS
-- ============================================================================
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  obligation_id UUID REFERENCES public.contribution_obligations(id) ON DELETE SET NULL,
  contribution_type_id UUID REFERENCES public.contribution_types(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'XAF',
  payment_method payment_method NOT NULL DEFAULT 'cash',
  reference_number TEXT,
  receipt_url TEXT,
  notes TEXT,
  recorded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================================
-- TRIGGERS
-- ============================================================================
CREATE TRIGGER update_contribution_types_updated_at BEFORE UPDATE ON public.contribution_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_contribution_obligations_updated_at BEFORE UPDATE ON public.contribution_obligations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- AUTO-GENERATE OBLIGATIONS WHEN CONTRIBUTION TYPE IS CREATED
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_obligations_for_type()
RETURNS TRIGGER AS $$
DECLARE
  mem RECORD;
  due DATE;
  period TEXT;
BEGIN
  -- Only generate if enroll_all_members is true
  IF NOT NEW.enroll_all_members THEN
    RETURN NEW;
  END IF;

  -- Calculate due date based on frequency
  due := COALESCE(NEW.start_date, CURRENT_DATE);
  IF NEW.due_day IS NOT NULL THEN
    due := make_date(EXTRACT(YEAR FROM due)::int, EXTRACT(MONTH FROM due)::int, LEAST(NEW.due_day, 28));
  END IF;

  -- Generate period label
  CASE NEW.frequency
    WHEN 'monthly' THEN period := to_char(due, 'Month YYYY');
    WHEN 'quarterly' THEN period := 'Q' || EXTRACT(QUARTER FROM due) || ' ' || EXTRACT(YEAR FROM due);
    WHEN 'annual' THEN period := EXTRACT(YEAR FROM due)::text;
    WHEN 'one_time' THEN period := to_char(due, 'YYYY-MM-DD');
  END CASE;

  -- Create obligation for each active member in the group
  FOR mem IN
    SELECT id FROM public.memberships
    WHERE group_id = NEW.group_id
    AND standing != 'banned'
  LOOP
    INSERT INTO public.contribution_obligations (
      contribution_type_id, membership_id, group_id, amount, currency, due_date, period_label, status
    ) VALUES (
      NEW.id, mem.id, NEW.group_id, NEW.amount, NEW.currency, due, period, 'pending'
    ) ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_contribution_type_created
  AFTER INSERT ON public.contribution_types
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_obligations_for_type();

-- ============================================================================
-- AUTO-UPDATE OBLIGATION STATUS ON PAYMENT
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_obligation_on_payment()
RETURNS TRIGGER AS $$
DECLARE
  obl RECORD;
BEGIN
  IF NEW.obligation_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Update the obligation amount_paid
  UPDATE public.contribution_obligations
  SET amount_paid = amount_paid + NEW.amount,
      status = CASE
        WHEN amount_paid + NEW.amount >= amount THEN 'paid'
        WHEN amount_paid + NEW.amount > 0 THEN 'partial'
        ELSE status
      END
  WHERE id = NEW.obligation_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_payment_recorded
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_obligation_on_payment();

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX idx_contribution_types_group ON public.contribution_types(group_id);
CREATE INDEX idx_contribution_types_active ON public.contribution_types(group_id) WHERE is_active = true;
CREATE INDEX idx_obligations_type ON public.contribution_obligations(contribution_type_id);
CREATE INDEX idx_obligations_member ON public.contribution_obligations(membership_id);
CREATE INDEX idx_obligations_group ON public.contribution_obligations(group_id);
CREATE INDEX idx_obligations_status ON public.contribution_obligations(status);
CREATE INDEX idx_obligations_due_date ON public.contribution_obligations(due_date);
CREATE INDEX idx_obligations_period ON public.contribution_obligations(contribution_type_id, period_label);
CREATE INDEX idx_payments_group ON public.payments(group_id);
CREATE INDEX idx_payments_member ON public.payments(membership_id);
CREATE INDEX idx_payments_obligation ON public.payments(obligation_id);
CREATE INDEX idx_payments_recorded_at ON public.payments(recorded_at);
CREATE INDEX idx_payments_method ON public.payments(payment_method);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.contribution_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- CONTRIBUTION TYPES: viewable by group members
CREATE POLICY "Contribution types viewable by group members"
  ON public.contribution_types FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE group_id = contribution_types.group_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Group admins can manage contribution types"
  ON public.contribution_types FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE group_id = contribution_types.group_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Group admins can update contribution types"
  ON public.contribution_types FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE group_id = contribution_types.group_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Group admins can delete contribution types"
  ON public.contribution_types FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE group_id = contribution_types.group_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- OBLIGATIONS: viewable by group members, own obligations always visible
CREATE POLICY "Obligations viewable by group members"
  ON public.contribution_obligations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE group_id = contribution_obligations.group_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Group admins can manage obligations"
  ON public.contribution_obligations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE group_id = contribution_obligations.group_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Group admins can update obligations"
  ON public.contribution_obligations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE group_id = contribution_obligations.group_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- PAYMENTS: viewable by group members
CREATE POLICY "Payments viewable by group members"
  ON public.payments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE group_id = payments.group_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Group admins and treasurers can record payments"
  ON public.payments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE group_id = payments.group_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Group admins can update payments"
  ON public.payments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE group_id = payments.group_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );
