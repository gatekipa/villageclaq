"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  MessageCircle,
  X,
  Search,
  Send,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Link } from "@/i18n/routing";

type WidgetView = "main" | "contact" | "success";

export function SupportWidget() {
  const t = useTranslations("supportWidget");
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<WidgetView>("main");
  const [searchQuery, setSearchQuery] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Pre-fill name and email from user profile
  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email || "");
        setName(user.user_metadata?.full_name || user.user_metadata?.name || "");
      }
    }
    loadUser();
  }, []);

  const handleSubmitContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.from("contact_enquiries").insert({
        user_id: user?.id || null,
        name,
        email,
        message,
      });
      setView("success");
      setMessage("");
    } catch {
      // Silently handle error
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    // Reset after animation
    setTimeout(() => {
      setView("main");
      setSearchQuery("");
    }, 200);
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 transition-all hover:scale-105 active:scale-95 dark:bg-emerald-500 dark:hover:bg-emerald-600"
        aria-label={t("needHelp")}
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
      </button>

      {/* Widget Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[calc(100vw-3rem)] max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-200">
          <Card className="shadow-xl border-emerald-200 dark:border-emerald-800">
            {/* Main View */}
            {view === "main" && (
              <>
                <CardHeader className="pb-3 bg-emerald-600 dark:bg-emerald-700 text-white rounded-t-lg">
                  <CardTitle className="text-lg">{t("needHelp")}</CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  {/* Search help articles */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Link href="/dashboard/help" onClick={handleClose}>
                      <Input
                        placeholder={t("searchHelp")}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 cursor-pointer"
                        readOnly
                      />
                    </Link>
                  </div>

                  {/* Contact Support button */}
                  <Button
                    className="w-full"
                    onClick={() => setView("contact")}
                  >
                    {t("contactSupport")}
                  </Button>

                  {/* Response time */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
                    <Clock className="h-3 w-3" />
                    {t("responseTime")}
                  </div>
                </CardContent>
              </>
            )}

            {/* Contact Form View */}
            {view === "contact" && (
              <>
                <CardHeader className="pb-3 bg-emerald-600 dark:bg-emerald-700 text-white rounded-t-lg">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      {t("contactSupport")}
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-white hover:bg-emerald-700 dark:hover:bg-emerald-800 h-8 w-8 p-0"
                      onClick={() => setView("main")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <form onSubmit={handleSubmitContact} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("name")}</Label>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("email")}</Label>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("message")}</Label>
                      <Textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={3}
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={sending || !message}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {sending ? "..." : t("send")}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                      <Clock className="h-3 w-3" />
                      {t("responseTime")}
                    </p>
                  </form>
                </CardContent>
              </>
            )}

            {/* Success View */}
            {view === "success" && (
              <>
                <CardHeader className="pb-3 bg-emerald-600 dark:bg-emerald-700 text-white rounded-t-lg">
                  <CardTitle className="text-lg">{t("contactSupport")}</CardTitle>
                </CardHeader>
                <CardContent className="p-6 text-center space-y-3">
                  <CheckCircle2 className="h-12 w-12 text-emerald-600 dark:text-emerald-400 mx-auto" />
                  <h3 className="font-semibold text-lg">{t("messageSent")}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("messageSentDesc")}
                  </p>
                  <Button
                    variant="outline"
                    className="mt-2"
                    onClick={handleClose}
                  >
                    {t("close")}
                  </Button>
                </CardContent>
              </>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
