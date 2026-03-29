import { emailLayout, button } from "./layout";

interface PaymentReminderData {
  memberName: string;
  groupName: string;
  amount: string; // pre-formatted
  contributionType: string;
  dueDate: string;
  daysOverdue?: number;
  paymentsUrl: string;
}

export function paymentReminderEmail(data: PaymentReminderData, locale: "en" | "fr" = "en"): string {
  const isEn = locale === "en";
  const isOverdue = (data.daysOverdue ?? 0) > 0;

  const title = isOverdue
    ? (isEn ? "Payment Overdue" : "Paiement en retard")
    : (isEn ? "Payment Reminder" : "Rappel de paiement");

  const urgencyColor = isOverdue ? "#ef4444" : "#f59e0b";

  const body = `
    <div style="padding:12px 16px; background:${urgencyColor}10; border-left:4px solid ${urgencyColor}; border-radius:4px; margin:0 0 20px;">
      <h1 style="margin:0; font-size:20px; font-weight:700; color:${urgencyColor};">${title}</h1>
    </div>
    <p style="margin:0 0 20px; font-size:15px; color:#475569; line-height:1.6;">
      ${isEn
        ? `Hi ${data.memberName}, ${isOverdue ? `your payment for <strong>${data.contributionType}</strong> is overdue by ${data.daysOverdue} days.` : `a payment for <strong>${data.contributionType}</strong> is due on ${data.dueDate}.`}`
        : `Bonjour ${data.memberName}, ${isOverdue ? `votre paiement pour <strong>${data.contributionType}</strong> est en retard de ${data.daysOverdue} jours.` : `un paiement pour <strong>${data.contributionType}</strong> est dû le ${data.dueDate}.`}`}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border-radius:8px; padding:16px; margin:0 0 20px;">
      <tr>
        <td style="padding:8px 16px; font-size:13px; color:#64748b;">${isEn ? "Amount Due" : "Montant dû"}</td>
        <td style="padding:8px 16px; font-size:16px; font-weight:700; color:${urgencyColor}; text-align:right;">${data.amount}</td>
      </tr>
      <tr>
        <td style="padding:8px 16px; font-size:13px; color:#64748b;">${isEn ? "Due Date" : "Date d'échéance"}</td>
        <td style="padding:8px 16px; font-size:13px; text-align:right;">${data.dueDate}</td>
      </tr>
      <tr>
        <td style="padding:8px 16px; font-size:13px; color:#64748b;">${isEn ? "Group" : "Groupe"}</td>
        <td style="padding:8px 16px; font-size:13px; text-align:right;">${data.groupName}</td>
      </tr>
    </table>

    ${button(isEn ? "View Outstanding Payments" : "Voir les paiements en attente", data.paymentsUrl)}
  `;

  return emailLayout(body, locale);
}

export function paymentReminderSubject(isOverdue: boolean, locale: "en" | "fr" = "en"): string {
  if (isOverdue) {
    return locale === "fr" ? "Paiement en retard — VillageClaq" : "Payment Overdue — VillageClaq";
  }
  return locale === "fr" ? "Rappel de paiement — VillageClaq" : "Payment Reminder — VillageClaq";
}
