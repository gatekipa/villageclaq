import { redirect } from "@/i18n/routing";

export default function SettingsRedirect() {
  redirect({ href: "/dashboard/settings", locale: "en" });
}
