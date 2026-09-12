/**
 * Apply current-main migrations 00001–00117 then NEW 00118+ on disposable PG.
 * Never applies 20260906*–20260910* timestamp F3 history.
 * Refuses production.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDisposableDatabase, psql, psqlFile, refuseProduction } from "./fixtures/disposable-postgres.mjs";
import { F3_FORWARD_CHAIN, installLiveHasGroupPermission } from "./fixtures/f3-forward-prerequisites.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

const BOOTSTRAP = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;

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
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS extensions;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz,
  is_anonymous boolean DEFAULT false,
  phone text
);

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
CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT COALESCE(current_setting('request.jwt.claim.role', true), 'authenticated');
$$;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  path_tokens text[]
);
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT string_to_array(name, '/');
$$;

GRANT USAGE ON SCHEMA auth, storage, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

-- Historical 00030 calls unnest(get_user_group_ids()) while 00014 returns SETOF uuid.
-- Shim only; 00001–00117 bytes stay untouched.
CREATE OR REPLACE FUNCTION public.unnest(uuid)
RETURNS SETOF uuid
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT $1 $$;
`;

export function listMainMigrationsThrough00117() {
  const dir = path.join(root, "supabase/migrations");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && /^(000|0010|0011[0-7])/.test(f))
    .filter((f) => !/^202609/.test(f))
    .sort();
}

export function applyCurrentMainThenF3(url, { throughF3 } = {}) {
  refuseProduction(url);
  psql(url, BOOTSTRAP);
  for (const name of listMainMigrationsThrough00117()) {
    if (/^0011[6-7]_/.test(name)) {
      // 00116/00117 fail-closed on the live HGP pin (Cut 3 / M2).
      installLiveHasGroupPermission(url);
    }
    try {
      psqlFile(url, path.join(root, "supabase/migrations", name));
    } catch (err) {
      const msg = String(err.message || err);
      // Some historical files assume live Supabase objects (storage policies,
      // cron). Continue only when the object already exists or the statement
      // is optional; otherwise fail closed.
      if (/already exists|duplicate_object|duplicate_function/i.test(msg)) {
        continue;
      }
      throw new Error(`${name} failed:\n${msg}`);
    }
  }
  // Re-pin live HGP after 00114–00117 so 00118 preconditions match production.
  installLiveHasGroupPermission(url);
  const stop = throughF3 || F3_FORWARD_CHAIN[F3_FORWARD_CHAIN.length - 1];
  for (const name of F3_FORWARD_CHAIN) {
    psqlFile(url, path.join(root, "supabase/migrations", name));
    if (name === stop) break;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = createDisposableDatabase("floor");
  try {
    applyCurrentMainThenF3(db.url);
    console.log(JSON.stringify({ ok: true, url_db: db.name, through: "00123" }));
  } catch (err) {
    console.error(err);
    db.close();
    process.exit(1);
  }
  db.close();
}
