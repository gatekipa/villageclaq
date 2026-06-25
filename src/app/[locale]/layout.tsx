import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Providers } from "@/lib/providers";
import { CookieConsent } from "@/components/ui/cookie-consent";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// JSON-LD structured data — static, hardcoded, no user input
const jsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "VillageClaq",
  url: "https://villageclaq.com",
  logo: "https://villageclaq.com/icons/icon-512x512.svg",
  description: "Community management platform for savings groups, alumni unions, and associations across Africa and the diaspora.",
  founder: { "@type": "Person", name: "Jude Anyere" },
  foundingDate: "2024",
  address: { "@type": "PostalAddress", addressCountry: "US" },
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Fall back to the default locale for unknown segments so social previews
  // never render an empty title/description.
  const resolvedLocale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const t = await getTranslations({ locale: resolvedLocale, namespace: "metadata" });

  const ogLocale = resolvedLocale === "fr" ? "fr_FR" : "en_US";
  const alternateLocale = resolvedLocale === "fr" ? "en_US" : "fr_FR";

  return {
    title: {
      default: t("title"),
      template: "%s | VillageClaq",
    },
    description: t("description"),
    keywords: [
      "community management", "savings group", "njangi", "tontine", "ajo", "susu",
      "stokvel", "chama", "rotating savings", "ROSCA", "Africa", "diaspora",
      "alumni union", "village association", "church group",
    ],
    authors: [{ name: "LawTekno LLC" }],
    creator: "VillageClaq",
    publisher: "LawTekno LLC",
    metadataBase: new URL("https://villageclaq.com"),
    openGraph: {
      type: "website",
      locale: ogLocale,
      alternateLocale,
      url: `https://villageclaq.com/${resolvedLocale}`,
      siteName: "VillageClaq",
      title: t("ogTitle"),
      description: t("ogDescription"),
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: t("ogImageAlt") }],
    },
    twitter: {
      card: "summary_large_image",
      title: t("twitterTitle"),
      description: t("twitterDescription"),
      images: ["/opengraph-image"],
    },
    manifest: "/manifest.json",
    icons: {
      icon: [
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#10B981",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = (await import(`../../../messages/${locale}.json`)).default;

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="VillageClaq" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <Script
          id="json-ld"
          type="application/ld+json"
          strategy="afterInteractive"
        >{jsonLd}</Script>
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            {children}
            <CookieConsent />
            <ServiceWorkerRegister />
            <InstallPrompt />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
