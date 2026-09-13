#!/usr/bin/env python3
"""Assemble 00118–00123 from frozen F3 oracles. Does not copy timestamp history.

Atomicity contract: every generated migration is ONE transaction.
The oracle body historically ends with a top-level COMMIT. That COMMIT is
stripped so HGP postconditions, owner pinning, grants/revokes, authorized
role-switch verification, RESET ROLE, and final assertions all run before
the sole final top-level COMMIT. Do not append a security tail after COMMIT.
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
ORACLE_CANDIDATES = [
    pathlib.Path("/tmp/f3-oracle/migrations"),
    ROOT / "scripts" / "oracles" / "f3-forward",
]
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


def post_hgp(changed_by: str) -> str:
    return f"""
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
    RAISE EXCEPTION 'F3_ABORT: has_group_permission fingerprint changed by {changed_by}';
  END IF;
END
$f3_hgp_post$;
"""


HEADER_00118 = """-- M3 F3 bounded financial epoch foundation (minimum for F3-01…05).
-- DO NOT APPLY TO PRODUCTION from the M3 draft PR.
-- DO NOT MERGE as a production financial write path.
-- NEW sequential file after 00117. Not a rename of 20260906140228.
-- Excludes: transfer RPC replacements, legacy ledger_epoch_id columns,
--           payment-integrity replay (00104 / Cut 3 collision),
--           standing hotfix (00101 + money.ts already own confirmed-basis;
--           SQL compute_member_standing remains pre-existing status-path —
--           NO standing migration in this batch).
-- Compatible with S0-008 / 00082 member-transfer RPCs (left unchanged).
-- CALL has_group_permission only. NEVER CREATE OR REPLACE it.

"""

SPECS = [
    {
        "out": "00118_f3_bounded_financial_epoch_foundation.sql",
        "oracle": "00118_f3_bounded_financial_epoch_foundation.body.sql",
        "ticket": "F3-00",
        "header": HEADER_00118,
        "hgp_changed_by": "00118",
        "extra": r"""
  IF to_regclass('public.financial_ledger_epochs') IS NOT NULL THEN
    RAISE EXCEPTION 'F3_ABORT: financial_ledger_epochs already present';
  END IF;
  IF to_regnamespace('financial_core') IS NOT NULL THEN
    RAISE EXCEPTION 'F3_ABORT: financial_core already present';
  END IF;
  IF to_regclass('public.financial_events') IS NOT NULL
     OR to_regclass('public.financial_postings') IS NOT NULL
     OR to_regclass('public.financial_accounts') IS NOT NULL THEN
    RAISE EXCEPTION 'F3_ABORT: F3 ledger objects already present';
  END IF;
  IF to_regclass('public.groups') IS NULL THEN
    RAISE EXCEPTION 'F3_ABORT: public.groups missing (current-main floor required)';
  END IF;
""",
    },
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


DOLLAR_TAG = re.compile(r"\$([A-Za-z_][A-Za-z_0-9]*)?\$")


def top_level_lines(sql: str) -> list[tuple[int, str, str]]:
    """Return (lineno, stripped, raw) for lines that are outside dollar-quotes."""
    in_dollar: str | None = None
    out: list[tuple[int, str, str]] = []
    for lineno, raw in enumerate(sql.splitlines(), 1):
        tags = [m.group(0) for m in DOLLAR_TAG.finditer(raw)]
        if in_dollar is not None:
            if in_dollar in tags:
                in_dollar = None
            continue
        if tags:
            opened = tags[0]
            remaining = tags[1:]
            if opened in remaining:
                pass
            else:
                in_dollar = opened
                continue
        out.append((lineno, raw.strip(), raw))
    return out


def top_level_begin_commit(sql: str) -> tuple[list[int], list[int]]:
    begins: list[int] = []
    commits: list[int] = []
    for lineno, stripped, _raw in top_level_lines(sql):
        if stripped == "BEGIN;":
            begins.append(lineno)
        elif stripped == "COMMIT;":
            commits.append(lineno)
    return begins, commits


def strip_trailing_top_level_commit(sql: str) -> str:
    text = sql.rstrip() + "\n"
    _begins, commits = top_level_begin_commit(text)
    if not commits:
        return text
    last = commits[-1]
    lines = text.splitlines(keepends=True)
    # last is 1-based
    idx = last - 1
    if lines[idx].strip() != "COMMIT;":
        raise SystemExit(f"expected COMMIT; at line {last}")
    del lines[idx]
    # drop trailing blank lines left by the removal
    while lines and lines[-1].strip() == "":
        lines.pop()
    return "".join(lines) + "\n"


def extract_oracle_from_generated(path: pathlib.Path) -> str:
    text = path.read_text()
    marker = "$f3_pre$;"
    idx = text.find(marker)
    if idx < 0:
        raise SystemExit(f"no pre block in {path}")
    rest = text[idx + len(marker) :].lstrip("\n")
    tail = "DO $f3_hgp_post$"
    tail_idx = rest.find(tail)
    if tail_idx < 0:
        raise SystemExit(f"no security tail in {path}")
    body = rest[:tail_idx]
    _begins, commits = top_level_begin_commit(body)
    if commits:
        # Historical generated files had COMMIT before the tail. Keep it in the
        # oracle so the generator's strip step is the single source of the fix.
        last = commits[-1]
        lines = body.splitlines(keepends=True)
        body = "".join(lines[:last])
        if not body.rstrip().endswith("COMMIT;"):
            raise SystemExit(f"{path} extracted oracle does not end with COMMIT;")
        return body if body.endswith("\n") else body + "\n"
    # Already-atomic generated file: oracle is the body before the tail.
    return body.rstrip() + "\n"


def resolve_oracle(name: str) -> pathlib.Path | None:
    for directory in ORACLE_CANDIDATES:
        candidate = directory / name
        if candidate.exists():
            return candidate
    return None


def ensure_oracles() -> pathlib.Path:
    local = ROOT / "scripts" / "oracles" / "f3-forward"
    local.mkdir(parents=True, exist_ok=True)
    for spec in SPECS:
        existing = resolve_oracle(spec["oracle"])
        if existing is not None:
            continue
        generated = OUT / spec["out"]
        if not generated.exists():
            raise SystemExit(f"oracle {spec['oracle']} missing and {generated} missing")
        dest = local / spec["oracle"]
        dest.write_text(extract_oracle_from_generated(generated))
        print(f"extracted {dest}", file=sys.stderr)
    found = resolve_oracle(SPECS[0]["oracle"])
    if found is None:
        raise SystemExit("oracle resolution failed after extract")
    return found.parent


def security_tail(spec: dict) -> str:
    return post_hgp(spec.get("hgp_changed_by", "F3 migration")) + "\n" + POST_OWNER


def assemble(spec: dict, body: str) -> str:
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
    body = strip_trailing_top_level_commit(body)
    _begins, commits = top_level_begin_commit(body)
    if commits:
        raise SystemExit(
            f"{spec['oracle']}: premature top-level COMMIT remains at {commits} after strip"
        )
    if len(_begins) != 1:
        raise SystemExit(
            f"{spec['oracle']}: expected exactly one top-level BEGIN;, found {_begins}"
        )
    pre = (
        "DO $f3_pre$\n"
        + HGP_PIN.strip()
        + "\n"
        + spec["extra"].rstrip()
        + "\nEND\n$f3_pre$;\n\n"
    )
    hdr = spec.get("header") or header(spec["ticket"], spec["oracle"])
    text = hdr + pre + body.rstrip() + "\n\n" + security_tail(spec) + "\nCOMMIT;\n"
    begins, commits = top_level_begin_commit(text)
    if begins != [text.splitlines().index("BEGIN;") + 1] or len(begins) != 1:
        if len(begins) != 1:
            raise SystemExit(f"{spec['out']}: expected one BEGIN;, found {begins}")
    if len(commits) != 1:
        raise SystemExit(f"{spec['out']}: expected one COMMIT;, found {commits}")
    # Security tail must sit strictly before the sole COMMIT.
    tail_pos = text.find("DO $f3_hgp_post$")
    owner_pos = text.find("DO $f3_owner_pin$")
    role_pos = text.find("SET ROLE postgres;")
    reset_pos = text.find("RESET ROLE;")
    commit_pos = text.rfind("\nCOMMIT;\n")
    if min(tail_pos, owner_pos, role_pos, reset_pos) < 0:
        raise SystemExit(f"{spec['out']}: missing security tail markers")
    if not (tail_pos < owner_pos < role_pos < reset_pos < commit_pos):
        raise SystemExit(f"{spec['out']}: security tail is not entirely before final COMMIT")
    after_commit = text[commit_pos + len("\nCOMMIT;\n") :].strip()
    if after_commit:
        raise SystemExit(f"{spec['out']}: content after final COMMIT: {after_commit[:80]!r}")
    return text


def main() -> None:
    oracle_dir = ensure_oracles()
    for spec in SPECS:
        path = resolve_oracle(spec["oracle"])
        if path is None:
            raise SystemExit(f"oracle not found: {spec['oracle']} (looked in {oracle_dir})")
        dest = OUT / spec["out"]
        dest.write_text(assemble(spec, path.read_text()))
        print(f"wrote {dest} ({dest.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
