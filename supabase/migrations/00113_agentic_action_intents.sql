-- ============================================================================
-- 00113_agentic_action_intents.sql
-- Phase 1A — Agentic Execution OS foundation: the Action Ledger.
--
-- ██ CREATE-NOT-APPLY ██
-- This migration is version-controlled but NOT applied. Phase 1A builds the
-- schema and a NON-EXECUTING human-in-the-loop (HITL) inbox shell only; live
-- agentic execution is not approved yet. Apply this only when Phase 1B is
-- explicitly authorised. The app tolerates the table being absent: the inbox
-- page treats undefined_table (42P01) as "not yet enabled" and renders an
-- empty state rather than an error.
--
-- WHAT THIS IS:
--   action_intents is an append-oriented ledger of PROPOSED actions. Nothing
--   in this migration sends a message, mutates money, or changes standing. A
--   row is a proposal awaiting a human decision — never an instruction that
--   some worker will pick up. There is deliberately NO execution worker, NO
--   cron wiring, and NO auto-approval anywhere in Phase 1A.
--
-- SECURITY POSTURE (deliberately strict for a not-yet-approved capability):
--   * anon has no grant and no policy — cross-tenant and public reads are
--     impossible.
--   * SELECT: group owners/admins see their group's intents; holders of
--     finances.view / finances.manage see only FINANCE-CLASS intents. Ordinary
--     members read nothing here in 1A — which also means a member can never
--     read another member's intent. Member self-service visibility, if ever
--     wanted, is a deliberate later decision, not an accident of this policy.
--   * ALL direct client writes are blocked (USING false / WITH CHECK false),
--     following the 00085 platform_impersonation_sessions precedent. Trusted
--     server paths use the service-role client (which bypasses RLS) or the
--     SECURITY DEFINER RPCs below. This is why "inserts from trusted server
--     paths" keep working while no browser session can forge an intent.
--   * Status changes are audited by TRIGGER, not by caller discipline, so an
--     unaudited transition is not expressible.
--
-- VERIFICATION (after a future apply):
--   SELECT polname, polcmd, pg_get_expr(polqual, polrelid)
--   FROM pg_policy WHERE polrelid = 'public.action_intents'::regclass;
--   -- expect: rls_ai_select (r) + rls_ai_no_direct_writes (*), no anon grants.
-- ============================================================================

-- ── 1. Enum-ish domains, expressed as CHECK constraints ─────────────────────
-- CHECK over enum types: the action vocabulary will grow every phase, and
-- adding a value to a CHECK is a cheap ALTER, whereas ALTER TYPE ... ADD VALUE
-- cannot run inside a transaction with other DDL.

CREATE TABLE IF NOT EXISTS public.action_intents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id           uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  target_member_id   uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  target_user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Why the agent proposed this: rule ids, observed figures, source rows.
  trigger_context    jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_action    text NOT NULL,
  -- What WOULD be done on approval. Never executed in Phase 1A.
  action_payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_score   numeric,

  status             text NOT NULL DEFAULT 'pending',
  priority           text NOT NULL DEFAULT 'normal',
  -- Provenance: which producer proposed this (e.g. 'rules.dues_v1').
  source             text NOT NULL,
  -- Dedup guard so a re-run of a producer cannot double-propose.
  idempotency_key    text,
  audit_trail_id     uuid REFERENCES public.group_audit_logs(id) ON DELETE SET NULL,

  approved_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at        timestamptz,
  rejected_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at        timestamptz,
  executed_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  executed_at        timestamptz,
  execution_result   jsonb,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT action_intents_status_check CHECK (
    status = ANY (ARRAY['pending', 'approved', 'rejected', 'executed', 'cancelled', 'failed'])
  ),
  CONSTRAINT action_intents_priority_check CHECK (
    priority = ANY (ARRAY['low', 'normal', 'high', 'urgent'])
  ),
  CONSTRAINT action_intents_proposed_action_check CHECK (
    proposed_action = ANY (ARRAY[
      'payment_reminder',
      'receipt_review',
      'standing_change_notice',
      'relief_followup',
      'savings_round_advance',
      'attendance_followup',
      'announcement_draft'
    ])
  ),
  -- Scores are probabilities. A NULL means "producer did not score it".
  CONSTRAINT action_intents_confidence_range_check CHECK (
    confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)
  ),
  -- Terminal states must carry their actor/time; pending rows must not.
  CONSTRAINT action_intents_approved_pair_check CHECK (
    (approved_by IS NULL) = (approved_at IS NULL)
  ),
  CONSTRAINT action_intents_rejected_pair_check CHECK (
    (rejected_by IS NULL) = (rejected_at IS NULL)
  ),
  CONSTRAINT action_intents_executed_pair_check CHECK (
    (executed_by IS NULL) = (executed_at IS NULL)
  ),
  -- An executed intent must have been approved first. Encoded here so no
  -- future worker can skip the human step by writing 'executed' directly.
  CONSTRAINT action_intents_execute_requires_approval_check CHECK (
    status <> 'executed' OR approved_at IS NOT NULL
  )
);

-- ── 2. Indexes ──────────────────────────────────────────────────────────────
-- The inbox lists one group's pending intents newest-first; that is the only
-- hot path in Phase 1A.
CREATE INDEX IF NOT EXISTS idx_action_intents_group_status_created
  ON public.action_intents(group_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_intents_pending
  ON public.action_intents(group_id, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_action_intents_target_member
  ON public.action_intents(target_member_id)
  WHERE target_member_id IS NOT NULL;

-- Idempotency is per group + action type: the same producer re-running must
-- not create a second proposal for the same underlying fact.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_action_intents_idempotency
  ON public.action_intents(group_id, proposed_action, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── 3. updated_at ───────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS update_action_intents_updated_at ON public.action_intents;
CREATE TRIGGER update_action_intents_updated_at
  BEFORE UPDATE ON public.action_intents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── 4. Finance classification helper ────────────────────────────────────────
-- Which action classes a treasurer-style permission may read. Kept as a
-- function so the RLS policy and the app agree on one definition.
CREATE OR REPLACE FUNCTION public.action_intent_is_financial(p_action text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_action = ANY (ARRAY[
    'payment_reminder',
    'receipt_review',
    'relief_followup',
    'savings_round_advance'
  ]);
$$;

REVOKE ALL ON FUNCTION public.action_intent_is_financial(text) FROM PUBLIC, anon;
-- authenticated needs EXECUTE: the RLS policy below calls it as the querying user.
GRANT EXECUTE ON FUNCTION public.action_intent_is_financial(text) TO authenticated;

-- ── 5. Audit trigger — every status change writes group_audit_logs ──────────
-- Auditing lives in a trigger rather than in callers so that no write path,
-- including a future service-role worker, can produce an unaudited status
-- change. Mirrors the defensive EXCEPTION wrapper used by 00101 so an audit
-- failure can never roll back the ledger write itself.
CREATE OR REPLACE FUNCTION public.action_intents_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'action_intent.created';
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := 'action_intent.' || NEW.status;
  ELSE
    RETURN NEW;  -- non-status update: nothing to audit
  END IF;

  BEGIN
    INSERT INTO group_audit_logs (group_id, actor_id, action, entity_type, entity_id, details)
    VALUES (
      NEW.group_id,
      auth.uid(),
      v_action,
      'action_intent',
      NEW.id,
      jsonb_build_object(
        'proposedAction', NEW.proposed_action,
        'status', NEW.status,
        'priority', NEW.priority,
        'source', NEW.source,
        'targetMembershipId', NEW.target_member_id,
        'confidenceScore', NEW.confidence_score
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- never let audit failure block or roll back the ledger write
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS action_intents_audit_trigger ON public.action_intents;
CREATE TRIGGER action_intents_audit_trigger
  AFTER INSERT OR UPDATE ON public.action_intents
  FOR EACH ROW EXECUTE FUNCTION public.action_intents_audit();

-- ── 6. Row Level Security ───────────────────────────────────────────────────
ALTER TABLE public.action_intents ENABLE ROW LEVEL SECURITY;

-- Read: admins/owners see their group's intents; finance-permission holders
-- see only finance-class intents. get_user_group_ids() is a cheap tenant
-- prefilter; the per-row authority check follows it.
DROP POLICY IF EXISTS "rls_ai_select" ON public.action_intents;
CREATE POLICY "rls_ai_select"
  ON public.action_intents FOR SELECT
  TO authenticated
  USING (
    group_id IN (SELECT public.get_user_group_ids())
    AND (
      public.is_group_admin(group_id)
      OR (
        public.action_intent_is_financial(proposed_action)
        AND (
          public.has_group_permission(group_id, 'finances.view')
          OR public.has_group_permission(group_id, 'finances.manage')
        )
      )
    )
  );

-- Write: no direct client writes at all. Producers use the service-role client
-- (bypasses RLS); human decisions go through the SECURITY DEFINER RPCs below,
-- which re-check permissions server-side. Permissive policies OR together, so
-- this blocks INSERT/UPDATE/DELETE while leaving the SELECT policy intact.
DROP POLICY IF EXISTS "rls_ai_no_direct_writes" ON public.action_intents;
CREATE POLICY "rls_ai_no_direct_writes"
  ON public.action_intents FOR ALL
  TO authenticated
  USING (false) WITH CHECK (false);

-- anon is never granted; authenticated gets SELECT only (writes are still
-- blocked by policy, but the grant is narrowed too — defence in depth).
REVOKE ALL ON public.action_intents FROM PUBLIC, anon;
GRANT SELECT ON public.action_intents TO authenticated;
GRANT ALL ON public.action_intents TO service_role;

-- ── 7. Human decision RPCs — approve / reject ONLY ──────────────────────────
-- These record a HUMAN decision. Neither sends anything, mutates money, or
-- changes standing; neither can set 'executed'. Execution is Phase 1B and will
-- be a separate, separately-approved function.
CREATE OR REPLACE FUNCTION public.approve_action_intent(p_intent_id uuid, p_note text DEFAULT NULL)
RETURNS public.action_intents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_intent public.action_intents;
BEGIN
  SELECT * INTO v_intent FROM action_intents WHERE id = p_intent_id;
  IF v_intent.id IS NULL THEN
    RAISE EXCEPTION 'action intent not found';
  END IF;

  IF NOT (
    is_group_admin(v_intent.group_id)
    OR has_group_permission(v_intent.group_id, 'finances.manage')
  ) THEN
    RAISE EXCEPTION 'not authorised to approve action intents for this group';
  END IF;

  IF v_intent.status <> 'pending' THEN
    RAISE EXCEPTION 'only pending intents can be approved (current: %)', v_intent.status;
  END IF;

  UPDATE action_intents
     SET status = 'approved',
         approved_by = auth.uid(),
         approved_at = now(),
         trigger_context = CASE
           WHEN p_note IS NULL THEN trigger_context
           ELSE trigger_context || jsonb_build_object('approvalNote', p_note)
         END
   WHERE id = p_intent_id
   RETURNING * INTO v_intent;

  -- Approval marks intent only. Nothing is dispatched here, by design.
  RETURN v_intent;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_action_intent(p_intent_id uuid, p_note text DEFAULT NULL)
RETURNS public.action_intents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_intent public.action_intents;
BEGIN
  SELECT * INTO v_intent FROM action_intents WHERE id = p_intent_id;
  IF v_intent.id IS NULL THEN
    RAISE EXCEPTION 'action intent not found';
  END IF;

  IF NOT (
    is_group_admin(v_intent.group_id)
    OR has_group_permission(v_intent.group_id, 'finances.manage')
  ) THEN
    RAISE EXCEPTION 'not authorised to reject action intents for this group';
  END IF;

  IF v_intent.status <> 'pending' THEN
    RAISE EXCEPTION 'only pending intents can be rejected (current: %)', v_intent.status;
  END IF;

  UPDATE action_intents
     SET status = 'rejected',
         rejected_by = auth.uid(),
         rejected_at = now(),
         trigger_context = CASE
           WHEN p_note IS NULL THEN trigger_context
           ELSE trigger_context || jsonb_build_object('rejectionNote', p_note)
         END
   WHERE id = p_intent_id
   RETURNING * INTO v_intent;

  RETURN v_intent;
END;
$$;

-- Deliberately NOT granted to authenticated in Phase 1A: the inbox is
-- read-only and its decision buttons are disabled. Grant these in 1B, in the
-- same change that ships the reviewed approval UI.
-- REVOKE from PUBLIC too: Supabase's pg_default_acl auto-grants EXECUTE to
-- PUBLIC/anon on newly created functions, so revoking only the named roles
-- would leave the default grant in place (the load-bearing lesson from 00111).
REVOKE ALL ON FUNCTION public.approve_action_intent(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_action_intent(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_action_intent(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_action_intent(uuid, text) TO service_role;
