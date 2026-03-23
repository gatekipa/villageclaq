-- VillageClaq Phase 0: Seed Data
-- Run AFTER creating a test user via Supabase Auth

-- NOTE: Replace 'TEST_USER_ID' with the actual UUID from auth.users
-- after you create a test user through the Supabase dashboard or Auth API.

-- For now, we create the organization, group, positions, and permissions
-- with placeholder IDs. The membership linking will happen after user creation.

-- ============================================================================
-- Test Organization
-- ============================================================================
INSERT INTO public.organizations (id, name, slug, description)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Cameroon Community Network',
  'cameroon-community',
  'A network of Cameroonian diaspora community groups'
);

-- ============================================================================
-- Test Group
-- ============================================================================
INSERT INTO public.groups (id, organization_id, name, slug, description, group_type, currency, locale)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Bamenda Alumni Union - DC Chapter',
  'bamenda-alumni-dc',
  'Alumni association for graduates from Bamenda, now based in the Washington DC area',
  'alumni',
  'USD',
  'en'
);

-- ============================================================================
-- Default Positions
-- ============================================================================
INSERT INTO public.group_positions (id, group_id, title, title_fr, description, sort_order, is_executive, is_default) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'President', 'Président', 'Head of the group, presides over meetings', 1, true, true),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Vice President', 'Vice-président', 'Assists the president, acts in their absence', 2, true, true),
  ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'Treasurer', 'Trésorier', 'Manages group finances and contributions', 3, true, true),
  ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'Secretary', 'Secrétaire', 'Records minutes, manages communications', 4, true, true),
  ('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001', 'Board Member', 'Membre du bureau', 'Advisory board member', 5, true, true),
  ('c0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000001', 'Member', 'Membre', 'Regular group member', 6, false, true);

-- ============================================================================
-- Default Position Permissions
-- ============================================================================

-- President: full access
INSERT INTO public.position_permissions (position_id, permission) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'group.manage'),
  ('c0000000-0000-0000-0000-000000000001', 'members.invite'),
  ('c0000000-0000-0000-0000-000000000001', 'members.remove'),
  ('c0000000-0000-0000-0000-000000000001', 'members.manage_roles'),
  ('c0000000-0000-0000-0000-000000000001', 'finances.view'),
  ('c0000000-0000-0000-0000-000000000001', 'finances.manage'),
  ('c0000000-0000-0000-0000-000000000001', 'meetings.create'),
  ('c0000000-0000-0000-0000-000000000001', 'meetings.manage'),
  ('c0000000-0000-0000-0000-000000000001', 'events.create'),
  ('c0000000-0000-0000-0000-000000000001', 'events.manage'),
  ('c0000000-0000-0000-0000-000000000001', 'documents.upload'),
  ('c0000000-0000-0000-0000-000000000001', 'documents.manage'),
  ('c0000000-0000-0000-0000-000000000001', 'announcements.create');

-- Vice President: same as president minus group.manage
INSERT INTO public.position_permissions (position_id, permission) VALUES
  ('c0000000-0000-0000-0000-000000000002', 'members.invite'),
  ('c0000000-0000-0000-0000-000000000002', 'members.manage_roles'),
  ('c0000000-0000-0000-0000-000000000002', 'finances.view'),
  ('c0000000-0000-0000-0000-000000000002', 'meetings.create'),
  ('c0000000-0000-0000-0000-000000000002', 'meetings.manage'),
  ('c0000000-0000-0000-0000-000000000002', 'events.create'),
  ('c0000000-0000-0000-0000-000000000002', 'events.manage'),
  ('c0000000-0000-0000-0000-000000000002', 'documents.upload'),
  ('c0000000-0000-0000-0000-000000000002', 'announcements.create');

-- Treasurer: finances + view members
INSERT INTO public.position_permissions (position_id, permission) VALUES
  ('c0000000-0000-0000-0000-000000000003', 'finances.view'),
  ('c0000000-0000-0000-0000-000000000003', 'finances.manage'),
  ('c0000000-0000-0000-0000-000000000003', 'members.invite'),
  ('c0000000-0000-0000-0000-000000000003', 'documents.upload');

-- Secretary: meetings + documents + communications
INSERT INTO public.position_permissions (position_id, permission) VALUES
  ('c0000000-0000-0000-0000-000000000004', 'meetings.create'),
  ('c0000000-0000-0000-0000-000000000004', 'meetings.manage'),
  ('c0000000-0000-0000-0000-000000000004', 'documents.upload'),
  ('c0000000-0000-0000-0000-000000000004', 'documents.manage'),
  ('c0000000-0000-0000-0000-000000000004', 'announcements.create'),
  ('c0000000-0000-0000-0000-000000000004', 'members.invite');

-- Board Member: view + invite
INSERT INTO public.position_permissions (position_id, permission) VALUES
  ('c0000000-0000-0000-0000-000000000005', 'finances.view'),
  ('c0000000-0000-0000-0000-000000000005', 'members.invite'),
  ('c0000000-0000-0000-0000-000000000005', 'meetings.create'),
  ('c0000000-0000-0000-0000-000000000005', 'events.create'),
  ('c0000000-0000-0000-0000-000000000005', 'documents.upload');

-- Member: basic access
INSERT INTO public.position_permissions (position_id, permission) VALUES
  ('c0000000-0000-0000-0000-000000000006', 'finances.view'),
  ('c0000000-0000-0000-0000-000000000006', 'documents.upload');
