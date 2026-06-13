"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatDateWithGroupFormat } from "@/lib/format";
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
import { normalizeSearch } from "@/lib/utils";
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
  Search,
  Download,
  Printer,
  Smartphone,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RequirePermission } from "@/components/ui/permission-gate";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { getMemberName } from "@/lib/get-member-name";
import { SendReviewNotice } from "@/components/send-review-notice";

const statusStyles: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  accepted: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  declined: "bg-red-500/10 text-red-700 dark:text-red-400",
  expired: "bg-muted text-muted-foreground",
  revoked: "bg-red-500/10 text-red-700 dark:text-red-400",
};

// Same validation the bulk-invite path uses (members/page.tsx bulk import).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Privacy: the invitation list never renders a full email — first char + domain only. */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

/** Privacy: the invitation list never renders a full phone — last 3 digits only. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D+/g, "");
  return `***${digits.slice(-3)}`;
}

export default function InvitationsPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { groupId, user, isAdmin, currentGroup, loading: groupLoading } = useGroup();
  const groupDateFormat = ((currentGroup?.settings as Record<string, unknown>)?.date_format as string) || "DD/MM/YYYY";
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

  const confirm = useConfirmDialog();

  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // Row inserted but the email did not go out — one honest amber notice.
  const [sendWarning, setSendWarning] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendFeedback, setResendFeedback] = useState<{ id: string; ok: boolean } | null>(null);

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
    const groupName = currentGroup?.name || "";
    const msg = encodeURIComponent(t("invitations.shareWhatsappText", { group: groupName, link }));
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  }

  function shareEmail(code: string) {
    const link = getJoinLink(code);
    const groupName = currentGroup?.name || "";
    const subject = encodeURIComponent(t("invitations.shareEmailSubject", { group: groupName }));
    const body = encodeURIComponent(t("invitations.shareEmailBody", { group: groupName, link, code }));
    window.open(`mailto:?subject=${subject}&body=${body}`);
  }

  function shareSMS(code: string) {
    const link = getJoinLink(code);
    const groupName = currentGroup?.name || "";
    const msg = encodeURIComponent(t("invitations.shareSmsText", { group: groupName, link }));
    window.open(`sms:?body=${msg}`);
  }

  function downloadQR(code: string) {
    const svgEl = document.getElementById("qr-code-svg");
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
      const pngUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.download = `villageclaq-join-${code}.png`;
      a.href = pngUrl;
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  }

  function printInviteCard(code: string) {
    const link = getJoinLink(code);
    const groupName = currentGroup?.name || "";
    const svgEl = document.getElementById("qr-code-svg");
    const svgHtml = svgEl ? new XMLSerializer().serializeToString(svgEl) : "";
    const win = window.open("", "_blank");
    if (!win) return;
    const doc = win.document;
    doc.open();
    const html = [
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>VillageClaq - Join ",
      groupName,
      "</title><style>",
      "@media print{body{margin:0}}",
      "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f8f9fa}",
      ".card{background:white;border:2px solid #e2e8f0;border-radius:16px;padding:48px 40px;text-align:center;max-width:400px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.08)}",
      ".logo{font-size:24px;font-weight:800;color:#059669;margin-bottom:8px}",
      ".group-name{font-size:22px;font-weight:700;margin:16px 0 8px;color:#1e293b}",
      ".qr-container{margin:24px auto}",
      ".code{font-family:monospace;font-size:28px;font-weight:700;letter-spacing:4px;color:#059669;margin:16px 0}",
      ".bilingual{display:flex;gap:24px;justify-content:center;margin-top:20px}",
      ".bilingual div{flex:1;text-align:center}",
      ".bilingual h4{font-size:12px;color:#059669;margin-bottom:4px}",
      ".bilingual p{font-size:11px;color:#64748b;line-height:1.5}",
      ".url{font-size:11px;color:#94a3b8;word-break:break-all;margin-top:12px}",
      "</style></head><body><div class=\"card\">",
      "<div class=\"logo\">VillageClaq</div>",
      "<div class=\"group-name\">", groupName, "</div>",
      "<div class=\"qr-container\">", svgHtml, "</div>",
      "<div style=\"font-size:13px;color:#64748b\">Join Code / Code d\u2019adh\u00e9sion</div>",
      "<div class=\"code\">", code, "</div>",
      "<div class=\"bilingual\">",
      "<div><h4>English</h4><p>Scan the QR code or visit the link below to join this group on VillageClaq.</p></div>",
      "<div><h4>Fran\u00e7ais</h4><p>Scannez le code QR ou visitez le lien ci-dessous pour rejoindre ce groupe sur VillageClaq.</p></div>",
      "</div>",
      "<div class=\"url\">", link, "</div>",
      "</div></body></html>",
    ].join("");
    doc.write(html);  // Safe: all values are from our own state, not user input
    doc.close();
    setTimeout(() => { win.print(); }, 500);
  }

  async function regenerateCode() {
    if (!groupId || !user) return;
    setRegenerating(true);
    const supabase = createClient();
    try {
      // Atomic RPC: deactivates old codes + creates new one in a single transaction
      await supabase.rpc("regenerate_join_code", {
        p_group_id: groupId,
        p_created_by: user.id,
      });
    } catch (err) {
      // Fallback to non-atomic approach if RPC not deployed yet
      console.warn("[Invitations] regenerate_join_code RPC failed, using fallback:", err instanceof Error ? err.message : err);
      await supabase.from("join_codes").update({ is_active: false }).eq("group_id", groupId);
      await supabase.from("join_codes").insert({ group_id: groupId, created_by: user.id, is_active: true });
    }
    queryClient.invalidateQueries({ queryKey: ["join-codes", groupId] });
    setRegenerating(false);
  }

  /** Regenerating invalidates the live code immediately — confirm first. */
  async function handleRegenerateClick() {
    const ok = await confirm({
      title: t("invitations.regenerateConfirmTitle"),
      description: t("invitations.regenerateConfirmDesc"),
      confirmLabel: t("invitations.regenerateCode"),
      cancelLabel: t("common.cancel"),
      destructive: true,
    });
    if (!ok) return;
    await regenerateCode();
  }

  /** Send the invitation email. Returns true if it sent OK. (WhatsApp for
   *  phone-carrying invitations goes through the queue-backed producer.) */
  async function sendInvitationEmail(recipientEmail: string): Promise<boolean> {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return false;

      const inviterName = user?.full_name || user?.display_name || t("invitations.unknown");
      const groupName = currentGroup?.name || "";
      const groupType = (currentGroup as Record<string, unknown>)?.group_type as string | undefined;
      const acceptUrl = `https://villageclaq.com/${locale}/login?redirectTo=/dashboard/my-invitations`;

      // Invitation emails are ALWAYS sent — the recipient isn't a user yet,
      // so notification preferences don't apply. This dialog is email-only;
      // phone invitations (onboarding, branches) go through the server-side
      // queue-backed producer at /api/invitations/whatsapp-notifications.
      // The old inline WhatsApp branch here was dead code: this flow never
      // collects a phone, and the direct send route rejects non-members.
      const sendEmail = true;

      let emailOk = true;
      if (sendEmail) {
        const res = await fetch("/api/email/send", {
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
        if (!res.ok) {
          // Rule 11: never log raw contact values — mask the recipient.
          console.warn("[Invitations] Email API returned", res.status, "for", maskEmail(recipientEmail));
          emailOk = false;
        }
      }
      return emailOk;
    } catch (err) {
      // Notification failure is non-fatal — invitation row already exists
      console.warn("[Invitations] invitation email send failed:", err instanceof Error ? err.message : err);
      return false;
    }
  }

  const handleSendInvitation = async () => {
    if (!email || !groupId || !user) return;
    const trimmedEmail = email.trim().toLowerCase();
    setSendSuccess(false);
    setSendError(null);
    setSendWarning(null);

    // Same validation as the bulk-invite path — catch typos before inserting.
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setSendError(t("invitations.invalidEmail"));
      return;
    }

    setSending(true);
    try {
      const supabase = createClient();

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
        // Send the invitation email — await so we can surface failures
        let emailSent = false;
        try {
          emailSent = await sendInvitationEmail(trimmedEmail);
        } catch (err) {
          console.warn("[Invitations] invitation email send failed:", err instanceof Error ? err.message : err);
          emailSent = false;
        }
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
        } catch (err) {
          console.warn("[Invitations] audit log failed:", err instanceof Error ? err.message : err);
        }
        if (emailSent) {
          // Green success ONLY when the email actually went out.
          setSendSuccess(true);
          setTimeout(() => setSendSuccess(false), 3000);
        } else {
          // Row saved but the email failed — one amber notice (never a green
          // success next to a red failure), pointing the admin at Resend.
          setSendWarning(t("invitations.savedEmailFailed"));
        }
        setEmail("");
        queryClient.invalidateQueries({ queryKey: ["invitations", groupId] });
      } else if (error.code === "23505") {
        // unique_violation from the invitations_group_*_active_unique partial
        // indexes (00029 email / 00099 phone) — race-safe duplicate guard
        // behind the pre-check above.
        setSendError(t("invitations.duplicateInviteError"));
      } else {
        // Friendly errors only — raw DB text goes to the console, not the UI.
        console.warn("[Invitations] invitation insert failed:", error.message);
        setSendError(t("invitations.sendFailed"));
      }
    } finally {
      setSending(false);
    }
  };

  const handleResendInvitation = async (inviteEmail: string, inviteId: string) => {
    setResendingId(inviteId);
    setResendFeedback(null);
    try {
      const emailOk = await sendInvitationEmail(inviteEmail);
      // Invitations that also carry a phone get the WhatsApp notice
      // re-delivered too (the producer's day bucket allows one per day;
      // email-only rows skip server-side as missing_phone).
      try {
        const supabase = createClient();
        const { requestMemberInvitationWhatsApp } = await import("@/lib/notify-member-invitation");
        requestMemberInvitationWhatsApp(supabase, inviteId, locale).catch((err) => {
          console.warn("[Invitations] resend WhatsApp trigger failed:", err instanceof Error ? err.message : err);
        });
      } catch (err) {
        console.warn("[Invitations] resend WhatsApp dispatch failed:", err instanceof Error ? err.message : err);
      }
      // Inline per-row feedback: resent OK, or a friendly failure notice.
      setResendFeedback({ id: inviteId, ok: emailOk });
      setTimeout(() => {
        setResendFeedback((cur) => (cur?.id === inviteId ? null : cur));
      }, 4000);
    } finally {
      setResendingId(null);
    }
  };

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"date" | "status">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [revokingId, setRevokingId] = useState<string | null>(null);
  const handleRevoke = async (invitationId: string, maskedContact: string) => {
    // Revoking is one-way for the recipient — confirm before acting, and
    // name the target (masked) so the admin can verify which invitation
    // they are revoking among similar-looking rows.
    const ok = await confirm({
      title: t("invitations.revokeConfirmTitle"),
      description: t("invitations.revokeConfirmDesc", { contact: maskedContact }),
      confirmLabel: t("invitations.revokeInvite"),
      cancelLabel: t("common.cancel"),
      destructive: true,
    });
    if (!ok) return;
    setRevokingId(invitationId);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("invitations")
        .update({ status: "revoked" })
        .eq("id", invitationId);
      if (error) console.warn("[Invitations] revoke failed:", error.message);
      queryClient.invalidateQueries({ queryKey: ["invitations", groupId] });
    } finally {
      setRevokingId(null);
    }
  };

  const isLoading = groupLoading || invLoading || codesLoading;

  const activeCode = joinCodes && joinCodes.length > 0 ? joinCodes[0] : null;
  const allInvitations = invitations || [];

  const statusOrder: Record<string, number> = { pending: 0, accepted: 1, declined: 2, expired: 3, revoked: 4 };

  const filteredInvitations = useMemo(() => {
    let list = [...allInvitations];

    // Search filter
    if (search.trim()) {
      const q = normalizeSearch(search);
      list = list.filter((inv: Record<string, unknown>) => {
        const email = normalizeSearch((inv.email as string) || "");
        const phone = normalizeSearch((inv.phone as string) || "");
        const code = normalizeSearch((inv.invitation_code as string) || "");
        return email.includes(q) || phone.includes(q) || code.includes(q);
      });
    }

    // Sort
    list.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      if (sortField === "date") {
        const da = new Date(a.created_at as string).getTime();
        const db = new Date(b.created_at as string).getTime();
        return sortDir === "asc" ? da - db : db - da;
      }
      // status sort
      const sa = statusOrder[(a.status as string) || "pending"] ?? 99;
      const sb = statusOrder[(b.status as string) || "pending"] ?? 99;
      return sortDir === "asc" ? sa - sb : sb - sa;
    });

    return list;
  }, [allInvitations, search, sortField, sortDir]);

  if (isLoading) return <RequirePermission anyOf={["members.manage", "members.invite"]}><ListSkeleton rows={5} /></RequirePermission>;

  if (invError || codesError) {
    // Raw DB error text stays in the console; the UI shows the localized
    // generic copy from ErrorState (common.errorTitle/errorDesc).
    console.warn("[Invitations] load failed:", (invError || codesError)?.message);
    return (
      <RequirePermission anyOf={["members.manage", "members.invite"]}><ErrorState
        onRetry={() => {
          refetchInv();
          refetchCodes();
        }}
      /></RequirePermission>
    );
  }

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
                <Button variant="outline" size="sm" onClick={() => shareSMS(code)} className="gap-1.5">
                  <Smartphone className="h-3.5 w-3.5" />
                  SMS
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowQR(!showQR)} className="gap-1.5">
                  <QrCode className="h-3.5 w-3.5" />
                  QR Code
                </Button>
              </div>

              {/* QR Code (toggled) */}
              {showQR && (
                <div className="flex flex-col items-center gap-3 rounded-xl border bg-white p-6 dark:bg-white">
                  <QRCodeSVG id="qr-code-svg" value={joinLink} size={200} level="M" includeMargin />
                  <p className="text-xs text-gray-500">{t("invitations.scanToJoin")}</p>
                  <div className="flex gap-2 mt-1">
                    <Button variant="outline" size="sm" onClick={() => downloadQR(code)} className="gap-1.5 text-gray-700">
                      <Download className="h-3.5 w-3.5" />
                      {t("invitations.downloadQR")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => printInviteCard(code)} className="gap-1.5 text-gray-700">
                      <Printer className="h-3.5 w-3.5" />
                      {t("invitations.printInvite")}
                    </Button>
                  </div>
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
                <Button variant="ghost" size="sm" onClick={handleRegenerateClick} disabled={regenerating} className="gap-1.5 text-xs">
                  {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                  {t("invitations.regenerateCode")}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* No active join code — offer a way out instead of a dead end */}
      {!activeCode && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4" />
              {t("invitations.joinCode")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={Link2}
              title={t("invitations.noJoinCode")}
              description={t("invitations.noJoinCodeDesc")}
              action={
                <Button onClick={regenerateCode} disabled={regenerating} className="gap-1.5">
                  {regenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                  {t("invitations.createJoinCode")}
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}

      {/* Pre-send review notice — honest summary of what creating an
          invitation actually does, read before the first send. Purely
          informational; no behavior change. */}
      <SendReviewNotice context="invitations" variant="full" />

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
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="email"
                placeholder="member@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1"
              />
              <Select value={role} onValueChange={(val) => setRole(val || "member")}>
                <SelectTrigger className="w-full sm:w-32">
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
                className="w-full sm:w-auto"
              >
                {sending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {t("members.sendInvite")}
              </Button>
            </div>
          </div>
          {sendSuccess && (
            <p className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
              <Check className="h-4 w-4" />
              {t("invitations.inviteSent")}
            </p>
          )}
          {sendWarning && (
            <p className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-4 w-4" />
              {sendWarning}
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
            {t("invitations.allInvitations")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search + Sort */}
          {allInvitations.length > 0 && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("invitations.searchInvitations")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={sortField === "date" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    if (sortField === "date") {
                      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                    } else {
                      setSortField("date");
                      setSortDir("desc");
                    }
                  }}
                >
                  {t("invitations.sortDate")} {sortField === "date" && (sortDir === "asc" ? "\u2191" : "\u2193")}
                </Button>
                <Button
                  variant={sortField === "status" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    if (sortField === "status") {
                      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                    } else {
                      setSortField("status");
                      setSortDir("asc");
                    }
                  }}
                >
                  {t("invitations.sortStatus")} {sortField === "status" && (sortDir === "asc" ? "\u2191" : "\u2193")}
                </Button>
              </div>
            </div>
          )}

          {filteredInvitations.length === 0 && allInvitations.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title={t("invitations.noInvitations")}
              description={t("invitations.noInvitationsDesc")}
            />
          ) : filteredInvitations.length === 0 ? (
            <EmptyState
              icon={Search}
              title={t("invitations.noSearchResults")}
              description={t("invitations.noSearchResultsDesc")}
            />
          ) : (
            <div className="space-y-3">
              {filteredInvitations.map((invite: Record<string, unknown>) => {
                const status = (invite.status as string) || "pending";
                const expiresAtRaw = invite.expires_at as string | null;
                // A pending invitation past its expiry is shown honestly as
                // Expired (the accept RPC would reject it anyway).
                const isExpired =
                  status === "pending" &&
                  !!expiresAtRaw &&
                  new Date(expiresAtRaw).getTime() < Date.now();
                const effectiveStatus = isExpired ? "expired" : status;
                const profile = invite.profile as Record<
                  string,
                  unknown
                > | null;
                const sentByName = getMemberName({ profile });
                const sentBy =
                  sentByName !== "Member" ? sentByName : t("invitations.unknown");
                const inviteDate = invite.created_at
                  ? formatDateWithGroupFormat(invite.created_at as string, groupDateFormat, locale)
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
                          {invite.email
                            ? maskEmail(invite.email as string)
                            : invite.phone
                              ? maskPhone(invite.phone as string)
                              : "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("invitations.sentBy")} {sentBy} &middot;{" "}
                          {inviteDate}
                          {status === "pending" && !isExpired && expiresAtRaw && (
                            <>
                              {" "}&middot;{" "}
                              {t("invitations.expiresOn")}{" "}
                              {formatDateWithGroupFormat(expiresAtRaw, groupDateFormat, locale)}
                            </>
                          )}
                        </p>
                        {resendFeedback?.id === (invite.id as string) && (
                          <p
                            className={
                              resendFeedback.ok
                                ? "text-xs text-emerald-600 dark:text-emerald-400"
                                : "text-xs text-red-600 dark:text-red-400"
                            }
                          >
                            {resendFeedback.ok
                              ? t("invitations.inviteResent")
                              : t("invitations.sendFailed")}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pl-[52px] sm:pl-0">
                      <Badge className={statusStyles[effectiveStatus] || statusStyles.pending}>
                        {t(
                          `invitations.${effectiveStatus}` as "invitations.pending"
                        )}
                      </Badge>
                      {status === "pending" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent focus:outline-none">
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {!!(invite.email) && !isExpired && (
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
                              disabled={revokingId === (invite.id as string)}
                              onClick={() =>
                                handleRevoke(
                                  invite.id as string,
                                  invite.email
                                    ? maskEmail(invite.email as string)
                                    : invite.phone
                                      ? maskPhone(invite.phone as string)
                                      : "—",
                                )
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
