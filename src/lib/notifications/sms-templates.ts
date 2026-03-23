// ─── SMS Templates (160 char max) ───────────────────────────────────────────

type Locale = 'en' | 'fr';

function t(locale: Locale, en: string, fr: string): string {
  return locale === 'fr' ? fr : en;
}

// ─── Payment Reminder ───────────────────────────────────────────────────────

interface PaymentReminderSmsParams {
  groupName: string;
  amount: number;
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
  date: string;
  location: string;
  locale: Locale;
}

export function eventReminderSms(params: EventReminderSmsParams): string {
  const { groupName, date, location, locale } = params;
  return t(
    locale,
    `[VillageClaq] ${groupName} event on ${date} at ${location}. Don't forget to attend!`,
    `[VillageClaq] Evenement ${groupName} le ${date} a ${location}. N'oubliez pas d'y assister!`
  ).slice(0, 160);
}

// ─── Payment Receipt ────────────────────────────────────────────────────────

interface PaymentReceiptSmsParams {
  groupName: string;
  amount: number;
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
