export function escapeHtml(unsafe: string): string {
  if (typeof unsafe !== 'string') return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function sanitizeUrl(url: string): string {
  if (!url) return '';
  const escaped = escapeHtml(url);
  if (!escaped.startsWith('https://')) {
    return '#';
  }
  return escaped;
}

export type TemplateKey =
  | 'announcement_broadcast'
  | 'dues_reminder'
  | 'loan_disbursed'
  | 'loan_repayment_receipt'
  | 'relief_claim_payout'
  | 'ticket_issued';

export interface RenderResult {
  subject: string;
  html: string;
  text: string;
}

export function renderTemplate(
  templateKey: TemplateKey,
  locale: 'en' | 'fr',
  data: Record<string, unknown>
): RenderResult {
  const safeStr = (key: string) => escapeHtml(String(data[key] || ''));
  const safeNum = (key: string) => escapeHtml(String(data[key] || 0));
  const safeUrl = (key: string) => sanitizeUrl(String(data[key] || ''));

  switch (templateKey) {
    case 'announcement_broadcast': {
      const subject = locale === 'fr' 
        ? `Annonce de ${safeStr('groupName')}: ${safeStr('titleFr') || safeStr('title')}`
        : `Announcement from ${safeStr('groupName')}: ${safeStr('title')}`;
      
      const body = locale === 'fr' ? (safeStr('bodyFr') || safeStr('body')) : safeStr('body');
      const sender = safeStr('senderName');

      return {
        subject,
        html: `<div><p><strong>${subject}</strong></p><p>${body}</p><p>-- <br/>${sender}</p></div>`,
        text: `${subject}\n\n${body}\n\n-- \n${sender}`
      };
    }
    case 'dues_reminder': {
      const name = safeStr('memberName');
      const amount = safeNum('amount');
      const currency = safeStr('currency');
      const date = safeStr('dueDate');
      const link = safeUrl('paymentLink');

      const subject = locale === 'fr' ? 'Rappel de cotisation' : 'Dues Reminder';
      const html = locale === 'fr'
        ? `<p>Bonjour ${name},</p><p>Ceci est un rappel pour votre cotisation de ${amount} ${currency} due le ${date}.</p><a href="${link}">Payer maintenant</a>`
        : `<p>Hello ${name},</p><p>This is a reminder for your dues of ${amount} ${currency} due on ${date}.</p><a href="${link}">Pay Now</a>`;
      const text = locale === 'fr'
        ? `Bonjour ${name},\nCeci est un rappel pour votre cotisation de ${amount} ${currency} due le ${date}.\nPayer maintenant: ${link}`
        : `Hello ${name},\nThis is a reminder for your dues of ${amount} ${currency} due on ${date}.\nPay Now: ${link}`;

      return { subject, html, text };
    }
    case 'loan_disbursed': {
      const name = safeStr('memberName');
      const amount = safeNum('principalAmount');
      const currency = safeStr('currency');
      const link = safeUrl('repaymentScheduleLink');

      const subject = locale === 'fr' ? 'Prêt décaissé' : 'Loan Disbursed';
      const html = locale === 'fr'
        ? `<p>Bonjour ${name},</p><p>Votre prêt de ${amount} ${currency} a été décaissé.</p><a href="${link}">Voir l'échéancier</a>`
        : `<p>Hello ${name},</p><p>Your loan of ${amount} ${currency} has been disbursed.</p><a href="${link}">View Schedule</a>`;
      const text = locale === 'fr'
        ? `Bonjour ${name},\nVotre prêt de ${amount} ${currency} a été décaissé.\nVoir l'échéancier: ${link}`
        : `Hello ${name},\nYour loan of ${amount} ${currency} has been disbursed.\nView Schedule: ${link}`;
      return { subject, html, text };
    }
    case 'loan_repayment_receipt': {
      const name = safeStr('memberName');
      const amount = safeNum('amountPaid');
      const balance = safeNum('remainingBalance');
      const currency = safeStr('currency');
      const ref = safeStr('receiptRef');

      const subject = locale === 'fr' ? 'Reçu de remboursement de prêt' : 'Loan Repayment Receipt';
      const html = locale === 'fr'
        ? `<p>Bonjour ${name},</p><p>Nous avons bien reçu votre paiement de ${amount} ${currency} (Réf: ${ref}). Il vous reste ${balance} ${currency} à payer.</p>`
        : `<p>Hello ${name},</p><p>We have received your payment of ${amount} ${currency} (Ref: ${ref}). Your remaining balance is ${balance} ${currency}.</p>`;
      const text = locale === 'fr'
        ? `Bonjour ${name},\nNous avons bien reçu votre paiement de ${amount} ${currency} (Réf: ${ref}). Il vous reste ${balance} ${currency} à payer.`
        : `Hello ${name},\nWe have received your payment of ${amount} ${currency} (Ref: ${ref}). Your remaining balance is ${balance} ${currency}.`;
      return { subject, html, text };
    }
    case 'relief_claim_payout': {
      const name = safeStr('memberName');
      const plan = safeStr('planName');
      const amount = safeNum('approvedAmount');
      const currency = safeStr('currency');
      const date = safeStr('disbursementDate');

      const subject = locale === 'fr' ? 'Paiement de demande de secours' : 'Relief Claim Payout';
      const html = locale === 'fr'
        ? `<p>Bonjour ${name},</p><p>Votre demande pour le plan "${plan}" a été approuvée. Un paiement de ${amount} ${currency} a été effectué le ${date}.</p>`
        : `<p>Hello ${name},</p><p>Your claim for the "${plan}" plan has been approved. A payout of ${amount} ${currency} was made on ${date}.</p>`;
      const text = locale === 'fr'
        ? `Bonjour ${name},\nVotre demande pour le plan "${plan}" a été approuvée. Un paiement de ${amount} ${currency} a été effectué le ${date}.`
        : `Hello ${name},\nYour claim for the "${plan}" plan has been approved. A payout of ${amount} ${currency} was made on ${date}.`;
      return { subject, html, text };
    }
    case 'ticket_issued': {
      const name = safeStr('memberName');
      const title = safeStr('eventTitle');
      const tier = safeStr('tierName');
      const qty = safeNum('quantity');
      const dateLoc = safeStr('eventDateLoc');

      const subject = locale === 'fr' ? 'Billet émis' : 'Ticket Issued';
      const html = locale === 'fr'
        ? `<p>Bonjour ${name},</p><p>Voici votre billet pour ${title} (${qty}x ${tier}).</p><p>Date/Lieu: ${dateLoc}</p>`
        : `<p>Hello ${name},</p><p>Here is your ticket for ${title} (${qty}x ${tier}).</p><p>Date/Location: ${dateLoc}</p>`;
      const text = locale === 'fr'
        ? `Bonjour ${name},\nVoici votre billet pour ${title} (${qty}x ${tier}).\nDate/Lieu: ${dateLoc}`
        : `Hello ${name},\nHere is your ticket for ${title} (${qty}x ${tier}).\nDate/Location: ${dateLoc}`;
      return { subject, html, text };
    }
    default:
      return {
        subject: 'Notification',
        html: `<p>${safeStr('body')}</p>`,
        text: safeStr('body')
      };
  }
}
