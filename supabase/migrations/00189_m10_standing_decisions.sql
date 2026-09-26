-- 00189: G-008/G-009 calculated, override, effective standing and atomic audit.

ALTER TABLE public.memberships
  ADD COLUMN calculated_standing public.membership_standing;
UPDATE public.memberships SET calculated_standing=standing WHERE calculated_standing IS NULL;
ALTER TABLE public.memberships ALTER COLUMN calculated_standing SET DEFAULT 'good';
ALTER TABLE public.memberships ALTER COLUMN calculated_standing SET NOT NULL;

CREATE TABLE public.standing_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id),
  membership_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  decision_type text NOT NULL CHECK(decision_type IN ('override','revoke')),
  override_standing public.membership_standing,
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 1000),
  effective_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_decision_id uuid REFERENCES public.standing_decisions(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL UNIQUE,
  material_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT standing_decision_membership_scope FOREIGN KEY(membership_id,group_id)
    REFERENCES public.memberships(id,group_id) ON DELETE RESTRICT,
  CONSTRAINT standing_decision_shape CHECK (
    (decision_type='override' AND override_standing IS NOT NULL AND revoked_decision_id IS NULL
      AND override_standing::text IN ('good','warning','suspended','banned'))
    OR
    (decision_type='revoke' AND override_standing IS NULL AND revoked_decision_id IS NOT NULL)
  ),
  CONSTRAINT standing_decision_expiry CHECK(expires_at IS NULL OR expires_at>effective_at)
);
CREATE INDEX standing_decisions_member_history
  ON public.standing_decisions(group_id,membership_id,created_at DESC,id DESC);
ALTER TABLE public.standing_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY standing_decisions_select ON public.standing_decisions FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.memberships self
    WHERE self.id=standing_decisions.membership_id AND self.user_id=auth.uid())
  OR public.has_group_permission(group_id,'members.manage')
);
REVOKE ALL ON public.standing_decisions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.standing_decisions TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_membership_self_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_caller uuid:=auth.uid(); v_is_admin boolean;
BEGIN
  IF current_setting('app.standing_command',true)='on'
     AND NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.membership_status IS NOT DISTINCT FROM OLD.membership_status
     AND NEW.group_id IS NOT DISTINCT FROM OLD.group_id
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND NEW.is_proxy IS NOT DISTINCT FROM OLD.is_proxy
     AND NEW.proxy_manager_id IS NOT DISTINCT FROM OLD.proxy_manager_id THEN
    RETURN NEW;
  END IF;
  IF v_caller IS NULL THEN RETURN NEW; END IF;
  IF OLD.user_id IS DISTINCT FROM v_caller THEN RETURN NEW; END IF;
  IF NEW.membership_status IS DISTINCT FROM OLD.membership_status AND NEW.membership_status<>'exited' THEN
    RAISE EXCEPTION 'membership_status_change_requires_admin' USING ERRCODE='42501';
  END IF;
  v_is_admin:=public.is_group_admin(OLD.group_id);
  IF v_is_admin THEN RETURN NEW; END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN RAISE EXCEPTION 'role_change_requires_admin' USING ERRCODE='42501'; END IF;
  IF NEW.standing IS DISTINCT FROM OLD.standing OR NEW.calculated_standing IS DISTINCT FROM OLD.calculated_standing THEN
    RAISE EXCEPTION 'standing_change_requires_admin' USING ERRCODE='42501';
  END IF;
  IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN RAISE EXCEPTION 'group_id_change_not_allowed' USING ERRCODE='42501'; END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'user_id_change_not_allowed' USING ERRCODE='42501'; END IF;
  IF NEW.is_proxy IS DISTINCT FROM OLD.is_proxy THEN RAISE EXCEPTION 'is_proxy_change_requires_admin' USING ERRCODE='42501'; END IF;
  IF NEW.proxy_manager_id IS DISTINCT FROM OLD.proxy_manager_id THEN RAISE EXCEPTION 'proxy_manager_change_requires_admin' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.prevent_membership_self_escalation() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.guard_standing_direct_write() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF current_setting('app.standing_command',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'STANDING_COMMAND_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN COALESCE(NEW,OLD);
END; $$;
REVOKE ALL ON FUNCTION public.guard_standing_direct_write() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS guard_standing_decision_direct_write ON public.standing_decisions;
CREATE TRIGGER guard_standing_decision_direct_write
 BEFORE INSERT OR UPDATE OR DELETE ON public.standing_decisions
 FOR EACH ROW EXECUTE FUNCTION public.guard_standing_direct_write();
DROP TRIGGER IF EXISTS guard_membership_standing_direct_write ON public.memberships;
CREATE TRIGGER guard_membership_standing_direct_write
 BEFORE UPDATE OF standing,calculated_standing ON public.memberships
 FOR EACH ROW WHEN (OLD.standing IS DISTINCT FROM NEW.standing OR OLD.calculated_standing IS DISTINCT FROM NEW.calculated_standing)
 EXECUTE FUNCTION public.guard_standing_direct_write();

CREATE OR REPLACE FUNCTION public.active_standing_override(p_membership_id uuid,p_at timestamptz DEFAULT now())
RETURNS public.membership_standing LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH latest_override AS (
    SELECT d.id,d.override_standing
    FROM public.standing_decisions d
    WHERE d.membership_id=p_membership_id AND d.decision_type='override'
      AND d.effective_at<=p_at AND (d.expires_at IS NULL OR d.expires_at>p_at)
      AND NOT EXISTS(SELECT 1 FROM public.standing_decisions r
        WHERE r.decision_type='revoke' AND r.revoked_decision_id=d.id AND r.effective_at<=p_at)
    ORDER BY d.effective_at DESC,d.created_at DESC,d.id DESC LIMIT 1
  ) SELECT override_standing FROM latest_override;
$$;
REVOKE ALL ON FUNCTION public.active_standing_override(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.active_standing_override(uuid,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.recalculate_membership_standing(p_membership_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_group uuid; v_status text; v_rules jsonb; v_before_calc public.membership_standing;
  v_before_effective public.membership_standing; v_calc public.membership_standing;
  v_override public.membership_standing; v_effective public.membership_standing;
  v_actor uuid:=auth.uid();
BEGIN
  SELECT m.group_id,m.membership_status,m.calculated_standing,m.standing,
         coalesce(g.settings->'standing_rules','{}'::jsonb)
    INTO v_group,v_status,v_before_calc,v_before_effective,v_rules
  FROM public.memberships m JOIN public.groups g ON g.id=m.group_id
  WHERE m.id=p_membership_id FOR UPDATE OF m;
  IF v_group IS NULL THEN RETURN; END IF;
  IF v_status NOT IN ('active','pending_approval') OR coalesce((v_rules->>'enabled')::boolean,true)=false THEN
    v_calc:=v_before_calc;
  ELSE
    v_calc:=public.compute_member_standing(p_membership_id,NULL)::public.membership_standing;
  END IF;
  v_override:=public.active_standing_override(p_membership_id,now());
  v_effective:=coalesce(v_override,v_calc);
  IF v_before_calc IS DISTINCT FROM v_calc OR v_before_effective IS DISTINCT FROM v_effective THEN
    PERFORM set_config('app.standing_command','on',true);
    UPDATE public.memberships SET calculated_standing=v_calc,standing=v_effective,
      standing_updated_at=now(),updated_at=now() WHERE id=p_membership_id;
    INSERT INTO public.group_audit_logs(group_id,actor_id,action,entity_type,entity_id,details)
    VALUES(v_group,v_actor,'member.standing_recalculated','membership',p_membership_id,
      jsonb_build_object('old_calculated',v_before_calc,'new_calculated',v_calc,
        'old_effective',v_before_effective,'new_effective',v_effective,
        'active_override',v_override,'rule_version','g008-v1'));
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.recalculate_membership_standing(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_membership_standing(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.execute_standing_decision(p_request_id uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_actor uuid:=auth.uid(); v_group uuid; v_member uuid; v_action text; v_reason text;
  v_effective timestamptz; v_expires timestamptz; v_value public.membership_standing;
  v_revoke uuid; v_active public.standing_decisions; v_bound public.governance_command_receipts;
  v_id uuid; v_result jsonb;
BEGIN
  IF jsonb_typeof(p_command)<>'object' THEN RAISE EXCEPTION 'STANDING_COMMAND_INVALID' USING ERRCODE='22023'; END IF;
  v_group:=(p_command->>'group_id')::uuid; v_member:=(p_command->>'membership_id')::uuid;
  v_action:=p_command->>'action'; v_reason:=nullif(btrim(p_command->>'reason'),'');
  v_effective:=coalesce(nullif(p_command->>'effective_at','')::timestamptz,now());
  v_expires:=nullif(p_command->>'expires_at','')::timestamptz;
  v_revoke:=nullif(p_command->>'decision_id','')::uuid;
  IF v_actor IS NULL OR v_action NOT IN ('override','revoke') OR v_reason IS NULL
     OR NOT public.has_group_permission(v_group,'members.manage')
     OR NOT EXISTS(SELECT 1 FROM public.memberships m WHERE m.id=v_member AND m.group_id=v_group) THEN
    RAISE EXCEPTION 'STANDING_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF v_action='override' THEN
    v_value:=(p_command->>'standing')::public.membership_standing;
    IF v_value::text NOT IN ('good','warning','suspended','banned') OR (v_expires IS NOT NULL AND v_expires<=v_effective) THEN
      RAISE EXCEPTION 'STANDING_OVERRIDE_INVALID' USING ERRCODE='22023';
    END IF;
  ELSE
    SELECT * INTO v_active FROM public.standing_decisions d
     WHERE d.id=v_revoke AND d.group_id=v_group AND d.membership_id=v_member AND d.decision_type='override'
       AND NOT EXISTS(SELECT 1 FROM public.standing_decisions r WHERE r.revoked_decision_id=d.id)
     FOR UPDATE;
    IF v_active.id IS NULL THEN RAISE EXCEPTION 'STANDING_OVERRIDE_NOT_ACTIVE' USING ERRCODE='55000'; END IF;
  END IF;
  v_bound:=public.bind_governance_command(p_request_id,v_group,'standing.'||v_action,p_command);
  IF v_bound.result IS NOT NULL THEN RETURN v_bound.result; END IF;
  PERFORM set_config('app.standing_command','on',true);
  INSERT INTO public.standing_decisions(group_id,membership_id,actor_id,decision_type,override_standing,
    reason,effective_at,expires_at,revoked_decision_id,request_id,material_payload)
  VALUES(v_group,v_member,v_actor,v_action,v_value,v_reason,v_effective,v_expires,v_revoke,p_request_id,p_command)
  RETURNING id INTO v_id;
  PERFORM public.recalculate_membership_standing(v_member);
  INSERT INTO public.group_audit_logs(group_id,actor_id,action,entity_type,entity_id,details)
  VALUES(v_group,v_actor,'member.standing_'||v_action,'standing_decision',v_id,
    jsonb_build_object('request_id',p_request_id,'membership_id',v_member,'standing',v_value,
      'effective_at',v_effective,'expires_at',v_expires,'revoked_decision_id',v_revoke,'reason',v_reason));
  v_result:=jsonb_build_object('request_id',p_request_id,'decision_id',v_id,'membership_id',v_member,
    'calculated_standing',(SELECT calculated_standing FROM public.memberships WHERE id=v_member),
    'effective_standing',(SELECT standing FROM public.memberships WHERE id=v_member));
  UPDATE public.governance_command_receipts SET result=v_result,completed_at=now() WHERE request_id=p_request_id;
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.execute_standing_decision(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.execute_standing_decision(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_standing_rules(p_group_id uuid,p_rules jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_actor uuid:=auth.uid(); v_changed int:=0; v_before public.membership_standing;
  v_enabled boolean; v_attendance int; v_hosting int; v_grace int; v_lookback int;
  v_factors jsonb; v_excluded jsonb; v_normalized jsonb; r record;
BEGIN
  IF v_actor IS NULL OR NOT public.has_group_permission(p_group_id,'members.manage') THEN
    RAISE EXCEPTION 'STANDING_RULES_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  v_enabled:=coalesce((p_rules->>'enabled')::boolean,true);
  v_attendance:=coalesce(nullif(p_rules->>'attendance_threshold_percent','')::int,60);
  v_hosting:=coalesce(nullif(p_rules->>'missed_hosting_threshold','')::int,2);
  v_grace:=coalesce(nullif(p_rules->>'overdue_grace_days','')::int,0);
  v_lookback:=coalesce(nullif(p_rules->>'attendance_lookback_months','')::int,12);
  IF v_attendance NOT BETWEEN 0 AND 100 OR v_hosting<0 OR v_grace<0 OR v_lookback<1 THEN
    RAISE EXCEPTION 'STANDING_RULES_INVALID' USING ERRCODE='22023';
  END IF;
  v_factors:=CASE WHEN jsonb_typeof(p_rules->'factors')='object' THEN p_rules->'factors' ELSE '{}'::jsonb END;
  v_excluded:=CASE WHEN jsonb_typeof(p_rules->'excluded_contribution_type_ids')='array' THEN p_rules->'excluded_contribution_type_ids' ELSE '[]'::jsonb END;
  v_normalized:=jsonb_build_object('enabled',v_enabled,'attendance_threshold_percent',v_attendance,
    'missed_hosting_threshold',v_hosting,'overdue_grace_days',v_grace,
    'attendance_lookback_months',v_lookback,'factors',v_factors,
    'excluded_contribution_type_ids',v_excluded,'rule_version','g008-v1');
  UPDATE public.groups SET settings=coalesce(settings,'{}'::jsonb)||jsonb_build_object('standing_rules',v_normalized),updated_at=now()
   WHERE id=p_group_id;
  FOR r IN SELECT id,standing FROM public.memberships WHERE group_id=p_group_id AND is_proxy=false AND membership_status IN ('active','pending_approval')
  LOOP
    v_before:=r.standing;
    PERFORM public.recalculate_membership_standing(r.id);
    IF (SELECT standing FROM public.memberships WHERE id=r.id) IS DISTINCT FROM v_before THEN v_changed:=v_changed+1; END IF;
  END LOOP;
  INSERT INTO public.group_audit_logs(group_id,actor_id,action,entity_type,entity_id,details)
  VALUES(p_group_id,v_actor,'standing.rules_applied','group',p_group_id,
    jsonb_build_object('rules',v_normalized,'changed',v_changed));
  RETURN jsonb_build_object('changed',v_changed,'rules',v_normalized);
END; $$;
REVOKE ALL ON FUNCTION public.apply_standing_rules(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_standing_rules(uuid,jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.compute_member_standing(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.compute_member_standing(uuid,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.effective_member_standing(p_membership_id uuid,p_at timestamptz DEFAULT now())
RETURNS public.membership_standing LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(public.active_standing_override(m.id,p_at),m.calculated_standing)
  FROM public.memberships m
  WHERE m.id=p_membership_id
    AND (m.user_id=auth.uid() OR public.has_group_permission(m.group_id,'members.manage'));
$$;
REVOKE ALL ON FUNCTION public.effective_member_standing(uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.effective_member_standing(uuid,timestamptz) TO authenticated,service_role;