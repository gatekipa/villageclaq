"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Ticket,
  Plus,
  Copy,
  Calendar,
  Hash,
  Loader2,
  Ban,
  Share2,
  Download,
  Crown,
  Star,
  Sparkles,
  StickyNote,
  Eye,
  Check,
} from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";

type VoucherTier = "starter" | "pro" | "enterprise";
type VoucherStatus = "active" | "used" | "expired" | "revoked";

interface SubscriptionVoucher {
  id: string;
  code: string;
  tier: VoucherTier;
  duration_days: number;
  max_uses: number;
  current_uses: number;
  status: VoucherStatus;
  used_by_groups: Array<{
    group_id: string;
    group_name: string;
    redeemed_by: string;
    redeemed_at: string;
  }>;
  notes: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(length = 8): string {
  let code = "";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[arr[i] % CODE_CHARS.length];
  }
  return code;
}

const statusColors: Record<VoucherStatus, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  used: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  expired: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  revoked: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const tierIcons: Record<VoucherTier, typeof Star> = {
  starter: Star,
  pro: Crown,
  enterprise: Sparkles,
};

const tierColors: Record<VoucherTier, string> = {
  starter: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  pro: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  enterprise: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

export default function VouchersPage() {
  const t = useTranslations("admin");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [usageDialogOpen, setUsageDialogOpen] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<SubscriptionVoucher | null>(null);
  const [vouchers, setVouchers] = useState<SubscriptionVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterTier, setFilterTier] = useState<string>("all");

  // Create voucher form state
  const [newTier, setNewTier] = useState<VoucherTier>("starter");
  const [newDuration, setNewDuration] = useState("30");
  const [newMaxUses, setNewMaxUses] = useState("1");
  const [newNotes, setNewNotes] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");

  // Bulk generate form state
  const [bulkCount, setBulkCount] = useState("10");
  const [bulkTier, setBulkTier] = useState<VoucherTier>("starter");
  const [bulkDuration, setBulkDuration] = useState("30");
  const [bulkMaxUses, setBulkMaxUses] = useState("1");
  const [bulkNotes, setBulkNotes] = useState("");
  const [bulkExpiresAt, setBulkExpiresAt] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const supabase = createClient();

  const fetchVouchers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("subscription_vouchers")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      setVouchers(data as unknown as SubscriptionVoucher[]);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchVouchers();
  }, [fetchVouchers]);

  const handleCreateVoucher = async () => {
    setSubmitting(true);
    const code = generateCode();

    const { data: userData } = await supabase.auth.getUser();

    const payload: Record<string, unknown> = {
      code,
      tier: newTier,
      duration_days: parseInt(newDuration),
      max_uses: parseInt(newMaxUses),
      current_uses: 0,
      status: "active",
      used_by_groups: [],
      notes: newNotes || null,
      expires_at: newExpiresAt || null,
      created_by: userData?.user?.id || null,
    };

    const { error } = await supabase.from("subscription_vouchers").insert(payload);

    if (!error) {
      setCreateDialogOpen(false);
      resetCreateForm();
      fetchVouchers();
    }
    setSubmitting(false);
  };

  const handleBulkGenerate = async () => {
    setBulkSubmitting(true);
    const count = parseInt(bulkCount);
    const { data: userData } = await supabase.auth.getUser();

    const codes: string[] = [];
    const payloads = [];
    for (let i = 0; i < count; i++) {
      const code = generateCode();
      codes.push(code);
      payloads.push({
        code,
        tier: bulkTier,
        duration_days: parseInt(bulkDuration),
        max_uses: parseInt(bulkMaxUses),
        current_uses: 0,
        status: "active" as const,
        used_by_groups: [],
        notes: bulkNotes || null,
        expires_at: bulkExpiresAt || null,
        created_by: userData?.user?.id || null,
      });
    }

    const { error } = await supabase.from("subscription_vouchers").insert(payloads);

    if (!error) {
      // Export as CSV
      const csvHeader = "code,tier,duration_days,max_uses,expires_at\n";
      const csvRows = payloads.map((p) =>
        `${p.code},${p.tier},${p.duration_days},${p.max_uses},${p.expires_at || ""}`
      ).join("\n");
      const blob = new Blob([csvHeader + csvRows], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vouchers_${bulkTier}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      setBulkDialogOpen(false);
      resetBulkForm();
      fetchVouchers();
    }
    setBulkSubmitting(false);
  };

  const handleRevoke = async (voucher: SubscriptionVoucher) => {
    const { error } = await supabase
      .from("subscription_vouchers")
      .update({ status: "revoked" })
      .eq("id", voucher.id);

    if (!error) {
      fetchVouchers();
    }
  };

  const handleCopyCode = (voucher: SubscriptionVoucher) => {
    navigator.clipboard.writeText(voucher.code);
    setCopiedId(voucher.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleShareWhatsApp = (voucher: SubscriptionVoucher) => {
    const tierLabel = t(`svTier${voucher.tier.charAt(0).toUpperCase() + voucher.tier.slice(1)}`);
    const durationLabel = voucher.duration_days === 30
      ? t("svDuration30")
      : voucher.duration_days === 90
      ? t("svDuration90")
      : voucher.duration_days === 365
      ? t("svDuration365")
      : `${voucher.duration_days} days`;

    const message = t("svWhatsAppMessage", {
      code: voucher.code,
      tier: tierLabel,
      duration: durationLabel,
    });

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
  };

  const resetCreateForm = () => {
    setNewTier("starter");
    setNewDuration("30");
    setNewMaxUses("1");
    setNewNotes("");
    setNewExpiresAt("");
  };

  const resetBulkForm = () => {
    setBulkCount("10");
    setBulkTier("starter");
    setBulkDuration("30");
    setBulkMaxUses("1");
    setBulkNotes("");
    setBulkExpiresAt("");
  };

  const computeStatus = (voucher: SubscriptionVoucher): VoucherStatus => {
    if (voucher.status === "revoked") return "revoked";
    if (voucher.current_uses >= voucher.max_uses) return "used";
    if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) return "expired";
    return voucher.status;
  };

  const durationLabel = (days: number) => {
    if (days === 30) return t("svDuration30");
    if (days === 90) return t("svDuration90");
    if (days === 365) return t("svDuration365");
    return `${days}d`;
  };

  // Filter vouchers
  const filteredVouchers = vouchers.filter((v) => {
    const displayStatus = computeStatus(v);
    if (filterStatus !== "all" && displayStatus !== filterStatus) return false;
    if (filterTier !== "all" && v.tier !== filterTier) return false;
    return true;
  });

  // Stats
  const stats = {
    total: vouchers.length,
    active: vouchers.filter((v) => computeStatus(v) === "active").length,
    used: vouchers.filter((v) => computeStatus(v) === "used").length,
    totalRedemptions: vouchers.reduce((sum, v) => sum + v.current_uses, 0),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("svTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("svSubtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Bulk Generate Dialog */}
          <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
            <DialogTrigger
              render={
                <Button variant="outline" className="gap-2">
                  <Download className="h-4 w-4" />
                  {t("svBulkGenerate")}
                </Button>
              }
            />
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("svBulkGenerate")}</DialogTitle>
                <DialogDescription>
                  {t("svBulkGenerateDesc")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("svBulkCount")}</Label>
                    <Input
                      type="number"
                      min="1"
                      max="500"
                      value={bulkCount}
                      onChange={(e) => setBulkCount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("svTierLabel")}</Label>
                    <Select value={bulkTier} onValueChange={(v) => setBulkTier(v as VoucherTier)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="starter">{t("svTierStarter")}</SelectItem>
                        <SelectItem value="pro">{t("svTierPro")}</SelectItem>
                        <SelectItem value="enterprise">{t("svTierEnterprise")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("svDurationLabel")}</Label>
                    <Select value={bulkDuration} onValueChange={(v) => v && setBulkDuration(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">{t("svDuration30")}</SelectItem>
                        <SelectItem value="90">{t("svDuration90")}</SelectItem>
                        <SelectItem value="365">{t("svDuration365")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("svMaxUsesLabel")}</Label>
                    <Input
                      type="number"
                      min="1"
                      value={bulkMaxUses}
                      onChange={(e) => setBulkMaxUses(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("svExpiresAt")}</Label>
                  <Input
                    type="date"
                    value={bulkExpiresAt}
                    onChange={(e) => setBulkExpiresAt(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("svNotesLabel")}</Label>
                  <Input
                    placeholder={t("svNotesPlaceholder")}
                    value={bulkNotes}
                    onChange={(e) => setBulkNotes(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleBulkGenerate}
                  disabled={bulkSubmitting || !bulkCount}
                >
                  {bulkSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {t("svBulkGenerateAndExport")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Create Voucher Dialog */}
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger
              render={
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t("svCreateVoucher")}
                </Button>
              }
            />
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("svCreateVoucher")}</DialogTitle>
                <DialogDescription>
                  {t("svCreateVoucherDesc")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>{t("svTierLabel")}</Label>
                  <Select value={newTier} onValueChange={(v) => setNewTier(v as VoucherTier)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="starter">{t("svTierStarter")}</SelectItem>
                      <SelectItem value="pro">{t("svTierPro")}</SelectItem>
                      <SelectItem value="enterprise">{t("svTierEnterprise")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("svDurationLabel")}</Label>
                    <Select value={newDuration} onValueChange={(v) => v && setNewDuration(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">{t("svDuration30")}</SelectItem>
                        <SelectItem value="90">{t("svDuration90")}</SelectItem>
                        <SelectItem value="365">{t("svDuration365")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("svMaxUsesLabel")}</Label>
                    <Input
                      type="number"
                      min="1"
                      value={newMaxUses}
                      onChange={(e) => setNewMaxUses(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("svExpiresAt")}</Label>
                  <Input
                    type="date"
                    value={newExpiresAt}
                    onChange={(e) => setNewExpiresAt(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">{t("svExpiresAtHint")}</p>
                </div>
                <div className="space-y-2">
                  <Label>{t("svNotesLabel")}</Label>
                  <Input
                    placeholder={t("svNotesPlaceholder")}
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCreateVoucher}
                  disabled={submitting}
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {t("svCreateVoucher")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">{t("svStatTotal")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
            <p className="text-xs text-muted-foreground">{t("svStatActive")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.used}</p>
            <p className="text-xs text-muted-foreground">{t("svStatUsed")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">{stats.totalRedemptions}</p>
            <p className="text-xs text-muted-foreground">{t("svStatRedemptions")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterStatus} onValueChange={(v) => v && setFilterStatus(v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t("svFilterStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allStatuses")}</SelectItem>
            <SelectItem value="active">{t("svStatusActive")}</SelectItem>
            <SelectItem value="used">{t("svStatusUsed")}</SelectItem>
            <SelectItem value="expired">{t("svStatusExpired")}</SelectItem>
            <SelectItem value="revoked">{t("svStatusRevoked")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterTier} onValueChange={(v) => v && setFilterTier(v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t("svFilterTier")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allStatuses")}</SelectItem>
            <SelectItem value="starter">{t("svTierStarter")}</SelectItem>
            <SelectItem value="pro">{t("svTierPro")}</SelectItem>
            <SelectItem value="enterprise">{t("svTierEnterprise")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Voucher List */}
      <div className="grid gap-4">
        {filteredVouchers.map((voucher) => {
          const displayStatus = computeStatus(voucher);
          const TierIcon = tierIcons[voucher.tier];

          return (
            <Card key={voucher.id}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  {/* Code + tier */}
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tierColors[voucher.tier]}`}>
                      <TierIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-slate-100 px-2 py-0.5 text-sm font-bold tracking-wider dark:bg-slate-800">
                          {voucher.code}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleCopyCode(voucher)}
                        >
                          {copiedId === voucher.id ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge className={tierColors[voucher.tier]} variant="secondary">
                          {t(`svTier${voucher.tier.charAt(0).toUpperCase() + voucher.tier.slice(1)}`)}
                        </Badge>
                        <span>•</span>
                        <span>{durationLabel(voucher.duration_days)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="flex flex-wrap items-center gap-3 text-sm lg:gap-4">
                    {voucher.expires_at && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{t("svExpiresLabel")}: {new Date(voucher.expires_at).toLocaleDateString()}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Hash className="h-3.5 w-3.5" />
                      <span>
                        {voucher.current_uses}/{voucher.max_uses} {t("svUsedLabel")}
                      </span>
                    </div>

                    {voucher.notes && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <StickyNote className="h-3.5 w-3.5" />
                        <span className="max-w-[200px] truncate">{voucher.notes}</span>
                      </div>
                    )}

                    <Badge className={statusColors[displayStatus]}>
                      {t(`svStatus${displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}`)}
                    </Badge>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {voucher.used_by_groups.length > 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={t("svViewUsage")}
                        onClick={() => {
                          setSelectedVoucher(voucher);
                          setUsageDialogOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={t("svShareWhatsApp")}
                      onClick={() => handleShareWhatsApp(voucher)}
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                    {displayStatus === "active" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-700"
                        title={t("svRevoke")}
                        onClick={() => handleRevoke(voucher)}
                      >
                        <Ban className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filteredVouchers.length === 0 && (
          <div className="py-12 text-center">
            <Ticket className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <p className="mt-3 text-sm text-muted-foreground">
              {t("svNoVouchers")}
            </p>
          </div>
        )}
      </div>

      {/* Usage Detail Dialog */}
      <Dialog open={usageDialogOpen} onOpenChange={setUsageDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("svUsageTitle")}</DialogTitle>
            <DialogDescription>
              {selectedVoucher && (
                <span>
                  {t("svUsageDesc", { code: selectedVoucher.code })}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {selectedVoucher?.used_by_groups.map((usage, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div>
                  <p className="font-medium text-sm">{usage.group_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(usage.redeemed_at).toLocaleString()}
                  </p>
                </div>
                <Badge variant="secondary">{t("svRedeemed")}</Badge>
              </div>
            ))}
            {selectedVoucher?.used_by_groups.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t("svNoUsageYet")}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
