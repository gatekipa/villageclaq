#!/usr/bin/env python3
"""Assemble 00119–00123 from frozen F3 oracles. Does not copy timestamp history."""
from __future__ import annotations

import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
ORACLE = pathlib.Path("/tmp/f3-oracle/migrations")
OUT = ROOT / "supabase" / "migrations"

HGP_PIN = r"""
DECLARE
  v_hgp_count int;
  v_hgp_ident text;
  v_hgp_result text;
  v_hgp_owner text;
  v_hgp_definer boolean;
  v_hgp_cfg text[];
  v_hgp_def_md5 text;
  v_hgp_src_md5 text;
BEGIN
  SELECT count(*) INTO v_hgp_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';
  IF v_hgp_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'F3_ABORT: has_group_permission overload count=% (expected 1; do not add 2-arg)', v_hgp_count;
  END IF;
  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_result(p.oid),
         pg_get_userbyid(p.proowner),
         p.prosecdef,
         p.proconfig,
         md5(pg_get_functiondef(p.oid)),
         md5(p.prosrc)
    INTO v_hgp_ident, v_hgp_result, v_hgp_owner, v_hgp_definer, v_hgp_cfg,
         v_hgp_def_md5, v_hgp_src_md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';
  IF v_hgp_ident IS DISTINCT FROM 'gid uuid, perm_key text, uid uuid'
     OR v_hgp_result IS DISTINCT FROM 'boolean'
     OR v_hgp_owner IS DISTINCT FROM 'postgres'
     OR v_hgp_definer IS NOT TRUE
     OR v_hgp_cfg IS DISTINCT FROM ARRAY['search_path=""']::text[]
     OR v_hgp_def_md5 IS DISTINCT FROM '695368464e97297fbf0f90ce7345162f'
     OR v_hgp_src_md5 IS DISTINCT FROM '96a296dfd541c7fc75ec68c4da1d92ff' THEN
    RAISE EXCEPTION
      'F3_ABORT: has_group_permission pin mismatch ident=% result=% owner=% definer=% cfg=% def_md5=% src_md5=%',
      v_hgp_ident, v_hgp_result, v_hgp_owner, v_hgp_definer, v_hgp_cfg,
      v_hgp_def_md5, v_hgp_src_md5;
  END IF;
"""

POST_HGP = r"""
DO $f3_hgp_post$
DECLARE
  v_hgp_def_md5 text;
  v_hgp_src_md5 text;
  v_hgp_count int;
BEGIN
  SELECT count(*) INTO v_hgp_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';
  IF v_hgp_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'F3_ABORT: has_group_permission overload count changed to %', v_hgp_count;
  END IF;
  SELECT md5(pg_get_functiondef(p.oid)), md5(p.prosrc)
    INTO v_hgp_def_md5, v_hgp_src_md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';
  IF v_hgp_def_md5 IS DISTINCT FROM '695368464e97297fbf0f90ce7345162f'
     OR v_hgp_src_md5 IS DISTINCT FROM '96a296dfd541c7fc75ec68c4da1d92ff' THEN
    RAISE EXCEPTION 'F3_ABORT: has_group_permission fingerprint changed by F3 migration';
  END IF;
END
$f3_hgp_post$;
"""

POST_OWNER = r"""
-- Pin F3 SECURITY DEFINER owner to postgres (M2/Cut 1 disposable parity).
-- Never touches has_group_permission or enqueue_outbound_notification.
DO $f3_owner_pin$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS ident
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname IN ('public','financial_core','financial_private')
      AND p.proname NOT IN ('has_group_permission','enqueue_outbound_notification')
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) OWNER TO postgres',
      r.nspname, r.proname, r.ident
    );
  END LOOP;
END
$f3_owner_pin$;

SET ROLE postgres;
DO $f3_owner_acl$
BEGIN
  IF to_regprocedure('public.post_financial_command(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.post_financial_command(jsonb) FROM PUBLIC, anon, authenticated, service_role, ubuntu';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.post_financial_command(jsonb) TO authenticated';
  END IF;
  IF to_regprocedure('public.correct_financial_event(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.correct_financial_event(jsonb) FROM PUBLIC, anon, authenticated, service_role, ubuntu';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.correct_financial_event(jsonb) TO authenticated';
  END IF;
  IF to_regprocedure('public.post_financial_opening_cash(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.post_financial_opening_cash(jsonb) FROM PUBLIC, anon, authenticated, service_role, ubuntu';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.post_financial_opening_cash(jsonb) TO authenticated';
  END IF;
  IF to_regprocedure('public.get_financial_projection_bundle(uuid,timestamptz,timestamptz,timestamptz)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_financial_projection_bundle(uuid,timestamptz,timestamptz,timestamptz), public.get_financial_cashbook(uuid,timestamptz,timestamptz,uuid,text,integer,integer) FROM PUBLIC, anon, authenticated, service_role, ubuntu';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_financial_projection_bundle(uuid,timestamptz,timestamptz,timestamptz), public.get_financial_cashbook(uuid,timestamptz,timestamptz,uuid,text,integer,integer) TO authenticated';
  END IF;
END
$f3_owner_acl$;
RESET ROLE;
"""

SPECS = [
    {
        "out": "00119_f3_01_core_ledger_foundation.sql",
        "oracle": "20260908154824_f3_core_ledger_foundation.sql",
        "ticket": "F3-01",
        "extra": r"""
  IF to_regclass('public.financial_ledger_epochs') IS NULL THEN
    RAISE EXCEPTION 'F3_ABORT: financial_ledger_epochs missing — apply 00118 first';
  END IF;
  IF to_regnamespace('financial_core') IS NOT NULL
     OR to_regclass('public.financial_accounts') IS NOT NULL
     OR to_regclass('public.financial_events') IS NOT NULL
     OR to_regclass('public.financial_postings') IS NOT NULL
     OR to_regtype('public.financial_event_class') IS NOT NULL THEN
    RAISE EXCEPTION 'F3_ABORT: F3-01 objects already present';
  END IF;
  IF to_regclass('public.memberships') IS NULL OR to_regclass('public.projects') IS NULL THEN
    RAISE EXCEPTION 'F3_ABORT: memberships/projects missing (current-main floor required)';
  END IF;
""",
    },
    {
        "out": "00120_f3_02_secure_posting_idempotency.sql",
        "oracle": "20260908215831_f3_secure_posting_idempotency.sql",
        "ticket": "F3-02",
        "extra": r"""
  IF to_regclass('public.financial_events') IS NULL
     OR to_regclass('public.financial_postings') IS NULL THEN
    RAISE EXCEPTION 'F3_ABORT: F3-01 tables missing — apply 00119 first';
  END IF;
  IF to_regprocedure('public.post_financial_command(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'F3_ABORT: post_financial_command already present';
  END IF;
""",
    },
    {
        "out": "00121_f3_03_projection_read_proof.sql",
        "oracle": "20260909022633_f3_projection_read_proof.sql",
        "ticket": "F3-03",
        "extra": r"""
  IF to_regprocedure('public.post_financial_command(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'F3_ABORT: post_financial_command missing — apply 00120 first';
  END IF;
  IF to_regprocedure('public.get_financial_projection_bundle(uuid,timestamptz,timestamptz,timestamptz)') IS NOT NULL THEN
    RAISE EXCEPTION 'F3_ABORT: projection RPCs already present';
  END IF;
""",
    },
    {
        "out": "00122_f3_04_correction_reversal.sql",
        "oracle": "20260909054500_f3_correction_reversal.sql",
        "ticket": "F3-04",
        "extra": r"""
  IF to_regprocedure('public.get_financial_projection_bundle(uuid,timestamptz,timestamptz,timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'F3_ABORT: projection RPCs missing — apply 00121 first';
  END IF;
  IF to_regprocedure('public.correct_financial_event(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'F3_ABORT: correct_financial_event already present';
  END IF;
""",
    },
    {
        "out": "00123_f3_05_opening_cash_command.sql",
        "oracle": "20260910054713_f3_opening_cash.sql",
        "ticket": "F3-05",
        "extra": r"""
  IF to_regprocedure('public.correct_financial_event(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'F3_ABORT: correct_financial_event missing — apply 00122 first';
  END IF;
  IF to_regprocedure('public.post_financial_opening_cash(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'F3_ABORT: post_financial_opening_cash already present';
  END IF;
""",
    },
]


def header(ticket: str, oracle: str) -> str:
    return f"""-- M3 forward rematerialization of {ticket} onto post-S0 / post-M2 main (after 00117).
-- DO NOT APPLY TO PRODUCTION from the M3 draft PR.
-- DO NOT MERGE as a production financial write path.
-- Oracle (REFERENCE ONLY, not applied): {oracle} on c7b4cd535d7125737eab2ec0fad27cae9432e8c3
-- Planning: PR #83 tip a178068384290b37ec6c17b02428b399d52ddd10
-- CALL public.has_group_permission(gid, perm_key, uid) only. NEVER CREATE OR REPLACE it.
-- NEVER add a 2-arg overload. NEVER touch Cut 3 storage / Cut 2 queue / M2 policy tables.
-- No F3-06 UI, no F3-07 Record Transaction, no FCG-1 close, no F3-08/09, no M4.
-- No notifications_queue / enqueue / producer wiring.
-- No opening-cash product UX (command only; UI remains hidden).

"""


def main() -> None:
    for spec in SPECS:
        body = (ORACLE / spec["oracle"]).read_text()
        if "CREATE OR REPLACE FUNCTION public.has_group_permission" in body:
            raise SystemExit(f"{spec['oracle']} contains has_group_permission REPLACE")
        banned = (
            "notifications_queue",
            "enqueue_outbound_notification",
            "storage_receipts_authorized",
            "can_access_payment_receipt",
        )
        for token in banned:
            if token in body:
                raise SystemExit(f"{spec['oracle']} contains banned token {token}")
        pre = (
            "DO $f3_pre$\n"
            + HGP_PIN.strip()
            + "\n"
            + spec["extra"].rstrip()
            + "\nEND\n$f3_pre$;\n\n"
        )
        text = header(spec["ticket"], spec["oracle"]) + pre + body.rstrip() + "\n\n" + POST_HGP + "\n" + POST_OWNER
        dest = OUT / spec["out"]
        dest.write_text(text)
        print(f"wrote {dest} ({len(text)} bytes)")


if __name__ == "__main__":
    main()
