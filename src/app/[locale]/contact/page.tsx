"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2,
  Send,
  CheckCircle2,
  Mail,
  Phone,
  MapPin,
  Clock,
  ChevronDown,
  AlertCircle,
} from "lucide-react";

const SUBJECT_KEYS = [
  "subjectGeneral",
  "subjectSupport",
  "subjectPartnership",
  "subjectFeedback",
  "subjectBug",
  "subjectOther",
] as const;

export default function ContactPage() {
  const t = useTranslations("contact");
  const tLanding = useTranslations("landing");

  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const subject = formData.get("subject") as string;
    const message = formData.get("message") as string;

    try {
      const supabase = createClient();
      const { error: dbError } = await supabase
        .from("contact_enquiries")
        .insert({
          name,
          email,
          subject,
          message,
        });

      if (dbError) {
        setError(dbError.message);
      } else {
        setIsSuccess(true);
      }
    } catch {
      setError(t("error"));
    } finally {
      setIsLoading(false);
    }
  }

  function toggleFaq(index: number) {
    setOpenFaq(openFaq === index ? null : index);
  }

  const faqItems = [
    { q: t("faq1Q"), a: t("faq1A") },
    { q: t("faq2Q"), a: t("faq2A") },
    { q: t("faq3Q"), a: t("faq3A") },
    { q: t("faq4Q"), a: t("faq4A") },
  ];

  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar heroOverlay={false} />

      {/* Hero */}
      <section className="px-4 pb-8 pt-24 text-center sm:pt-32">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
          {t("subtitle")}
        </p>
      </section>

      <div className="mx-auto max-w-5xl px-4 pb-16">
        <div className="grid gap-12 lg:grid-cols-5">
          {/* Form column */}
          <div className="lg:col-span-3">
            {isSuccess ? (
              <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30">
                <CardContent className="flex flex-col items-center p-8">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                    <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="mt-4 text-center font-medium text-emerald-800 dark:text-emerald-200">
                    {t("success")}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                    <p className="text-sm text-red-800 dark:text-red-200">
                      {error}
                    </p>
                  </div>
                )}

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t("name")}</Label>
                    <Input id="name" name="name" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("email")}</Label>
                    <Input id="email" name="email" type="email" required />
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="phone">{t("phonePlaceholder")}</Label>
                    <Input id="phone" name="phone" type="tel" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subject">{t("subject")}</Label>
                    <select
                      id="subject"
                      name="subject"
                      required
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
                    >
                      {SUBJECT_KEYS.map((key) => (
                        <option key={key} value={t(key)}>
                          {t(key)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">{t("message")}</Label>
                  <Textarea
                    id="message"
                    name="message"
                    rows={5}
                    required
                    className="resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700 sm:w-auto"
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {t("send")}
                </Button>
              </form>
            )}
          </div>

          {/* Direct contact sidebar */}
          <div className="lg:col-span-2">
            <Card>
              <CardContent className="space-y-6 p-6">
                <h3 className="text-lg font-semibold text-foreground">
                  {t("directContact")}
                </h3>

                <div className="space-y-4">
                  <a
                    href={`mailto:${t("emailAddress")}`}
                    className="flex items-start gap-3 text-sm text-foreground hover:text-emerald-600 dark:hover:text-emerald-400"
                  >
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>{t("emailAddress")}</span>
                  </a>

                  <a
                    href={`tel:${t("phone")}`}
                    className="flex items-start gap-3 text-sm text-foreground hover:text-emerald-600 dark:hover:text-emerald-400"
                  >
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>{t("phone")}</span>
                  </a>

                  <div className="flex items-start gap-3 text-sm text-foreground">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>{t("address")}</span>
                  </div>

                  <div className="flex items-start gap-3 text-sm text-foreground">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>{t("businessHours")}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* FAQ Section */}
        <section className="mt-20">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">
              {t("faqTitle")}
            </h2>
            <p className="mt-2 text-muted-foreground">{t("faqSubtitle")}</p>
          </div>

          <div className="mx-auto mt-8 max-w-2xl space-y-3">
            {faqItems.map((item, index) => (
              <div
                key={index}
                className="rounded-lg border border-border bg-card"
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(index)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium text-foreground"
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                      openFaq === index ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {openFaq === index && (
                  <div className="border-t border-border px-5 pb-4 pt-3 text-sm text-muted-foreground">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 text-sm text-muted-foreground sm:flex-row sm:justify-between">
          <p>&copy; {new Date().getFullYear()} VillageClaq</p>
          <div className="flex gap-6">
            <Link href="/about" className="hover:text-foreground">
              {tLanding("footerAbout")}
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              {tLanding("footerTerms")}
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              {tLanding("footerPrivacy")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
