-- supabase/migrations/00136_m15_01_public_org_profiles.sql

CREATE TYPE public.org_visibility AS ENUM ('private', 'unlisted', 'public');
CREATE TYPE public.org_request_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE IF NOT EXISTS public.organization_public_profiles (
    group_id UUID PRIMARY KEY REFERENCES public.groups(id) ON DELETE CASCADE,
    slug TEXT UNIQUE NOT NULL,
    visibility public.org_visibility NOT NULL DEFAULT 'private',
    display_name TEXT NOT NULL,
    description TEXT,
    logo_url TEXT,
    contact_email TEXT,
    social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
    allow_membership_requests BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_membership_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    message TEXT,
    status public.org_request_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES public.profiles(id)
);

ALTER TABLE public.organization_public_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_membership_requests ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.organization_public_profiles FROM anon, authenticated, public;
REVOKE INSERT, UPDATE, DELETE ON public.organization_membership_requests FROM anon, authenticated, public;

CREATE POLICY profiles_public_select ON public.organization_public_profiles
  FOR SELECT TO public
  USING (visibility IN ('public', 'unlisted'));

CREATE POLICY profiles_owner_select ON public.organization_public_profiles
  FOR SELECT TO authenticated
  USING (
    group_id IN (
      SELECT group_id FROM public.memberships WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY requests_admin_select ON public.organization_membership_requests
  FOR SELECT TO authenticated
  USING (
    public.has_group_permission(group_id, auth.uid(), 'members.manage')
  );

CREATE OR REPLACE FUNCTION public.configure_public_profile(
    p_group_id UUID,
    p_slug TEXT,
    p_visibility TEXT,
    p_display_name TEXT,
    p_description TEXT,
    p_allow_requests BOOLEAN,
    p_social_links JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_has_access BOOLEAN;
    v_visibility public.org_visibility;
    v_res record;
BEGIN
    v_has_access := public.has_group_permission(p_group_id, auth.uid(), 'organization.manage');
    IF NOT v_has_access THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Requires organization.manage permission.' USING ERRCODE = '42501';
    END IF;

    IF p_slug !~ '^[a-z0-9-]+$' THEN
        RAISE EXCEPTION 'INVALID_FORMAT: Slug must be lowercase alphanumeric with hyphens.' USING ERRCODE = '22023';
    END IF;

    BEGIN
        v_visibility := p_visibility::public.org_visibility;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'INVALID_FORMAT: Invalid visibility state.' USING ERRCODE = '22023';
    END;

    INSERT INTO public.organization_public_profiles (
        group_id, slug, visibility, display_name, description, allow_membership_requests, social_links, updated_at
    ) VALUES (
        p_group_id, p_slug, v_visibility, p_display_name, p_description, p_allow_requests, COALESCE(p_social_links, '{}'::jsonb), now()
    )
    ON CONFLICT (group_id) DO UPDATE SET
        slug = EXCLUDED.slug,
        visibility = EXCLUDED.visibility,
        display_name = EXCLUDED.display_name,
        description = EXCLUDED.description,
        allow_membership_requests = EXCLUDED.allow_membership_requests,
        social_links = EXCLUDED.social_links,
        updated_at = now()
    RETURNING * INTO v_res;

    RETURN to_jsonb(v_res);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_organization_profile(
    p_slug TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_profile record;
BEGIN
    SELECT * INTO v_profile
    FROM public.organization_public_profiles
    WHERE slug = p_slug AND visibility IN ('public', 'unlisted');

    IF v_profile IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
        'group_id', v_profile.group_id,
        'slug', v_profile.slug,
        'display_name', v_profile.display_name,
        'description', v_profile.description,
        'logo_url', v_profile.logo_url,
        'allow_membership_requests', v_profile.allow_membership_requests,
        'social_links', v_profile.social_links
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_public_membership_request(
    p_slug TEXT,
    p_full_name TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_message TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_profile record;
    v_request_id UUID;
    v_clean_name TEXT;
    v_clean_email TEXT;
    v_clean_message TEXT;
BEGIN
    SELECT * INTO v_profile
    FROM public.organization_public_profiles
    WHERE slug = p_slug AND visibility IN ('public', 'unlisted') AND allow_membership_requests = true;

    IF v_profile IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Organization not found or not accepting requests.' USING ERRCODE = '23505';
    END IF;

    v_clean_name := replace(replace(p_full_name, '<', '&lt;'), '>', '&gt;');
    v_clean_email := replace(replace(p_email, '<', '&lt;'), '>', '&gt;');
    v_clean_message := replace(replace(p_message, '<', '&lt;'), '>', '&gt;');

    INSERT INTO public.organization_membership_requests (
        group_id, full_name, email, phone, message
    ) VALUES (
        v_profile.group_id, v_clean_name, v_clean_email, p_phone, v_clean_message
    ) RETURNING id INTO v_request_id;

    INSERT INTO public.notifications_queue (
        group_id,
        recipient_id,
        template_id,
        channel,
        payload,
        idempotency_key
    )
    SELECT
        v_profile.group_id,
        m.user_id,
        'new_membership_request',
        'email',
        jsonb_build_object(
            'applicant_name', v_clean_name,
            'applicant_email', v_clean_email,
            'request_id', v_request_id
        ),
        'mem_req_' || v_request_id || '_' || m.user_id
    FROM public.memberships m
    JOIN public.group_permissions gp ON gp.group_id = m.group_id AND gp.user_id = m.user_id
    WHERE m.group_id = v_profile.group_id AND m.status = 'active' AND gp.permission = 'members.manage';

    RETURN jsonb_build_object('success', true, 'request_id', v_request_id);
END;
$$;
