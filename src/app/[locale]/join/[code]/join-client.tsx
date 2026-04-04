"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Users, CheckCircle2, Loader2, AlertCircle, ArrowLeft, MessageCircle, ShieldAlert, Phone, Check } from "lucide-react";

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
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [existingPhone, setExistingPhone] = useState<string | null>(null);

  useEffect(() => {
    async function lookupCode() {
      const supabase = createClient();

      // Check if user is authenticated
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        // Redirect to signup with return URL so they come back after login
        router.push(`/signup?redirectTo=/join/${code}`);
        return;
      }

      // Use SECURITY DEFINER RPC to look up join code + group info.
      // This bypasses the groups RLS policy that blocks non-members from
      // reading group data — the exact bug that caused "Invalid or Expired Link".
      const { data: rpcResult, error: rpcErr } = await supabase
        .rpc("lookup_join_code", { p_code: code });

      if (!rpcErr && rpcResult) {
        // RPC found the code and returned group info
        setGroup({
          id: rpcResult.group_id,
          name: rpcResult.name,
          description: rpcResult.description,
          group_type: rpcResult.group_type,
          member_count: rpcResult.member_count,
        });
        setStatus("found");
        return;
      }

      // Fallback: try direct queries (works for existing members re-visiting)
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

      // Get group info (only works if user is already a member due to RLS)
      const { data: groupData } = await supabase
        .from("groups")
        .select("id, name, description, group_type")
        .eq("id", joinCode.group_id)
        .single();

      if (!groupData) {
        // Groups RLS blocked the query — non-member can't read group data.
        // The RPC should have handled this; if we're here, the RPC isn't deployed yet.
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

    // Fetch profile name to set display_name
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
    const displayName = profile?.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || null;

    // Try atomic RPC first — validates code, checks limits, creates membership
    const { data: rpcResult, error: rpcErr } = await supabase
      .rpc("join_group_via_code", { p_code: code, p_display_name: displayName });

    if (!rpcErr && rpcResult) {
      const result = typeof rpcResult === "string" ? JSON.parse(rpcResult) : rpcResult;

      if (result.status === "success") {
        // Fire-and-forget: notify admins
        notifyAdmins(supabase, group, displayName, user.email);
        // Fire-and-forget: audit log
        logJoinActivity(supabase, group.id);
        setStatus("joined");
        return;
      }

      // Handle specific error codes from RPC
      switch (result.code) {
        case "banned":
          setStatus("banned");
          return;
        case "already_member":
          setStatus("already_member");
          return;
        case "group_full":
          setError(tj("groupFull"));
          setStatus("error");
          return;
        case "invalid_code":
        case "expired_code":
        case "max_uses_reached":
          setStatus("not_found");
          return;
        default:
          setError(t("error"));
          setStatus("error");
          return;
      }
    }

    // Fallback: direct queries if RPC isn't deployed yet
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

    // Check member limit before joining
    try {
      const { TIERS } = await import("@/lib/subscription-tiers");
      // SECURITY DEFINER RPC bypasses RLS — non-members cannot read group_subscriptions directly
      const { data: tierData } = await supabase
        .rpc("get_group_subscription_tier", { p_group_id: group.id });
      const tier = ((tierData as string | null) || "free") as keyof typeof TIERS;
      const maxMembers = TIERS[tier]?.maxMembers ?? 15;
      if (maxMembers !== -1) {
        const { count } = await supabase
          .from("memberships")
          .select("id", { count: "exact", head: true })
          .eq("group_id", group.id);
        if ((count || 0) >= maxMembers) {
          setError(tj("groupFull"));
          setStatus("error");
          return;
        }
      }
    } catch {
      // Best-effort — if subscription check fails, allow join
    }

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
    notifyAdmins(supabase, group, displayName, user.email);
    // Audit log (fire-and-forget)
    logJoinActivity(supabase, group.id);

    // Check if user already has a phone number
    try {
      const supabase2 = createClient();
      const { data: { user: currentUser } } = await supabase2.auth.getUser();
      if (currentUser) {
        const { data: prof } = await supabase2.from("profiles").select("phone").eq("id", currentUser.id).single();
        if (prof?.phone) {
          setExistingPhone(prof.phone);
        }
      }
    } catch {
      // Non-critical
    }

    setStatus("joined");
  }

  async function handleSavePhone() {
    if (!phoneInput.trim() || phoneSaving) return;
    setPhoneSaving(true);
    try {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const { error: phoneErr } = await supabase
        .from("profiles")
        .update({ phone: phoneInput.trim() })
        .eq("id", authUser.id);
      if (!phoneErr) {
        setPhoneSaved(true);
        setExistingPhone(phoneInput.trim());
      }
    } catch {
      // Non-critical — they can add it later
    } finally {
      setPhoneSaving(false);
    }
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

              {/* Phone prompt — only shown if user has no phone yet */}
              {!existingPhone && !phoneSaved && (
                <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Phone className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{tj("addPhoneTitle")}</p>
                  </div>
                  <p className="text-xs text-amber-700/80 dark:text-amber-400/70 mb-3">{tj("addPhoneDesc")}</p>
                  <div className="flex gap-2">
                    <Input
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="+1 234 567 8900"
                      className="flex-1 h-9 text-sm bg-white dark:bg-background"
                    />
                    <Button
                      size="sm"
                      onClick={handleSavePhone}
                      disabled={!phoneInput.trim() || phoneSaving}
                      className="h-9"
                    >
                      {phoneSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : tj("savePhone")}
                    </Button>
                  </div>
                </div>
              )}

              {/* Phone saved confirmation */}
              {phoneSaved && (
                <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                  <Check className="h-4 w-4" />
                  {tj("phoneSaved")}
                </div>
              )}

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

// ── Fire-and-forget helpers ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyAdmins(supabase: any, group: GroupInfo, memberName: string | null, email: string | undefined) {
  try {
    const { data: admins } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("group_id", group.id)
      .in("role", ["owner", "admin"]);

    if (admins && admins.length > 0) {
      const name = memberName || email || "New member";
      const notifications = admins.map((admin: { user_id: string }) => ({
        user_id: admin.user_id,
        group_id: group.id,
        type: "member_joined" as const,
        title: `${name} joined ${group.name}`,
        body: `A new member joined via join code.`,
        is_read: false,
        data: { link: "/dashboard/members" },
      }));
      await supabase.from("notifications").insert(notifications);
    }
  } catch {
    // Non-critical
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logJoinActivity(supabase: any, groupId: string) {
  try {
    const { logActivity } = await import("@/lib/audit-log");
    await logActivity(supabase, {
      groupId,
      action: "member.joined",
      entityType: "membership",
      description: `New member joined via join code`,
    });
  } catch {
    // Non-critical
  }
}
