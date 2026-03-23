-- VillageClaq Phase 0: Core Tables Migration
-- Multi-tenant community management platform

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- PROFILES (extends auth.users)
-- ============================================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  display_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  preferred_locale TEXT DEFAULT 'en' CHECK (preferred_locale IN ('en', 'fr')),
  preferred_theme TEXT DEFAULT 'system' CHECK (preferred_theme IN ('light', 'dark', 'system')),
  timezone TEXT DEFAULT 'Africa/Douala',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- ORGANIZATIONS (top-level tenant)
-- ============================================================================
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  logo_url TEXT,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================================
-- GROUPS (njangi, alumni union, village association, church group, etc.)
-- ============================================================================
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  group_type TEXT DEFAULT 'general' CHECK (group_type IN (
    'njangi', 'alumni', 'village', 'church', 'family', 'professional', 'general'
  )),
  logo_url TEXT,
  cover_url TEXT,
  currency TEXT DEFAULT 'XAF',
  locale TEXT DEFAULT 'en' CHECK (locale IN ('en', 'fr')),
  is_active BOOLEAN DEFAULT true,
  max_members INTEGER,
  settings JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  UNIQUE(organization_id, slug)
);

-- ============================================================================
-- MEMBERSHIPS (user <-> group, many-to-many with role & standing)
-- ============================================================================
CREATE TYPE membership_role AS ENUM ('owner', 'admin', 'moderator', 'member');
CREATE TYPE membership_standing AS ENUM ('good', 'warning', 'suspended', 'banned');

CREATE TABLE public.memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  role membership_role DEFAULT 'member' NOT NULL,
  standing membership_standing DEFAULT 'good' NOT NULL,
  display_name TEXT, -- per-group display name override
  is_proxy BOOLEAN DEFAULT false, -- member managed by someone else (elderly, non-tech)
  proxy_manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  privacy_settings JSONB DEFAULT '{"show_phone": false, "show_email": false}'::jsonb,
  joined_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  UNIQUE(user_id, group_id)
);

-- ============================================================================
-- GROUP POSITIONS (President, VP, Treasurer, Secretary, etc.)
-- ============================================================================
CREATE TABLE public.group_positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  title_fr TEXT, -- French translation of position title
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_executive BOOLEAN DEFAULT false, -- board-level position
  is_default BOOLEAN DEFAULT false, -- auto-created with group
  max_holders INTEGER DEFAULT 1, -- how many people can hold this position
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  UNIQUE(group_id, title)
);

-- ============================================================================
-- POSITION ASSIGNMENTS (who holds which position)
-- ============================================================================
CREATE TABLE public.position_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  position_id UUID NOT NULL REFERENCES public.group_positions(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  ended_at TIMESTAMPTZ, -- NULL = currently active
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Only one active assignment per position per member
  UNIQUE(position_id, membership_id, ended_at)
);

-- ============================================================================
-- POSITION PERMISSIONS (what each position can do)
-- ============================================================================
CREATE TABLE public.position_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  position_id UUID NOT NULL REFERENCES public.group_positions(id) ON DELETE CASCADE,
  permission TEXT NOT NULL, -- e.g., 'members.invite', 'finances.view', 'meetings.create'
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  UNIQUE(position_id, permission)
);

-- ============================================================================
-- INVITATIONS
-- ============================================================================
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'declined', 'expired', 'revoked');

CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email TEXT,
  phone TEXT,
  role membership_role DEFAULT 'member',
  status invitation_status DEFAULT 'pending' NOT NULL,
  token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days') NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- ============================================================================
-- JOIN CODES (shareable group invite links/codes)
-- ============================================================================
CREATE TABLE public.join_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL DEFAULT upper(encode(gen_random_bytes(4), 'hex')),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role membership_role DEFAULT 'member',
  max_uses INTEGER, -- NULL = unlimited
  use_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================
CREATE TYPE notification_type AS ENUM (
  'invitation', 'contribution_due', 'contribution_received',
  'meeting_scheduled', 'event_reminder', 'role_changed',
  'member_joined', 'member_left', 'announcement', 'system'
);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_memberships_updated_at BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_group_positions_updated_at BEFORE UPDATE ON public.group_positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX idx_memberships_user_id ON public.memberships(user_id);
CREATE INDEX idx_memberships_group_id ON public.memberships(group_id);
CREATE INDEX idx_groups_organization_id ON public.groups(organization_id);
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id) WHERE NOT is_read;
CREATE INDEX idx_position_assignments_active ON public.position_assignments(position_id) WHERE ended_at IS NULL;
CREATE INDEX idx_invitations_token ON public.invitations(token);
CREATE INDEX idx_invitations_email ON public.invitations(email);
CREATE INDEX idx_join_codes_code ON public.join_codes(code);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.position_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.position_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.join_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- PROFILES: users can read any profile, update only their own
CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ORGANIZATIONS: visible to members of any group in the org
CREATE POLICY "Organizations visible to members"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.groups g
      JOIN public.memberships m ON m.group_id = g.id
      WHERE g.organization_id = organizations.id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Organization owners can update"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- GROUPS: visible to members
CREATE POLICY "Groups visible to members"
  ON public.groups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE group_id = groups.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Group owners/admins can update"
  ON public.groups FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE group_id = groups.id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Authenticated users can create groups"
  ON public.groups FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- MEMBERSHIPS: members can see other members of their groups
CREATE POLICY "Members can view group memberships"
  ON public.memberships FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.memberships my_membership
      WHERE my_membership.group_id = memberships.group_id
      AND my_membership.user_id = auth.uid()
    )
  );

CREATE POLICY "Group owners/admins can manage memberships"
  ON public.memberships FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.memberships
      WHERE group_id = memberships.group_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Group owners/admins can update memberships"
  ON public.memberships FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.memberships admin_m
      WHERE admin_m.group_id = memberships.group_id
      AND admin_m.user_id = auth.uid()
      AND admin_m.role IN ('owner', 'admin')
    )
  );

-- GROUP POSITIONS: viewable by group members
CREATE POLICY "Positions viewable by group members"
  ON public.group_positions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE group_id = group_positions.group_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Group owners/admins can manage positions"
  ON public.group_positions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE group_id = group_positions.group_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- POSITION ASSIGNMENTS: viewable by group members
CREATE POLICY "Assignments viewable by group members"
  ON public.position_assignments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_positions gp
      JOIN public.memberships m ON m.group_id = gp.group_id
      WHERE gp.id = position_assignments.position_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Group owners/admins can manage assignments"
  ON public.position_assignments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_positions gp
      JOIN public.memberships m ON m.group_id = gp.group_id
      WHERE gp.id = position_assignments.position_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'admin')
    )
  );

-- POSITION PERMISSIONS: viewable by group members
CREATE POLICY "Permissions viewable by group members"
  ON public.position_permissions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_positions gp
      JOIN public.memberships m ON m.group_id = gp.group_id
      WHERE gp.id = position_permissions.position_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Group owners/admins can manage permissions"
  ON public.position_permissions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_positions gp
      JOIN public.memberships m ON m.group_id = gp.group_id
      WHERE gp.id = position_permissions.position_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'admin')
    )
  );

-- INVITATIONS: visible to inviter and invitee
CREATE POLICY "Users can view their invitations"
  ON public.invitations FOR SELECT
  TO authenticated
  USING (
    invited_by = auth.uid()
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR phone = (SELECT phone FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "Group admins can create invitations"
  ON public.invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE group_id = invitations.group_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'moderator')
    )
  );

-- JOIN CODES: viewable by group members
CREATE POLICY "Join codes viewable by group members"
  ON public.join_codes FOR SELECT
  TO authenticated
  USING (
    is_active = true
    OR EXISTS (
      SELECT 1 FROM public.memberships
      WHERE group_id = join_codes.group_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Group admins can manage join codes"
  ON public.join_codes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE group_id = join_codes.group_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- NOTIFICATIONS: users can only see their own
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
