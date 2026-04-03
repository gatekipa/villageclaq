-- ============================================================================
-- Migration 00049: Savings Circle Audit Fixes
-- ============================================================================
-- Fixes found during senior-level njangi/savings circle audit:
--
-- 1. Add 'partial' to savings_contribution_status enum
--    The Mark Paid dialog supports partial payments (adding to previous amount),
--    but the enum only had: pending, paid, late, defaulted.
--    Code currently maps partial → 'late' as a workaround.
--    After running this migration, update the code to use 'partial' directly.
--
-- Run this migration in Supabase SQL Editor BEFORE updating the status mapping
-- in savings-circle/page.tsx from 'late' to 'partial'.
-- ============================================================================

-- Idempotent: ALTER TYPE ... ADD VALUE IF NOT EXISTS (PG 11+)
ALTER TYPE savings_contribution_status ADD VALUE IF NOT EXISTS 'partial' AFTER 'pending';
