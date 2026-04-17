/**
 * Bilingual translator for notification flows.
 *
 * Supports rendering a translation key in EITHER 'en' or 'fr' from a
 * single call-site, which is required by the G6 per-recipient
 * localization refactor — one publisher sends a notification that must
 * arrive in each recipient's preferred language.
 *
 * Usage:
 *   const bt = await getBilingualTranslator("minutes");
 *   localize: (loc) => ({
 *     title: bt(loc, "minutesPublished"),
 *     body:  bt(loc, "minutesPublishedMsg", { title: minutesTitle }),
 *   })
 *
 * Lazy-loads both en.json and fr.json on first use and caches them.
 */

import { createTranslator } from "next-intl";

type Translator = ReturnType<typeof createTranslator>;

let enMessages: Record<string, unknown> | null = null;
let frMessages: Record<string, unknown> | null = null;

async function loadMessages(locale: "en" | "fr"): Promise<Record<string, unknown>> {
  if (locale === "en" && enMessages) return enMessages;
  if (locale === "fr" && frMessages) return frMessages;
  const mod = await import(`../../messages/${locale}.json`);
  const msgs = (mod.default || mod) as Record<string, unknown>;
  if (locale === "en") enMessages = msgs; else frMessages = msgs;
  return msgs;
}

/**
 * Returns a translator function `bt(locale, key, values?)` scoped to
 * the given namespace. The function resolves a key against the
 * caller-supplied locale's messages.
 */
export async function getBilingualTranslator(
  namespace: string,
): Promise<(locale: "en" | "fr", key: string, values?: Record<string, string | number | Date>) => string> {
  const [en, fr] = await Promise.all([loadMessages("en"), loadMessages("fr")]);
  const translators: Record<"en" | "fr", Translator> = {
    en: createTranslator({ locale: "en", namespace, messages: en }),
    fr: createTranslator({ locale: "fr", namespace, messages: fr }),
  };
  return (locale, key, values) => {
    const t = translators[locale === "fr" ? "fr" : "en"];
    // next-intl's translator types are strict; values is optional here,
    // but the generated type rejects passing the record. We cast to the
    // runtime's less-strict shape.
    return (t as unknown as (k: string, v?: Record<string, string | number | Date>) => string)(key, values);
  };
}
