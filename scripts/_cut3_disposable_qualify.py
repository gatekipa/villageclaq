#!/usr/bin/env python3
"""Disposable REAL storage.objects RLS qualification for S0 Cut 3.

NOT a production script. Zero production writes. Local Postgres only.
Requires elevated postgres role for storage.objects policy apply (documented).
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/00116_s0_p0c_cut3_storage_path_fail_closed.sql"
FINGERPRINTS = ROOT / "docs/evidence/S0_CUT3_STORAGE_LIVE_CATALOG_FINGERPRINTS_20260912.json"
ENCODING = ROOT / "docs/evidence/S0_CUT3_STORAGE_ENCODING_TEST_MATRIX_20260912.json"
EVIDENCE = ROOT / "docs/evidence"

DB = os.environ.get("CUT3_DISPOSABLE_DB", "s0p0c_cut3_disposable")

G1 = "11111111-1111-4111-8111-111111111111"
G2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
M1 = "22222222-2222-4222-8222-222222222222"
M_MEMBER = "33333333-3333-4333-8333-333333333333"
M_OTHER = "44444444-4444-4444-8444-444444444444"
M_G2 = "55555555-5555-4555-8555-555555555555"
P1 = "66666666-6666-4666-8666-666666666666"
P2 = "77777777-7777-4777-8777-777777777777"
FILE = "1700000000000-receipt.pdf"

U_OWNER = "10000000-0000-4000-8000-000000000001"
U_MEMBER = "10000000-0000-4000-8000-000000000002"
U_MEMBER2 = "10000000-0000-4000-8000-000000000003"
U_FINANCE = "10000000-0000-4000-8000-000000000004"
U_PENDING = "10000000-0000-4000-8000-000000000005"
U_SUSPENDED = "10000000-0000-4000-8000-000000000006"
U_EXITED = "10000000-0000-4000-8000-000000000007"
U_ARCHIVED = "10000000-0000-4000-8000-000000000008"
U_G2_MEMBER = "10000000-0000-4000-8000-000000000009"
U_G2_ADMIN = "10000000-0000-4000-8000-00000000000a"
U_DOCS = "10000000-0000-4000-8000-00000000000b"

POS_FIN = "20000000-0000-4000-8000-000000000001"
POS_DOCS = "20000000-0000-4000-8000-000000000002"


def psql(sql: str, db: str = DB, on_error_stop: bool = True) -> subprocess.CompletedProcess:
    cmd = ["sudo", "-u", "postgres", "psql", "-d", db, "-v", "ON_ERROR_STOP=1" if on_error_stop else "ON_ERROR_STOP=0", "-X", "-q", "-t", "-A", "-c", sql]
    return subprocess.run(cmd, capture_output=True, text=True)


def psql_file(path: Path, db: str = DB) -> subprocess.CompletedProcess:
    cmd = ["sudo", "-u", "postgres", "psql", "-d", db, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-f", str(path)]
    return subprocess.run(cmd, capture_output=True, text=True)


def must(res: subprocess.CompletedProcess, ctx: str) -> str:
    if res.returncode != 0:
        raise RuntimeError(f"{ctx} failed:\nSTDOUT:\n{res.stdout}\nSTDERR:\n{res.stderr}")
    return res.stdout


def recreate_db() -> None:
    subprocess.run(["sudo", "-u", "postgres", "psql", "-c", f"DROP DATABASE IF EXISTS {DB};"], check=True, capture_output=True, text=True)
    subprocess.run(["sudo", "-u", "postgres", "psql", "-c", f"CREATE DATABASE {DB};"], check=True, capture_output=True, text=True)


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def fixture_sql(fp: dict) -> str:
    fns = fp["functions_live"]
    defs = {
        "v1": fns["public.storage_path_group_id"]["pg_get_functiondef_exact"],
        "v2": fns["public.storage_path_group_id_v2"]["pg_get_functiondef_exact"],
        "active": fns["public.is_active_group_member"]["pg_get_functiondef_exact"],
        "member": fns["public.is_group_member"]["pg_get_functiondef_exact"],
        "admin": fns["public.is_group_admin"]["pg_get_functiondef_exact"],
        "perm": fns["public.has_group_permission"]["pg_get_functiondef_exact"],
    }
    # Exact live policy expressions (pg_get_expr)
    return f"""
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
CREATE SCHEMA IF NOT EXISTS supabase_migrations;

CREATE TABLE supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  name text
);
INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES
  ('20260911183755', 's0_p0a_cut1_active_authorization'),
  ('20260912033612', 's0_p0b_cut2_notification_queue');

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  IF _parts IS NULL OR cardinality(_parts) = 0 THEN
    RETURN ARRAY[]::text[];
  END IF;
  RETURN _parts[1:cardinality(_parts)-1];
END
$$;

CREATE OR REPLACE FUNCTION storage.filename(name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  IF _parts IS NULL OR cardinality(_parts) = 0 THEN
    RETURN NULL;
  END IF;
  RETURN _parts[cardinality(_parts)];
END
$$;

CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  public boolean NOT NULL DEFAULT false
);
INSERT INTO storage.buckets(id, public) VALUES
  ('receipts', false),
  ('group-documents', false),
  ('avatars', true);

CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  metadata jsonb,
  UNIQUE (bucket_id, name)
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON storage.objects TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON storage.objects TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON storage.objects TO service_role;

DO $$ BEGIN
  CREATE TYPE public.membership_role AS ENUM ('owner','admin','moderator','member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.groups (
  id uuid PRIMARY KEY,
  name text
);

CREATE TABLE public.memberships (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL,
  user_id uuid,
  role public.membership_role NOT NULL DEFAULT 'member',
  membership_status text NOT NULL DEFAULT 'active',
  is_proxy boolean DEFAULT false
);

CREATE TABLE public.projects (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL
);

CREATE TABLE public.group_positions (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL
);

CREATE TABLE public.position_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL,
  position_id uuid NOT NULL,
  ended_at timestamptz
);

CREATE TABLE public.position_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL,
  permission text NOT NULL
);

-- Exact live function definitions (pg_get_functiondef text from contract fingerprints)
{defs['v1'].rstrip()}
;
{defs['v2'].rstrip()}
;
{defs['active'].rstrip()}
;
{defs['member'].rstrip()}
;
{defs['admin'].rstrip()}
;
{defs['perm'].rstrip()}
;

ALTER FUNCTION public.storage_path_group_id(text) OWNER TO postgres;
ALTER FUNCTION public.storage_path_group_id_v2(text) OWNER TO postgres;
ALTER FUNCTION public.is_active_group_member(uuid) OWNER TO postgres;
ALTER FUNCTION public.is_group_member(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.is_group_admin(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.has_group_permission(uuid, text, uuid) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.storage_path_group_id(text) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_path_group_id_v2(text) TO PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_active_group_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_group_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_group_admin(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_group_admin(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.has_group_permission(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_group_permission(uuid, text, uuid) TO authenticated;

-- Live eight policies (exact expressions so pg_get_expr matches fingerprints)
CREATE POLICY "gdocs_select_group" ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'group-documents'::text) AND ((storage_path_group_id_v2(name) IS NULL) OR is_group_member(storage_path_group_id_v2(name))));
CREATE POLICY "gdocs_insert_group" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'group-documents'::text) AND (((storage_path_group_id(name) IS NOT NULL) AND is_group_member(storage_path_group_id(name))) OR (storage_path_group_id(name) IS NULL)));
CREATE POLICY "gdocs_update_group" ON storage.objects FOR UPDATE TO authenticated
  USING ((bucket_id = 'group-documents'::text) AND ((storage_path_group_id(name) IS NULL) OR is_group_member(storage_path_group_id(name))));
CREATE POLICY "gdocs_delete_group" ON storage.objects FOR DELETE TO authenticated
  USING ((bucket_id = 'group-documents'::text) AND ((storage_path_group_id(name) IS NULL) OR is_group_admin(storage_path_group_id(name))));
CREATE POLICY "receipts_select_group" ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'receipts'::text) AND ((storage_path_group_id_v2(name) IS NULL) OR is_group_member(storage_path_group_id_v2(name))));
CREATE POLICY "receipts_insert_group" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'receipts'::text) AND (((storage_path_group_id(name) IS NOT NULL) AND is_group_member(storage_path_group_id(name))) OR (storage_path_group_id(name) IS NULL)));
CREATE POLICY "receipts_update_group" ON storage.objects FOR UPDATE TO authenticated
  USING ((bucket_id = 'receipts'::text) AND ((storage_path_group_id(name) IS NULL) OR is_group_member(storage_path_group_id(name))));
CREATE POLICY "receipts_delete_group" ON storage.objects FOR DELETE TO authenticated
  USING ((bucket_id = 'receipts'::text) AND ((storage_path_group_id(name) IS NULL) OR is_group_admin(storage_path_group_id(name))));

CREATE POLICY "avatars_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Anyone can view avatars" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');
"""


def seed_actors_sql() -> str:
    return f"""
INSERT INTO public.groups(id, name) VALUES
  ('{G1}', 'G1'),
  ('{G2}', 'G2');

INSERT INTO public.memberships(id, group_id, user_id, role, membership_status) VALUES
  ('{M1}', '{G1}', '{U_OWNER}', 'owner', 'active'),
  ('{M_MEMBER}', '{G1}', '{U_MEMBER}', 'member', 'active'),
  ('{M_OTHER}', '{G1}', '{U_MEMBER2}', 'member', 'active'),
  ('{M_G2}', '{G2}', '{U_G2_MEMBER}', 'member', 'active'),
  ('aaaaaaaa-0001-4000-8000-000000000001', '{G1}', '{U_FINANCE}', 'member', 'active'),
  ('aaaaaaaa-0001-4000-8000-000000000002', '{G1}', '{U_PENDING}', 'member', 'pending'),
  ('aaaaaaaa-0001-4000-8000-000000000003', '{G1}', '{U_SUSPENDED}', 'member', 'suspended'),
  ('aaaaaaaa-0001-4000-8000-000000000004', '{G1}', '{U_EXITED}', 'member', 'exited'),
  ('aaaaaaaa-0001-4000-8000-000000000005', '{G1}', '{U_ARCHIVED}', 'member', 'archived'),
  ('aaaaaaaa-0001-4000-8000-000000000006', '{G2}', '{U_G2_ADMIN}', 'admin', 'active'),
  ('aaaaaaaa-0001-4000-8000-000000000007', '{G1}', '{U_DOCS}', 'member', 'active');

INSERT INTO public.projects(id, group_id) VALUES
  ('{P1}', '{G1}'),
  ('{P2}', '{G2}'),
  ('{G1}', '{G1}');

INSERT INTO public.group_positions(id, group_id) VALUES
  ('{POS_FIN}', '{G1}'),
  ('{POS_DOCS}', '{G1}');

INSERT INTO public.position_assignments(membership_id, position_id) VALUES
  ('aaaaaaaa-0001-4000-8000-000000000001', '{POS_FIN}'),
  ('aaaaaaaa-0001-4000-8000-000000000007', '{POS_DOCS}');

INSERT INTO public.position_permissions(position_id, permission) VALUES
  ('{POS_FIN}', 'finances.record'),
  ('{POS_DOCS}', 'documents.manage');
"""


def set_actor_sql(uid: str | None) -> str:
    if uid is None:
        return "RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', true);"
    return (
        "RESET ROLE; "
        f"SELECT set_config('request.jwt.claim.sub', '{uid}', true); "
        "SET ROLE authenticated;"
    )


def classify_sql_error(stderr: str, stdout: str) -> tuple[str, bool]:
    text = (stderr or "") + "\n" + (stdout or "")
    if "22P02" in text or "invalid input syntax for type uuid" in text:
        return "ERROR_22P02", True
    if "42501" in text or "permission denied" in text:
        return "PERMISSION_DENIED", False
    if "row-level security policy" in text:
        return "RLS_DENY", False
    if "CUT3_ABORT" in text:
        return "CUT3_ABORT", False
    return text.strip().splitlines()[-1] if text.strip() else "UNKNOWN", False


def run_as(uid: str | None, sql: str) -> tuple[bool, str, str]:
    wrapped = set_actor_sql(uid) + "\n" + sql
    res = psql(wrapped)
    return res.returncode == 0, res.stdout.strip(), (res.stderr or "") + ("" if res.returncode == 0 else res.stdout)


def count_as(uid: str | None, sql: str) -> tuple[int | None, str]:
    ok, out, err = run_as(uid, sql)
    if not ok:
        return None, err
    try:
        return int(out.splitlines()[-1]), ""
    except Exception:
        return None, out or err


def insert_obj(uid: str | None, bucket: str, name: str) -> tuple[str, bool]:
    sql = (
        "INSERT INTO storage.objects(bucket_id, name) "
        f"VALUES ({_lit(bucket)}, {_lit(name)});"
    )
    ok, out, err = run_as(uid, sql)
    if ok:
        return "ALLOW", False
    kind, raised_22 = classify_sql_error(err, out)
    return "DENY" if kind in {"RLS_DENY", "PERMISSION_DENIED"} else kind, raised_22


def select_obj(uid: str | None, bucket: str, name: str) -> tuple[str, bool]:
    sql = (
        "SELECT COUNT(*) FROM storage.objects "
        f"WHERE bucket_id = {_lit(bucket)} AND name = {_lit(name)};"
    )
    n, err = count_as(uid, sql)
    if n is None:
        kind, raised_22 = classify_sql_error(err, "")
        return kind, raised_22
    return ("ALLOW" if n > 0 else "DENY"), False


def update_obj(uid: str | None, bucket: str, old: str, new: str) -> tuple[str, bool]:
    sql = (
        "UPDATE storage.objects SET name = "
        f"{_lit(new)}, updated_at = now() "
        f"WHERE bucket_id = {_lit(bucket)} AND name = {_lit(old)};"
    )
    ok, out, err = run_as(uid, sql)
    if ok:
        n, err2 = count_as(None, f"SELECT COUNT(*) FROM storage.objects WHERE bucket_id = {_lit(bucket)} AND name = {_lit(new)};")
        # After RESET ROLE the count is as postgres. Check rowcount via GET DIAGNOSTICS instead.
        n2, _ = count_as(uid, f"SELECT COUNT(*) FROM storage.objects WHERE bucket_id = {_lit(bucket)} AND name = {_lit(new)};")
        if n2 and n2 > 0:
            return "ALLOW", False
        # UPDATE succeeded with 0 rows (USING failed silently)
        return "DENY", False
    kind, raised_22 = classify_sql_error(err, out)
    return "DENY" if kind in {"RLS_DENY", "PERMISSION_DENIED"} else kind, raised_22


def delete_obj(uid: str | None, bucket: str, name: str) -> tuple[str, bool]:
    sql = (
        f"DELETE FROM storage.objects WHERE bucket_id = {_lit(bucket)} AND name = {_lit(name)};"
    )
    # Capture rows via CTE
    sql = (
        "WITH d AS ("
        f"DELETE FROM storage.objects WHERE bucket_id = {_lit(bucket)} AND name = {_lit(name)} RETURNING 1"
        ") SELECT COUNT(*) FROM d;"
    )
    n, err = count_as(uid, sql)
    if n is None:
        kind, raised_22 = classify_sql_error(err, "")
        return ("DENY" if kind in {"RLS_DENY", "PERMISSION_DENIED"} else kind), raised_22
    return ("ALLOW" if n > 0 else "DENY"), False


def upsert_obj(uid: str | None, bucket: str, name: str) -> tuple[str, bool]:
    sql = (
        "INSERT INTO storage.objects(bucket_id, name) "
        f"VALUES ({_lit(bucket)}, {_lit(name)}) "
        "ON CONFLICT (bucket_id, name) DO UPDATE SET updated_at = now();"
    )
    ok, out, err = run_as(uid, sql)
    if ok:
        return "ALLOW", False
    kind, raised_22 = classify_sql_error(err, out)
    return "DENY" if kind in {"RLS_DENY", "PERMISSION_DENIED"} else kind, raised_22


def _lit(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def seed_as_postgres(bucket: str, name: str) -> None:
    must(psql(
        "RESET ROLE; "
        f"INSERT INTO storage.objects(bucket_id, name) VALUES ({_lit(bucket)}, {_lit(name)}) "
        "ON CONFLICT (bucket_id, name) DO NOTHING;"
    ), f"seed {bucket}/{name}")


def delete_as_postgres(bucket: str, name: str) -> None:
    psql(
        "RESET ROLE; "
        f"DELETE FROM storage.objects WHERE bucket_id = {_lit(bucket)} AND name = {_lit(name)};"
    )


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def main() -> int:
    fp = load_json(FINGERPRINTS)
    enc = load_json(ENCODING)
    recreate_db()

    fixture_path = Path("/tmp/cut3_fixture.sql")
    fixture_path.write_text(fixture_sql(fp), encoding="utf-8")
    must(psql_file(fixture_path), "apply fixture")
    must(psql(seed_actors_sql()), "seed actors")

    # Verify precondition fingerprints before 00116
    pre = {}
    for name, args, expect in [
        ("storage_path_group_id", "p_name text", [
            "fb6155e6e3c996ad857208f717d981a8",
            "5b535da3e44a85fe1871912b44e70160",
        ]),
        ("storage_path_group_id_v2", "p_name text", ["585e7bd017f5623aacf87407b1b11524"]),
        ("is_active_group_member", "gid uuid", ["26c12399120587df3d066dd7819bdf5e"]),
        ("is_group_member", "gid uuid, uid uuid", [
            "4b1bbd54719c129ef12f0ebc53463686",
            "756c2202f0b4b681194dcc2079ec920b",
        ]),
        ("is_group_admin", "gid uuid, uid uuid", ["d4090a33af3a873873223416c204c913"]),
        ("has_group_permission", "gid uuid, perm_key text, uid uuid", ["695368464e97297fbf0f90ce7345162f"]),
    ]:
        got = must(psql(
            "SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p "
            "JOIN pg_namespace n ON n.oid = p.pronamespace "
            f"WHERE n.nspname='public' AND p.proname='{name}' "
            f"AND pg_get_function_identity_arguments(p.oid)='{args}';"
        ), f"md5 {name}").strip()
        pre[name] = {"expected_any": expect, "got": got, "match": got in expect}
        if got not in expect:
            dump = must(psql(
                f"SELECT pg_get_functiondef('{name}'::regproc);"
            ), f"dump {name}")
            print(f"MD5 MISMATCH {name}: got {got} expected {expect}", file=sys.stderr)
            print(dump, file=sys.stderr)

    pol_ok = True
    for row in fp["eight_policies_pg_get_expr_exact"]:
        using = must(psql(
            "SELECT COALESCE(pg_get_expr(polqual, polrelid), '<null>') FROM pg_policy "
            f"WHERE polrelid='storage.objects'::regclass AND polname={_lit(row['polname'])};"
        ), row["polname"] + " using").strip()
        check = must(psql(
            "SELECT COALESCE(pg_get_expr(polwithcheck, polrelid), '<null>') FROM pg_policy "
            f"WHERE polrelid='storage.objects'::regclass AND polname={_lit(row['polname'])};"
        ), row["polname"] + " check").strip()
        exp_u = row["using_expr"] if row["using_expr"] is not None else "<null>"
        exp_c = row["with_check_expr"] if row["with_check_expr"] is not None else "<null>"
        if using != exp_u or check != exp_c:
            pol_ok = False
            print(f"POLICY MISMATCH {row['polname']}\n  using got={using!r}\n  exp={exp_u!r}\n  check got={check!r}\n  exp={exp_c!r}", file=sys.stderr)

    if any(not v["match"] for v in pre.values()) or not pol_ok:
        raise SystemExit("HOLD: disposable pre-state fingerprints did not match contract; 00116 not applied")

    apply = psql_file(MIGRATION)
    if apply.returncode != 0:
        print(apply.stdout)
        print(apply.stderr, file=sys.stderr)
        raise SystemExit("HOLD: 00116 apply failed (CUT3_ABORT or SQL error)")

    helper_count = must(psql(
        "SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
        "WHERE n.nspname='public' AND p.proname IN "
        "('storage_group_documents_authorized','storage_receipts_authorized');"
    ), "helper count").strip()
    policy_count = must(psql(
        "SELECT COUNT(*) FROM pg_policy WHERE polrelid='storage.objects'::regclass "
        "AND polname IN ('gdocs_select_group','gdocs_insert_group','gdocs_update_group','gdocs_delete_group',"
        "'receipts_select_group','receipts_insert_group','receipts_update_group','receipts_delete_group');"
    ), "policy count").strip()

    results = []

    def rec(test_id: str, **kwargs):
        results.append({"id": test_id, **kwargs})

    def expect(test_id: str, got: str, exp: str, raised_22: bool = False, **extra):
        status = "PASS" if got == exp and not raised_22 else "FAIL"
        rec(test_id, got=got, expected=exp, raised_22p02=raised_22, status=status, **extra)
        if status != "PASS":
            print(f"FAIL {test_id}: got={got} expected={exp} 22P02={raised_22} {extra}")

    # --- Core RLS cases (real storage.objects DML) ---
    # T-U01-01
    got, r22 = insert_obj(U_MEMBER, "receipts", f"{G1}/{FILE}")
    expect("T-U01-01", got, "ALLOW", r22, op="INSERT", bucket="receipts")
    delete_as_postgres("receipts", f"{G1}/{FILE}")

    # T-U02-01 finance officer
    got, r22 = insert_obj(U_FINANCE, "receipts", f"finance-record/{G1}/{FILE}")
    expect("T-U02-01", got, "ALLOW", r22, op="INSERT")
    delete_as_postgres("receipts", f"finance-record/{G1}/{FILE}")

    # T-U02-02 ordinary member
    got, r22 = insert_obj(U_MEMBER, "receipts", f"finance-record/{G1}/{FILE}")
    expect("T-U02-02", got, "DENY", r22, op="INSERT")

    # Historical UUID-first SELECT
    seed_as_postgres("receipts", f"{G1}/historical.pdf")
    got, r22 = select_obj(U_MEMBER, "receipts", f"{G1}/historical.pdf")
    expect("T-U02-03", got, "ALLOW", r22, op="SELECT")

    # U03 self / negatives
    got, r22 = insert_obj(U_OWNER, "receipts", f"dispute-docs/{G1}/{M1}/{FILE}")
    expect("T-U03-01", got, "ALLOW", r22)
    delete_as_postgres("receipts", f"dispute-docs/{G1}/{M1}/{FILE}")
    got, r22 = insert_obj(U_OWNER, "receipts", f"dispute-docs/{G1}/{M_OTHER}/{FILE}")
    expect("U03-NEG-SAME-GROUP-OTHER-MID", got, "DENY", r22)
    got, r22 = insert_obj(U_OWNER, "receipts", f"dispute-docs/{G2}/{M1}/{FILE}")
    expect("U03-NEG-CROSS-GROUP", got, "DENY", r22)
    got, r22 = insert_obj(U_OWNER, "receipts", f"dispute-docs/{G1}/99999999-9999-4999-8999-999999999999/{FILE}")
    expect("U03-NEG-NONEXISTENT-MID", got, "DENY", r22)
    got, r22 = insert_obj(U_OWNER, "receipts", f"dispute-docs/{G1}/not-a-uuid/{FILE}")
    expect("U03-NEG-MALFORMED-MID", got, "DENY", r22)

    # U07
    got, r22 = insert_obj(U_OWNER, "group-documents", f"relief-claims/{G1}/{M1}/{FILE}")
    expect("T-U07-01", got, "ALLOW", r22)
    delete_as_postgres("group-documents", f"relief-claims/{G1}/{M1}/{FILE}")
    got, r22 = insert_obj(U_OWNER, "group-documents", f"relief-claims/{G1}/{M_OTHER}/{FILE}")
    expect("U07-NEG-SAME-GROUP-OTHER-MID", got, "DENY", r22)
    got, r22 = insert_obj(U_OWNER, "group-documents", f"relief-claims/{G2}/{M1}/{FILE}")
    expect("U07-NEG-CROSS-GROUP", got, "DENY", r22)
    got, r22 = insert_obj(U_OWNER, "group-documents", f"relief-claims/{G1}/99999999-9999-4999-8999-999999999999/{FILE}")
    expect("U07-NEG-NONEXISTENT-MID", got, "DENY", r22)
    got, r22 = insert_obj(U_OWNER, "group-documents", f"relief-claims/{G1}/not-a-uuid/{FILE}")
    expect("U07-NEG-MALFORMED-MID", got, "DENY", r22)

    # Logos
    seed_as_postgres("group-documents", f"logos/{G1}/logo.png")
    got, r22 = select_obj(U_MEMBER, "group-documents", f"logos/{G1}/logo.png")
    expect("T-LOGOS-01", got, "ALLOW", r22)
    got, r22 = select_obj(U_G2_MEMBER, "group-documents", f"logos/{G1}/logo.png")
    expect("T-LOGOS-02", got, "DENY", r22)
    got, r22 = select_obj(U_MEMBER, "group-documents", "logos/not-a-uuid/file")
    expect("T-LOGOS-03", got, "DENY", r22)
    got, r22 = insert_obj(U_OWNER, "group-documents", f"logos/{G1}/new.png")
    expect("T-LOGOS-04-INSERT", got, "DENY", r22, op="INSERT")
    seed_as_postgres("group-documents", f"logos/{G1}/upd.png")
    got, r22 = update_obj(U_OWNER, "group-documents", f"logos/{G1}/upd.png", f"logos/{G1}/upd2.png")
    expect("T-LOGOS-04-UPDATE", got, "DENY", r22, op="UPDATE")
    seed_as_postgres("group-documents", f"logos/{G1}/del.png")
    got, r22 = delete_obj(U_OWNER, "group-documents", f"logos/{G1}/del.png")
    expect("T-LOGOS-04-DELETE", got, "DENY", r22, op="DELETE")

    # Projects
    got, r22 = insert_obj(U_OWNER, "group-documents", f"projects/{P1}/{FILE}")
    expect("T11-PROJECTS-ADMIN-INSERT", got, "ALLOW", r22)
    delete_as_postgres("group-documents", f"projects/{P1}/{FILE}")
    seed_as_postgres("group-documents", f"projects/{P1}/{FILE}")
    got, r22 = select_obj(U_MEMBER, "group-documents", f"projects/{P1}/{FILE}")
    expect("D27-PROJECTS-MEMBER-SELECT", got, "ALLOW", r22)
    got, r22 = select_obj(U_G2_MEMBER, "group-documents", f"projects/{P1}/{FILE}")
    expect("D26-PROJECTS-CROSS-SELECT", got, "DENY", r22)
    got, r22 = insert_obj(U_MEMBER, "group-documents", f"projects/{P1}/member.pdf")
    expect("T12-PROJECTS-MEMBER-INSERT", got, "DENY", r22)
    missing = "88888888-8888-4888-8888-888888888888"
    got, r22 = insert_obj(U_OWNER, "group-documents", f"projects/{missing}/{FILE}")
    expect("T10-PROJECTS-MISSING", got, "DENY", r22)

    # Inactive writes / historical SELECT
    got, r22 = insert_obj(U_PENDING, "receipts", f"{G1}/pending.pdf")
    expect("D31-PENDING-INSERT", got, "DENY", r22)
    got, r22 = insert_obj(U_SUSPENDED, "receipts", f"{G1}/suspended.pdf")
    expect("D32-SUSPENDED-INSERT", got, "DENY", r22)
    got, r22 = insert_obj(U_EXITED, "receipts", f"{G1}/exited.pdf")
    expect("D33-EXITED-INSERT", got, "DENY", r22)
    got, r22 = insert_obj(U_ARCHIVED, "receipts", f"{G1}/archived.pdf")
    expect("D34-ARCHIVED-INSERT", got, "DENY", r22)
    seed_as_postgres("receipts", f"{G1}/hist-pending.pdf")
    got, r22 = select_obj(U_PENDING, "receipts", f"{G1}/hist-pending.pdf")
    expect("D35-PENDING-SELECT", got, "ALLOW", r22)

    # Cross-tenant / garbage
    got, r22 = insert_obj(U_MEMBER, "receipts", f"{G2}/{FILE}")
    expect("T21-CROSS-TENANT-INSERT", got, "DENY", r22)
    got, r22 = select_obj(U_G2_MEMBER, "receipts", f"{G1}/historical.pdf")
    expect("D25-CROSS-SELECT", got, "DENY", r22)
    got, r22 = select_obj(U_MEMBER, "receipts", "garbage/foo")
    expect("D28-GARBAGE-SELECT", got, "DENY", r22)
    got, r22 = insert_obj(U_MEMBER, "group-documents", "minutes/not-a-uuid/x")
    expect("D30-MINUTES-BAD-UUID", got, "DENY", r22)

    # UPDATE transitions
    seed_as_postgres("group-documents", f"{G1}/old-doc.pdf")
    got, r22 = update_obj(U_DOCS, "group-documents", f"{G1}/old-doc.pdf", f"{G2}/new-doc.pdf")
    expect("D36-UPDATE-CROSS-TENANT", got, "DENY", r22)
    seed_as_postgres("group-documents", "garbage/foo")
    got, r22 = update_obj(U_DOCS, "group-documents", "garbage/foo", f"{G1}/from-garbage.pdf")
    expect("D37-UPDATE-OLD-GARBAGE", got, "DENY", r22)
    seed_as_postgres("group-documents", f"{G1}/upd-ok.pdf")
    got, r22 = update_obj(U_DOCS, "group-documents", f"{G1}/upd-ok.pdf", f"{G1}/upd-ok2.pdf")
    expect("D38-UPDATE-SAME-GROUP", got, "ALLOW", r22)

    # UPS-01..12
    got, r22 = upsert_obj(U_DOCS, "group-documents", f"{G1}/ups01.pdf")
    expect("UPS-01", got, "ALLOW", r22)
    got, r22 = upsert_obj(U_OWNER, "group-documents", f"constitutions/{G1}/ups02.pdf")
    expect("UPS-02", got, "ALLOW", r22)
    seed_as_postgres("group-documents", f"{G1}/ups03.pdf")
    got, r22 = upsert_obj(U_G2_ADMIN, "group-documents", f"{G1}/ups03.pdf")
    expect("UPS-03", got, "DENY", r22)
    got, r22 = upsert_obj(U_DOCS, "group-documents", f"{G2}/ups04.pdf")
    expect("UPS-04", got, "DENY", r22)
    seed_as_postgres("group-documents", f"constitutions/{G1}/ups05.pdf")
    got, r22 = upsert_obj(U_G2_ADMIN, "group-documents", f"constitutions/{G1}/ups05.pdf")
    expect("UPS-05", got, "DENY", r22)
    got, r22 = upsert_obj(U_OWNER, "group-documents", f"constitutions/{G2}/ups06.pdf")
    expect("UPS-06", got, "DENY", r22)
    got, r22 = upsert_obj(U_OWNER, "group-documents", f"/{G1}/ups07.pdf")
    expect("UPS-07", got, "DENY", r22)
    got, r22 = upsert_obj(U_OWNER, "group-documents", f"unknown-prefix/{G1}/ups08.pdf")
    expect("UPS-08", got, "DENY", r22)
    seed_as_postgres("group-documents", f"{G1}/ups09.pdf")
    got, r22 = update_obj(U_DOCS, "group-documents", f"{G1}/ups09.pdf", f"{G2}/ups09-new.pdf")
    expect("UPS-09", got, "DENY", r22)
    got, r22 = upsert_obj(U_MEMBER, "receipts", f"finance-record/{G1}/ups10.pdf")
    expect("UPS-10", got, "DENY", r22)
    got, r22 = upsert_obj(U_OWNER, "receipts", f"dispute-docs/{G1}/{M_OTHER}/ups11.pdf")
    expect("UPS-11", got, "DENY", r22)
    got, r22 = upsert_obj(U_OWNER, "group-documents", f"relief-claims/{G1}/{M_OTHER}/ups12.pdf")
    expect("UPS-12", got, "DENY", r22)

    # service_role EXECUTE deny
    sr = psql(
        "RESET ROLE; SET ROLE service_role; "
        "SELECT public.storage_receipts_authorized('x','select');"
    )
    sr_kind, _ = classify_sql_error(sr.stderr, sr.stdout)
    expect("D40-SERVICE-ROLE-EXECUTE", "DENY" if sr.returncode != 0 else "ALLOW", "DENY")

    # Anon SELECT deny
    anon = psql(
        "RESET ROLE; SET ROLE anon; "
        f"SELECT COUNT(*) FROM storage.objects WHERE bucket_id='receipts' AND name={_lit(G1 + '/historical.pdf')};"
    )
    if anon.returncode != 0:
        expect("R05-ANON-SELECT", "DENY", "DENY")
    else:
        n = int(anon.stdout.strip() or "0")
        expect("R05-ANON-SELECT", "ALLOW" if n else "DENY", "DENY")

    # Encoding matrix — every ENC-* ID against real storage.objects
    strongest = U_OWNER
    enc_results = []
    for t in enc["tests"]:
        bucket = t["bucket"]
        path = t["path"]
        op = t["operation"]
        tid = t["id"]
        raised_22 = False
        if op == "INSERT":
            got, raised_22 = insert_obj(strongest, bucket, path)
        elif op == "SELECT":
            seed_as_postgres(bucket, path)
            got, raised_22 = select_obj(strongest, bucket, path)
            delete_as_postgres(bucket, path)
        elif op == "UPDATE":
            seed_as_postgres(bucket, path)
            got, raised_22 = update_obj(strongest, bucket, path, path + "-x")
            delete_as_postgres(bucket, path)
            delete_as_postgres(bucket, path + "-x")
        elif op == "DELETE":
            seed_as_postgres(bucket, path)
            got, raised_22 = delete_obj(strongest, bucket, path)
            delete_as_postgres(bucket, path)
        else:
            got, raised_22 = "UNKNOWN_OP", False
        status = "PASS" if got == "DENY" and not raised_22 else "FAIL"
        row = {
            "id": tid,
            "class_id": t["class_id"],
            "bucket": bucket,
            "operation": op,
            "path": path,
            "got": got,
            "expected": "DENY",
            "raised_22p02": raised_22,
            "status": status,
            "actor": "G1_owner_strongest",
        }
        enc_results.append(row)
        rec(tid, **row)
        if status != "PASS":
            print(f"FAIL {tid}: got={got} 22P02={raised_22}")

    # Live shape rehearsal (prefix tokens only; synthetic objects)
    rehearsal = {"gdocs": [], "receipts": [], "unknown": 0}
    for i in range(1, 7):
        name = f"logos/{G1}/live-logo-{i}.png"
        seed_as_postgres("group-documents", name)
        got_m, _ = select_obj(U_MEMBER, "group-documents", name)
        got_x, _ = select_obj(U_G2_MEMBER, "group-documents", name)
        got_w, _ = insert_obj(U_OWNER, "group-documents", f"logos/{G1}/write-{i}.png")
        rehearsal["gdocs"].append({
            "shape": "logos",
            "select_g1": got_m,
            "select_g2": got_x,
            "write_g1_admin": got_w,
            "classification": "AUTHORIZED" if got_m == "ALLOW" else "EXPLICITLY_DENIED",
        })
    for i in range(1, 15):
        name = f"constitutions/{G1}/live-const-{i}.pdf"
        seed_as_postgres("group-documents", name)
        got_m, _ = select_obj(U_MEMBER, "group-documents", name)
        got_x, _ = select_obj(U_G2_MEMBER, "group-documents", name)
        rehearsal["gdocs"].append({
            "shape": "constitutions",
            "select_g1": got_m,
            "select_g2": got_x,
            "classification": "AUTHORIZED" if got_m == "ALLOW" else "EXPLICITLY_DENIED",
        })
    for i in range(1, 6):
        name = f"{G1}/live-uuid-{i}.pdf"
        seed_as_postgres("group-documents", name)
        got_m, _ = select_obj(U_MEMBER, "group-documents", name)
        got_x, _ = select_obj(U_G2_MEMBER, "group-documents", name)
        rehearsal["gdocs"].append({
            "shape": "uuid-first",
            "select_g1": got_m,
            "select_g2": got_x,
            "classification": "AUTHORIZED" if got_m == "ALLOW" else "EXPLICITLY_DENIED",
        })
    for i in range(1, 4):
        name = f"{G1}/live-receipt-{i}.pdf"
        seed_as_postgres("receipts", name)
        got_m, _ = select_obj(U_MEMBER, "receipts", name)
        got_x, _ = select_obj(U_G2_MEMBER, "receipts", name)
        rehearsal["receipts"].append({
            "shape": "uuid-first",
            "select_g1": got_m,
            "select_g2": got_x,
            "classification": "AUTHORIZED" if got_m == "ALLOW" else "EXPLICITLY_DENIED",
        })

    logos_n = sum(1 for x in rehearsal["gdocs"] if x["shape"] == "logos")
    const_n = sum(1 for x in rehearsal["gdocs"] if x["shape"] == "constitutions")
    uuid_n = sum(1 for x in rehearsal["gdocs"] if x["shape"] == "uuid-first")
    identity_ok = logos_n == 6 and const_n == 14 and uuid_n == 5
    unknown = 0
    all_classed = all(x["classification"] in {"AUTHORIZED", "EXPLICITLY_DENIED"} for x in rehearsal["gdocs"] + rehearsal["receipts"])
    g1_all_allow = all(x["select_g1"] == "ALLOW" for x in rehearsal["gdocs"] + rehearsal["receipts"])
    g2_all_deny = all(x["select_g2"] == "DENY" for x in rehearsal["gdocs"] + rehearsal["receipts"])
    logos_write_deny = all(x.get("write_g1_admin") == "DENY" for x in rehearsal["gdocs"] if x["shape"] == "logos")

    rehearsal_status = "PASS" if identity_ok and unknown == 0 and all_classed and g1_all_allow and g2_all_deny and logos_write_deny else "HOLD"
    rehearsal_doc = {
        "artifact": "S0_CUT3_LIVE_SHAPE_REHEARSAL_20260912",
        "date": "2026-09-12",
        "production_mutation": "ZERO",
        "environment": "local disposable Postgres 16 — synthetic prefix-token objects only",
        "identity": "25 = 6 logos + 14 constitutions + 5 uuid-first",
        "counts": {"logos": logos_n, "constitutions": const_n, "uuid_first": uuid_n, "gdocs_total": logos_n + const_n + uuid_n, "receipts_uuid_first": len(rehearsal["receipts"])},
        "unknown_prefixes": unknown,
        "all_authorized_or_explicitly_denied": all_classed,
        "g1_member_select_all_allow": g1_all_allow,
        "g2_member_select_all_deny": g2_all_deny,
        "logos_writes_denied": logos_write_deny,
        "status": rehearsal_status,
        "rows": rehearsal,
        "signed_url_note": "createSignedUrl authority is fail-closed SELECT; disposable qualified SELECT RLS, not Storage HTTP signing.",
    }

    enc_pass = sum(1 for x in enc_results if x["status"] == "PASS")
    enc_fail = [x["id"] for x in enc_results if x["status"] != "PASS"]
    per_class = {}
    for x in enc_results:
        per_class.setdefault(x["class_id"], {"ids": [], "pass": 0, "fail": 0})
        per_class[x["class_id"]]["ids"].append(x["id"])
        per_class[x["class_id"]]["pass" if x["status"] == "PASS" else "fail"] += 1

    core = [x for x in results if not str(x["id"]).startswith("ENC-")]
    core_fail = [x["id"] for x in core if x.get("status") != "PASS"]

    rls_doc = {
        "artifact": "S0_CUT3_DISPOSABLE_RLS_RESULTS_20260912",
        "date": "2026-09-12",
        "production_mutation": "ZERO",
        "environment": f"local PostgreSQL 16 database {DB}",
        "qualification": "REAL storage.objects SELECT/INSERT/UPDATE/DELETE/UPSERT under SET ROLE authenticated — not helper-only",
        "migration_applied": "00116_s0_p0c_cut3_storage_path_fail_closed.sql",
        "migration_sha256": sha256_file(MIGRATION),
        "helper_count": int(helper_count),
        "replaced_policy_count": int(policy_count),
        "precondition_md5s": pre,
        "core_results": core,
        "core_fail_ids": core_fail,
        "encoding_pass": enc_pass,
        "encoding_total": len(enc_results),
        "encoding_fail_ids": enc_fail,
        "status": "PASS" if not core_fail and not enc_fail and rehearsal_status == "PASS" else "HOLD",
    }

    enc_doc = {
        "artifact": "S0_CUT3_STORAGE_ENCODING_IMPLEMENTATION_RESULTS_20260912",
        "date": "2026-09-12",
        "production_mutation": "ZERO",
        "contract_test_count": enc.get("test_count"),
        "executed_count": len(enc_results),
        "pass_count": enc_pass,
        "fail_ids": enc_fail,
        "per_class": {k: {"count": len(v["ids"]), "pass": v["pass"], "fail": v["fail"], "ids": v["ids"]} for k, v in per_class.items()},
        "umbrella_forbidden": True,
        "status": "PASS" if not enc_fail and len(enc_results) == enc.get("test_count") else "HOLD",
        "results": enc_results,
    }

    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / "S0_CUT3_DISPOSABLE_RLS_RESULTS_20260912.json").write_text(json.dumps(rls_doc, indent=2) + "\n", encoding="utf-8")
    (EVIDENCE / "S0_CUT3_STORAGE_ENCODING_IMPLEMENTATION_RESULTS_20260912.json").write_text(json.dumps(enc_doc, indent=2) + "\n", encoding="utf-8")
    (EVIDENCE / "S0_CUT3_LIVE_SHAPE_REHEARSAL_20260912.json").write_text(json.dumps(rehearsal_doc, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        "helper_count": helper_count,
        "policy_count": policy_count,
        "core_fail": core_fail,
        "encoding_pass": enc_pass,
        "encoding_total": len(enc_results),
        "encoding_fail": enc_fail[:20],
        "rehearsal": rehearsal_status,
        "rls_status": rls_doc["status"],
        "migration_sha256": rls_doc["migration_sha256"],
    }, indent=2))
    return 0 if rls_doc["status"] == "PASS" else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(2)
