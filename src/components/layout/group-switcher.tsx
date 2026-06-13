"use client";

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronsUpDown,
  Check,
  Plus,
  LogOut,
  Loader2,
  UserPlus,
  Search,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { JoinByCodeDialog } from "@/components/ui/join-by-code-dialog";
import { GroupTypeBadge } from "@/components/layout/group-type-badge";
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

// Above this many groups, the dropdown gets a client-side name filter so a
// member of an HQ plus several of its branches can still find a group fast.
const SEARCH_THRESHOLD = 6;

export function GroupSwitcher() {
  const t = useTranslations("groups");
  const tSwitcher = useTranslations("groupSwitcher");
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const tr = useTranslations("roles");
  const router = useRouter();
  const {
    memberships,
    currentGroup,
    currentMembership,
    groupId,
    switchGroup,
    refresh,
  } = useGroup();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInputId = useId();

  const hasMultiple = memberships.length > 1;
  const showSearch = memberships.length > SEARCH_THRESHOLD;

  const filteredMemberships = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return memberships;
    return memberships.filter((m) => m.group.name.toLowerCase().includes(q));
  }, [memberships, search]);

  async function handleLeaveGroup() {
    if (!currentMembership || leaveSaving) return;
    setLeaveError(null);
    setLeaveSaving(true);
    try {
      const supabase = createClient();
      // Supabase returns { error } rather than throwing — check it explicitly
      // so a failed leave does not close the dialog and redirect anyway.
      const { error } = await supabase
        .from("memberships")
        .delete()
        .eq("id", currentMembership.id);
      if (error) {
        console.warn("[GroupSwitcher] leave group failed:", error.message);
        setLeaveError(t("leaveFailed"));
        setLeaveSaving(false);
        return;
      }
      setLeaveOpen(false);
      router.push("/dashboard");
      // Re-resolve group context (which group is current, memberships list)
      // instead of a hard page reload.
      await refresh(true);
    } catch (err) {
      console.warn("[GroupSwitcher] leave group error:", err instanceof Error ? err.message : err);
      setLeaveError(t("leaveFailed"));
      setLeaveSaving(false);
    }
  }

  if (!currentGroup) return null;

  const isOwner = currentMembership?.role === "owner";
  const currentLevel = currentGroup.group_level;

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          // Reset the filter each time the menu is opened so it never reopens
          // pre-filtered to a stale query.
          if (open) setSearch("");
        }}
      >
        <DropdownMenuTrigger className="flex items-center gap-2 max-w-[150px] sm:max-w-[240px] rounded-md border border-input bg-background px-2 sm:px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground focus:outline-none">
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
          {/* HQ/Branch indicator on the trigger so a member in a branch + its
              HQ can tell which workspace they are currently in. */}
          {(currentLevel === "hq" || currentLevel === "branch") && (
            <GroupTypeBadge level={currentLevel} className="hidden sm:inline-flex shrink-0" />
          )}
          {currentMembership?.membership_status === "pending_approval" && (
            <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
          )}
          <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[280px] max-w-[calc(100vw-2rem)]">
          {hasMultiple && (
            <>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                {t("allGroups")}
              </div>
              {showSearch && (
                <div className="px-2 pb-2">
                  <label htmlFor={searchInputId} className="sr-only">
                    {tSwitcher("searchPlaceholder")}
                  </label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id={searchInputId}
                      type="search"
                      autoComplete="off"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => {
                        // Keep typing inside the field instead of the dropdown
                        // stealing keystrokes for type-ahead — but let the menu
                        // still handle navigation/dismissal keys (Escape closes,
                        // arrows/Tab move focus, Enter selects).
                        if (
                          e.key !== "Escape" &&
                          e.key !== "Enter" &&
                          e.key !== "Tab" &&
                          e.key !== "ArrowDown" &&
                          e.key !== "ArrowUp"
                        ) {
                          e.stopPropagation();
                        }
                      }}
                      placeholder={tSwitcher("searchPlaceholder")}
                      className="h-9 pl-8 text-sm"
                    />
                  </div>
                </div>
              )}
              {filteredMemberships.length === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                  {tSwitcher("noMatches")}
                </div>
              ) : (
                filteredMemberships.map((m) => {
                  const isCurrent = m.group_id === groupId;
                  return (
                    <DropdownMenuItem
                      key={m.id}
                      aria-current={isCurrent ? "true" : undefined}
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
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm truncate">{m.group.name}</span>
                          <GroupTypeBadge
                            level={m.group.group_level}
                            className="shrink-0"
                          />
                        </div>
                        <span className="text-[11px] text-muted-foreground capitalize">
                          {tr(m.role as "owner")}
                        </span>
                      </div>
                      {m.membership_status === "pending_approval" ? (
                        <Badge
                          variant="outline"
                          className="ml-auto shrink-0 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-400 text-[10px] px-1.5 py-0"
                        >
                          {tCommon("pending")}
                        </Badge>
                      ) : (
                        isCurrent && (
                          <Check className="ml-auto h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        )
                      )}
                    </DropdownMenuItem>
                  );
                })
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="flex items-center gap-2"
                onClick={() => router.push("/dashboard/my-groups")}
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                  <Layers className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">{tNav("myGroups")}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {!hasMultiple && (
            <>
              <DropdownMenuItem
                className="flex items-center gap-2"
                onClick={() => router.push("/dashboard/my-groups")}
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                  <Layers className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">{tNav("myGroups")}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
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
      <Dialog open={leaveOpen} onOpenChange={(o) => { setLeaveOpen(o); if (!o) setLeaveError(null); }}>
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
          {leaveError && (
            <p className="text-sm font-medium text-destructive" role="alert">{leaveError}</p>
          )}
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
