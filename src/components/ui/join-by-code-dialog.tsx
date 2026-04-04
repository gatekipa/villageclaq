"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Users, Loader2, AlertCircle, CheckCircle2, ArrowRight, Clock } from "lucide-react";

interface GroupPreview {
  group_id: string;
  name: string;
  description: string | null;
  group_type: string;
  member_count: number;
}

type DialogState = "idle" | "looking" | "found" | "joining" | "success" | "error" | "pending";

interface JoinByCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JoinByCodeDialog({ open, onOpenChange }: JoinByCodeDialogProps) {
  const t = useTranslations("join");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [code, setCode] = useState("");
  const [state, setState] = useState<DialogState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<GroupPreview | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset and auto-focus when dialog opens
  useEffect(() => {
    if (open) {
      setCode("");
      setState("idle");
      setError(null);
      setGroup(null);
      // Focus after open animation settles
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  function cleanCode(raw: string): string {
    return raw.trim().toUpperCase().replace(/\s+/g, "");
  }

  async function handleLookup() {
    const cleaned = cleanCode(code);
    if (!cleaned || state === "looking") return;

    setState("looking");
    setError(null);
    setGroup(null);

    const supabase = createClient();
    const { data, error: rpcErr } = await supabase
      .rpc("lookup_join_code", { p_code: cleaned });

    if (rpcErr || !data) {
      setState("error");
      setError(t("invalidCode"));
      return;
    }

    setGroup({
      group_id: data.group_id,
      name: data.name,
      description: data.description ?? null,
      group_type: data.group_type,
      member_count: data.member_count,
    });
    setState("found");
  }

  async function handleJoin() {
    if (!group || state === "joining") return;
    setState("joining");
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    const displayName =
      profile?.full_name ||
      (user.user_metadata?.full_name as string | undefined) ||
      user.email?.split("@")[0] ||
      null;

    const cleaned = cleanCode(code);

    // Try atomic RPC first — validates code, checks limits, creates membership
    const { data: rpcResult, error: rpcErr } = await supabase
      .rpc("join_group_via_code", { p_code: cleaned, p_display_name: displayName });

    if (!rpcErr && rpcResult) {
      const result =
        typeof rpcResult === "string" ? JSON.parse(rpcResult) : rpcResult;

      if (result.status === "success") {
        notifyAdmins(supabase, group, displayName, user.email);
        logJoinActivity(supabase, group.group_id);
        onSuccess();
        return;
      }

      if (result.status === "pending_approval") {
        notifyAdminsOfPendingJoin(supabase, group, displayName, user.email);
        logJoinActivity(supabase, group.group_id);
        setState("pending");
        return;
      }

      // Handle specific RPC error codes
      switch (result.code) {
        case "already_pending":
          setState("pending");
          return;
        case "already_member":
          setState("error");
          setError(t("alreadyMemberCode"));
          return;
        case "group_full":
          setState("error");
          setError(t("groupFull"));
          return;
        case "banned":
          setState("error");
          setError(t("bannedDesc"));
          return;
        case "invalid_code":
        case "expired_code":
        case "max_uses_reached":
          setState("error");
          setError(t("invalidCode"));
          return;
        default:
          setState("error");
          setError(tCommon("error"));
          return;
      }
    }

    // Fallback: direct queries if RPC not deployed
    const { data: existing } = await supabase
      .from("memberships")
      .select("id, standing")
      .eq("user_id", user.id)
      .eq("group_id", group.group_id)
      .maybeSingle();

    if (existing) {
      setState("error");
      setError(
        existing.standing === "banned" ? t("bannedDesc") : t("alreadyMemberCode")
      );
      return;
    }

    // Check subscription member limit (best-effort)
    try {
      const { TIERS } = await import("@/lib/subscription-tiers");
      // SECURITY DEFINER RPC bypasses RLS — non-members cannot read group_subscriptions directly
      const { data: tierData } = await supabase
        .rpc("get_group_subscription_tier", { p_group_id: group.group_id });
      const tier = ((tierData as string | null) || "free") as keyof typeof TIERS;
      const maxMembers = TIERS[tier]?.maxMembers ?? 15;
      if (maxMembers !== -1) {
        const { count } = await supabase
          .from("memberships")
          .select("id", { count: "exact", head: true })
          .eq("group_id", group.group_id);
        if ((count || 0) >= maxMembers) {
          setState("error");
          setError(t("groupFull"));
          return;
        }
      }
    } catch {
      // Non-critical — if subscription check fails, allow join
    }

    // Create membership
    const { error: joinErr } = await supabase.from("memberships").insert({
      user_id: user.id,
      group_id: group.group_id,
      role: "member",
      standing: "good",
      is_proxy: false,
      display_name: displayName,
    });

    if (joinErr) {
      setState("error");
      setError(tCommon("error"));
      return;
    }

    // Increment use count (non-critical)
    try {
      await supabase.rpc("use_join_code", { p_code: cleaned });
    } catch {
      // Non-critical
    }

    notifyAdmins(supabase, group, displayName, user.email);
    logJoinActivity(supabase, group.group_id);
    onSuccess();
  }

  function onSuccess() {
    setState("success");
    // Brief success flash then navigate
    setTimeout(() => {
      onOpenChange(false);
      router.push("/dashboard");
      setTimeout(() => window.location.reload(), 300);
    }, 1200);
  }

  function handleCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Uppercase as user types; if they had looked up a code and now edit, reset
    const val = e.target.value.toUpperCase();
    setCode(val);
    if (state === "found" || state === "error") {
      setState("idle");
      setError(null);
      setGroup(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && state === "idle" && code.trim()) {
      handleLookup();
    }
  }

  const isLocked = state === "looking" || state === "joining" || state === "success" || state === "pending";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {t("joinByCode")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Code input row — always visible except on success or pending */}
          {state !== "success" && state !== "pending" && (
            <div className="space-y-1.5">
              <Label htmlFor="join-code-input">{t("codeInputLabel")}</Label>
              <div className="flex gap-2">
                <Input
                  id="join-code-input"
                  ref={inputRef}
                  value={code}
                  onChange={handleCodeChange}
                  onKeyDown={handleKeyDown}
                  placeholder={t("enterCodePlaceholder")}
                  className="font-mono uppercase tracking-widest"
                  maxLength={20}
                  disabled={isLocked || state === "found"}
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button
                  variant="secondary"
                  onClick={handleLookup}
                  disabled={!code.trim() || isLocked || state === "found"}
                >
                  {state === "looking" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("lookupCode")
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Error banner */}
          {state === "error" && error && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Group preview card */}
          {(state === "found" || state === "joining") && group && (
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Users className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold">{group.name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {group.group_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {t("memberCount", { count: group.member_count })}
                    </span>
                  </div>
                  {group.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {group.description}
                    </p>
                  )}
                </div>
              </div>
              <Button
                className="mt-4 w-full"
                size="lg"
                onClick={handleJoin}
                disabled={state === "joining"}
              >
                {state === "joining" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-2 h-4 w-4" />
                )}
                {t("joinGroupName", { name: group.name })}
              </Button>
            </div>
          )}

          {/* Pending approval state */}
          {state === "pending" && group && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                <Clock className="h-7 w-7 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold">{t("pendingApprovalTitle")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t("pendingApprovalDesc", { group: group.name })}</p>
              </div>
              <Button variant="outline" onClick={() => onOpenChange(false)}>{tCommon("close")}</Button>
            </div>
          )}

          {/* Success state */}
          {state === "success" && group && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="font-semibold">
                  {t("welcomeTo", { group: group.name })}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("redirecting")}
                </p>
              </div>
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Fire-and-forget helpers (mirror join-client.tsx pattern) ────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyAdmins(supabase: any, group: GroupPreview, memberName: string | null, email: string | undefined) {
  try {
    const { data: admins } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("group_id", group.group_id)
      .in("role", ["owner", "admin"]);

    if (admins && admins.length > 0) {
      const name = memberName || email || "New member";
      const notifications = admins.map((admin: { user_id: string }) => ({
        user_id: admin.user_id,
        group_id: group.group_id,
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
async function notifyAdminsOfPendingJoin(supabase: any, group: GroupPreview, memberName: string | null, email: string | undefined) {
  try {
    const { data: admins } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("group_id", group.group_id)
      .in("role", ["owner", "admin"]);

    if (admins && admins.length > 0) {
      const name = memberName || email || "New member";
      const notifications = admins.map((admin: { user_id: string }) => ({
        user_id: admin.user_id,
        group_id: group.group_id,
        type: "system" as const,
        title: `${name} requested to join ${group.name}`,
        body: `A new member is awaiting your approval. Review their request in the Members section.`,
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
      description: "New member joined via join code",
    });
  } catch {
    // Non-critical
  }
}
