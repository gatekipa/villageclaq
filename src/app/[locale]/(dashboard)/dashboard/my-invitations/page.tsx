"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ListSkeleton,
  EmptyState,
  ErrorState,
} from "@/components/ui/page-skeleton";
import {
  Mail,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
} from "lucide-react";

type InvitationStatus = "pending" | "accepted" | "declined" | "expired" | "revoked";

const statusConfig: Record<InvitationStatus, { color: string; icon: typeof CheckCircle2 }> = {
  pending: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: Clock },
  accepted: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  declined: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
  expired: { color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400", icon: AlertCircle },
  revoked: { color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400", icon: XCircle },
};

export default function MyInvitationsPage() {
  const t = useTranslations("myInvitations");
  const tc = useTranslations("common");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { user } = useGroup();

  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showError, setShowError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  // Query invitations for the current user by email match
  // RLS policy: email = auth.users.email OR invited_by = auth.uid()
  const {
    data: invitations = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["my-invitations", user?.id],
    queryFn: async () => {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser?.email) return [];

      // RLS handles scoping — user sees invitations where their email matches
      // or where they sent the invitation
      const { data, error } = await supabase
        .from("invitations")
        .select("*, group:groups!inner(id, name)")
        .or(`email.eq.${authUser.email}`)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Summary counts derived from real query data
  const counts = useMemo(() => {
    const total = invitations.length;
    const pending = invitations.filter((i: Record<string, unknown>) => i.status === "pending").length;
    const accepted = invitations.filter((i: Record<string, unknown>) => i.status === "accepted").length;
    const declined = invitations.filter((i: Record<string, unknown>) => i.status === "declined").length;
    return { total, pending, accepted, declined };
  }, [invitations]);

  // Accept invitation — creates membership + fires welcome email
  async function handleAccept(invitationId: string) {
    setUpdatingId(invitationId);
    setShowError(null);
    setShowSuccess(null);
    try {
      const supabase = createClient();

      // Look up the invitation from our cached data
      const invitation = invitations.find(
        (i: Record<string, unknown>) => i.id === invitationId
      ) as Record<string, unknown> | undefined;
      if (!invitation) throw new Error("Invitation not found");

      const groupId = invitation.group_id as string;
      const role = (invitation.role as string) || "member";
      const group = invitation.group as Record<string, unknown> | null;
      const groupName = (group?.name as string) || "";

      // Get the current authenticated user
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error("Not authenticated");

      // Check if already a member of this group (prevent duplicate memberships)
      const { data: existing } = await supabase
        .from("memberships")
        .select("id")
        .eq("user_id", authUser.id)
        .eq("group_id", groupId)
        .maybeSingle();

      // Create membership if not already a member
      if (!existing) {
        const { error: membershipErr } = await supabase
          .from("memberships")
          .insert({
            user_id: authUser.id,
            group_id: groupId,
            role,
            standing: "good",
            is_proxy: false,
          });
        if (membershipErr) throw membershipErr;
      }

      // Mark invitation as accepted
      const { error } = await supabase
        .from("invitations")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", invitationId);
      if (error) throw error;

      // Send welcome email (fire-and-forget)
      // Guard: only send if user has an id (they always do since they're logged in)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token && authUser.id) {
          fetch("/api/email/send", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              to: authUser.id,
              template: "welcome",
              data: {
                memberName: user?.full_name || user?.display_name || authUser.email || "Member",
                groupName,
                dashboardUrl: `${window.location.origin}/dashboard`,
              },
              locale,
            }),
          }).catch(() => {}); // Fire and forget
        }
      } catch {
        // Email is non-critical — never block invitation acceptance
      }

      queryClient.invalidateQueries({ queryKey: ["my-invitations"] });
      queryClient.invalidateQueries({ queryKey: ["members", groupId] });
      setShowSuccess(t("acceptSuccess"));
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setShowSuccess(null), 3000);
    } catch (err) {
      setShowError(t("actionFailed"));
    } finally {
      setUpdatingId(null);
    }
  }

  // Decline invitation
  async function handleDecline(invitationId: string) {
    setUpdatingId(invitationId);
    setShowError(null);
    setShowSuccess(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("invitations")
        .update({ status: "declined" })
        .eq("id", invitationId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["my-invitations"] });
      setShowSuccess(t("declineSuccess"));
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setShowSuccess(null), 3000);
    } catch (err) {
      setShowError(t("actionFailed"));
    } finally {
      setUpdatingId(null);
    }
  }

  if (isLoading) return <ListSkeleton rows={4} />;

  if (error) {
    return (
      <ErrorState
        message={(error as Error)?.message}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        {counts.pending > 0 && (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
            {counts.pending} {t("pending")}
          </Badge>
        )}
      </div>

      {/* Success banner */}
      {showSuccess && (
        <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">
          {showSuccess}
        </div>
      )}

      {/* Error banner */}
      {showError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          {showError}
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t("total")}</p>
            <p className="text-2xl font-bold">{counts.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-amber-600 dark:text-amber-400">{t("pending")}</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{counts.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-emerald-600 dark:text-emerald-400">{t("accepted")}</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{counts.accepted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-red-600 dark:text-red-400">{t("declined")}</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{counts.declined}</p>
          </CardContent>
        </Card>
      </div>

      {/* Invitations List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            {t("allInvitations")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <EmptyState
              icon={Mail}
              title={t("noInvitations")}
              description={t("noInvitationsDesc")}
            />
          ) : (
            <div className="space-y-3">
              {invitations.map((inv: Record<string, unknown>) => {
                const id = inv.id as string;
                const status = (inv.status as InvitationStatus) || "pending";
                const group = inv.group as Record<string, unknown> | null;
                const groupName = (group?.name as string) || "—";
                const createdAt = inv.created_at
                  ? new Date(inv.created_at as string).toLocaleDateString()
                  : "—";
                const config = statusConfig[status] || statusConfig.pending;
                const StatusIcon = config.icon;
                const isPending = status === "pending";
                const isUpdating = updatingId === id;

                return (
                  <div
                    key={id}
                    className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="font-medium truncate">{groupName}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{t("invitedOn")}: {createdAt}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={config.color}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {t(status as "pending")}
                      </Badge>

                      {isPending && (
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                            disabled={isUpdating}
                            onClick={() => handleAccept(id)}
                          >
                            {isUpdating ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                            )}
                            {t("accept")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/20"
                            disabled={isUpdating}
                            onClick={() => handleDecline(id)}
                          >
                            {isUpdating ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <XCircle className="mr-1 h-3 w-3" />
                            )}
                            {t("decline")}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
