import { emailLayout, button, escapeHtml as h } from "./layout";

interface PaymentReceiptData {
  memberName: string;
  groupName: string;
  amount: string; // pre-formatted with formatAmount
  contributionType: string;
  paymentMethod: string;
  date: string;
  reference?: string;
  recordedBy: string;
  paymentsUrl: string;
}

export function paymentReceiptEmail(data: PaymentReceiptData, locale: "en" | "fr" = "en"): string {
  const isEn = locale === "en";

  const methodLabels: Record<string, Record<string, string>> = {
    cash: { en: "Cash", fr: "Espèces" },
    mobile_money: { en: "Mobile Money", fr: "Mobile Money" },
    bank_transfer: { en: "Bank Transfer", fr: "Virement bancaire" },
    online: { en: "Online", fr: "En ligne" },
  };

  const method = methodLabels[data.paymentMethod]?.[locale] || data.paymentMethod;

  const body = `
    <h1 style="margin:0 0 8px; font-size:24px; font-weight:700; color:#0f172a;">
      ${isEn ? "Payment Confirmed" : "Paiement confirmé"}
    </h1>
    <p style="margin:0 0 20px; font-size:15px; color:#475569;">
      ${isEn
        ? `Hi ${h(data.memberName)}, your payment has been recorded for <strong>${h(data.groupName)}</strong>.`
        : `Bonjour ${h(data.memberName)}, votre paiement a été enregistré pour <strong>${h(data.groupName)}</strong>.`}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border-radius:8px; padding:16px; margin:0 0 20px;">
      <tr>
        <td style="padding:8px 16px; font-size:13px; color:#64748b;">${isEn ? "Amount" : "Montant"}</td>
        <td style="padding:8px 16px; font-size:16px; font-weight:700; color:#1db981; text-align:right;">${h(data.amount)}</td>
      </tr>
      <tr>
        <td style="padding:8px 16px; font-size:13px; color:#64748b;">${isEn ? "Type" : "Type"}</td>
        <td style="padding:8px 16px; font-size:13px; font-weight:600; text-align:right;">${h(data.contributionType)}</td>
      </tr>
      <tr>
        <td style="padding:8px 16px; font-size:13px; color:#64748b;">${isEn ? "Method" : "Méthode"}</td>
        <td style="padding:8px 16px; font-size:13px; text-align:right;">${h(method)}</td>
      </tr>
      <tr>
        <td style="padding:8px 16px; font-size:13px; color:#64748b;">${isEn ? "Date" : "Date"}</td>
        <td style="padding:8px 16px; font-size:13px; text-align:right;">${h(data.date)}</td>
      </tr>
      ${data.reference ? `<tr>
        <td style="padding:8px 16px; font-size:13px; color:#64748b;">${isEn ? "Reference" : "Référence"}</td>
        <td style="padding:8px 16px; font-size:13px; text-align:right;">${h(data.reference)}</td>
      </tr>` : ""}
      <tr>
        <td style="padding:8px 16px; font-size:13px; color:#64748b;">${isEn ? "Recorded By" : "Enregistré par"}</td>
        <td style="padding:8px 16px; font-size:13px; text-align:right;">${h(data.recordedBy)}</td>
      </tr>
    </table>

    ${button(isEn ? "View Payment History" : "Voir l'historique des paiements", data.paymentsUrl)}
  `;

  return emailLayout(body, locale);
}

export function paymentReceiptSubject(amount: string, locale: "en" | "fr" = "en"): string {
  return locale === "fr"
    ? `Reçu de paiement — ${amount} — VillageClaq`
    : `Payment Receipt — ${amount} — VillageClaq`;
}
