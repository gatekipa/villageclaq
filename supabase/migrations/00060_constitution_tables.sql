-- ============================================================================
-- Migration 00060: Constitution tables + unique draft index
-- ============================================================================
-- PURPOSE:
--   1. Creates group_constitutions, constitution_amendments,
--      constitution_acknowledgments tables for version control (they were
--      previously created directly in the DB without a migration).
--   2. Adds a partial unique index so that at most ONE draft can exist per
--      (group_id, document_type) at a time — this prevents the 409 conflict
--      that occurred when the UPSERT used onConflict: "group_id,document_type,status"
--      against a non-existent unique constraint.
--   3. RLS policies for all three tables.
--
-- Run manually in Supabase SQL Editor.
-- ============================================================================

-- ── 1. group_constitutions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.group_constitutions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id         UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  document_type    TEXT NOT NULL DEFAULT 'Constitution',
  title            TEXT NOT NULL,
  content          TEXT NOT NULL DEFAULT '',
  version_number   INT NOT NULL DEFAULT 1,
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'published', 'archived')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique index: only one draft per group per document_type
-- This replaces the broken UPSERT onConflict: "group_id,document_type,status"
CREATE UNIQUE INDEX IF NOT EXISTS group_constitutions_draft_unique
  ON public.group_constitutions (group_id, document_type)
  WHERE status = 'draft';

-- Ensure updated_at is auto-managed
CREATE OR REPLACE FUNCTION public.set_updated_at_constitutions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_group_constitutions_updated_at ON public.group_constitutions;
CREATE TRIGGER trg_group_constitutions_updated_at
  BEFORE UPDATE ON public.group_constitutions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_constitutions();

-- RLS
ALTER TABLE public.group_constitutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rls_const_select" ON public.group_constitutions;
CREATE POLICY "rls_const_select" ON public.group_constitutions
  FOR SELECT TO authenticated
  USING (is_group_member(group_id));

DROP POLICY IF EXISTS "rls_const_insert" ON public.group_constitutions;
CREATE POLICY "rls_const_insert" ON public.group_constitutions
  FOR INSERT TO authenticated
  WITH CHECK (is_group_admin(group_id));

DROP POLICY IF EXISTS "rls_const_update" ON public.group_constitutions;
CREATE POLICY "rls_const_update" ON public.group_constitutions
  FOR UPDATE TO authenticated
  USING (is_group_admin(group_id));

DROP POLICY IF EXISTS "rls_const_delete" ON public.group_constitutions;
CREATE POLICY "rls_const_delete" ON public.group_constitutions
  FOR DELETE TO authenticated
  USING (is_group_admin(group_id));

GRANT ALL ON public.group_constitutions TO authenticated;


-- ── 2. constitution_amendments ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.constitution_amendments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id         UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  constitution_id  UUID REFERENCES public.group_constitutions(id) ON DELETE SET NULL,
  proposed_by      UUID REFERENCES public.memberships(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  section_affected TEXT,
  old_text         TEXT,
  new_text         TEXT NOT NULL,
  reason           TEXT,
  requires_vote    BOOLEAN NOT NULL DEFAULT false,
  status           TEXT NOT NULL DEFAULT 'proposed'
                     CHECK (status IN ('proposed', 'approved', 'rejected', 'applied')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_updated_at_amendments()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_constitution_amendments_updated_at ON public.constitution_amendments;
CREATE TRIGGER trg_constitution_amendments_updated_at
  BEFORE UPDATE ON public.constitution_amendments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_amendments();

ALTER TABLE public.constitution_amendments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rls_amend_select" ON public.constitution_amendments;
CREATE POLICY "rls_amend_select" ON public.constitution_amendments
  FOR SELECT TO authenticated
  USING (is_group_member(group_id));

DROP POLICY IF EXISTS "rls_amend_insert" ON public.constitution_amendments;
CREATE POLICY "rls_amend_insert" ON public.constitution_amendments
  FOR INSERT TO authenticated
  WITH CHECK (is_group_member(group_id));

DROP POLICY IF EXISTS "rls_amend_update" ON public.constitution_amendments;
CREATE POLICY "rls_amend_update" ON public.constitution_amendments
  FOR UPDATE TO authenticated
  USING (is_group_admin(group_id));

DROP POLICY IF EXISTS "rls_amend_delete" ON public.constitution_amendments;
CREATE POLICY "rls_amend_delete" ON public.constitution_amendments
  FOR DELETE TO authenticated
  USING (is_group_admin(group_id));

GRANT ALL ON public.constitution_amendments TO authenticated;


-- ── 3. constitution_acknowledgments ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.constitution_acknowledgments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  constitution_id  UUID NOT NULL REFERENCES public.group_constitutions(id) ON DELETE CASCADE,
  membership_id    UUID NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  version_number   INT NOT NULL,
  acknowledged_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (constitution_id, membership_id, version_number)
);

ALTER TABLE public.constitution_acknowledgments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rls_ack_select" ON public.constitution_acknowledgments;
CREATE POLICY "rls_ack_select" ON public.constitution_acknowledgments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_constitutions gc
      WHERE gc.id = constitution_id
        AND is_group_member(gc.group_id)
    )
  );

DROP POLICY IF EXISTS "rls_ack_insert" ON public.constitution_acknowledgments;
CREATE POLICY "rls_ack_insert" ON public.constitution_acknowledgments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.id = membership_id
        AND m.user_id = auth.uid()
    )
  );

GRANT ALL ON public.constitution_acknowledgments TO authenticated;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
