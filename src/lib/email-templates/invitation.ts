import { emailLayout, button } from "./layout";

interface InvitationData {
  groupName: string;
  groupType?: string;
  inviterName: string;
  acceptUrl: string;
}

export function invitationEmail(data: InvitationData, locale: "en" | "fr" = "en"): string {
  const isEn = locale === "en";

  const groupTypeLabel = data.groupType
    ? isEn
      ? ` (${data.groupType})`
      : ` (${data.groupType})`
    : "";

  const body = `
    <h1 style="margin:0 0 8px; font-size:24px; font-weight:700; color:#0f172a;">
      ${isEn
        ? `You've been invited to join ${data.groupName}${groupTypeLabel}`
        : `Vous êtes invité(e) à rejoindre ${data.groupName}${groupTypeLabel}`}
    </h1>
    <p style="margin:0 0 20px; font-size:15px; color:#475569; line-height:1.6;">
      ${isEn
        ? `<strong>${data.inviterName}</strong> has invited you to join <strong>${data.groupName}</strong> on VillageClaq.`
        : `<strong>${data.inviterName}</strong> vous a invité(e) à rejoindre <strong>${data.groupName}</strong> sur VillageClaq.`}
    </p>
    <p style="margin:0 0 8px; font-size:14px; color:#64748b;">
      ${isEn
        ? "VillageClaq helps community groups manage:"
        : "VillageClaq aide les groupes communautaires à gérer :"}
    </p>
    <ul style="margin:0 0 24px; padding-left:20px; font-size:14px; color:#475569; line-height:1.8;">
      <li>${isEn ? "Members and roles" : "Membres et rôles"}</li>
      <li>${isEn ? "Contributions and finances" : "Cotisations et finances"}</li>
      <li>${isEn ? "Events, meetings, and attendance" : "Événements, réunions et présences"}</li>
      <li>${isEn ? "Mutual aid and relief funds" : "Entraide et fonds de solidarité"}</li>
    </ul>
    ${button(isEn ? "Accept Invitation" : "Accepter l'invitation", data.acceptUrl)}
    <p style="margin:20px 0 0; font-size:12px; color:#94a3b8; line-height:1.5;">
      ${isEn
        ? "If you don't have a VillageClaq account yet, you'll be able to create one when you click the link above."
        : "Si vous n'avez pas encore de compte VillageClaq, vous pourrez en créer un en cliquant sur le lien ci-dessus."}
    </p>
  `;

  return emailLayout(body, locale);
}

export function invitationSubject(groupName: string, locale: "en" | "fr" = "en"): string {
  return locale === "fr"
    ? `Vous êtes invité(e) à rejoindre ${groupName} sur VillageClaq`
    : `You've been invited to join ${groupName} on VillageClaq`;
}
