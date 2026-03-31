"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Globe,
  Shield,
  Users,
  Settings2,
  Loader2,
  Save,
  Plus,
  UserPlus,
  Camera,
  Share2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useGroupSettings, useGroupPositions, useMembers } from "@/lib/hooks/use-supabase-query";
import { CURRENCIES } from "@/lib/currencies";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { RequirePermission } from "@/components/ui/permission-gate";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { PaymentsTab } from "@/components/settings/payments-tab";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function GroupSettingsPage() {
  const t = useTranslations("settings");
  const tCountries = useTranslations("countries");
  const { groupId, currentGroup } = useGroup();
  const { hasPermission } = usePermissions();
  const canManageSettings = hasPermission("settings.manage");
  const queryClient = useQueryClient();
  const { data: group, isLoading: groupLoading, isError: groupError, error: groupErr, refetch: refetchGroup } = useGroupSettings();
  const { data: positions, isLoading: posLoading, isError: posError, error: posErr, refetch: refetchPos } = useGroupPositions();

  const isLoading = groupLoading || posLoading;
  const isError = groupError || posError;

  // Editable form state
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCurrency, setEditCurrency] = useState("");
  const [editLocale, setEditLocale] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editRegion, setEditRegion] = useState("");
  const [editCity, setEditCity] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [assignPositionId, setAssignPositionId] = useState<string | null>(null);
  const [newPositionTitle, setNewPositionTitle] = useState("");
  const [addingPosition, setAddingPosition] = useState(false);
  const { data: members } = useMembers();

  // Data sharing controls state
  const isBranch = currentGroup?.group_level === "branch";
  const sharingDefaults: Record<string, boolean> = {
    member_count: true,
    member_roster: false,
    financial_summary: true,
    detailed_transactions: false,
    attendance: true,
    events: true,
    minutes: false,
    relief: true,
  };
  const [sharingControls, setSharingControls] = useState<Record<string, boolean>>(sharingDefaults);
  const [savingSharing, setSavingSharing] = useState(false);
  const [sharingSaveError, setSharingSaveError] = useState<string | null>(null);
  const [sharingSaveSuccess, setSharingSaveSuccess] = useState(false);

  // Populate form when data loads
  useEffect(() => {
    if (group) {
      const g = group as Record<string, unknown>;
      setEditName((g.name as string) || "");
      setEditDescription((g.description as string) || "");
      setEditCurrency((g.currency as string) || "");
      setEditLocale((g.locale as string) || "");
      const settings = (g.settings as Record<string, unknown>) || {};
      setEditCountry((settings.country as string) || "");
      setEditRegion((settings.state_region as string) || (g.state_region as string) || "");
      setEditCity((settings.city as string) || (g.city as string) || "");

      // Load sharing controls from group data
      const sc = g.sharing_controls as Record<string, boolean> | null;
      if (sc) {
        setSharingControls({ ...sharingDefaults, ...sc });
      }
    }
  }, [group]);

  async function handleSaveSettings() {
    if (!groupId) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("groups")
        .update({
          name: editName.trim(),
          description: editDescription.trim() || null,
          currency: editCurrency,
          locale: editLocale,
          settings: {
            country: editCountry,
            state_region: editRegion,
            city: editCity,
          },
        })
        .eq("id", groupId);
      if (updateError) throw updateError;
      // Audit log
      try {
        const { logActivity } = await import("@/lib/audit-log");
        await logActivity(supabase, {
          groupId,
          action: "settings.updated",
          entityType: "settings",
          description: `Group settings updated`,
          metadata: { name: editName.trim(), currency: editCurrency, locale: editLocale },
        });
      } catch { /* best-effort */ }
      await queryClient.invalidateQueries({ queryKey: ["group-settings", groupId] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSharingControls() {
    if (!groupId) return;
    setSavingSharing(true);
    setSharingSaveError(null);
    setSharingSaveSuccess(false);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("groups")
        .update({ sharing_controls: sharingControls })
        .eq("id", groupId);
      if (updateError) throw updateError;
      await queryClient.invalidateQueries({ queryKey: ["group-settings", groupId] });
      setSharingSaveSuccess(true);
      setTimeout(() => setSharingSaveSuccess(false), 3000);
    } catch (err) {
      setSharingSaveError((err as Error).message);
    } finally {
      setSavingSharing(false);
    }
  }

  async function handleAssignPosition(positionId: string, membershipId: string) {
    const supabase = createClient();
    const { error } = await supabase.from("position_assignments").insert({
      position_id: positionId,
      membership_id: membershipId,
    });
    if (error) {
      setSaveError(error.message);
    } else {
      setAssignPositionId(null);
      await queryClient.invalidateQueries({ queryKey: ["group-positions", groupId] });
    }
  }

  async function handleAddPosition() {
    if (!groupId || !newPositionTitle.trim()) return;
    setAddingPosition(true);
    const supabase = createClient();
    const { error } = await supabase.from("group_positions").insert({
      group_id: groupId,
      title: newPositionTitle.trim(),
      is_executive: false,
      is_default: false,
      sort_order: positionsData.length + 1,
    });
    if (error) {
      setSaveError(error.message);
    } else {
      setNewPositionTitle("");
      await queryClient.invalidateQueries({ queryKey: ["group-positions", groupId] });
    }
    setAddingPosition(false);
  }

  if (isLoading) {
    return <RequirePermission permission="settings.manage"><ListSkeleton rows={5} /></RequirePermission>;
  }

  if (isError) {
    return (
      <RequirePermission permission="settings.manage"><ErrorState
        message={(groupErr as Error)?.message || (posErr as Error)?.message}
        onRetry={() => {
          refetchGroup();
          refetchPos();
        }}
      /></RequirePermission>
    );
  }

  const groupData = group as Record<string, unknown> | null;
  const positionsData = (positions || []) as Record<string, unknown>[];

  return (
    <RequirePermission permission="settings.manage"><div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Tabs defaultValue="info">
        <TabsList className="h-10 w-full justify-start gap-1 overflow-x-auto bg-muted/60 p-1 dark:bg-muted/40">
          <TabsTrigger value="info" className="px-3 py-1.5 text-sm font-medium text-foreground/70 data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm dark:text-foreground/60 dark:data-[active]:bg-background dark:data-[active]:text-foreground">{t("profileTab")}</TabsTrigger>
          <TabsTrigger value="localization" className="px-3 py-1.5 text-sm font-medium text-foreground/70 data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm dark:text-foreground/60 dark:data-[active]:bg-background dark:data-[active]:text-foreground">{t("localizationTab")}</TabsTrigger>
          <TabsTrigger value="payments" className="px-3 py-1.5 text-sm font-medium text-foreground/70 data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm dark:text-foreground/60 dark:data-[active]:bg-background dark:data-[active]:text-foreground">{t("paymentsTab")}</TabsTrigger>
          <TabsTrigger value="positions" className="px-3 py-1.5 text-sm font-medium text-foreground/70 data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm dark:text-foreground/60 dark:data-[active]:bg-background dark:data-[active]:text-foreground">{t("positionsTab")}</TabsTrigger>
          {isBranch && (
            <TabsTrigger value="data-sharing" className="px-3 py-1.5 text-sm font-medium text-foreground/70 data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm dark:text-foreground/60 dark:data-[active]:bg-background dark:data-[active]:text-foreground">{t("dataSharingTab")}</TabsTrigger>
          )}
        </TabsList>

        {/* Group Info Tab */}
        <TabsContent value="info" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-4 w-4" />
                {t("groupInfo")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {groupData ? (
                <div className="space-y-4">
                  {/* Logo + Name */}
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-xl font-bold text-primary overflow-hidden">
                        {groupData.logo_url ? (
                          <img src={groupData.logo_url as string} alt="" className="h-16 w-16 rounded-2xl object-cover" />
                        ) : (
                          getInitials((groupData.name as string) || "G")
                        )}
                      </div>
                      {canManageSettings && (
                        <>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            id="logo-upload"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file || !groupId) return;
                              if (file.size > 2 * 1024 * 1024) {
                                setSaveError(t("logoTooLarge"));
                                return;
                              }
                              setUploadingLogo(true);
                              setSaveError(null);
                              try {
                                const supabase = createClient();
                                const path = `logos/${groupId}/${Date.now()}-${file.name}`;
                                const { error: upErr } = await supabase.storage.from("group-documents").upload(path, file, { upsert: true });
                                if (upErr) throw upErr;
                                const { data: urlData } = supabase.storage.from("group-documents").getPublicUrl(path);
                                const { error: updateErr } = await supabase.from("groups").update({ logo_url: urlData.publicUrl }).eq("id", groupId);
                                if (updateErr) throw updateErr;
                                queryClient.invalidateQueries({ queryKey: ["group-settings"] });
                                setSaveSuccess(true);
                                setTimeout(() => setSaveSuccess(false), 3000);
                              } catch (err) {
                                setSaveError((err as Error).message || t("logoUploadFailed"));
                              } finally { setUploadingLogo(false); }
                            }}
                          />
                          <button
                            className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-emerald-600 text-white text-xs shadow-sm hover:bg-emerald-700 dark:border-slate-900"
                            onClick={() => document.getElementById("logo-upload")?.click()}
                            disabled={uploadingLogo}
                          >
                            {uploadingLogo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                          </button>
                        </>
                      )}
                    </div>
                    <div className="flex-1">
                      {canManageSettings ? (
                        <div className="space-y-1">
                          <Label className="text-xs">{t("groupName")}</Label>
                          <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                        </div>
                      ) : (
                        <>
                          <h3 className="text-lg font-semibold">{groupData.name as string}</h3>
                          <p className="text-sm text-muted-foreground">{(groupData.group_type as string) || "general"}</p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs font-medium text-muted-foreground">{t("groupType")}</p>
                      <p className="mt-1 text-sm font-medium capitalize">{(groupData.group_type as string) || "—"}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <Label className="text-xs font-medium text-muted-foreground">{t("currency")}</Label>
                      {canManageSettings ? (
                        <select
                          value={editCurrency}
                          onChange={(e) => setEditCurrency(e.target.value)}
                          className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="XAF">XAF</option>
                          <option value="XOF">XOF</option>
                          <option value="NGN">NGN</option>
                          <option value="KES">KES</option>
                          <option value="GHS">GHS</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="GBP">GBP</option>
                        </select>
                      ) : (
                        <p className="mt-1 text-sm font-medium">{(groupData.currency as string) || "—"}</p>
                      )}
                    </div>
                    <div className="rounded-lg border p-3">
                      <Label className="text-xs font-medium text-muted-foreground">{t("defaultLocale")}</Label>
                      {canManageSettings ? (
                        <select
                          value={editLocale}
                          onChange={(e) => setEditLocale(e.target.value)}
                          className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="en">English</option>
                          <option value="fr">Français</option>
                        </select>
                      ) : (
                        <p className="mt-1 text-sm font-medium">{(groupData.locale as string) || "—"}</p>
                      )}
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs font-medium text-muted-foreground">{t("status")}</p>
                      <p className="mt-1 text-sm font-medium">{(groupData.is_active as boolean) ? t("statusActive") : t("statusInactive")}</p>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="rounded-lg border p-3">
                    <Label className="text-xs font-medium text-muted-foreground">{t("groupDescription")}</Label>
                    {canManageSettings ? (
                      <Textarea className="mt-1" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} />
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">{(groupData.description as string) || "—"}</p>
                    )}
                  </div>

                  {/* Save Button */}
                  {canManageSettings && (
                    <div className="space-y-2">
                      {saveError && <p className="text-sm text-destructive">{saveError}</p>}
                      {saveSuccess && <p className="text-sm text-emerald-600 dark:text-emerald-400">{t("saved")}</p>}
                      <Button onClick={handleSaveSettings} disabled={saving || !editName.trim() || !canManageSettings}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {t("saveSettings")}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Localization Tab */}
        <TabsContent value="localization" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-4 w-4" />
                {t("localizationTab")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {groupData ? (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">{t("country")}</Label>
                      {canManageSettings ? (
                        <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={editCountry} onChange={(e) => setEditCountry(e.target.value)}>
                          <option value="">—</option>
                          <optgroup label={tCountries("westAfrica")}>
                            {["Cameroon","Nigeria","Ghana","Senegal","Côte d'Ivoire","Togo","Benin","Burkina Faso","Mali","Guinea","Sierra Leone","Liberia","Niger","Gambia"].map(c => <option key={c} value={c}>{c}</option>)}
                          </optgroup>
                          <optgroup label={tCountries("eastAfrica")}>
                            {["Kenya","Tanzania","Uganda","Rwanda","Ethiopia","Somalia"].map(c => <option key={c} value={c}>{c}</option>)}
                          </optgroup>
                          <optgroup label={tCountries("southernAfrica")}>
                            {["South Africa","Zimbabwe","Zambia","Mozambique","Botswana","Namibia","Malawi"].map(c => <option key={c} value={c}>{c}</option>)}
                          </optgroup>
                          <optgroup label={tCountries("centralAfrica")}>
                            {["DR Congo","Congo","Gabon","Chad","Central African Republic","Equatorial Guinea"].map(c => <option key={c} value={c}>{c}</option>)}
                          </optgroup>
                          <optgroup label={tCountries("international")}>
                            {["United States","United Kingdom","Canada","France","Germany","Belgium","Netherlands","Italy","Australia"].map(c => <option key={c} value={c}>{c}</option>)}
                          </optgroup>
                        </select>
                      ) : (
                        <p className="mt-1 text-sm font-medium">{editCountry || "—"}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">{t("defaultLocale")}</Label>
                      {canManageSettings ? (
                        <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={editLocale} onChange={(e) => setEditLocale(e.target.value)}>
                          <option value="en">English</option>
                          <option value="fr">Français</option>
                        </select>
                      ) : (
                        <p className="mt-1 text-sm font-medium">{editLocale === "fr" ? "Français" : "English"}</p>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">{t("stateRegion")}</Label>
                      {canManageSettings ? (
                        <Input className="mt-1" value={editRegion} onChange={(e) => setEditRegion(e.target.value)} />
                      ) : (
                        <p className="mt-1 text-sm font-medium">{editRegion || "—"}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">{t("city")}</Label>
                      {canManageSettings ? (
                        <Input className="mt-1" value={editCity} onChange={(e) => setEditCity(e.target.value)} />
                      ) : (
                        <p className="mt-1 text-sm font-medium">{editCity || "—"}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">{t("currency")}</Label>
                      {canManageSettings ? (
                        <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={editCurrency} onChange={(e) => setEditCurrency(e.target.value)}>
                          {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                        </select>
                      ) : (
                        <p className="mt-1 text-sm font-medium">{editCurrency || "—"}</p>
                      )}
                    </div>
                  </div>
                  {canManageSettings && (
                    <div className="space-y-2">
                      {saveError && <p className="text-sm text-destructive">{saveError}</p>}
                      {saveSuccess && <p className="text-sm text-emerald-600 dark:text-emerald-400">{t("saved")}</p>}
                      <Button onClick={handleSaveSettings} disabled={saving || !canManageSettings}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {t("saveSettings")}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="mt-6">
          <PaymentsTab />
        </TabsContent>

        {/* Positions Tab */}
        <TabsContent value="positions" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4" />
                {t("positions")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {positionsData.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title={t("noPositions")}
                  description={t("noPositionsDesc")}
                />
              ) : (
                <div className="space-y-3">
                  {positionsData.map((pos) => {
                    const posId = pos.id as string;
                    const posName = (pos.title as string) || "—";
                    const posNameFr = pos.title_fr as string | null;
                    const assignments = (pos.position_assignments || []) as Record<string, unknown>[];

                    // Get current holders (active assignments)
                    const activeHolders = assignments.filter((a) => {
                      const endDate = a.ended_at as string | null;
                      return !endDate || new Date(endDate) > new Date();
                    });

                    return (
                      <div key={posId} className="rounded-lg border p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h4 className="font-medium text-sm">{posName}</h4>
                            {posNameFr && (
                              <p className="text-xs text-muted-foreground">{posNameFr}</p>
                            )}
                          </div>
                          {activeHolders.length === 0 ? (
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">{t("vacant")}</Badge>
                              {canManageSettings && (
                                assignPositionId === posId ? (
                                  <div className="flex flex-wrap gap-1">
                                    {(members || []).slice(0, 10).map((m: Record<string, unknown>) => {
                                      const mp = m.profile as { full_name?: string } | undefined;
                                      return (
                                        <Button key={m.id as string} variant="outline" size="sm" className="h-7 text-xs"
                                          onClick={() => handleAssignPosition(posId, m.id as string)}>
                                          {mp?.full_name || (m.display_name as string) || "—"}
                                        </Button>
                                      );
                                    })}
                                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAssignPositionId(null)}>✕</Button>
                                  </div>
                                ) : (
                                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setAssignPositionId(posId)}>
                                    <UserPlus className="h-3 w-3" />
                                    {t("assign")}
                                  </Button>
                                )
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {activeHolders.map((holder, i) => {
                                const membership = holder.membership as Record<string, unknown> | undefined;
                                const profiles = membership?.profiles;
                                const profile = (
                                  Array.isArray(profiles) ? profiles[0] : profiles
                                ) as { full_name?: string; avatar_url?: string } | null;
                                const holderName = profile?.full_name || "—";

                                return (
                                  <div key={i} className="flex items-center gap-2">
                                    <Avatar className="h-7 w-7">
                                      {profile?.avatar_url && (
                                        <AvatarImage src={profile.avatar_url} alt={holderName} />
                                      )}
                                      <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                                        {getInitials(holderName)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="text-sm">{holderName}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {canManageSettings && (
                <div className="mt-4 flex gap-2">
                  <Input
                    placeholder={t("positionNamePlaceholder") || "New position name..."}
                    value={newPositionTitle}
                    onChange={(e) => setNewPositionTitle(e.target.value)}
                    className="max-w-xs"
                    onKeyDown={(e) => e.key === "Enter" && handleAddPosition()}
                  />
                  <Button onClick={handleAddPosition} disabled={addingPosition || !newPositionTitle.trim()} size="sm">
                    {addingPosition ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Data Sharing Tab — branch groups only */}
        {isBranch && (
          <TabsContent value="data-sharing" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Share2 className="h-4 w-4" />
                  {t("dataSharingTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-6">{t("dataSharingDescription")}</p>
                <div className="space-y-4">
                  {(["member_count", "member_roster", "financial_summary", "detailed_transactions", "attendance", "events", "minutes", "relief"] as const).map((key) => (
                    <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                      <Label htmlFor={`sharing-${key}`} className="text-sm font-medium cursor-pointer">
                        {t(`sharing_${key}`)}
                      </Label>
                      <Switch
                        id={`sharing-${key}`}
                        checked={!!sharingControls[key]}
                        onCheckedChange={(checked: boolean) =>
                          setSharingControls((prev) => ({ ...prev, [key]: checked }))
                        }
                        disabled={!canManageSettings}
                      />
                    </div>
                  ))}
                </div>
                {canManageSettings && (
                  <div className="mt-6 space-y-2">
                    {sharingSaveError && <p className="text-sm text-destructive">{sharingSaveError}</p>}
                    {sharingSaveSuccess && <p className="text-sm text-emerald-600 dark:text-emerald-400">{t("dataSharingSaved")}</p>}
                    <Button onClick={handleSaveSharingControls} disabled={savingSharing}>
                      {savingSharing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      {t("saveSettings")}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div></RequirePermission>
  );
}
