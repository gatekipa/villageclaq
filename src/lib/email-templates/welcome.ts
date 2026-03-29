import { emailLayout, button } from "./layout";

interface WelcomeData {
  memberName: string;
  groupName: string;
  groupType?: string;
  dashboardUrl: string;
}

export function welcomeEmail(data: WelcomeData, locale: "en" | "fr" = "en"): string {
  const isEn = locale === "en";

  const body = `
    <h1 style="margin:0 0 8px; font-size:24px; font-weight:700; color:#0f172a;">
      ${isEn ? `Welcome to ${data.groupName}!` : `Bienvenue dans ${data.groupName} !`}
    </h1>
    <p style="margin:0 0 20px; font-size:15px; color:#475569; line-height:1.6;">
      ${isEn
        ? `Hi ${data.memberName}, you are now a member of <strong>${data.groupName}</strong>. Your community is organized and ready for you.`
        : `Bonjour ${data.memberName}, vous êtes maintenant membre de <strong>${data.groupName}</strong>. Votre communauté est organisée et prête pour vous.`}
    </p>
    <p style="margin:0 0 8px; font-size:14px; color:#64748b;">
      ${isEn ? "What you can do:" : "Ce que vous pouvez faire :"}
    </p>
    <ul style="margin:0 0 20px; padding-left:20px; font-size:14px; color:#475569; line-height:1.8;">
      <li>${isEn ? "View upcoming events and RSVP" : "Voir les événements à venir et répondre"}</li>
      <li>${isEn ? "Track your contributions and payments" : "Suivre vos cotisations et paiements"}</li>
      <li>${isEn ? "Check your standing and attendance" : "Vérifier votre statut et présences"}</li>
    </ul>
    ${button(isEn ? "Go to Dashboard" : "Aller au tableau de bord", data.dashboardUrl)}
  `;

  return emailLayout(body, locale);
}

export function welcomeSubject(groupName: string, locale: "en" | "fr" = "en"): string {
  return locale === "fr"
    ? `Bienvenue dans ${groupName} — VillageClaq`
    : `Welcome to ${groupName} — VillageClaq`;
}
