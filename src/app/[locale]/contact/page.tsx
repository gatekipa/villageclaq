"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, Send, CheckCircle2, Mail, Phone } from "lucide-react";

export default function ContactPage() {
  const t = useTranslations("contact");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsLoading(false);
    setIsSuccess(true);
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-12 sm:py-20">
      {/* Branding header */}
      <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-lg font-bold text-white shadow-lg">
        VC
      </div>
      <h1 className="mt-4 text-3xl font-bold text-foreground sm:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-3 max-w-lg text-center text-muted-foreground">
        {t("subtitle")}
      </p>

      {isSuccess ? (
        /* Success card */
        <Card className="mt-10 w-full max-w-md border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30">
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
        /* Contact form */
        <form
          onSubmit={handleSubmit}
          className="mt-10 w-full max-w-md space-y-5"
        >
          <div className="space-y-2">
            <Label htmlFor="name">{t("name")}</Label>
            <Input id="name" name="name" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" name="email" type="email" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">{t("subject")}</Label>
            <Input id="subject" name="subject" required />
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
            className="w-full bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
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

      {/* Direct contact */}
      <Separator className="mt-12 w-full max-w-md" />
      <p className="mt-6 text-sm font-medium text-muted-foreground">
        {t("directContact")}
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:gap-6">
        <a
          href={`mailto:${t("emailAddress")}`}
          className="flex items-center gap-2 text-sm text-foreground hover:text-emerald-600 dark:hover:text-emerald-400"
        >
          <Mail className="h-4 w-4 text-muted-foreground" />
          {t("emailAddress")}
        </a>
        <a
          href={`tel:${t("phone")}`}
          className="flex items-center gap-2 text-sm text-foreground hover:text-emerald-600 dark:hover:text-emerald-400"
        >
          <Phone className="h-4 w-4 text-muted-foreground" />
          {t("phone")}
        </a>
      </div>
    </div>
  );
}
