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
