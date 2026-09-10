import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/00114_s0_p0a_cut1_active_authorization.sql"),
  "utf8",
);
const historical = fs
  .readdirSync(path.join(root, "supabase/migrations"))
  .filter((f) => /^(000\d{2}|0010[0-3])_/.test(f) || /^0011[0-3]_/.test(f));

test("exactly one new Cut 1 migration exists and historical files are untouched in this change set", () => {
  assert.match(migration, /Contract SHA: 5263f160943374676362b3983f39ac510a7930a2/);
  assert.match(migration, /PRODUCTION APPLY NOT AUTHORIZED/);
  assert.equal(
    fs.existsSync(path.join(root, "supabase/migrations/00114_s0_p0a_cut1_active_authorization.sql")),
    true,
  );
  // Guard: we only added 00114; 00001–00113 remain present.
  assert.ok(historical.length >= 100, `expected historical migrations, got ${historical.length}`);
});

test("creates current-actor helpers only (no authenticated arbitrary-subject active API)", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.is_active_group_member\(gid uuid\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_my_active_group_ids\(\)/);
  assert.doesNotMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.is_active_group_member\(gid uuid,\s*uid uuid/,
  );
  assert.doesNotMatch(migration, /get_user_active_group_ids\s*\(\s*uid/);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.is_active_group_member\(uuid\) TO authenticated/,
  );
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.is_active_group_member\(uuid\) FROM PUBLIC, anon/);
});

test("preserves has_group_permission live fallback + active + same-group join + no probe", () => {
  assert.match(migration, /IF v_role = 'owner' THEN/);
  assert.match(migration, /IF v_role = 'admin' AND v_assignment_count = 0 THEN/);
  assert.match(migration, /ended_at IS NULL/);
  assert.match(
    migration,
    /JOIN public\.group_positions gp\s+ON gp\.id = pa\.position_id\s+AND gp\.group_id = gid/,
  );
  assert.match(
    migration,
    /auth\.uid\(\) IS NOT NULL AND uid IS NOT NULL AND uid IS DISTINCT FROM auth\.uid\(\)/,
  );
  assert.match(migration, /m\.membership_status = 'active'/);
});

test("create_proxy_member is ACTIVE owner/admin/moderator only", () => {
  const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.create_proxy_member");
  const end = migration.indexOf("REVOKE ALL ON FUNCTION public.create_proxy_member");
  assert.ok(start > 0 && end > start, "create_proxy_member block");
  const body = migration.slice(start, end);
  assert.match(body, /role IN \('owner', 'admin', 'moderator'\)/);
  assert.match(body, /AND membership_status = 'active'/);
  assert.doesNotMatch(body, /members\.manage/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.create_proxy_member\(uuid, text, text, text\) FROM PUBLIC, anon/,
  );
});

test("same-group position trigger is required", () => {
  assert.match(migration, /enforce_position_assignment_same_group/);
  assert.match(migration, /trg_position_assignments_same_group/);
  assert.match(migration, /BEFORE INSERT OR UPDATE OF membership_id, position_id/);
  assert.match(migration, /mismatch_count/);
});

test("loud abort preconditions, not NOTICE\\+skip", () => {
  assert.match(migration, /CUT1_ABORT: missing expected policy/);
  assert.match(migration, /security-relevant predicate drift/);
  assert.doesNotMatch(migration, /RAISE NOTICE 'skip/i);
});

test("does not rewrite is_group_member or get_user_group_ids bodies", () => {
  assert.match(migration, /is_group_member body changed/);
  assert.match(migration, /get_user_group_ids body changed/);
  assert.match(migration, /b91a35aadb657fa2cd2c99e9313ca0f1/);
  assert.match(migration, /a9865ade7502badcd2b92a74429ac1d9/);
});

const rewrite23 = [
  ["activity_feed", "rls_af_all"],
  ["announcement_deliveries", "rls_ad_update"],
  ["committee_members", "Admins can manage committee members"],
  ["committees", "Admins can manage committees"],
  ["constitution_amendments", "rls_amend_insert"],
  ["disputes", "Users can create disputes in their groups"],
  ["disputes", "Users can delete disputes in their groups"],
  ["disputes", "Users can update disputes in their groups"],
  ["disputes", "disputes_insert"],
  ["event_attendances", "rls_att_insert"],
  ["event_photos", "rls_ep_insert"],
  ["event_rsvps", "rls_rsvp_insert"],
  ["exchange_rates", "HQ admins can manage exchange rates"],
  ["feed_reactions", "rls_fr_insert"],
  ["fines", "rls_fin_update"],
  ["group_audit_logs", "member_insert_audit_logs"],
  ["hosting_swap_requests", "rls_hsr_insert"],
  ["memberships", "Admins can add proxy members"],
  ["payment_reminders_sent", "rls_prs_insert"],
  ["payments", "rls_pay_insert"],
  ["project_contributions", "rls_pcon_write"],
  ["sub_group_transfers", "Admins can update transfers"],
  ["sub_group_transfers", "Users can create transfers"],
];

test("all 23 helper-matching REWRITE policies are present", () => {
  for (const [table, name] of rewrite23) {
    const needle = `"${name}" ON public.${table}`;
    assert.ok(migration.includes(needle), `missing rewrite of ${table}.${name}`);
  }
  assert.match(migration, /is_active_group_member\(group_id\) AND \(status = 'pending_confirmation'/);
  assert.doesNotMatch(migration, /ON public\.election_votes/);
  assert.doesNotMatch(migration, /ON public\.notifications_queue/);
});

test("payments treasurer policy adds active without changing role set", () => {
  assert.match(
    migration,
    /Group admins and treasurers can record payments/,
  );
  assert.match(
    migration,
    /role = ANY \(ARRAY\['owner'::membership_role, 'admin'::membership_role\]\)/,
  );
});
