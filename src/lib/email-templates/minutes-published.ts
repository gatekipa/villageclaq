import { emailLayout, button } from "./layout";

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

  const body = `
    <h1 style="margin:0 0 8px; font-size:24px; font-weight:700; color:#0f172a;">
      ${isEn ? "Meeting Minutes Published" : "Procès-verbal publié"}
    </h1>
    <p style="margin:0 0 20px; font-size:15px; color:#475569; line-height:1.6;">
      ${isEn
        ? `Hi ${data.memberName}, meeting minutes for <strong>${data.groupName}</strong> have been published.`
        : `Bonjour ${data.memberName}, le procès-verbal de <strong>${data.groupName}</strong> a été publié.`}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border-radius:8px; padding:16px; margin:0 0 20px;">
      <tr>
        <td style="padding:8px 16px; font-size:13px; color:#64748b;">${isEn ? "Meeting" : "Réunion"}</td>
        <td style="padding:8px 16px; font-size:14px; font-weight:600; text-align:right;">${data.meetingTitle}</td>
      </tr>
      <tr>
        <td style="padding:8px 16px; font-size:13px; color:#64748b;">${isEn ? "Date" : "Date"}</td>
        <td style="padding:8px 16px; font-size:13px; text-align:right;">${data.meetingDate}</td>
      </tr>
      <tr>
        <td style="padding:8px 16px; font-size:13px; color:#64748b;">${isEn ? "Published By" : "Publié par"}</td>
        <td style="padding:8px 16px; font-size:13px; text-align:right;">${data.publishedBy}</td>
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
