/**
 * WhatsApp message template definitions and parameter builders.
 *
 * Templates are submitted and approved in Meta Business Manager.
 * This file maps notification types to template names and builds
 * the components array that the Meta Cloud API expects.
 *
 * Template naming convention: villageclaq_{type}
 * All templates must be submitted in both EN and FR.
 */

import type { WhatsAppTemplateComponent } from "@/lib/send-whatsapp";

// ─── Template Names ─────────────────────────────────────────────────────────

export const WA_TEMPLATES = {
  PAYMENT_RECEIPT: "villageclaq_payment_receipt_v2",
  PAYMENT_REMINDER: "villageclaq_payment_reminder_v2",
  EVENT_REMINDER: "villageclaq_event_reminder_v2",
  HOSTING_REMINDER: "villageclaq_hosting_reminder",
  MINUTES_PUBLISHED: "villageclaq_minutes_published",
  RELIEF_CLAIM_APPROVED: "villageclaq_relief_claim_approved",
  RELIEF_CLAIM_DENIED: "villageclaq_relief_claim_denied",
  ANNOUNCEMENT: "villageclaq_announcement_v2",
  ELECTION_OPENED: "villageclaq_election_opened",
  INVITATION: "villageclaq_invitation",
  // UTILITY replacement for villageclaq_invitation, which was approved as
  // MARKETING (Meta blocks marketing templates to US numbers, error 131049).
  // NOTE: {{1}} semantics CHANGE — the old template's {{1}} was the INVITER,
  // the new one's {{1}} is the INVITEE — so this ships as the separate
  // member_invitation type, never as an in-place INVITATION remap.
  MEMBER_INVITATION: "villageclaq_member_invitation_notice",
  LOAN_APPROVED: "villageclaq_loan_approved",
  LOAN_OVERDUE: "villageclaq_loan_overdue",
  FINE_ISSUED: "villageclaq_fine_issued",
  STANDING_CHANGED: "villageclaq_standing_changed",
  WELCOME: "villageclaq_member_joined",
  // Reuses the approved hosting reminder template — identical 3-variable
  // body (memberName, hostingDate, groupName). A distinct assignment
  // template remains a future copy upgrade.
  HOSTING_ASSIGNMENT: "villageclaq_hosting_reminder",
  // UTILITY replacement for the MARKETING-approved villageclaq_relief_enrollment,
  // which Meta blocks to US numbers (error 131049). Same 3-variable body.
  RELIEF_ENROLLMENT: "villageclaq_plan_enrollment_confirmed",
  REMITTANCE_CONFIRMED: "villageclaq_remittance_confirmed",
  REMITTANCE_DISPUTED: "villageclaq_remittance_disputed",
  SUBSCRIPTION_EXPIRING: "villageclaq_subscription_expiring",
  PROXY_CLAIM: "villageclaq_proxy_claim",
} as const;

// ─── Helpers: build body-only components ────────────────────────────────────

function bodyParams(...texts: string[]): WhatsAppTemplateComponent[] {
  if (texts.length === 0) return [];
  return [
    {
      type: "body",
      parameters: texts.map((t) => ({ type: "text" as const, text: t })),
    },
  ];
}

// ─── Parameter Builders ─────────────────────────────────────────────────────

export function buildPaymentReceiptParams(data: {
  memberName: string;
  amount: string;
  contributionType: string;
  groupName: string;
  date: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.memberName, data.amount, data.contributionType, data.groupName, data.date);
}

export function buildPaymentReminderParams(data: {
  memberName: string;
  amount: string;
  contributionType: string;
  dueDate: string;
  groupName: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.memberName, data.amount, data.contributionType, data.dueDate, data.groupName);
}

export function buildEventReminderParams(data: {
  memberName: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string;
  groupName: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.memberName, data.eventTitle, data.eventDate, data.eventLocation, data.groupName);
}

export function buildHostingReminderParams(data: {
  memberName: string;
  hostingDate: string;
  groupName: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.memberName, data.hostingDate, data.groupName);
}

export function buildMinutesPublishedParams(data: {
  groupName: string;
  meetingTitle: string;
  meetingDate: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.groupName, data.meetingTitle, data.meetingDate);
}

export function buildReliefClaimApprovedParams(data: {
  memberName: string;
  claimType: string;
  amount: string;
  groupName: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.memberName, data.claimType, data.amount, data.groupName);
}

export function buildReliefClaimDeniedParams(data: {
  memberName: string;
  claimType: string;
  reason: string;
  groupName: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.memberName, data.claimType, data.reason, data.groupName);
}

export function buildAnnouncementParams(data: {
  groupName: string;
  title: string;
  body: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.groupName, data.title, data.body);
}

export function buildElectionOpenedParams(data: {
  groupName: string;
  electionTitle: string;
  positions: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.groupName, data.electionTitle, data.positions);
}

export function buildInvitationParams(data: {
  inviterName: string;
  groupName: string;
  acceptUrl: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.inviterName, data.groupName, data.acceptUrl);
}

// Approved Meta body order for villageclaq_member_invitation_notice
// (UTILITY, EN + FR): {{1}} inviteeName, {{2}} groupName,
// {{3}} invitationLink.
export function buildMemberInvitationParams(data: {
  inviteeName: string;
  groupName: string;
  invitationLink: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.inviteeName, data.groupName, data.invitationLink);
}

export function buildLoanApprovedParams(data: {
  memberName: string;
  amount: string;
  groupName: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.memberName, data.amount, data.groupName);
}

export function buildLoanOverdueParams(data: {
  memberName: string;
  amount: string;
  dueDate: string;
  groupName: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.memberName, data.amount, data.dueDate, data.groupName);
}

// Approved Meta body order (verified in WhatsApp Manager, EN + FR):
// {{1}} memberName, {{2}} fineType, {{3}} amount, {{4}} groupName,
// {{5}} reason. The original emission had {{4}}/{{5}} swapped.
export function buildFineIssuedParams(data: {
  memberName: string;
  fineType: string;
  amount: string;
  reason: string;
  groupName: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.memberName, data.fineType, data.amount, data.groupName, data.reason);
}

export function buildStandingChangedParams(data: {
  memberName: string;
  newStanding: string;
  groupName: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.memberName, data.newStanding, data.groupName);
}

export function buildWelcomeParams(data: {
  memberName: string;
  groupName: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.memberName, data.groupName);
}

export function buildHostingAssignmentParams(data: {
  memberName: string;
  hostingDate: string;
  groupName: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.memberName, data.hostingDate, data.groupName);
}

export function buildReliefEnrollmentParams(data: {
  memberName: string;
  planName: string;
  groupName: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.memberName, data.planName, data.groupName);
}

export function buildRemittanceConfirmedParams(data: {
  amount: string;
  groupName: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.amount, data.groupName);
}

export function buildRemittanceDisputedParams(data: {
  amount: string;
  groupName: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.amount, data.groupName);
}

export function buildSubscriptionExpiringParams(data: {
  planName: string;
  days: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.planName, data.days);
}

export function buildProxyClaimParams(data: {
  memberName: string;
  groupName: string;
  claimUrl: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.memberName, data.groupName, data.claimUrl);
}
