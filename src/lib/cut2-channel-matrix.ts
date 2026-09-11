/**
 * Frozen Cut 2 type×channel allowlist.
 * Source: docs/evidence/S0_CUT2_CHANNEL_RENDERER_MATRIX_20260911.json
 * DEFAULT DENY. push DENY for every type. No 23rd type.
 */

export const CUT2_NOTIFICATION_TYPES = [
  "payment_receipt",
  "payment_reminder",
  "welcome",
  "standing_changed",
  "relief_enrollment",
  "relief_claim_approved",
  "relief_claim_denied",
  "remittance_confirmed",
  "remittance_disputed",
  "hosting_assignment",
  "hosting_reminder",
  "event_reminder",
  "loan_approved",
  "loan_overdue",
  "fine_issued",
  "member_invitation",
  "subscription_expiring",
  "minutes_published",
  "election_opened",
  "announcement",
  "proxy_claim",
  "hosting_swap",
] as const;

export type Cut2NotificationType = (typeof CUT2_NOTIFICATION_TYPES)[number];
export type Cut2QueueChannel = "whatsapp" | "sms" | "email";

export const CUT2_CHANNEL_MATRIX: Record<
  Cut2NotificationType,
  Record<Cut2QueueChannel | "push", "ALLOW" | "DENY">
> = {
  payment_receipt: { whatsapp: "ALLOW", sms: "ALLOW", email: "ALLOW", push: "DENY" },
  payment_reminder: { whatsapp: "ALLOW", sms: "ALLOW", email: "ALLOW", push: "DENY" },
  welcome: { whatsapp: "ALLOW", sms: "ALLOW", email: "ALLOW", push: "DENY" },
  standing_changed: { whatsapp: "ALLOW", sms: "ALLOW", email: "DENY", push: "DENY" },
  relief_enrollment: { whatsapp: "ALLOW", sms: "ALLOW", email: "DENY", push: "DENY" },
  relief_claim_approved: { whatsapp: "ALLOW", sms: "ALLOW", email: "DENY", push: "DENY" },
  relief_claim_denied: { whatsapp: "ALLOW", sms: "ALLOW", email: "DENY", push: "DENY" },
  remittance_confirmed: { whatsapp: "ALLOW", sms: "ALLOW", email: "DENY", push: "DENY" },
  remittance_disputed: { whatsapp: "ALLOW", sms: "ALLOW", email: "DENY", push: "DENY" },
  hosting_assignment: { whatsapp: "ALLOW", sms: "ALLOW", email: "DENY", push: "DENY" },
  hosting_reminder: { whatsapp: "ALLOW", sms: "ALLOW", email: "DENY", push: "DENY" },
  event_reminder: { whatsapp: "ALLOW", sms: "ALLOW", email: "ALLOW", push: "DENY" },
  loan_approved: { whatsapp: "ALLOW", sms: "ALLOW", email: "DENY", push: "DENY" },
  loan_overdue: { whatsapp: "ALLOW", sms: "DENY", email: "DENY", push: "DENY" },
  fine_issued: { whatsapp: "ALLOW", sms: "ALLOW", email: "DENY", push: "DENY" },
  member_invitation: { whatsapp: "ALLOW", sms: "DENY", email: "ALLOW", push: "DENY" },
  subscription_expiring: { whatsapp: "ALLOW", sms: "ALLOW", email: "DENY", push: "DENY" },
  minutes_published: { whatsapp: "ALLOW", sms: "ALLOW", email: "ALLOW", push: "DENY" },
  election_opened: { whatsapp: "ALLOW", sms: "DENY", email: "DENY", push: "DENY" },
  announcement: { whatsapp: "ALLOW", sms: "ALLOW", email: "DENY", push: "DENY" },
  proxy_claim: { whatsapp: "ALLOW", sms: "ALLOW", email: "DENY", push: "DENY" },
  hosting_swap: { whatsapp: "ALLOW", sms: "ALLOW", email: "DENY", push: "DENY" },
};

export function cut2AllowedChannels(type: Cut2NotificationType): Cut2QueueChannel[] {
  const row = CUT2_CHANNEL_MATRIX[type];
  return (["whatsapp", "sms", "email"] as Cut2QueueChannel[]).filter((c) => row[c] === "ALLOW");
}

export const CUT2_EMAIL_TEMPLATE: Partial<Record<Cut2NotificationType, string>> = {
  welcome: "welcome",
  payment_receipt: "payment-receipt",
  payment_reminder: "payment-reminder",
  event_reminder: "event-reminder",
  minutes_published: "minutes-published",
  member_invitation: "invitation",
};

export const CUT2_SMS_TEMPLATE: Partial<Record<Cut2NotificationType, string>> = {
  payment_reminder: "payment-reminder",
  event_reminder: "event-reminder",
  payment_receipt: "payment-receipt",
  welcome: "welcome",
  minutes_published: "minutes-published",
  hosting_reminder: "hosting-reminder",
  hosting_swap: "hosting-reminder",
  standing_changed: "standing-changed",
  hosting_assignment: "hosting-assignment",
  relief_enrollment: "relief-enrollment",
  remittance_confirmed: "remittance-status",
  remittance_disputed: "remittance-status",
  subscription_expiring: "subscription-expiring",
  relief_claim_approved: "relief-claim-approved",
  relief_claim_denied: "relief-claim-denied",
  announcement: "announcement",
  loan_approved: "loan-approved",
  fine_issued: "fine-issued",
  proxy_claim: "proxy-claim",
};

export const CUT2_WA_DISPATCH_TYPE: Record<Cut2NotificationType, string> = {
  payment_receipt: "payment_receipt",
  payment_reminder: "payment_reminder",
  welcome: "welcome",
  standing_changed: "standing_changed",
  relief_enrollment: "relief_enrollment",
  relief_claim_approved: "relief_claim_approved",
  relief_claim_denied: "relief_claim_denied",
  remittance_confirmed: "remittance_confirmed",
  remittance_disputed: "remittance_disputed",
  hosting_assignment: "hosting_assignment",
  hosting_reminder: "hosting_reminder",
  event_reminder: "event_reminder",
  loan_approved: "loan_approved",
  loan_overdue: "loan_overdue",
  fine_issued: "fine_issued",
  member_invitation: "member_invitation",
  subscription_expiring: "subscription_expiring",
  minutes_published: "minutes_published",
  election_opened: "election_opened",
  announcement: "announcement",
  proxy_claim: "proxy_claim",
  hosting_swap: "hosting_reminder",
};
