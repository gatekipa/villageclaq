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
from dataclasses import dataclass
from pathlib import Path

import psycopg2
import psycopg2.extensions

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/00116_s0_p0c_cut3_storage_path_fail_closed.sql"
FINGERPRINTS = ROOT / "docs/evidence/S0_CUT3_STORAGE_LIVE_CATALOG_FINGERPRINTS_20260912.json"
HEXDEFS = ROOT / "scripts/_cut3_live_functiondef_hex.json"
ENCODING = ROOT / "docs/evidence/S0_CUT3_STORAGE_ENCODING_TEST_MATRIX_20260912.json"
EVIDENCE = ROOT / "docs/evidence"

LIVE_MD5 = {
    "storage_path_group_id": "fb6155e6e3c996ad857208f717d981a8",
    "storage_path_group_id_v2": "585e7bd017f5623aacf87407b1b11524",
    "is_active_group_member": "26c12399120587df3d066dd7819bdf5e",
    "is_group_member": "4b1bbd54719c129ef12f0ebc53463686",
    "is_group_admin": "d4090a33af3a873873223416c204c913",
    "has_group_permission": "695368464e97297fbf0f90ce7345162f",
}
EXPECTED_DENY_MECHANISMS = frozenset({"RLS_DENY", "PERMISSION_DENIED", "ZERO_ROWS"})

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
U_FIN_MANAGE = "10000000-0000-4000-8000-00000000000c"

POS_FIN = "20000000-0000-4000-8000-000000000001"
POS_DOCS = "20000000-0000-4000-8000-000000000002"
POS_FIN_MANAGE = "20000000-0000-4000-8000-000000000003"

M_FINANCE = "aaaaaaaa-0001-4000-8000-000000000001"
M_PENDING = "aaaaaaaa-0001-4000-8000-000000000002"
M_SUSPENDED = "aaaaaaaa-0001-4000-8000-000000000003"
M_FIN_MANAGE = "aaaaaaaa-0001-4000-8000-000000000008"


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
    subprocess.run(["sudo", "-u", "postgres", "psql", "-c",
                    "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ubuntu') THEN CREATE ROLE ubuntu SUPERUSER LOGIN; END IF; END $$;"],
                   check=True, capture_output=True, text=True)
    subprocess.run(["sudo", "-u", "postgres", "psql", "-c", f"DROP DATABASE IF EXISTS {DB};"], check=True, capture_output=True, text=True)
    subprocess.run(["sudo", "-u", "postgres", "psql", "-c", f"CREATE DATABASE {DB} OWNER ubuntu;"], check=True, capture_output=True, text=True)


def connect():
    return psycopg2.connect(dbname=DB, user="ubuntu", host="/var/run/postgresql")


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def live_function_creates() -> str:
    """Reproduce exact production pg_get_functiondef bytes (CRLF included)."""
    hexdoc = load_json(HEXDEFS)
    order = [
        "public.storage_path_group_id",
        "public.storage_path_group_id_v2",
        "public.is_active_group_member",
        "public.is_group_member",
        "public.is_group_admin",
        "public.has_group_permission",
    ]
    parts: list[str] = []
    for key in order:
        raw = bytes.fromhex(hexdoc["functions"][key]["hex"]).decode("utf-8")
        parts.append(raw.rstrip() + ";\n")
    return "\n".join(parts)


def fixture_sql(fp: dict) -> str:
    del fp  # policies below are the exact live pg_get_expr strings
    defs = live_function_creates()
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
GRANT INSERT, SELECT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON storage.objects TO postgres WITH GRANT OPTION;

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

-- Exact live function definitions from production pg_get_functiondef hex
{defs}

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
GRANT EXECUTE ON FUNCTION public.is_group_admin(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_group_permission(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_group_permission(uuid, text, uuid) TO authenticated, service_role;

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
  ('{M_FINANCE}', '{G1}', '{U_FINANCE}', 'member', 'active'),
  ('{M_PENDING}', '{G1}', '{U_PENDING}', 'member', 'pending'),
  ('{M_SUSPENDED}', '{G1}', '{U_SUSPENDED}', 'member', 'suspended'),
  ('aaaaaaaa-0001-4000-8000-000000000004', '{G1}', '{U_EXITED}', 'member', 'exited'),
  ('aaaaaaaa-0001-4000-8000-000000000005', '{G1}', '{U_ARCHIVED}', 'member', 'archived'),
  ('aaaaaaaa-0001-4000-8000-000000000006', '{G2}', '{U_G2_ADMIN}', 'admin', 'active'),
  ('aaaaaaaa-0001-4000-8000-000000000007', '{G1}', '{U_DOCS}', 'member', 'active'),
  ('{M_FIN_MANAGE}', '{G1}', '{U_FIN_MANAGE}', 'member', 'active');

INSERT INTO public.projects(id, group_id) VALUES
  ('{P1}', '{G1}'),
  ('{P2}', '{G2}'),
  ('{G1}', '{G1}');

INSERT INTO public.group_positions(id, group_id) VALUES
  ('{POS_FIN}', '{G1}'),
  ('{POS_DOCS}', '{G1}'),
  ('{POS_FIN_MANAGE}', '{G1}');

INSERT INTO public.position_assignments(membership_id, position_id) VALUES
  ('{M_FINANCE}', '{POS_FIN}'),
  ('aaaaaaaa-0001-4000-8000-000000000007', '{POS_DOCS}'),
  ('{M_FIN_MANAGE}', '{POS_FIN_MANAGE}');

INSERT INTO public.position_permissions(position_id, permission) VALUES
  ('{POS_FIN}', 'finances.record'),
  ('{POS_DOCS}', 'documents.manage'),
  ('{POS_FIN_MANAGE}', 'finances.manage');
"""


CONN = None


@dataclass
class DmlResult:
    actual_result: str
    denial_mechanism: str | None
    sqlstate: str | None
    unexpected_exception: bool
    error_text: str | None = None

    def as_row(self, test_id: str, operation: str, expected_result: str) -> dict:
        passed = (not self.unexpected_exception) and (
            (expected_result == "ALLOW" and self.actual_result == "ALLOW")
            or (
                expected_result == "DENY"
                and self.actual_result == "DENY"
                and self.denial_mechanism in EXPECTED_DENY_MECHANISMS
            )
        )
        return {
            "test_id": test_id,
            "operation": operation,
            "expected_result": expected_result,
            "actual_result": self.actual_result,
            "denial_mechanism": self.denial_mechanism,
            "SQLSTATE": self.sqlstate,
            "unexpected_exception": self.unexpected_exception,
            "pass": passed,
        }


def classify_exc(exc: Exception) -> DmlResult:
    """Classify a DML exception. Only expected security paths are DENY.

    Expected DENY: 42501 RLS policy violation, or 42501 privilege denial.
    Everything else (syntax, missing relation/function, 22P02, aborted txn,
    unexpected cast, programming error, connection) is unexpected_exception.
    """
    text = str(exc) or ""
    pgcode = getattr(exc, "pgcode", None)
    low = text.lower()
    if pgcode == "42501" and "row-level security" in low:
        return DmlResult("DENY", "RLS_DENY", pgcode, False, text)
    if pgcode == "42501":
        return DmlResult("DENY", "PERMISSION_DENIED", pgcode, False, text)
    return DmlResult("ERROR", None, pgcode, True, text)


def as_actor(uid: str | None):
    cur = CONN.cursor()
    try:
        cur.execute("RESET ROLE")
    except Exception:
        CONN.rollback()
        cur = CONN.cursor()
        cur.execute("RESET ROLE")
    if uid:
        cur.execute("SELECT set_config('request.jwt.claim.sub', %s, true)", (uid,))
        cur.execute("SET ROLE authenticated")
    else:
        cur.execute("SELECT set_config('request.jwt.claim.sub', '', true)")
    return cur


def insert_obj(uid: str | None, bucket: str, name: str) -> DmlResult:
    try:
        cur = as_actor(uid)
        cur.execute("INSERT INTO storage.objects(bucket_id, name) VALUES (%s, %s)", (bucket, name))
        CONN.commit()
        return DmlResult("ALLOW", None, None, False)
    except Exception as exc:
        CONN.rollback()
        return classify_exc(exc)


def select_obj(uid: str | None, bucket: str, name: str) -> DmlResult:
    try:
        cur = as_actor(uid)
        cur.execute("SELECT COUNT(*) FROM storage.objects WHERE bucket_id = %s AND name = %s", (bucket, name))
        n = cur.fetchone()[0]
        CONN.commit()
        if n > 0:
            return DmlResult("ALLOW", None, None, False)
        return DmlResult("DENY", "ZERO_ROWS", None, False)
    except Exception as exc:
        CONN.rollback()
        return classify_exc(exc)


def update_obj(uid: str | None, bucket: str, old: str, new: str) -> DmlResult:
    try:
        cur = as_actor(uid)
        cur.execute(
            "UPDATE storage.objects SET name = %s, updated_at = now() WHERE bucket_id = %s AND name = %s",
            (new, bucket, old),
        )
        n = cur.rowcount
        CONN.commit()
        if n > 0:
            return DmlResult("ALLOW", None, None, False)
        return DmlResult("DENY", "ZERO_ROWS", None, False)
    except Exception as exc:
        CONN.rollback()
        return classify_exc(exc)


def delete_obj(uid: str | None, bucket: str, name: str) -> DmlResult:
    try:
        cur = as_actor(uid)
        cur.execute("DELETE FROM storage.objects WHERE bucket_id = %s AND name = %s", (bucket, name))
        n = cur.rowcount
        CONN.commit()
        if n > 0:
            return DmlResult("ALLOW", None, None, False)
        return DmlResult("DENY", "ZERO_ROWS", None, False)
    except Exception as exc:
        CONN.rollback()
        return classify_exc(exc)


def upsert_obj(uid: str | None, bucket: str, name: str) -> DmlResult:
    try:
        cur = as_actor(uid)
        cur.execute(
            "INSERT INTO storage.objects(bucket_id, name) VALUES (%s, %s) "
            "ON CONFLICT (bucket_id, name) DO UPDATE SET updated_at = now()",
            (bucket, name),
        )
        CONN.commit()
        return DmlResult("ALLOW", None, None, False)
    except Exception as exc:
        CONN.rollback()
        return classify_exc(exc)


def seed_as_postgres(bucket: str, name: str) -> None:
    cur = as_actor(None)
    cur.execute(
        "INSERT INTO storage.objects(bucket_id, name) VALUES (%s, %s) ON CONFLICT (bucket_id, name) DO NOTHING",
        (bucket, name),
    )
    CONN.commit()


def delete_as_postgres(bucket: str, name: str) -> None:
    cur = as_actor(None)
    cur.execute("DELETE FROM storage.objects WHERE bucket_id = %s AND name = %s", (bucket, name))
    CONN.commit()


def _lit(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def extract_marked_sql(src: str, begin: str, end: str) -> str:
    i = src.find(begin)
    j = src.find(end)
    if i < 0 or j < 0 or j <= i:
        raise RuntimeError(f"00116 missing ACL markers {begin} / {end}")
    return src[i + len(begin):j].strip()


def acl_do_block(kind: str) -> str:
    src = MIGRATION.read_text(encoding="utf-8")
    if kind == "pre":
        body = extract_marked_sql(src, "-- <<<CUT3_ACL_PRE>>>", "-- <<<CUT3_ACL_PRE_END>>>")
    elif kind == "post":
        body = extract_marked_sql(src, "-- <<<CUT3_ACL_POST>>>", "-- <<<CUT3_ACL_POST_END>>>")
    else:
        raise ValueError(kind)
    return f"DO $cut3_acl$\nBEGIN\n{body}\nEND\n$cut3_acl$;\n"


def run_acl_probe(kind: str, mutate_sql: str | None = None) -> tuple[bool, str]:
    """Run the exact 00116 ACL IF-block after optional mutate; always ROLLBACK."""
    parts = ["BEGIN;"]
    if mutate_sql:
        parts.append(mutate_sql.rstrip().rstrip(";") + ";")
    parts.append(acl_do_block(kind))
    parts.append("ROLLBACK;")
    script = Path(f"/tmp/cut3_acl_{kind}_probe.sql")
    script.write_text("\n".join(parts), encoding="utf-8")
    res = psql_file(script)
    err = (res.stderr or "") + (res.stdout or "")
    return res.returncode == 0, err


def record_acl_case(results: list, test_id: str, ok: bool, err: str, expect_abort: bool) -> None:
    aborted = (not ok) and ("CUT3_ABORT" in err)
    if expect_abort:
        passed = aborted
        actual = "CUT3_ABORT" if aborted else ("PASS_NO_ABORT" if ok else "ERROR")
        expected = "CUT3_ABORT"
    else:
        passed = ok
        actual = "PASS" if ok else ("CUT3_ABORT" if aborted else "ERROR")
        expected = "PASS"
    results.append({
        "id": test_id,
        "test_id": test_id,
        "operation": "ACL_PREFLIGHT" if test_id.startswith("ACL-PRE") else "ACL_POSTCONDITION",
        "expected_result": expected,
        "actual_result": actual,
        "denial_mechanism": "CUT3_ABORT" if aborted else None,
        "SQLSTATE": None,
        "unexpected_exception": (not ok) and (not aborted),
        "pass": passed and not ((not ok) and (not aborted)),
        "status": "PASS" if passed else "FAIL",
    })
    if not passed:
        print(f"FAIL {test_id}: expected={expected} actual={actual}\n{err[-1500:]}")


def main() -> int:
    fp = load_json(FINGERPRINTS)
    enc = load_json(ENCODING)
    recreate_db()

    fixture_path = Path("/tmp/cut3_fixture.sql")
    fixture_path.write_text(fixture_sql(fp), encoding="utf-8")
    must(psql_file(fixture_path), "apply fixture")
    must(psql(seed_actors_sql()), "seed actors")

    # Verify exact production fingerprints BEFORE unmodified 00116
    pre = {}
    for name, args in [
        ("storage_path_group_id", "p_name text"),
        ("storage_path_group_id_v2", "p_name text"),
        ("is_active_group_member", "gid uuid"),
        ("is_group_member", "gid uuid, uid uuid"),
        ("is_group_admin", "gid uuid, uid uuid"),
        ("has_group_permission", "gid uuid, perm_key text, uid uuid"),
    ]:
        expect_md5 = LIVE_MD5[name]
        got = must(psql(
            "SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p "
            "JOIN pg_namespace n ON n.oid = p.pronamespace "
            f"WHERE n.nspname='public' AND p.proname='{name}' "
            f"AND pg_get_function_identity_arguments(p.oid)='{args}';"
        ), f"md5 {name}").strip()
        pre[name] = {"expected": expect_md5, "got": got, "match": got == expect_md5}
        if got != expect_md5:
            dump = must(psql(
                f"SELECT pg_get_functiondef('{name}'::regproc);"
            ), f"dump {name}")
            print(f"MD5 MISMATCH {name}: got {got} expected {expect_md5}", file=sys.stderr)
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

    acl_results: list[dict] = []
    must(psql("""
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cut3_acl_forger') THEN
        CREATE ROLE cut3_acl_forger SUPERUSER LOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cut3_acl_extra') THEN
        CREATE ROLE cut3_acl_extra NOLOGIN;
      END IF;
    END$$;
    """), "acl disposable roles")

    ok, err = run_acl_probe("pre")
    record_acl_case(acl_results, "ACL-PRE-A", ok, err, expect_abort=False)

    ok, err = run_acl_probe("pre",
        "GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated WITH GRANT OPTION")
    record_acl_case(acl_results, "ACL-PRE-B", ok, err, expect_abort=True)

    must(psql(
        "GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) "
        "TO authenticated WITH GRANT OPTION"
    ), "acl-pre-b-file mutate")
    apply_b = psql_file(MIGRATION)
    err_b = (apply_b.stderr or "") + (apply_b.stdout or "")
    record_acl_case(acl_results, "ACL-PRE-B-FILE", apply_b.returncode == 0, err_b, expect_abort=True)
    must(psql("""
    REVOKE EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid)
      TO PUBLIC, anon, authenticated, service_role;
    """), "restore is_group_member EXECUTE after B-FILE")

    ok, err = run_acl_probe("pre", """
    UPDATE pg_proc p
       SET proacl = ARRAY[
             makeaclitem(0, 'postgres'::regrole, 'EXECUTE', false),
             makeaclitem('postgres'::regrole, 'postgres'::regrole, 'EXECUTE', false),
             makeaclitem('anon'::regrole, 'postgres'::regrole, 'EXECUTE', false),
             makeaclitem('authenticated'::regrole, 'cut3_acl_forger'::regrole, 'EXECUTE', false),
             makeaclitem('service_role'::regrole, 'postgres'::regrole, 'EXECUTE', false)
           ]::aclitem[]
      FROM pg_namespace n
     WHERE n.oid = p.pronamespace
       AND n.nspname = 'public'
       AND p.proname = 'storage_path_group_id'
       AND pg_get_function_identity_arguments(p.oid) = 'p_name text'
    """)
    record_acl_case(acl_results, "ACL-PRE-C", ok, err, expect_abort=True)

    ok, err = run_acl_probe("pre", """
    UPDATE pg_proc p
       SET proacl = COALESCE(p.proacl, acldefault('f', p.proowner))
                    || makeaclitem('anon'::regrole, 'postgres'::regrole, 'EXECUTE', false)
      FROM pg_namespace n
     WHERE n.oid = p.pronamespace
       AND n.nspname = 'public'
       AND p.proname = 'is_active_group_member'
       AND pg_get_function_identity_arguments(p.oid) = 'gid uuid'
    """)
    record_acl_case(acl_results, "ACL-PRE-D", ok, err, expect_abort=True)

    ok, err = run_acl_probe("pre",
        "REVOKE EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) FROM anon")
    record_acl_case(acl_results, "ACL-PRE-E", ok, err, expect_abort=True)

    if any(x.get("status") != "PASS" for x in acl_results):
        raise SystemExit("HOLD: premigration ACL negative fixtures failed; 00116 not applied")

    apply = psql_file(MIGRATION)
    if apply.returncode != 0:
        print(apply.stdout)
        print(apply.stderr, file=sys.stderr)
        raise SystemExit("HOLD: 00116 apply failed (CUT3_ABORT or SQL error)")

    global CONN
    CONN = connect()

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

    ok, err = run_acl_probe("post")
    record_acl_case(acl_results, "ACL-POST-BASELINE", ok, err, expect_abort=False)
    ok, err = run_acl_probe("post",
        "GRANT EXECUTE ON FUNCTION public.storage_receipts_authorized(text, text) "
        "TO authenticated WITH GRANT OPTION")
    record_acl_case(acl_results, "ACL-POST-AUTH-WGO", ok, err, expect_abort=True)
    ok, err = run_acl_probe("post",
        "GRANT EXECUTE ON FUNCTION public.storage_receipts_authorized(text, text) TO PUBLIC")
    record_acl_case(acl_results, "ACL-POST-PUBLIC", ok, err, expect_abort=True)
    ok, err = run_acl_probe("post",
        "GRANT EXECUTE ON FUNCTION public.storage_receipts_authorized(text, text) TO anon")
    record_acl_case(acl_results, "ACL-POST-ANON", ok, err, expect_abort=True)
    ok, err = run_acl_probe("post",
        "GRANT EXECUTE ON FUNCTION public.storage_receipts_authorized(text, text) TO service_role")
    record_acl_case(acl_results, "ACL-POST-SERVICE-ROLE", ok, err, expect_abort=True)
    ok, err = run_acl_probe("post", """
    UPDATE pg_proc p
       SET proacl = ARRAY[
             makeaclitem('postgres'::regrole, 'postgres'::regrole, 'EXECUTE', false),
             makeaclitem('authenticated'::regrole, 'cut3_acl_forger'::regrole, 'EXECUTE', false)
           ]::aclitem[]
      FROM pg_namespace n
     WHERE n.oid = p.pronamespace
       AND n.nspname = 'public'
       AND p.proname = 'storage_receipts_authorized'
       AND pg_get_function_identity_arguments(p.oid) = 'p_name text, p_operation text'
    """)
    record_acl_case(acl_results, "ACL-POST-WRONG-GRANTOR", ok, err, expect_abort=True)
    ok, err = run_acl_probe("post",
        "GRANT EXECUTE ON FUNCTION public.storage_receipts_authorized(text, text) TO cut3_acl_extra")
    record_acl_case(acl_results, "ACL-POST-EXTRA-GRANTEE", ok, err, expect_abort=True)

    results = list(acl_results)

    def rec(case_id: str, **kwargs):
        kwargs.pop("test_id", None)
        results.append({"id": case_id, **kwargs})

    def expect(test_id: str, result: DmlResult, exp: str, op: str, **extra):
        row = result.as_row(test_id, op, exp)
        status = "PASS" if row["pass"] else "FAIL"
        rec(test_id, **row, status=status, **extra)
        if status != "PASS":
            print(
                f"FAIL {test_id}: actual={result.actual_result} expected={exp} "
                f"mechanism={result.denial_mechanism} sqlstate={result.sqlstate} "
                f"unexpected={result.unexpected_exception} {extra}"
            )
        return row

    # --- Core RLS cases (real storage.objects DML) ---
    # T-U01-01
    expect("T-U01-01", insert_obj(U_MEMBER, "receipts", f"{G1}/{FILE}"), "ALLOW", "INSERT", bucket="receipts")
    delete_as_postgres("receipts", f"{G1}/{FILE}")

    # T-U02-01 finance officer (finances.record)
    expect("T-U02-01", insert_obj(U_FINANCE, "receipts", f"finance-record/{G1}/{FILE}"), "ALLOW", "INSERT")
    delete_as_postgres("receipts", f"finance-record/{G1}/{FILE}")

    # T-U02-02 ordinary member
    expect("T-U02-02", insert_obj(U_MEMBER, "receipts", f"finance-record/{G1}/{FILE}"), "DENY", "INSERT")

    # Historical UUID-first SELECT
    seed_as_postgres("receipts", f"{G1}/historical.pdf")
    expect("T-U02-03", select_obj(U_MEMBER, "receipts", f"{G1}/historical.pdf"), "ALLOW", "SELECT")

    # T-U02-04 finances.manage only (not finances.record)
    expect(
        "T-U02-04-MANAGE-ONLY",
        insert_obj(U_FIN_MANAGE, "receipts", f"finance-record/{G1}/manage-only.pdf"),
        "ALLOW",
        "INSERT",
    )
    delete_as_postgres("receipts", f"finance-record/{G1}/manage-only.pdf")

    # T-U02-05 finance permission in G1 targeting G2 path
    expect(
        "T-U02-05-CROSS-GROUP-FINANCE",
        insert_obj(U_FINANCE, "receipts", f"finance-record/{G2}/cross.pdf"),
        "DENY",
        "INSERT",
    )

    # U03 self / negatives
    expect("T-U03-01", insert_obj(U_OWNER, "receipts", f"dispute-docs/{G1}/{M1}/{FILE}"), "ALLOW", "INSERT")
    delete_as_postgres("receipts", f"dispute-docs/{G1}/{M1}/{FILE}")
    expect("U03-NEG-SAME-GROUP-OTHER-MID", insert_obj(U_OWNER, "receipts", f"dispute-docs/{G1}/{M_OTHER}/{FILE}"), "DENY", "INSERT")
    expect("U03-NEG-CROSS-GROUP", insert_obj(U_OWNER, "receipts", f"dispute-docs/{G2}/{M1}/{FILE}"), "DENY", "INSERT")
    expect("U03-NEG-NONEXISTENT-MID", insert_obj(U_OWNER, "receipts", f"dispute-docs/{G1}/99999999-9999-4999-8999-999999999999/{FILE}"), "DENY", "INSERT")
    expect("U03-NEG-MALFORMED-MID", insert_obj(U_OWNER, "receipts", f"dispute-docs/{G1}/not-a-uuid/{FILE}"), "DENY", "INSERT")
    expect(
        "U03-NEG-INACTIVE-OWN-MID",
        insert_obj(U_PENDING, "receipts", f"dispute-docs/{G1}/{M_PENDING}/{FILE}"),
        "DENY",
        "INSERT",
    )

    # U07
    expect("T-U07-01", insert_obj(U_OWNER, "group-documents", f"relief-claims/{G1}/{M1}/{FILE}"), "ALLOW", "INSERT")
    delete_as_postgres("group-documents", f"relief-claims/{G1}/{M1}/{FILE}")
    expect("U07-NEG-SAME-GROUP-OTHER-MID", insert_obj(U_OWNER, "group-documents", f"relief-claims/{G1}/{M_OTHER}/{FILE}"), "DENY", "INSERT")
    expect("U07-NEG-CROSS-GROUP", insert_obj(U_OWNER, "group-documents", f"relief-claims/{G2}/{M1}/{FILE}"), "DENY", "INSERT")
    expect("U07-NEG-NONEXISTENT-MID", insert_obj(U_OWNER, "group-documents", f"relief-claims/{G1}/99999999-9999-4999-8999-999999999999/{FILE}"), "DENY", "INSERT")
    expect("U07-NEG-MALFORMED-MID", insert_obj(U_OWNER, "group-documents", f"relief-claims/{G1}/not-a-uuid/{FILE}"), "DENY", "INSERT")
    expect(
        "U07-NEG-INACTIVE-OWN-MID",
        insert_obj(U_SUSPENDED, "group-documents", f"relief-claims/{G1}/{M_SUSPENDED}/{FILE}"),
        "DENY",
        "INSERT",
    )

    # Logos
    seed_as_postgres("group-documents", f"logos/{G1}/logo.png")
    expect("T-LOGOS-01", select_obj(U_MEMBER, "group-documents", f"logos/{G1}/logo.png"), "ALLOW", "SELECT")
    expect("T-LOGOS-02", select_obj(U_G2_MEMBER, "group-documents", f"logos/{G1}/logo.png"), "DENY", "SELECT")
    expect("T-LOGOS-03", select_obj(U_MEMBER, "group-documents", "logos/not-a-uuid/file"), "DENY", "SELECT")
    expect("T-LOGOS-04-INSERT", insert_obj(U_OWNER, "group-documents", f"logos/{G1}/new.png"), "DENY", "INSERT")
    seed_as_postgres("group-documents", f"logos/{G1}/upd.png")
    expect("T-LOGOS-04-UPDATE", update_obj(U_OWNER, "group-documents", f"logos/{G1}/upd.png", f"logos/{G1}/upd2.png"), "DENY", "UPDATE")
    seed_as_postgres("group-documents", f"logos/{G1}/del.png")
    expect("T-LOGOS-04-DELETE", delete_obj(U_OWNER, "group-documents", f"logos/{G1}/del.png"), "DENY", "DELETE")

    # Projects
    expect("T11-PROJECTS-ADMIN-INSERT", insert_obj(U_OWNER, "group-documents", f"projects/{P1}/{FILE}"), "ALLOW", "INSERT")
    delete_as_postgres("group-documents", f"projects/{P1}/{FILE}")
    seed_as_postgres("group-documents", f"projects/{P1}/{FILE}")
    expect("D27-PROJECTS-MEMBER-SELECT", select_obj(U_MEMBER, "group-documents", f"projects/{P1}/{FILE}"), "ALLOW", "SELECT")
    expect("D26-PROJECTS-CROSS-SELECT", select_obj(U_G2_MEMBER, "group-documents", f"projects/{P1}/{FILE}"), "DENY", "SELECT")
    expect("T12-PROJECTS-MEMBER-INSERT", insert_obj(U_MEMBER, "group-documents", f"projects/{P1}/member.pdf"), "DENY", "INSERT")
    missing = "88888888-8888-4888-8888-888888888888"
    expect("T10-PROJECTS-MISSING", insert_obj(U_OWNER, "group-documents", f"projects/{missing}/{FILE}"), "DENY", "INSERT")

    # Inactive writes / historical SELECT
    expect("D31-PENDING-INSERT", insert_obj(U_PENDING, "receipts", f"{G1}/pending.pdf"), "DENY", "INSERT")
    expect("D32-SUSPENDED-INSERT", insert_obj(U_SUSPENDED, "receipts", f"{G1}/suspended.pdf"), "DENY", "INSERT")
    expect("D33-EXITED-INSERT", insert_obj(U_EXITED, "receipts", f"{G1}/exited.pdf"), "DENY", "INSERT")
    expect("D34-ARCHIVED-INSERT", insert_obj(U_ARCHIVED, "receipts", f"{G1}/archived.pdf"), "DENY", "INSERT")
    seed_as_postgres("receipts", f"{G1}/hist-pending.pdf")
    expect("D35-PENDING-SELECT", select_obj(U_PENDING, "receipts", f"{G1}/hist-pending.pdf"), "ALLOW", "SELECT")

    # Cross-tenant / garbage
    expect("T21-CROSS-TENANT-INSERT", insert_obj(U_MEMBER, "receipts", f"{G2}/{FILE}"), "DENY", "INSERT")
    expect("D25-CROSS-SELECT", select_obj(U_G2_MEMBER, "receipts", f"{G1}/historical.pdf"), "DENY", "SELECT")
    expect("D28-GARBAGE-SELECT", select_obj(U_MEMBER, "receipts", "garbage/foo"), "DENY", "SELECT")
    expect("D30-MINUTES-BAD-UUID", insert_obj(U_MEMBER, "group-documents", "minutes/not-a-uuid/x"), "DENY", "INSERT")

    # UPDATE transitions
    seed_as_postgres("group-documents", f"{G1}/old-doc.pdf")
    expect("D36-UPDATE-CROSS-TENANT", update_obj(U_DOCS, "group-documents", f"{G1}/old-doc.pdf", f"{G2}/new-doc.pdf"), "DENY", "UPDATE")
    seed_as_postgres("group-documents", "garbage/foo")
    expect("D37-UPDATE-OLD-GARBAGE", update_obj(U_DOCS, "group-documents", "garbage/foo", f"{G1}/from-garbage.pdf"), "DENY", "UPDATE")
    seed_as_postgres("group-documents", f"{G1}/upd-ok.pdf")
    expect("D38-UPDATE-SAME-GROUP", update_obj(U_DOCS, "group-documents", f"{G1}/upd-ok.pdf", f"{G1}/upd-ok2.pdf"), "ALLOW", "UPDATE")

    # UPS-01..12
    expect("UPS-01", upsert_obj(U_DOCS, "group-documents", f"{G1}/ups01.pdf"), "ALLOW", "UPSERT")
    expect("UPS-02", upsert_obj(U_OWNER, "group-documents", f"constitutions/{G1}/ups02.pdf"), "ALLOW", "UPSERT")
    seed_as_postgres("group-documents", f"{G1}/ups03.pdf")
    expect("UPS-03", upsert_obj(U_G2_ADMIN, "group-documents", f"{G1}/ups03.pdf"), "DENY", "UPSERT")
    expect("UPS-04", upsert_obj(U_DOCS, "group-documents", f"{G2}/ups04.pdf"), "DENY", "UPSERT")
    seed_as_postgres("group-documents", f"constitutions/{G1}/ups05.pdf")
    expect("UPS-05", upsert_obj(U_G2_ADMIN, "group-documents", f"constitutions/{G1}/ups05.pdf"), "DENY", "UPSERT")
    expect("UPS-06", upsert_obj(U_OWNER, "group-documents", f"constitutions/{G2}/ups06.pdf"), "DENY", "UPSERT")
    expect("UPS-07", upsert_obj(U_OWNER, "group-documents", f"/{G1}/ups07.pdf"), "DENY", "UPSERT")
    expect("UPS-08", upsert_obj(U_OWNER, "group-documents", f"unknown-prefix/{G1}/ups08.pdf"), "DENY", "UPSERT")
    seed_as_postgres("group-documents", f"{G1}/ups09.pdf")
    expect("UPS-09", update_obj(U_DOCS, "group-documents", f"{G1}/ups09.pdf", f"{G2}/ups09-new.pdf"), "DENY", "UPDATE")
    expect("UPS-10", upsert_obj(U_MEMBER, "receipts", f"finance-record/{G1}/ups10.pdf"), "DENY", "UPSERT")
    expect("UPS-11", upsert_obj(U_OWNER, "receipts", f"dispute-docs/{G1}/{M_OTHER}/ups11.pdf"), "DENY", "UPSERT")
    expect("UPS-12", upsert_obj(U_OWNER, "group-documents", f"relief-claims/{G1}/{M_OTHER}/ups12.pdf"), "DENY", "UPSERT")

    # service_role EXECUTE deny — expected security path is 42501 privilege denial
    try:
        cur = as_actor(None)
        cur.execute("SET ROLE service_role")
        cur.execute("SELECT public.storage_receipts_authorized('x','select')")
        CONN.commit()
        expect("D40-SERVICE-ROLE-EXECUTE", DmlResult("ALLOW", None, None, False), "DENY", "EXECUTE")
    except Exception as exc:
        CONN.rollback()
        expect("D40-SERVICE-ROLE-EXECUTE", classify_exc(exc), "DENY", "EXECUTE")

    # Anon SELECT deny (private bucket). Unexpected exceptions FAIL, not DENY PASS.
    try:
        cur = as_actor(None)
        cur.execute("SET ROLE anon")
        cur.execute(
            "SELECT COUNT(*) FROM storage.objects WHERE bucket_id=%s AND name=%s",
            ("receipts", f"{G1}/historical.pdf"),
        )
        n = cur.fetchone()[0]
        CONN.commit()
        if n > 0:
            anon_res = DmlResult("ALLOW", None, None, False)
        else:
            anon_res = DmlResult("DENY", "ZERO_ROWS", None, False)
        expect("R05-ANON-SELECT", anon_res, "DENY", "SELECT")
    except Exception as exc:
        CONN.rollback()
        expect("R05-ANON-SELECT", classify_exc(exc), "DENY", "SELECT")

    # Harness self-check: undefined function must be unexpected_exception, not DENY PASS
    try:
        cur = as_actor(U_OWNER)
        cur.execute("SELECT public.this_function_does_not_exist_cut3()")
        CONN.commit()
        harness_probe = DmlResult("ALLOW", None, None, False)
    except Exception as exc:
        CONN.rollback()
        harness_probe = classify_exc(exc)
    harness_ok = harness_probe.unexpected_exception is True and harness_probe.actual_result != "DENY"
    rec(
        "HARNESS-UNEXPECTED-EXCEPTION",
        **harness_probe.as_row("HARNESS-UNEXPECTED-EXCEPTION", "EXECUTE", "ERROR"),
        status="PASS" if harness_ok else "FAIL",
        note="undefined function must not classify as DENY PASS",
    )
    if not harness_ok:
        print("FAIL HARNESS-UNEXPECTED-EXCEPTION: unexpected exception was swallowed as DENY")

    # Encoding matrix — every ENC-* ID against real storage.objects
    strongest = U_OWNER
    enc_results = []
    for t in enc["tests"]:
        bucket = t["bucket"]
        path = t["path"]
        op = t["operation"]
        tid = t["id"]
        if op == "INSERT":
            dml = insert_obj(strongest, bucket, path)
        elif op == "SELECT":
            seed_as_postgres(bucket, path)
            dml = select_obj(strongest, bucket, path)
            delete_as_postgres(bucket, path)
        elif op == "UPDATE":
            seed_as_postgres(bucket, path)
            dml = update_obj(strongest, bucket, path, path + "-x")
            delete_as_postgres(bucket, path)
            delete_as_postgres(bucket, path + "-x")
        elif op == "DELETE":
            seed_as_postgres(bucket, path)
            dml = delete_obj(strongest, bucket, path)
            delete_as_postgres(bucket, path)
        else:
            dml = DmlResult("ERROR", None, None, True, f"unknown op {op}")
        schema = dml.as_row(tid, op, "DENY")
        status = "PASS" if schema["pass"] else "FAIL"
        row = {
            "id": tid,
            "class_id": t["class_id"],
            "bucket": bucket,
            "path": path,
            "actor": "G1_owner_strongest",
            **schema,
            "status": status,
        }
        enc_results.append(row)
        rec(tid, **row)
        if status != "PASS":
            print(
                f"FAIL {tid}: actual={dml.actual_result} mechanism={dml.denial_mechanism} "
                f"sqlstate={dml.sqlstate} unexpected={dml.unexpected_exception}"
            )

    # Live shape rehearsal (prefix tokens only; synthetic objects)
    rehearsal = {"gdocs": [], "receipts": [], "unknown": 0}
    for i in range(1, 7):
        name = f"logos/{G1}/live-logo-{i}.png"
        seed_as_postgres("group-documents", name)
        got_m = select_obj(U_MEMBER, "group-documents", name).actual_result
        got_x = select_obj(U_G2_MEMBER, "group-documents", name).actual_result
        got_w = insert_obj(U_OWNER, "group-documents", f"logos/{G1}/write-{i}.png").actual_result
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
        got_m = select_obj(U_MEMBER, "group-documents", name).actual_result
        got_x = select_obj(U_G2_MEMBER, "group-documents", name).actual_result
        rehearsal["gdocs"].append({
            "shape": "constitutions",
            "select_g1": got_m,
            "select_g2": got_x,
            "classification": "AUTHORIZED" if got_m == "ALLOW" else "EXPLICITLY_DENIED",
        })
    for i in range(1, 6):
        name = f"{G1}/live-uuid-{i}.pdf"
        seed_as_postgres("group-documents", name)
        got_m = select_obj(U_MEMBER, "group-documents", name).actual_result
        got_x = select_obj(U_G2_MEMBER, "group-documents", name).actual_result
        rehearsal["gdocs"].append({
            "shape": "uuid-first",
            "select_g1": got_m,
            "select_g2": got_x,
            "classification": "AUTHORIZED" if got_m == "ALLOW" else "EXPLICITLY_DENIED",
        })
    for i in range(1, 4):
        name = f"{G1}/live-receipt-{i}.pdf"
        seed_as_postgres("receipts", name)
        got_m = select_obj(U_MEMBER, "receipts", name).actual_result
        got_x = select_obj(U_G2_MEMBER, "receipts", name).actual_result
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
        "acl_negative_ids": [x["id"] for x in acl_results],
        "acl_negative_fail_ids": [x["id"] for x in acl_results if x.get("status") != "PASS"],
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
        "acl_fail": [x["id"] for x in acl_results if x.get("status") != "PASS"],
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
