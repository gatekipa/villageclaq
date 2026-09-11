#!/usr/bin/env python3
"""Build the disposable Cut 1 fixture: live helpers + stub tables + live policies."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from generate_cut1_sql import INHERIT_ONLY, drop_create_sql, load_neutralize, load_rewrite23

HERE = Path(__file__).resolve().parent

# Exact live prosrc (CRLF for 00014-era helpers). Fingerprints from prod 2026-09-10.
HELPERS = {
    "is_group_member": (
        "gid uuid, uid uuid DEFAULT auth.uid()",
        "boolean",
        "sql",
        "STABLE SECURITY DEFINER",
        None,
        "\r\n  SELECT EXISTS (\r\n    SELECT 1 FROM public.memberships WHERE group_id = gid AND user_id = uid\r\n  );\r\n",
        "b91a35aadb657fa2cd2c99e9313ca0f1",
    ),
    "get_user_group_ids": (
        "uid uuid DEFAULT auth.uid()",
        "SETOF uuid",
        "sql",
        "STABLE SECURITY DEFINER",
        None,
        "\r\n  SELECT group_id FROM public.memberships WHERE user_id = uid;\r\n",
        "a9865ade7502badcd2b92a74429ac1d9",
    ),
    "is_group_admin": (
        "gid uuid, uid uuid DEFAULT auth.uid()",
        "boolean",
        "sql",
        "STABLE SECURITY DEFINER",
        None,
        "\r\n  SELECT EXISTS (\r\n    SELECT 1 FROM public.memberships\r\n    WHERE group_id = gid AND user_id = uid AND role IN ('owner', 'admin')\r\n  );\r\n",
        "a606b2986f998e8cd6ec9f6f488f6172",
    ),
    "is_group_owner": (
        "gid uuid, uid uuid DEFAULT auth.uid()",
        "boolean",
        "sql",
        "STABLE SECURITY DEFINER",
        None,
        "\r\n  SELECT EXISTS (\r\n    SELECT 1 FROM public.memberships\r\n    WHERE group_id = gid AND user_id = uid AND role = 'owner'\r\n  );\r\n",
        "b57b416768d1af85bd50f07bcb9c733f",
    ),
}

# LF-only bodies (verified against live md5 when written)
ADMIN_OR_OWNER_SRC = """
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE group_id = p_group_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
  );
"""

HAS_PERM_SRC = """
DECLARE
  v_membership_id uuid;
  v_role text;
  v_assignment_count int;
  v_has_perm boolean;
BEGIN
  SELECT m.id, m.role::text
    INTO v_membership_id, v_role
  FROM public.memberships m
  WHERE m.group_id = gid AND m.user_id = uid
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
    WHERE pa.membership_id = v_membership_id
      AND pa.ended_at IS NULL
      AND pp.permission = perm_key
  ) INTO v_has_perm;

  RETURN v_has_perm;
END;
"""

CREATE_PROXY_SRC = """
DECLARE
  new_membership_id UUID;
  caller_id UUID;
BEGIN
  caller_id := auth.uid();

  -- Caller must be an OFFICER of the target group. Proxy members are an
  -- admin-managed feature; a plain member can no longer mint them.
  IF NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE group_id = p_group_id
      AND user_id = caller_id
      AND role IN ('owner', 'admin', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Not authorized to create proxy members in this group';
  END IF;

  -- Proxies have no account and must never hold a privileged role. Whitelist
  -- the requested role instead of casting raw client input.
  IF COALESCE(p_role, 'member') NOT IN ('member', 'moderator') THEN
    RAISE EXCEPTION 'invalid_proxy_role';
  END IF;

  new_membership_id := gen_random_uuid();

  INSERT INTO memberships (
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
"""


def md5(s: str) -> str:
    return hashlib.md5(s.encode("utf-8")).hexdigest()


SCHEMA = r"""
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END;
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

DO $types$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_role') THEN
    CREATE TYPE public.membership_role AS ENUM ('owner', 'admin', 'moderator', 'member');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_standing') THEN
    CREATE TYPE public.membership_standing AS ENUM ('good', 'warning', 'suspended', 'banned');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transfer_status') THEN
    CREATE TYPE public.transfer_status AS ENUM (
      'requested', 'approved', 'rejected', 'cancelled', 'completed'
    );
  END IF;
END;
$types$;

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hq_group_id uuid
);
CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  group_level text
);
CREATE TABLE IF NOT EXISTS public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  group_id uuid,
  display_name text,
  role public.membership_role NOT NULL DEFAULT 'member',
  standing public.membership_standing NOT NULL DEFAULT 'good',
  membership_status text NOT NULL DEFAULT 'active',
  is_proxy boolean NOT NULL DEFAULT false,
  proxy_manager_id uuid,
  joined_at timestamptz DEFAULT now(),
  privacy_settings jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT memberships_membership_status_check
    CHECK (membership_status = ANY (ARRAY[
      'active'::text, 'pending_approval'::text, 'exited'::text,
      'suspended'::text, 'archived'::text
    ]))
);
CREATE TABLE IF NOT EXISTS public.group_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL
);
CREATE TABLE IF NOT EXISTS public.position_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL,
  position_id uuid NOT NULL,
  ended_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.position_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL,
  permission text NOT NULL
);
"""

STUB_TABLES = {
    "activity_feed": "group_id uuid",
    "announcements": "group_id uuid",
    "announcement_deliveries": "announcement_id uuid",
    "committees": "group_id uuid",
    "committee_members": "committee_id uuid",
    "constitution_amendments": "group_id uuid",
    "contribution_obligations": "group_id uuid",
    "contribution_types": "group_id uuid",
    "disputes": "group_id uuid",
    "documents": "group_id uuid",
    "elections": "group_id uuid",
    "election_options": "election_id uuid",
    "event_attendances": "event_id uuid",
    "event_photos": "event_id uuid",
    "event_rsvps": "event_id uuid",
    "events": "group_id uuid",
    "exchange_rates": "organization_id uuid",
    "family_members": "membership_id uuid",
    "feed_reactions": "feed_item_id uuid, membership_id uuid",
    "fine_types": "group_id uuid",
    "fines": "group_id uuid",
    "group_audit_logs": "group_id uuid",
    "group_constitutions": "group_id uuid",
    "group_payment_config": "group_id uuid",
    "group_subscriptions": "group_id uuid",
    "hosting_assignments": "roster_id uuid",
    "hosting_rosters": "group_id uuid",
    "hosting_swap_requests": "requested_by uuid, from_assignment_id uuid",
    "invitations": "group_id uuid",
    "loan_configs": "group_id uuid",
    "loan_repayments": "loan_id uuid",
    "loan_requests_v1": "group_id uuid",
    "loan_schedule": "loan_id uuid",
    "loans": "group_id uuid",
    "member_transfers": "source_group_id uuid, status public.transfer_status",
    "payment_reminder_rules": "group_id uuid",
    "payment_reminders_sent": "rule_id uuid",
    "payments": "group_id uuid, status text, recorded_by uuid, membership_id uuid",
    "project_contributions": "project_id uuid",
    "project_expenses": "project_id uuid",
    "project_milestones": "project_id uuid",
    "projects": "group_id uuid",
    "relief_claims": "plan_id uuid, membership_id uuid",
    "relief_enrollments": "plan_id uuid",
    "relief_payouts": "claim_id uuid",
    "relief_plans": "group_id uuid",
    "relief_remittances": "branch_group_id uuid",
    "savings_contributions": "cycle_id uuid",
    "savings_cycles": "group_id uuid",
    "savings_participants": "cycle_id uuid",
    "sub_group_transfers": "group_id uuid",
}


def emit_helper(name, args, rettype, lang, vol, config, src) -> str:
    search = f"\n SET search_path TO 'public'" if config else ""
    return f"""CREATE OR REPLACE FUNCTION public.{name}({args})
RETURNS {rettype}
LANGUAGE {lang}
{vol}{search}
AS $function${src}$function$;
"""


def main() -> None:
    for name, (_a, _r, _l, _v, _c, src, expected) in HELPERS.items():
        got = md5(src)
        if got != expected:
            raise SystemExit(f"helper {name} md5 {got} != {expected} len={len(src)}")

    ao = ADMIN_OR_OWNER_SRC
    if md5(ao) != "44e3246f8dab340bf65a9766c70baac2":
        # Live body may differ by trailing newline; keep closest and print.
        print("WARN is_group_admin_or_owner md5", md5(ao), "len", len(ao))
    print("has_group_permission md5", md5(HAS_PERM_SRC), "len", len(HAS_PERM_SRC))
    print("create_proxy_member md5", md5(CREATE_PROXY_SRC), "len", len(CREATE_PROXY_SRC))

    parts = [SCHEMA]
    for table, cols in STUB_TABLES.items():
        parts.append(
            f"CREATE TABLE IF NOT EXISTS public.{table} (\n"
            f"  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n"
            f"  {cols}\n);"
        )
    parts.append("ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS hq_group_id uuid;")
    parts.append(
        "GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;"
    )
    tables = ["organizations", "groups", "memberships", "group_positions",
              "position_assignments", "position_permissions", *STUB_TABLES]
    for t in tables:
        parts.append(f"GRANT ALL ON TABLE public.{t} TO authenticated, anon, service_role;")
        parts.append(f"ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY;")
        parts.append(f"ALTER TABLE public.{t} FORCE ROW LEVEL SECURITY;")

    for name, (args, rettype, lang, vol, config, src, _md) in HELPERS.items():
        parts.append(emit_helper(name, args, rettype, lang, vol, config, src))

    parts.append(emit_helper(
        "is_group_admin_or_owner",
        "p_group_id uuid",
        "boolean",
        "sql",
        "STABLE SECURITY DEFINER",
        "public",
        ao,
    ))
    parts.append(emit_helper(
        "has_group_permission",
        "gid uuid, perm_key text, uid uuid DEFAULT auth.uid()",
        "boolean",
        "plpgsql",
        "STABLE SECURITY DEFINER",
        "public",
        HAS_PERM_SRC,
    ))
    parts.append(emit_helper(
        "create_proxy_member",
        "p_group_id uuid, p_display_name text, p_phone text DEFAULT NULL, p_role text DEFAULT 'member'",
        "uuid",
        "plpgsql",
        "SECURITY DEFINER",
        None,
        CREATE_PROXY_SRC,
    ))

    grant_fns = [
        "is_group_member(uuid, uuid)",
        "get_user_group_ids(uuid)",
        "is_group_admin(uuid, uuid)",
        "is_group_owner(uuid, uuid)",
        "is_group_admin_or_owner(uuid)",
        "has_group_permission(uuid, text, uuid)",
        "create_proxy_member(uuid, text, text, text)",
    ]
    for fn in grant_fns:
        parts.append(f"GRANT EXECUTE ON FUNCTION public.{fn} TO PUBLIC, anon, authenticated, service_role;")

    # Live memberships have SELECT visibility policies. Without one, inline
    # EXISTS (memberships …) in write policies sees zero rows under FORCE RLS.
    parts.append(
        'CREATE POLICY "cut1_fixture_memberships_select" ON public.memberships\n'
        "  FOR SELECT TO public\n"
        "  USING ((user_id = auth.uid()) OR is_group_member(group_id));"
    )
    # Isolate P1-B write-policy gates: visibility SELECTs so inactive actors can
    # still *see* rows. Production keeps status-blind rls_fr_select / rls_ha_select
    # / rls_hr_select (out of Cut 1 rewrite). Fixture uses USING (true) so the
    # actor matrix exercises UPDATE/DELETE/INSERT WITH CHECK, not SELECT hiding.
    parts.append(
        'CREATE POLICY "cut1_fixture_feed_reactions_select" ON public.feed_reactions\n'
        "  FOR SELECT TO authenticated\n"
        "  USING (true);"
    )
    parts.append(
        'CREATE POLICY "cut1_fixture_hosting_assignments_select" ON public.hosting_assignments\n'
        "  FOR SELECT TO authenticated\n"
        "  USING (true);"
    )
    parts.append(
        'CREATE POLICY "cut1_fixture_hosting_rosters_select" ON public.hosting_rosters\n'
        "  FOR SELECT TO authenticated\n"
        "  USING (true);"
    )

    seen = set()
    policies = []
    for p in load_rewrite23():
        k = (p["tablename"], p["policyname"])
        policies.append(p)
        seen.add(k)
    for p in load_neutralize():
        k = (p["tablename"], p["policyname"])
        if k in seen:
            continue
        policies.append({
            "tablename": p["tablename"],
            "policyname": p["policyname"],
            "command": p["cmd"],
            "roles": p["roles"],
            "qual": p.get("qual"),
            "with_check": p.get("with_check"),
        })
        seen.add(k)
    for table, name, cmd, pred in INHERIT_ONLY:
        k = (table, name)
        if k in seen:
            continue
        policies.append({
            "tablename": table,
            "policyname": name,
            "command": cmd,
            "roles": "{authenticated}",
            "qual": None if cmd == "INSERT" else pred,
            "with_check": pred if cmd == "INSERT" else None,
        })

    for p in policies:
        parts.append(
            drop_create_sql(
                p["tablename"],
                p["policyname"],
                p["command"],
                p["roles"],
                p.get("qual"),
                p.get("with_check"),
            )
        )

    HERE.joinpath("fixture.sql").write_text("\n".join(parts) + "\n")
    print("wrote fixture.sql")


if __name__ == "__main__":
    main()
