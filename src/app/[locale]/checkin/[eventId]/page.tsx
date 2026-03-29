"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Calendar, MapPin, Clock, Loader2, AlertCircle, LogIn } from "lucide-react";
import { Link } from "@/i18n/routing";

type CheckinState = "loading" | "not_logged_in" | "not_member" | "ready" | "checking_in" | "checked_in" | "already_checked_in" | "error";

interface EventInfo {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  event_type: string;
  group_id: string;
  group_name: string;
}

export default function CheckInPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const locale = useLocale();
  const t = useTranslations("checkin");

  const [state, setState] = useState<CheckinState>("loading");
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [membershipId, setMembershipId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setState("not_logged_in");
        return;
      }

      // Fetch event with group name
      const { data: evt, error: evtErr } = await supabase
        .from("events")
        .select("id, title, starts_at, ends_at, location, event_type, group_id, groups!inner(name)")
        .eq("id", eventId)
        .maybeSingle();

      if (evtErr || !evt) {
        setErrorMsg(t("eventNotFound"));
        setState("error");
        return;
      }

      const groupData = Array.isArray(evt.groups) ? evt.groups[0] : evt.groups;
      setEvent({
        id: evt.id as string,
        title: evt.title as string,
        starts_at: evt.starts_at as string,
        ends_at: evt.ends_at as string | null,
        location: evt.location as string | null,
        event_type: evt.event_type as string,
        group_id: evt.group_id as string,
        group_name: (groupData as Record<string, unknown>)?.name as string || "",
      });

      // Check membership
      const { data: membership } = await supabase
        .from("memberships")
        .select("id")
        .eq("user_id", user.id)
        .eq("group_id", evt.group_id as string)
        .maybeSingle();

      if (!membership) {
        setState("not_member");
        return;
      }

      setMembershipId(membership.id);

      // Check if already checked in
      const { data: existing } = await supabase
        .from("event_attendances")
        .select("id")
        .eq("event_id", eventId)
        .eq("membership_id", membership.id)
        .maybeSingle();

      if (existing) {
        setState("already_checked_in");
      } else {
        setState("ready");
      }
    }
    init();
  }, [eventId, t]);

  const handleCheckIn = async () => {
    if (!membershipId) return;
    setState("checking_in");
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("event_attendances").upsert({
        event_id: eventId,
        membership_id: membershipId,
        status: "present",
        checked_in_via: "qr",
        checked_in_at: new Date().toISOString(),
        marked_by: user?.id,
      }, { onConflict: "event_id,membership_id" });

      if (error) throw error;
      setState("checked_in");
    } catch {
      setErrorMsg(t("checkInFailed"));
      setState("error");
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(getDateLocale(locale), { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  };
  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString(getDateLocale(locale), { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-6">
          {/* Loading */}
          {state === "loading" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <img src="/logo-mark.svg" alt="VillageClaq" className="h-12 w-12 animate-pulse" />
              <p className="text-sm text-muted-foreground">{t("verifying")}</p>
            </div>
          )}

          {/* Not logged in */}
          {state === "not_logged_in" && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                <LogIn className="h-8 w-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-xl font-bold">{t("loginRequired")}</h2>
              <p className="text-sm text-muted-foreground">{t("loginRequiredDesc")}</p>
              <Link href={`/login?redirect=/checkin/${eventId}`}>
                <Button size="lg">{t("loginToCheckIn")}</Button>
              </Link>
            </div>
          )}

          {/* Not a member */}
          {state === "not_member" && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-xl font-bold">{t("notMember")}</h2>
              <p className="text-sm text-muted-foreground">{t("notMemberDesc")}</p>
              <Link href="/dashboard">
                <Button variant="outline">{t("goToDashboard")}</Button>
              </Link>
            </div>
          )}

          {/* Ready to check in */}
          {state === "ready" && event && (
            <div className="flex flex-col items-center gap-6 py-4">
              <img src="/logo-mark.svg" alt="VillageClaq" className="h-10 w-10" />
              <div className="text-center">
                <Badge className="mb-2">{event.group_name}</Badge>
                <h2 className="text-xl font-bold">{event.title}</h2>
              </div>
              <div className="w-full space-y-2 rounded-lg bg-muted/50 p-4 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{formatDate(event.starts_at)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>{formatTime(event.starts_at)}{event.ends_at ? ` — ${formatTime(event.ends_at)}` : ""}</span>
                </div>
                {event.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{event.location}</span>
                  </div>
                )}
              </div>
              <Button size="lg" className="w-full py-6 text-lg" onClick={handleCheckIn}>
                <CheckCircle2 className="mr-2 h-5 w-5" />
                {t("checkInNow")}
              </Button>
            </div>
          )}

          {/* Checking in */}
          {state === "checking_in" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{t("checkingIn")}</p>
            </div>
          )}

          {/* Success */}
          {state === "checked_in" && event && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{t("checkedIn")}</h2>
              <p className="text-muted-foreground">{t("checkedInDesc", { event: event.title })}</p>
              <Link href="/dashboard">
                <Button variant="outline">{t("goToDashboard")}</Button>
              </Link>
            </div>
          )}

          {/* Already checked in */}
          {state === "already_checked_in" && event && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                <CheckCircle2 className="h-10 w-10 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-xl font-bold">{t("alreadyCheckedIn")}</h2>
              <p className="text-sm text-muted-foreground">{t("alreadyCheckedInDesc", { event: event.title })}</p>
              <Link href="/dashboard">
                <Button variant="outline">{t("goToDashboard")}</Button>
              </Link>
            </div>
          )}

          {/* Error */}
          {state === "error" && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-xl font-bold">{t("error")}</h2>
              <p className="text-sm text-muted-foreground">{errorMsg}</p>
              <Button variant="outline" onClick={() => window.location.reload()}>{t("tryAgain")}</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
