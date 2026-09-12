import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { read, root } from "./_cut2_test_helpers.mjs";

const EMAIL_ALLOW_TYPES = [
  "payment_receipt",
  "payment_reminder",
  "welcome",
  "event_reminder",
  "member_invitation",
  "minutes_published",
];

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".git") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx|mjs|js)$/.test(ent.name) && !ent.name.endsWith(".d.ts")) acc.push(p);
  }
  return acc;
}

test("provider-level email send is drain-only", () => {
  const files = walk(path.join(root, "src"));
  const providerCallers = [];
  const sendEmailCallers = [];
  for (const f of files) {
    const rel = path.relative(root, f).replaceAll("\\", "/");
    const src = fs.readFileSync(f, "utf8");
    if (/resend\.emails\.send|new Resend\(/.test(src)) {
      providerCallers.push(rel);
    }
    if (/sendEmail\s*\(/.test(src) || /sendBulkEmail\s*\(/.test(src)) {
      sendEmailCallers.push(rel);
    }
  }

  assert.deepEqual(
    providerCallers.sort(),
    ["src/lib/resend.ts", "src/lib/send-email.ts"].sort(),
    `Resend SDK must stay in helpers only: ${providerCallers.join(", ")}`,
  );
  assert.deepEqual(
    sendEmailCallers.filter((rel) => rel !== "src/lib/send-email.ts"),
    ["src/app/api/cron/drain-notification-queue/route.ts"],
    `sendEmail() live callers must be drain-only: ${sendEmailCallers.join(", ")}`,
  );
});

test("browser/API producers do not call provider email delivery", () => {
  const route = read("src/app/api/email/send/route.ts");
  assert.match(route, /status:\s*410/);
  assert.doesNotMatch(route, /sendEmail\(/);
  assert.doesNotMatch(route, /from ["']@\/lib\/send-email["']/);

  const srcFiles = walk(path.join(root, "src")).map((f) => path.relative(root, f).replaceAll("\\", "/"));
  const browserHits = [];
  for (const rel of srcFiles) {
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    if (src.includes('"/api/email/send"') || src.includes("'/api/email/send'")) {
      if (rel === "src/app/api/email/send/route.ts") continue;
      if (rel === "src/lib/api-recipient-guard.ts") continue;
      browserHits.push(rel);
    }
  }
  assert.deepEqual(browserHits, [], `no live /api/email/send callers: ${browserHits.join(", ")}`);
});

test("six email ALLOW types stay mapped to semantic enqueue", () => {
  const matrix = read("src/lib/cut2-channel-matrix.ts");
  for (const type of EMAIL_ALLOW_TYPES) {
    assert.match(
      matrix,
      new RegExp(`${type}:\\s*\\{[\\s\\S]*?email:\\s*"ALLOW"`),
      `${type} must remain EMAIL ALLOW`,
    );
  }
  assert.match(matrix, /CUT2_EMAIL_TEMPLATE/);
  for (const type of EMAIL_ALLOW_TYPES) {
    assert.match(matrix, new RegExp(`${type}:`));
  }

  const producers = {
    payment_receipt: "src/lib/payment-receipt-producer.ts",
    payment_reminder: "src/lib/payment-reminder-producer.ts",
    welcome: "src/lib/welcome-producer.ts",
    event_reminder: "src/lib/event-reminder-producer.ts",
    member_invitation: "src/lib/member-invitation-producer.ts",
    minutes_published: "src/app/api/minutes/published-notifications/route.ts",
  };
  for (const [type, file] of Object.entries(producers)) {
    const src = read(file);
    assert.match(src, /enqueueCut2ProducerChannels/);
    assert.match(src, new RegExp(`notificationType:\\s*"${type}"`));
  }
});
