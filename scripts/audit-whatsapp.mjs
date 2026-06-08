#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const strictEnv = process.argv.includes("--strict-env");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function maskPhoneNumber(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length <= 6) return digits ? "***" : "(missing)";
  const prefix = String(phone).trim().startsWith("+") ? "+" : "";
  const start = digits.slice(0, Math.min(3, digits.length - 4));
  const end = digits.slice(-3);
  return `${prefix}${start}******${end}`;
}

function formatPhoneForWhatsApp(phone, countryCode = "237") {
  if (!phone) return null;
  let cleaned = String(phone).replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
  if (cleaned.startsWith("00")) cleaned = cleaned.slice(2);
  if (cleaned.startsWith("0")) cleaned = countryCode + cleaned.slice(1);
  cleaned = cleaned.replace(/\D/g, "");
  if (cleaned.length < 7 || cleaned.length > 15) return null;
  return cleaned;
}

const checks = [];
const warnings = [];

function check(name, pass, detail) {
  checks.push({ name, pass, detail });
}

function envNamesFromExample() {
  const example = read(".env.local.example");
  return new Set(
    example
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*#?\s*([A-Z0-9_]+)=/)?.[1])
      .filter(Boolean),
  );
}

const routeFiles = [
  "src/app/api/cron/payment-reminders/route.ts",
  "src/app/api/cron/event-reminders/route.ts",
  "src/app/api/cron/hosting-reminders/route.ts",
  "src/app/api/cron/send-scheduled-announcements/route.ts",
];

for (const file of routeFiles) {
  const source = read(file);
  check(
    `${file} resolves phones without get_member_phones RPC`,
    !source.includes('.rpc("get_member_phones"') && !source.includes(".rpc('get_member_phones'"),
    "Cron routes run with service role and must not call the admin-gated get_member_phones RPC.",
  );
}

for (const file of [
  "src/app/api/cron/payment-reminders/route.ts",
  "src/app/api/cron/event-reminders/route.ts",
]) {
  const source = read(file);
  check(
    `${file} awaits WhatsApp dispatch work`,
    !/dispatchWhatsApp\([\s\S]*?\)\.catch\(\(\) => \{\}\)/.test(source),
    "Serverless cron handlers must await outbound WhatsApp sends or queue them before returning.",
  );
}

const sendWhatsapp = read("src/lib/send-whatsapp.ts");
check(
  "WhatsApp sender masks phone numbers in logs",
  sendWhatsapp.includes("maskPhoneNumber("),
  "WhatsApp logs must not include full recipient phone numbers.",
);

const exampleEnv = envNamesFromExample();
for (const requiredName of [
  "WHATSAPP_API_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_API_VERSION",
  "CRON_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
]) {
  check(
    `.env.local.example documents ${requiredName}`,
    exampleEnv.has(requiredName),
    "Launch config should be documented without exposing values.",
  );
}

const webhookRoute = read("src/app/api/webhooks/whatsapp/route.ts");
check(
  "WhatsApp webhook route validates Meta challenge token",
  webhookRoute.includes("WHATSAPP_WEBHOOK_VERIFY_TOKEN") && webhookRoute.includes("verifyWhatsAppWebhookChallenge"),
  "Meta GET verification must only return the challenge when the configured token matches.",
);

const webhookStatusHelper = read("src/lib/whatsapp-webhook-status.ts");
check(
  "WhatsApp webhook parser persists status callbacks by wamid",
  webhookStatusHelper.includes("extractWhatsAppStatusEvents") &&
    webhookStatusHelper.includes("persistWhatsAppStatusEvent") &&
    webhookStatusHelper.includes("providerMessageId"),
  "Webhook status callbacks must be parsed and matched to notifications_queue.data.providerMessageId.",
);
check(
  "WhatsApp webhook parser sanitizes phone-bearing fields",
  webhookStatusHelper.includes("PHONE_KEY_PATTERN") && webhookStatusHelper.includes("maskDigits"),
  "Raw webhook event storage must not retain full phone numbers.",
);

const webhookMigration = read("supabase/migrations/00086_whatsapp_status_events.sql");
check(
  "WhatsApp status event migration exists",
  webhookMigration.includes("public.whatsapp_message_status_events") &&
    webhookMigration.includes("provider_message_id") &&
    webhookMigration.includes("raw_event"),
  "Status callbacks need a durable table keyed by Meta wamid/provider message ID.",
);

const webhookDoc = read("docs/whatsapp-webhook-status.md");
check(
  "WhatsApp webhook status runbook exists",
  webhookDoc.includes("/api/webhooks/whatsapp") && webhookDoc.includes("subscribed_apps"),
  "Launch operations need callback URL, Meta subscription, and final-status inspection steps.",
);

for (const requiredName of [
  "AFRICASTALKING_API_KEY",
  "AFRICASTALKING_USERNAME",
  "AFRICASTALKING_SENDER_ID",
]) {
  check(
    `.env.local.example documents ${requiredName}`,
    exampleEnv.has(requiredName),
    "Code uses AFRICASTALKING_* names; the example file should match.",
  );
}

const cmIntl = ["+237", "677", "123", "456"].join(" ");
const cmDigits = ["237", "677", "123", "456"].join("");
const usIntl = ["+1", "(240)", "555", "0123"].join(" ");
const usDigits = ["1", "240", "555", "0123"].join("");
const cmLocal = ["0", "677", "123", "456"].join("");

const samplePhones = [
  [cmIntl, cmDigits],
  [usIntl, usDigits],
  [cmLocal, cmDigits],
  ["12345", null],
];

for (const [input, expected] of samplePhones) {
  check(
    `sample WhatsApp phone formatting ${maskPhoneNumber(input)}`,
    formatPhoneForWhatsApp(input) === expected,
    `Expected ${expected ?? "invalid"}, got ${formatPhoneForWhatsApp(input) ?? "invalid"}.`,
  );
}

for (const requiredRuntimeEnv of ["WHATSAPP_API_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"]) {
  if (!process.env[requiredRuntimeEnv]) {
    warnings.push(`${requiredRuntimeEnv} is not set in this shell; dry-run skipped live provider validation.`);
  }
}

if (process.env.WHATSAPP_LIVE_TEST === "true") {
  if (!process.env.WHATSAPP_TEST_TO) {
    checks.push({
      name: "WHATSAPP_TEST_TO is set for live test mode",
      pass: false,
      detail: "Never enable WHATSAPP_LIVE_TEST without an allowlisted WHATSAPP_TEST_TO.",
    });
  } else {
    warnings.push(`Live test requested for ${maskPhoneNumber(process.env.WHATSAPP_TEST_TO)}. This script does not send live messages.`);
  }
}

if (strictEnv) {
  for (const envName of ["WHATSAPP_API_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET", "WHATSAPP_WEBHOOK_VERIFY_TOKEN"]) {
    check(`${envName} present in runtime environment`, !!process.env[envName], "Required for staging/production WhatsApp delivery.");
  }
}

const failed = checks.filter((item) => !item.pass);
for (const item of checks) {
  const marker = item.pass ? "PASS" : "FAIL";
  console.log(`${marker} ${item.name}`);
  if (!item.pass) console.log(`     ${item.detail}`);
}

for (const warning of warnings) {
  console.warn(`WARN ${warning}`);
}

if (failed.length > 0) {
  console.error(`WhatsApp dry-run audit failed: ${failed.length} check(s) failed.`);
  process.exit(1);
}

console.log("WhatsApp dry-run audit passed. No live messages were sent.");
