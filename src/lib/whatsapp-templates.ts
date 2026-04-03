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
  PAYMENT_RECEIPT: "villageclaq_payment_receipt",
  PAYMENT_REMINDER: "villageclaq_payment_reminder",
  EVENT_REMINDER: "villageclaq_event_reminder",
  HOSTING_REMINDER: "villageclaq_hosting_reminder",
  MINUTES_PUBLISHED: "villageclaq_minutes_published",
  RELIEF_CLAIM_APPROVED: "villageclaq_relief_claim_approved",
  RELIEF_CLAIM_DENIED: "villageclaq_relief_claim_denied",
  ANNOUNCEMENT: "villageclaq_announcement",
  ELECTION_OPENED: "villageclaq_election_opened",
  INVITATION: "villageclaq_invitation",
  LOAN_APPROVED: "villageclaq_loan_approved",
  LOAN_OVERDUE: "villageclaq_loan_overdue",
  FINE_ISSUED: "villageclaq_fine_issued",
  STANDING_CHANGED: "villageclaq_standing_changed",
  WELCOME: "villageclaq_welcome",
  HOSTING_ASSIGNMENT: "villageclaq_hosting_assignment",
  RELIEF_ENROLLMENT: "villageclaq_relief_enrollment",
  REMITTANCE_CONFIRMED: "villageclaq_remittance_confirmed",
  REMITTANCE_DISPUTED: "villageclaq_remittance_disputed",
  SUBSCRIPTION_EXPIRING: "villageclaq_subscription_expiring",
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

export function buildFineIssuedParams(data: {
  memberName: string;
  fineType: string;
  amount: string;
  reason: string;
  groupName: string;
}): WhatsAppTemplateComponent[] {
  return bodyParams(data.memberName, data.fineType, data.amount, data.reason, data.groupName);
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
