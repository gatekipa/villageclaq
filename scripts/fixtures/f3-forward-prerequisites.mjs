/**
 * Disposable F3 forward floor. Applies NEW 00118+ only.
 * Never loads 20260906*–20260910* timestamp F3 history.
 * Never replays payment-integrity or standing hotfix.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyFloorFunctions,
  applyFloorOwnershipAndAcl,
  extractHasGroupPermissionCreateSql,
} from "../_m2_apply_disposable_floor.mjs";
import { psql, psqlFile } from "./disposable-postgres.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

export const F3_FORWARD_CHAIN = [
  "00118_f3_bounded_financial_epoch_foundation.sql",
  "00119_f3_01_core_ledger_foundation.sql",
  "00120_f3_02_secure_posting_idempotency.sql",
  "00121_f3_03_projection_read_proof.sql",
  "00122_f3_04_correction_reversal.sql",
  "00123_f3_05_opening_cash_command.sql",
];

export const STUB_CORE_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END$$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT COALESCE(current_setting('request.jwt.claims', true), '{}')::jsonb;
$$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text,
  display_name text
);
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT 'org'
);
CREATE TABLE public.groups (
  id uuid PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id),
  name text NOT NULL DEFAULT 'group',
  currency text NOT NULL DEFAULT 'XAF',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id),
  group_id uuid NOT NULL REFERENCES public.groups(id),
  role text NOT NULL DEFAULT 'member',
    standing text NOT NULL DEFAULT 'good',
    membership_status text NOT NULL DEFAULT 'active',
    is_proxy boolean NOT NULL DEFAULT false,
    display_name text
  );
CREATE TABLE public.group_positions (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.groups(id),
  title text NOT NULL DEFAULT 'officer'
);
CREATE TABLE public.position_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES public.group_positions(id),
  membership_id uuid NOT NULL REFERENCES public.memberships(id),
  ended_at timestamptz
);
CREATE TABLE public.position_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES public.group_positions(id),
  permission text NOT NULL
);
CREATE TABLE public.projects (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.groups(id),
  name text NOT NULL
);
CREATE TABLE public.payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.contribution_obligations (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.payment_obligation_applications (
  payment_id uuid,
  obligation_id uuid
);
CREATE TABLE public.member_transfers (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
`;

export function installLiveHasGroupPermission(url) {
  const sql =
    extractHasGroupPermissionCreateSql() +
    `
ALTER FUNCTION public.has_group_permission(uuid, text, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.has_group_permission(uuid, text, uuid) FROM PUBLIC, anon, ubuntu;
GRANT EXECUTE ON FUNCTION public.has_group_permission(uuid, text, uuid)
  TO authenticated, service_role;
`;
  const tmp = path.join("/tmp", `f3_hgp_${process.pid}.sql`);
  fs.writeFileSync(tmp, sql);
  try {
    psqlFile(url, tmp);
  } finally {
    fs.unlinkSync(tmp);
  }
}

export function applyForwardMigration(url, name) {
  if (!F3_FORWARD_CHAIN.includes(name)) throw new Error(`unknown F3 migration ${name}`);
  psqlFile(url, path.join(root, "supabase/migrations", name));
}

export function applyForwardMigrations(url, throughFile) {
  const stop = throughFile || F3_FORWARD_CHAIN[F3_FORWARD_CHAIN.length - 1];
  let seen = false;
  for (const name of F3_FORWARD_CHAIN) {
    applyForwardMigration(url, name);
    if (name === stop) {
      seen = true;
      break;
    }
  }
  if (!seen) throw new Error(`unknown stop migration ${stop}`);
}

export const REGRESSION_SLICE_SQL = `
CREATE TABLE IF NOT EXISTS public.relief_enrollments (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.relief_plans (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.relief_claims (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.relief_remittances (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.hosting_assignments (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.hosting_rosters (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.events (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.loans (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.fines (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.invitations (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.group_subscriptions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.meeting_minutes (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.elections (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.announcements (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.hosting_swap_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

CREATE OR REPLACE FUNCTION public.compute_member_standing(p_membership_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$ SELECT 'good'::text $$;

CREATE OR REPLACE FUNCTION public.request_member_transfer(p_payload jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$ SELECT jsonb_build_object('stub','s0-008-00082-untouched') $$;

CREATE OR REPLACE FUNCTION public.execute_member_transfer(p_payload jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$ SELECT jsonb_build_object('stub','s0-008-00082-untouched') $$;
`;

export const CUT2_QUEUE_SLICE_SQL = `
DO $$ BEGIN
  CREATE TYPE public.notification_channel AS ENUM ('email','sms','whatsapp','push');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.notifications_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  channel public.notification_channel NOT NULL,
  template text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  error_message text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  cut2_provenance_version smallint
);
ALTER TABLE public.notifications_queue OWNER TO postgres;
`;

export function installF3StubFloor(url, { through } = {}) {
  psql(url, STUB_CORE_SQL);
  installLiveHasGroupPermission(url);
  applyForwardMigrations(url, through);
}

/**
 * Post-S0 regression floor: stub current-main objects + live Cut 2
 * queue/HGP/enqueue pins + real 00117 + NEW 00118–00123.
 * Does not replay 00001–00116 (greenfield historical apply is a
 * separate documented gap). Does not touch production.
 */
export function installF3RegressionFloor(url, { through } = {}) {
  psql(url, STUB_CORE_SQL);
  psql(url, REGRESSION_SLICE_SQL);
  psql(url, CUT2_QUEUE_SLICE_SQL);
  applyFloorFunctions(url);
  applyFloorOwnershipAndAcl(url);
  psqlFile(url, path.join(root, "supabase/migrations/00117_m2_notification_policy_foundation.sql"));
  applyForwardMigrations(url, through);
}

export function sqlOn(url) {
  return (query, { role, actor } = {}) => {
    const prefix = [
      role ? `SET ROLE ${role};` : "",
      actor ? `SET request.jwt.claim.sub = '${actor}';` : "",
    ].join("");
    return psql(url, prefix + query);
  };
}
