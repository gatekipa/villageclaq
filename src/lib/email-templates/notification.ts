/**
 * Generic notification email template.
 * Used for all notification types that don't have a dedicated template.
 * Title + body + optional CTA button, all wrapped in the standard layout.
 */

import { emailLayout, button } from "./layout";

interface NotificationEmailData {
  title: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
  groupName?: string;
}

export function notificationEmail(data: NotificationEmailData, locale: "en" | "fr" = "en"): string {
  const html = `
    <h1 style="margin:0 0 8px; font-size:22px; font-weight:700; color:#0f172a;">
      ${data.title}
    </h1>
    ${data.groupName ? `<p style="margin:0 0 16px; font-size:13px; color:#64748b;">${data.groupName}</p>` : ""}
    <p style="margin:0 0 20px; font-size:15px; color:#475569; line-height:1.6;">
      ${data.body}
    </p>
    ${data.ctaText && data.ctaUrl ? button(data.ctaText, data.ctaUrl) : ""}
  `;
  return emailLayout(html, locale);
}

export function notificationSubject(title: string): string {
  return `${title} — VillageClaq`;
}
