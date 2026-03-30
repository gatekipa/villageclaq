-- ============================================================
-- 00032: Loans Module — Full Build
-- ============================================================
-- Creates: loan_configs, loans, loan_schedule, loan_repayments (new)
-- Preserves: loan_requests, loan_repayments (legacy) renamed to _v1
-- All RLS uses IN (SELECT get_user_group_ids()) pattern
-- All tables get GRANT ALL TO authenticated
-- ============================================================

-- ─── Rename legacy tables ───────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.loan_repayments RENAME TO loan_repayments_v1;
ALTER TABLE IF EXISTS public.loan_requests RENAME TO loan_requests_v1;

-- Rename legacy indexes to avoid conflicts
ALTER INDEX IF EXISTS idx_loan_requests_group RENAME TO idx_loan_requests_v1_group;
ALTER INDEX IF EXISTS idx_loan_requests_member RENAME TO idx_loan_requests_v1_member;
ALTER INDEX IF EXISTS idx_loan_repayments_loan RENAME TO idx_loan_repayments_v1_loan;

-- ─── Table: loan_configs ────────────────────────────────────────────────────
CREATE TABLE public.loan_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE UNIQUE,
  max_loan_amount NUMERIC(12, 2) NOT NULL DEFAULT 500000,
  max_loan_multiplier NUMERIC(4, 2) NOT NULL DEFAULT 3.0,
  min_membership_months INTEGER NOT NULL DEFAULT 6,
  interest_rate_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  max_repayment_months INTEGER NOT NULL DEFAULT 12,
  require_guarantor BOOLEAN NOT NULL DEFAULT true,
  max_active_loans_per_member INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Table: loans ───────────────────────────────────────────────────────────
CREATE TABLE public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  guarantor_membership_id UUID REFERENCES public.memberships(id) ON DELETE SET NULL,
  amount_requested NUMERIC(12, 2) NOT NULL CHECK (amount_requested > 0),
  amount_approved NUMERIC(12, 2),
  interest_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  total_repayable NUMERIC(12, 2),
  total_repaid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  purpose TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'disbursed', 'repaying', 'completed', 'defaulted', 'written_off')),
  admin_override BOOLEAN NOT NULL DEFAULT false,
  guarantor_bypassed BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  denial_reason TEXT,
  disbursed_at TIMESTAMPTZ,
  disbursement_method TEXT,
  disbursement_reference TEXT,
  completed_at TIMESTAMPTZ,
  currency TEXT NOT NULL DEFAULT 'XAF',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Table: loan_schedule ───────────────────────────────────────────────────
CREATE TABLE public.loan_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  amount_due NUMERIC(12, 2) NOT NULL,
  amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'partial', 'overdue')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(loan_id, installment_number)
);

-- ─── Table: loan_repayments ─────────────────────────────────────────────────
CREATE TABLE public.loan_repayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'cash',
  reference_number TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID NOT NULL REFERENCES auth.users(id),
  notes TEXT,
  installment_number INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX idx_loans_group ON public.loans(group_id);
CREATE INDEX idx_loans_membership ON public.loans(membership_id);
CREATE INDEX idx_loans_status ON public.loans(status);
CREATE INDEX idx_loan_schedule_loan ON public.loan_schedule(loan_id);
CREATE INDEX idx_loan_schedule_due ON public.loan_schedule(due_date);
CREATE INDEX idx_loan_repayments_loan ON public.loan_repayments(loan_id);

-- ─── updated_at triggers ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_loan_configs_updated ON loan_configs;
CREATE TRIGGER trg_loan_configs_updated
  BEFORE UPDATE ON loan_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_loans_updated ON loans;
CREATE TRIGGER trg_loans_updated
  BEFORE UPDATE ON loans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_loan_schedule_updated ON loan_schedule;
CREATE TRIGGER trg_loan_schedule_updated
  BEFORE UPDATE ON loan_schedule
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── RLS: loan_configs ──────────────────────────────────────────────────────
ALTER TABLE loan_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loan_configs_select"
  ON loan_configs FOR SELECT TO authenticated
  USING (group_id IN (SELECT get_user_group_ids()));

CREATE POLICY "loan_configs_insert"
  ON loan_configs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.group_id = loan_configs.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "loan_configs_update"
  ON loan_configs FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.group_id = loan_configs.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "loan_configs_delete"
  ON loan_configs FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.group_id = loan_configs.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
    )
  );

GRANT ALL ON loan_configs TO authenticated;

-- ─── RLS: loans ─────────────────────────────────────────────────────────────
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;

-- SELECT: borrower, guarantor, or admin/owner
CREATE POLICY "loans_select"
  ON loans FOR SELECT TO authenticated
  USING (
    -- Borrower
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = loans.membership_id
        AND m.user_id = auth.uid()
    )
    OR
    -- Guarantor
    (loans.guarantor_membership_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = loans.guarantor_membership_id
        AND m.user_id = auth.uid()
    ))
    OR
    -- Admin/owner of the group
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.group_id = loans.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
    )
  );

-- INSERT: any group member (self-service) or admin/owner (quick loan)
CREATE POLICY "loans_insert"
  ON loans FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.group_id = loans.group_id
        AND m.user_id = auth.uid()
    )
  );

-- UPDATE: admin/owner only
CREATE POLICY "loans_update"
  ON loans FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.group_id = loans.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
    )
  );

-- DELETE: admin/owner only
CREATE POLICY "loans_delete"
  ON loans FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.group_id = loans.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
    )
  );

GRANT ALL ON loans TO authenticated;

-- ─── RLS: loan_schedule ─────────────────────────────────────────────────────
ALTER TABLE loan_schedule ENABLE ROW LEVEL SECURITY;

-- SELECT: borrower or admin/owner (via loan → group)
CREATE POLICY "loan_schedule_select"
  ON loan_schedule FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM loans l
      JOIN memberships m ON m.id = l.membership_id AND m.user_id = auth.uid()
      WHERE l.id = loan_schedule.loan_id
    )
    OR
    EXISTS (
      SELECT 1 FROM loans l
      JOIN memberships m ON m.group_id = l.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
      WHERE l.id = loan_schedule.loan_id
    )
  );

-- INSERT/UPDATE/DELETE: admin/owner only
CREATE POLICY "loan_schedule_insert"
  ON loan_schedule FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM loans l
      JOIN memberships m ON m.group_id = l.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
      WHERE l.id = loan_schedule.loan_id
    )
  );

CREATE POLICY "loan_schedule_update"
  ON loan_schedule FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM loans l
      JOIN memberships m ON m.group_id = l.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
      WHERE l.id = loan_schedule.loan_id
    )
  );

CREATE POLICY "loan_schedule_delete"
  ON loan_schedule FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM loans l
      JOIN memberships m ON m.group_id = l.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
      WHERE l.id = loan_schedule.loan_id
    )
  );

GRANT ALL ON loan_schedule TO authenticated;

-- ─── RLS: loan_repayments ───────────────────────────────────────────────────
ALTER TABLE loan_repayments ENABLE ROW LEVEL SECURITY;

-- SELECT: borrower or admin/owner
CREATE POLICY "loan_repayments_select"
  ON loan_repayments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM loans l
      JOIN memberships m ON m.id = l.membership_id AND m.user_id = auth.uid()
      WHERE l.id = loan_repayments.loan_id
    )
    OR
    EXISTS (
      SELECT 1 FROM loans l
      JOIN memberships m ON m.group_id = l.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
      WHERE l.id = loan_repayments.loan_id
    )
  );

-- INSERT: admin/owner only
CREATE POLICY "loan_repayments_insert"
  ON loan_repayments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM loans l
      JOIN memberships m ON m.group_id = l.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
      WHERE l.id = loan_repayments.loan_id
    )
  );

-- UPDATE/DELETE: admin/owner only
CREATE POLICY "loan_repayments_update"
  ON loan_repayments FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM loans l
      JOIN memberships m ON m.group_id = l.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
      WHERE l.id = loan_repayments.loan_id
    )
  );

CREATE POLICY "loan_repayments_delete"
  ON loan_repayments FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM loans l
      JOIN memberships m ON m.group_id = l.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
      WHERE l.id = loan_repayments.loan_id
    )
  );

GRANT ALL ON loan_repayments TO authenticated;
