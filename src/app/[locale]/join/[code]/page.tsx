"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, CheckCircle2, Loader2, AlertCircle, ArrowLeft } from "lucide-react";

interface GroupInfo {
  id: string;
  name: string;
  description: string | null;
  group_type: string;
  member_count: number;
}

export default function JoinPage() {
  const params = useParams();
  const code = params.code as string;
  const t = useTranslations("common");
  const tj = useTranslations("join");
  const router = useRouter();

  const [status, setStatus] = useState<"loading" | "found" | "not_found" | "joining" | "joined" | "error" | "already_member">("loading");
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function lookupCode() {
      const supabase = createClient();

      // Look up join code
      const { data: joinCode, error: codeErr } = await supabase
        .from("join_codes")
        .select("id, group_id, code, is_active, max_uses, use_count")
        .eq("code", code)
        .eq("is_active", true)
        .maybeSingle();

      if (codeErr || !joinCode) {
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
      // Not logged in — redirect to signup with return URL
      router.push(`/signup?redirect=/join/${code}`);
      return;
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from("memberships")
      .select("id")
      .eq("user_id", user.id)
      .eq("group_id", group.id)
      .maybeSingle();

    if (existing) {
      setStatus("already_member");
      return;
    }

    // Create membership
    const { error: joinErr } = await supabase.from("memberships").insert({
      user_id: user.id,
      group_id: group.id,
      role: "member",
      standing: "good",
      is_proxy: false,
    });

    if (joinErr) {
      setError(t("error"));
      setStatus("error");
      return;
    }

    // Increment use count (non-critical)
    try {
      await supabase.from("join_codes").update({ use_count: (group.member_count + 1) }).eq("code", code);
    } catch {
      // Ignore — non-critical
    }

    setStatus("joined");
    setTimeout(() => router.push("/dashboard"), 2000);
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
              <p className="text-sm text-muted-foreground">{tj("redirecting")}</p>
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
