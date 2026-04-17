import { emailLayout, button, escapeHtml as h } from "./layout";

interface ProxyClaimData {
  memberName: string;
  groupName: string;
  claimUrl: string;
  expiresAt: string;
}

export function proxyClaimEmail(
  data: ProxyClaimData,
  locale: "en" | "fr" = "en"
): string {
  const isEn = locale === "en";

  const expiryDate = new Date(data.expiresAt).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const body = `
    <h1 style="margin:0 0 8px; font-size:24px; font-weight:700; color:#0f172a;">
      ${isEn
        ? "Claim Your Membership"
        : "Réclamez votre adhésion"}
    </h1>
    <p style="margin:0 0 20px; font-size:15px; color:#475569; line-height:1.6;">
      ${isEn
        ? `Hello <strong>${h(data.memberName)}</strong>,`
        : `Bonjour <strong>${h(data.memberName)}</strong>,`}
    </p>
    <p style="margin:0 0 20px; font-size:15px; color:#475569; line-height:1.6;">
      ${isEn
        ? `You have been added as a member of <strong>${h(data.groupName)}</strong> on VillageClaq. Click the button below to create your account and access your membership, payment history, and group activities.`
        : `Vous avez été ajouté(e) comme membre de <strong>${h(data.groupName)}</strong> sur VillageClaq. Cliquez sur le bouton ci-dessous pour créer votre compte et accéder à votre adhésion, votre historique de paiements et les activités du groupe.`}
    </p>
    ${button(isEn ? "Claim My Membership" : "Réclamer mon adhésion", data.claimUrl)}
    <p style="margin:20px 0 0; font-size:13px; color:#64748b; line-height:1.5;">
      ${isEn
        ? `This link expires on <strong>${expiryDate}</strong>. If you already have a VillageClaq account, you can log in and your membership will be linked automatically.`
        : `Ce lien expire le <strong>${expiryDate}</strong>. Si vous avez déjà un compte VillageClaq, connectez-vous et votre adhésion sera liée automatiquement.`}
    </p>
    <p style="margin:16px 0 0; font-size:12px; color:#94a3b8; line-height:1.5;">
      ${isEn
        ? "If you did not expect this invitation, you can safely ignore this email."
        : "Si vous n'attendiez pas cette invitation, vous pouvez ignorer cet e-mail en toute sécurité."}
    </p>
  `;

  return emailLayout(body, locale);
}

export function proxyClaimSubject(
  groupName: string,
  locale: "en" | "fr" = "en"
): string {
  return locale === "fr"
    ? `Réclamez votre adhésion à ${groupName} sur VillageClaq`
    : `Claim your membership in ${groupName} on VillageClaq`;
}
