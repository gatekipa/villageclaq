-- Migration 00040: QA Batch A fixes
-- Bug #77: Fix memberships DELETE RLS infinite recursion
-- Bug #124: Add payment_date column to payments
-- Bug #118: Add is_flexible column to contribution_types
-- Bug #168: Add DELETE policy for payments table

-- ─── Bug #77: Fix DELETE policy recursion ───────────────────────────────────

-- Create SECURITY DEFINER helper to check admin/owner without triggering RLS recursion
CREATE OR REPLACE FUNCTION public.is_group_admin_or_owner(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE group_id = p_group_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
  );
$$;

-- Drop the recursive DELETE policy
DROP POLICY IF EXISTS "Members can leave or admins can remove members" ON public.memberships;

-- Recreate DELETE policy using SECURITY DEFINER function (no recursion)
CREATE POLICY "Members can leave or admins can remove members"
  ON public.memberships FOR DELETE
  TO authenticated
  USING (
    -- Members can delete their own membership (leave group)
    user_id = auth.uid()
    OR
    -- Group owners/admins can delete other memberships (uses SECURITY DEFINER)
    is_group_admin_or_owner(group_id)
  );

-- ─── Bug #124: Add payment_date to payments ─────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'payment_date'
  ) THEN
    ALTER TABLE public.payments
    ADD COLUMN payment_date DATE DEFAULT CURRENT_DATE;

    -- Backfill: set payment_date from recorded_at for existing records
    UPDATE public.payments SET payment_date = DATE(recorded_at) WHERE payment_date IS NULL;
  END IF;
END $$;

-- ─── Bug #118: Add is_flexible to contribution_types ─────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'contribution_types'
      AND column_name = 'is_flexible'
  ) THEN
    ALTER TABLE public.contribution_types
    ADD COLUMN is_flexible BOOLEAN DEFAULT false;
  END IF;
END $$;

-- ─── Bug #168: Add DELETE policy for payments ────────────────────────────────

-- Only admins/owners can delete payments
DROP POLICY IF EXISTS "Group admins can delete payments" ON public.payments;
CREATE POLICY "Group admins can delete payments"
  ON public.payments FOR DELETE
  TO authenticated
  USING (
    is_group_admin_or_owner(group_id)
  );

-- Also fix the UPDATE policy to use the SECURITY DEFINER helper (avoid potential recursion)
DROP POLICY IF EXISTS "Group admins can update payments" ON public.payments;
CREATE POLICY "Group admins can update payments"
  ON public.payments FOR UPDATE
  TO authenticated
  USING (
    is_group_admin_or_owner(group_id)
  );
