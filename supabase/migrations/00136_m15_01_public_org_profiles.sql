-- M15 optional public projection and request inbox. No public table reads.
BEGIN;
CREATE TYPE public.org_visibility AS ENUM ('private','unlisted','public');
CREATE TYPE public.org_request_status AS ENUM ('pending','approved','rejected');
CREATE TABLE public.organization_public_profiles (
  group_id uuid PRIMARY KEY REFERENCES public.groups(id) ON DELETE RESTRICT,
  slug text NOT NULL UNIQUE,
  visibility public.org_visibility NOT NULL DEFAULT 'private',
  display_name text NOT NULL,
  description text,
  logo_url text,
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  allow_membership_requests boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.organization_membership_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  message text,
  status public.org_request_status NOT NULL DEFAULT 'pending',
  request_day date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id),
  UNIQUE(group_id,email,request_day)
);
CREATE TABLE public.organization_profile_abuse_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (reason IN ('misrepresentation','harassment','other')),
  details text NOT NULL,
  report_day date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organization_public_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_membership_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_profile_abuse_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_public_profiles,
  public.organization_membership_requests,
  public.organization_profile_abuse_reports FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.organization_public_profiles,
  public.organization_membership_requests TO authenticated;
GRANT SELECT ON public.organization_profile_abuse_reports TO authenticated;
CREATE POLICY platform_staff_abuse_report_select
  ON public.organization_profile_abuse_reports FOR SELECT TO authenticated
  USING (public.is_platform_staff(auth.uid()));
CREATE POLICY profiles_owner_select ON public.organization_public_profiles
 FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.memberships m
  WHERE m.group_id=organization_public_profiles.group_id
    AND m.user_id=auth.uid() AND m.membership_status='active'
    AND m.role IN ('owner','admin')));
CREATE POLICY requests_admin_select ON public.organization_membership_requests
 FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.memberships m
  WHERE m.group_id=organization_membership_requests.group_id
    AND m.user_id=auth.uid() AND m.membership_status='active'
    AND m.role IN ('owner','admin')));
CREATE OR REPLACE FUNCTION public.configure_public_profile(
 p_group_id uuid,p_slug text,p_visibility text,p_display_name text,
 p_description text,p_allow_requests boolean,p_social_links jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_visibility public.org_visibility; v_links jsonb:='{}'::jsonb;
  v_key text; v_value text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.memberships m
    WHERE m.group_id=p_group_id AND m.user_id=auth.uid()
      AND m.membership_status='active' AND m.role IN ('owner','admin'))
  THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$'
     OR p_display_name IS NULL OR length(trim(p_display_name)) NOT BETWEEN 1 AND 100
     OR length(coalesce(p_description,''))>1000
  THEN RAISE EXCEPTION 'INVALID_PROFILE'; END IF;
  BEGIN v_visibility:=p_visibility::public.org_visibility;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'INVALID_PROFILE'; END;
  IF jsonb_typeof(coalesce(p_social_links,'{}'::jsonb))<>'object'
  THEN RAISE EXCEPTION 'INVALID_LINKS'; END IF;
  FOR v_key,v_value IN SELECT key,value FROM jsonb_each_text(coalesce(p_social_links,'{}'::jsonb))
  LOOP
    IF v_key NOT IN ('website','facebook','instagram','linkedin')
       OR length(v_value)>300 OR v_value !~ '^https://[^[:space:]]+$'
    THEN RAISE EXCEPTION 'INVALID_LINKS'; END IF;
    v_links:=v_links||jsonb_build_object(v_key,v_value);
  END LOOP;
  INSERT INTO public.organization_public_profiles
    (group_id,slug,visibility,display_name,description,logo_url,
     allow_membership_requests,social_links)
  SELECT p_group_id,p_slug,v_visibility,trim(p_display_name),
    nullif(trim(coalesce(p_description,'')),''),
    CASE WHEN g.logo_url ~ '^https://[^[:space:]]+$' THEN g.logo_url ELSE NULL END,
    coalesce(p_allow_requests,false),v_links
  FROM public.groups g WHERE g.id=p_group_id
  ON CONFLICT(group_id) DO UPDATE SET slug=excluded.slug,
    visibility=excluded.visibility,display_name=excluded.display_name,
    description=excluded.description,logo_url=excluded.logo_url,
    allow_membership_requests=excluded.allow_membership_requests,
    social_links=excluded.social_links,updated_at=now();
  RETURN jsonb_build_object('saved',true,'visibility',v_visibility,'slug',p_slug);
END
$$;
CREATE OR REPLACE FUNCTION public.get_public_organization_profile(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_profile public.organization_public_profiles%ROWTYPE;
BEGIN
  SELECT p.* INTO v_profile FROM public.organization_public_profiles p
  JOIN public.groups g ON g.id=p.group_id AND g.status='active'
  WHERE p.slug=p_slug AND p.visibility IN ('public','unlisted');
  IF v_profile.group_id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'slug',v_profile.slug,'display_name',v_profile.display_name,
    'description',v_profile.description,'logo_url',v_profile.logo_url,
    'social_links',v_profile.social_links,
    'allow_membership_requests',v_profile.allow_membership_requests);
END
$$;
CREATE OR REPLACE FUNCTION public.list_public_organization_profiles(
 p_query text DEFAULT '',p_offset integer DEFAULT 0,p_limit integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_rows jsonb; v_search text:=left(trim(coalesce(p_query,'')),80);
BEGIN
  IF p_offset IS NULL OR p_offset<0 OR p_offset>10000
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
    THEN RAISE EXCEPTION 'INVALID_DIRECTORY_PAGE'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'slug',p.slug,'display_name',p.display_name,
    'description',p.description,'logo_url',p.logo_url)
    ORDER BY p.display_name,p.slug),'[]'::jsonb) INTO v_rows
  FROM (
    SELECT profile.slug,profile.display_name,profile.description,
      profile.logo_url
    FROM public.organization_public_profiles profile
    JOIN public.groups g ON g.id=profile.group_id AND g.status='active'
    WHERE profile.visibility='public'
      AND (v_search='' OR profile.display_name ILIKE
        '%'||replace(replace(replace(v_search,'!','!!'),'%','!%'),'_','!_')||'%' ESCAPE '!')
    ORDER BY profile.display_name,profile.slug
    OFFSET p_offset LIMIT p_limit
  ) p;
  RETURN v_rows;
END
$$;
CREATE OR REPLACE FUNCTION public.submit_public_membership_request(
 p_slug text,p_full_name text,p_email text,p_phone text,p_message text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_profile public.organization_public_profiles%ROWTYPE;
  v_name text:=trim(coalesce(p_full_name,''));
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_phone text:=nullif(trim(coalesce(p_phone,'')),'');
  v_message text:=nullif(trim(coalesce(p_message,'')),'');
BEGIN
  SELECT p.* INTO v_profile FROM public.organization_public_profiles p
  JOIN public.groups g ON g.id=p.group_id AND g.status='active'
  WHERE p.slug=p_slug AND p.visibility IN ('public','unlisted')
    AND p.allow_membership_requests=true;
  IF v_profile.group_id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF length(v_name) NOT BETWEEN 1 AND 100
     OR length(v_email) NOT BETWEEN 3 AND 254 OR v_email !~ '^[^ @]+@[^ @]+[.][^ @]+$'
     OR length(coalesce(v_phone,''))>40 OR length(coalesce(v_message,''))>2000
  THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('membership-request'),pg_catalog.hashtext(v_profile.group_id::text));
  IF (SELECT count(*) FROM public.organization_membership_requests r
      WHERE r.group_id=v_profile.group_id AND r.request_day=current_date)>=100
  THEN RAISE EXCEPTION 'REQUEST_RATE_LIMITED'; END IF;
  INSERT INTO public.organization_membership_requests
    (group_id,full_name,email,phone,message)
  VALUES(v_profile.group_id,v_name,v_email,v_phone,v_message)
  ON CONFLICT(group_id,email,request_day) DO NOTHING;
  RETURN jsonb_build_object('success',true);
END
$$;
CREATE OR REPLACE FUNCTION public.review_public_membership_request(
 p_request_id uuid,p_status text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_req public.organization_membership_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.organization_membership_requests
    WHERE id=p_request_id FOR UPDATE;
  IF v_req.id IS NULL OR NOT EXISTS (SELECT 1 FROM public.memberships m
    WHERE m.group_id=v_req.group_id AND m.user_id=auth.uid()
      AND m.membership_status='active' AND m.role IN ('owner','admin'))
  THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN ('approved','rejected') OR v_req.status<>'pending'
  THEN RAISE EXCEPTION 'INVALID_REVIEW'; END IF;
  UPDATE public.organization_membership_requests SET status=p_status::public.org_request_status,
    reviewed_at=now(),reviewed_by=auth.uid() WHERE id=v_req.id;
  RETURN jsonb_build_object('reviewed',true,'membership_created',false);
END
$$;
CREATE OR REPLACE FUNCTION public.submit_public_profile_abuse_report(
 p_slug text,p_reason text,p_details text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_group uuid; v_details text:=trim(coalesce(p_details,''));
BEGIN
  IF p_reason NOT IN ('misrepresentation','harassment','other')
    OR length(v_details) NOT BETWEEN 10 AND 1000
    THEN RAISE EXCEPTION 'INVALID_REPORT'; END IF;
  SELECT p.group_id INTO v_group FROM public.organization_public_profiles p
    JOIN public.groups g ON g.id=p.group_id AND g.status='active'
    WHERE p.slug=p_slug AND p.visibility IN ('public','unlisted');
  IF v_group IS NULL THEN RETURN jsonb_build_object('received',true); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('profile-abuse-report'),
    pg_catalog.hashtext(v_group::text));
  IF (SELECT count(*) FROM public.organization_profile_abuse_reports r
      WHERE r.group_id=v_group AND r.report_day=current_date)<25 THEN
    INSERT INTO public.organization_profile_abuse_reports
      (group_id,reason,details) VALUES(v_group,p_reason,v_details);
  END IF;
  RETURN jsonb_build_object('received',true);
END
$$;
REVOKE ALL ON FUNCTION public.configure_public_profile(uuid,text,text,text,text,boolean,jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.configure_public_profile(uuid,text,text,text,text,boolean,jsonb)
  TO authenticated;
REVOKE ALL ON FUNCTION public.get_public_organization_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_organization_profile(text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.list_public_organization_profiles(text,integer,integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_organization_profiles(text,integer,integer)
  TO anon,authenticated;
REVOKE ALL ON FUNCTION public.submit_public_membership_request(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_membership_request(text,text,text,text,text)
  TO anon,authenticated;
REVOKE ALL ON FUNCTION public.review_public_membership_request(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_public_membership_request(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_public_profile_abuse_report(text,text,text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_profile_abuse_report(text,text,text)
  TO anon,authenticated;
COMMIT;
