import { Resend } from "resend";

export const FROM_EMAIL = "VillageClaq <noreply@villageclaq.com>";

let resendClient: Resend | null = null;

export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  resendClient ??= new Resend(apiKey);
  return resendClient;
}
