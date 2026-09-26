-- H-001–H-005: organization units, history, closure, scoped grants and person identity.
-- Existing operational groups stay the financial owner; aggregate nodes have no
-- group_id and cannot be passed to any group-scoped financial command.
BEGIN;
CREATE TABLE public.organization_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  group_id uuid UNIQUE REFERENCES public.groups(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  parent_id uuid,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,organization_id),
  FOREIGN KEY (parent_id,organization_id)
    REFERENCES public.organization_units(id,organization_id) ON DELETE RESTRICT,
  CHECK (parent_id IS DISTINCT FROM id)
);
CREATE UNIQUE INDEX organization_one_root
  ON public.organization_units(organization_id) WHERE parent_id IS NULL;
CREATE INDEX organization_units_parent ON public.organization_units(parent_id);
CREATE TABLE public.organization_unit_parent_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  unit_id uuid NOT NULL,
  parent_id uuid,
  effective_from timestamptz NOT NULL DEFAULT clock_timestamp(),
  effective_to timestamptz,
  moved_by uuid REFERENCES public.profiles(id),
  reason text,
  FOREIGN KEY (unit_id,organization_id)
    REFERENCES public.organization_units(id,organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (parent_id,organization_id)
    REFERENCES public.organization_units(id,organization_id) ON DELETE RESTRICT,
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE UNIQUE INDEX organization_unit_one_current_parent
  ON public.organization_unit_parent_history(unit_id) WHERE effective_to IS NULL;
CREATE TABLE public.organization_unit_closure (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  ancestor_id uuid NOT NULL,
  descendant_id uuid NOT NULL,
  depth integer NOT NULL CHECK (depth BETWEEN 0 AND 32),
  PRIMARY KEY (ancestor_id,descendant_id),
  FOREIGN KEY (ancestor_id,organization_id)
    REFERENCES public.organization_units(id,organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (descendant_id,organization_id)
    REFERENCES public.organization_units(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX organization_closure_descendant
  ON public.organization_unit_closure(descendant_id,depth);
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS topology_version bigint NOT NULL DEFAULT 1;
CREATE TABLE public.organization_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  identity_verified_at timestamptz,
  identity_verified_by uuid REFERENCES public.profiles(id),
  UNIQUE (organization_id,user_id),
  UNIQUE (id,organization_id)
);
CREATE TABLE public.organization_scoped_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  unit_id uuid NOT NULL,
  capability text NOT NULL CHECK (capability IN
    ('hierarchy.manage','elections.manage','reports.view')),
  scope_mode text NOT NULL CHECK (scope_mode IN ('unit','subtree','organization')),
  granted_by uuid REFERENCES public.profiles(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  FOREIGN KEY (unit_id,organization_id)
    REFERENCES public.organization_units(id,organization_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX organization_active_scoped_grant
  ON public.organization_scoped_grants(user_id,unit_id,capability,scope_mode)
  WHERE revoked_at IS NULL;
CREATE TABLE public.organization_hierarchy_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  unit_id uuid NOT NULL REFERENCES public.organization_units(id) ON DELETE RESTRICT,
  old_parent_id uuid,
  new_parent_id uuid,
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  topology_version bigint NOT NULL,
  reason text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organization_hierarchy_audit
  ADD COLUMN action text NOT NULL DEFAULT 'move'
    CHECK (action IN ('move','archive'));

-- A single existing group is the standalone root. Existing HQs are roots
-- where one is present; otherwise a multi-group organization gets an
-- aggregate-only root rather than guessing which group owns the hierarchy.
INSERT INTO public.organization_units(organization_id,group_id,name)
SELECT o.id,
  CASE WHEN counts.n=1 THEN counts.only_group
       ELSE counts.hq_group END,
  o.name
FROM public.organizations o
CROSS JOIN LATERAL (
  SELECT count(*) n, (array_agg(g.id ORDER BY g.created_at,g.id))[1] only_group,
    (SELECT h.id FROM public.groups h WHERE h.organization_id=o.id
       AND h.group_level='hq' ORDER BY h.created_at,h.id LIMIT 1) hq_group
  FROM public.groups g WHERE g.organization_id=o.id
) counts;
INSERT INTO public.organization_units(organization_id,group_id,name,parent_id)
SELECT g.organization_id,g.id,g.name,r.id
FROM public.groups g
JOIN public.organization_units r ON r.organization_id=g.organization_id
  AND r.parent_id IS NULL
WHERE g.id IS DISTINCT FROM r.group_id;
INSERT INTO public.organization_unit_parent_history
  (organization_id,unit_id,parent_id,reason)
SELECT organization_id,id,parent_id,'S0/M2 hierarchy bootstrap'
FROM public.organization_units;
WITH RECURSIVE paths AS (
  SELECT u.organization_id,u.id ancestor_id,u.id descendant_id,0 depth
  FROM public.organization_units u
  UNION ALL
  SELECT p.organization_id,p.ancestor_id,c.id,p.depth+1
  FROM paths p JOIN public.organization_units c ON c.parent_id=p.descendant_id
  WHERE p.depth<32
)
INSERT INTO public.organization_unit_closure
  (organization_id,ancestor_id,descendant_id,depth)
SELECT organization_id,ancestor_id,descendant_id,depth FROM paths;
INSERT INTO public.organization_people(organization_id,user_id)
SELECT DISTINCT g.organization_id,m.user_id
FROM public.memberships m JOIN public.groups g ON g.id=m.group_id
WHERE g.organization_id IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO public.organization_scoped_grants
  (organization_id,user_id,unit_id,capability,scope_mode,granted_by)
SELECT DISTINCT r.organization_id,m.user_id,r.id,c.capability,
  'organization',m.user_id
FROM public.organization_units r
JOIN public.organizations o ON o.id=r.organization_id
JOIN public.groups g ON g.organization_id=r.organization_id
JOIN public.memberships m ON m.group_id=g.id
CROSS JOIN (VALUES ('hierarchy.manage'),('elections.manage'),
                   ('reports.view')) c(capability)
WHERE r.parent_id IS NULL AND m.role='owner'
  AND m.membership_status='active'
  AND (o.owner_id=m.user_id OR r.group_id=g.id)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_organization_scope(
  p_unit uuid,p_target uuid,p_capability text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_scoped_grants grant_row
    JOIN public.organization_units root ON root.id=grant_row.unit_id
    JOIN public.organization_units target ON target.id=p_target
      AND target.organization_id=root.organization_id
    WHERE grant_row.user_id=auth.uid() AND grant_row.revoked_at IS NULL
      AND grant_row.unit_id=p_unit AND grant_row.capability=p_capability
      AND root.archived_at IS NULL AND target.archived_at IS NULL
      AND EXISTS (
        SELECT 1 FROM public.memberships m
        JOIN public.groups g ON g.id=m.group_id
        WHERE g.organization_id=root.organization_id
          AND m.user_id=auth.uid() AND m.membership_status='active')
      AND (grant_row.scope_mode='organization'
        OR (grant_row.scope_mode='unit' AND target.id=root.id)
        OR (grant_row.scope_mode='subtree' AND EXISTS (
          SELECT 1 FROM public.organization_unit_closure c
          WHERE c.ancestor_id=root.id AND c.descendant_id=target.id)))
  );
$$;
REVOKE ALL ON FUNCTION public.has_organization_scope(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_organization_scope(uuid,uuid,text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.has_any_organization_scope(
  p_target uuid,p_capability text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_scoped_grants g
    WHERE g.user_id=auth.uid() AND g.revoked_at IS NULL
      AND g.capability=p_capability
      AND public.has_organization_scope(g.unit_id,p_target,p_capability));
$$;
REVOKE ALL ON FUNCTION public.has_any_organization_scope(uuid,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_any_organization_scope(uuid,text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.move_organization_unit(
  p_unit uuid,p_new_parent uuid,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_unit public.organization_units%ROWTYPE;
  v_parent public.organization_units%ROWTYPE;
  v_root uuid; v_max_depth integer; v_parent_depth integer;
  v_version bigint;
BEGIN
  SELECT * INTO v_unit FROM public.organization_units WHERE id=p_unit;
  IF v_unit.id IS NULL OR v_unit.parent_id IS NULL
    OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 8 AND 500
  THEN RAISE EXCEPTION 'INVALID_MOVE'; END IF;
  PERFORM 1 FROM public.organizations WHERE id=v_unit.organization_id FOR UPDATE;
  SELECT * INTO v_parent FROM public.organization_units WHERE id=p_new_parent;
  IF v_parent.id IS NULL OR v_parent.organization_id<>v_unit.organization_id
    OR v_parent.archived_at IS NOT NULL OR v_unit.archived_at IS NOT NULL
  THEN RAISE EXCEPTION 'CROSS_ORGANIZATION_OR_ARCHIVED'; END IF;
  SELECT id INTO v_root FROM public.organization_units
    WHERE organization_id=v_unit.organization_id AND parent_id IS NULL;
  IF NOT public.has_any_organization_scope(v_unit.id,'hierarchy.manage')
    OR NOT public.has_any_organization_scope(v_parent.id,'hierarchy.manage')
  THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.organization_unit_closure
    WHERE ancestor_id=p_unit AND descendant_id=p_new_parent)
  THEN RAISE EXCEPTION 'HIERARCHY_CYCLE'; END IF;
  SELECT max(depth) INTO v_max_depth FROM public.organization_unit_closure
    WHERE ancestor_id=p_unit;
  SELECT depth INTO v_parent_depth FROM public.organization_unit_closure
    WHERE ancestor_id=v_root AND descendant_id=p_new_parent;
  IF v_parent_depth+1+v_max_depth>32
  THEN RAISE EXCEPTION 'HIERARCHY_DEPTH'; END IF;
  IF v_unit.parent_id=p_new_parent
  THEN RETURN jsonb_build_object('moved',false,'unit_id',p_unit); END IF;
  UPDATE public.organization_unit_parent_history
    SET effective_to=clock_timestamp()
    WHERE unit_id=p_unit AND effective_to IS NULL;
  UPDATE public.organization_units SET parent_id=p_new_parent WHERE id=p_unit;
  INSERT INTO public.organization_unit_parent_history
    (organization_id,unit_id,parent_id,moved_by,reason)
  VALUES(v_unit.organization_id,p_unit,p_new_parent,auth.uid(),trim(p_reason));
  DELETE FROM public.organization_unit_closure
    WHERE organization_id=v_unit.organization_id;
  WITH RECURSIVE paths AS (
    SELECT u.organization_id,u.id ancestor_id,u.id descendant_id,0 depth
    FROM public.organization_units u WHERE u.organization_id=v_unit.organization_id
      AND u.archived_at IS NULL
    UNION ALL
    SELECT p.organization_id,p.ancestor_id,c.id,p.depth+1
    FROM paths p JOIN public.organization_units c ON c.parent_id=p.descendant_id
    WHERE p.depth<32 AND c.archived_at IS NULL
  )
  INSERT INTO public.organization_unit_closure
    (organization_id,ancestor_id,descendant_id,depth)
  SELECT organization_id,ancestor_id,descendant_id,depth FROM paths;
  UPDATE public.organizations SET topology_version=topology_version+1
    WHERE id=v_unit.organization_id RETURNING topology_version INTO v_version;
  INSERT INTO public.organization_hierarchy_audit
    (organization_id,unit_id,old_parent_id,new_parent_id,actor_id,
     topology_version,reason)
  VALUES(v_unit.organization_id,p_unit,v_unit.parent_id,p_new_parent,
    auth.uid(),v_version,trim(p_reason));
  RETURN jsonb_build_object('moved',true,'topology_version',v_version);
END
$$;
REVOKE ALL ON FUNCTION public.move_organization_unit(uuid,uuid,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.move_organization_unit(uuid,uuid,text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_organization_unit(
  p_unit uuid,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_unit public.organization_units%ROWTYPE; v_version bigint;
BEGIN
  SELECT * INTO v_unit FROM public.organization_units WHERE id=p_unit;
  IF v_unit.id IS NULL OR v_unit.parent_id IS NULL
    OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 8 AND 500
    THEN RAISE EXCEPTION 'INVALID_ARCHIVE'; END IF;
  PERFORM 1 FROM public.organizations WHERE id=v_unit.organization_id FOR UPDATE;
  SELECT * INTO v_unit FROM public.organization_units WHERE id=p_unit FOR UPDATE;
  IF NOT public.has_any_organization_scope(p_unit,'hierarchy.manage')
    THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  IF v_unit.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object('archived',false,'unit_id',p_unit); END IF;
  IF EXISTS (SELECT 1 FROM public.organization_units c
      WHERE c.parent_id=p_unit AND c.archived_at IS NULL)
    OR EXISTS (SELECT 1 FROM public.groups g
      WHERE g.id=v_unit.group_id AND g.status='active')
    THEN RAISE EXCEPTION 'ARCHIVE_ACTIVE_UNIT_OR_CHILDREN'; END IF;
  UPDATE public.organization_units SET archived_at=now() WHERE id=p_unit;
  DELETE FROM public.organization_unit_closure WHERE descendant_id=p_unit;
  UPDATE public.organizations SET topology_version=topology_version+1
    WHERE id=v_unit.organization_id RETURNING topology_version INTO v_version;
  INSERT INTO public.organization_hierarchy_audit
    (organization_id,unit_id,old_parent_id,new_parent_id,actor_id,
     topology_version,reason,action)
  VALUES(v_unit.organization_id,p_unit,v_unit.parent_id,v_unit.parent_id,
    auth.uid(),v_version,trim(p_reason),'archive');
  RETURN jsonb_build_object('archived',true,'topology_version',v_version);
END
$$;
REVOKE ALL ON FUNCTION public.archive_organization_unit(uuid,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.archive_organization_unit(uuid,text)
  TO authenticated;

ALTER TABLE public.organization_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_unit_parent_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_unit_closure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_scoped_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_hierarchy_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_units,public.organization_unit_parent_history,
 public.organization_unit_closure,public.organization_people,
 public.organization_scoped_grants,public.organization_hierarchy_audit
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.organization_units,public.organization_unit_parent_history,
 public.organization_unit_closure TO authenticated;
GRANT SELECT ON public.organization_scoped_grants TO authenticated;
CREATE POLICY units_active_member ON public.organization_units
 FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.groups g JOIN public.memberships m ON m.group_id=g.id
  WHERE g.organization_id=organization_units.organization_id
    AND m.user_id=auth.uid() AND m.membership_status='active'));
CREATE POLICY history_active_member ON public.organization_unit_parent_history
 FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.groups g JOIN public.memberships m ON m.group_id=g.id
  WHERE g.organization_id=organization_unit_parent_history.organization_id
    AND m.user_id=auth.uid() AND m.membership_status='active'));
CREATE POLICY closure_active_member ON public.organization_unit_closure
 FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.groups g JOIN public.memberships m ON m.group_id=g.id
  WHERE g.organization_id=organization_unit_closure.organization_id
    AND m.user_id=auth.uid() AND m.membership_status='active'));
CREATE POLICY grants_own ON public.organization_scoped_grants
 FOR SELECT TO authenticated USING (user_id=auth.uid());

CREATE OR REPLACE FUNCTION public.hierarchy_after_group_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_root uuid; v_unit uuid;
BEGIN
  IF new.organization_id IS NULL THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'ORGANIZATION_REQUIRED';
    END IF;
    RETURN new;
  END IF;
  PERFORM 1 FROM public.organizations WHERE id=new.organization_id FOR UPDATE;
  SELECT id INTO v_root FROM public.organization_units
    WHERE organization_id=new.organization_id AND parent_id IS NULL;
  IF auth.uid() IS NOT NULL AND (
    (v_root IS NULL AND NOT EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id=new.organization_id
        AND (o.owner_id=auth.uid() OR o.created_by=auth.uid())))
    OR (v_root IS NOT NULL AND NOT public.has_any_organization_scope(
      v_root,'hierarchy.manage')))
  THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  INSERT INTO public.organization_units(organization_id,group_id,name,parent_id)
  VALUES(new.organization_id,new.id,new.name,v_root) RETURNING id INTO v_unit;
  INSERT INTO public.organization_unit_parent_history
    (organization_id,unit_id,parent_id,reason)
  VALUES(new.organization_id,v_unit,v_root,'Operational group created');
  INSERT INTO public.organization_unit_closure
    (organization_id,ancestor_id,descendant_id,depth)
  VALUES(new.organization_id,v_unit,v_unit,0);
  IF v_root IS NOT NULL THEN
    INSERT INTO public.organization_unit_closure
      (organization_id,ancestor_id,descendant_id,depth)
    SELECT new.organization_id,c.ancestor_id,v_unit,c.depth+1
    FROM public.organization_unit_closure c WHERE c.descendant_id=v_root;
  END IF;
  UPDATE public.organizations SET topology_version=topology_version+1
    WHERE id=new.organization_id;
  RETURN new;
END
$$;
CREATE TRIGGER hierarchy_group_created AFTER INSERT ON public.groups
 FOR EACH ROW EXECUTE FUNCTION public.hierarchy_after_group_insert();

CREATE OR REPLACE FUNCTION public.hierarchy_guard_group_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF old.organization_id IS DISTINCT FROM new.organization_id
  THEN RAISE EXCEPTION 'GROUP_ORGANIZATION_IMMUTABLE'; END IF;
  IF old.name IS DISTINCT FROM new.name THEN
    UPDATE public.organization_units SET name=new.name
      WHERE group_id=new.id;
  END IF;
  RETURN new;
END
$$;
CREATE TRIGGER hierarchy_group_changed AFTER UPDATE OF organization_id,name
 ON public.groups FOR EACH ROW EXECUTE FUNCTION public.hierarchy_guard_group_change();

CREATE OR REPLACE FUNCTION public.create_aggregate_unit(
  p_parent uuid,p_name text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_parent public.organization_units%ROWTYPE;
  v_root uuid; v_depth integer; v_unit uuid; v_version bigint;
BEGIN
  SELECT * INTO v_parent FROM public.organization_units WHERE id=p_parent;
  IF v_parent.id IS NULL OR v_parent.archived_at IS NOT NULL
    OR length(trim(coalesce(p_name,''))) NOT BETWEEN 1 AND 120
  THEN RAISE EXCEPTION 'INVALID_UNIT'; END IF;
  PERFORM 1 FROM public.organizations
    WHERE id=v_parent.organization_id FOR UPDATE;
  SELECT id INTO v_root FROM public.organization_units
    WHERE organization_id=v_parent.organization_id AND parent_id IS NULL;
  IF NOT public.has_any_organization_scope(p_parent,'hierarchy.manage')
  THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  SELECT depth INTO v_depth FROM public.organization_unit_closure
    WHERE ancestor_id=v_root AND descendant_id=p_parent;
  IF v_depth IS NULL OR v_depth>=32
  THEN RAISE EXCEPTION 'HIERARCHY_DEPTH'; END IF;
  INSERT INTO public.organization_units(organization_id,name,parent_id)
    VALUES(v_parent.organization_id,trim(p_name),p_parent)
    RETURNING id INTO v_unit;
  INSERT INTO public.organization_unit_parent_history
    (organization_id,unit_id,parent_id,moved_by,reason)
    VALUES(v_parent.organization_id,v_unit,p_parent,auth.uid(),
           'Aggregate scope created');
  INSERT INTO public.organization_unit_closure
    (organization_id,ancestor_id,descendant_id,depth)
    VALUES(v_parent.organization_id,v_unit,v_unit,0);
  INSERT INTO public.organization_unit_closure
    (organization_id,ancestor_id,descendant_id,depth)
    SELECT v_parent.organization_id,c.ancestor_id,v_unit,c.depth+1
    FROM public.organization_unit_closure c WHERE c.descendant_id=p_parent;
  UPDATE public.organizations SET topology_version=topology_version+1
    WHERE id=v_parent.organization_id RETURNING topology_version INTO v_version;
  INSERT INTO public.organization_hierarchy_audit
    (organization_id,unit_id,new_parent_id,actor_id,topology_version,reason)
    VALUES(v_parent.organization_id,v_unit,p_parent,auth.uid(),v_version,
           'Aggregate scope created');
  RETURN v_unit;
END
$$;
REVOKE ALL ON FUNCTION public.create_aggregate_unit(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_aggregate_unit(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.hierarchy_after_membership_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_root uuid; v_root_group uuid; v_org_owner uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.groups WHERE id=new.group_id;
  IF v_org IS NULL THEN RETURN new; END IF;
  INSERT INTO public.organization_people(organization_id,user_id)
    VALUES(v_org,new.user_id) ON CONFLICT DO NOTHING;
  SELECT id,group_id INTO v_root,v_root_group FROM public.organization_units
    WHERE organization_id=v_org AND parent_id IS NULL;
  SELECT owner_id INTO v_org_owner FROM public.organizations WHERE id=v_org;
  IF new.role='owner' AND new.membership_status='active'
    AND (new.user_id=v_org_owner OR new.group_id=v_root_group) THEN
    INSERT INTO public.organization_scoped_grants
      (organization_id,user_id,unit_id,capability,scope_mode,granted_by)
    SELECT v_org,new.user_id,v_root,c.capability,'organization',new.user_id
    FROM (VALUES ('hierarchy.manage'),('elections.manage'),
                 ('reports.view')) c(capability)
    ON CONFLICT DO NOTHING;
  ELSIF tg_op='UPDATE' AND old.role='owner' THEN
    UPDATE public.organization_scoped_grants SET revoked_at=now()
    WHERE organization_id=v_org AND user_id=new.user_id
      AND granted_by=new.user_id AND revoked_at IS NULL;
  END IF;
  RETURN new;
END
$$;
CREATE TRIGGER hierarchy_membership_changed
 AFTER INSERT OR UPDATE OF role,membership_status ON public.memberships
 FOR EACH ROW EXECUTE FUNCTION public.hierarchy_after_membership_change();

CREATE OR REPLACE FUNCTION public.set_organization_scope_grant(
  p_unit uuid,p_user uuid,p_capability text,p_scope_mode text,p_revoke boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_root uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.organization_units WHERE id=p_unit;
  SELECT id INTO v_root FROM public.organization_units
    WHERE organization_id=v_org AND parent_id IS NULL;
  IF v_root IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.memberships m JOIN public.groups g ON g.id=m.group_id
    JOIN public.organizations o ON o.id=g.organization_id
    JOIN public.organization_units root ON root.id=v_root
    WHERE g.organization_id=v_org AND m.user_id=auth.uid()
      AND m.role='owner' AND m.membership_status='active'
      AND (o.owner_id=auth.uid() OR root.group_id=g.id)
  ) THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  IF p_capability NOT IN ('hierarchy.manage','elections.manage','reports.view')
     OR p_scope_mode NOT IN ('unit','subtree','organization')
  THEN RAISE EXCEPTION 'INVALID_GRANT'; END IF;
  IF p_revoke THEN
    UPDATE public.organization_scoped_grants SET revoked_at=now()
    WHERE unit_id=p_unit AND user_id=p_user AND capability=p_capability
      AND scope_mode=p_scope_mode AND revoked_at IS NULL;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.memberships m
      JOIN public.groups g ON g.id=m.group_id
      WHERE g.organization_id=v_org AND m.user_id=p_user
        AND m.membership_status='active')
    THEN RAISE EXCEPTION 'TARGET_NOT_ACTIVE'; END IF;
    INSERT INTO public.organization_scoped_grants
      (organization_id,user_id,unit_id,capability,scope_mode,granted_by)
    VALUES(v_org,p_user,p_unit,p_capability,p_scope_mode,auth.uid())
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object('changed',true);
END
$$;
REVOKE ALL ON FUNCTION public.set_organization_scope_grant(uuid,uuid,text,text,boolean)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_organization_scope_grant(uuid,uuid,text,text,boolean)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.list_organization_scope_grants(p_organization uuid)
RETURNS TABLE(unit_id uuid,user_id uuid,display_name text,
  capability text,scope_mode text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_root public.organization_units%ROWTYPE;
BEGIN
  SELECT * INTO v_root FROM public.organization_units
    WHERE organization_id=p_organization AND parent_id IS NULL;
  IF v_root.id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.memberships m JOIN public.groups g ON g.id=m.group_id
    JOIN public.organizations o ON o.id=g.organization_id
    WHERE g.organization_id=p_organization AND m.user_id=auth.uid()
      AND m.role='owner' AND m.membership_status='active'
      AND (o.owner_id=auth.uid() OR g.id=v_root.group_id))
    THEN RAISE EXCEPTION 'SCOPE_LIST_DENIED' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT g.unit_id,g.user_id,p.full_name,
    g.capability,g.scope_mode
  FROM public.organization_scoped_grants g JOIN public.profiles p
    ON p.id=g.user_id
  WHERE g.organization_id=p_organization AND g.revoked_at IS NULL
  ORDER BY p.full_name,g.capability,g.unit_id;
END
$$;
REVOKE ALL ON FUNCTION public.list_organization_scope_grants(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_organization_scope_grants(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.list_organization_scope_candidates(p_organization uuid)
RETURNS TABLE(user_id uuid,display_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_root uuid; v_root_group uuid;
BEGIN
  SELECT id,group_id INTO v_root,v_root_group FROM public.organization_units
    WHERE organization_id=p_organization AND parent_id IS NULL;
  IF v_root IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.memberships m JOIN public.groups g ON g.id=m.group_id
    JOIN public.organizations o ON o.id=g.organization_id
    WHERE g.organization_id=p_organization AND m.user_id=auth.uid()
      AND m.role='owner' AND m.membership_status='active'
      AND (o.owner_id=auth.uid() OR g.id=v_root_group))
    THEN RAISE EXCEPTION 'SCOPE_CANDIDATES_DENIED' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT DISTINCT ON (m.user_id) m.user_id,
    coalesce(nullif(m.display_name,''),nullif(p.full_name,''),'Member')
  FROM public.memberships m JOIN public.groups g ON g.id=m.group_id
  JOIN public.profiles p ON p.id=m.user_id
  WHERE g.organization_id=p_organization AND m.membership_status='active'
  ORDER BY m.user_id,m.created_at,m.id;
END
$$;
REVOKE ALL ON FUNCTION public.list_organization_scope_candidates(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_organization_scope_candidates(uuid)
  TO authenticated;

-- Existing onboarding creates the organization and group before its owner
-- membership RPC. This narrowly preserves its failed-setup compensation;
-- established units retain their history and cannot be hard-deleted.
CREATE OR REPLACE FUNCTION public.abort_uninitialized_group(p_group uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_group public.groups%ROWTYPE; v_unit uuid;
BEGIN
  SELECT * INTO v_group FROM public.groups WHERE id=p_group FOR UPDATE;
  IF v_group.id IS NULL OR v_group.created_by IS DISTINCT FROM auth.uid()
    OR v_group.created_at < now()-interval '1 hour'
    OR EXISTS (SELECT 1 FROM public.memberships WHERE group_id=p_group)
    OR EXISTS (SELECT 1 FROM public.invitations WHERE group_id=p_group)
    OR EXISTS (SELECT 1 FROM public.financial_events WHERE group_id=p_group)
  THEN RAISE EXCEPTION 'CANNOT_ABORT_GROUP'; END IF;
  SELECT id INTO v_unit FROM public.organization_units WHERE group_id=p_group;
  IF v_unit IS NULL OR EXISTS (SELECT 1 FROM public.organization_units
    WHERE parent_id=v_unit)
  THEN RAISE EXCEPTION 'CANNOT_ABORT_GROUP'; END IF;
  DELETE FROM public.organization_unit_closure
    WHERE ancestor_id=v_unit OR descendant_id=v_unit;
  DELETE FROM public.organization_scoped_grants WHERE unit_id=v_unit;
  DELETE FROM public.organization_unit_parent_history WHERE unit_id=v_unit;
  DELETE FROM public.organization_hierarchy_audit WHERE unit_id=v_unit;
  DELETE FROM public.organization_units WHERE id=v_unit;
  DELETE FROM public.groups WHERE id=p_group;
  RETURN true;
END
$$;
REVOKE ALL ON FUNCTION public.abort_uninitialized_group(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.abort_uninitialized_group(uuid) TO authenticated;
COMMIT;
