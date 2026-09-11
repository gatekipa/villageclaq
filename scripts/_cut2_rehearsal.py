#!/usr/bin/env python3
"""Disposable no-send rehearsal. Never talks to production. Zero provider sends."""
from __future__ import annotations

import json
import subprocess
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PG = ["sudo", "-u", "postgres", "psql", "-d", "s0p0b_cut2_disposable", "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A"]
MATRIX = json.loads(
    (ROOT / "docs/evidence/S0_CUT2_LEGACY_WA_INDEX_PROVENANCE_MATRIX_20260911.json").read_text()
)

PREFS = json.dumps(
    {
        "channels": {"in_app": True, "email": True, "sms": True, "whatsapp": True, "push": False},
        "types": {
            "payment_reminders": {"whatsapp": True, "sms": True, "email": True},
            "event_reminders": {"whatsapp": True, "sms": True, "email": True},
            "minutes_published": {"whatsapp": True, "sms": True, "email": True},
            "relief_updates": {"whatsapp": True, "sms": True, "email": True},
            "standing_changes": {"whatsapp": True, "sms": True, "email": True},
            "announcements": {"whatsapp": True, "sms": True, "email": True},
            "hosting_reminders": {"whatsapp": True, "sms": True, "email": True},
            "new_member": {"whatsapp": True, "sms": True, "email": True},
            "loan_updates": {"whatsapp": True, "sms": True, "email": True},
            "fine_updates": {"whatsapp": True, "sms": True, "email": True},
            "subscription_updates": {"whatsapp": True, "sms": True, "email": True},
            "elections": {"whatsapp": True, "sms": True, "email": True},
            "meeting_minutes": {"whatsapp": True, "sms": True, "email": True},
        },
    }
)


def psql(sql: str) -> str:
    r = subprocess.run(PG + ["-c", sql], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"psql failed:\n{sql}\n{r.stderr}\n{r.stdout}")
    return r.stdout.strip()


def q(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def seed_common(gid: str, uid: str, mid: str, standing: str = "good", role: str = "member") -> str:
    return f"""
INSERT INTO public.groups (id, name, locale) VALUES ({q(gid)}, 'Cut2 Fixture', 'en') ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (id, email, phone) VALUES ({q(uid)}, 'cut2-{uid[:8]}@example.test', '+237600000001') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, full_name, phone, preferred_locale, notification_preferences)
VALUES ({q(uid)}, 'Cut2 User', '+237600000001', 'en', {q(PREFS)}::jsonb) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.memberships (id, group_id, user_id, is_proxy, membership_status, standing, role, phone, privacy_settings)
VALUES ({q(mid)}, {q(gid)}, {q(uid)}, false, 'active', {q(standing)}::public.membership_standing, {q(role)}::public.membership_role, '+237600000001', '{{}}')
ON CONFLICT (id) DO NOTHING;
"""


def seed_for(ix: dict) -> str:
    t = ix["notification_type"]
    case = ix["trusted_rpc_case"]
    oid = case["p_domain_object_id"]
    rid = case.get("p_recipient_membership_id")
    writes = case.get("writes_data") or {}
    gid = str(uuid.uuid5(uuid.NAMESPACE_URL, f"cut2-g-{t}-{oid}"))
    uid = writes.get("userId") or writes.get("recipientUserId") or str(uuid.uuid5(uuid.NAMESPACE_URL, f"cut2-u-{t}-{oid}"))
    mid = rid or (oid if t in ("welcome", "standing_changed", "proxy_claim") else str(uuid.uuid5(uuid.NAMESPACE_URL, f"cut2-m-{t}-{oid}")))
    standing = writes.get("newStanding") or "good"
    role = "owner" if t in ("remittance_confirmed", "remittance_disputed", "subscription_expiring") else "member"
    sql = [seed_common(gid, uid, mid, standing=standing, role=role)]
    plan = str(uuid.uuid5(uuid.NAMESPACE_URL, f"cut2-plan-{t}-{oid}"))
    roster = str(uuid.uuid5(uuid.NAMESPACE_URL, f"cut2-roster-{t}-{oid}"))
    if t == "payment_receipt":
        sql.append(f"INSERT INTO public.payments (id, group_id, membership_id) VALUES ({q(oid)}, {q(gid)}, {q(mid)}) ON CONFLICT DO NOTHING;")
    elif t == "payment_reminder":
        sql.append(f"INSERT INTO public.contribution_obligations (id, group_id, membership_id) VALUES ({q(oid)}, {q(gid)}, {q(mid)}) ON CONFLICT DO NOTHING;")
    elif t in ("welcome", "standing_changed"):
        pass
    elif t == "relief_enrollment":
        sql.append(f"INSERT INTO public.relief_plans (id, group_id) VALUES ({q(plan)}, {q(gid)}) ON CONFLICT DO NOTHING;")
        sql.append(f"INSERT INTO public.relief_enrollments (id, plan_id, membership_id) VALUES ({q(oid)}, {q(plan)}, {q(mid)}) ON CONFLICT DO NOTHING;")
    elif t == "relief_claim_approved":
        sql.append(f"INSERT INTO public.relief_plans (id, group_id) VALUES ({q(plan)}, {q(gid)}) ON CONFLICT DO NOTHING;")
        sql.append(f"INSERT INTO public.relief_claims (id, plan_id, membership_id, status) VALUES ({q(oid)}, {q(plan)}, {q(mid)}, 'approved') ON CONFLICT DO NOTHING;")
    elif t == "relief_claim_denied":
        sql.append(f"INSERT INTO public.relief_plans (id, group_id) VALUES ({q(plan)}, {q(gid)}) ON CONFLICT DO NOTHING;")
        sql.append(f"INSERT INTO public.relief_claims (id, plan_id, membership_id, status) VALUES ({q(oid)}, {q(plan)}, {q(mid)}, 'denied') ON CONFLICT DO NOTHING;")
    elif t in ("remittance_confirmed", "remittance_disputed"):
        st = "confirmed" if t.endswith("confirmed") else "disputed"
        sql.append(f"INSERT INTO public.relief_remittances (id, branch_group_id, status) VALUES ({q(oid)}, {q(gid)}, {q(st)}) ON CONFLICT DO NOTHING;")
    elif t in ("hosting_assignment", "hosting_reminder"):
        assigned = writes.get("assignedDate") or "2026-09-11"
        sql.append(f"INSERT INTO public.hosting_rosters (id, group_id) VALUES ({q(roster)}, {q(gid)}) ON CONFLICT DO NOTHING;")
        sql.append(
            f"INSERT INTO public.hosting_assignments (id, roster_id, membership_id, assigned_date) VALUES ({q(oid)}, {q(roster)}, {q(mid)}, {q(assigned)}::date) ON CONFLICT DO NOTHING;"
        )
    elif t == "event_reminder":
        sql.append(f"INSERT INTO public.events (id, group_id) VALUES ({q(oid)}, {q(gid)}) ON CONFLICT DO NOTHING;")
    elif t == "loan_approved":
        sql.append(f"INSERT INTO public.loans (id, group_id, membership_id, status) VALUES ({q(oid)}, {q(gid)}, {q(mid)}, 'approved') ON CONFLICT DO NOTHING;")
    elif t == "loan_overdue":
        sql.append(f"INSERT INTO public.loans (id, group_id, membership_id, status) VALUES ({q(oid)}, {q(gid)}, {q(mid)}, 'repaying') ON CONFLICT DO NOTHING;")
    elif t == "fine_issued":
        sql.append(f"INSERT INTO public.fines (id, group_id, membership_id) VALUES ({q(oid)}, {q(gid)}, {q(mid)}) ON CONFLICT DO NOTHING;")
    elif t == "member_invitation":
        sql.append(f"INSERT INTO public.invitations (id, group_id, phone, email) VALUES ({q(oid)}, {q(gid)}, '+237600000009', 'invitee@example.test') ON CONFLICT DO NOTHING;")
    elif t == "subscription_expiring":
        sql.append(f"INSERT INTO public.group_subscriptions (id, group_id, status) VALUES ({q(oid)}, {q(gid)}, 'active') ON CONFLICT DO NOTHING;")
    return "\n".join(sql)


def poison_sql(ix: dict) -> str:
    p = ix["legacy_poison_fixture"]
    data = json.dumps(p["data"])
    return f"""
INSERT INTO public.notifications_queue (channel, template, status, data, cut2_provenance_version)
VALUES ('whatsapp'::public.notification_channel, {q(p['template'])}, 'queued'::public.notification_queue_status, {q(data)}::jsonb, NULL);
"""


def rpc_sql(ix: dict) -> str:
    c = ix["trusted_rpc_case"]
    recip = "NULL" if not c.get("p_recipient_membership_id") else q(c["p_recipient_membership_id"])
    loc = "NULL" if not c.get("p_locale") else q(c["p_locale"])
    return (
        "SELECT queue_id::text, result FROM public.enqueue_outbound_notification("
        f"{q(c['p_notification_type'])}, {q(c['p_domain_object_id'])}::uuid, "
        f"'whatsapp'::public.notification_channel, {recip}::uuid, {loc});"
    )


def main() -> None:
    out = []
    for ix in MATRIX["indexes"]:
        psql(seed_for(ix))
        psql(poison_sql(ix))
    for ix in MATRIX["indexes"]:
        c = ix["trusted_rpc_case"]
        recip = "NULL" if not c.get("p_recipient_membership_id") else q(c["p_recipient_membership_id"]) + "::uuid"
        if recip != "NULL":
            recip = q(c["p_recipient_membership_id"]) + "::uuid"
        poison_id = psql(
            "SELECT id::text FROM public.notifications_queue "
            f"WHERE template = {q(ix['template'])} AND cut2_provenance_version IS NULL "
            "AND data @> " + q(json.dumps(ix["legacy_poison_fixture"]["data"])) + "::jsonb LIMIT 1;"
        )
        poison_snap = psql(
            f"SELECT md5(row_to_json(q)::text) FROM (SELECT channel, template, status, data, cut2_provenance_version FROM public.notifications_queue WHERE id={q(poison_id)}::uuid) q;"
        )
        # first trusted may already exist from accidental earlier call — delete trusted for this key then re-run
        psql(
            f"DELETE FROM public.notifications_queue WHERE cut2_provenance_version = 1 AND template = {q(c['p_notification_type'])} AND data->>'idempotencyKey' = {q(c['canonical_idempotencyKey'])};"
        )
        first = psql(
            f"SELECT queue_id::text || ',' || result FROM public.enqueue_outbound_notification({q(c['p_notification_type'])}, {q(c['p_domain_object_id'])}::uuid, 'whatsapp'::public.notification_channel, {recip if recip!='NULL' else 'NULL'}, 'en');"
        )
        # tuples only
        first_val = [ln.strip() for ln in first.splitlines() if ln.strip() and "," in ln and "queue_id" not in ln][-1]
        qid1, res1 = first_val.split(",", 1)
        second = psql(
            f"SELECT queue_id::text || ',' || result FROM public.enqueue_outbound_notification({q(c['p_notification_type'])}, {q(c['p_domain_object_id'])}::uuid, 'whatsapp'::public.notification_channel, {recip if recip!='NULL' else 'NULL'}, 'en');"
        )
        second_val = [ln.strip() for ln in second.splitlines() if ln.strip() and "," in ln and "queue_id" not in ln][-1]
        qid2, res2 = second_val.split(",", 1)
        poison_snap2 = psql(
            f"SELECT md5(row_to_json(q)::text) FROM (SELECT channel, template, status, data, cut2_provenance_version FROM public.notifications_queue WHERE id={q(poison_id)}::uuid) q;"
        )
        prov = psql(f"SELECT cut2_provenance_version::text FROM public.notifications_queue WHERE id={q(qid1)}::uuid;")
        # never return legacy id
        out.append(
            {
                "index_name": ix["index_name"],
                "notification_type": c["p_notification_type"],
                "legacy_poison_id": poison_id,
                "first": {"queue_id": qid1, "result": res1, "cut2_provenance_version": int(prov) if prov.isdigit() else prov},
                "second": {"queue_id": qid2, "result": res2},
                "legacy_row_unchanged": poison_snap == poison_snap2,
                "legacy_id_never_returned": qid1 != poison_id and qid2 != poison_id,
                "zero_sends": True,
            }
        )
        print(ix["short_name"], res1, qid1[:8], res2, qid2[:8], "legacy_unchanged", poison_snap == poison_snap2)

    # privilege probes
    priv = {
        "anon_insert": psql("SELECT has_table_privilege('anon','public.notifications_queue','INSERT');"),
        "auth_insert": psql("SELECT has_table_privilege('authenticated','public.notifications_queue','INSERT');"),
        "sr_insert": psql("SELECT has_table_privilege('service_role','public.notifications_queue','INSERT');"),
        "anon_execute": psql("SELECT has_function_privilege('anon','public.enqueue_outbound_notification(text,uuid,public.notification_channel,uuid,text)','EXECUTE');"),
        "auth_execute": psql("SELECT has_function_privilege('authenticated','public.enqueue_outbound_notification(text,uuid,public.notification_channel,uuid,text)','EXECUTE');"),
        "sr_execute": psql("SELECT has_function_privilege('service_role','public.enqueue_outbound_notification(text,uuid,public.notification_channel,uuid,text)','EXECUTE');"),
        "sr_update_status": psql("SELECT has_column_privilege('service_role','public.notifications_queue','status','UPDATE');"),
        "sr_update_provenance": psql("SELECT has_column_privilege('service_role','public.notifications_queue','cut2_provenance_version','UPDATE');"),
        "channel_deny_loan_overdue_sms": psql(
            "SELECT result FROM public.enqueue_outbound_notification('loan_overdue', '33333333-0000-4000-8000-000000000008'::uuid, 'sms'::public.notification_channel, NULL, 'en');"
        ),
        "channel_deny_proxy_email": psql(
            "SELECT result FROM public.enqueue_outbound_notification('proxy_claim', 'cccc9999-0000-4000-8000-000000000011'::uuid, 'email'::public.notification_channel, NULL, 'en');"
        ),
        "push_deny": psql(
            "SELECT result FROM public.enqueue_outbound_notification('welcome', 'cccc9999-0000-4000-8000-000000000011'::uuid, 'push'::public.notification_channel, NULL, 'en');"
        ),
    }

    (ROOT / "docs/evidence/S0_CUT2_17_WA_COLLISION_RESULTS_20260911.json").write_text(
        json.dumps(
            {
                "document": "S0_CUT2_17_WA_COLLISION_RESULTS_20260911",
                "disposable_db": "s0p0b_cut2_disposable",
                "production_apply": False,
                "real_sends": 0,
                "count": len(out),
                "all_first_inserted": all(r["first"]["result"] == "inserted" for r in out),
                "all_second_duplicate": all(r["second"]["result"] == "duplicate" for r in out),
                "all_legacy_unchanged": all(r["legacy_row_unchanged"] for r in out),
                "legacy_id_never_returned": all(r["legacy_id_never_returned"] for r in out),
                "results": out,
                "privileges": priv,
            },
            indent=2,
        )
        + "\n"
    )
    print("wrote collision results", len(out))
    print(json.dumps({k: v.replace("\n", " ")[:80] for k, v in priv.items()}, indent=2))


if __name__ == "__main__":
    main()
