"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AdminGuard } from "@/components/ui/admin-guard";

const statusStyles: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  accepted: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  declined: "bg-red-500/10 text-red-700 dark:text-red-400",
  expired: "bg-muted text-muted-foreground",
  revoked: "bg-red-500/10 text-red-700 dark:text-red-400",
};

export default function InvitationsPage() {
  const t = useTranslations();
  const { groupId, user, isAdmin, loading: groupLoading } = useGroup();
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
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  const handleSendInvitation = async () => {
    if (!email || !groupId || !user) return;
    setSending(true);
    setSendSuccess(false);

    const supabase = createClient();
    const { error } = await supabase.from("invitations").insert({
      group_id: groupId,
      email: email.trim(),
      role,
      invited_by: user.id,
      status: "pending",
    });

    if (!error) {
      setSendSuccess(true);
      setEmail("");
      setTimeout(() => setSendSuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["invitations", groupId] });
    }
    setSending(false);
  };

  const handleRevoke = async (invitationId: string) => {
    const supabase = createClient();
    await supabase
      .from("invitations")
      .update({ status: "revoked" })
      .eq("id", invitationId);
    queryClient.invalidateQueries({ queryKey: ["invitations", groupId] });
  };

  const isLoading = groupLoading || invLoading || codesLoading;

  if (isLoading) return <AdminGuard><ListSkeleton rows={5} /></AdminGuard>;

  if (invError || codesError) {
    return (
      <AdminGuard><ErrorState
        message={(invError || codesError)?.message}
        onRetry={() => {
          refetchInv();
          refetchCodes();
        }}
      /></AdminGuard>
    );
  }

  const activeCode = joinCodes && joinCodes.length > 0 ? joinCodes[0] : null;
  const allInvitations = invitations || [];

  return (
    <AdminGuard><div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("invitations.title")}
        </h1>
        <p className="text-muted-foreground">{t("invitations.subtitle")}</p>
      </div>

      {/* Join Code Section */}
      {activeCode && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4" />
              {t("invitations.joinCode")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-6">
              <span className="text-2xl font-mono font-bold tracking-widest text-primary">
                {(activeCode as Record<string, unknown>).code as string}
              </span>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                copyToClipboard(
                  (activeCode as Record<string, unknown>).code as string
                )
              }
            >
              {codeCopied ? (
                <Check className="mr-2 h-4 w-4 text-primary" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              {codeCopied
                ? t("common.copied")
                : t("invitations.copyCode")}
            </Button>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {t("invitations.usedCount", {
                  count:
                    ((activeCode as Record<string, unknown>)
                      .uses_count as number) || 0,
                })}
              </span>
              {(activeCode as Record<string, unknown>).max_uses ? (
                <span>
                  {t("invitations.maxUses", {
                    max: (activeCode as Record<string, unknown>)
                      .max_uses as number,
                  })}
                </span>
              ) : (
                <span>{t("invitations.unlimitedUses")}</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

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
    </div></AdminGuard>
  );
}
