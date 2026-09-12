/**
 * Disposable-only qualification for 00117.
 * NEVER point at production llbnliixczcqfftxpsmb.
 * Requires PostgreSQL 17 (MAINTAIN in live queue table ACL).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyDisposableFloor,
  assertNotProduction,
  defaultDisposableUrl,
  psqlFile,
  psqlUrl,
  recreateDisposableDatabase,
} from "./_m2_apply_disposable_floor.mjs";
import { runNegativeDriftSuite } from "./qualify-m2-negative-drift.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const url = defaultDisposableUrl();
assertNotProduction(url);

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
const OCC_ID = "40000000-0000-4000-8000-000000000001";

const results = [];
const occurrenceDml = [];

function record(id, pass, detail) {
  results.push({ id, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${id}${detail ? ` — ${detail}` : ""}`);
}

function psql(sql, opts = {}) {
  const res = psqlUrl(url, sql, { onErrorStop: opts.allowFail ? false : true, verbosity: opts.verbosity });
  if (!res.ok && !opts.allowFail) {
    throw new Error(res.err || res.out || "psql failed");
  }
  return res;
}

function classifyDenial(res) {
  const blob = `${res.err}\n${res.out}`;
  const stateMatch = blob.match(/ERROR:\s+(\d{5}):/) || blob.match(/SQLSTATE:\s+(\d{5})/i);
  const sqlstate = stateMatch ? stateMatch[1] : null;
  if (/row-level security/i.test(blob)) {
    return { mechanism: "RLS_VIOLATION", sqlstate: sqlstate || "42501" };
  }
  if (sqlstate === "42501" || /permission denied/i.test(blob)) {
    return { mechanism: "PERMISSION_DENIED", sqlstate: sqlstate || "42501" };
  }
  if (!res.ok) {
    return { mechanism: "UNEXPECTED_ERROR", sqlstate };
  }
  const lines = res.out.split("\n").filter((l) => l && !/^[A-F0-9-]{8}-[A-F0-9-]{4}-/i.test(l) ? true : true);
  void lines;
  if (res.out === "") {
    return { mechanism: "ZERO_ROW_SUCCESS", sqlstate: null };
  }
  return { mechanism: "SUCCESS", sqlstate: null };
}

function runRoleSql({ operation, role, uid, sql, expected }) {
  const wrapped = `
    SET ROLE ${role};
    ${uid ? `SELECT set_config('m2.uid', '${uid}', true);` : ""}
    ${sql}
    RESET ROLE;
    SELECT set_config('m2.uid', '', true);
  `;
  const res = psqlUrl(url, wrapped, { onErrorStop: false, verbosity: "verbose" });
  const cls = classifyDenial(res);
  let pass = false;
  if (expected === "PERMISSION_DENIED") {
    pass = cls.mechanism === "PERMISSION_DENIED" || cls.mechanism === "RLS_VIOLATION";
  } else if (expected === "ALLOW") {
    pass = res.ok && cls.mechanism === "SUCCESS";
  } else if (expected === "DENY") {
    if (cls.mechanism === "PERMISSION_DENIED" || cls.mechanism === "RLS_VIOLATION") pass = true;
    else if (cls.mechanism === "ZERO_ROW_SUCCESS") pass = true;
    else pass = false;
  }
  if (expected === "DENY" && cls.mechanism === "ZERO_ROW_SUCCESS" && /UPDATE|DELETE/.test(operation)) {
    // Caller must prove unchanged separately; this is an allowed deny mechanism.
    pass = true;
  }
  const row = {
    operation,
    role,
    expected_mechanism: expected,
    actual_mechanism: cls.mechanism,
    error: res.err || null,
    sqlstate: cls.sqlstate,
    out: res.out,
    pass,
  };
  occurrenceDml.push(row);
  return row;
}

function asUser(uid, sql) {
  return psqlUrl(
    url,
    `
    SET ROLE authenticated;
    SELECT set_config('m2.uid', '${uid}', true);
    ${sql}
    RESET ROLE;
    SELECT set_config('m2.uid', '', true);
  `,
    { onErrorStop: false },
  );
}

function snapshotOccurrence() {
  return psql(`
    SELECT id::text || '|' || group_id::text || '|' || domain || '|' || object_id::text
      || '|' || status || '|' || identity_key
      || '|' || created_at::text || '|' || updated_at::text
    FROM public.notification_policy_occurrences
    WHERE id='${OCC_ID}'
  `).out;
}

try {
  const adminUrl =
    process.env.M2_DISPOSABLE_ADMIN_URL ||
    "postgresql://ubuntu@/postgres?host=/var/run/postgresql&port=5433";
  recreateDisposableDatabase({ adminUrl, dbName: "m2_notification_policy_disposable" });
  applyDisposableFloor(url);

  const pgMajor = psql("SHOW server_version_num").out;
  record("PG17_REQUIRED", Number(pgMajor) >= 170000, pgMajor);

  const preQueue = psql("SELECT count(*) FROM public.notifications_queue").out;

  const apply = spawnSync(
    "psql",
    ["-d", url, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-f", path.join(root, "supabase/migrations/00117_m2_notification_policy_foundation.sql")],
    { encoding: "utf8", env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "" } },
  );
  record("APPLY_00117", apply.status === 0, apply.status === 0 ? "applied after exact live floor" : (apply.stderr || apply.stdout));
  if (apply.status !== 0) {
    throw new Error(apply.stderr || apply.stdout || "00117 failed");
  }

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
  record(
    "NON_MANAGER_INSERT_DENY",
    ["PERMISSION_DENIED", "RLS_VIOLATION"].includes(classifyDenial(memberIns).mechanism),
    `${classifyDenial(memberIns).mechanism} ${memberIns.err || memberIns.out}`,
  );

  const memberSel = asUser(U_MEMBER, `SELECT count(*) FROM public.notification_policies;`);
  record("NON_MANAGER_SELECT_DENY", memberSel.ok && memberSel.out.split("\n").pop() === "0", memberSel.out);

  const exitedSel = asUser(U_EXITED, `SELECT count(*) FROM public.notification_policies;`);
  record("EXITED_OWNER_SELECT_DENY", exitedSel.ok && exitedSel.out.split("\n").pop() === "0", exitedSel.out);

  const crossIns = asUser(U_G2, `
    INSERT INTO public.notification_policies (group_id, domain)
    VALUES ('${G1}', 'payment');
  `);
  record(
    "CROSS_TENANT_INSERT_DENY",
    ["PERMISSION_DENIED", "RLS_VIOLATION"].includes(classifyDenial(crossIns).mechanism),
    `${classifyDenial(crossIns).mechanism} ${crossIns.err || crossIns.out}`,
  );

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

  psql(`
    INSERT INTO public.notification_policy_occurrences (
      id, group_id, domain, object_id, anchor_at, trigger_offset_hours,
      occurrence_index, identity_key, eligible_at
    ) VALUES (
      '${OCC_ID}', '${G1}', 'event', '55555555-5555-4555-8555-555555555555',
      '2026-10-01T12:00:00Z', -48, 0,
      'event:55555555-5555-4555-8555-555555555555:2026-10-01T12:00:00.000Z:-48:0',
      '2026-09-29T12:00:00Z'
    );
  `);

  const beforeOcc = snapshotOccurrence();

  const ownerOccSel = asUser(U_OWNER, `SELECT count(*) FROM public.notification_policy_occurrences;`);
  record("OCCURRENCES_SELECT_MANAGER", ownerOccSel.ok && ownerOccSel.out.split("\n").pop() === "1", ownerOccSel.out);

  const memberOccSel = asUser(U_MEMBER, `SELECT count(*) FROM public.notification_policy_occurrences;`);
  record("OCCURRENCES_SELECT_NON_MANAGER_DENY", memberOccSel.ok && memberOccSel.out.split("\n").pop() === "0", memberOccSel.out);

  const authIns = runRoleSql({
    operation: "INSERT",
    role: "authenticated",
    uid: U_OWNER,
    expected: "PERMISSION_DENIED",
    sql: `
      INSERT INTO public.notification_policy_occurrences (
        group_id, domain, object_id, anchor_at, trigger_offset_hours,
        occurrence_index, identity_key, eligible_at
      ) VALUES (
        '${G1}', 'event', '66666666-6666-4666-8666-666666666666',
        '2026-10-02T12:00:00Z', -48, 0,
        'event:66666666-6666-4666-8666-666666666666:2026-10-02T12:00:00.000Z:-48:0',
        '2026-09-30T12:00:00Z'
      ) RETURNING id;
    `,
  });
  record("OCCURRENCES_AUTH_INSERT_DENY", authIns.pass, `${authIns.actual_mechanism} ${authIns.sqlstate || ""}`.trim());

  const authUpd = runRoleSql({
    operation: "UPDATE",
    role: "authenticated",
    uid: U_OWNER,
    expected: "DENY",
    sql: `UPDATE public.notification_policy_occurrences SET status='cancelled' WHERE id='${OCC_ID}' RETURNING id;`,
  });
  let authUpdPass = authUpd.pass;
  if (authUpd.actual_mechanism === "ZERO_ROW_SUCCESS") {
    const after = snapshotOccurrence();
    authUpdPass = after === beforeOcc && !authUpd.out.includes(OCC_ID);
  } else if (authUpd.actual_mechanism !== "PERMISSION_DENIED") {
    authUpdPass = false;
  }
  authUpd.pass = authUpdPass;
  record("OCCURRENCES_AUTH_UPDATE_DENY", authUpdPass, `${authUpd.actual_mechanism} ${authUpd.sqlstate || ""}`.trim());

  const authDel = runRoleSql({
    operation: "DELETE",
    role: "authenticated",
    uid: U_OWNER,
    expected: "DENY",
    sql: `DELETE FROM public.notification_policy_occurrences WHERE id='${OCC_ID}' RETURNING id;`,
  });
  let authDelPass = authDel.pass;
  if (authDel.actual_mechanism === "ZERO_ROW_SUCCESS") {
    const after = snapshotOccurrence();
    authDelPass = after === beforeOcc && !authDel.out.includes(OCC_ID);
  } else if (authDel.actual_mechanism !== "PERMISSION_DENIED") {
    authDelPass = false;
  }
  authDel.pass = authDelPass;
  record("OCCURRENCES_AUTH_DELETE_DENY", authDelPass, `${authDel.actual_mechanism} ${authDel.sqlstate || ""}`.trim());

  const srSel = runRoleSql({
    operation: "SELECT",
    role: "service_role",
    expected: "ALLOW",
    sql: `SELECT count(*) FROM public.notification_policy_occurrences;`,
  });
  record("OCCURRENCES_SERVICE_ROLE_SELECT_ALLOW", srSel.pass && /1/.test(srSel.out), `${srSel.actual_mechanism} ${srSel.out}`);

  const srIns = runRoleSql({
    operation: "INSERT",
    role: "service_role",
    expected: "PERMISSION_DENIED",
    sql: `
      INSERT INTO public.notification_policy_occurrences (
        group_id, domain, object_id, anchor_at, trigger_offset_hours,
        occurrence_index, identity_key, eligible_at
      ) VALUES (
        '${G1}', 'event', '77777777-7777-4777-8777-777777777777',
        '2026-10-03T12:00:00Z', -48, 0,
        'event:77777777-7777-4777-8777-777777777777:2026-10-03T12:00:00.000Z:-48:0',
        '2026-10-01T12:00:00Z'
      ) RETURNING id;
    `,
  });
  record("OCCURRENCES_SERVICE_ROLE_INSERT_DENY", srIns.pass, `${srIns.actual_mechanism} ${srIns.sqlstate || ""}`.trim());

  const srUpd = runRoleSql({
    operation: "UPDATE",
    role: "service_role",
    expected: "DENY",
    sql: `UPDATE public.notification_policy_occurrences SET status='cancelled' WHERE id='${OCC_ID}' RETURNING id;`,
  });
  let srUpdPass = srUpd.actual_mechanism === "PERMISSION_DENIED";
  if (srUpd.actual_mechanism === "ZERO_ROW_SUCCESS") {
    srUpdPass = snapshotOccurrence() === beforeOcc;
  }
  srUpd.pass = srUpdPass;
  record("OCCURRENCES_SERVICE_ROLE_UPDATE_DENY", srUpdPass, `${srUpd.actual_mechanism} ${srUpd.sqlstate || ""}`.trim());

  const srDel = runRoleSql({
    operation: "DELETE",
    role: "service_role",
    expected: "DENY",
    sql: `DELETE FROM public.notification_policy_occurrences WHERE id='${OCC_ID}' RETURNING id;`,
  });
  let srDelPass = srDel.actual_mechanism === "PERMISSION_DENIED";
  if (srDel.actual_mechanism === "ZERO_ROW_SUCCESS") {
    srDelPass = snapshotOccurrence() === beforeOcc;
  }
  srDel.pass = srDelPass;
  record("OCCURRENCES_SERVICE_ROLE_DELETE_DENY", srDelPass, `${srDel.actual_mechanism} ${srDel.sqlstate || ""}`.trim());

  const afterAllDml = snapshotOccurrence();
  record("OCCURRENCE_INTEGRITY_AFTER_DENIED_DML", afterAllDml === beforeOcc, afterAllDml === beforeOcc ? "unchanged" : afterAllDml);

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

  const emptyStdoutBanned = occurrenceDml.every((row) => {
    if (row.expected_mechanism === "ALLOW") return true;
    if (row.actual_mechanism === "SUCCESS" && (row.out === "" || !row.out)) return false;
    if (row.operation === "INSERT" && row.actual_mechanism === "ZERO_ROW_SUCCESS") return false;
    return ["PERMISSION_DENIED", "RLS_VIOLATION", "ZERO_ROW_SUCCESS"].includes(row.actual_mechanism);
  });
  record("NO_EMPTY_STDOUT_DENIAL_SHORTCUT", emptyStdoutBanned, "R25: denials use permission/RLS/zero-row+integrity, never empty-stdout");

  const negatives = runNegativeDriftSuite({ adminUrl });
  for (const n of negatives.results) record(n.id, n.pass, n.detail);

  const pass = results.every((r) => r.pass);
  const summary = {
    artifact: "M2_DISPOSABLE_SCHEMA_RESULTS_RUNTIME",
    production_mutation: "ZERO",
    database: url.replace(/:[^:@/]+@/, ":****@"),
    pass,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
    occurrence_dml: occurrenceDml,
    negative_drift: negatives,
    results,
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(pass ? 0 : 1);
} catch (err) {
  console.error(String(err && err.message ? err.message : err));
  process.exit(1);
}
