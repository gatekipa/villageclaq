"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ListSkeleton,
  EmptyState,
  ErrorState,
} from "@/components/ui/page-skeleton";
import { useGroup } from "@/lib/group-context";
import { useInvitations, useJoinCodes } from "@/lib/hooks/use-supabase-query";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  Link2,
  Copy,
  Check,
  Mail,
  Phone,
  Send,
  Clock,
  UserPlus,
  MoreVertical,
  XCircle,
  RotateCw,
  Share2,
  MessageCircle,
  QrCode,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RequirePermission } from "@/components/ui/permission-gate";

const statusStyles: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  accepted: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  declined: "bg-red-500/10 text-red-700 dark:text-red-400",
  expired: "bg-muted text-muted-foreground",
  revoked: "bg-red-500/10 text-red-700 dark:text-red-400",
};

export default function InvitationsPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { groupId, user, isAdmin, currentGroup, loading: groupLoading } = useGroup();
  const queryClient = useQueryClient();

  const {
    data: invitations,
    isLoading: invLoading,
    error: invError,
    refetch: refetchInv,
  } = useInvitations();

  const {
    data: joinCodes,
    isLoading: codesLoading,
    error: codesError,
    refetch: refetchCodes,
  } = useJoinCodes();

  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  function copyCode(text: string) {
    navigator.clipboard.writeText(text);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  function copyLink(text: string) {
    navigator.clipboard.writeText(text);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  function getJoinLink(code: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://villageclaq.com";
    return `${origin}/${locale}/join/${code}`;
  }

  function shareWhatsApp(code: string) {
    const link = getJoinLink(code);
    const groupName = currentGroup?.name || "our group";
    const msg = encodeURIComponent(`Join ${groupName} on VillageClaq: ${link}`);
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  }

  function shareEmail(code: string) {
    const link = getJoinLink(code);
    const groupName = currentGroup?.name || "our group";
    const subject = encodeURIComponent(`Join ${groupName} on VillageClaq`);
    const body = encodeURIComponent(`You've been invited to join ${groupName} on VillageClaq.\n\nClick this link to join: ${link}\n\nOr use join code: ${code}`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  }

  async function regenerateCode() {
    if (!groupId || !user) return;
    setRegenerating(true);
    const supabase = createClient();
    // Deactivate old codes
    await supabase.from("join_codes").update({ is_active: false }).eq("group_id", groupId);
    // Create new code
    await supabase.from("join_codes").insert({ group_id: groupId, created_by: user.id, is_active: true });
    queryClient.invalidateQueries({ queryKey: ["join-codes", groupId] });
    setRegenerating(false);
  }

  /** Fire-and-forget invitation email via the /api/email/send route */
  async function sendInvitationEmail(recipientEmail: string) {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const inviterName = user?.full_name || user?.display_name || "";
      const groupName = currentGroup?.name || "";
      const groupType = (currentGroup as Record<string, unknown>)?.group_type as string | undefined;
      const acceptUrl = `https://villageclaq.com/${locale}/login?redirectTo=/dashboard/my-invitations`;

      await fetch("/api/email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          to: recipientEmail,
          template: "invitation",
          data: { groupName, groupType, inviterName, acceptUrl },
          locale,
        }),
      });
    } catch {
      // Email failure is non-fatal — invitation row already exists
    }
  }

  const handleSendInvitation = async () => {
    if (!email || !groupId || !user) return;
    setSending(true);
    setSendSuccess(false);
    setSendError(null);
    try {
      const supabase = createClient();
      const trimmedEmail = email.trim().toLowerCase();

      // Check for existing pending/accepted invitation to prevent duplicates
      const { data: existing } = await supabase
        .from("invitations")
        .select("id, status")
        .eq("group_id", groupId)
        .eq("email", trimmedEmail)
        .in("status", ["pending", "accepted"])
        .limit(1)
        .maybeSingle();

      if (existing) {
        setSendError(t("invitations.duplicateInvite"));
        return;
      }

      // Also check if email is already a member
      const { data: existingMember } = await supabase
        .from("memberships")
        .select("id, profiles!memberships_user_id_fkey(id)")
        .eq("group_id", groupId)
        .limit(100);

      // Check via profiles table for email match
      const { data: profileMatch } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", trimmedEmail)
        .maybeSingle();

      if (profileMatch && existingMember?.some((m: Record<string, unknown>) => {
        const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        return (profile as Record<string, unknown> | null)?.id === profileMatch.id;
      })) {
        setSendError(t("invitations.alreadyMember"));
        return;
      }

      const { error } = await supabase.from("invitations").insert({
        group_id: groupId,
        email: trimmedEmail,
        role,
        invited_by: user.id,
        status: "pending",
      });

      if (!error) {
        // Send the invitation email (fire-and-forget)
        sendInvitationEmail(trimmedEmail);
        // Audit log
        try {
          const { logActivity } = await import("@/lib/audit-log");
          await logActivity(supabase, {
            groupId,
            action: "member.invited",
            entityType: "membership",
            description: `Invited ${trimmedEmail} as ${role}`,
            metadata: { email: trimmedEmail, role },
          });
        } catch { /* best-effort */ }
        setSendSuccess(true);
        setEmail("");
        setTimeout(() => setSendSuccess(false), 3000);
        queryClient.invalidateQueries({ queryKey: ["invitations", groupId] });
      } else {
        setSendError(error.message);
      }
    } finally {
      setSending(false);
    }
  };

  const handleResendInvitation = async (inviteEmail: string, inviteId: string) => {
    setResendingId(inviteId);
    try {
      await sendInvitationEmail(inviteEmail);
    } finally {
      setResendingId(null);
    }
  };

  const [revokingId, setRevokingId] = useState<string | null>(null);
  const handleRevoke = async (invitationId: string) => {
    setRevokingId(invitationId);
    try {
      const supabase = createClient();
      await supabase
        .from("invitations")
        .update({ status: "revoked" })
        .eq("id", invitationId);
      queryClient.invalidateQueries({ queryKey: ["invitations", groupId] });
    } finally {
      setRevokingId(null);
    }
  };

  const isLoading = groupLoading || invLoading || codesLoading;

  if (isLoading) return <RequirePermission anyOf={["members.manage", "members.invite"]}><ListSkeleton rows={5} /></RequirePermission>;

  if (invError || codesError) {
    return (
      <RequirePermission anyOf={["members.manage", "members.invite"]}><ErrorState
        message={(invError || codesError)?.message}
        onRetry={() => {
          refetchInv();
          refetchCodes();
        }}
      /></RequirePermission>
    );
  }

  const activeCode = joinCodes && joinCodes.length > 0 ? joinCodes[0] : null;
  const allInvitations = invitations || [];

  return (
    <RequirePermission anyOf={["members.manage", "members.invite"]}><div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("invitations.title")}
        </h1>
        <p className="text-muted-foreground">{t("invitations.subtitle")}</p>
      </div>

      {/* Join Code + Shareable Link */}
      {activeCode && (() => {
        const code = (activeCode as Record<string, unknown>).code as string;
        const joinLink = getJoinLink(code);
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-4 w-4" />
                {t("invitations.joinCode")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Join Code Display */}
              <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-6">
                <span className="text-2xl font-mono font-bold tracking-widest text-primary">
                  {code}
                </span>
              </div>

              {/* Shareable Link */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">{t("invitations.shareableLink")}</Label>
                <div className="flex gap-2">
                  <Input value={joinLink} readOnly className="flex-1 font-mono text-xs bg-muted/30" />
                  <Button variant="outline" size="icon" onClick={() => copyLink(joinLink)}>
                    {linkCopied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Share Buttons */}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => copyCode(code)} className="gap-1.5">
                  {codeCopied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                  {codeCopied ? t("common.copied") : t("invitations.copyCode")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => shareWhatsApp(code)} className="gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950">
                  <MessageCircle className="h-3.5 w-3.5" />
                  WhatsApp
                </Button>
                <Button variant="outline" size="sm" onClick={() => shareEmail(code)} className="gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  Email
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowQR(!showQR)} className="gap-1.5">
                  <QrCode className="h-3.5 w-3.5" />
                  QR Code
                </Button>
              </div>

              {/* QR Code (toggled) */}
              {showQR && (
                <div className="flex flex-col items-center gap-3 rounded-xl border bg-white p-6 dark:bg-white">
                  <QRCodeSVG value={joinLink} size={200} level="M" includeMargin />
                  <p className="text-xs text-gray-500">{t("invitations.scanToJoin")}</p>
                </div>
              )}

              {/* Stats + Regenerate */}
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  <span>
                    {t("invitations.usedCount", {
                      count: ((activeCode as Record<string, unknown>).use_count as number) || 0,
                    })}
                  </span>
                  {" · "}
                  {(activeCode as Record<string, unknown>).max_uses ? (
                    <span>{t("invitations.maxUses", { max: (activeCode as Record<string, unknown>).max_uses as number })}</span>
                  ) : (
                    <span>{t("invitations.unlimitedUses")}</span>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={regenerateCode} disabled={regenerating} className="gap-1.5 text-xs">
                  {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                  {t("invitations.regenerateCode")}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Invite by Email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" />
            {t("invitations.inviteByEmail")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("auth.email")}</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="member@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1"
              />
              <Select value={role} onValueChange={(val) => setRole(val || "member")}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">
                    {t("invitations.roleMember")}
                  </SelectItem>
                  {isAdmin && (
                    <SelectItem value="admin">
                      {t("invitations.roleAdmin")}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Button
                onClick={handleSendInvitation}
                disabled={!email || sending}
              >
                <Send className="mr-2 h-4 w-4" />
                {t("common.submit")}
              </Button>
            </div>
          </div>
          {sendSuccess && (
            <p className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
              <Check className="h-4 w-4" />
              {t("invitations.inviteSent")}
            </p>
          )}
          {sendError && (
            <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              {sendError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Invitation List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            {t("invitations.pendingInvitations")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allInvitations.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title={t("invitations.noInvitations")}
              description={t("invitations.noInvitationsDesc")}
            />
          ) : (
            <div className="space-y-3">
              {allInvitations.map((invite: Record<string, unknown>) => {
                const status = (invite.status as string) || "pending";
                const profile = invite.profile as Record<
                  string,
                  unknown
                > | null;
                const sentBy =
                  (profile?.full_name as string) || t("invitations.unknown");
                const inviteDate = invite.created_at
                  ? new Date(
                      invite.created_at as string
                    ).toLocaleDateString()
                  : "";

                return (
                  <div
                    key={invite.id as string}
                    className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        {invite.email ? (
                          <Mail className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Phone className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {(invite.email as string) ||
                            (invite.phone as string) ||
                            ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("invitations.sentBy")} {sentBy} &middot;{" "}
                          {inviteDate}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pl-[52px] sm:pl-0">
                      <Badge className={statusStyles[status] || statusStyles.pending}>
                        {t(
                          `invitations.${status}` as "invitations.pending"
                        )}
                      </Badge>
                      {status === "pending" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent focus:outline-none">
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {!!(invite.email) && (
                              <DropdownMenuItem
                                className="flex items-center gap-2"
                                disabled={resendingId === (invite.id as string)}
                                onClick={() =>
                                  handleResendInvitation(
                                    invite.email as string,
                                    invite.id as string
                                  )
                                }
                              >
                                {resendingId === (invite.id as string) ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RotateCw className="h-3.5 w-3.5" />
                                )}
                                {t("invitations.resendInvite")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="flex items-center gap-2 text-destructive"
                              onClick={() =>
                                handleRevoke(invite.id as string)
                              }
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              {t("invitations.revokeInvite")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div></RequirePermission>
  );
}
