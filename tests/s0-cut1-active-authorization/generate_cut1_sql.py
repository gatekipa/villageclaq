#!/usr/bin/env python3
"""Generate the Cut 1 forward-only migration from the frozen policy catalog.

Contract SHA: 5263f160943374676362b3983f39ac510a7930a2
Does not contact production. Catalog predicates were frozen from the
2026-09-10 live inventory + read-only catalog investigation of §24.7 names.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REWRITE23_PATH = Path(__file__).resolve().parent / "rewrite23.json"
NEUTRALIZE_PATH = Path(__file__).resolve().parent / "neutralize_live.json"
OUT_PATH = ROOT / "supabase" / "migrations" / "00114_s0_p0a_cut1_active_authorization.sql"

HELPER_FINGERPRINTS = {
    "is_group_member": ("gid uuid, uid uuid", "b91a35aadb657fa2cd2c99e9313ca0f1"),
    "get_user_group_ids": ("uid uuid", "a9865ade7502badcd2b92a74429ac1d9"),
    "is_group_admin": ("gid uuid, uid uuid", "a606b2986f998e8cd6ec9f6f488f6172"),
    "is_group_admin_or_owner": ("p_group_id uuid", "44e3246f8dab340bf65a9766c70baac2"),
    "is_group_owner": ("gid uuid, uid uuid", "b57b416768d1af85bd50f07bcb9c733f"),
    "has_group_permission": ("gid uuid, perm_key text, uid uuid", "9948d97decfc42d3159a34d3f04934b9"),
    "create_proxy_member": (
        "p_group_id uuid, p_display_name text, p_phone text, p_role text",
        "10ab1a40d56ab1cc96fc3e59d23cd503",
    ),
}

# Helper-only §24.7 names: inherit REPLACE (do not DROP+CREATE).
INHERIT_ONLY = [
    ("group_constitutions", "rls_const_insert", "INSERT", "is_group_admin(group_id)"),
    ("group_constitutions", "rls_const_update", "UPDATE", "is_group_admin(group_id)"),
    ("group_constitutions", "rls_const_delete", "DELETE", "is_group_admin(group_id)"),
    ("constitution_amendments", "rls_amend_update", "UPDATE", "is_group_admin(group_id)"),
    ("constitution_amendments", "rls_amend_delete", "DELETE", "is_group_admin(group_id)"),
]


def norm(s: str | None) -> str:
    if s is None:
        return ""
    return re.sub(r"\s+", " ", s).strip()


def inject_active(sql: str | None) -> str | None:
    """Add ACTIVE gates without changing role sets or tenant joins."""
    if sql is None:
        return None
    out = sql
    out = re.sub(
        r"get_user_group_ids\s*\(\s*(?:auth\.uid\(\)\s*)?\)",
        "get_my_active_group_ids()",
        out,
    )
    out = re.sub(r"\bis_group_member\s*\(", "is_active_group_member(", out)
    # Actor memberships only (aliases memberships | m). Do not touch `target`.
    out = re.sub(
        r"\((memberships|m)\.user_id = auth\.uid\(\)\)(?!\s*AND\s*\(\1\.membership_status)",
        r"(\1.user_id = auth.uid()) AND (\1.membership_status = 'active'::text)",
        out,
    )
    return out


def roles_clause(roles: str) -> str:
    inner = roles.strip("{}")
    if inner == "public" or inner == "":
        return "TO public"
    parts = [p.strip() for p in inner.split(",") if p.strip()]
    return "TO " + ", ".join(parts)


def dollar(s: str, tag: str = "p") -> str:
    i = 0
    while True:
        t = f"{tag}{i}" if i else tag
        marker = f"${t}$"
        if marker not in s:
            return f"{marker}{s}{marker}"
        i += 1


def expect_policy_sql(table: str, name: str, cmd: str, qual: str | None, wcheck: str | None) -> str:
    nq = norm(qual)
    nc = norm(wcheck)
    return f"""
  PERFORM public.cut1_expect_policy(
    {dollar(table, "t")},
    {dollar(name, "n")},
    {dollar(cmd, "c")},
    {dollar(nq, "q") if nq else "NULL"},
    {dollar(nc, "w") if nc else "NULL"}
  );"""


def drop_create_sql(table: str, name: str, cmd: str, roles: str, qual: str | None, wcheck: str | None) -> str:
    lines = [
        f'DROP POLICY IF EXISTS {dollar(name, "pn")} ON public.{table};',
        f"CREATE POLICY {dollar(name, 'pn')} ON public.{table}",
        f"  FOR {cmd}",
        f"  {roles_clause(roles)}",
    ]
    if cmd in ("INSERT",):
        if wcheck is None:
            raise ValueError(f"INSERT policy {table}.{name} missing WITH CHECK")
        lines.append(f"  WITH CHECK ({wcheck});")
    elif cmd in ("DELETE", "SELECT"):
        if qual is None:
            raise ValueError(f"{cmd} policy {table}.{name} missing USING")
        lines.append(f"  USING ({qual});")
    else:  # ALL or UPDATE
        if qual is None and wcheck is None:
            raise ValueError(f"{cmd} policy {table}.{name} has no predicate")
        if qual is not None:
            lines.append(f"  USING ({qual})")
        if wcheck is not None:
            sep = "" if qual is None else ""
            if qual is None:
                lines.append(f"  WITH CHECK ({wcheck});")
            else:
                lines[-1] = f"  USING ({qual})"
                lines.append(f"  WITH CHECK ({wcheck});")
        else:
            lines[-1] = f"  USING ({qual});"
    return "\n".join(lines)


PROXY_TARGET_CHECK = """((is_proxy = true) AND (proxy_manager_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.group_id = memberships.group_id) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'moderator'::membership_role])) AND (m.membership_status = 'active'::text)))))"""


HEADER = r"""-- S0 Cut 1 — P0-A active membership / authorization boundary
--
-- Contract SHA: 5263f160943374676362b3983f39ac510a7930a2 (PR #75 docs, §25 wins)
-- Base:         0559b758bc53df3ec8081e361ffd022c1f19be43
-- PRODUCTION APPLY NOT AUTHORIZED — draft / disposable rehearsal only
--
-- One forward-only migration. Does not edit 00001–00113 or F0/F3.
-- All-or-nothing: missing expected policy OR security-relevant predicate
-- drift → RAISE EXCEPTION (not NOTICE+skip).
--
-- Out of scope: notifications_queue, storage, F0/F3 apply, PR70, election_votes,
-- is_group_member / get_user_group_ids bodies.

BEGIN;

CREATE OR REPLACE FUNCTION public.cut1_norm(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(regexp_replace(COALESCE(p, ''), '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.cut1_expect_helper(
  p_name text,
  p_args text,
  p_src_md5 text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_oid oid;
  v_md5 text;
  v_src text;
BEGIN
  SELECT p.oid, p.prosrc
    INTO v_oid, v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = p_name
    AND pg_get_function_identity_arguments(p.oid) = p_args;
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'CUT1_ABORT: missing expected helper %.%(%)',
      'public', p_name, p_args;
  END IF;
  v_md5 := md5(v_src);
  IF v_md5 IS DISTINCT FROM p_src_md5 THEN
    RAISE EXCEPTION 'CUT1_ABORT: helper body fingerprint drift on %(%) got % expected %',
      p_name, p_args, v_md5, p_src_md5;
  END IF;
  IF p_name IN ('is_group_member', 'get_user_group_ids', 'is_group_admin',
                'is_group_admin_or_owner', 'is_group_owner', 'has_group_permission',
                'create_proxy_member')
     AND v_src ~* 'membership_status' THEN
    RAISE EXCEPTION 'CUT1_ABORT: helper % already contains membership_status (not the frozen status-blind live body)',
      p_name;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cut1_expect_policy(
  p_table text,
  p_name text,
  p_cmd text,
  p_qual_norm text,
  p_check_norm text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_qual text;
  v_check text;
  v_cmd text;
BEGIN
  SELECT qual, with_check, cmd
    INTO v_qual, v_check, v_cmd
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = p_table
    AND policyname = p_name;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUT1_ABORT: missing expected policy %.%', p_table, p_name;
  END IF;
  IF v_cmd IS DISTINCT FROM p_cmd THEN
    RAISE EXCEPTION 'CUT1_ABORT: command drift on %.% got % expected %',
      p_table, p_name, v_cmd, p_cmd;
  END IF;
  IF public.cut1_norm(v_qual) IS DISTINCT FROM COALESCE(p_qual_norm, '') THEN
    RAISE EXCEPTION 'CUT1_ABORT: security-relevant predicate drift (USING) on %.%',
      p_table, p_name;
  END IF;
  IF public.cut1_norm(v_check) IS DISTINCT FROM COALESCE(p_check_norm, '') THEN
    RAISE EXCEPTION 'CUT1_ABORT: security-relevant predicate drift (WITH CHECK) on %.%',
      p_table, p_name;
  END IF;
END;
$$;
"""


FOOT_HELPERS = r"""
-- ---------------------------------------------------------------------------
-- CREATE current-actor active helpers (R1)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_active_group_member(gid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.memberships m
       WHERE m.group_id = gid
         AND m.user_id = auth.uid()
         AND m.membership_status = 'active'
     );
$$;

CREATE OR REPLACE FUNCTION public.get_my_active_group_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.group_id
  FROM public.memberships m
  WHERE m.user_id = auth.uid()
    AND m.membership_status = 'active';
$$;

REVOKE ALL ON FUNCTION public.is_active_group_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_active_group_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_group_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_active_group_ids() TO authenticated;

-- ---------------------------------------------------------------------------
-- REPLACE operational helpers (preserve live signatures)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_group_admin(gid uuid, uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (auth.uid() IS NULL OR uid IS NULL OR uid = auth.uid())
     AND EXISTS (
       SELECT 1
       FROM public.memberships
       WHERE group_id = gid
         AND user_id = uid
         AND role IN ('owner', 'admin')
         AND membership_status = 'active'
     );
$$;

CREATE OR REPLACE FUNCTION public.is_group_admin_or_owner(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE group_id = p_group_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND membership_status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_owner(gid uuid, uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (auth.uid() IS NULL OR uid IS NULL OR uid = auth.uid())
     AND EXISTS (
       SELECT 1
       FROM public.memberships
       WHERE group_id = gid
         AND user_id = uid
         AND role = 'owner'
         AND membership_status = 'active'
     );
$$;

-- LIVE fallback preserved: (1) membership (now ACTIVE) (2) owner → true
-- (3) count open position_assignments (4) admin AND count=0 → true
-- (5) else open assignment perm_key AND same-group group_positions join.
-- Authenticated callers cannot probe another uid.
CREATE OR REPLACE FUNCTION public.has_group_permission(
  gid uuid,
  perm_key text,
  uid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_membership_id uuid;
  v_role text;
  v_assignment_count int;
  v_has_perm boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND uid IS NOT NULL AND uid IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  SELECT m.id, m.role::text
    INTO v_membership_id, v_role
  FROM public.memberships m
  WHERE m.group_id = gid
    AND m.user_id = uid
    AND m.membership_status = 'active'
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'owner' THEN
    RETURN true;
  END IF;

  SELECT COUNT(*) INTO v_assignment_count
  FROM public.position_assignments
  WHERE membership_id = v_membership_id AND ended_at IS NULL;

  IF v_role = 'admin' AND v_assignment_count = 0 THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.position_assignments pa
    JOIN public.position_permissions pp ON pp.position_id = pa.position_id
    JOIN public.group_positions gp
      ON gp.id = pa.position_id
     AND gp.group_id = gid
    WHERE pa.membership_id = v_membership_id
      AND pa.ended_at IS NULL
      AND pp.permission = perm_key
  ) INTO v_has_perm;

  RETURN v_has_perm;
END;
$$;

-- LIVE body preserved except ACTIVE on the officer gate + pinned search_path.
-- Do not add members.manage. Keep live proxy-role whitelist (already in prod).
CREATE OR REPLACE FUNCTION public.create_proxy_member(
  p_group_id uuid,
  p_display_name text,
  p_phone text DEFAULT NULL,
  p_role text DEFAULT 'member'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_membership_id uuid;
  caller_id uuid;
BEGIN
  caller_id := auth.uid();

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE group_id = p_group_id
      AND user_id = caller_id
      AND role IN ('owner', 'admin', 'moderator')
      AND membership_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not authorized to create proxy members in this group';
  END IF;

  IF COALESCE(p_role, 'member') NOT IN ('member', 'moderator') THEN
    RAISE EXCEPTION 'invalid_proxy_role';
  END IF;

  new_membership_id := gen_random_uuid();

  INSERT INTO public.memberships (
    id, user_id, group_id, display_name, role, standing,
    is_proxy, proxy_manager_id, joined_at, privacy_settings
  ) VALUES (
    new_membership_id,
    NULL,
    p_group_id,
    p_display_name,
    COALESCE(p_role, 'member')::membership_role,
    'good'::membership_standing,
    true,
    caller_id,
    now(),
    jsonb_build_object(
      'proxy_phone', COALESCE(p_phone, ''),
      'proxy_name', p_display_name,
      'show_phone', false,
      'show_email', false
    )
  );

  RETURN new_membership_id;
END;
$$;

REVOKE ALL ON FUNCTION public.is_group_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_group_admin_or_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_group_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_group_permission(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_proxy_member(uuid, text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_group_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_admin_or_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_group_permission(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_proxy_member(uuid, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- REQUIRED same-group position assignment trigger (R4)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_position_assignment_same_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_m_group uuid;
  v_p_group uuid;
BEGIN
  SELECT m.group_id INTO v_m_group
  FROM public.memberships m
  WHERE m.id = NEW.membership_id;

  SELECT gp.group_id INTO v_p_group
  FROM public.group_positions gp
  WHERE gp.id = NEW.position_id;

  IF v_m_group IS NULL OR v_p_group IS NULL
     OR v_m_group IS DISTINCT FROM v_p_group THEN
    RAISE EXCEPTION 'CUT1_POSITION_GROUP_MISMATCH: membership.group_id (%) IS DISTINCT FROM group_positions.group_id (%)',
      v_m_group, v_p_group;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_position_assignments_same_group ON public.position_assignments;
CREATE TRIGGER trg_position_assignments_same_group
  BEFORE INSERT OR UPDATE OF membership_id, position_id
  ON public.position_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_position_assignment_same_group();
"""


FOOT_POST = r"""
-- ---------------------------------------------------------------------------
-- Postconditions
-- ---------------------------------------------------------------------------
DO $cut1_post$
DECLARE
  v_src text;
  v_md5 text;
  v_mismatch int;
  v_ok boolean;
BEGIN
  IF to_regprocedure('public.is_active_group_member(uuid)') IS NULL THEN
    RAISE EXCEPTION 'CUT1_ABORT_POST: is_active_group_member missing';
  END IF;
  IF to_regprocedure('public.get_my_active_group_ids()') IS NULL THEN
    RAISE EXCEPTION 'CUT1_ABORT_POST: get_my_active_group_ids missing';
  END IF;
  IF to_regprocedure('public.enforce_position_assignment_same_group()') IS NULL THEN
    RAISE EXCEPTION 'CUT1_ABORT_POST: enforce_position_assignment_same_group missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'position_assignments'
      AND t.tgname = 'trg_position_assignments_same_group'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'CUT1_ABORT_POST: trg_position_assignments_same_group missing';
  END IF;

  SELECT p.prosrc INTO v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'is_group_member'
    AND pg_get_function_identity_arguments(p.oid) = 'gid uuid, uid uuid';
  IF md5(v_src) IS DISTINCT FROM 'b91a35aadb657fa2cd2c99e9313ca0f1' THEN
    RAISE EXCEPTION 'CUT1_ABORT_POST: is_group_member body changed';
  END IF;

  SELECT p.prosrc INTO v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_user_group_ids'
    AND pg_get_function_identity_arguments(p.oid) = 'uid uuid';
  IF md5(v_src) IS DISTINCT FROM 'a9865ade7502badcd2b92a74429ac1d9' THEN
    RAISE EXCEPTION 'CUT1_ABORT_POST: get_user_group_ids body changed';
  END IF;

  -- New / replaced helpers must mention active (except visibility helpers already checked).
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_active_group_member'
      AND p.prosrc ~ 'membership_status'
  ) THEN
    RAISE EXCEPTION 'CUT1_ABORT_POST: is_active_group_member missing status predicate';
  END IF;

  -- Grants: authenticated yes; anon / PUBLIC no on new helpers.
  SELECT
    has_function_privilege('authenticated', 'public.is_active_group_member(uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.get_my_active_group_ids()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.is_active_group_member(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.get_my_active_group_ids()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.has_group_permission(uuid, text, uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.create_proxy_member(uuid, text, text, text)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.has_group_permission(uuid, text, uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.create_proxy_member(uuid, text, text, text)', 'EXECUTE')
    INTO v_ok;
  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'CUT1_ABORT_POST: grant mismatch on Cut 1 helpers';
  END IF;

  -- No arbitrary-subject active helper granted to authenticated/anon.
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) e ON true
    JOIN pg_roles r ON r.oid = e.grantee
    WHERE n.nspname = 'public'
      AND p.proname IN ('is_active_group_member', 'get_my_active_group_ids',
                        'get_user_active_group_ids', 'is_active_member_of')
      AND pg_get_function_identity_arguments(p.oid) ~* 'uid'
      AND r.rolname IN ('authenticated', 'anon', 'PUBLIC')
  ) THEN
    RAISE EXCEPTION 'CUT1_ABORT_POST: arbitrary-subject active helper granted to authenticated/anon';
  END IF;

  SELECT count(*) INTO v_mismatch
  FROM public.position_assignments pa
  JOIN public.memberships m ON m.id = pa.membership_id
  JOIN public.group_positions gp ON gp.id = pa.position_id
  WHERE m.group_id IS DISTINCT FROM gp.group_id;
  IF v_mismatch <> 0 THEN
    RAISE EXCEPTION 'CUT1_ABORT_POST: position_assignments mismatch_count=% (expected 0)', v_mismatch;
  END IF;
END;
$cut1_post$;

DROP FUNCTION public.cut1_expect_helper(text, text, text);
DROP FUNCTION public.cut1_expect_policy(text, text, text, text, text);
DROP FUNCTION public.cut1_norm(text);

COMMIT;
"""


def load_rewrite23():
    data = json.loads(REWRITE23_PATH.read_text())
    return data["rewrite23"]


def load_neutralize():
    if not NEUTRALIZE_PATH.exists():
        raise SystemExit(f"missing {NEUTRALIZE_PATH}")
    return json.loads(NEUTRALIZE_PATH.read_text())


def policy_key(p):
    return (p["tablename"], p["policyname"], p.get("command") or p.get("cmd"))


def main() -> None:
    rewrite23 = load_rewrite23()
    neutralize = load_neutralize()
    seen = set()
    ordered = []

    for p in rewrite23:
        k = (p["tablename"], p["policyname"], p["command"])
        ordered.append(
            {
                "tablename": p["tablename"],
                "policyname": p["policyname"],
                "command": p["command"],
                "roles": p["roles"],
                "qual": p["qual"],
                "with_check": p["with_check"],
                "kind": "rewrite23",
            }
        )
        seen.add(k)

    for p in neutralize:
        cmd = p.get("command") or p.get("cmd")
        k = (p["tablename"], p["policyname"], cmd)
        if k in seen:
            continue
        if p.get("inherit_only"):
            continue
        ordered.append(
            {
                "tablename": p["tablename"],
                "policyname": p["policyname"],
                "command": cmd,
                "roles": p["roles"],
                "qual": p.get("qual"),
                "with_check": p.get("with_check"),
                "kind": p.get("kind", "neutralize"),
            }
        )
        seen.add(k)

    parts = [HEADER, "-- ---------------------------------------------------------------------------",
             "-- Loud preconditions (helpers + expected policies)",
             "-- ---------------------------------------------------------------------------",
             "DO $cut1_pre$"]
    parts.append("DECLARE\n  v_mismatch int;\nBEGIN")
    for name, (args, md5) in HELPER_FINGERPRINTS.items():
        parts.append(
            f"  PERFORM public.cut1_expect_helper('{name}', '{args}', '{md5}');"
        )
    parts.append(
        """
  SELECT count(*) INTO v_mismatch
  FROM public.position_assignments pa
  JOIN public.memberships m ON m.id = pa.membership_id
  JOIN public.group_positions gp ON gp.id = pa.position_id
  WHERE m.group_id IS DISTINCT FROM gp.group_id;
  IF v_mismatch <> 0 THEN
    RAISE EXCEPTION 'CUT1_ABORT: position_assignments mismatch_count=% (snapshot was 0; no auto-repair)',
      v_mismatch;
  END IF;
"""
    )
    for p in ordered:
        parts.append(
            expect_policy_sql(p["tablename"], p["policyname"], p["command"], p["qual"], p["with_check"])
        )
    for table, name, cmd, pred in INHERIT_ONLY:
        qual = pred if cmd != "INSERT" else None
        wcheck = pred if cmd == "INSERT" else None
        parts.append(expect_policy_sql(table, name, cmd, qual, wcheck))
    parts.append("END;\n$cut1_pre$;\n")
    parts.append(FOOT_HELPERS)
    parts.append("-- ---------------------------------------------------------------------------")
    parts.append("-- REWRITE policies (23 helper-matching + §24.7 neutralize)")
    parts.append("-- ---------------------------------------------------------------------------\n")

    for p in ordered:
        table, name, cmd = p["tablename"], p["policyname"], p["command"]
        if name == "Admins can add proxy members":
            tqual = inject_active(p["qual"]) if p["qual"] else None
            twcheck = PROXY_TARGET_CHECK
        else:
            tqual = inject_active(p["qual"]) if p["qual"] else None
            twcheck = inject_active(p["with_check"]) if p["with_check"] else None
        parts.append(f"-- [{p['kind']}] {table}.{name} {cmd}")
        parts.append(drop_create_sql(table, name, cmd, p["roles"], tqual, twcheck))
        parts.append("")

    parts.append(FOOT_POST)
    OUT_PATH.write_text("\n".join(parts) + "\n")
    print(f"wrote {OUT_PATH} policies={len(ordered)}")


if __name__ == "__main__":
    main()
