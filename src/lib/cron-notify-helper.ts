/**
 * Helpers for cron-driven notifications that must render in each
 * recipient's preferred language.
 *
 * The cron routes run under the service role — no user JWT, no
 * next-intl request context. They still need to pick between en.json
 * and fr.json per recipient. These helpers fetch the locale map in
 * one round-trip and expose a bilingual translator scoped to a
 * namespace.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getBilingualTranslator } from "./bilingual-translator";

export type Locale = "en" | "fr";

/**
 * Fetch preferred_locale for many users in one query. Returns a
 * Map keyed by user_id. Missing users are absent; callers should
 * fall back to "en" via `getLocale(map, userId)`.
 */
export async function fetchLocaleMap(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, Locale>> {
  const map = new Map<string, Locale>();
  if (userIds.length === 0) return map;

  // Deduplicate
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return map;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, preferred_locale")
    .in("id", unique);

  if (error || !data) return map;

  for (const row of data) {
    const r = row as { id: string; preferred_locale: string | null };
    const loc = (r.preferred_locale === "fr" ? "fr" : "en") as Locale;
    map.set(r.id, loc);
  }
  return map;
}

/** Safe lookup with "en" fallback. */
export function getLocale(map: Map<string, Locale>, userId: string | null | undefined): Locale {
  if (!userId) return "en";
  return map.get(userId) ?? "en";
}

/**
 * Look up a single user's preferred locale via the member_locale RPC.
 * Use fetchLocaleMap for batch cases — this is for single-recipient
 * flows like subscription-reminder-per-admin where the cost is trivial.
 */
export async function lookupMemberLocale(
  supabase: SupabaseClient,
  userId: string,
): Promise<Locale> {
  const { data, error } = await supabase.rpc("member_locale", { p_user_id: userId });
  if (error || !data) return "en";
  return (data === "fr" ? "fr" : "en") as Locale;
}

/**
 * Build a translator scoped to a namespace. Returns:
 *   t(locale, key, values) -> string
 * Caches message bundles across calls in this module.
 */
export async function buildTranslator(
  namespace: string,
): Promise<
  (
    locale: Locale,
    key: string,
    values?: Record<string, string | number | Date>,
  ) => string
> {
  return getBilingualTranslator(namespace);
}

/**
 * Convenience wrapper: fetch locale + translate title+body for one
 * recipient. Useful for cron routes that send ONE notification per
 * member and don't need the batched map.
 */
export async function localizeForRecipient(
  supabase: SupabaseClient,
  userId: string,
  namespace: string,
  titleKey: string,
  bodyKey: string,
  values: Record<string, string | number | Date> = {},
): Promise<{ title: string; body: string; locale: Locale }> {
  const [locale, bt] = await Promise.all([
    lookupMemberLocale(supabase, userId),
    buildTranslator(namespace),
  ]);
  return {
    title: bt(locale, titleKey, values),
    body: bt(locale, bodyKey, values),
    locale,
  };
}
