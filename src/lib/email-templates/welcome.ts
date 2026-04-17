import { emailLayout, button, escapeHtml as h } from "./layout";

interface WelcomeData {
  memberName: string;
  groupName: string;
  groupType?: string;
  dashboardUrl: string;
}

export function welcomeEmail(data: WelcomeData, locale: "en" | "fr" = "en"): string {
  const isEn = locale === "en";
  const name = h(data.memberName);
  const group = h(data.groupName);

  const body = `
    <h1 style="margin:0 0 8px; font-size:24px; font-weight:700; color:#0f172a;">
      ${isEn ? `Welcome to ${group}!` : `Bienvenue dans ${group} !`}
    </h1>
    <p style="margin:0 0 20px; font-size:15px; color:#475569; line-height:1.6;">
      ${isEn
        ? `Hi ${name}, you are now a member of <strong>${group}</strong>. Your community is organized and ready for you.`
        : `Bonjour ${name}, vous êtes maintenant membre de <strong>${group}</strong>. Votre communauté est organisée et prête pour vous.`}
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
