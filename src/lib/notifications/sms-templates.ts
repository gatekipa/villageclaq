// ─── SMS Templates (160 char max for single SMS) ────────────────────────────
// All templates are bilingual (EN/FR) and truncated to 160 chars.
// Money values should be pre-formatted with formatAmount() before passing in.

type Locale = "en" | "fr";

function t(locale: Locale, en: string, fr: string): string {
  return locale === "fr" ? fr : en;
}

// ─── Payment Reminder ───────────────────────────────────────────────────────

interface PaymentReminderSmsParams {
  groupName: string;
  amount: string; // pre-formatted with formatAmount()
  type: string;
  locale: Locale;
}

export function paymentReminderSms(params: PaymentReminderSmsParams): string {
  const { groupName, amount, type, locale } = params;
  return t(
    locale,
    `[VillageClaq] ${groupName}: ${type} of ${amount} is due. Please pay to stay in good standing.`,
    `[VillageClaq] ${groupName}: ${type} de ${amount} est du. Veuillez payer pour rester en regle.`
  ).slice(0, 160);
}

// ─── Event Reminder ─────────────────────────────────────────────────────────

interface EventReminderSmsParams {
  groupName: string;
  eventName: string;
  date: string;
  location: string;
  locale: Locale;
}

export function eventReminderSms(params: EventReminderSmsParams): string {
  const { groupName, eventName, date, location, locale } = params;
  const loc = location ? ` at ${location}` : "";
  const locFr = location ? ` a ${location}` : "";
  return t(
    locale,
    `[VillageClaq] ${groupName}: ${eventName} on ${date}${loc}. Don't forget to attend!`,
    `[VillageClaq] ${groupName}: ${eventName} le ${date}${locFr}. N'oubliez pas!`
  ).slice(0, 160);
}

// ─── Payment Receipt ────────────────────────────────────────────────────────

interface PaymentReceiptSmsParams {
  groupName: string;
  amount: string; // pre-formatted with formatAmount()
  type: string;
  locale: Locale;
}

export function paymentReceiptSms(params: PaymentReceiptSmsParams): string {
  const { groupName, amount, type, locale } = params;
  return t(
    locale,
    `[VillageClaq] ${groupName}: Your ${type} payment of ${amount} has been recorded. Thank you!`,
    `[VillageClaq] ${groupName}: Votre paiement ${type} de ${amount} a ete enregistre. Merci!`
  ).slice(0, 160);
}

// ─── Welcome ────────────────────────────────────────────────────────────────

interface WelcomeSmsParams {
  groupName: string;
  memberName: string;
  locale: Locale;
}

export function welcomeSms(params: WelcomeSmsParams): string {
  const { groupName, memberName, locale } = params;
  return t(
    locale,
    `[VillageClaq] Welcome ${memberName}! You've joined ${groupName}. Open VillageClaq to get started.`,
    `[VillageClaq] Bienvenue ${memberName}! Vous avez rejoint ${groupName}. Ouvrez VillageClaq pour commencer.`
  ).slice(0, 160);
}

// ─── Minutes Published ──────────────────────────────────────────────────────

interface MinutesPublishedSmsParams {
  groupName: string;
  meetingTitle: string;
  locale: Locale;
}

export function minutesPublishedSms(params: MinutesPublishedSmsParams): string {
  const { groupName, meetingTitle, locale } = params;
  return t(
    locale,
    `[VillageClaq] ${groupName}: Minutes for "${meetingTitle}" are now available. Check the app to review.`,
    `[VillageClaq] ${groupName}: Le PV de "${meetingTitle}" est disponible. Consultez l'app pour lire.`
  ).slice(0, 160);
}

// ─── Payment Pending Confirmation ───────────────────────────────────────────

interface PaymentPendingSmsParams {
  groupName: string;
  memberName: string;
  amount: string; // pre-formatted with formatAmount()
  locale: Locale;
}

export function paymentPendingSms(params: PaymentPendingSmsParams): string {
  const { groupName, memberName, amount, locale } = params;
  return t(
    locale,
    `[VillageClaq] ${groupName}: ${memberName} submitted a payment of ${amount}. Please confirm in the app.`,
    `[VillageClaq] ${groupName}: ${memberName} a soumis un paiement de ${amount}. Veuillez confirmer dans l'app.`
  ).slice(0, 160);
}

// ─── Hosting Reminder ───────────────────────────────────────────────────────

interface HostingReminderSmsParams {
  groupName: string;
  date: string;
  location: string;
  locale: Locale;
}

export function hostingReminderSms(params: HostingReminderSmsParams): string {
  const { groupName, date, location, locale } = params;
  return t(
    locale,
    `[VillageClaq] ${groupName}: You are hosting on ${date} at ${location}. Please prepare!`,
    `[VillageClaq] ${groupName}: Vous accueillez le ${date} a ${location}. Veuillez preparer!`
  ).slice(0, 160);
}

// ─── Standing Changed ───────────────────────────────────────────────────────

interface StandingChangedSmsParams {
  groupName: string;
  newStatus: string;
  locale: Locale;
}

export function standingChangedSms(params: StandingChangedSmsParams): string {
  const { groupName, newStatus, locale } = params;
  return t(
    locale,
    `[VillageClaq] ${groupName}: Your standing changed to ${newStatus}. Check the app for details.`,
    `[VillageClaq] ${groupName}: Votre statut est devenu ${newStatus}. Verifiez l'app pour details.`
  ).slice(0, 160);
}

// ─── Hosting Assignment ────────────────────────────────────────────────────

interface HostingAssignmentSmsParams {
  groupName: string;
  date: string;
  locale: Locale;
}

export function hostingAssignmentSms(params: HostingAssignmentSmsParams): string {
  const { groupName, date, locale } = params;
  return t(
    locale,
    `[VillageClaq] ${groupName}: You've been assigned to host on ${date}. Check the app for details.`,
    `[VillageClaq] ${groupName}: Vous etes assigne pour accueillir le ${date}. Verifiez l'app.`
  ).slice(0, 160);
}

// ─── Relief Enrollment ─────────────────────────────────────────────────────

interface ReliefEnrollmentSmsParams {
  groupName: string;
  planName: string;
  locale: Locale;
}

export function reliefEnrollmentSms(params: ReliefEnrollmentSmsParams): string {
  const { groupName, planName, locale } = params;
  return t(
    locale,
    `[VillageClaq] ${groupName}: You've been enrolled in ${planName}. Check the app for details.`,
    `[VillageClaq] ${groupName}: Vous etes inscrit au ${planName}. Verifiez l'app pour details.`
  ).slice(0, 160);
}

// ─── Remittance Status ─────────────────────────────────────────────────────

interface RemittanceStatusSmsParams {
  groupName: string;
  amount: string;
  status: string; // "confirmed" | "disputed"
  locale: Locale;
}

export function remittanceStatusSms(params: RemittanceStatusSmsParams): string {
  const { groupName, amount, status, locale } = params;
  if (status === "confirmed") {
    return t(
      locale,
      `[VillageClaq] ${groupName}: Your remittance of ${amount} has been confirmed by HQ.`,
      `[VillageClaq] ${groupName}: Votre versement de ${amount} a ete confirme par le siege.`
    ).slice(0, 160);
  }
  return t(
    locale,
    `[VillageClaq] ${groupName}: Your remittance of ${amount} has been disputed. Contact leadership.`,
    `[VillageClaq] ${groupName}: Votre versement de ${amount} a ete conteste. Contactez la direction.`
  ).slice(0, 160);
}

// ─── Subscription Expiring ─────────────────────────────────────────────────

interface SubscriptionExpiringSmsParams {
  planName: string;
  days: string;
  locale: Locale;
}

export function subscriptionExpiringSms(params: SubscriptionExpiringSmsParams): string {
  const { planName, days, locale } = params;
  return t(
    locale,
    `[VillageClaq] Your ${planName} subscription expires in ${days} days. Renew to keep your features.`,
    `[VillageClaq] Votre abonnement ${planName} expire dans ${days} jours. Renouvelez pour garder vos fonctions.`
  ).slice(0, 160);
}

// ─── Relief Claim Approved ─────────────────────────────────────────────────

interface ReliefClaimApprovedSmsParams {
  groupName: string;
  amount: string;
  locale: Locale;
}

export function reliefClaimApprovedSms(params: ReliefClaimApprovedSmsParams): string {
  const { groupName, amount, locale } = params;
  return t(
    locale,
    `[VillageClaq] ${groupName}: Your relief claim has been approved. Payout: ${amount}.`,
    `[VillageClaq] ${groupName}: Votre demande de secours a ete approuvee. Versement: ${amount}.`
  ).slice(0, 160);
}

// ─── Relief Claim Denied ───────────────────────────────────────────────────

interface ReliefClaimDeniedSmsParams {
  groupName: string;
  reason: string;
  locale: Locale;
}

export function reliefClaimDeniedSms(params: ReliefClaimDeniedSmsParams): string {
  const { groupName, reason, locale } = params;
  return t(
    locale,
    `[VillageClaq] ${groupName}: Your relief claim was denied. Reason: ${reason}`,
    `[VillageClaq] ${groupName}: Votre demande de secours a ete refusee. Raison: ${reason}`
  ).slice(0, 160);
}

// ─── Announcement ──────────────────────────────────────────────────────────

interface AnnouncementSmsParams {
  groupName: string;
  title: string;
  locale: Locale;
}

export function announcementSms(params: AnnouncementSmsParams): string {
  const { groupName, title, locale } = params;
  return t(
    locale,
    `[VillageClaq] ${groupName}: New announcement — ${title}. Open the app to read.`,
    `[VillageClaq] ${groupName}: Nouvelle annonce — ${title}. Ouvrez l'app pour lire.`
  ).slice(0, 160);
}

// ─── Loan Approved ─────────────────────────────────────────────────────────

interface LoanApprovedSmsParams {
  groupName: string;
  amount: string;
  locale: Locale;
}

export function loanApprovedSms(params: LoanApprovedSmsParams): string {
  const { groupName, amount, locale } = params;
  return t(
    locale,
    `[VillageClaq] ${groupName}: Your loan of ${amount} has been approved. Check the app for details.`,
    `[VillageClaq] ${groupName}: Votre pret de ${amount} a ete approuve. Verifiez l'app pour details.`
  ).slice(0, 160);
}

// ─── Fine Issued ───────────────────────────────────────────────────────────

interface FineIssuedSmsParams {
  groupName: string;
  amount: string;
  reason: string;
  locale: Locale;
}

export function fineIssuedSms(params: FineIssuedSmsParams): string {
  const { groupName, amount, reason, locale } = params;
  return t(
    locale,
    `[VillageClaq] ${groupName}: A fine of ${amount} was issued. Reason: ${reason}`,
    `[VillageClaq] ${groupName}: Une amende de ${amount} a ete emise. Raison: ${reason}`
  ).slice(0, 160);
}
