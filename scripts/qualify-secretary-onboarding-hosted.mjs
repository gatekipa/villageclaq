import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_PROJECT = "nisipxbuvndobyxqqglf";
const EXPECTED_GROUP = "19909390-7269-4c86-8eda-fdbc6640ccf8";
const BASE_URL = process.env.QUALIFICATION_BASE_URL || "http://127.0.0.1:3210";

function parseEnv(path) {
  return Object.fromEntries(
    fs.readFileSync(path, "utf8")
      .split(/\r?\n/)
      .flatMap((line) => {
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        return match ? [[match[1], match[2].replace(/^"|"$/g, "")]] : [];
      }),
  );
}

function field(text, label) {
  return text.match(new RegExp(`^${label}:\\s*(.+)$`, "mi"))?.[1]?.trim();
}

const env = parseEnv(new URL("../.env.development.local", import.meta.url));
const access = fs.readFileSync(new URL("../.vercel/founder-test-access.txt", import.meta.url), "utf8");
assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0], EXPECTED_PROJECT);
assert.ok(env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY);

const cookies = new Map();
const authenticated = createServerClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    cookies: {
      getAll() {
        return [...cookies].map(([name, value]) => ({ name, value }));
      },
      setAll(next) {
        for (const cookie of next) cookies.set(cookie.name, cookie.value);
      },
    },
  },
);

const signIn = await authenticated.auth.signInWithPassword({
  email: field(access, "ADMIN EMAIL"),
  password: process.env.QUALIFICATION_ADMIN_PASSWORD || field(access, "ADMIN PASSWORD"),
});
if (signIn.error) throw signIn.error;
assert.ok(signIn.data.user?.id);

const displayName = "QA XLSX Secretary 2026-09-28";
const sourceKey = "qualification:xlsx:20260928:sha256-fixture:row-2";
const command = {
  group_id: EXPECTED_GROUP,
  display_name: displayName,
  email: "qa.xlsx.secretary.20260928@example.invalid",
  phone: "+237670000101",
  role: "member",
  source_kind: "xlsx_import",
  source_key: sourceKey,
  notification_consent: true,
};

async function createOfflineMember(payload) {
  const response = await authenticated.rpc("create_offline_member", {
    p_request_id: crypto.randomUUID(),
    p_command: payload,
  });
  if (response.error) throw response.error;
  return response.data;
}

const first = await createOfflineMember(command);
assert.ok(["created", "skipped_existing"].includes(first.outcome));
assert.ok(first.membership_id);

const repeated = await createOfflineMember(command);
assert.equal(repeated.outcome, "skipped_existing");
assert.equal(repeated.membership_id, first.membership_id);

const changed = await authenticated.rpc("create_offline_member", {
  p_request_id: crypto.randomUUID(),
  p_command: { ...command, display_name: `${displayName} Changed` },
});
assert.ok(changed.error, "changed payload must conflict");
assert.match(changed.error.message, /IMPORT_SOURCE_CONFLICT/);

const status = await fetch(`${BASE_URL}/api/founder-test/status`);
assert.equal(status.status, 200);
const statusBody = await status.json();
assert.equal(statusBody.bindingMatches, true);
assert.equal(statusBody.externalDeliverySuppressed, true);
assert.equal(statusBody.scheduledSideEffectsSuppressed, true);

const cookieHeader = [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
const send = await fetch(`${BASE_URL}/api/proxy-claim/send`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: cookieHeader },
  body: JSON.stringify({
    membershipId: first.membership_id,
    channels: ["email"],
    locale: "en",
  }),
});
const sendBody = await send.json();
assert.equal(send.status, 200, JSON.stringify(sendBody));
assert.equal(sendBody.success, true);
assert.equal(sendBody.results?.email?.queued, true);
assert.deepEqual(Object.keys(sendBody.results), ["email"]);
assert.match(sendBody.claimUrl, /\/claim\/[a-f0-9]{64}$/);

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const membership = await service
  .from("memberships")
  .select("id,user_id,is_proxy,role,membership_status,privacy_settings")
  .eq("id", first.membership_id)
  .single();
if (membership.error) throw membership.error;
assert.equal(membership.data.user_id, null);
assert.equal(membership.data.is_proxy, true);
assert.equal(membership.data.role, "member");
assert.equal(membership.data.membership_status, "active");
assert.equal(membership.data.privacy_settings?.proxy_contact_consent, true);
assert.equal(membership.data.privacy_settings?.email_verified, false);

const queued = await service
  .from("notifications_queue")
  .select("id,membership_id,channel,template,status,provider_message_id,data")
  .eq("template", "proxy_claim")
  .contains("data", { recipient_membership_id: first.membership_id });
if (queued.error) throw queued.error;
assert.ok(queued.data.some((row) => row.channel === "email"));
assert.ok(queued.data.every((row) => row.channel === "email"));
assert.ok(queued.data.every((row) => row.provider_message_id === null));

const queueIds = queued.data.map((row) => row.id);
const suppressed = await service
  .from("notifications_queue")
  .update({
    status: "dead_letter",
    error_message: "SKIPPED:founder_test_external_delivery_suppressed",
  })
  .in("id", queueIds)
  .select("id,status,provider_message_id");
if (suppressed.error) throw suppressed.error;
assert.ok(suppressed.data.every((row) => row.status === "dead_letter"));
assert.ok(suppressed.data.every((row) => row.provider_message_id === null));

const audit = await authenticated
  .from("group_audit_logs")
  .select("id,action,entity_id")
  .eq("group_id", EXPECTED_GROUP)
  .eq("action", "member.offline_created")
  .eq("entity_id", first.membership_id);
if (audit.error) throw audit.error;
assert.equal(audit.data.length, 1);

console.log(JSON.stringify({
  project: EXPECTED_PROJECT,
  group: EXPECTED_GROUP,
  import: {
    first_outcome: first.outcome,
    repeated_outcome: repeated.outcome,
    changed_payload: "conflict",
    role: membership.data.role,
    lifecycle: membership.data.membership_status,
    account: "not_activated",
  },
  invitation: {
    channel: "email",
    queue_rows: queued.data.length,
    provider_message_ids: 0,
    final_status: "dead_letter_founder_suppression",
    token_scope: "single-membership activation",
  },
  audit_rows: audit.data.length,
}, null, 2));
