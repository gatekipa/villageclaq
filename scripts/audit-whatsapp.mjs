#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const strictEnv = process.argv.includes("--strict-env");

/*
 * Static dry-run audit. The phone helpers below are reference-only samples so
 * this script can run directly under Node without TypeScript path alias setup;
 * production helpers remain in src/lib and are covered by targeted tests.
 */

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
  let normalizedCountryCode = String(countryCode || "237").trim();
  if (normalizedCountryCode.startsWith("+")) normalizedCountryCode = normalizedCountryCode.slice(1);
  if (normalizedCountryCode.startsWith("00")) normalizedCountryCode = normalizedCountryCode.slice(2);
  if (!/^\d{1,3}$/.test(normalizedCountryCode)) normalizedCountryCode = "237";
  let cleaned = String(phone).replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
  if (cleaned.startsWith("00")) cleaned = cleaned.slice(2);
  if (cleaned.startsWith("0")) cleaned = normalizedCountryCode + cleaned.slice(1);
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

const notifyClient = read("src/lib/notify-client.ts");
check(
  "Client notification diagnostics mask recipient phone numbers",
  notifyClient.includes("import { maskPhoneNumber }") &&
    notifyClient.includes("recipientPhone: maskPhoneNumber(recipientPhone)"),
  "Browser-side notification diagnostics should not log full recipient phone numbers.",
);

const whatsappTemplates = read("src/lib/whatsapp-templates.ts");
const whatsappDispatcher = read("src/lib/whatsapp-dispatcher.ts");
const approvedLaunchTemplateNames = {
  PAYMENT_RECEIPT: "villageclaq_payment_receipt_v2",
  PAYMENT_REMINDER: "villageclaq_payment_reminder_v2",
  EVENT_REMINDER: "villageclaq_event_reminder_v2",
  ANNOUNCEMENT: "villageclaq_announcement_v2",
};

const fullTemplateRegistry = {
  payment_receipt: {
    constant: "PAYMENT_RECEIPT",
    template: "villageclaq_payment_receipt_v2",
    builder: "buildPaymentReceiptParams",
    vars: ["memberName", "amount", "contributionType", "groupName", "date"],
  },
  payment_reminder: {
    constant: "PAYMENT_REMINDER",
    template: "villageclaq_payment_reminder_v2",
    builder: "buildPaymentReminderParams",
    vars: ["memberName", "amount", "contributionType", "dueDate", "groupName"],
  },
  event_reminder: {
    constant: "EVENT_REMINDER",
    template: "villageclaq_event_reminder_v2",
    builder: "buildEventReminderParams",
    vars: ["memberName", "eventTitle", "eventDate", "eventLocation", "groupName"],
  },
  hosting_reminder: {
    constant: "HOSTING_REMINDER",
    template: "villageclaq_hosting_reminder",
    builder: "buildHostingReminderParams",
    vars: ["memberName", "hostingDate", "groupName"],
  },
  minutes_published: {
    constant: "MINUTES_PUBLISHED",
    template: "villageclaq_minutes_published",
    builder: "buildMinutesPublishedParams",
    vars: ["groupName", "meetingTitle", "meetingDate"],
  },
  relief_claim_approved: {
    constant: "RELIEF_CLAIM_APPROVED",
    template: "villageclaq_relief_claim_approved",
    builder: "buildReliefClaimApprovedParams",
    vars: ["memberName", "claimType", "amount", "groupName"],
  },
  relief_claim_denied: {
    constant: "RELIEF_CLAIM_DENIED",
    template: "villageclaq_relief_claim_denied",
    builder: "buildReliefClaimDeniedParams",
    vars: ["memberName", "claimType", "reason", "groupName"],
  },
  announcement: {
    constant: "ANNOUNCEMENT",
    template: "villageclaq_announcement_v2",
    builder: "buildAnnouncementParams",
    vars: ["groupName", "title", "body"],
  },
  election_opened: {
    constant: "ELECTION_OPENED",
    template: "villageclaq_election_opened",
    builder: "buildElectionOpenedParams",
    vars: ["groupName", "electionTitle", "positions"],
  },
  invitation: {
    constant: "INVITATION",
    template: "villageclaq_invitation",
    builder: "buildInvitationParams",
    vars: ["inviterName", "groupName", "acceptUrl"],
  },
  loan_approved: {
    constant: "LOAN_APPROVED",
    template: "villageclaq_loan_approved",
    builder: "buildLoanApprovedParams",
    vars: ["memberName", "amount", "groupName"],
  },
  loan_overdue: {
    constant: "LOAN_OVERDUE",
    template: "villageclaq_loan_overdue",
    builder: "buildLoanOverdueParams",
    vars: ["memberName", "amount", "dueDate", "groupName"],
  },
  fine_issued: {
    constant: "FINE_ISSUED",
    template: "villageclaq_fine_issued",
    builder: "buildFineIssuedParams",
    vars: ["memberName", "fineType", "amount", "reason", "groupName"],
  },
  standing_changed: {
    constant: "STANDING_CHANGED",
    template: "villageclaq_standing_changed",
    builder: "buildStandingChangedParams",
    vars: ["memberName", "newStanding", "groupName"],
  },
  welcome: {
    constant: "WELCOME",
    template: "villageclaq_welcome",
    builder: "buildWelcomeParams",
    vars: ["memberName", "groupName"],
  },
  hosting_assignment: {
    constant: "HOSTING_ASSIGNMENT",
    template: "villageclaq_hosting_assignment",
    builder: "buildHostingAssignmentParams",
    vars: ["memberName", "hostingDate", "groupName"],
  },
  relief_enrollment: {
    constant: "RELIEF_ENROLLMENT",
    template: "villageclaq_relief_enrollment",
    builder: "buildReliefEnrollmentParams",
    vars: ["memberName", "planName", "groupName"],
  },
  remittance_confirmed: {
    constant: "REMITTANCE_CONFIRMED",
    template: "villageclaq_remittance_confirmed",
    builder: "buildRemittanceConfirmedParams",
    vars: ["amount", "groupName"],
  },
  remittance_disputed: {
    constant: "REMITTANCE_DISPUTED",
    template: "villageclaq_remittance_disputed",
    builder: "buildRemittanceDisputedParams",
    vars: ["amount", "groupName"],
  },
  subscription_expiring: {
    constant: "SUBSCRIPTION_EXPIRING",
    template: "villageclaq_subscription_expiring",
    builder: "buildSubscriptionExpiringParams",
    vars: ["planName", "days"],
  },
  proxy_claim: {
    constant: "PROXY_CLAIM",
    template: "villageclaq_proxy_claim",
    builder: "buildProxyClaimParams",
    vars: ["memberName", "groupName", "claimUrl"],
  },
};

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

for (const [constantName, approvedTemplateName] of Object.entries(approvedLaunchTemplateNames)) {
  const templateMappingPattern = new RegExp(
    `\\b${escapeRegex(constantName)}\\s*:\\s*['"]${escapeRegex(approvedTemplateName)}['"]`,
  );

  check(
    `WhatsApp ${constantName} maps to approved v2 template`,
    templateMappingPattern.test(whatsappTemplates),
    `Launch-critical WhatsApp templates must use ${approvedTemplateName}.`,
  );
}

function parseTemplateConstants(source) {
  const block = source.match(/export const WA_TEMPLATES = \{([\s\S]*?)\} as const;/)?.[1] || "";
  const parsed = {};
  for (const match of block.matchAll(/\b([A-Z0-9_]+)\s*:\s*["']([^"']+)["']/g)) {
    parsed[match[1]] = match[2];
  }
  return parsed;
}

function parseDispatcherTypes(source) {
  const block = source.match(/export type WhatsAppNotificationType =([\s\S]*?);/)?.[1] || "";
  return new Set([...block.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]));
}

function parseDispatcherMappings(source) {
  const block = source.match(/const TYPE_TO_TEMPLATE:[\s\S]*?= \{([\s\S]*?)\};/)?.[1] || "";
  const parsed = {};
  for (const match of block.matchAll(/\b([a-z0-9_]+)\s*:\s*WA_TEMPLATES\.([A-Z0-9_]+)/g)) {
    parsed[match[1]] = match[2];
  }
  return parsed;
}

function parseBuilderCases(source) {
  const parsed = {};
  for (const match of source.matchAll(/case\s+["']([^"']+)["']:\s*return\s+(build[A-Za-z0-9]+Params)\(/g)) {
    parsed[match[1]] = match[2];
  }
  return parsed;
}

function parseBuilderOrders(source) {
  const parsed = {};
  for (const match of source.matchAll(/export function (build[A-Za-z0-9]+Params)\([\s\S]*?\): WhatsAppTemplateComponent\[\] \{\s*return bodyParams\(([^;]*?)\);\s*\}/g)) {
    parsed[match[1]] = [...match[2].matchAll(/data\.([a-zA-Z0-9_]+)/g)].map((item) => item[1]);
  }
  return parsed;
}

const parsedTemplateConstants = parseTemplateConstants(whatsappTemplates);
const parsedDispatcherTypes = parseDispatcherTypes(whatsappDispatcher);
const parsedDispatcherMappings = parseDispatcherMappings(whatsappDispatcher);
const parsedBuilderCases = parseBuilderCases(whatsappDispatcher);
const parsedBuilderOrders = parseBuilderOrders(whatsappTemplates);

for (const [type, expected] of Object.entries(fullTemplateRegistry)) {
  check(
    `WhatsApp type ${type} is declared in dispatcher union`,
    parsedDispatcherTypes.has(type),
    "Every app WhatsApp type should be part of WhatsAppNotificationType.",
  );

  check(
    `WhatsApp type ${type} maps through ${expected.constant}`,
    parsedDispatcherMappings[type] === expected.constant,
    `Expected TYPE_TO_TEMPLATE.${type} to use WA_TEMPLATES.${expected.constant}.`,
  );

  check(
    `WhatsApp constant ${expected.constant} uses ${expected.template}`,
    parsedTemplateConstants[expected.constant] === expected.template,
    `Expected WA_TEMPLATES.${expected.constant} to be ${expected.template}.`,
  );

  check(
    `WhatsApp type ${type} uses ${expected.builder}`,
    parsedBuilderCases[type] === expected.builder,
    `Expected buildComponents("${type}") to call ${expected.builder}.`,
  );

  check(
    `WhatsApp builder ${expected.builder} variable order is stable`,
    JSON.stringify(parsedBuilderOrders[expected.builder] || []) === JSON.stringify(expected.vars),
    `Expected ${expected.vars.join(", ")}; got ${(parsedBuilderOrders[expected.builder] || []).join(", ")}.`,
  );
}

const expectedTypes = new Set(Object.keys(fullTemplateRegistry));
for (const type of parsedDispatcherTypes) {
  check(
    `WhatsApp dispatcher type ${type} is covered by audit registry`,
    expectedTypes.has(type),
    "Add every new WhatsApp type to scripts/audit-whatsapp.mjs so template coverage stays explicit.",
  );
}

const exampleEnv = envNamesFromExample();
for (const requiredName of [
  "WHATSAPP_API_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_API_VERSION",
  "CRON_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
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
check(
  "WhatsApp webhook POST validates Meta signature before persistence",
  webhookRoute.includes("WHATSAPP_APP_SECRET") &&
    webhookRoute.includes("verifyWhatsAppWebhookSignature") &&
    webhookRoute.includes("request.text()") &&
    webhookRoute.indexOf("verifyWhatsAppWebhookSignature(rawBody") <
      webhookRoute.indexOf("const events = extractWhatsAppStatusEvents"),
  "Meta POST callbacks must verify X-Hub-Signature-256 over the raw body before parsing or writing status rows.",
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
check(
  "WhatsApp status event migration does not expose rows through staff-only helper policy",
  !webhookMigration.includes("USING (is_platform_staff())"),
  "This status table is not group-scoped; avoid authenticated broad reads until a group-owned access policy exists.",
);
check(
  "WhatsApp status event migration grants authenticated baseline privileges",
  webhookMigration.includes("GRANT ALL ON public.whatsapp_message_status_events TO authenticated;"),
  "Repository migration baseline requires GRANT ALL on new tables for authenticated; RLS still controls row access.",
);

const drainQueueRoute = read("src/app/api/cron/drain-notification-queue/route.ts");
check(
  "Queue drain verifies sent-status persistence before counting sent",
  drainQueueRoute.includes("Failed to persist sent queue item") &&
    drainQueueRoute.includes(".select(\"id\")") &&
    drainQueueRoute.indexOf(".select(\"id\")") < drainQueueRoute.indexOf("sent++"),
  "A provider send is only final after the queue row is updated to sent; otherwise the row can be retried.",
);

const whatsappSendRoute = read("src/app/api/whatsapp/send/route.ts");
check(
  "WhatsApp send route queues only retryable provider failures",
  whatsappSendRoute.includes("isRetryableWhatsAppFailure") &&
    whatsappSendRoute.includes("Only retry transient provider failures") &&
    whatsappSendRoute.includes("queueWhatsAppMessage(recipientPhone, body)"),
  "Invalid phone/template/type failures should return immediately instead of creating poison retry rows.",
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
  for (const envName of ["WHATSAPP_API_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET", "WHATSAPP_WEBHOOK_VERIFY_TOKEN", "WHATSAPP_APP_SECRET"]) {
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
