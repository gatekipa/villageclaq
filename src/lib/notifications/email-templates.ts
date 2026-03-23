// ─── Email Template Helpers ──────────────────────────────────────────────────

type Locale = 'en' | 'fr';

function t(locale: Locale, en: string, fr: string): string {
  return locale === 'fr' ? fr : en;
}

function formatCurrency(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString()}`;
}

function wrapInLayout(locale: Locale, content: string): string {
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VillageClaq</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:#059669;padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">VillageClaq</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;">
                ${t(locale, 'Powered by', 'Propuls\u00e9 par')} <strong>VillageClaq</strong> &mdash; <a href="https://villageclaq.com" style="color:#059669;text-decoration:none;">villageclaq.com</a>
              </p>
              <p style="margin:0;color:#94a3b8;font-size:11px;">
                ${t(
                  locale,
                  'You received this email because of your notification settings. You can update your preferences in your account settings.',
                  'Vous avez re\u00e7u cet email en raison de vos param\u00e8tres de notification. Vous pouvez modifier vos pr\u00e9f\u00e9rences dans les param\u00e8tres de votre compte.'
                )}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function primaryButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 24px;background-color:#059669;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;margin-top:16px;">${label}</a>`;
}

// ─── Payment Receipt ────────────────────────────────────────────────────────

interface PaymentReceiptEmailParams {
  memberName: string;
  amount: number;
  currency: string;
  date: string;
  method: string;
  groupName: string;
  locale: Locale;
}

export function paymentReceiptEmail(params: PaymentReceiptEmailParams): string {
  const { memberName, amount, currency, date, method, groupName, locale } = params;

  const content = `
    <h2 style="margin:0 0 16px 0;color:#0f172a;font-size:20px;">
      ${t(locale, 'Payment Receipt', 'Re\u00e7u de paiement')}
    </h2>
    <p style="margin:0 0 16px 0;color:#334155;font-size:14px;line-height:1.6;">
      ${t(locale, `Hello ${memberName},`, `Bonjour ${memberName},`)}
    </p>
    <p style="margin:0 0 24px 0;color:#334155;font-size:14px;line-height:1.6;">
      ${t(
        locale,
        `Your payment to <strong>${groupName}</strong> has been recorded successfully.`,
        `Votre paiement \u00e0 <strong>${groupName}</strong> a \u00e9t\u00e9 enregistr\u00e9 avec succ\u00e8s.`
      )}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:6px;padding:16px;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:4px 0;color:#64748b;font-size:13px;">${t(locale, 'Amount', 'Montant')}</td>
              <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;text-align:right;">${formatCurrency(amount, currency)}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#64748b;font-size:13px;">${t(locale, 'Date', 'Date')}</td>
              <td style="padding:4px 0;color:#0f172a;font-size:13px;text-align:right;">${date}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#64748b;font-size:13px;">${t(locale, 'Method', 'M\u00e9thode')}</td>
              <td style="padding:4px 0;color:#0f172a;font-size:13px;text-align:right;">${method}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#64748b;font-size:13px;">${t(locale, 'Group', 'Groupe')}</td>
              <td style="padding:4px 0;color:#0f172a;font-size:13px;text-align:right;">${groupName}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#64748b;font-size:13px;">
      ${t(locale, 'Thank you for your contribution!', 'Merci pour votre contribution !')}
    </p>
  `;

  return wrapInLayout(locale, content);
}

// ─── Payment Reminder ───────────────────────────────────────────────────────

interface PaymentReminderEmailParams {
  memberName: string;
  amount: number;
  currency: string;
  dueDate: string;
  daysOverdue: number;
  payLink: string;
  groupName: string;
  locale: Locale;
}

export function paymentReminderEmail(params: PaymentReminderEmailParams): string {
  const { memberName, amount, currency, dueDate, daysOverdue, payLink, groupName, locale } = params;

  const urgencyColor = daysOverdue > 14 ? '#dc2626' : daysOverdue > 7 ? '#f59e0b' : '#059669';

  const content = `
    <h2 style="margin:0 0 16px 0;color:#0f172a;font-size:20px;">
      ${t(locale, 'Payment Reminder', 'Rappel de paiement')}
    </h2>
    <p style="margin:0 0 16px 0;color:#334155;font-size:14px;line-height:1.6;">
      ${t(locale, `Hello ${memberName},`, `Bonjour ${memberName},`)}
    </p>
    <p style="margin:0 0 16px 0;color:#334155;font-size:14px;line-height:1.6;">
      ${t(
        locale,
        `This is a reminder that your payment of <strong>${formatCurrency(amount, currency)}</strong> to <strong>${groupName}</strong> was due on <strong>${dueDate}</strong>.`,
        `Ceci est un rappel que votre paiement de <strong>${formatCurrency(amount, currency)}</strong> \u00e0 <strong>${groupName}</strong> \u00e9tait d\u00fb le <strong>${dueDate}</strong>.`
      )}
    </p>
    ${
      daysOverdue > 0
        ? `<p style="margin:0 0 24px 0;color:${urgencyColor};font-size:14px;font-weight:600;">
            ${t(locale, `${daysOverdue} day(s) overdue`, `${daysOverdue} jour(s) de retard`)}
          </p>`
        : ''
    }
    <div style="text-align:center;">
      ${primaryButton(payLink, t(locale, 'Make Payment', 'Effectuer le paiement'))}
    </div>
  `;

  return wrapInLayout(locale, content);
}

// ─── Event Reminder ─────────────────────────────────────────────────────────

interface EventReminderEmailParams {
  memberName: string;
  eventTitle: string;
  date: string;
  time: string;
  location: string;
  rsvpLink: string;
  groupName: string;
  locale: Locale;
}

export function eventReminderEmail(params: EventReminderEmailParams): string {
  const { memberName, eventTitle, date, time, location, rsvpLink, groupName, locale } = params;

  const content = `
    <h2 style="margin:0 0 16px 0;color:#0f172a;font-size:20px;">
      ${t(locale, 'Upcoming Event', '\u00c9v\u00e9nement \u00e0 venir')}
    </h2>
    <p style="margin:0 0 16px 0;color:#334155;font-size:14px;line-height:1.6;">
      ${t(locale, `Hello ${memberName},`, `Bonjour ${memberName},`)}
    </p>
    <p style="margin:0 0 24px 0;color:#334155;font-size:14px;line-height:1.6;">
      ${t(
        locale,
        `You have an upcoming event with <strong>${groupName}</strong>.`,
        `Vous avez un \u00e9v\u00e9nement \u00e0 venir avec <strong>${groupName}</strong>.`
      )}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:6px;padding:16px;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:4px 0;color:#64748b;font-size:13px;">${t(locale, 'Event', '\u00c9v\u00e9nement')}</td>
              <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;text-align:right;">${eventTitle}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#64748b;font-size:13px;">${t(locale, 'Date', 'Date')}</td>
              <td style="padding:4px 0;color:#0f172a;font-size:13px;text-align:right;">${date}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#64748b;font-size:13px;">${t(locale, 'Time', 'Heure')}</td>
              <td style="padding:4px 0;color:#0f172a;font-size:13px;text-align:right;">${time}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#64748b;font-size:13px;">${t(locale, 'Location', 'Lieu')}</td>
              <td style="padding:4px 0;color:#0f172a;font-size:13px;text-align:right;">${location}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <div style="text-align:center;">
      ${primaryButton(rsvpLink, t(locale, 'View Event & RSVP', 'Voir l\'\u00e9v\u00e9nement et RSVP'))}
    </div>
  `;

  return wrapInLayout(locale, content);
}

// ─── Minutes Published ──────────────────────────────────────────────────────

interface MinutesPublishedEmailParams {
  memberName: string;
  eventTitle: string;
  date: string;
  summaryPreview: string;
  viewLink: string;
  groupName: string;
  locale: Locale;
}

export function minutesPublishedEmail(params: MinutesPublishedEmailParams): string {
  const { memberName, eventTitle, date, summaryPreview, viewLink, groupName, locale } = params;

  const content = `
    <h2 style="margin:0 0 16px 0;color:#0f172a;font-size:20px;">
      ${t(locale, 'Meeting Minutes Published', 'Compte rendu publi\u00e9')}
    </h2>
    <p style="margin:0 0 16px 0;color:#334155;font-size:14px;line-height:1.6;">
      ${t(locale, `Hello ${memberName},`, `Bonjour ${memberName},`)}
    </p>
    <p style="margin:0 0 16px 0;color:#334155;font-size:14px;line-height:1.6;">
      ${t(
        locale,
        `The minutes for <strong>${eventTitle}</strong> (${date}) from <strong>${groupName}</strong> have been published.`,
        `Le compte rendu de <strong>${eventTitle}</strong> (${date}) de <strong>${groupName}</strong> a \u00e9t\u00e9 publi\u00e9.`
      )}
    </p>
    <div style="background-color:#f8fafc;border-left:3px solid #059669;padding:12px 16px;margin-bottom:24px;border-radius:0 6px 6px 0;">
      <p style="margin:0;color:#334155;font-size:13px;line-height:1.5;font-style:italic;">
        ${summaryPreview}
      </p>
    </div>
    <div style="text-align:center;">
      ${primaryButton(viewLink, t(locale, 'Read Full Minutes', 'Lire le compte rendu complet'))}
    </div>
  `;

  return wrapInLayout(locale, content);
}

// ─── Welcome to Group ───────────────────────────────────────────────────────

interface WelcomeToGroupEmailParams {
  memberName: string;
  groupName: string;
  adminMessage: string;
  getStartedLink: string;
  locale: Locale;
}

export function welcomeToGroupEmail(params: WelcomeToGroupEmailParams): string {
  const { memberName, groupName, adminMessage, getStartedLink, locale } = params;

  const content = `
    <h2 style="margin:0 0 16px 0;color:#0f172a;font-size:20px;">
      ${t(locale, `Welcome to ${groupName}!`, `Bienvenue dans ${groupName} !`)}
    </h2>
    <p style="margin:0 0 16px 0;color:#334155;font-size:14px;line-height:1.6;">
      ${t(locale, `Hello ${memberName},`, `Bonjour ${memberName},`)}
    </p>
    <p style="margin:0 0 16px 0;color:#334155;font-size:14px;line-height:1.6;">
      ${t(
        locale,
        `You have been added to <strong>${groupName}</strong> on VillageClaq. Here is a message from the group admin:`,
        `Vous avez \u00e9t\u00e9 ajout\u00e9(e) \u00e0 <strong>${groupName}</strong> sur VillageClaq. Voici un message de l'administrateur du groupe :`
      )}
    </p>
    <div style="background-color:#f0fdf4;border-left:3px solid #059669;padding:12px 16px;margin-bottom:24px;border-radius:0 6px 6px 0;">
      <p style="margin:0;color:#334155;font-size:13px;line-height:1.5;">
        ${adminMessage}
      </p>
    </div>
    <div style="text-align:center;">
      ${primaryButton(getStartedLink, t(locale, 'Get Started', 'Commencer'))}
    </div>
  `;

  return wrapInLayout(locale, content);
}

// ─── Relief Claim Update ────────────────────────────────────────────────────

interface ReliefClaimUpdateEmailParams {
  memberName: string;
  claimStatus: string;
  amount: number;
  currency: string;
  notes: string;
  groupName: string;
  locale: Locale;
}

export function reliefClaimUpdateEmail(params: ReliefClaimUpdateEmailParams): string {
  const { memberName, claimStatus, amount, currency, notes, groupName, locale } = params;

  const statusColors: Record<string, string> = {
    approved: '#059669',
    denied: '#dc2626',
    pending: '#f59e0b',
    paid: '#059669',
  };

  const statusColor = statusColors[claimStatus.toLowerCase()] ?? '#64748b';

  const content = `
    <h2 style="margin:0 0 16px 0;color:#0f172a;font-size:20px;">
      ${t(locale, 'Relief Claim Update', 'Mise \u00e0 jour de la demande de secours')}
    </h2>
    <p style="margin:0 0 16px 0;color:#334155;font-size:14px;line-height:1.6;">
      ${t(locale, `Hello ${memberName},`, `Bonjour ${memberName},`)}
    </p>
    <p style="margin:0 0 16px 0;color:#334155;font-size:14px;line-height:1.6;">
      ${t(
        locale,
        `Your relief claim with <strong>${groupName}</strong> has been updated.`,
        `Votre demande de secours aupr\u00e8s de <strong>${groupName}</strong> a \u00e9t\u00e9 mise \u00e0 jour.`
      )}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:6px;padding:16px;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:4px 0;color:#64748b;font-size:13px;">${t(locale, 'Status', 'Statut')}</td>
              <td style="padding:4px 0;font-size:13px;font-weight:600;text-align:right;color:${statusColor};">${claimStatus.toUpperCase()}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#64748b;font-size:13px;">${t(locale, 'Amount', 'Montant')}</td>
              <td style="padding:4px 0;color:#0f172a;font-size:13px;text-align:right;">${formatCurrency(amount, currency)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${
      notes
        ? `<div style="background-color:#f8fafc;border-left:3px solid ${statusColor};padding:12px 16px;margin-bottom:24px;border-radius:0 6px 6px 0;">
            <p style="margin:0 0 4px 0;color:#64748b;font-size:12px;font-weight:600;">${t(locale, 'Notes', 'Notes')}</p>
            <p style="margin:0;color:#334155;font-size:13px;line-height:1.5;">${notes}</p>
          </div>`
        : ''
    }
  `;

  return wrapInLayout(locale, content);
}

// ─── Standing Changed ───────────────────────────────────────────────────────

interface StandingChangedEmailParams {
  memberName: string;
  oldStatus: string;
  newStatus: string;
  actionNeeded: string;
  groupName: string;
  locale: Locale;
}

export function standingChangedEmail(params: StandingChangedEmailParams): string {
  const { memberName, oldStatus, newStatus, actionNeeded, groupName, locale } = params;

  const content = `
    <h2 style="margin:0 0 16px 0;color:#0f172a;font-size:20px;">
      ${t(locale, 'Membership Standing Update', 'Mise \u00e0 jour du statut de membre')}
    </h2>
    <p style="margin:0 0 16px 0;color:#334155;font-size:14px;line-height:1.6;">
      ${t(locale, `Hello ${memberName},`, `Bonjour ${memberName},`)}
    </p>
    <p style="margin:0 0 16px 0;color:#334155;font-size:14px;line-height:1.6;">
      ${t(
        locale,
        `Your membership standing in <strong>${groupName}</strong> has changed from <strong>${oldStatus}</strong> to <strong>${newStatus}</strong>.`,
        `Votre statut de membre dans <strong>${groupName}</strong> est pass\u00e9 de <strong>${oldStatus}</strong> \u00e0 <strong>${newStatus}</strong>.`
      )}
    </p>
    ${
      actionNeeded
        ? `<div style="background-color:#fef3c7;border-left:3px solid #f59e0b;padding:12px 16px;margin-bottom:24px;border-radius:0 6px 6px 0;">
            <p style="margin:0 0 4px 0;color:#92400e;font-size:12px;font-weight:600;">${t(locale, 'Action Needed', 'Action requise')}</p>
            <p style="margin:0;color:#334155;font-size:13px;line-height:1.5;">${actionNeeded}</p>
          </div>`
        : ''
    }
  `;

  return wrapInLayout(locale, content);
}
