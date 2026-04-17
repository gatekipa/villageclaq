import { emailLayout, button, escapeHtml as h } from "./layout";

interface EventReminderData {
  memberName: string;
  groupName: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  eventLocation?: string;
  eventsUrl: string;
}

export function eventReminderEmail(data: EventReminderData, locale: "en" | "fr" = "en"): string {
  const isEn = locale === "en";

  const body = `
    <h1 style="margin:0 0 8px; font-size:24px; font-weight:700; color:#0f172a;">
      ${isEn ? "Upcoming Event" : "Événement à venir"}
    </h1>
    <p style="margin:0 0 20px; font-size:15px; color:#475569; line-height:1.6;">
      ${isEn
        ? `Hi ${h(data.memberName)}, you have an upcoming event with <strong>${h(data.groupName)}</strong>.`
        : `Bonjour ${h(data.memberName)}, vous avez un événement à venir avec <strong>${h(data.groupName)}</strong>.`}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border-radius:8px; padding:16px; margin:0 0 20px;">
      <tr>
        <td style="padding:8px 16px; font-size:13px; color:#64748b;">${isEn ? "Event" : "Événement"}</td>
        <td style="padding:8px 16px; font-size:14px; font-weight:600; text-align:right;">${h(data.eventName)}</td>
      </tr>
      <tr>
        <td style="padding:8px 16px; font-size:13px; color:#64748b;">${isEn ? "Date" : "Date"}</td>
        <td style="padding:8px 16px; font-size:13px; text-align:right;">${h(data.eventDate)}</td>
      </tr>
      <tr>
        <td style="padding:8px 16px; font-size:13px; color:#64748b;">${isEn ? "Time" : "Heure"}</td>
        <td style="padding:8px 16px; font-size:13px; text-align:right;">${h(data.eventTime)}</td>
      </tr>
      ${data.eventLocation ? `<tr>
        <td style="padding:8px 16px; font-size:13px; color:#64748b;">${isEn ? "Location" : "Lieu"}</td>
        <td style="padding:8px 16px; font-size:13px; text-align:right;">${h(data.eventLocation)}</td>
      </tr>` : ""}
    </table>

    ${button(isEn ? "View Event" : "Voir l'événement", data.eventsUrl)}
  `;

  return emailLayout(body, locale);
}

export function eventReminderSubject(eventName: string, locale: "en" | "fr" = "en"): string {
  return locale === "fr"
    ? `Événement à venir : ${eventName} — VillageClaq`
    : `Upcoming Event: ${eventName} — VillageClaq`;
}
