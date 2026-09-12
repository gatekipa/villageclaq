/**
 * STATIC security tests for M2 foundation.
 * These FAIL if the implementation introduces forbidden send/queue/push paths.
 * No network. No production mutation.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PRODUCERS, read as cut2Read } from "./_cut2_test_helpers.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(root, rel));

const M2_RUNTIME = [
  "src/lib/notification-policy.ts",
  "src/lib/notification-policy-contracts.ts",
];
const M2_SQL = "supabase/migrations/00117_m2_notification_policy_foundation.sql";
const FORBIDDEN_OLD_SQL = "supabase/migrations/20260910120000_notification_policy_schema.sql";

const PROVIDER_IMPORT = /from ["']@\/lib\/(send-sms-notification|whatsapp-dispatcher|send-email|notifications\/sms-sender)["']/;
const PROVIDER_FETCH = /fetch\(\s*["']https?:\/\/(graph\.facebook|api\.resend|api\.africastalking)/;
const QUEUE_INSERT = /from\(["']notifications_queue["']\)\s*\.insert/;
const GENERIC_SEND = /\/api\/(sms|whatsapp|email)\/send/;

test("M2 runtime files exist and stay pure (no queue insert, no provider, no fetch)", () => {
  for (const rel of M2_RUNTIME) {
    assert.equal(exists(rel), true, rel);
    const src = read(rel);
    assert.doesNotMatch(src, QUEUE_INSERT, rel);
    assert.doesNotMatch(src, PROVIDER_IMPORT, rel);
    assert.doesNotMatch(src, PROVIDER_FETCH, rel);
    assert.doesNotMatch(src, /createClient\(/, rel);
    assert.doesNotMatch(src, /from ["']@\/lib\/supabase/, rel);
    assert.doesNotMatch(src, /process\.env\./, rel);
    assert.doesNotMatch(src, /rpc\(\s*["']enqueue_outbound_notification["']/, rel);
    assert.doesNotMatch(src, /enqueueCut2ProducerChannels/, rel);
    assert.doesNotMatch(src, /from ["']africastalking["']|from ["']@supabase\/supabase-js["']/, rel);
  }
});

test("00117 exists with dormant defaults; old timestamp filename absent", () => {
  assert.equal(exists(M2_SQL), true);
  assert.equal(exists(FORBIDDEN_OLD_SQL), false);
  const sql = read(M2_SQL);
  assert.match(sql, /enabled boolean NOT NULL DEFAULT false/);
  assert.match(sql, /channel_push boolean NOT NULL DEFAULT false/);
  assert.doesNotMatch(sql, /enabled boolean NOT NULL DEFAULT true/);
  assert.doesNotMatch(sql, /channel_push boolean NOT NULL DEFAULT true/);
  assert.doesNotMatch(sql, /CREATE TABLE[\s\S]{0,40}20260910120000/);
  assert.doesNotMatch(sql, /has_group_permission\([^)]*notifications\.manage/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.enqueue_outbound_notification/);
  assert.doesNotMatch(sql, /GRANT INSERT ON .*notifications_queue/);
  assert.doesNotMatch(sql, /^\s*SECURITY DEFINER\s*$/m);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
});

test("no 00118+ migration authored", () => {
  const dir = path.join(root, "supabase/migrations");
  const extras = fs.readdirSync(dir).filter((f) => /^0011[89]|^001[2-9]/.test(f));
  assert.deepEqual(extras, []);
});

test("generic send routes remain 410 — no resurrection", () => {
  for (const rel of [
    "src/app/api/sms/send/route.ts",
    "src/app/api/whatsapp/send/route.ts",
    "src/app/api/email/send/route.ts",
  ]) {
    const src = read(rel);
    assert.match(src, /status:\s*410/);
    assert.doesNotMatch(src, /enqueue_outbound_notification/);
    assert.doesNotMatch(src, QUEUE_INSERT);
  }
});

test("live producers do not import M2 policy engine", () => {
  const extra = [
    "src/lib/payment-reminder-producer.ts",
    "src/app/api/cron/payment-reminders/route.ts",
    "src/app/api/cron/hosting-reminders/route.ts",
    "src/app/api/cron/event-reminders/route.ts",
    "src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx",
  ];
  for (const rel of [...PRODUCERS, ...extra]) {
    const src = cut2Read(rel);
    assert.doesNotMatch(src, /from ["']@\/lib\/notification-policy/, rel);
    assert.doesNotMatch(src, /from ["']@\/lib\/notification-policy-contracts/, rel);
    assert.doesNotMatch(src, /FUTURE_PAYMENT_POLICY/, rel);
  }
});

test("announcement-producer is not imported by live routes/crons", () => {
  const walk = (dir, out = []) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".git" || ent.name === ".next") continue;
        walk(p, out);
      } else if (/\.(ts|tsx|js|mjs)$/.test(ent.name)) {
        out.push(p);
      }
    }
    return out;
  };
  const files = walk(path.join(root, "src"));
  const offenders = [];
  for (const abs of files) {
    const rel = path.relative(root, abs);
    if (rel === "src/lib/announcement-producer.ts") continue;
    if (rel === "src/lib/announcement-delivery-status-mapping.ts") continue;
    if (rel === "src/lib/announcement-delivery-rollup.ts") continue;
    const src = fs.readFileSync(abs, "utf8");
    if (/from ["']@\/lib\/announcement-producer["']/.test(src) || /from ["']\.\.?\/announcement-producer["']/.test(src)) {
      if (/enqueueCut2ProducerChannels/.test(src)) continue;
      offenders.push(rel);
    }
  }
  const liveRoutes = offenders.filter(
    (rel) => rel.startsWith("src/app/") && !rel.includes("announcement-delivery"),
  );
  assert.deepEqual(liveRoutes, []);
});

test("no test file asserts push eligibility", () => {
  const scripts = fs
    .readdirSync(path.join(root, "scripts"))
    .filter((f) => f.startsWith("test-notification-policy") || f.startsWith("test-m2-"));
  for (const f of scripts) {
    const src = read(path.join("scripts", f));
    assert.doesNotMatch(src, /assert\.equal\(\s*[^,]*\.push,\s*true/, f);
    assert.doesNotMatch(src, /kind:\s*["']ENQUEUE_ELIGIBLE["'][\s\S]{0,80}channel:\s*["']push["']/, f);
  }
});

test("00115 enqueue body is not copied/replaced by 00117", () => {
  const m2 = read(M2_SQL);
  const cut2 = read("supabase/migrations/00115_s0_p0b_cut2_notification_queue.sql");
  assert.match(cut2, /CREATE OR REPLACE FUNCTION public\.enqueue_outbound_notification/);
  assert.doesNotMatch(m2, /CREATE OR REPLACE FUNCTION public\.enqueue_outbound_notification/);
  assert.doesNotMatch(m2, /CREATE OR REPLACE FUNCTION public\.cut2_internal_/);
  assert.doesNotMatch(m2, GENERIC_SEND);
});

test("bulk receipt P0 guard file is untouched by M2 policy imports", () => {
  const page = read("src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx");
  assert.doesNotMatch(page, /notification-policy/);
  assert.match(page, /const \[bulkSendReceipts, setBulkSendReceipts\] = useState\(false\)/);
});
