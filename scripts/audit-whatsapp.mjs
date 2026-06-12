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
    // Approved Meta body order verified in WhatsApp Manager (EN + FR):
    // {{4}} = groupName, {{5}} = reason.
    vars: ["memberName", "fineType", "amount", "groupName", "reason"],
  },
  member_invitation: {
    constant: "MEMBER_INVITATION",
    // UTILITY replacement for the MARKETING villageclaq_invitation; {{1}}
    // is the INVITEE (the old template's {{1}} was the inviter).
    template: "villageclaq_member_invitation_notice",
    builder: "buildMemberInvitationParams",
    vars: ["inviteeName", "groupName", "invitationLink"],
  },
  standing_changed: {
    constant: "STANDING_CHANGED",
    template: "villageclaq_standing_changed",
    builder: "buildStandingChangedParams",
    vars: ["memberName", "newStanding", "groupName"],
  },
  welcome: {
    constant: "WELCOME",
    template: "villageclaq_member_joined",
    builder: "buildWelcomeParams",
    vars: ["memberName", "groupName"],
  },
  hosting_assignment: {
    constant: "HOSTING_ASSIGNMENT",
    // Reuses the approved hosting reminder template (identical variable
    // shape); a distinct assignment template is a future copy upgrade.
    template: "villageclaq_hosting_reminder",
    builder: "buildHostingAssignmentParams",
    vars: ["memberName", "hostingDate", "groupName"],
  },
  relief_enrollment: {
    constant: "RELIEF_ENROLLMENT",
    // UTILITY replacement; the original villageclaq_relief_enrollment was
    // approved as MARKETING and fails US delivery (Meta 131049).
    template: "villageclaq_plan_enrollment_confirmed",
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

const welcomeProducer = read("src/lib/welcome-producer.ts");
check(
  "WhatsApp welcome producer is server-side and queue-backed",
  welcomeProducer.includes('from("notifications_queue")') &&
    welcomeProducer.includes('template: "welcome"') &&
    welcomeProducer.includes('whatsappType: "welcome"') &&
    welcomeProducer.includes("WA_TEMPLATES.WELCOME"),
  "Welcome WhatsApp must be produced as notifications_queue rows so provider IDs and webhook status are tracked.",
);
check(
  "WhatsApp welcome producer respects new_member preferences",
  welcomeProducer.includes('"new_member"'),
  "Welcome sends must be gated by the joining member's new_member notification preferences.",
);
check(
  "WhatsApp welcome producer masks phone numbers in logs",
  welcomeProducer.includes("maskPhoneNumber("),
  "Welcome producer logs must not include full recipient phone numbers.",
);
check(
  "WhatsApp welcome producer enforces per-membership idempotency",
  welcomeProducer.includes('.eq("data->>membershipId"') &&
    welcomeProducer.includes('"23505"'),
  "At most one WhatsApp welcome per membership (check-before-insert plus unique index in migration 00088).",
);

const welcomeProducerRoute = read("src/app/api/members/welcome-notifications/route.ts");
check(
  "WhatsApp welcome route authorizes the joining member",
  welcomeProducerRoute.includes("Bearer ") &&
    welcomeProducerRoute.includes("isPlatformStaff") &&
    welcomeProducerRoute.includes("memberUserId !== user.id"),
  "Only the joining member (or platform staff) may trigger welcome production for a membership.",
);

const welcomeIdempotencyMigration = read("supabase/migrations/00088_welcome_notification_idempotency.sql");
check(
  "WhatsApp welcome idempotency migration exists",
  welcomeIdempotencyMigration.includes("idx_notifications_queue_whatsapp_welcome_unique") &&
    welcomeIdempotencyMigration.includes("template = 'welcome'") &&
    welcomeIdempotencyMigration.includes("channel = 'whatsapp'") &&
    welcomeIdempotencyMigration.includes("data ->> 'membershipId'"),
  "DB-level uniqueness must back the welcome producer's check-before-insert, scoped to whatsapp/welcome/membershipId.",
);

const payNowDialog = read("src/components/payments/pay-now-dialog.tsx");
check(
  "Pay-now dialog defers WhatsApp receipts to the server-side producer",
  !payNowDialog.includes('whatsappType: "payment_receipt"') &&
    payNowDialog.includes("whatsapp: false"),
  "Member-submitted payments must not trigger client-side WhatsApp receipts before confirmation.",
);

const confirmHistoryPage = read("src/app/[locale]/(dashboard)/dashboard/contributions/history/page.tsx");
check(
  "Payment confirmation triggers the queue-backed receipt producer",
  confirmHistoryPage.includes("/api/payments/receipt-notifications"),
  "Confirmed pay-now payments must produce the WhatsApp receipt via the server-side producer.",
);

const reliefProducer = read("src/lib/relief-enrollment-producer.ts");
check(
  "WhatsApp relief enrollment producer is server-side and queue-backed",
  reliefProducer.includes('from("notifications_queue")') &&
    reliefProducer.includes('template: "relief_enrollment"') &&
    reliefProducer.includes('whatsappType: "relief_enrollment"') &&
    reliefProducer.includes("WA_TEMPLATES.RELIEF_ENROLLMENT") &&
    reliefProducer.includes('"relief_updates"') &&
    reliefProducer.includes("maskPhoneNumber(") &&
    reliefProducer.includes('.eq("data->>enrollmentId"') &&
    reliefProducer.includes('"23505"'),
  "Relief enrollment WhatsApp must be queue-backed, pref-gated, masked, and exactly-once per enrollment.",
);
check(
  "WhatsApp relief enrollment producer never enqueues blank variables",
  reliefProducer.includes("missing_template_data"),
  "Meta rejects empty body parameters — the producer must skip when planName/groupName resolve empty.",
);

const hostingProducer = read("src/lib/hosting-assignment-producer.ts");
check(
  "WhatsApp hosting assignment producer is server-side and queue-backed",
  hostingProducer.includes('from("notifications_queue")') &&
    hostingProducer.includes('template: "hosting_assignment"') &&
    hostingProducer.includes('whatsappType: "hosting_assignment"') &&
    hostingProducer.includes("WA_TEMPLATES.HOSTING_ASSIGNMENT") &&
    hostingProducer.includes('"hosting_reminders"') &&
    hostingProducer.includes("maskPhoneNumber(") &&
    hostingProducer.includes('.eq("data->>assignmentId"') &&
    hostingProducer.includes('"23505"'),
  "Hosting assignment WhatsApp must be queue-backed, pref-gated, masked, and exactly-once per assignment.",
);
check(
  "WhatsApp hosting assignment producer only notifies upcoming, non-past assignments",
  hostingProducer.includes("assignment_not_upcoming") &&
    hostingProducer.includes("assignment_in_past"),
  "Exempted/swapped/completed rows and stale dates must never be notified.",
);

const reliefRoute = read("src/app/api/relief/enrollment-notifications/route.ts");
const hostingRoute = read("src/app/api/hosting/assignment-notifications/route.ts");
for (const [label, routeSource] of [["relief enrollment", reliefRoute], ["hosting assignment", hostingRoute]]) {
  check(
    `WhatsApp ${label} route authorizes group owners/admins only`,
    routeSource.includes('.in("role", ["owner", "admin"])') &&
      routeSource.includes('membership_status", "active"') &&
      routeSource.includes("isPlatformStaff") &&
      routeSource.includes("MAX_BATCH"),
    "Producer routes must be limited to active group owners/admins (or platform staff) with a bounded batch size.",
  );
}

const reliefEnrollmentPage = read("src/app/[locale]/(dashboard)/dashboard/relief/enrollment/page.tsx");
check(
  "Relief enrollment page defers WhatsApp to the server-side producer",
  !reliefEnrollmentPage.includes('whatsappType: "relief_enrollment"') &&
    reliefEnrollmentPage.includes("requestReliefEnrollmentWhatsApp"),
  "The shared client payload cannot carry per-recipient names; WhatsApp must flow through the producer.",
);

const hostingPage = read("src/app/[locale]/(dashboard)/dashboard/hosting/page.tsx");
check(
  "Hosting page defers assignment WhatsApp to the server-side producer",
  !hostingPage.includes('whatsappType: "hosting_assignment"') &&
    hostingPage.includes("requestHostingAssignmentWhatsApp"),
  "Publish and assign-dialog WhatsApp must flow through the producer (swap-flow hosting_reminder sends are unchanged).",
);

const reliefHostingMigration = read("supabase/migrations/00089_relief_hosting_notification_idempotency.sql");
check(
  "WhatsApp relief/hosting idempotency migration exists",
  reliefHostingMigration.includes("idx_notifications_queue_whatsapp_relief_enrollment_unique") &&
    reliefHostingMigration.includes("data ->> 'enrollmentId'") &&
    reliefHostingMigration.includes("idx_notifications_queue_whatsapp_hosting_assignment_unique") &&
    reliefHostingMigration.includes("data ->> 'assignmentId'") &&
    reliefHostingMigration.includes("channel = 'whatsapp'"),
  "DB-level uniqueness must back both producers' check-before-insert.",
);

const paymentReminderProducer = read("src/lib/payment-reminder-producer.ts");
check(
  "WhatsApp payment reminder producer is server-side and queue-backed",
  paymentReminderProducer.includes('from("notifications_queue")') &&
    paymentReminderProducer.includes('template: "payment_reminder"') &&
    paymentReminderProducer.includes('whatsappType: "payment_reminder"') &&
    paymentReminderProducer.includes("WA_TEMPLATES.PAYMENT_REMINDER") &&
    paymentReminderProducer.includes('"payment_reminders"') &&
    paymentReminderProducer.includes("maskPhoneNumber("),
  "Payment reminder WhatsApp must be queue-backed, pref-gated, and masked so provider IDs and webhook status are tracked.",
);
check(
  "WhatsApp payment reminder idempotency is a per-day bucket",
  paymentReminderProducer.includes('.eq("data->>obligationId"') &&
    paymentReminderProducer.includes('.eq("data->>reminderDate"') &&
    paymentReminderProducer.includes('"23505"'),
  "One reminder per obligation per UTC day: same-day reruns are blocked, the daily cadence is preserved.",
);
check(
  "WhatsApp payment reminder producer never enqueues blank variables",
  paymentReminderProducer.includes("missing_template_data"),
  "Meta rejects empty body parameters — the producer must skip when contributionType/groupName/dueDate resolve empty.",
);

const paymentRemindersCron = read("src/app/api/cron/payment-reminders/route.ts");
check(
  "Payment reminders cron routes WhatsApp through the queue-backed producer",
  !paymentRemindersCron.includes("dispatchWhatsApp") &&
    paymentRemindersCron.includes("producePaymentReminderNotification"),
  "The cron must never send WhatsApp directly — direct sends drop provider IDs and duplicate on rerun.",
);

const paymentReminderMigration = read("supabase/migrations/00090_payment_reminder_notification_idempotency.sql");
check(
  "WhatsApp payment reminder idempotency migration exists",
  paymentReminderMigration.includes("idx_notifications_queue_whatsapp_payment_reminder_unique") &&
    paymentReminderMigration.includes("data ->> 'obligationId'") &&
    paymentReminderMigration.includes("data ->> 'reminderDate'") &&
    paymentReminderMigration.includes("channel = 'whatsapp'"),
  "DB-level day-bucket uniqueness must back the producer's check-before-insert.",
);

const standingProducer = read("src/lib/standing-change-producer.ts");
check(
  "WhatsApp standing change producer is server-side and queue-backed",
  standingProducer.includes('from("notifications_queue")') &&
    standingProducer.includes('template: "standing_changed"') &&
    standingProducer.includes('whatsappType: "standing_changed"') &&
    standingProducer.includes("WA_TEMPLATES.STANDING_CHANGED") &&
    standingProducer.includes('"standing_changes"') &&
    standingProducer.includes("maskPhoneNumber("),
  "Standing change WhatsApp must be queue-backed, pref-gated, and masked so provider IDs and webhook status are tracked.",
);
check(
  "WhatsApp standing change producer keys whatsappData.newStanding for the dispatcher",
  standingProducer.includes("newStanding: standingDisplay") &&
    whatsappDispatcher.includes("newStanding: d.newStanding"),
  "The producer must populate newStanding (not newStatus) so the dispatcher's {{2}} is never blank.",
);
check(
  "WhatsApp standing change idempotency is a per-day, per-standing bucket",
  standingProducer.includes('.eq("data->>membershipId"') &&
    standingProducer.includes('.eq("data->>newStanding"') &&
    standingProducer.includes('.eq("data->>changeDate"') &&
    standingProducer.includes('"23505"'),
  "One notice per membership per standing value per UTC day: races dedupe, later transitions still notify.",
);

const calculateStanding = read("src/lib/calculate-standing.ts");
check(
  "calculate-standing routes WhatsApp through the producer, not a direct send",
  !/\/api\/whatsapp\/send/.test(calculateStanding) &&
    calculateStanding.includes("/api/members/standing-notifications"),
  "Standing-change WhatsApp must flow through the queue-backed producer route.",
);

const standingMigration = read("supabase/migrations/00091_standing_change_notification_idempotency.sql");
check(
  "WhatsApp standing change idempotency migration exists",
  standingMigration.includes("idx_notifications_queue_whatsapp_standing_changed_unique") &&
    standingMigration.includes("data ->> 'membershipId'") &&
    standingMigration.includes("data ->> 'newStanding'") &&
    standingMigration.includes("data ->> 'changeDate'") &&
    standingMigration.includes("template = 'standing_changed'"),
  "DB-level day-bucket uniqueness must back the producer's check-before-insert.",
);

const membershipFreezeMigration = read("supabase/migrations/00092_membership_status_self_freeze.sql");
check(
  "membership_status is frozen on non-admin self-edits (self-exit carve-out)",
  membershipFreezeMigration.includes("prevent_membership_self_escalation") &&
    membershipFreezeMigration.includes("membership_status_change_requires_admin") &&
    membershipFreezeMigration.includes("NEW.membership_status <> 'exited'"),
  "An exited former admin must not self-reinstate; only self-exit (leave-group) is permitted.",
);

const fineProducer = read("src/lib/fine-issued-producer.ts");
check(
  "WhatsApp fine producer is server-side, queue-backed, and exactly-once per fine",
  fineProducer.includes('from("notifications_queue")') &&
    fineProducer.includes('template: "fine_issued"') &&
    fineProducer.includes('whatsappType: "fine_issued"') &&
    fineProducer.includes("WA_TEMPLATES.FINE_ISSUED") &&
    fineProducer.includes('"fine_updates"') &&
    fineProducer.includes('.eq("data->>fineId"') &&
    fineProducer.includes('"23505"') &&
    fineProducer.includes("maskPhoneNumber("),
  "Fine WhatsApp must be queue-backed, pref-gated, masked, and deduped per fineId.",
);

const loanProducer = read("src/lib/loan-approved-producer.ts");
check(
  "WhatsApp loan producer is server-side, queue-backed, and exactly-once per loan",
  loanProducer.includes('from("notifications_queue")') &&
    loanProducer.includes('template: "loan_approved"') &&
    loanProducer.includes('whatsappType: "loan_approved"') &&
    loanProducer.includes("WA_TEMPLATES.LOAN_APPROVED") &&
    loanProducer.includes('"loan_updates"') &&
    loanProducer.includes('.eq("data->>loanId"') &&
    loanProducer.includes('"23505"') &&
    loanProducer.includes("maskPhoneNumber("),
  "Loan approval WhatsApp must be queue-backed, pref-gated, masked, and deduped per loanId.",
);

const claimProducer = read("src/lib/relief-claim-decision-producer.ts");
check(
  "WhatsApp relief claim producer is queue-backed with per-decision idempotency",
  claimProducer.includes('from("notifications_queue")') &&
    claimProducer.includes("WA_TEMPLATES.RELIEF_CLAIM_APPROVED") &&
    claimProducer.includes("WA_TEMPLATES.RELIEF_CLAIM_DENIED") &&
    claimProducer.includes('"relief_updates"') &&
    claimProducer.includes('.eq("template", templateKey)') &&
    claimProducer.includes('.eq("data->>claimId"') &&
    claimProducer.includes('"23505"') &&
    claimProducer.includes("maskPhoneNumber("),
  "Claim decision WhatsApp must dedupe per (claimId, decision template) so reversals still notify.",
);

const finesPage = read("src/app/[locale]/(dashboard)/dashboard/fines/page.tsx");
const loansPage = read("src/app/[locale]/(dashboard)/dashboard/loans/page.tsx");
const claimsPage = read("src/app/[locale]/(dashboard)/dashboard/relief/claims/page.tsx");
const reliefPlansPage = read("src/app/[locale]/(dashboard)/dashboard/relief/plans/page.tsx");
check(
  "money-path pages route WhatsApp through the producers, not direct client sends",
  !finesPage.includes('whatsappType: "fine_issued"') &&
    finesPage.includes("requestFineIssuedWhatsApp") &&
    !loansPage.includes('whatsappType: "loan_approved"') &&
    loansPage.includes("requestLoanApprovedWhatsApp") &&
    !claimsPage.includes('whatsappType: "relief_claim_approved"') &&
    !claimsPage.includes('whatsappType: "relief_claim_denied"') &&
    claimsPage.includes("requestReliefClaimDecisionWhatsApp") &&
    !reliefPlansPage.includes("whatsappType:") &&
    reliefPlansPage.includes("requestReliefClaimDecisionWhatsApp"),
  "Fines, loans, and both relief-claim admin surfaces must trigger the queue-backed producers.",
);

const moneyPathMigration = read("supabase/migrations/00093_money_path_notification_idempotency.sql");
check(
  "WhatsApp money-path idempotency migration exists",
  moneyPathMigration.includes("idx_notifications_queue_whatsapp_fine_issued_unique") &&
    moneyPathMigration.includes("idx_notifications_queue_whatsapp_loan_approved_unique") &&
    moneyPathMigration.includes("idx_notifications_queue_whatsapp_claim_approved_unique") &&
    moneyPathMigration.includes("idx_notifications_queue_whatsapp_claim_denied_unique") &&
    moneyPathMigration.includes("data ->> 'fineId'") &&
    moneyPathMigration.includes("data ->> 'loanId'") &&
    moneyPathMigration.includes("data ->> 'claimId'") &&
    moneyPathMigration.includes("template = 'fine_issued'") &&
    moneyPathMigration.includes("template = 'loan_approved'") &&
    moneyPathMigration.includes("template = 'relief_claim_approved'") &&
    moneyPathMigration.includes("template = 'relief_claim_denied'") &&
    (moneyPathMigration.match(/channel = 'whatsapp'::notification_channel/g) || []).length >= 4,
  "DB-level uniqueness must back the fine/loan/claim producers' check-before-insert with full channel/template predicates.",
);

const invitationProducer = read("src/lib/member-invitation-producer.ts");
check(
  "WhatsApp member invitation producer is server-side, queue-backed, and day-bucketed",
  invitationProducer.includes('from("notifications_queue")') &&
    invitationProducer.includes('template: "member_invitation"') &&
    invitationProducer.includes('whatsappType: "member_invitation"') &&
    invitationProducer.includes("WA_TEMPLATES.MEMBER_INVITATION") &&
    invitationProducer.includes('.eq("data->>invitationId"') &&
    invitationProducer.includes('.eq("data->>sendDate"') &&
    invitationProducer.includes('"23505"') &&
    invitationProducer.includes('reason: "invitation_not_pending"') &&
    invitationProducer.includes('reason: "invitation_expired"') &&
    invitationProducer.includes("maskPhoneNumber("),
  "Invitee WhatsApp must be queue-backed, pending-only, masked, and deduped per (invitationId, sendDate).",
);

const invitationsPageSrc = read("src/app/[locale]/(dashboard)/dashboard/invitations/page.tsx");
const onboardingPageSrc = read("src/app/[locale]/(dashboard)/dashboard/onboarding/group/page.tsx");
const branchesPageSrc = read("src/app/[locale]/(dashboard)/dashboard/enterprise/branches/page.tsx");
check(
  "invitation pages route WhatsApp through the producer, never the old direct path",
  !/fetch\("\/api\/whatsapp\/send"/.test(invitationsPageSrc) &&
    !invitationsPageSrc.includes('type: "invitation"') &&
    onboardingPageSrc.includes("requestMemberInvitationWhatsApp") &&
    branchesPageSrc.includes("requestMemberInvitationWhatsApp"),
  "The dead inline invitation send must stay removed; phone-invite flows must trigger the producer.",
);

const loanOverdueProducer = read("src/lib/loan-overdue-producer.ts");
check(
  "WhatsApp loan overdue producer is queue-backed with a per-day bucket and no lazy-flag dependence",
  loanOverdueProducer.includes('from("notifications_queue")') &&
    loanOverdueProducer.includes('template: "loan_overdue"') &&
    loanOverdueProducer.includes('whatsappType: "loan_overdue"') &&
    loanOverdueProducer.includes("WA_TEMPLATES.LOAN_OVERDUE") &&
    loanOverdueProducer.includes('"loan_updates"') &&
    loanOverdueProducer.includes('.eq("data->>loanId"') &&
    loanOverdueProducer.includes('.eq("data->>reminderDate"') &&
    loanOverdueProducer.includes('["pending", "partial", "overdue"]') &&
    loanOverdueProducer.includes('"23505"') &&
    loanOverdueProducer.includes("maskPhoneNumber("),
  "Overdue reminders must accept pending/partial/overdue installments (nothing server-side sets the flag) and dedupe per (loanId, reminderDate).",
);

const loanOverdueCron = read("src/app/api/cron/loan-overdue-reminders/route.ts");
check(
  "loan overdue cron is secret-gated and producer-backed",
  loanOverdueCron.includes("Bearer ${cronSecret}") &&
    loanOverdueCron.includes("produceLoanOverdueNotification") &&
    !loanOverdueCron.includes("dispatchWhatsApp") &&
    loanOverdueCron.includes('.eq("loans.status", "repaying")'),
  "The cron must only discover candidate loans; the producer re-validates and queues.",
);

const invitationLoanMigration = read("supabase/migrations/00094_invitation_loan_overdue_idempotency.sql");
check(
  "WhatsApp invitation/loan-overdue idempotency migration exists",
  invitationLoanMigration.includes("idx_notifications_queue_whatsapp_member_invitation_unique") &&
    invitationLoanMigration.includes("idx_notifications_queue_whatsapp_loan_overdue_unique") &&
    invitationLoanMigration.includes("data ->> 'invitationId'") &&
    invitationLoanMigration.includes("data ->> 'sendDate'") &&
    invitationLoanMigration.includes("data ->> 'reminderDate'") &&
    invitationLoanMigration.includes("template = 'member_invitation'") &&
    invitationLoanMigration.includes("template = 'loan_overdue'") &&
    (invitationLoanMigration.match(/channel = 'whatsapp'::notification_channel/g) || []).length >= 2,
  "DB-level day-bucket uniqueness must back both producers' check-before-insert.",
);

const phoneMatchingMigration = read("supabase/migrations/00095_phone_invitation_matching.sql");
check(
  "phone-invitee invitation matching is restored safely (visibility + accept/decline)",
  phoneMatchingMigration.includes("get_my_phone_digits") &&
    phoneMatchingMigration.includes("SECURITY DEFINER") &&
    phoneMatchingMigration.includes('"Invitees can view their phone invitations"') &&
    // No invitee phone UPDATE policy — that WITH CHECK could not pin
    // group_id, so decline is RPC-only.
    !phoneMatchingMigration.includes('CREATE POLICY "Invitees can update their phone invitations"') &&
    phoneMatchingMigration.includes("caller_matches_invitation") &&
    phoneMatchingMigration.includes("COALESCE(p_role, 'member') = 'member'") &&
    phoneMatchingMigration.includes("decline_invitation") &&
    phoneMatchingMigration.includes("count_my_pending_invitations") &&
    phoneMatchingMigration.includes("'error', 'use_claim_rpc'") &&
    phoneMatchingMigration.includes("'ok', true, 'membership_id', v_membership_id"),
  "Phone invitees must see and accept/decline member-role phone invitations through controlled RPCs without an UPDATE policy, weakening the email path, the claim guard, or the welcome-producer return shape.",
);

const myInvitationsPage = read("src/app/[locale]/(dashboard)/dashboard/my-invitations/page.tsx");
check(
  "my-invitations matches phone invitees, declines via RPC, and keeps the welcome chain",
  !myInvitationsPage.includes("if (!authUser?.email) return [];") &&
    myInvitationsPage.includes("phoneDigitsMatch(") &&
    myInvitationsPage.includes("and(email.is.null,phone.not.is.null)") &&
    myInvitationsPage.includes('.rpc("decline_invitation"') &&
    !myInvitationsPage.includes('.update({ status: "declined"') &&
    myInvitationsPage.includes("requestWelcomeWhatsApp(supabase, welcomeMembershipId, locale)"),
  "Phone-only invitees must see their invitations (with the mandatory digits post-filter), decline through the RPC, and keep the accepted-invitation welcome trigger.",
);

const remittanceProducer = read("src/lib/remittance-decision-producer.ts");
check(
  "WhatsApp remittance producer is queue-backed with per-recipient idempotency",
  remittanceProducer.includes('from("notifications_queue")') &&
    remittanceProducer.includes("WA_TEMPLATES.REMITTANCE_CONFIRMED") &&
    remittanceProducer.includes("WA_TEMPLATES.REMITTANCE_DISPUTED") &&
    remittanceProducer.includes('"relief_updates"') &&
    remittanceProducer.includes('.eq("template", templateKey)') &&
    remittanceProducer.includes('.eq("data->>remittanceId"') &&
    remittanceProducer.includes('.eq("data->>recipientUserId"') &&
    remittanceProducer.includes('.not("user_id", "is", null)') &&
    remittanceProducer.includes('"23505"') &&
    remittanceProducer.includes("maskPhoneNumber("),
  "Remittance decisions must dedupe per (remittanceId, decision template, recipient) with per-recipient locale/prefs and proxy-exclusion parity.",
);

const remittancesPageSrc = read("src/app/[locale]/(dashboard)/dashboard/relief/remittances/page.tsx");
check(
  "remittances page routes WhatsApp through the producer with a decision precondition",
  !/whatsappType:\s*(waType|"remittance_)/.test(remittancesPageSrc) &&
    remittancesPageSrc.includes("requestRemittanceDecisionWhatsApp") &&
    remittancesPageSrc.includes('.eq("status", "pending")') &&
    remittancesPageSrc.includes("remittanceAlreadyDecided"),
  "Remittance decisions must trigger the queue-backed producer and bail out on already-decided rows.",
);

const remittanceMigration = read("supabase/migrations/00096_remittance_notification_idempotency.sql");
check(
  "WhatsApp remittance idempotency migration exists",
  remittanceMigration.includes("idx_notifications_queue_whatsapp_remittance_confirmed_unique") &&
    remittanceMigration.includes("idx_notifications_queue_whatsapp_remittance_disputed_unique") &&
    remittanceMigration.includes("data ->> 'remittanceId'") &&
    remittanceMigration.includes("data ->> 'recipientUserId'") &&
    remittanceMigration.includes("template = 'remittance_confirmed'") &&
    remittanceMigration.includes("template = 'remittance_disputed'") &&
    (remittanceMigration.match(/channel = 'whatsapp'::notification_channel/g) || []).length >= 2,
  "DB-level per-recipient uniqueness must back the remittance producer's check-before-insert.",
);

const hostingReminderProducerSrc = read("src/lib/hosting-reminder-producer.ts");
check(
  "WhatsApp hosting reminder producer is server-side and queue-backed",
  hostingReminderProducerSrc.includes('from("notifications_queue")') &&
    hostingReminderProducerSrc.includes('template: "hosting_reminder"') &&
    hostingReminderProducerSrc.includes('whatsappType: "hosting_reminder"') &&
    hostingReminderProducerSrc.includes("WA_TEMPLATES.HOSTING_REMINDER") &&
    hostingReminderProducerSrc.includes('"hosting_reminders"') &&
    hostingReminderProducerSrc.includes("maskPhoneNumber("),
  "Hosting reminder WhatsApp must be queue-backed, pref-gated, and masked so provider IDs and webhook status are tracked.",
);
check(
  "WhatsApp hosting reminder idempotency is strict per assignment occurrence",
  hostingReminderProducerSrc.includes('.eq("data->>assignmentId"') &&
    hostingReminderProducerSrc.includes('.eq("data->>assignedDate"') &&
    hostingReminderProducerSrc.includes('"23505"'),
  "One reminder per (assignmentId, assignedDate), ever — this replaces the legacy body-LIKE dedup that never matched.",
);
check(
  "WhatsApp hosting reminder producer never enqueues blank variables",
  hostingReminderProducerSrc.includes("missing_template_data"),
  "Meta rejects empty body parameters — the producer must skip when memberName/groupName/hostingDate resolve empty.",
);

const hostingRemindersCron = read("src/app/api/cron/hosting-reminders/route.ts");
check(
  "Hosting reminders cron routes WhatsApp through the queue-backed producer",
  !hostingRemindersCron.includes("dispatchWhatsApp") &&
    hostingRemindersCron.includes("produceHostingReminderNotification"),
  "The cron must never send WhatsApp directly — direct sends drop provider IDs and duplicate on rerun.",
);
check(
  "Hosting reminders cron uses a valid notification_type enum value",
  !hostingRemindersCron.includes('type: "hosting_reminder"') &&
    hostingRemindersCron.includes('type: "system"'),
  "notification_type has no 'hosting_reminder' value — the legacy insert always failed. In-app rows must use a valid enum value.",
);
check(
  "Hosting reminders cron dedups via dedup_key, never body text",
  !hostingRemindersCron.includes('.like("body"') &&
    hostingRemindersCron.includes("dedup_key"),
  "The legacy dedup compared an ISO date to a locale-formatted body and never matched, causing daily duplicate sends.",
);

const eventReminderProducerSrc = read("src/lib/event-reminder-producer.ts");
check(
  "WhatsApp event reminder producer is server-side and queue-backed",
  eventReminderProducerSrc.includes('from("notifications_queue")') &&
    eventReminderProducerSrc.includes('template: "event_reminder"') &&
    eventReminderProducerSrc.includes('whatsappType: "event_reminder"') &&
    eventReminderProducerSrc.includes("WA_TEMPLATES.EVENT_REMINDER") &&
    eventReminderProducerSrc.includes('"event_reminders"') &&
    eventReminderProducerSrc.includes("maskPhoneNumber("),
  "Event reminder WhatsApp must be queue-backed, pref-gated, and masked so provider IDs and webhook status are tracked.",
);
check(
  "WhatsApp event reminder idempotency is strict per event per recipient",
  eventReminderProducerSrc.includes('.eq("data->>eventId"') &&
    eventReminderProducerSrc.includes('.eq("data->>userId"') &&
    eventReminderProducerSrc.includes('"23505"'),
  "Events remind once per (eventId, userId) — parity with events.reminder_sent_at.",
);
check(
  "WhatsApp event reminder producer never enqueues blank variables",
  eventReminderProducerSrc.includes("missing_template_data") &&
    eventReminderProducerSrc.includes("eventLocationFallback"),
  "Meta rejects empty body parameters — location-less events must use the translated fallback, never an empty string.",
);

const eventRemindersCron = read("src/app/api/cron/event-reminders/route.ts");
check(
  "Event reminders cron routes WhatsApp through the queue-backed producer",
  !eventRemindersCron.includes("dispatchWhatsApp") &&
    eventRemindersCron.includes("produceEventReminderNotification"),
  "The cron must never send WhatsApp directly — direct sends drop provider IDs and duplicate on rerun.",
);
check(
  "Event reminders cron race-gates the reminder_sent_at flip",
  eventRemindersCron.includes('.is("reminder_sent_at", null)') &&
    (eventRemindersCron.split('.is("reminder_sent_at", null)').length - 1) >= 2,
  "Both the candidate query and the post-dispatch UPDATE must filter on reminder_sent_at IS NULL so two runs cannot both flip or clobber the timestamp; WhatsApp stays exactly-once via the producer's queue idempotency (email/SMS remain at-least-once under truly overlapping runs — legacy parity).",
);

const subscriptionProducerSrc = read("src/lib/subscription-expiring-producer.ts");
check(
  "WhatsApp subscription-expiring producer is server-side and queue-backed",
  subscriptionProducerSrc.includes('from("notifications_queue")') &&
    subscriptionProducerSrc.includes('template: "subscription_expiring"') &&
    subscriptionProducerSrc.includes('whatsappType: "subscription_expiring"') &&
    subscriptionProducerSrc.includes("WA_TEMPLATES.SUBSCRIPTION_EXPIRING") &&
    subscriptionProducerSrc.includes('"subscription_updates"') &&
    subscriptionProducerSrc.includes("maskPhoneNumber("),
  "Subscription-expiring WhatsApp must be queue-backed, pref-gated, and masked so provider IDs and webhook status are tracked.",
);
check(
  "WhatsApp subscription-expiring idempotency is a per-recipient day bucket",
  subscriptionProducerSrc.includes('.eq("data->>subscriptionId"') &&
    subscriptionProducerSrc.includes('.eq("data->>reminderDate"') &&
    subscriptionProducerSrc.includes('.eq("data->>userId"') &&
    subscriptionProducerSrc.includes('"23505"'),
  "One reminder per (subscriptionId, reminderDate, recipient): the daysLeft countdown cadence is intentional, same-day reruns are idempotent.",
);
check(
  "WhatsApp subscription-expiring producer never writes billing state",
  !subscriptionProducerSrc.includes(".update(") &&
    !subscriptionProducerSrc.includes(".delete(") &&
    !subscriptionProducerSrc.includes("stripe_"),
  "group_subscriptions is read-only for notification code — Stripe/billing state must never be touched.",
);

const subscriptionRemindersCron = read("src/app/api/cron/subscription-reminders/route.ts");
check(
  "Subscription reminders cron routes WhatsApp through the queue-backed producer",
  !subscriptionRemindersCron.includes("dispatchWhatsApp") &&
    subscriptionRemindersCron.includes("produceSubscriptionExpiringNotification"),
  "The cron must never send WhatsApp directly — direct sends drop provider IDs and duplicate on rerun.",
);
check(
  "Subscription reminders cron never writes billing state",
  !subscriptionRemindersCron.includes(".update(") &&
    !subscriptionRemindersCron.includes("stripe_"),
  "The subscription cron is a pure reminder path; it must never mutate group_subscriptions or Stripe fields.",
);

// ── Direct-dispatch allowlist for cron routes ────────────────────────────────
// After the legacy-cron producerization, the ONLY cron routes allowed to call
// the WhatsApp dispatcher directly are:
//   - drain-notification-queue (it IS the queue consumer), and
//   - send-scheduled-announcements (DEFERRED, Option B: announcements remain
//     strategy-sensitive — villageclaq_announcement_v2 is MARKETING-category,
//     which Meta blocks to US numbers (131049). Producerizing before the
//     category strategy decision would bake the wrong template assumptions
//     into queue rows. See docs/whatsapp-template-coverage-audit.md
//     Addendum 11.)
// Any other cron route gaining a direct dispatchWhatsApp call must fail this
// audit and be converted to a queue-backed producer instead.
const cronDirectDispatchAllowlist = new Set([
  "drain-notification-queue",
  "send-scheduled-announcements",
]);
const cronDir = path.join(root, "src/app/api/cron");
for (const entry of fs.readdirSync(cronDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const routePath = `src/app/api/cron/${entry.name}/route.ts`;
  let source = "";
  try {
    source = read(routePath);
  } catch (err) {
    warnings.push(`cron route ${routePath} could not be read: ${err instanceof Error ? err.message : err}`);
    continue;
  }
  const usesDirectDispatch = source.includes("dispatchWhatsApp");
  check(
    `cron route ${entry.name} respects the direct-dispatch allowlist`,
    !usesDirectDispatch || cronDirectDispatchAllowlist.has(entry.name),
    "Only the queue drain and the explicitly deferred scheduled-announcements route may dispatch WhatsApp directly; everything else must enqueue via a producer.",
  );
}

const legacyCronMigration = read("supabase/migrations/00097_legacy_cron_reminder_idempotency.sql");
check(
  "WhatsApp legacy-cron reminder idempotency migration exists",
  legacyCronMigration.includes("idx_notifications_queue_whatsapp_hosting_reminder_unique") &&
    legacyCronMigration.includes("idx_notifications_queue_whatsapp_event_reminder_unique") &&
    legacyCronMigration.includes("idx_notifications_queue_whatsapp_subscription_expiring_unique") &&
    legacyCronMigration.includes("idx_notifications_hosting_reminder_dedup_unique") &&
    legacyCronMigration.includes("data ->> 'assignmentId'") &&
    legacyCronMigration.includes("data ->> 'assignedDate'") &&
    legacyCronMigration.includes("data ->> 'eventId'") &&
    legacyCronMigration.includes("data ->> 'subscriptionId'") &&
    (legacyCronMigration.match(/channel = 'whatsapp'::notification_channel/g) || []).length >= 3,
  "DB-level uniqueness must back all three legacy-cron producers' check-before-insert, plus the hosting dedup_key race backstop.",
);

const cronMessagesEn = JSON.parse(read("messages/en.json"));
const cronMessagesFr = JSON.parse(read("messages/fr.json"));
check(
  "Event location fallback is translated in both locales",
  JSON.stringify(cronMessagesEn).includes("eventLocationFallback") &&
    JSON.stringify(cronMessagesFr).includes("eventLocationFallback"),
  "Meta rejects empty body params; the location fallback must exist in messages/en.json AND messages/fr.json (rule 1).",
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
