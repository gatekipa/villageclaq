"use client";

import { useState, useMemo, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Plus,
  Search,
  ArrowLeft,
  Users,
  MapPin,
  Archive,
  RotateCcw,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGroup } from "@/lib/group-context";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { createClient } from "@/lib/supabase/client";
import { CURRENCIES } from "@/lib/currencies";
import { formatAmount } from "@/lib/currencies";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { Link } from "@/i18n/routing";

interface BranchRow {
  id: string;
  name: string;
  currency: string;
  locale: string;
  is_active: boolean;
  created_at: string;
  settings: Record<string, unknown>;
  member_count: number;
}

export default function BranchesPage() {
  const t = useTranslations("enterprise");
  const tc = useTranslations("common");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
  const queryClient = useQueryClient();
  const supabase = createClient();
  const { currentGroup, groupId, isAdmin, user } = useGroup();
  const { hasPermission } = usePermissions();

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);
  const [invitationWarning, setInvitationWarning] = useState<string | null>(null);

  // Form state for create branch dialog
  const [formName, setFormName] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formCountry, setFormCountry] = useState("");
  const [formCurrency, setFormCurrency] = useState("");
  const [formLanguage, setFormLanguage] = useState("en");
  const [formPresidentName, setFormPresidentName] = useState("");
  const [formPresidentEmail, setFormPresidentEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");

  // Guard: only HQ groups can access this page
  if (currentGroup?.group_level !== "hq") {
    return (
      <EmptyState
        icon={Building2}
        title={t("branchesTitle")}
        description={t("noBranchesDesc")}
      />
    );
  }

  const organizationId = currentGroup.organization_id;

  // Fetch branches
  const {
    data: branches,
    isLoading,
    isError,
    refetch,
  } = useQuery<BranchRow[]>({
    queryKey: ["enterprise-branches", organizationId],
    queryFn: async () => {
      const { data: groups, error } = await supabase
        .from("groups")
        .select("id, name, currency, locale, is_active, created_at, settings")
        .eq("organization_id", organizationId!)
        .eq("group_level", "branch")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!groups || groups.length === 0) return [];

      // Fetch member counts for each branch
      const branchIds = groups.map((g) => g.id);
      const { data: counts, error: countError } = await supabase
        .from("memberships")
        .select("group_id")
        .in("group_id", branchIds);

      if (countError) throw countError;

      const countMap: Record<string, number> = {};
      for (const row of counts || []) {
        countMap[row.group_id] = (countMap[row.group_id] || 0) + 1;
      }

      return groups.map((g) => ({
        id: g.id,
        name: g.name,
        currency: g.currency,
        locale: g.locale,
        is_active: g.is_active,
        created_at: g.created_at,
        settings: (g.settings as Record<string, unknown>) || {},
        member_count: countMap[g.id] || 0,
      }));
    },
    enabled: !!organizationId,
  });

  // Create branch mutation — inserts group, then invitation + email for founding president
  const createMutation = useMutation({
    mutationFn: async () => {
      setInvitationWarning(null);
      const slug = formName.toLowerCase().replace(/\s+/g, "-");
      const { data: newBranch, error } = await supabase
        .from("groups")
        .insert({
          name: formName,
          slug,
          organization_id: organizationId,
          group_level: "branch",
          currency: formCurrency,
          locale: formLanguage,
          settings: {
            city: formCity,
            country: formCountry,
            founding_president_name: formPresidentName,
            founding_president_email: formPresidentEmail,
            branch_phone: formPhone,
          },
          is_active: true,
        })
        .select("id")
        .single();
      if (error) throw error;

      // If founding president email provided, create invitation + send email
      const presidentEmail = formPresidentEmail.trim().toLowerCase();
      if (presidentEmail && newBranch?.id && user) {
        // Insert invitation record
        const { error: invError } = await supabase.from("invitations").insert({
          group_id: newBranch.id,
          email: presidentEmail,
          phone: formPhone.trim() || null,
          invited_by: user.id,
          role: "owner",
          status: "pending",
        });

        if (invError) {
          setInvitationWarning(t("branchCreatedInvitationFailed"));
        } else {
          // Fire-and-forget invitation email via /api/email/send
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
              const inviterName = user.full_name || user.display_name || "";
              const acceptUrl = `https://villageclaq.com/${locale}/login?redirectTo=/dashboard/my-invitations`;
              await fetch("/api/email/send", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                  to: presidentEmail,
                  template: "invitation",
                  data: {
                    groupName: formName,
                    inviterName,
                    acceptUrl,
                  },
                  locale,
                }),
              });
            }
          } catch {
            // Email send failed — invitation record still exists
            setInvitationWarning(t("branchCreatedInvitationFailed"));
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["enterprise-branches", organizationId],
      });
      resetForm();
      setCreateOpen(false);
    },
  });

  // Archive / reactivate mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ branchId, active }: { branchId: string; active: boolean }) => {
      const { error } = await supabase
        .from("groups")
        .update({ is_active: active })
        .eq("id", branchId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["enterprise-branches", organizationId],
      });
      setArchiveConfirmId(null);
    },
  });

  const resetForm = useCallback(() => {
    setFormName("");
    setFormCity("");
    setFormCountry("");
    setFormCurrency("");
    setFormLanguage("en");
    setFormPresidentName("");
    setFormPresidentEmail("");
    setFormPhone("");
  }, []);

  const handleCreateSubmit = useCallback(() => {
    if (!formName.trim() || !formCurrency) return;
    createMutation.mutate();
  }, [formName, formCurrency, createMutation]);

  const handleArchive = useCallback(
    (branchId: string) => {
      toggleActiveMutation.mutate({ branchId, active: false });
    },
    [toggleActiveMutation]
  );

  const handleReactivate = useCallback(
    (branchId: string) => {
      toggleActiveMutation.mutate({ branchId, active: true });
    },
    [toggleActiveMutation]
  );

  // Filtered branches
  const filtered = useMemo(() => {
    if (!branches) return [];
    if (!search.trim()) return branches;
    const q = search.toLowerCase();
    return branches.filter((b) => b.name.toLowerCase().includes(q));
  }, [branches, search]);

  const canCreateBranch = isAdmin || hasPermission("settings.manage");
  const isFormValid = formName.trim().length > 0 && formCurrency.length > 0;

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/enterprise">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("branchesTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("branchesSubtitle")}</p>
          </div>
        </div>
        <ListSkeleton rows={5} />
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/enterprise">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("branchesTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("branchesSubtitle")}</p>
          </div>
        </div>
        <ErrorState message={tc("error")} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/enterprise">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("branchesTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("branchesSubtitle")}</p>
          </div>
        </div>
        {canCreateBranch && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("createBranch")}
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={tc("search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Invitation warning */}
      {invitationWarning && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          {invitationWarning}
        </div>
      )}

      {/* Branch list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t("noBranches")}
          description={t("noBranchesDesc")}
          action={
            canCreateBranch ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t("createBranch")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("branchesTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("branchName")}</TableHead>
                    <TableHead>{t("branchCity")}</TableHead>
                    <TableHead>{t("branchCountry")}</TableHead>
                    <TableHead>{t("branchCurrency")}</TableHead>
                    <TableHead>{t("memberCount")}</TableHead>
                    <TableHead>{t("branchStatus")}</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((branch) => (
                    <TableRow key={branch.id}>
                      <TableCell className="font-medium">{branch.name}</TableCell>
                      <TableCell>{(branch.settings.city as string) || "—"}</TableCell>
                      <TableCell>{(branch.settings.country as string) || "—"}</TableCell>
                      <TableCell>{branch.currency}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          {branch.member_count}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={branch.is_active ? "default" : "secondary"}>
                          {branch.is_active ? t("branchActive") : t("branchArchived")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canCreateBranch && (
                          <>
                            {branch.is_active ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setArchiveConfirmId(branch.id)}
                                disabled={toggleActiveMutation.isPending}
                              >
                                <Archive className="mr-1 h-3.5 w-3.5" />
                                {t("archiveBranch")}
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleReactivate(branch.id)}
                                disabled={toggleActiveMutation.isPending}
                              >
                                {toggleActiveMutation.isPending ? (
                                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                                )}
                                {t("reactivateBranch")}
                              </Button>
                            )}
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile card layout */}
            <div className="md:hidden divide-y">
              {filtered.map((branch) => (
                <div key={branch.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{branch.name}</p>
                      {(Boolean(branch.settings.city) || Boolean(branch.settings.country)) && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3" />
                          {[branch.settings.city as string, branch.settings.country as string]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                    </div>
                    <Badge variant={branch.is_active ? "default" : "secondary"}>
                      {branch.is_active ? t("branchActive") : t("branchArchived")}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {branch.member_count}
                    </span>
                    <span>{branch.currency}</span>
                    <span>
                      {new Date(branch.created_at).toLocaleDateString(dateLocale, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  {canCreateBranch && (
                    <div className="flex gap-2">
                      {branch.is_active ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setArchiveConfirmId(branch.id)}
                          disabled={toggleActiveMutation.isPending}
                        >
                          <Archive className="mr-1 h-3.5 w-3.5" />
                          {t("archiveBranch")}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReactivate(branch.id)}
                          disabled={toggleActiveMutation.isPending}
                        >
                          {toggleActiveMutation.isPending ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="mr-1 h-3.5 w-3.5" />
                          )}
                          {t("reactivateBranch")}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Branch Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) resetForm();
          setCreateOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("createBranch")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Branch name */}
            <div className="space-y-2">
              <Label htmlFor="branch-name">{t("branchName")}</Label>
              <Input
                id="branch-name"
                placeholder={t("branchNamePlaceholder")}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            {/* Country & City */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="branch-country">{t("branchCountry")}</Label>
                <Input
                  id="branch-country"
                  placeholder={t("branchCountryPlaceholder")}
                  value={formCountry}
                  onChange={(e) => setFormCountry(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch-city">{t("branchCity")}</Label>
                <Input
                  id="branch-city"
                  placeholder={t("branchCityPlaceholder")}
                  value={formCity}
                  onChange={(e) => setFormCity(e.target.value)}
                />
              </div>
            </div>

            {/* Currency & Language */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="branch-currency">{t("branchCurrency")}</Label>
                <Select value={formCurrency} onValueChange={(v) => setFormCurrency(v ?? "")}>
                  <SelectTrigger id="branch-currency">
                    <SelectValue placeholder={t("branchCurrencyPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code} — {locale === "fr" ? c.nameFr : c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch-language">{t("branchLanguage")}</Label>
                <Select value={formLanguage} onValueChange={(v) => setFormLanguage(v ?? "en")}>
                  <SelectTrigger id="branch-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="fr">Fran\u00e7ais</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Founding President */}
            <div className="space-y-2">
              <Label htmlFor="president-name">{t("foundingPresident")}</Label>
              <Input
                id="president-name"
                placeholder={t("presidentNamePlaceholder")}
                value={formPresidentName}
                onChange={(e) => setFormPresidentName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="president-email">{t("presidentEmail")}</Label>
                <Input
                  id="president-email"
                  type="email"
                  placeholder={t("presidentEmailPlaceholder")}
                  value={formPresidentEmail}
                  onChange={(e) => setFormPresidentEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch-phone">{t("branchPhone")}</Label>
                <Input
                  id="branch-phone"
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createMutation.isPending}
            >
              {tc("cancel")}
            </Button>
            <Button
              onClick={handleCreateSubmit}
              disabled={!isFormValid || createMutation.isPending}
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {tc("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Confirmation Dialog */}
      <Dialog
        open={!!archiveConfirmId}
        onOpenChange={(open) => {
          if (!open) setArchiveConfirmId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("archiveBranch")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("archiveConfirm")}</p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setArchiveConfirmId(null)}
              disabled={toggleActiveMutation.isPending}
            >
              {tc("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (archiveConfirmId) handleArchive(archiveConfirmId);
              }}
              disabled={toggleActiveMutation.isPending}
            >
              {toggleActiveMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {tc("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
