/**
 * PR #81 / M2-C2-01..20 Cut 2 non-regression (static + pure runtime).
 * No provider calls. No queue INSERT. No production DB.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CUT2_CHANNEL_MATRIX,
  CUT2_NOTIFICATION_TYPES,
} from "../src/lib/cut2-channel-matrix.ts";
import {
  DEFAULT_HOSTING_POLICY,
  LEGACY_PAYMENT_CRON_CONTRACT,
  evaluateDisposition,
  occurrenceIdentity,
} from "../src/lib/notification-policy.ts";
import {
  ChannelIntersection,
  FAIL_CLOSED_PREFS_ON_ERROR,
} from "../src/lib/notification-policy-contracts.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const MIG_115 = "supabase/migrations/00115_s0_p0b_cut2_notification_queue.sql";
const MIG_117 = "supabase/migrations/00117_m2_notification_policy_foundation.sql";
const ENQUEUE_TS = "src/lib/enqueue-outbound-notification.ts";
const DRAIN = "src/app/api/cron/drain-notification-queue/route.ts";
const PAYMENT_CRON = "src/app/api/cron/payment-reminders/route.ts";
const RECORD_PAGE = "src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx";
const POLICY = "src/lib/notification-policy.ts";
const CONTRACTS = "src/lib/notification-policy-contracts.ts";

const SMS_DENY = ["loan_overdue", "member_invitation", "election_opened"];
const EMAIL_ALLOW = [
  "payment_receipt",
  "payment_reminder",
  "welcome",
  "event_reminder",
  "member_invitation",
  "minutes_published",
];

test("M2-C2-01 enqueue_outbound_notification identity args unchanged", () => {
  const sql = read(MIG_115);
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.enqueue_outbound_notification\(\s*p_notification_type text,\s*p_domain_object_id uuid,\s*p_channel public\.notification_channel,\s*p_recipient_membership_id uuid DEFAULT NULL,\s*p_locale text DEFAULT NULL\s*\)/s,
  );
  assert.match(sql, /RETURNS TABLE \(queue_id uuid, result text\)/);
  const m2 = read(MIG_117);
  assert.doesNotMatch(m2, /CREATE OR REPLACE FUNCTION public\.enqueue_outbound_notification/);
  assert.doesNotMatch(m2, /CREATE FUNCTION public\.enqueue_outbound_notification/);
});

test("M2-C2-02 EXECUTE granted to service_role only in Cut 2 SQL; 00117 does not regrant", () => {
  const sql = read(MIG_115);
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.enqueue_outbound_notification\([\s\S]*?FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.enqueue_outbound_notification\([\s\S]*?TO service_role/,
  );
  const m2 = read(MIG_117);
  assert.doesNotMatch(m2, /GRANT EXECUTE ON FUNCTION public\.enqueue_outbound_notification/);
  assert.doesNotMatch(m2, /GRANT INSERT ON .*notifications_queue/);
});

test("M2-C2-03 22 types exactly; unknown type is not a 23rd", () => {
  assert.equal(CUT2_NOTIFICATION_TYPES.length, 22);
  assert.equal(new Set(CUT2_NOTIFICATION_TYPES).size, 22);
  assert.ok(!CUT2_NOTIFICATION_TYPES.includes("not_a_cut2_type"));
});

test("M2-C2-04 WA ALLOW 22; SMS DENY 3; email DENY proxy_claim; push DENY all", () => {
  for (const t of CUT2_NOTIFICATION_TYPES) {
    assert.equal(CUT2_CHANNEL_MATRIX[t].whatsapp, "ALLOW", t);
    assert.equal(CUT2_CHANNEL_MATRIX[t].push, "DENY", t);
  }
  for (const t of SMS_DENY) {
    assert.equal(CUT2_CHANNEL_MATRIX[t].sms, "DENY", t);
  }
  assert.equal(CUT2_CHANNEL_MATRIX.proxy_claim.email, "DENY");
  for (const t of EMAIL_ALLOW) {
    assert.equal(CUT2_CHANNEL_MATRIX[t].email, "ALLOW", t);
  }
});

test("M2-C2-05 RPC rejects phone/email/message/components/groupId/template/data/status/user_id/provenance args", () => {
  const sql = read(MIG_115);
  const header = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.enqueue_outbound_notification"),
    sql.indexOf("RETURNS TABLE (queue_id uuid, result text)"),
  );
  for (const bad of [
    "p_phone",
    "p_email",
    "p_message",
    "p_components",
    "p_group_id",
    "p_template",
    "p_data",
    "p_status",
    "p_user_id",
    "p_cut2_provenance_version",
  ]) {
    assert.doesNotMatch(header, new RegExp(bad));
  }
});

test("M2-C2-06 Inserted rows have cut2_provenance_version=1 hardcoded in Cut 2 SQL", () => {
  const sql = read(MIG_115);
  assert.match(sql, /INSERT INTO public\.notifications_queue \([\s\S]*?cut2_provenance_version[\s\S]*?\) VALUES \([\s\S]*?1[\s\S]*?\)/);
  const m2 = read(MIG_117);
  assert.doesNotMatch(m2, /INSERT INTO public\.notifications_queue/);
});

test("M2-C2-07 Drain select remains queued AND cut2_provenance_version=1", () => {
  const src = read(DRAIN);
  assert.match(src, /eq\("status",\s*"queued"\)/);
  assert.match(src, /eq\("cut2_provenance_version",\s*1\)/);
  assert.match(src, /ONLY status=queued AND cut2_provenance_version=1/);
});

test("M2-C2-08 generic relays remain 410 GET+POST", () => {
  for (const rel of [
    "src/app/api/sms/send/route.ts",
    "src/app/api/whatsapp/send/route.ts",
    "src/app/api/email/send/route.ts",
  ]) {
    const src = read(rel);
    assert.match(src, /export async function GET/);
    assert.match(src, /export async function POST/);
    assert.match(src, /status:\s*410/);
  }
});

test("M2-C2-09 service_role has no INSERT/DELETE/TRUNCATE on queue in Cut 2 SQL; 00117 does not add any", () => {
  const sql = read(MIG_115);
  assert.match(sql, /REVOKE ALL ON TABLE public\.notifications_queue FROM service_role/);
  assert.match(sql, /GRANT SELECT ON TABLE public\.notifications_queue TO service_role/);
  assert.match(sql, /GRANT UPDATE \(status, error_message, attempts, sent_at, data\)/);
  const m2 = read(MIG_117);
  assert.doesNotMatch(m2, /GRANT[\s\S]{0,80}ON TABLE public\.notifications_queue/);
  assert.doesNotMatch(m2, /GRANT INSERT ON public\.notifications_queue/);
});

test("M2-C2-10 ENQUEUE_ELIGIBLE does not call sendSMS/dispatchWhatsApp/sendEmail or insert queue", () => {
  const policy = read(POLICY);
  const contracts = read(CONTRACTS);
  for (const src of [policy, contracts]) {
    assert.doesNotMatch(src, /sendSMS|sendSmsNotification|dispatchWhatsApp|sendEmail\(/);
    assert.doesNotMatch(src, /from\(["']notifications_queue["']\)\s*\.insert/);
    assert.doesNotMatch(src, /rpc\(\s*["']enqueue_outbound_notification["']/);
    assert.doesNotMatch(src, /africastalking|graph\.facebook|api\.resend/);
  }
  const d = evaluateDisposition({
    policy: {
      enabled: true,
      timezone: "UTC",
      anchor: "event_starts_at",
      triggers: [{ offsetHours: -48 }],
      repeatIntervalHours: null,
      maxOccurrences: 1,
      stopWhenResolved: true,
      stopAfterHours: null,
      quietHours: null,
      channels: { in_app: true, email: true, sms: true, whatsapp: true, push: false },
    },
    now: new Date("2026-09-10T12:00:00Z"),
    resolved: false,
    channel: "email",
    occurrencesSent: 0,
  });
  assert.equal(d.kind, "ENQUEUE_ELIGIBLE");
});

test("M2-C2-11 ChannelIntersection AND Cut 2: hosting email false even if policy email true", () => {
  const result = ChannelIntersection({
    notificationType: "hosting_assignment",
    groupAllowed: { in_app: true, email: true, sms: true, whatsapp: true, push: false },
    memberPref: { in_app: true, email: true, sms: true, whatsapp: true, push: false },
    failClosedPrefs: { in_app: true, email: true, sms: true, whatsapp: true, push: false },
  });
  assert.equal(result.email, false);
  assert.equal(result.push, false);
  assert.equal(result.whatsapp, true);
});

test("M2-C2-12 Prefs fail-closed still blocks external channels", () => {
  const result = ChannelIntersection({
    notificationType: "payment_reminder",
    groupAllowed: { in_app: true, email: true, sms: true, whatsapp: true, push: false },
    memberPref: { in_app: true, email: true, sms: true, whatsapp: true, push: false },
    failClosedPrefs: FAIL_CLOSED_PREFS_ON_ERROR,
  });
  assert.equal(result.in_app, true);
  assert.equal(result.email, false);
  assert.equal(result.sms, false);
  assert.equal(result.whatsapp, false);
  assert.equal(result.push, false);
});

test("M2-C2-13 LEGACY_PAYMENT_CRON_CONTRACT.live === true and offset null", () => {
  assert.equal(LEGACY_PAYMENT_CRON_CONTRACT.live, true);
  assert.equal(LEGACY_PAYMENT_CRON_CONTRACT.notARelativeTriggerOffsetHours, null);
});

test("M2-C2-14 PAYMENT_REMINDER_CONFIRMED_BASIS default path still uses env === true", () => {
  const src = read(PAYMENT_CRON);
  assert.match(
    src,
    /process\.env\.PAYMENT_REMINDER_CONFIRMED_BASIS === ["']true["'] \|\| dryRun/,
  );
  assert.match(src, /searchParams\.get\(["']dryRun["']\) === ["']true["']/);
});

test("M2-C2-15 contributions/record bulkSendReceipts default false + reconfirm", () => {
  const page = read(RECORD_PAGE);
  assert.match(page, /useState\(false\)/);
  assert.match(page, /const \[bulkSendReceipts, setBulkSendReceipts\] = useState\(false\)/);
  assert.match(page, /bulkSendReceipts && !bulkReconfirm/);
});

test("M2-C2-16 announcement-producer.ts remains unimported by live routes/crons", () => {
  const live = [
    "src/app/api/announcements/enqueue/route.ts",
    "src/app/api/cron/send-scheduled-announcements/route.ts",
    "src/lib/notify-announcement-enqueue.ts",
  ];
  for (const rel of live) {
    const src = read(rel);
    assert.doesNotMatch(src, /from ["']@\/lib\/announcement-producer["']/);
    if (rel.includes("enqueue/route.ts") || rel.includes("send-scheduled")) {
      assert.match(src, /enqueueCut2ProducerChannels/);
    }
  }
});

test("M2-C2-17 00117 does not replace enqueue_outbound_notification", () => {
  const m2 = read(MIG_117);
  assert.doesNotMatch(m2, /CREATE OR REPLACE FUNCTION public\.enqueue_outbound_notification/);
  assert.match(m2, /M2_ABORT: enqueue_outbound_notification live pin mismatch/);
  assert.match(
    m2,
    /enqueue_outbound_notification identity\/return\/owner\/DEFINER\/proconfig\/body\/ACL fingerprint changed/,
  );
  const adapter = read(ENQUEUE_TS);
  assert.match(adapter, /enqueue_outbound_notification/);
});

test("M2-C2-18 Policy tables enabled default false; defaults dormant", () => {
  const m2 = read(MIG_117);
  assert.match(m2, /enabled boolean NOT NULL DEFAULT false/);
  assert.equal(DEFAULT_HOSTING_POLICY.enabled, false);
  const producer = read("src/lib/payment-reminder-producer.ts");
  assert.doesNotMatch(producer, /notification-policy/);
  assert.doesNotMatch(read("src/lib/hosting-reminder-producer.ts"), /notification-policy/);
  assert.doesNotMatch(read("src/lib/event-reminder-producer.ts"), /notification-policy/);
});

test("M2-C2-19 settings.manage is policy-admin; notifications.manage absent", () => {
  const keys = read("src/lib/hooks/use-permissions.ts");
  assert.match(keys, /"settings\.manage"/);
  assert.doesNotMatch(keys, /"notifications\.manage"/);
  assert.match(read(MIG_117), /has_group_permission\(group_id, 'settings\.manage'\)/);
  assert.doesNotMatch(read(MIG_117), /has_group_permission\([^)]*notifications\.manage/);
});

test("M2-C2-20 Quiet-hours DEFER_UNTIL reuses occurrence identity", () => {
  const anchor = new Date("2026-10-01T12:00:00.000Z");
  const identity = occurrenceIdentity({
    domain: "event",
    objectId: "e1",
    anchorAt: anchor,
    triggerOffsetHours: -48,
    occurrenceIndex: 0,
  });
  const policy = {
    enabled: true,
    timezone: "UTC",
    anchor: "event_starts_at",
    triggers: [{ offsetHours: -48 }],
    repeatIntervalHours: null,
    maxOccurrences: 1,
    stopWhenResolved: true,
    stopAfterHours: null,
    quietHours: { startMinute: 22 * 60, endMinute: 7 * 60 },
    channels: { in_app: true, email: true, sms: true, whatsapp: true, push: false },
  };
  const d = evaluateDisposition({
    policy,
    now: new Date("2026-09-10T23:30:00Z"),
    resolved: false,
    channel: "email",
    occurrenceIdentity: identity,
    occurrencesSentForIdentity: 0,
  });
  assert.equal(d.kind, "DEFER_UNTIL");
  const again = occurrenceIdentity({
    domain: "event",
    objectId: "e1",
    anchorAt: anchor,
    triggerOffsetHours: -48,
    occurrenceIndex: 0,
  });
  assert.equal(again, identity);
  assert.notEqual(d.kind, "ENQUEUE_ELIGIBLE");
});
