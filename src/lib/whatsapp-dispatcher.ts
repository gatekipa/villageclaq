/**
 * WhatsApp notification dispatcher — maps notification types to templates.
 * Entry point for all WhatsApp notification sends.
 * NEVER throws — entire function is try/catch wrapped.
 */

import { sendWhatsAppMessage } from "@/lib/send-whatsapp";
import {
  WA_TEMPLATES,
  buildPaymentReceiptParams,
  buildPaymentReminderParams,
  buildEventReminderParams,
  buildHostingReminderParams,
  buildMinutesPublishedParams,
  buildReliefClaimApprovedParams,
  buildReliefClaimDeniedParams,
  buildAnnouncementParams,
  buildElectionOpenedParams,
  buildInvitationParams,
  buildLoanApprovedParams,
  buildLoanOverdueParams,
  buildFineIssuedParams,
  buildStandingChangedParams,
  buildWelcomeParams,
  buildHostingAssignmentParams,
  buildReliefEnrollmentParams,
  buildRemittanceConfirmedParams,
  buildRemittanceDisputedParams,
  buildSubscriptionExpiringParams,
  buildProxyClaimParams,
} from "@/lib/whatsapp-templates";
import { formatPhoneForWhatsApp } from "@/lib/format-phone-whatsapp";

// ─── Notification Type → Template Mapping ───────────────────────────────────

export type WhatsAppNotificationType =
  | "payment_receipt"
  | "payment_reminder"
  | "event_reminder"
  | "hosting_reminder"
  | "minutes_published"
  | "relief_claim_approved"
  | "relief_claim_denied"
  | "announcement"
  | "election_opened"
  | "invitation"
  | "loan_approved"
  | "loan_overdue"
  | "fine_issued"
  | "standing_changed"
  | "welcome"
  | "hosting_assignment"
  | "relief_enrollment"
  | "remittance_confirmed"
  | "remittance_disputed"
  | "subscription_expiring"
  | "proxy_claim";

const TYPE_TO_TEMPLATE: Record<WhatsAppNotificationType, string> = {
  payment_receipt: WA_TEMPLATES.PAYMENT_RECEIPT,
  payment_reminder: WA_TEMPLATES.PAYMENT_REMINDER,
  event_reminder: WA_TEMPLATES.EVENT_REMINDER,
  hosting_reminder: WA_TEMPLATES.HOSTING_REMINDER,
  minutes_published: WA_TEMPLATES.MINUTES_PUBLISHED,
  relief_claim_approved: WA_TEMPLATES.RELIEF_CLAIM_APPROVED,
  relief_claim_denied: WA_TEMPLATES.RELIEF_CLAIM_DENIED,
  announcement: WA_TEMPLATES.ANNOUNCEMENT,
  election_opened: WA_TEMPLATES.ELECTION_OPENED,
  invitation: WA_TEMPLATES.INVITATION,
  loan_approved: WA_TEMPLATES.LOAN_APPROVED,
  loan_overdue: WA_TEMPLATES.LOAN_OVERDUE,
  fine_issued: WA_TEMPLATES.FINE_ISSUED,
  standing_changed: WA_TEMPLATES.STANDING_CHANGED,
  welcome: WA_TEMPLATES.WELCOME,
  hosting_assignment: WA_TEMPLATES.HOSTING_ASSIGNMENT,
  relief_enrollment: WA_TEMPLATES.RELIEF_ENROLLMENT,
  remittance_confirmed: WA_TEMPLATES.REMITTANCE_CONFIRMED,
  remittance_disputed: WA_TEMPLATES.REMITTANCE_DISPUTED,
  subscription_expiring: WA_TEMPLATES.SUBSCRIPTION_EXPIRING,
  proxy_claim: WA_TEMPLATES.PROXY_CLAIM,
};

// ─── Component Builder ──────────────────────────────────────────────────────

function buildComponents(
  type: WhatsAppNotificationType,
  data: Record<string, string>,
) {
  const d = data;
  switch (type) {
    case "payment_receipt":
      return buildPaymentReceiptParams({
        memberName: d.memberName || "",
        amount: d.amount || "",
        contributionType: d.contributionType || d.type || "",
        groupName: d.groupName || "",
        date: d.date || "",
      });
    case "payment_reminder":
      return buildPaymentReminderParams({
        memberName: d.memberName || "",
        amount: d.amount || "",
        contributionType: d.contributionType || d.type || "",
        dueDate: d.dueDate || "",
        groupName: d.groupName || "",
      });
    case "event_reminder":
      return buildEventReminderParams({
        memberName: d.memberName || "",
        eventTitle: d.eventTitle || d.eventName || "",
        eventDate: d.eventDate || d.date || "",
        eventLocation: d.eventLocation || d.location || "",
        groupName: d.groupName || "",
      });
    case "hosting_reminder":
      return buildHostingReminderParams({
        memberName: d.memberName || "",
        hostingDate: d.hostingDate || d.date || "",
        groupName: d.groupName || "",
      });
    case "minutes_published":
      return buildMinutesPublishedParams({
        groupName: d.groupName || "",
        meetingTitle: d.meetingTitle || "",
        meetingDate: d.meetingDate || d.date || "",
      });
    case "relief_claim_approved":
      return buildReliefClaimApprovedParams({
        memberName: d.memberName || "",
        claimType: d.claimType || "",
        amount: d.amount || "",
        groupName: d.groupName || "",
      });
    case "relief_claim_denied":
      return buildReliefClaimDeniedParams({
        memberName: d.memberName || "",
        claimType: d.claimType || "",
        reason: d.reason || "",
        groupName: d.groupName || "",
      });
    case "announcement":
      return buildAnnouncementParams({
        groupName: d.groupName || "",
        title: d.title || d.announcementTitle || "",
        body: d.body || d.announcementBody || "",
      });
    case "election_opened":
      return buildElectionOpenedParams({
        groupName: d.groupName || "",
        electionTitle: d.electionTitle || "",
        positions: d.positions || "",
      });
    case "invitation":
      return buildInvitationParams({
        inviterName: d.inviterName || "",
        groupName: d.groupName || "",
        acceptUrl: d.acceptUrl || "",
      });
    case "loan_approved":
      return buildLoanApprovedParams({
        memberName: d.memberName || "",
        amount: d.amount || "",
        groupName: d.groupName || "",
      });
    case "loan_overdue":
      return buildLoanOverdueParams({
        memberName: d.memberName || "",
        amount: d.amount || "",
        dueDate: d.dueDate || "",
        groupName: d.groupName || "",
      });
    case "fine_issued":
      return buildFineIssuedParams({
        memberName: d.memberName || "",
        fineType: d.fineType || "",
        amount: d.amount || "",
        reason: d.reason || "",
        groupName: d.groupName || "",
      });
    case "standing_changed":
      return buildStandingChangedParams({
        memberName: d.memberName || "",
        newStanding: d.newStanding || "",
        groupName: d.groupName || "",
      });
    case "welcome":
      return buildWelcomeParams({
        memberName: d.memberName || "",
        groupName: d.groupName || "",
      });
    case "hosting_assignment":
      return buildHostingAssignmentParams({
        memberName: d.memberName || "",
        hostingDate: d.hostingDate || d.date || "",
        groupName: d.groupName || "",
      });
    case "relief_enrollment":
      return buildReliefEnrollmentParams({
        memberName: d.memberName || "",
        planName: d.planName || "",
        groupName: d.groupName || "",
      });
    case "remittance_confirmed":
      return buildRemittanceConfirmedParams({
        amount: d.amount || "",
        groupName: d.groupName || "",
      });
    case "remittance_disputed":
      return buildRemittanceDisputedParams({
        amount: d.amount || "",
        groupName: d.groupName || "",
      });
    case "subscription_expiring":
      return buildSubscriptionExpiringParams({
        planName: d.planName || "",
        days: d.days || "",
      });
    case "proxy_claim":
      return buildProxyClaimParams({
        memberName: d.memberName || "",
        groupName: d.groupName || "",
        claimUrl: d.claimUrl || "",
      });
    default:
      return [];
  }
}

// ─── Main Dispatcher ────────────────────────────────────────────────────────

/**
 * Dispatch a WhatsApp notification.
 * - Validates phone number
 * - Maps notification type to template
 * - Builds components from data
 * - Sends via Meta Cloud API
 * - NEVER throws
 */
export async function dispatchWhatsApp(
  type: WhatsAppNotificationType,
  recipientPhone: string,
  locale: string,
  data: Record<string, string>,
): Promise<boolean> {
  try {
    // Validate phone
    const formatted = formatPhoneForWhatsApp(recipientPhone);
    if (!formatted) {
      console.log(`[WhatsApp Dispatch] Invalid phone for ${type}: "${recipientPhone}"`);
      return false;
    }

    const templateName = TYPE_TO_TEMPLATE[type];
    if (!templateName) {
      console.log(`[WhatsApp Dispatch] Unknown type: "${type}"`);
      return false;
    }

    const components = buildComponents(type, data);

    const result = await sendWhatsAppMessage({
      to: recipientPhone,
      template: templateName,
      language: locale === "fr" ? "fr" : "en",
      components,
    });

    return result.success;
  } catch (err) {
    console.error(`[WhatsApp Dispatch] Exception for ${type}:`, err instanceof Error ? err.message : err);
    return false;
  }
}
