"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronsUpDown, Check, Plus, LogOut, Loader2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { JoinByCodeDialog } from "@/components/ui/join-by-code-dialog";
import { Link, useRouter } from "@/i18n/routing";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function GroupSwitcher() {
  const t = useTranslations("groups");
  const tCommon = useTranslations("common");
  const tr = useTranslations("roles");
  const router = useRouter();
  const { memberships, currentGroup, currentMembership, groupId, switchGroup, user } = useGroup();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  async function handleLeaveGroup() {
    if (!currentMembership || leaveSaving) return;
    setLeaveSaving(true);
    try {
      const supabase = createClient();
      await supabase.from("memberships").delete().eq("id", currentMembership.id);
      setLeaveOpen(false);
      router.push("/dashboard");
      // Force page reload to refresh group context
      setTimeout(() => window.location.reload(), 300);
    } catch {
      setLeaveSaving(false);
    }
  }

  if (!currentGroup) return null;

  const isOwner = currentMembership?.role === "owner";

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 max-w-[140px] sm:max-w-[220px] rounded-md border border-input bg-background px-2 sm:px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground focus:outline-none">
        {currentGroup.logo_url ? (
          <img
            src={currentGroup.logo_url}
            alt=""
            className="h-6 w-6 shrink-0 rounded object-cover"
          />
        ) : (
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
            {currentGroup.name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="truncate text-sm font-medium">{currentGroup.name}</span>
        {(currentMembership as unknown as Record<string, unknown>)?.membership_status === "pending_approval" && (
          <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
        )}
        <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[260px]">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          {t("allGroups")}
        </div>
        {memberships.map((m) => {
          const isCurrent = m.group_id === groupId;
          return (
            <DropdownMenuItem
              key={m.id}
              className={cn(
                "flex items-center gap-2",
                isCurrent && "bg-accent"
              )}
              onClick={() => {
                if (!isCurrent) switchGroup(m.group_id);
              }}
            >
              {m.group.logo_url ? (
                <img
                  src={m.group.logo_url}
                  alt=""
                  className="h-6 w-6 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
                  {m.group.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex flex-1 flex-col min-w-0">
                <span className="text-sm truncate">{m.group.name}</span>
                <span className="text-[11px] text-muted-foreground capitalize">
                  {tr(m.role as "owner")}
                </span>
              </div>
              {isCurrent && (
                <Check className="ml-auto h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              )}
              {(m as unknown as Record<string, unknown>).membership_status === "pending_approval" && (
                <Badge variant="outline" className="ml-auto shrink-0 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-400 text-[10px] px-1.5 py-0">
                  {tCommon("pending")}
                </Badge>
              )}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <Link href="/dashboard/onboarding/group">
          <DropdownMenuItem className="flex items-center gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
              <Plus className="h-4 w-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium">{t("createGroup")}</span>
              <span className="text-[11px] text-muted-foreground">{t("createGroupDesc")}</span>
            </div>
          </DropdownMenuItem>
        </Link>
        <DropdownMenuItem
          className="flex items-center gap-2"
          onClick={() => setJoinOpen(true)}
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
            <UserPlus className="h-4 w-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium">{t("joinGroup")}</span>
            <span className="text-[11px] text-muted-foreground">{t("joinGroupDesc")}</span>
          </div>
        </DropdownMenuItem>
        {currentMembership && (
          <>
            <DropdownMenuSeparator />
            {isOwner ? (
              <DropdownMenuItem
                className="flex items-center gap-2 text-muted-foreground cursor-not-allowed"
                disabled
                onSelect={(e) => e.preventDefault()}
              >
                <LogOut className="h-4 w-4" />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm">{t("leaveGroup")}</span>
                  <span className="text-[11px] text-muted-foreground">{t("leaveGroupOwnerHint")}</span>
                </div>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="flex items-center gap-2 text-destructive"
                onClick={() => setLeaveOpen(true)}
              >
                <LogOut className="h-4 w-4" />
                <span>{t("leaveGroup")}</span>
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>

    {/* Join by Code Dialog */}
    <JoinByCodeDialog open={joinOpen} onOpenChange={setJoinOpen} />

    {/* Leave Group Confirmation Dialog */}
    <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="h-5 w-5 text-destructive" />
            {t("leaveGroup")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("leaveGroupConfirm", { groupName: currentGroup?.name || "" })}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setLeaveOpen(false)} disabled={leaveSaving}>
            {tCommon("cancel")}
          </Button>
          <Button variant="destructive" onClick={handleLeaveGroup} disabled={leaveSaving}>
            {leaveSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("leaveGroup")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
