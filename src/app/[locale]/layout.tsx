import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Providers } from "@/lib/providers";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
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

export const metadata: Metadata = {
  title: {
    default: "VillageClaq — Community Management for Africa & Diaspora",
    template: "%s | VillageClaq",
  },
  description:
    "The all-in-one platform for community savings groups, alumni unions, village associations, and church groups across Africa and the diaspora. Track contributions, manage meetings, and build transparency.",
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
    locale: "en_US",
    alternateLocale: "fr_FR",
    url: "https://villageclaq.com",
    siteName: "VillageClaq",
    title: "VillageClaq — Community Management for Africa & Diaspora",
    description: "Track contributions, manage meetings, and build transparency for your community group.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "VillageClaq — Community Management Platform" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "VillageClaq — Community Management for Africa & Diaspora",
    description: "The all-in-one platform for community savings groups across Africa and the diaspora.",
    images: ["/og-image.png"],
  },
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/icon-192x192.svg", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#10B981",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="VillageClaq" />
        <Script
          id="json-ld"
          type="application/ld+json"
          strategy="afterInteractive"
        >{jsonLd}</Script>
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
