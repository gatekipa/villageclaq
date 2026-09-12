/**
 * Disposable-only qualification for 00117.
 * NEVER point at production llbnliixczcqfftxpsmb.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_URL = "postgresql://postgres@127.0.0.1:5432/m2_notification_policy_disposable";
const url = process.env.M2_DISPOSABLE_DATABASE_URL || DEFAULT_URL;

if (/llbnliixczcqfftxpsmb/i.test(url)) {
  console.error("REFUSE: disposable URL must not target production.");
  process.exit(2);
}

function psql(sql, opts = {}) {
  const res = spawnSync("psql", ["-d", url, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A", "-c", sql], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "" },
  });
  if (res.status !== 0 && !opts.allowFail) {
    throw new Error((res.stderr || res.stdout || "psql failed").trim());
  }
  return {
    ok: res.status === 0,
    out: (res.stdout || "").trim(),
    err: (res.stderr || "").trim(),
    status: res.status,
  };
}

function psqlFile(rel) {
  const abs = path.join(root, rel);
  const res = spawnSync("psql", ["-d", url, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-f", abs], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "" },
  });
  if (res.status !== 0) {
    throw new Error(`${rel} failed:\n${res.stderr || res.stdout}`);
  }
  return (res.stdout || "").trim();
}

const G1 = "11111111-1111-4111-8111-111111111111";
const G2 = "22222222-2222-4222-8222-222222222222";
const U_OWNER = "10000000-0000-4000-8000-000000000001";
const U_MEMBER = "10000000-0000-4000-8000-000000000002";
const U_EXITED = "10000000-0000-4000-8000-000000000003";
const U_G2 = "10000000-0000-4000-8000-000000000004";
const U_OFFICER = "10000000-0000-4000-8000-000000000005";
const U_NOKEY = "10000000-0000-4000-8000-000000000006";
const POS_SETTINGS = "20000000-0000-4000-8000-000000000001";
const POS_HOSTING = "20000000-0000-4000-8000-000000000002";
const M_OWNER = "30000000-0000-4000-8000-000000000001";
const M_MEMBER = "30000000-0000-4000-8000-000000000002";
const M_EXITED = "30000000-0000-4000-8000-000000000003";
const M_G2 = "30000000-0000-4000-8000-000000000004";
const M_OFFICER = "30000000-0000-4000-8000-000000000005";
const M_NOKEY = "30000000-0000-4000-8000-000000000006";

const results = [];

function record(id, pass, detail) {
  results.push({ id, pass, detail });
  const mark = pass ? "PASS" : "FAIL";
  console.log(`${mark} ${id}${detail ? ` — ${detail}` : ""}`);
}

function asUser(uid, sql) {
  return psql(`
    SET ROLE authenticated;
    SELECT set_config('m2.uid', '${uid}', true);
    ${sql}
    RESET ROLE;
    SELECT set_config('m2.uid', '', true);
  `, { allowFail: true });
}

try {
  const ping = psql("select 1");
  if (!ping.ok || ping.out !== "1") {
    throw new Error("psql cannot connect to disposable DB. Set M2_DISPOSABLE_DATABASE_URL.");
  }

  const preQueue = psql("SELECT count(*) FROM public.notifications_queue").out;

  psqlFile("supabase/migrations/00117_m2_notification_policy_foundation.sql");
  record("APPLY_00117", true, "applied after 00116-era fixture");

  const tables = psql(`
    SELECT string_agg(relname, ',' ORDER BY relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
      AND c.relname LIKE 'notification_polic%'
  `).out;
  record("THREE_TABLES", tables === "notification_policies,notification_policy_occurrences,notification_policy_triggers", tables);

  const force = psql(`
    SELECT bool_and(c.relrowsecurity AND c.relforcerowsecurity)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN (
      'notification_policies','notification_policy_triggers','notification_policy_occurrences'
    )
  `).out;
  record("FORCE_RLS", force === "t", force);

  const defaults = psql(`
    SELECT
      (SELECT column_default FROM information_schema.columns
        WHERE table_name='notification_policies' AND column_name='enabled') || ',' ||
      (SELECT column_default FROM information_schema.columns
        WHERE table_name='notification_policies' AND column_name='channel_push')
  `).out;
  record("DORMANT_DEFAULTS", defaults === "false,false", defaults);

  const zeroRows = psql(`
    SELECT
      (SELECT count(*) FROM notification_policies) || ',' ||
      (SELECT count(*) FROM notification_policy_triggers) || ',' ||
      (SELECT count(*) FROM notification_policy_occurrences)
  `).out;
  record("MIGRATION_ZERO_POLICY_ROWS", zeroRows === "0,0,0", zeroRows);

  const postQueue = psql("SELECT count(*) FROM public.notifications_queue").out;
  record("QUEUE_DELTA_ZERO", preQueue === postQueue, `pre=${preQueue} post=${postQueue}`);

  const enqueueArgs = psql(`
    SELECT pg_get_function_identity_arguments(p.oid)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='enqueue_outbound_notification'
  `).out;
  record(
    "ENQUEUE_IDENTITY_UNCHANGED",
    enqueueArgs === "p_notification_type text, p_domain_object_id uuid, p_channel notification_channel, p_recipient_membership_id uuid, p_locale text",
    enqueueArgs,
  );

  const falsy = (s) => /^f(alse)?(,f(alse)?)*$/i.test(String(s).replace(/\s/g, ""));
  const queueInsert = psql(`
    SELECT has_table_privilege('authenticated','public.notifications_queue','INSERT')::text || ',' ||
           has_table_privilege('service_role','public.notifications_queue','INSERT')::text
  `).out;
  record("NO_QUEUE_INSERT_GRANT", falsy(queueInsert), queueInsert);

  const occMut = psql(`
    SELECT has_table_privilege('authenticated','public.notification_policy_occurrences','INSERT')::text || ',' ||
           has_table_privilege('authenticated','public.notification_policy_occurrences','UPDATE')::text || ',' ||
           has_table_privilege('authenticated','public.notification_policy_occurrences','DELETE')::text || ',' ||
           has_table_privilege('service_role','public.notification_policy_occurrences','INSERT')::text
  `).out;
  record("OCCURRENCES_NO_MUTATION_GRANTS", falsy(occMut), occMut);

  const definer = psql(`
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('m2_is_valid_iana_timezone','notification_policy_set_updated_at')
      AND p.prosecdef
  `).out;
  record("NO_NEW_SECURITY_DEFINER", definer === "0", definer);

  psql(`
    INSERT INTO public.groups(id, name) VALUES
      ('${G1}', 'Tenant One'),
      ('${G2}', 'Tenant Two');
    INSERT INTO public.memberships(id, group_id, user_id, role, membership_status) VALUES
      ('${M_OWNER}', '${G1}', '${U_OWNER}', 'owner', 'active'),
      ('${M_MEMBER}', '${G1}', '${U_MEMBER}', 'member', 'active'),
      ('${M_EXITED}', '${G1}', '${U_EXITED}', 'owner', 'exited'),
      ('${M_G2}', '${G2}', '${U_G2}', 'owner', 'active'),
      ('${M_OFFICER}', '${G1}', '${U_OFFICER}', 'member', 'active'),
      ('${M_NOKEY}', '${G1}', '${U_NOKEY}', 'member', 'active');
    INSERT INTO public.group_positions(id, group_id, name) VALUES
      ('${POS_SETTINGS}', '${G1}', 'Secretary'),
      ('${POS_HOSTING}', '${G1}', 'Host Captain');
    INSERT INTO public.position_assignments(membership_id, position_id) VALUES
      ('${M_OFFICER}', '${POS_SETTINGS}'),
      ('${M_NOKEY}', '${POS_HOSTING}');
    INSERT INTO public.position_permissions(position_id, permission) VALUES
      ('${POS_SETTINGS}', 'settings.manage'),
      ('${POS_HOSTING}', 'hosting.manage');
  `);

  const ownerIns = asUser(U_OWNER, `
    INSERT INTO public.notification_policies (group_id, domain, timezone)
    VALUES ('${G1}', 'event', 'UTC')
    RETURNING id;
  `);
  record("OWNER_INSERT_ALLOW", ownerIns.ok && /[0-9a-f-]{36}/i.test(ownerIns.out), ownerIns.err || ownerIns.out);

  const policyId = psql(`
    SELECT id::text FROM public.notification_policies
    WHERE group_id='${G1}' AND domain='event' AND object_id IS NULL
    LIMIT 1
  `).out;

  const officerIns = asUser(U_OFFICER, `
    INSERT INTO public.notification_policy_triggers (policy_id, offset_hours)
    VALUES ('${policyId}', -48)
    RETURNING id;
  `);
  record("SETTINGS_MANAGE_OFFICER_TRIGGER_ALLOW", officerIns.ok, officerIns.err || officerIns.out);

  const memberIns = asUser(U_MEMBER, `
    INSERT INTO public.notification_policies (group_id, domain)
    VALUES ('${G1}', 'hosting');
  `);
  record("NON_MANAGER_INSERT_DENY", !memberIns.ok || memberIns.out === "", memberIns.err || memberIns.out);

  const memberSel = asUser(U_MEMBER, `SELECT count(*) FROM public.notification_policies;`);
  record("NON_MANAGER_SELECT_DENY", memberSel.ok && memberSel.out.split("\n").pop() === "0", memberSel.out);

  const exitedSel = asUser(U_EXITED, `SELECT count(*) FROM public.notification_policies;`);
  record("EXITED_OWNER_SELECT_DENY", exitedSel.ok && exitedSel.out.split("\n").pop() === "0", exitedSel.out);

  const crossIns = asUser(U_G2, `
    INSERT INTO public.notification_policies (group_id, domain)
    VALUES ('${G1}', 'payment');
  `);
  record("CROSS_TENANT_INSERT_DENY", !crossIns.ok || crossIns.out === "", crossIns.err || crossIns.out);

  const crossSel = asUser(U_G2, `SELECT count(*) FROM public.notification_policies;`);
  record("CROSS_TENANT_SELECT_DENY", crossSel.ok && crossSel.out.split("\n").pop() === "0", crossSel.out);

  const nokeySel = asUser(U_NOKEY, `SELECT count(*) FROM public.notification_policies;`);
  record("OFFICER_WITHOUT_SETTINGS_MANAGE_DENY", nokeySel.ok && nokeySel.out.split("\n").pop() === "0", nokeySel.out);

  const announce = psql(`
    INSERT INTO public.notification_policies (group_id, domain)
    VALUES ('${G1}', 'announcement');
  `, { allowFail: true });
  record("ANNOUNCEMENT_DOMAIN_REJECT", !announce.ok, announce.err);

  const pushTrue = psql(`
    INSERT INTO public.notification_policies (group_id, domain, channel_push)
    VALUES ('${G1}', 'event', true);
  `, { allowFail: true });
  record("CHANNEL_PUSH_TRUE_REJECT", !pushTrue.ok, pushTrue.err);

  const hostingEmail = psql(`
    INSERT INTO public.notification_policies (group_id, domain, channel_email)
    VALUES ('${G1}', 'hosting', true);
  `, { allowFail: true });
  record("HOSTING_EMAIL_TRUE_REJECT", !hostingEmail.ok, hostingEmail.err);

  const badTz = psql(`
    INSERT INTO public.notification_policies (group_id, domain, timezone)
    VALUES ('${G1}', 'event', 'Not/A_Zone');
  `, { allowFail: true });
  record("INVALID_TZ_REJECT", !badTz.ok, badTz.err);

  const repeatNoMax = psql(`
    INSERT INTO public.notification_policies (group_id, domain, repeat_interval_hours)
    VALUES ('${G1}', 'event', 24);
  `, { allowFail: true });
  record("REPEAT_REQUIRES_MAX", !repeatNoMax.ok, repeatNoMax.err);

  const occId = "40000000-0000-4000-8000-000000000001";
  psql(`
    INSERT INTO public.notification_policy_occurrences (
      id, group_id, domain, object_id, anchor_at, trigger_offset_hours,
      occurrence_index, identity_key, eligible_at
    ) VALUES (
      '${occId}', '${G1}', 'event', '55555555-5555-4555-8555-555555555555',
      '2026-10-01T12:00:00Z', -48, 0,
      'event:55555555-5555-4555-8555-555555555555:2026-10-01T12:00:00.000Z:-48:0',
      '2026-09-29T12:00:00Z'
    );
  `);

  const ownerOccSel = asUser(U_OWNER, `SELECT count(*) FROM public.notification_policy_occurrences;`);
  record("OCCURRENCES_SELECT_MANAGER", ownerOccSel.ok && ownerOccSel.out.split("\n").pop() === "1", ownerOccSel.out);

  const memberOccSel = asUser(U_MEMBER, `SELECT count(*) FROM public.notification_policy_occurrences;`);
  record("OCCURRENCES_SELECT_NON_MANAGER_DENY", memberOccSel.ok && memberOccSel.out.split("\n").pop() === "0", memberOccSel.out);

  const ownerOccIns = asUser(U_OWNER, `
    INSERT INTO public.notification_policy_occurrences (
      group_id, domain, object_id, anchor_at, trigger_offset_hours,
      occurrence_index, identity_key, eligible_at
    ) VALUES (
      '${G1}', 'event', '66666666-6666-4666-8666-666666666666',
      '2026-10-02T12:00:00Z', -48, 0,
      'event:66666666-6666-4666-8666-666666666666:2026-10-02T12:00:00.000Z:-48:0',
      '2026-09-30T12:00:00Z'
    );
  `);
  record("OCCURRENCES_AUTH_INSERT_DENY", !ownerOccIns.ok, ownerOccIns.err || ownerOccIns.out);

  const ownerOccUpd = asUser(U_OWNER, `
    UPDATE public.notification_policy_occurrences SET status='cancelled' WHERE id='${occId}';
  `);
  record("OCCURRENCES_AUTH_UPDATE_DENY", !ownerOccUpd.ok || ownerOccUpd.out === "", ownerOccUpd.err || ownerOccUpd.out);

  const ownerOccDel = asUser(U_OWNER, `
    DELETE FROM public.notification_policy_occurrences WHERE id='${occId}';
  `);
  record("OCCURRENCES_AUTH_DELETE_DENY", !ownerOccDel.ok || ownerOccDel.out === "", ownerOccDel.err || ownerOccDel.out);

  const remainingOcc = psql(`SELECT count(*) FROM public.notification_policy_occurrences`).out;
  record("OCCURRENCE_STILL_ONE_AFTER_DENIED_MUTATION", remainingOcc === "1", remainingOcc);

  const enabledDefaultRow = psql(`
    INSERT INTO public.notification_policies (group_id, domain)
    VALUES ('${G1}', 'payment')
    RETURNING enabled, channel_push, channel_email, channel_sms, channel_whatsapp, channel_in_app;
  `).out;
  record(
    "INSERTED_ROW_DORMANT",
    enabledDefaultRow.includes("f") && !enabledDefaultRow.split(",")[0].includes("t"),
    enabledDefaultRow,
  );

  const unique = psql(`
    INSERT INTO public.notification_policies (group_id, domain)
    VALUES ('${G1}', 'event');
  `, { allowFail: true });
  record("UNIQUE_GROUP_DOMAIN_NULL_OBJECT", !unique.ok, unique.err);

  const finalQueue = psql("SELECT count(*) FROM public.notifications_queue").out;
  record("FINAL_QUEUE_STILL_UNCHANGED", finalQueue === preQueue, finalQueue);

  const pass = results.every((r) => r.pass);
  const summary = {
    artifact: "M2_DISPOSABLE_SCHEMA_RESULTS_RUNTIME",
    production_mutation: "ZERO",
    database: url.replace(/:[^:@/]+@/, ":****@"),
    pass,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
    results,
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(pass ? 0 : 1);
} catch (err) {
  console.error(String(err && err.message ? err.message : err));
  process.exit(1);
}
