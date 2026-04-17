import { emailLayout, button, escapeHtml } from "./layout";

interface MinutesPublishedData {
  memberName: string;
  groupName: string;
  meetingTitle: string;
  meetingDate: string;
  publishedBy: string;
  minutesUrl: string;
}

export function minutesPublishedEmail(data: MinutesPublishedData, locale: "en" | "fr" = "en"): string {
  const isEn = locale === "en";

  const greetingName = escapeHtml((data.memberName || "").trim());
  const enGreeting = greetingName ? `Hi ${greetingName}, ` : "Hi, ";
  const frGreeting = greetingName ? `Bonjour ${greetingName}, ` : "Bonjour, ";
  const safeGroup = escapeHtml(data.groupName);
  const safeMeeting = escapeHtml(data.meetingTitle);
  const safeDate = escapeHtml(data.meetingDate);
  const safePublisher = escapeHtml(data.publishedBy);
  const body = `
    <h1 style="margin:0 0 8px; font-size:24px; font-weight:700; color:#0f172a;">
      ${isEn ? "Meeting Minutes Published" : "Procès-verbal publié"}
    </h1>
    <p style="margin:0 0 20px; font-size:15px; color:#475569; line-height:1.6;">
      ${isEn
        ? `${enGreeting}meeting minutes for <strong>${safeGroup}</strong> have been published.`
        : `${frGreeting}le procès-verbal de <strong>${safeGroup}</strong> a été publié.`}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border-radius:8px; padding:16px; margin:0 0 20px;">
      <tr>
        <td style="padding:8px 16px; font-size:13px; color:#64748b;">${isEn ? "Meeting" : "Réunion"}</td>
        <td style="padding:8px 16px; font-size:14px; font-weight:600; text-align:right;">${safeMeeting}</td>
      </tr>
      <tr>
        <td style="padding:8px 16px; font-size:13px; color:#64748b;">${isEn ? "Date" : "Date"}</td>
        <td style="padding:8px 16px; font-size:13px; text-align:right;">${safeDate}</td>
      </tr>
      <tr>
        <td style="padding:8px 16px; font-size:13px; color:#64748b;">${isEn ? "Published By" : "Publié par"}</td>
        <td style="padding:8px 16px; font-size:13px; text-align:right;">${safePublisher}</td>
      </tr>
    </table>

    ${button(isEn ? "View Minutes" : "Voir le procès-verbal", data.minutesUrl)}
  `;

  return emailLayout(body, locale);
}

export function minutesPublishedSubject(meetingTitle: string, locale: "en" | "fr" = "en"): string {
  return locale === "fr"
    ? `Procès-verbal publié : ${meetingTitle} — VillageClaq`
    : `Minutes Published: ${meetingTitle} — VillageClaq`;
}
