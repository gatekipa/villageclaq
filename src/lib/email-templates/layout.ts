/**
 * Shared email layout wrapper with VillageClaq branding.
 * All emails use this wrapper for consistent header/footer.
 */

const BRAND_GREEN = "#1db981";
const BRAND_DARK = "#0f172a";

export function emailLayout(body: string, locale: "en" | "fr" = "en"): string {
  const footer =
    locale === "fr"
      ? "VillageClaq — Votre communauté, organisée"
      : "VillageClaq — Your Community, Organized";

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VillageClaq</title>
</head>
<body style="margin:0; padding:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; background:#f8fafc; color:${BRAND_DARK};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; padding:24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:${BRAND_GREEN}; padding:20px 32px;">
              <span style="color:#ffffff; font-size:22px; font-weight:700; letter-spacing:0.5px;">VillageClaq</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px; background:#f1f5f9; border-top:1px solid #e2e8f0; text-align:center;">
              <p style="margin:0; font-size:12px; color:#94a3b8;">${footer}</p>
              <p style="margin:4px 0 0; font-size:11px; color:#cbd5e1;">
                <a href="https://villageclaq.com" style="color:#64748b; text-decoration:none;">villageclaq.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function button(text: string, href: string): string {
  return `<a href="${href}" style="display:inline-block; padding:12px 28px; background:${BRAND_GREEN}; color:#ffffff; text-decoration:none; border-radius:8px; font-size:14px; font-weight:600; margin:16px 0;">${text}</a>`;
}
