"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, CheckCircle2, Loader2, AlertCircle, ArrowLeft, MessageCircle, ShieldAlert } from "lucide-react";

interface GroupInfo {
  id: string;
  name: string;
  description: string | null;
  group_type: string;
  member_count: number;
}

export default function JoinClient() {
  const params = useParams();
  const code = params.code as string;
  const t = useTranslations("common");
  const tj = useTranslations("join");
  const router = useRouter();

  const [status, setStatus] = useState<"loading" | "found" | "not_found" | "joining" | "joined" | "error" | "already_member" | "banned">("loading");
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function lookupCode() {
      const supabase = createClient();

      // Check if user is authenticated — RLS on join_codes requires it
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        // Redirect to signup with return URL so they come back after login
        router.push(`/signup?redirectTo=/join/${code}`);
        return;
      }

      // Look up join code — case-insensitive via .ilike()
      const { data: joinCode, error: codeErr } = await supabase
        .from("join_codes")
        .select("id, group_id, code, is_active, max_uses, use_count, expires_at")
        .ilike("code", code)
        .eq("is_active", true)
        .maybeSingle();

      if (codeErr || !joinCode) {
        setStatus("not_found");
        return;
      }

      // Check expiry
      if (joinCode.expires_at && new Date(joinCode.expires_at) < new Date()) {
        setStatus("not_found");
        return;
      }

      // Check max uses (0 or null = unlimited)
      if (joinCode.max_uses && joinCode.max_uses > 0 && joinCode.use_count >= joinCode.max_uses) {
        setStatus("not_found");
        return;
      }

      // Get group info
      const { data: groupData } = await supabase
        .from("groups")
        .select("id, name, description, group_type")
        .eq("id", joinCode.group_id)
        .single();

      if (!groupData) {
        setStatus("not_found");
        return;
      }

      // Get member count
      const { count } = await supabase
        .from("memberships")
        .select("id", { count: "exact", head: true })
        .eq("group_id", groupData.id);

      setGroup({
        ...groupData,
        member_count: count || 0,
      });
      setStatus("found");
    }
    lookupCode();
  }, [code]);

  async function handleJoin() {
    if (!group) return;
    setStatus("joining");
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.push(`/signup?redirectTo=/join/${code}`);
      return;
    }

    // Check if already a member (including banned)
    const { data: existing } = await supabase
      .from("memberships")
      .select("id, standing")
      .eq("user_id", user.id)
      .eq("group_id", group.id)
      .maybeSingle();

    if (existing) {
      if (existing.standing === "banned") {
        setStatus("banned");
      } else {
        setStatus("already_member");
      }
      return;
    }

    // Fetch profile name to set display_name
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
    const displayName = profile?.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || null;

    // Create membership
    const { error: joinErr } = await supabase.from("memberships").insert({
      user_id: user.id,
      group_id: group.id,
      role: "member",
      standing: "good",
      is_proxy: false,
      display_name: displayName,
    });

    if (joinErr) {
      setError(t("error"));
      setStatus("error");
      return;
    }

    // Atomically increment use count via RPC (non-critical)
    // use_join_code validates + increments in one atomic operation.
    // Falls back to the simpler increment RPC if the new one isn't deployed yet.
    try {
      await supabase.rpc("use_join_code", { p_code: code });
    } catch {
      try {
        await supabase.rpc("increment_join_code_use_count", { p_code: code });
      } catch {
        // Non-critical — code usage tracking is best-effort
      }
    }

    // Notify group admins (fire-and-forget)
    try {
      const { data: admins } = await supabase
        .from("memberships")
        .select("user_id")
        .eq("group_id", group.id)
        .in("role", ["owner", "admin"]);

      if (admins && admins.length > 0) {
        const memberName = displayName || user.email || "New member";
        const notifications = admins.map((admin) => ({
          user_id: admin.user_id,
          group_id: group.id,
          type: "member_joined" as const,
          title: `${memberName} joined ${group.name}`,
          body: `A new member joined via join code.`,
          is_read: false,
        }));
        await supabase.from("notifications").insert(notifications);
      }
    } catch {
      // Non-critical
    }

    // Audit log (fire-and-forget)
    try {
      const { logActivity } = await import("@/lib/audit-log");
      await logActivity(supabase, {
        groupId: group.id,
        action: "member.joined",
        entityType: "membership",
        description: `New member joined via join code`,
      });
    } catch {
      // Non-critical
    }

    setStatus("joined");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <img src="/logo-mark.svg" alt="VillageClaq" className="h-10 w-10" />
        <span className="text-xl font-bold">VillageClaq</span>
      </Link>

      <Card className="w-full max-w-md">
        <CardContent className="p-6">
          {status === "loading" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{t("loading")}</p>
            </div>
          )}

          {status === "not_found" && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground" />
              <h2 className="text-lg font-semibold">{tj("invalidLink")}</h2>
              <p className="text-sm text-muted-foreground">
                {tj("invalidLinkDesc")}
              </p>
              <Link href="/">
                <Button variant="outline" className="gap-2">
                  <ArrowLeft className="h-4 w-4" /> {tj("goHome")}
                </Button>
              </Link>
            </div>
          )}

          {(status === "found" || status === "joining") && group && (
            <div className="flex flex-col items-center gap-5 py-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Users className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{group.name}</h2>
                <div className="mt-1 flex items-center justify-center gap-2">
                  <Badge variant="secondary" className="text-xs">{group.group_type}</Badge>
                  <span className="text-xs text-muted-foreground">{tj("memberCount", { count: group.member_count })}</span>
                </div>
              </div>
              {group.description && (
                <p className="text-sm text-muted-foreground">{group.description}</p>
              )}
              <Button onClick={handleJoin} disabled={status === "joining"} className="w-full" size="lg">
                {status === "joining" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Users className="mr-2 h-4 w-4" />
                )}
                {tj("joinGroup")}
              </Button>
              <p className="text-xs text-muted-foreground">
                {tj("accountRequired")}
              </p>
            </div>
          )}

          {status === "joined" && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-lg font-semibold">{tj("welcomeTo", { group: group?.name || "" })}</h2>
              <div className="flex flex-col gap-2 w-full mt-2">
                <Button
                  variant="outline"
                  className="w-full gap-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950"
                  onClick={() => {
                    const joinLink = `${window.location.origin}/join/${code}`;
                    const text = tj("joinedShareText", { group: group?.name || "", link: joinLink });
                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
                  }}
                >
                  <MessageCircle className="h-4 w-4" />
                  {tj("shareTheNews")}
                </Button>
                <Link href="/dashboard" className="w-full">
                  <Button variant="default" className="w-full">
                    {tj("skipToDashboard")}
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {status === "already_member" && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-primary" />
              <h2 className="text-lg font-semibold">{tj("alreadyMember")}</h2>
              <p className="text-sm text-muted-foreground">
                {tj("alreadyMemberDesc", { group: group?.name || "" })}
              </p>
              <Link href="/dashboard">
                <Button>{tj("goToDashboard")}</Button>
              </Link>
            </div>
          )}

          {status === "banned" && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <ShieldAlert className="h-12 w-12 text-destructive" />
              <h2 className="text-lg font-semibold">{tj("bannedTitle")}</h2>
              <p className="text-sm text-muted-foreground">
                {tj("bannedDesc")}
              </p>
              <Link href="/">
                <Button variant="outline" className="gap-2">
                  <ArrowLeft className="h-4 w-4" /> {tj("goHome")}
                </Button>
              </Link>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <h2 className="text-lg font-semibold">{tj("errorTitle")}</h2>
              <p className="text-sm text-destructive">{error}</p>
              <Button onClick={() => setStatus("found")} variant="outline">{tj("tryAgain")}</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
