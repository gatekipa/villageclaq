-- Isolated Docker-only fixture, never run against a linked/project database.
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TYPE membership_standing AS ENUM ('good','warning','suspended','banned');
CREATE TYPE transfer_status AS ENUM ('requested','source_approved','dest_approved','approved','completed','rejected','cancelled');
CREATE TABLE profiles(id uuid PRIMARY KEY);
CREATE TABLE organizations(id uuid PRIMARY KEY,name text NOT NULL DEFAULT 'Synthetic organization');
CREATE TABLE groups(id uuid PRIMARY KEY, organization_id uuid REFERENCES organizations(id),name text NOT NULL DEFAULT 'Synthetic group',
  currency text NOT NULL, is_active boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE memberships(id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),group_id uuid NOT NULL REFERENCES groups(id),user_id uuid REFERENCES profiles(id),
  role text NOT NULL DEFAULT 'member',membership_status text NOT NULL DEFAULT 'active',is_proxy boolean NOT NULL DEFAULT false,
  standing membership_standing NOT NULL DEFAULT 'good',display_name text,joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now(),UNIQUE(user_id,group_id));
ALTER TABLE memberships ADD COLUMN proxy_manager_id uuid;
CREATE TABLE platform_staff(user_id uuid PRIMARY KEY REFERENCES profiles(id),is_active boolean NOT NULL DEFAULT true);
CREATE TABLE member_transfers(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),member_id uuid NOT NULL REFERENCES profiles(id),
  source_group_id uuid NOT NULL REFERENCES groups(id),dest_group_id uuid NOT NULL REFERENCES groups(id),
  status transfer_status NOT NULL DEFAULT 'requested',reason text,transfer_summary_json jsonb NOT NULL DEFAULT '{}',
  requested_by uuid NOT NULL REFERENCES profiles(id),approved_by_source uuid REFERENCES profiles(id),
  approved_by_dest uuid REFERENCES profiles(id),completed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),carry_over_standing boolean NOT NULL DEFAULT true,
  denial_reason text,cancelled_at timestamptz);
CREATE TABLE position_assignments(membership_id uuid,position_id uuid,ended_at timestamptz);
CREATE TABLE position_permissions(position_id uuid,permission text);
CREATE TABLE group_audit_logs(id uuid DEFAULT gen_random_uuid(),group_id uuid,actor_id uuid,action text,entity_type text,entity_id uuid,details jsonb);
CREATE TABLE events(id uuid,event_type text,ends_at timestamptz);
CREATE TABLE event_attendances(event_id uuid,membership_id uuid,status text);
CREATE TABLE relief_plans(id uuid PRIMARY KEY,group_id uuid,is_active boolean DEFAULT true,contribution_frequency text DEFAULT 'monthly',contribution_amount numeric DEFAULT 0);
CREATE TABLE relief_enrollments(id uuid DEFAULT gen_random_uuid(),membership_id uuid,plan_id uuid,contribution_status text,is_active boolean DEFAULT true,updated_at timestamptz);
CREATE TABLE hosting_assignments(membership_id uuid,status text);
CREATE TABLE fines(membership_id uuid,status text);
CREATE TABLE loans(id uuid,membership_id uuid,status text);
CREATE TABLE loan_schedule(loan_id uuid,status text);
CREATE TABLE disputes(group_id uuid,filed_by uuid,against_membership_id uuid,status text,supporting_docs jsonb DEFAULT '[]');
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean NOT NULL DEFAULT false);
CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,owner_id text,PRIMARY KEY(bucket_id,name));
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
INSERT INTO storage.buckets(id) VALUES('receipts');
GRANT USAGE ON SCHEMA public,storage TO authenticated,anon;
GRANT ALL ON storage.objects TO authenticated,anon;
-- Deliberately permissive baseline: the new restrictive overlay must defeat it.
CREATE POLICY legacy_receipts ON storage.objects FOR ALL TO authenticated USING(true) WITH CHECK(true);
CREATE POLICY legacy_anon ON storage.objects FOR SELECT TO anon USING(true);
