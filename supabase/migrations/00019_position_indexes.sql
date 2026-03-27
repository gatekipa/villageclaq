-- Indexes for position_assignments and position_permissions tables
-- These improve query performance for permission checks and position lookups.

CREATE INDEX IF NOT EXISTS idx_position_assignments_membership_id
  ON public.position_assignments(membership_id);

CREATE INDEX IF NOT EXISTS idx_position_assignments_position_id
  ON public.position_assignments(position_id);

CREATE INDEX IF NOT EXISTS idx_position_permissions_position_id
  ON public.position_permissions(position_id);
