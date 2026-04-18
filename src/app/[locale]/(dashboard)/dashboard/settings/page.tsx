"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
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
  LogOut,
  AlertTriangle,
  Bell,
  Power,
  ArrowRightLeft,
  ExternalLink,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useRouter, Link } from "@/i18n/routing";
import { useGroupSettings, useGroupPositions, useMembers } from "@/lib/hooks/use-supabase-query";
import { CURRENCIES } from "@/lib/currencies";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { RequirePermission } from "@/components/ui/permission-gate";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { PaymentsTab } from "@/components/settings/payments-tab";
import { StandingRulesTab } from "@/components/settings/standing-rules-tab";
import { getMemberName } from "@/lib/get-member-name";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/* Country → currency auto-detection map */
const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  "Cameroon": "XAF",
  "Nigeria": "NGN",
  "Ghana": "GHS",
  "Kenya": "KES",
  "South Africa": "ZAR",
  "Senegal": "XOF",
  "Côte d'Ivoire": "XOF",
  "Togo": "XOF",
  "Benin": "XOF",
  "Burkina Faso": "XOF",
  "Mali": "XOF",
  "Guinea": "GNF",
  "Sierra Leone": "SLE",
  "Liberia": "LRD",
  "Niger": "XOF",
  "Gambia": "GMD",
  "Tanzania": "TZS",
  "Uganda": "UGX",
  "Rwanda": "RWF",
  "Ethiopia": "ETB",
  "Somalia": "SOS",
  "DR Congo": "CDF",
  "Congo": "XAF",
  "Gabon": "XAF",
  "Chad": "XAF",
  "Central African Republic": "XAF",
  "Equatorial Guinea": "XAF",
  "Zimbabwe": "ZWL",
  "Zambia": "ZMW",
  "Mozambique": "MZN",
  "Botswana": "BWP",
  "Namibia": "NAD",
  "Malawi": "MWK",
  "United States": "USD",
  "United Kingdom": "GBP",
  "Canada": "CAD",
  "France": "EUR",
  "Germany": "EUR",
  "Belgium": "EUR",
  "Netherlands": "EUR",
  "Italy": "EUR",
  "Australia": "AUD",
};

export default function GroupSettingsPage() {
  const router = useRouter();
  const t = useTranslations("settings");
  const tCountries = useTranslations("countries");
  const locale = useLocale();
  const { groupId, currentGroup, currentMembership, user } = useGroup();
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
  const [editDateFormat, setEditDateFormat] = useState("DD/MM/YYYY");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [assignPositionId, setAssignPositionId] = useState<string | null>(null);
  const [assigningPosition, setAssigningPosition] = useState(false);
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
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  // Join approval state
  const [requireJoinApproval, setRequireJoinApproval] = useState(false);
  const [savingApproval, setSavingApproval] = useState(false);
  const [approvalSaveError, setApprovalSaveError] = useState<string | null>(null);
  const [approvalSaveSuccess, setApprovalSaveSuccess] = useState(false);

  // Danger zone
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [dangerError, setDangerError] = useState<string | null>(null);

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
      setEditDateFormat((settings.date_format as string) || "DD/MM/YYYY");

      // Load sharing controls from group data
      const sc = g.sharing_controls as Record<string, boolean> | null;
      if (sc) {
        setSharingControls({ ...sharingDefaults, ...sc });
      }

      // Load join approval setting
      setRequireJoinApproval(!!((settings as Record<string, unknown>).require_join_approval));
    }
  }, [group]);

  // Auto-detect currency when country changes (only if user actively changes it)
  const [countryUserChanged, setCountryUserChanged] = useState(false);
  useEffect(() => {
    if (!countryUserChanged || !editCountry) return;
    const matched = COUNTRY_CURRENCY_MAP[editCountry];
    if (matched) {
      setEditCurrency(matched);
    }
  }, [editCountry, countryUserChanged]);

  async function handleSaveSettings() {
    if (!groupId) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const supabase = createClient();

      // Merge new settings into existing settings JSONB to avoid wiping other keys
      const existingSettings = (groupData?.settings as Record<string, unknown>) || {};
      const mergedSettings = {
        ...existingSettings,
        country: editCountry,
        state_region: editRegion,
        city: editCity,
        date_format: editDateFormat,
      };

      const { data: updatedRows, error: updateError } = await supabase
        .from("groups")
        .update({
          name: editName.trim(),
          description: editDescription.trim() || null,
          currency: editCurrency,
          locale: editLocale,
          settings: mergedSettings,
        })
        .eq("id", groupId)
        .select();
      if (updateError) throw updateError;
      if (!updatedRows || updatedRows.length === 0) throw new Error(t("errors.updateFailed"));
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
      // Invalidate ALL group-related caches so GroupProvider and all consumers refresh
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["group-settings", groupId] }),
        queryClient.invalidateQueries({ queryKey: ["group-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["group", groupId] }),
        queryClient.invalidateQueries({ queryKey: ["memberships"] }),
      ]);
      // Force re-fetch group context by reloading after a brief delay
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        window.location.reload();
      }, 1000);
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

  async function handleSaveApproval(newValue: boolean) {
    if (!groupId) return;
    setSavingApproval(true);
    setApprovalSaveError(null);
    setApprovalSaveSuccess(false);
    try {
      const supabase = createClient();
      const existingSettings = (groupData?.settings as Record<string, unknown>) || {};
      const mergedSettings = { ...existingSettings, require_join_approval: newValue };
      const { error: updateError } = await supabase
        .from("groups")
        .update({ settings: mergedSettings })
        .eq("id", groupId);
      if (updateError) throw updateError;

      // If turning OFF approval, auto-approve all pending members
      if (!newValue) {
        await supabase
          .from("memberships")
          .update({ membership_status: "active" })
          .eq("group_id", groupId)
          .eq("membership_status", "pending_approval");
      }

      setRequireJoinApproval(newValue);
      await queryClient.invalidateQueries({ queryKey: ["group-settings", groupId] });
      await queryClient.invalidateQueries({ queryKey: ["members", groupId] });
      setApprovalSaveSuccess(true);
      setTimeout(() => setApprovalSaveSuccess(false), 3000);
    } catch (err) {
      setApprovalSaveError((err as Error).message);
      setRequireJoinApproval(!newValue);
    } finally {
      setSavingApproval(false);
    }
  }

  async function handleLeaveGroup() {
    if (!currentMembership || !groupId) return;
    setLeaving(true);
    setLeaveError(null);
    try {
      const supabase = createClient();
      const membershipRole = (currentMembership as unknown as Record<string, unknown>).role as string;
      if (membershipRole === "owner") {
        setLeaveError(t("cannotLeaveAsOwner"));
        return;
      }
      const { error: delError } = await supabase
        .from("memberships")
        .delete()
        .eq("id", (currentMembership as unknown as Record<string, unknown>).id as string);
      if (delError) throw delError;
      queryClient.invalidateQueries({ queryKey: ["memberships"] });
      router.push("/dashboard");
    } catch (err) {
      setLeaveError((err as Error).message);
    } finally {
      setLeaving(false);
      setShowLeaveConfirm(false);
    }
  }

  async function handleDeactivateGroup() {
    if (!groupId) return;
    setDeactivating(true);
    setDangerError(null);
    try {
      const supabase = createClient();
      const { data: deactivatedRows, error: err } = await supabase
        .from("groups")
        .update({ is_active: false })
        .eq("id", groupId)
        .select();
      if (err) throw err;
      if (!deactivatedRows || deactivatedRows.length === 0) throw new Error(t("errors.updateFailed"));
      await queryClient.invalidateQueries({ queryKey: ["memberships"] });
      setShowDeactivateConfirm(false);
      window.location.reload();
    } catch (err) {
      setDangerError((err as Error).message);
    } finally {
      setDeactivating(false);
    }
  }

  async function handleTransferOwnership() {
    if (!groupId || !transferTargetId || !currentMembership) return;
    setTransferring(true);
    setDangerError(null);
    try {
      const supabase = createClient();
      const { data: result, error: rpcErr } = await supabase.rpc("transfer_group_ownership", {
        p_group_id: groupId,
        p_new_owner_membership_id: transferTargetId,
      });
      if (rpcErr) throw rpcErr;
      const parsed = typeof result === "string" ? JSON.parse(result) : result;
      if (parsed?.status !== "success") {
        throw new Error(t("errors.transferFailed"));
      }
      await queryClient.invalidateQueries({ queryKey: ["memberships"] });
      setShowTransferDialog(false);
      window.location.reload();
    } catch (err) {
      setDangerError((err as Error).message);
    } finally {
      setTransferring(false);
    }
  }

  async function handleAssignPosition(positionId: string, membershipId: string) {
    if (assigningPosition) return;
    setAssigningPosition(true);
    try {
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
    } finally {
      setAssigningPosition(false);
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
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Tabs defaultValue="info">
        <TabsList className="h-10 w-full justify-start gap-1 overflow-x-auto bg-muted/60 p-1 dark:bg-muted/40">
          <TabsTrigger value="info" className="px-3 py-1.5 text-sm font-medium text-foreground/70 data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm dark:text-foreground/60 dark:data-[active]:bg-background dark:data-[active]:text-foreground">{t("profileTab")}</TabsTrigger>
          <TabsTrigger value="localization" className="px-3 py-1.5 text-sm font-medium text-foreground/70 data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm dark:text-foreground/60 dark:data-[active]:bg-background dark:data-[active]:text-foreground">{t("localizationTab")}</TabsTrigger>
          <TabsTrigger value="payments" className="px-3 py-1.5 text-sm font-medium text-foreground/70 data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm dark:text-foreground/60 dark:data-[active]:bg-background dark:data-[active]:text-foreground">{t("paymentsTab")}</TabsTrigger>
          <TabsTrigger value="standing" className="px-3 py-1.5 text-sm font-medium text-foreground/70 data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm dark:text-foreground/60 dark:data-[active]:bg-background dark:data-[active]:text-foreground">{t("standingTab")}</TabsTrigger>
          <TabsTrigger value="positions" className="px-3 py-1.5 text-sm font-medium text-foreground/70 data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm dark:text-foreground/60 dark:data-[active]:bg-background dark:data-[active]:text-foreground">{t("positionsTab")}</TabsTrigger>
          <TabsTrigger value="notifications" className="px-3 py-1.5 text-sm font-medium text-foreground/70 data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm dark:text-foreground/60 dark:data-[active]:bg-background dark:data-[active]:text-foreground">{t("notificationsTab")}</TabsTrigger>
          {isBranch && (
            <TabsTrigger value="data-sharing" className="px-3 py-1.5 text-sm font-medium text-foreground/70 data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm dark:text-foreground/60 dark:data-[active]:bg-background dark:data-[active]:text-foreground">{t("dataSharingTab")}</TabsTrigger>
          )}
          <TabsTrigger value="danger" className="px-3 py-1.5 text-sm font-medium text-destructive/70 data-[active]:bg-destructive/10 data-[active]:text-destructive data-[active]:shadow-sm">{t("dangerZone")}</TabsTrigger>
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
                                // Group logos are intentional public branding — stored in the
                                // `avatars` bucket alongside member avatars. group-documents is
                                // private post-00083; uploading logos there would 403 on display.
                                const path = `group-logos/${groupId}/${Date.now()}-${file.name}`;
                                const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
                                if (upErr) throw upErr;
                                const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
                                const { data: logoUpdatedRows, error: updateErr } = await supabase.from("groups").update({ logo_url: urlData.publicUrl }).eq("id", groupId).select();
                                if (updateErr) throw updateErr;
                                if (!logoUpdatedRows || logoUpdatedRows.length === 0) throw new Error(t("errors.logoUpdateFailed"));
                                await Promise.all([
                                  queryClient.invalidateQueries({ queryKey: ["group-settings", groupId] }),
                                  queryClient.invalidateQueries({ queryKey: ["group-settings"] }),
                                  queryClient.invalidateQueries({ queryKey: ["memberships"] }),
                                ]);
                                setSaveSuccess(true);
                                setTimeout(() => { setSaveSuccess(false); window.location.reload(); }, 1000);
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
                          className="mt-1 flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                          className="mt-1 flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
          {/* Access Control Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4" />
                {t("accessControlTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("accessControlDesc")}</p>
              <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">{t("requireJoinApproval")}</Label>
                  <p className="text-xs text-muted-foreground">{t("requireJoinApprovalDesc")}</p>
                </div>
                <Switch
                  checked={requireJoinApproval}
                  onCheckedChange={(checked: boolean) => {
                    if (canManageSettings && !savingApproval) handleSaveApproval(checked);
                  }}
                  disabled={!canManageSettings || savingApproval}
                />
              </div>
              {approvalSaveError && <p className="text-sm text-destructive">{approvalSaveError}</p>}
              {approvalSaveSuccess && <p className="text-sm text-emerald-600 dark:text-emerald-400">{t("saved")}</p>}
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
                        <select className="mt-1 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm" value={editCountry} onChange={(e) => { setEditCountry(e.target.value); setCountryUserChanged(true); }}>
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
                        <select className="mt-1 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm" value={editLocale} onChange={(e) => setEditLocale(e.target.value)}>
                          <option value="en">English</option>
                          <option value="fr">Français</option>
                        </select>
                      ) : (
                        <p className="mt-1 text-sm font-medium">{editLocale === "fr" ? "Français" : "English"}</p>
                      )}
                    </div>
                  </div>
                  {/* Date Format */}
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">{t("dateFormat")}</Label>
                    {canManageSettings ? (
                      <select className="mt-1 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm" value={editDateFormat} onChange={(e) => setEditDateFormat(e.target.value)}>
                        <option value="DD/MM/YYYY">15/03/2026 (DD/MM/YYYY)</option>
                        <option value="MM/DD/YYYY">03/15/2026 (MM/DD/YYYY)</option>
                        <option value="YYYY-MM-DD">2026-03-15 (YYYY-MM-DD)</option>
                        <option value="D MMMM YYYY">{new Date(2026, 2, 15).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "long", year: "numeric" })}</option>
                        <option value="MMMM D, YYYY">{new Date(2026, 2, 15).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { month: "long", day: "numeric", year: "numeric" })}</option>
                      </select>
                    ) : (
                      <p className="mt-1 text-sm font-medium">{editDateFormat || "DD/MM/YYYY"}</p>
                    )}
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
                        <select className="mt-1 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm" value={editCurrency} onChange={(e) => setEditCurrency(e.target.value)}>
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

        {/* Standing Rules Tab */}
        <TabsContent value="standing" className="mt-6">
          <StandingRulesTab />
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
                                          disabled={assigningPosition}
                                          onClick={() => handleAssignPosition(posId, m.id as string)}>
                                          {getMemberName(m) || "—"}
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
                                const holderName = getMemberName(membership as Record<string, unknown>) || "—";

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
        {/* Notifications Tab */}
        <TabsContent value="notifications" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-4 w-4" />
                {t("notificationsTab")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("notificationsSettingsDesc")}</p>
              <Link href="/dashboard/settings/notifications">
                <Button variant="outline" className="gap-2">
                  <Bell className="h-4 w-4" />
                  {t("manageNotifications")}
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Danger Zone Tab */}
        <TabsContent value="danger" className="mt-6 space-y-6">
          {dangerError && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {dangerError}
            </div>
          )}

          {/* Deactivate Group */}
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-destructive">
                <Power className="h-4 w-4" />
                {t("deactivateGroup")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("deactivateGroupDesc")}</p>
              {!showDeactivateConfirm ? (
                <Button variant="destructive" size="sm" onClick={() => setShowDeactivateConfirm(true)}>
                  <Power className="mr-2 h-4 w-4" />
                  {t("deactivateGroup")}
                </Button>
              ) : (
                <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-3">
                  <p className="text-sm font-medium text-destructive">{t("deactivateConfirmMsg")}</p>
                  <div className="flex items-center gap-2">
                    <Button variant="destructive" size="sm" onClick={handleDeactivateGroup} disabled={deactivating}>
                      {deactivating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t("confirmDeactivate")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowDeactivateConfirm(false)}>
                      {t("cancelLeave")}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Transfer Ownership */}
          {(currentMembership as unknown as Record<string, unknown>)?.role === "owner" && (
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-destructive">
                  <ArrowRightLeft className="h-4 w-4" />
                  {t("transferOwnership")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{t("transferOwnershipDesc")}</p>
                <Button variant="destructive" size="sm" onClick={() => setShowTransferDialog(true)}>
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                  {t("transferOwnership")}
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

      </Tabs>

      {/* Transfer Ownership Dialog */}
      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-destructive" />
              {t("transferOwnership")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("transferOwnershipDialogDesc")}</p>
            <div className="space-y-2">
              <Label>{t("selectNewOwner")}</Label>
              <Select value={transferTargetId} onValueChange={(v) => setTransferTargetId(v || "")}>
                <SelectTrigger><SelectValue placeholder={t("selectNewOwner")} /></SelectTrigger>
                <SelectContent>
                  {(members || [])
                    .filter((m: Record<string, unknown>) => {
                      const role = m.role as string;
                      const id = m.id as string;
                      const myId = (currentMembership as unknown as Record<string, unknown>)?.id as string;
                      return (role === "admin" || role === "moderator") && id !== myId;
                    })
                    .map((m: Record<string, unknown>) => (
                      <SelectItem key={m.id as string} value={m.id as string}>
                        {getMemberName(m)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferDialog(false)}>{t("cancelLeave")}</Button>
            <Button variant="destructive" onClick={handleTransferOwnership} disabled={transferring || !transferTargetId}>
              {transferring && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("confirmTransfer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave Group Section — visible to all non-owner members */}
      {currentMembership && (currentMembership as unknown as Record<string, unknown>).role !== "owner" && (
        <Card className="mt-8 border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <LogOut className="h-4 w-4" />
              {t("leaveGroup")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("leaveGroupDesc")}</p>
            {leaveError && (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {leaveError}
              </p>
            )}
            {!showLeaveConfirm ? (
              <Button variant="destructive" size="sm" onClick={() => setShowLeaveConfirm(true)}>
                <LogOut className="mr-2 h-4 w-4" />
                {t("leaveGroup")}
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="destructive" size="sm" onClick={handleLeaveGroup} disabled={leaving}>
                  {leaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
                  {t("confirmLeave")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowLeaveConfirm(false)}>
                  {t("cancelLeave")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div></RequirePermission>
  );
}
