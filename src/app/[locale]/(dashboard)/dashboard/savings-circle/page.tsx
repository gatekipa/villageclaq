"use client";
import { formatAmount } from "@/lib/currencies";

import { useState, useEffect, Fragment } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CircleDollarSign,
  DollarSign,
  Users,
  Repeat,
  Shuffle,
  Gavel,
  Plus,
  Loader2,
  MoreVertical,
  Edit,
  XCircle,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
} from "lucide-react";
import { useSavingsCycles, useCreateSavingsCycle, useMembers } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { getMemberName } from "@/lib/get-member-name";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";

type RotationType = "sequential" | "random" | "auction";
type Frequency = "weekly" | "biweekly" | "monthly";


function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function RoundManagement({
  cycleId,
  currentRound,
  totalRounds,
  cycleAmount,
  currency,
  participants,
  fineRules,
  finesLedger,
  expanded,
  onToggle,
  roundContribs,
  setRoundContribs,
  queryClient,
  t,
  tc,
}: {
  cycleId: string;
  currentRound: number;
  totalRounds: number;
  cycleAmount: number;
  currency: string;
  participants: Record<string, unknown>[];
  fineRules: Record<string, number>;
  finesLedger: Array<Record<string, unknown>>;
  expanded: boolean;
  onToggle: () => void;
  roundContribs: Record<string, unknown>[];
  setRoundContribs: (v: Record<string, unknown>[]) => void;
  queryClient: ReturnType<typeof import("@tanstack/react-query").useQueryClient>;
  t: ReturnType<typeof import("next-intl").useTranslations>;
  tc: ReturnType<typeof import("next-intl").useTranslations>;
}) {
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [showCollectionDialog, setShowCollectionDialog] = useState(false);
  const [collectionAmount, setCollectionAmount] = useState("");
  const [collectionMethod, setCollectionMethod] = useState("cash");
  const [collectionNotes, setCollectionNotes] = useState("");
  const [recordingCollection, setRecordingCollection] = useState(false);
  const [collectionHistory, setCollectionHistory] = useState<Record<string, unknown>[]>([]);

  // Fines state
  const [showFineRulesDialog, setShowFineRulesDialog] = useState(false);
  const [fineLateFee, setFineLateFee] = useState(fineRules.late_contribution || 0);
  const [fineAbsenceFee, setFineAbsenceFee] = useState(fineRules.absence || 0);
  const [fineDefaultFee, setFineDefaultFee] = useState(fineRules.default_penalty || 0);
  const [savingFineRules, setSavingFineRules] = useState(false);
  const [showRecordFineDialog, setShowRecordFineDialog] = useState(false);
  const [fineMembershipId, setFineMembershipId] = useState("");
  const [fineType, setFineType] = useState("late_contribution");
  const [fineAmount, setFineAmount] = useState("");
  const [fineReason, setFineReason] = useState("");
  const [recordingFine, setRecordingFine] = useState(false);
  const [markingFinePaid, setMarkingFinePaid] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded) return;
    const supabase = createClient();
    supabase
      .from("savings_contributions")
      .select("*")
      .eq("cycle_id", cycleId)
      .eq("round_number", currentRound)
      .then(({ data }) => setRoundContribs(data || []));
    // Fetch collection history (all completed rounds)
    supabase
      .from("savings_participants")
      .select("collection_round, has_collected, collected_at, membership:memberships!inner(id, display_name, is_proxy, profiles:profiles!memberships_user_id_fkey(id, full_name))")
      .eq("cycle_id", cycleId)
      .eq("has_collected", true)
      .order("collection_round", { ascending: true })
      .then(({ data }) => {
        setCollectionHistory((data || []).map((d: Record<string, unknown>) => {
          const m = d.membership as Record<string, unknown> | null;
          return { ...d, membership: m ? { ...m, profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles } : null };
        }));
      });
  }, [expanded, cycleId, currentRound, setRoundContribs]);

  const handleMarkPaid = async (participantMembershipId: string) => {
    setMarkingPaid(participantMembershipId);
    const supabase = createClient();
    await supabase.from("savings_contributions").upsert(
      {
        cycle_id: cycleId,
        membership_id: participantMembershipId,
        round_number: currentRound,
        amount: cycleAmount,
        paid_at: new Date().toISOString(),
        status: "paid",
      },
      { onConflict: "cycle_id,membership_id,round_number" }
    );
    queryClient.invalidateQueries({ queryKey: ["savings-cycles"] });
    // Refresh contributions
    const { data } = await createClient()
      .from("savings_contributions")
      .select("*")
      .eq("cycle_id", cycleId)
      .eq("round_number", currentRound);
    setRoundContribs(data || []);
    setMarkingPaid(null);
  };

  const [showAdvanceWarning, setShowAdvanceWarning] = useState(false);
  const [unpaidForAdvance, setUnpaidForAdvance] = useState(0);

  const handleAdvanceRound = async () => {
    if (currentRound >= totalRounds) return;
    // Check unpaid members before advancing
    const paidMemberIds = new Set(roundContribs.filter((c) => c.status === "paid").map((c) => c.membership_id as string));
    const unpaidCount = participants.length - paidMemberIds.size;
    if (unpaidCount > 0) {
      setUnpaidForAdvance(unpaidCount);
      setShowAdvanceWarning(true);
      return;
    }
    await doAdvanceRound();
  };

  const doAdvanceRound = async () => {
    setAdvancing(true);
    setShowAdvanceWarning(false);
    const supabase = createClient();
    await supabase
      .from("savings_cycles")
      .update({ current_round: currentRound + 1 })
      .eq("id", cycleId);
    queryClient.invalidateQueries({ queryKey: ["savings-cycles"] });
    setAdvancing(false);
  };

  const [payoutDeductions, setPayoutDeductions] = useState("0");
  const [payoutStatus, setPayoutStatus] = useState("full");
  const [payoutDeferredReason, setPayoutDeferredReason] = useState("");

  const handleRecordCollection = async () => {
    if (!collectorParticipantId) return;
    setRecordingCollection(true);
    try {
      const supabase = createClient();
      const amountGiven = Number(collectionAmount) - Number(payoutDeductions || 0);
      await supabase.from("savings_participants").update({
        has_collected: true,
        collected_at: new Date().toISOString(),
      }).eq("cycle_id", cycleId).eq("collection_round", currentRound);
      queryClient.invalidateQueries({ queryKey: ["savings-cycles"] });
      setShowCollectionDialog(false);
    } finally { setRecordingCollection(false); }
  };

  const handleSaveFineRules = async () => {
    setSavingFineRules(true);
    try {
      const supabase = createClient();
      await supabase.from("savings_cycles").update({
        fine_rules: { late_contribution: fineLateFee, absence: fineAbsenceFee, default_penalty: fineDefaultFee },
      }).eq("id", cycleId);
      queryClient.invalidateQueries({ queryKey: ["savings-cycles"] });
      setShowFineRulesDialog(false);
    } finally { setSavingFineRules(false); }
  };

  const handleRecordFine = async () => {
    if (!fineMembershipId || !fineAmount) return;
    setRecordingFine(true);
    try {
      const supabase = createClient();
      const newFine = { id: crypto.randomUUID(), membership_id: fineMembershipId, type: fineType, amount: Number(fineAmount), reason: fineReason.trim(), date: new Date().toISOString().slice(0, 10), status: "unpaid" };
      const updated = [...finesLedger, newFine];
      await supabase.from("savings_cycles").update({ fines_ledger: updated }).eq("id", cycleId);
      queryClient.invalidateQueries({ queryKey: ["savings-cycles"] });
      setShowRecordFineDialog(false);
      setFineMembershipId(""); setFineAmount(""); setFineReason("");
    } finally { setRecordingFine(false); }
  };

  const handleMarkFinePaid = async (fineId: string) => {
    setMarkingFinePaid(fineId);
    try {
      const supabase = createClient();
      const updated = finesLedger.map((f) => (f.id as string) === fineId ? { ...f, status: "paid" } : f);
      await supabase.from("savings_cycles").update({ fines_ledger: updated }).eq("id", cycleId);
      queryClient.invalidateQueries({ queryKey: ["savings-cycles"] });
    } finally { setMarkingFinePaid(null); }
  };

  const collectorParticipant = participants.find(
    (p) => (p.collection_round as number) === currentRound
  );
  const collectorMembership = collectorParticipant?.membership as Record<string, unknown> | undefined;
  const collectorName = collectorMembership ? getMemberName(collectorMembership) : "";
  const collectorParticipantId = collectorParticipant?.id as string | undefined;
  const potSize = cycleAmount * participants.length;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4 dark:bg-muted/5">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={onToggle}
      >
        <h4 className="text-sm font-semibold text-foreground">{t("roundManagement")}</h4>
        <ChevronRight
          className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>

      {expanded && (
        <div className="space-y-4">
          {/* Round indicator */}
          <p className="text-lg font-bold text-foreground">
            {t("roundOf", { current: currentRound, total: totalRounds })}
          </p>

          {/* Collector for this round */}
          {collectorName && (
            <div className="flex items-center gap-2">
              <Badge className="bg-amber-500 text-white dark:bg-amber-600">
                {t("collector")}
              </Badge>
              <span className="text-sm font-medium text-foreground">{collectorName}</span>
            </div>
          )}

          {/* Round Payment Overview */}
          {(() => {
            const paidMembers = roundContribs.filter((c) => (c.status as string) === "paid").length;
            const partialMembers = roundContribs.filter((c) => (c.status as string) === "partial").length;
            const unpaidMembers = participants.length - paidMembers - partialMembers;
            const collectedAmount = roundContribs.reduce((s, c) => s + Number(c.amount || 0), 0);
            const expectedAmount = participants.length * cycleAmount;
            const pctPaid = participants.length > 0 ? Math.round((paidMembers / participants.length) * 100) : 0;
            return (
              <Card className="bg-muted/50">
                <CardContent className="p-3 space-y-2">
                  <p className="text-xs font-medium">{t("roundPaymentStatus", { round: currentRound })}</p>
                  <Progress value={pctPaid} className="h-2" />
                  <div className="flex flex-wrap gap-2 text-[10px]">
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">{t("paidCount", { count: paidMembers })}</Badge>
                    {partialMembers > 0 && <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">{t("partialCount", { count: partialMembers })}</Badge>}
                    {unpaidMembers > 0 && <Badge variant="destructive">{t("unpaidCount", { count: unpaidMembers })}</Badge>}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {formatAmount(collectedAmount, currency)} / {formatAmount(expectedAmount, currency)}
                  </p>
                </CardContent>
              </Card>
            );
          })()}

          {/* Per-participant contribution status */}
          <div className="space-y-2">
            {participants.map((p) => {
              const membership = p.membership as Record<string, unknown> | undefined;
              const membershipId = (p.membership_id as string) || (membership?.id as string) || "";
              const fullName = membership ? getMemberName(membership) : "Member";
              const profile = membership
                ? (Array.isArray(membership.profiles)
                    ? membership.profiles[0]
                    : membership.profiles) as Record<string, unknown> | undefined
                : undefined;
              const avatarUrl = (profile?.avatar_url as string) || "";
              const isCollector = (p.collection_round as number) === currentRound;

              const contrib = roundContribs.find(
                (c) => (c.membership_id as string) === membershipId
              );
              const isPaid = contrib && (contrib.status as string) === "paid";

              return (
                <div
                  key={p.id as string}
                  className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={avatarUrl || undefined} />
                      <AvatarFallback className="text-xs">
                        {getInitials(fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-foreground">{fullName}</span>
                    {isCollector && (
                      <Badge className="bg-amber-500 text-white dark:bg-amber-600 text-[10px] px-1.5 py-0">
                        {t("collector")}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {formatAmount(cycleAmount, currency)}
                    </span>
                    {isPaid ? (
                      <Badge className="bg-emerald-600 text-white dark:bg-emerald-500 text-xs">
                        <CheckCircle className="mr-1 h-3 w-3" />
                        {t("statusPaid")}
                      </Badge>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Badge variant="destructive" className="text-xs">
                          {t("unpaid")}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={markingPaid === membershipId}
                          onClick={() => handleMarkPaid(membershipId)}
                        >
                          {markingPaid === membershipId && (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          )}
                          {t("markPaid")}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-[10px] text-amber-600" onClick={() => { setFineMembershipId(membershipId); setFineAmount(String(fineRules.late_contribution || 0)); setFineReason(""); setFineType("late_contribution"); setShowRecordFineDialog(true); }}>
                          {t("recordFine")}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {collectorParticipant && !(collectorParticipant.has_collected as boolean) && (
              <Button variant="outline" size="sm" onClick={() => {
                setCollectionAmount(String(potSize));
                setCollectionMethod("cash");
                setCollectionNotes("");
                setShowCollectionDialog(true);
              }}>
                <DollarSign className="mr-1 h-3.5 w-3.5" />
                {t("recordCollection")}
              </Button>
            )}
            {currentRound < totalRounds && (
              <Button onClick={handleAdvanceRound} disabled={advancing} size="sm">
                {advancing && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                {t("advanceRound")}
              </Button>
            )}
          </div>

          {/* Collection History */}
          {collectionHistory.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-xs font-medium text-muted-foreground">{t("collectionHistory")}</h5>
              <div className="rounded-lg border divide-y">
                {collectionHistory.map((ch: Record<string, unknown>, i: number) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span>R{ch.collection_round as number}</span>
                    <span className="font-medium">{getMemberName(ch.membership as Record<string, unknown>)}</span>
                    <span className="text-muted-foreground">{ch.collected_at ? new Date(ch.collected_at as string).toLocaleDateString() : "—"}</span>
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">{t("collected")}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fine Rules */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-medium text-muted-foreground">{t("fineRules")}</h5>
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => { setFineLateFee(fineRules.late_contribution || 0); setFineAbsenceFee(fineRules.absence || 0); setFineDefaultFee(fineRules.default_penalty || 0); setShowFineRulesDialog(true); }}>
                {t("configureFines")}
              </Button>
            </div>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span>{t("lateContributionFine")}: {formatAmount(fineRules.late_contribution || 0, currency)}</span>
              <span>{t("absenceFine")}: {formatAmount(fineRules.absence || 0, currency)}</span>
              <span>{t("defaultPenalty")}: {formatAmount(fineRules.default_penalty || 0, currency)}</span>
            </div>
          </div>

          {/* Fines Ledger */}
          <div className="space-y-2">
            <h5 className="text-xs font-medium text-muted-foreground">{t("finesLedger")}</h5>
            {finesLedger.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">{t("noFines")}</p>
            ) : (
              <>
                <div className="rounded-lg border divide-y">
                  {finesLedger.map((fine: Record<string, unknown>) => {
                    const mp = participants.find((p) => (p.membership_id as string) === (fine.membership_id as string));
                    const mm = mp?.membership as Record<string, unknown> | undefined;
                    return (
                      <div key={fine.id as string} className="flex items-center justify-between px-3 py-2 text-xs">
                        <span className="font-medium">{mm ? getMemberName(mm) : "—"}</span>
                        <span className="text-muted-foreground capitalize">{String(fine.type).replace(/_/g, " ")}</span>
                        <span>{formatAmount(Number(fine.amount), currency)}</span>
                        {(fine.status as string) === "paid" ? (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">{t("markPaid")}</Badge>
                        ) : (
                          <Button variant="ghost" size="sm" className="h-5 text-[10px] text-emerald-600" onClick={() => handleMarkFinePaid(fine.id as string)} disabled={markingFinePaid === (fine.id as string)}>
                            {t("markPaid")}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>{t("totalFines")}: {formatAmount(finesLedger.reduce((s, f) => s + Number(f.amount), 0), currency)}</span>
                  <span>{t("finesCollected")}: {formatAmount(finesLedger.filter((f) => f.status === "paid").reduce((s, f) => s + Number(f.amount), 0), currency)}</span>
                  <span>{t("finesOutstanding")}: {formatAmount(finesLedger.filter((f) => f.status === "unpaid").reduce((s, f) => s + Number(f.amount), 0), currency)}</span>
                </div>
              </>
            )}
          </div>

          {/* Fine Rules Dialog */}
          <Dialog open={showFineRulesDialog} onOpenChange={setShowFineRulesDialog}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>{t("configureFines")}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2"><Label>{t("lateContributionFine")}</Label><Input type="number" value={fineLateFee} onChange={(e) => setFineLateFee(Number(e.target.value))} /></div>
                <div className="space-y-2"><Label>{t("absenceFine")}</Label><Input type="number" value={fineAbsenceFee} onChange={(e) => setFineAbsenceFee(Number(e.target.value))} /></div>
                <div className="space-y-2"><Label>{t("defaultPenalty")}</Label><Input type="number" value={fineDefaultFee} onChange={(e) => setFineDefaultFee(Number(e.target.value))} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowFineRulesDialog(false)}>{tc("cancel")}</Button>
                <Button onClick={handleSaveFineRules} disabled={savingFineRules}>{savingFineRules && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{tc("save")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Record Fine Dialog */}
          <Dialog open={showRecordFineDialog} onOpenChange={setShowRecordFineDialog}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>{t("recordFine")}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>{t("fineType")}</Label>
                  <Select value={fineType} onValueChange={(v) => { setFineType(v ?? "late_contribution"); setFineAmount(String(v === "late_contribution" ? fineRules.late_contribution : v === "absence" ? fineRules.absence : fineRules.default_penalty) || ""); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="late_contribution">{t("lateContributionFine")}</SelectItem>
                      <SelectItem value="absence">{t("absenceFine")}</SelectItem>
                      <SelectItem value="default">{t("defaultPenalty")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>{t("amount")}</Label><Input type="number" value={fineAmount} onChange={(e) => setFineAmount(e.target.value)} /></div>
                <div className="space-y-2"><Label>Reason</Label><Input value={fineReason} onChange={(e) => setFineReason(e.target.value)} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowRecordFineDialog(false)}>{tc("cancel")}</Button>
                <Button onClick={handleRecordFine} disabled={recordingFine || !fineAmount}>{recordingFine && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("recordFine")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Record Payout Dialog */}
          <Dialog open={showCollectionDialog} onOpenChange={setShowCollectionDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>{t("recordPayout")} — {t("round")} {currentRound}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">{t("beneficiary")}</p>
                  <p className="text-sm font-medium">{collectorName}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-[10px] text-muted-foreground">{t("expectedAmount")}</p>
                    <p className="text-sm font-bold">{formatAmount(potSize, currency)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-[10px] text-muted-foreground">{t("actualCollected")}</p>
                    <p className="text-sm font-bold">{formatAmount(roundContribs.reduce((s, c) => s + Number(c.amount || 0), 0), currency)}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("amountGiven")}</Label>
                  <Input type="number" value={collectionAmount} onChange={(e) => setCollectionAmount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("deductions")}</Label>
                  <Input type="number" value={payoutDeductions} onChange={(e) => setPayoutDeductions(e.target.value)} placeholder="0" />
                  {Number(payoutDeductions) > 0 && (
                    <p className="text-xs text-muted-foreground">{t("netPayout")}: {formatAmount(Number(collectionAmount) - Number(payoutDeductions), currency)}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>{t("payoutMethod") || t("paymentMethod")}</Label>
                  <Select value={collectionMethod} onValueChange={(v) => setCollectionMethod(v ?? "cash")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="mobile_money">Mobile Money</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input value={collectionNotes} onChange={(e) => setCollectionNotes(e.target.value)} placeholder="Optional" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCollectionDialog(false)}>{tc("cancel")}</Button>
                <Button onClick={handleRecordCollection} disabled={recordingCollection}>
                  {recordingCollection && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("recordCollection")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Advance Round Warning Dialog */}
          <Dialog open={showAdvanceWarning} onOpenChange={setShowAdvanceWarning}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-amber-600">
                  <AlertTriangle className="h-5 w-5" />
                  {t("advanceRound")}
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                {t("advanceWarning", { count: unpaidForAdvance })}
              </p>
              <DialogFooter className="flex gap-2">
                <Button variant="outline" onClick={() => setShowAdvanceWarning(false)}>
                  {t("stayOnRound")}
                </Button>
                <Button variant="destructive" onClick={doAdvanceRound} disabled={advancing}>
                  {advancing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("advanceAnyway")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}

const rotationIcons: Record<RotationType, typeof Repeat> = {
  sequential: Repeat,
  random: Shuffle,
  auction: Gavel,
};

export default function SavingsCirclePage() {
  const t = useTranslations("savingsCircle");
  const tc = useTranslations("common");
  const { currentGroup } = useGroup();
  const { hasPermission } = usePermissions();
  const isAdmin = hasPermission("savings.manage");
  const { data: cycles, isLoading, isError, error, refetch } = useSavingsCycles();
  const { data: membersRaw } = useMembers();
  const createCycle = useCreateSavingsCycle();

  const queryClient = useQueryClient();
  const activeMembers = (membersRaw || []).filter((m: Record<string, unknown>) => m.standing !== "banned" && m.standing !== "suspended");

  // Create dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [cycleName, setCycleName] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<string>("monthly");
  const [totalRounds, setTotalRounds] = useState("");
  const [startDate, setStartDate] = useState("");
  const [rotationType, setRotationType] = useState<string>("sequential");
  const [autoEnroll, setAutoEnroll] = useState(true);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [meetingSchedule, setMeetingSchedule] = useState("");
  const [meetingLocation, setMeetingLocation] = useState("");
  const [createError, setCreateError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editCycleId, setEditCycleId] = useState<string | null>(null);
  const [endingCycleId, setEndingCycleId] = useState<string | null>(null);
  const [expandedCycleId, setExpandedCycleId] = useState<string | null>(null);
  const [roundContribs, setRoundContribs] = useState<Record<string, unknown>[]>([]);
  const [showAddParticipants, setShowAddParticipants] = useState(false);
  const [addPartCycleId, setAddPartCycleId] = useState<string | null>(null);
  const [addPartSelected, setAddPartSelected] = useState<string[]>([]);
  const [addingParts, setAddingParts] = useState(false);

  // Mark Paid dialog state (table-level, for any cycle)
  const [showMarkPaidDialog, setShowMarkPaidDialog] = useState(false);
  const [mpCycleId, setMpCycleId] = useState<string | null>(null);
  const [mpMembershipId, setMpMembershipId] = useState("");
  const [mpMemberName, setMpMemberName] = useState("");
  const [mpAmount, setMpAmount] = useState("");
  const [mpMethod, setMpMethod] = useState("cash");
  const [mpNotes, setMpNotes] = useState("");
  const [mpSaving, setMpSaving] = useState(false);
  const [mpCurrentRound, setMpCurrentRound] = useState(1);
  const [mpContribAmount, setMpContribAmount] = useState(0);

  const resetCreateForm = () => {
    setCycleName("");
    setAmount("");
    setFrequency("monthly");
    setTotalRounds("");
    setStartDate(new Date().toISOString().slice(0, 10));
    setRotationType("sequential");
    setAutoEnroll(true);
    setSelectedMemberIds([]);
    setMeetingSchedule("");
    setMeetingLocation("");
    setCreateError("");
    setFieldErrors({});
  };

  const handleCreateCycle = async () => {
    const errors: Record<string, string> = {};
    if (!cycleName.trim()) errors.name = t("cycleName") + " required";
    if (!amount || Number(amount) <= 0) errors.amount = t("amount") + " > 0";
    if (!totalRounds || Number(totalRounds) <= 0) errors.rounds = t("totalRounds") + " > 0";
    if (!startDate) errors.date = t("startDate") + " required";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setCreateError("");

    // Edit mode
    if (editCycleId) {
      const supabase = createClient();
      const { error } = await supabase.from('savings_cycles').update({
        name: cycleName.trim(),
        amount: Number(amount),
        frequency,
        total_rounds: Number(totalRounds),
        start_date: startDate,
        rotation_type: rotationType,
      }).eq('id', editCycleId);
      if (error) { setCreateError(error.message); return; }
      queryClient.invalidateQueries({ queryKey: ["savings-cycles"] });
      setShowCreate(false);
      setEditCycleId(null);
      resetCreateForm();
      return;
    }

    try {
      const newCycle = await createCycle.mutateAsync({
        name: cycleName.trim(),
        amount: Number(amount),
        currency: currentGroup?.currency || "XAF",
        frequency,
        total_rounds: Number(totalRounds),
        rotation_type: rotationType,
        start_date: startDate,
      });

      // Enroll participants
      if (newCycle?.id) {
        const supabase = createClient();
        const rounds = Number(totalRounds);
        let enrollMembers: Array<Record<string, unknown>> = [];
        if (autoEnroll) {
          enrollMembers = activeMembers.slice(0, rounds);
        } else if (selectedMemberIds.length > 0) {
          enrollMembers = activeMembers.filter((m: Record<string, unknown>) => selectedMemberIds.includes(m.id as string)).slice(0, rounds);
        }
        if (enrollMembers.length > 0) {
          // Shuffle for random rotation
          let ordered = [...enrollMembers];
          if (rotationType === "random") {
            for (let i = ordered.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
            }
          }
          const parts = ordered.map((m: Record<string, unknown>, i: number) => ({
            cycle_id: newCycle.id,
            membership_id: m.id as string,
            collection_round: i + 1,
            has_collected: false,
          }));
          await supabase.from("savings_participants").insert(parts);
          queryClient.invalidateQueries({ queryKey: ["savings-cycles"] });
        }
      }

      setShowCreate(false);
      resetCreateForm();
    } catch (err) {
      setCreateError((err as Error).message || tc("error"));
    }
  };

  if (isLoading) return <CardGridSkeleton cards={2} />;
  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  const groupCurrency = currentGroup?.currency || "XAF";

  if (!cycles || cycles.length === 0) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          {isAdmin && (
            <Button onClick={() => { resetCreateForm(); setShowCreate(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              {t("createCycle")}
            </Button>
          )}
        </div>
        <EmptyState
          icon={CircleDollarSign}
          title={t("noCycles")}
          description={t("noCyclesDesc")}
        />

        {/* Create Dialog rendered in empty state too */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("createCycle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("cycleName")}</Label>
                <Input value={cycleName} onChange={(e) => setCycleName(e.target.value)} placeholder={t("cycleName")} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("amount")}</Label>
                  <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10000" />
                </div>
                <div className="space-y-2">
                  <Label>{t("frequency")}</Label>
                  <Select value={frequency} onValueChange={(v) => setFrequency(v ?? "monthly")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">{t("weekly")}</SelectItem>
                      <SelectItem value="biweekly">{t("biweekly")}</SelectItem>
                      <SelectItem value="monthly">{t("monthly")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("totalRounds")}</Label>
                  <Input type="number" value={totalRounds} onChange={(e) => setTotalRounds(e.target.value)} placeholder="12" />
                </div>
                <div className="space-y-2">
                  <Label>{t("startDate")}</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
              </div>
              {/* Meeting Schedule & Location */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("meetingSchedule")}</Label>
                  <Input value={meetingSchedule} onChange={(e) => setMeetingSchedule(e.target.value)} placeholder={t("meetingSchedulePlaceholder")} />
                </div>
                <div className="space-y-2">
                  <Label>{t("meetingLocation")}</Label>
                  <Input value={meetingLocation} onChange={(e) => setMeetingLocation(e.target.value)} placeholder={t("meetingLocationPlaceholder")} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("rotationType")}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: "sequential", label: t("takeTurns"), desc: t("takeTurnsDesc"), Icon: Repeat },
                    { value: "random", label: t("luckyDraw"), desc: t("luckyDrawDesc"), Icon: Shuffle },
                    { value: "auction", label: t("bidding"), desc: t("biddingDesc"), Icon: Gavel },
                  ] as const).map(({ value, label, desc, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRotationType(value)}
                      className={`flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left text-xs transition-colors ${rotationType === value ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                    >
                      <Icon className="h-4 w-4 text-primary" />
                      <span className="font-medium">{label}</span>
                      <span className="text-[10px] text-muted-foreground line-clamp-2">{desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* Auto-enroll */}
              {!editCycleId && (
                <>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <input type="checkbox" checked={autoEnroll} onChange={(e) => { setAutoEnroll(e.target.checked); if (e.target.checked) setSelectedMemberIds([]); }} className="h-4 w-4 rounded border-input" />
                    <div>
                      <p className="text-sm font-medium">{t("autoEnrollAll")}</p>
                      <p className="text-[10px] text-muted-foreground">{autoEnroll ? `${activeMembers.length} ${t("participants")}` : t("manualSelect")}</p>
                    </div>
                  </div>
                  {!autoEnroll && (
                    <div className="max-h-40 overflow-y-auto rounded-lg border divide-y">
                      {activeMembers.map((m: Record<string, unknown>) => {
                        const mid = m.id as string;
                        const sel = selectedMemberIds.includes(mid);
                        return (
                          <button key={mid} type="button" onClick={() => setSelectedMemberIds((prev) => sel ? prev.filter((x) => x !== mid) : [...prev, mid])} className={`flex w-full items-center gap-2 p-2 text-left text-xs transition-colors ${sel ? "bg-primary/5" : "hover:bg-muted/50"}`}>
                            {sel ? <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" /> : <div className="h-3.5 w-3.5 rounded-full border shrink-0" />}
                            <span>{getMemberName(m)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
              {createError && <p className="text-sm text-destructive">{createError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>{tc("cancel")}</Button>
              <Button onClick={handleCreateCycle} disabled={createCycle.isPending}>
                {createCycle.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {tc("create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {isAdmin && (
          <Button onClick={() => { resetCreateForm(); setShowCreate(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            {t("createCycle")}
          </Button>
        )}
      </div>

      {/* Stats Row */}
      {(() => {
        const activeCyclesList = cycles.filter((c: Record<string, unknown>) => c.status === "active");
        const totalParticipants = cycles.reduce((sum: number, c: Record<string, unknown>) => sum + ((c.savings_participants as unknown[]) || []).length, 0);
        const totalPot = activeCyclesList.reduce((sum: number, c: Record<string, unknown>) => {
          const p = ((c.savings_participants as unknown[]) || []).length;
          return sum + Number(c.amount) * p;
        }, 0);
        const totalRoundsCompleted = cycles.reduce((sum: number, c: Record<string, unknown>) => {
          const current = (c.current_round as number) || 1;
          return sum + Math.max(0, current - 1);
        }, 0);
        return (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card><CardContent className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30"><CircleDollarSign className="size-5 text-emerald-600 dark:text-emerald-400" /></div>
              <div><p className="text-xs text-muted-foreground">{t("activeCycles")}</p><p className="text-xl font-bold">{activeCyclesList.length}</p></div>
            </CardContent></Card>
            <Card><CardContent className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30"><Users className="size-5 text-blue-600 dark:text-blue-400" /></div>
              <div><p className="text-xs text-muted-foreground">{t("participants")}</p><p className="text-xl font-bold">{totalParticipants}</p></div>
            </CardContent></Card>
            <Card><CardContent className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30"><DollarSign className="size-5 text-purple-600 dark:text-purple-400" /></div>
              <div><p className="text-xs text-muted-foreground">{t("totalPotSize")}</p><p className="text-xl font-bold">{formatAmount(totalPot, groupCurrency)}</p></div>
            </CardContent></Card>
            <Card><CardContent className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30"><CheckCircle className="size-5 text-amber-600 dark:text-amber-400" /></div>
              <div><p className="text-xs text-muted-foreground">{t("roundsCompleted")}</p><p className="text-xl font-bold">{totalRoundsCompleted}</p></div>
            </CardContent></Card>
          </div>
        );
      })()}

      {/* Njangi Treasury */}
      {(() => {
        const allContribs = cycles.reduce((sum: number, c: Record<string, unknown>) => {
          const p = ((c.savings_participants as unknown[]) || []).length;
          const round = (c.current_round as number) || 1;
          return sum + Number(c.amount) * p * Math.max(0, round - 1);
        }, 0);
        const allPayouts = cycles.reduce((sum: number, c: Record<string, unknown>) => {
          const p = ((c.savings_participants as Record<string, unknown>[]) || []).filter((pp) => pp.has_collected);
          return sum + p.length * Number(c.amount) * (((c.savings_participants as unknown[]) || []).length);
        }, 0);
        return (
          <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <CircleDollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">{t("savingsTreasury")}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t("totalCollected")}</p>
                  <p className="text-lg font-bold">{formatAmount(allContribs, groupCurrency)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("totalPending")}</p>
                  <p className="text-lg font-bold">{formatAmount(Math.max(0, allContribs - allPayouts), groupCurrency)}</p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-[10px] text-muted-foreground italic">{t("separateFinances")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Cycles */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">{t("activeCycles")}</h2>

        {cycles.map((cycle: Record<string, unknown>) => {
          const id = cycle.id as string;
          const name = (cycle.name as string) || "";
          const freq = (cycle.frequency as Frequency) || "monthly";
          const rotType = (cycle.rotation_type as RotationType) || "sequential";
          const currentRound = (cycle.current_round as number) || 1;
          const totalRnds = (cycle.total_rounds as number) || 1;
          const amt = Number(cycle.amount) || 0;
          const currency = (cycle.currency as string) || groupCurrency;
          const status = (cycle.status as string) || "active";
          const participants = (cycle.savings_participants as Record<string, unknown>[]) || [];
          const totalMembers = participants.length;
          const potSize = amt * totalMembers;

          const RotationIcon = rotationIcons[rotType] || Repeat;

          const statusColor =
            status === "active"
              ? "bg-emerald-600 text-white dark:bg-emerald-500"
              : status === "completed"
                ? "bg-slate-600 text-white dark:bg-slate-500"
                : "bg-amber-600 text-white dark:bg-amber-500";

          const isExpanded = expandedCycleId === id;

          return (
            <Card key={id}>
              <CardHeader className="cursor-pointer" onClick={() => setExpandedCycleId(isExpanded ? null : id)}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    <CardTitle className="text-lg">{name}</CardTitle>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="default" className={statusColor}>
                      {t(`status${status.charAt(0).toUpperCase() + status.slice(1)}` as Parameters<typeof t>[0])}
                    </Badge>
                    <Badge variant="outline">{t(freq)}</Badge>
                    <Badge variant="secondary" className="gap-1">
                      <RotationIcon className="size-3" />
                      {t(rotType)}
                    </Badge>
                    {isAdmin && (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground focus:outline-none">
                          <MoreVertical className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setCycleName(name);
                            setAmount(String(amt));
                            setFrequency(freq);
                            setTotalRounds(String(totalRnds));
                            setStartDate((cycle.start_date as string) || "");
                            setRotationType(rotType);
                            setEditCycleId(id);
                            setShowCreate(true);
                          }}>
                            <Edit className="mr-2 h-4 w-4" />
                            {tc("edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setEndingCycleId(id)}
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            {t("endCycle")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Summary row (always visible) */}
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span>{t("currentRound")}: <strong className="text-foreground">{currentRound}/{totalRnds}</strong></span>
                  <span>{t("potSize")}: <strong className="text-foreground">{formatAmount(potSize, currency)}</strong></span>
                  <span>{t("participants")}: <strong className="text-foreground">{totalMembers}</strong></span>
                  <span>{t("amount")}: <strong className="text-foreground">{formatAmount(amt, currency)}</strong></span>
                </div>

                {isExpanded && <>
                {/* Meeting info */}
                {((cycle.meeting_schedule as string) || (cycle.meeting_location as string)) && (
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {(cycle.meeting_schedule as string) && <span>📅 {t("meets")}: {cycle.meeting_schedule as string}</span>}
                    {(cycle.meeting_location as string) && <span>📍 {cycle.meeting_location as string}</span>}
                  </div>
                )}
                {/* (Overview stats moved to always-visible summary row above) */}

                {/* Next Collector + Next Collection */}
                {status === "active" && participants.length > 0 && (() => {
                  const nextCollector = participants.find((p: Record<string, unknown>) => (p.collection_round as number) === currentRound);
                  const ncMembership = nextCollector?.membership as Record<string, unknown> | undefined;
                  const ncName = ncMembership ? getMemberName(ncMembership) : "—";
                  // Calculate next collection date from start_date + frequency * (currentRound - 1)
                  const startD = new Date((cycle.start_date as string) || "");
                  const freqDays = freq === "weekly" ? 7 : freq === "biweekly" ? 14 : 30;
                  const nextDate = new Date(startD.getTime() + (currentRound - 1) * freqDays * 86400000);
                  return (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-2.5">
                        <p className="text-xs text-muted-foreground">{t("nextCollector")}</p>
                        <p className="text-sm font-semibold">{ncName}</p>
                      </div>
                      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-2.5">
                        <p className="text-xs text-muted-foreground">{t("nextCollection")}</p>
                        <p className="text-sm font-semibold">{nextDate.toLocaleDateString()}</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {t("round")} {currentRound} {t("of")} {totalRnds}
                    </span>
                    <span className="font-medium text-foreground">
                      {Math.round((currentRound / totalRnds) * 100)}%
                    </span>
                  </div>
                  <Progress value={currentRound} max={totalRnds} />
                </div>

                {/* Participants list */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-foreground">{t("participants")} ({totalMembers})</h4>
                    {isAdmin && (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setAddPartCycleId(id); setAddPartSelected([]); setShowAddParticipants(true); }}>
                        <Plus className="mr-1 h-3 w-3" />
                        {t("addParticipant")}
                      </Button>
                    )}
                  </div>
                  {participants.length > 0 ? (
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[40px]">#</TableHead>
                            <TableHead>{t("participants")}</TableHead>
                            <TableHead className="text-center">{t("round")}</TableHead>
                            <TableHead className="text-center">{t("statusPaid")}</TableHead>
                            <TableHead className="text-center">{t("collected")}</TableHead>
                            <TableHead className="text-right">{t("totalContributed")}</TableHead>
                            {isAdmin && <TableHead className="w-[80px]"></TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {participants.map((p: Record<string, unknown>, idx: number) => {
                            const pid = p.id as string;
                            const membership = p.membership as Record<string, unknown> | undefined;
                            const fullName = membership ? getMemberName(membership) : "Member";
                            const collectionRound = (p.collection_round as number) || 0;
                            const hasCollected = p.has_collected as boolean;
                            const membershipId = (p.membership_id as string) || (membership?.id as string) || "";
                            // Fines from finesLedger
                            const finesLedger = ((cycle.fines_ledger as Array<Record<string, unknown>>) || []);
                            const unpaidFines = finesLedger.filter((f) => (f.membership_id as string) === membershipId && (f.status as string) === "unpaid").reduce((s, f) => s + Number(f.amount), 0);
                            // Estimate total contributed = (currentRound - 1) rounds worth if sequential
                            const totalContrib = Math.max(0, currentRound - 1) * amt;

                            return (
                              <TableRow key={pid}>
                                <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                                <TableCell><span className="text-sm font-medium">{fullName}</span></TableCell>
                                <TableCell className="text-center text-xs">R{collectionRound}</TableCell>
                                <TableCell className="text-center">
                                  {collectionRound < currentRound ? (
                                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">{t("statusPaid")}</Badge>
                                  ) : collectionRound === currentRound ? (
                                    <Badge variant="secondary" className="text-[10px]">{t("inProgress")}</Badge>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  {hasCollected ? (
                                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">{t("collected")}</Badge>
                                  ) : collectionRound === currentRound ? (
                                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-[10px]">{t("current")}</Badge>
                                  ) : collectionRound < currentRound ? (
                                    <Badge variant="secondary" className="text-[10px]">{t("statusPending")}</Badge>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">R{collectionRound}</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right text-xs font-medium">{formatAmount(totalContrib, currency)}</TableCell>
                                {isAdmin && (
                                  <TableCell>
                                    <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => {
                                      setMpCycleId(id); setMpMembershipId(membershipId); setMpMemberName(fullName);
                                      setMpAmount(String(amt)); setMpMethod("cash"); setMpNotes("");
                                      setMpCurrentRound(currentRound); setMpContribAmount(amt);
                                      setShowMarkPaidDialog(true);
                                    }}>
                                      {t("markPaid")}
                                    </Button>
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-4 text-center">{t("noCyclesDesc")}</p>
                  )}
                </div>

                {/* ── Treasury ────────────────────────────────────── */}
                {(() => {
                  const totalExpected = totalRnds * totalMembers * amt;
                  const totalReceived = Math.max(0, currentRound - 1) * totalMembers * amt;
                  const collectedCount = participants.filter((p: Record<string, unknown>) => p.has_collected).length;
                  const totalPayouts = collectedCount * potSize;
                  const balance = totalReceived - totalPayouts;
                  const rate = totalExpected > 0 ? Math.round((totalReceived / totalExpected) * 100) : 0;
                  const fl = (cycle.fines_ledger as Array<Record<string, unknown>>) || [];
                  const finesCollectedAmt = fl.filter((f) => f.status === "paid").reduce((s, f) => s + Number(f.amount), 0);
                  const freqDays = freq === "weekly" ? 7 : freq === "biweekly" ? 14 : 30;
                  const startD = new Date((cycle.start_date as string) || "");

                  return (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-primary" />
                          {t("treasury")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                          <div><p className="text-[10px] text-muted-foreground">{t("totalExpected")}</p><p className="text-sm font-bold">{formatAmount(totalExpected, currency)}</p></div>
                          <div><p className="text-[10px] text-muted-foreground">{t("totalReceived")}</p><p className="text-sm font-bold">{formatAmount(totalReceived, currency)}</p></div>
                          <div><p className="text-[10px] text-muted-foreground">{t("collectionRate")}</p><p className={`text-sm font-bold ${rate >= 80 ? "text-emerald-600" : rate >= 50 ? "text-amber-600" : "text-red-600"}`}>{rate}%</p></div>
                          <div><p className="text-[10px] text-muted-foreground">{t("totalPayouts")}</p><p className="text-sm font-bold">{formatAmount(totalPayouts, currency)}</p></div>
                          <div><p className="text-[10px] text-muted-foreground">{t("balance")}</p><p className={`text-sm font-bold ${balance >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatAmount(balance, currency)}</p></div>
                          <div><p className="text-[10px] text-muted-foreground">{t("finesCollected")}</p><p className="text-sm font-bold">{formatAmount(finesCollectedAmt, currency)}</p></div>
                        </div>
                        {/* Round Breakdown */}
                        <RoundBreakdownTable
                          cycleId={id}
                          totalRounds={totalRnds}
                          currentRound={currentRound}
                          startDate={startD}
                          freqDays={freqDays}
                          participants={participants}
                          currency={currency}
                          amt={amt}
                          t={t}
                          tc={tc}
                        />
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* ── Fines ──────────────────────────────────────── */}
                {(() => {
                  const fl = (cycle.fines_ledger as Array<Record<string, unknown>>) || [];
                  const fr = (cycle.fine_rules as Record<string, number>) || {};
                  const hasFineRules = (fr.late_contribution || 0) > 0 || (fr.absence || 0) > 0 || (fr.default_penalty || 0) > 0;
                  const totalFinesAmt = fl.reduce((s, f) => s + Number(f.amount), 0);
                  const paidFinesAmt = fl.filter((f) => f.status === "paid").reduce((s, f) => s + Number(f.amount), 0);
                  const outstandingFinesAmt = fl.filter((f) => f.status === "unpaid").reduce((s, f) => s + Number(f.amount), 0);

                  return (
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                            {t("fines")} {fl.length > 0 && <Badge variant="secondary" className="text-[10px]">{fl.length}</Badge>}
                          </CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* Rules display */}
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {hasFineRules ? (
                            <>
                              {(fr.late_contribution || 0) > 0 && <span>{t("lateContributionFine")}: {formatAmount(fr.late_contribution, currency)}</span>}
                              {(fr.absence || 0) > 0 && <span>{t("absenceFine")}: {formatAmount(fr.absence, currency)}</span>}
                              {(fr.default_penalty || 0) > 0 && <span>{t("defaultPenalty")}: {formatAmount(fr.default_penalty, currency)}</span>}
                            </>
                          ) : (
                            <span>{t("noFineRules")}</span>
                          )}
                        </div>
                        {/* Ledger */}
                        {fl.length > 0 && (
                          <>
                            <div className="rounded-md border divide-y">
                              {fl.map((fine: Record<string, unknown>) => {
                                const mp = participants.find((p: Record<string, unknown>) => (p.membership_id as string) === (fine.membership_id as string));
                                const mm = mp?.membership as Record<string, unknown> | undefined;
                                return (
                                  <div key={fine.id as string} className="flex items-center justify-between px-3 py-2 text-xs">
                                    <span className="font-medium">{mm ? getMemberName(mm) : "—"}</span>
                                    <span className="text-muted-foreground capitalize">{String(fine.type).replace(/_/g, " ")}</span>
                                    <span>{formatAmount(Number(fine.amount), currency)}</span>
                                    <Badge className={`text-[10px] ${(fine.status as string) === "paid" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"}`}>
                                      {(fine.status as string) === "paid" ? t("markPaid") : t("unpaid")}
                                    </Badge>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="flex gap-4 text-xs text-muted-foreground">
                              <span>{t("totalFines")}: {formatAmount(totalFinesAmt, currency)}</span>
                              <span>{t("finesCollected")}: {formatAmount(paidFinesAmt, currency)}</span>
                              <span>{t("finesOutstanding")}: {formatAmount(outstandingFinesAmt, currency)}</span>
                            </div>
                          </>
                        )}
                        {fl.length === 0 && <p className="text-xs text-muted-foreground">{t("noFines")}</p>}
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* ── Issues ─────────────────────────────────────── */}
                {(() => {
                  const il = (cycle.issues_log as Array<Record<string, unknown>>) || [];
                  return (
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                            {t("issues")} {il.length > 0 && <Badge variant="secondary" className="text-[10px]">{il.length}</Badge>}
                          </CardTitle>
                          {isAdmin && (
                            <IssueRecordButton cycleId={id} participants={participants} queryClient={queryClient} issuesLog={il} t={t} tc={tc} />
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        {il.length === 0 ? (
                          <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                            <CheckCircle className="h-4 w-4" />
                            <span>{t("noIssues")}</span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {il.sort((a, b) => new Date(b.date as string).getTime() - new Date(a.date as string).getTime()).map((issue: Record<string, unknown>) => {
                              const sevColors: Record<string, string> = { low: "bg-emerald-100 text-emerald-800", medium: "bg-amber-100 text-amber-800", high: "bg-red-100 text-red-800" };
                              const mp = issue.membership_id ? participants.find((p: Record<string, unknown>) => (p.membership_id as string) === (issue.membership_id as string)) : null;
                              const mm = mp?.membership as Record<string, unknown> | undefined;
                              const isResolved = issue.resolved as boolean;
                              return (
                                <div key={issue.id as string} className={`rounded-lg border p-3 text-xs ${isResolved ? "opacity-60" : ""}`}>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge className={`text-[10px] ${sevColors[issue.severity as string] || sevColors.low}`}>{t((issue.severity as string) || "low")}</Badge>
                                    <span className="font-medium capitalize">{String(issue.type).replace(/_/g, " ")}</span>
                                    {mm && <span className="text-muted-foreground">— {getMemberName(mm)}</span>}
                                    {isResolved && <Badge variant="secondary" className="text-[10px]">{t("resolved")}</Badge>}
                                  </div>
                                  <p className={`mt-1 text-muted-foreground ${isResolved ? "line-through" : ""}`}>{String(issue.description)}</p>
                                  <p className="mt-1 text-muted-foreground">{new Date(issue.date as string).toLocaleDateString()}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* Round Management (admin only) */}
                {isAdmin && status === "active" && (
                  <RoundManagement
                    cycleId={id}
                    currentRound={currentRound}
                    totalRounds={totalRnds}
                    cycleAmount={amt}
                    currency={currency}
                    participants={participants}
                    fineRules={((cycle.fine_rules as Record<string, number>) || { late_contribution: 0, absence: 0, default_penalty: 0 })}
                    finesLedger={((cycle.fines_ledger as Array<Record<string, unknown>>) || [])}
                    expanded={expandedCycleId === id}
                    onToggle={() => setExpandedCycleId(expandedCycleId === id ? null : id)}
                    roundContribs={roundContribs}
                    setRoundContribs={setRoundContribs}
                    queryClient={queryClient}
                    t={t}
                    tc={tc}
                  />
                )}

                {/* Complete Cycle */}
                {isAdmin && status === "active" && currentRound >= totalRnds && (
                  <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
                    <CardContent className="p-4 space-y-3">
                      <p className="text-sm font-medium">{t("completeCycle")}</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-muted-foreground">{t("totalExpectedFull")}:</span> <span className="font-medium">{formatAmount(totalRnds * totalMembers * amt, currency)}</span></div>
                        <div><span className="text-muted-foreground">{t("totalPayoutsFull")}:</span> <span className="font-medium">{formatAmount(participants.filter((p: Record<string, unknown>) => p.has_collected).length * potSize, currency)}</span></div>
                      </div>
                      <Button
                        className="w-full"
                        onClick={async () => {
                          if (!confirm(t("completeConfirm"))) return;
                          const supabase = createClient();
                          await supabase.from("savings_cycles").update({ status: "completed" }).eq("id", id);
                          queryClient.invalidateQueries({ queryKey: ["savings-cycles"] });
                        }}
                      >
                        <CheckCircle className="mr-2 h-4 w-4" />
                        {t("completeCycle")}
                      </Button>
                    </CardContent>
                  </Card>
                )}
                </>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create Cycle Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("createCycle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("cycleName")} *</Label>
              <Input value={cycleName} onChange={(e) => setCycleName(e.target.value)} placeholder={t("cycleName")} className={fieldErrors.name ? "border-destructive" : ""} />
              {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("amount")} ({currentGroup?.currency || "XAF"}) *</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10000" className={fieldErrors.amount ? "border-destructive" : ""} />
                {fieldErrors.amount && <p className="text-xs text-destructive">{fieldErrors.amount}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t("frequency")}</Label>
                <Select value={frequency} onValueChange={(v) => setFrequency(v ?? "monthly")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">{t("weekly")}</SelectItem>
                    <SelectItem value="biweekly">{t("biweekly")}</SelectItem>
                    <SelectItem value="monthly">{t("monthly")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("totalRounds")} *</Label>
                <Input type="number" value={totalRounds} onChange={(e) => setTotalRounds(e.target.value)} placeholder="12" className={fieldErrors.rounds ? "border-destructive" : ""} />
                {fieldErrors.rounds && <p className="text-xs text-destructive">{fieldErrors.rounds}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t("startDate")} *</Label>
                <Input type="date" value={startDate || new Date().toISOString().slice(0, 10)} onChange={(e) => setStartDate(e.target.value)} className={fieldErrors.date ? "border-destructive" : ""} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("rotationType")}</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: "sequential", label: t("takeTurns"), desc: t("takeTurnsDesc"), Icon: Repeat },
                  { value: "random", label: t("luckyDraw"), desc: t("luckyDrawDesc"), Icon: Shuffle },
                  { value: "auction", label: t("bidding"), desc: t("biddingDesc"), Icon: Gavel },
                ] as const).map(({ value, label, desc, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRotationType(value)}
                    className={`flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left text-xs transition-colors ${rotationType === value ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  >
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="font-medium">{label}</span>
                    <span className="text-[10px] text-muted-foreground line-clamp-2">{desc}</span>
                  </button>
                ))}
              </div>
            </div>
            {/* Auto-enroll */}
            {!editCycleId && (
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <input type="checkbox" checked={autoEnroll} onChange={(e) => setAutoEnroll(e.target.checked)} className="h-4 w-4 rounded border-input" />
                <div>
                  <p className="text-sm font-medium">{t("autoEnrollAll")}</p>
                  <p className="text-[10px] text-muted-foreground">{t("enrollAfterCreate")}</p>
                </div>
              </div>
            )}
            {createError && <p className="text-sm text-destructive">{createError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>{tc("cancel")}</Button>
            <Button onClick={handleCreateCycle} disabled={createCycle.isPending}>
              {createCycle.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tc("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* End Cycle Confirmation Dialog */}
      <Dialog open={!!endingCycleId} onOpenChange={() => setEndingCycleId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("endCycle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("endCycleConfirm")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndingCycleId(null)}>{tc("cancel")}</Button>
            <Button variant="destructive" onClick={async () => {
              if (!endingCycleId) return;
              const supabase = createClient();
              await supabase.from('savings_cycles').update({ status: 'completed' }).eq('id', endingCycleId);
              queryClient.invalidateQueries({ queryKey: ["savings-cycles"] });
              setEndingCycleId(null);
            }}>{tc("confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Participants Dialog */}
      <Dialog open={showAddParticipants} onOpenChange={setShowAddParticipants}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("addParticipant")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{addPartSelected.length} {t("participants")} selected</p>
            <div className="max-h-60 overflow-y-auto rounded-lg border divide-y">
              {activeMembers.map((m: Record<string, unknown>) => {
                const mid = m.id as string;
                // Check if already enrolled in this cycle
                const cycle = (cycles || []).find((c: Record<string, unknown>) => (c.id as string) === addPartCycleId);
                const existingParticipants = ((cycle as Record<string, unknown>)?.savings_participants as Record<string, unknown>[]) || [];
                const alreadyEnrolled = existingParticipants.some((p) => (p.membership_id as string) === mid);
                const sel = addPartSelected.includes(mid);
                return (
                  <button key={mid} type="button" disabled={alreadyEnrolled}
                    onClick={() => setAddPartSelected((prev) => sel ? prev.filter((x) => x !== mid) : [...prev, mid])}
                    className={`flex w-full items-center gap-2 p-2.5 text-left text-xs transition-colors ${alreadyEnrolled ? "opacity-50 cursor-not-allowed" : sel ? "bg-primary/5" : "hover:bg-muted/50"}`}>
                    {alreadyEnrolled ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> : sel ? <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" /> : <div className="h-3.5 w-3.5 rounded-full border shrink-0" />}
                    <span>{getMemberName(m)}</span>
                    {alreadyEnrolled && <span className="ml-auto text-[10px] text-muted-foreground">enrolled</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddParticipants(false)}>{tc("cancel")}</Button>
            <Button disabled={addingParts || addPartSelected.length === 0} onClick={async () => {
              if (!addPartCycleId) return;
              setAddingParts(true);
              try {
                const supabase = createClient();
                const cycle = (cycles || []).find((c: Record<string, unknown>) => (c.id as string) === addPartCycleId);
                const existing = ((cycle as Record<string, unknown>)?.savings_participants as Record<string, unknown>[]) || [];
                const maxRound = existing.reduce((max, p) => Math.max(max, (p.collection_round as number) || 0), 0);
                const parts = addPartSelected.map((mid, i) => ({
                  cycle_id: addPartCycleId,
                  membership_id: mid,
                  collection_round: maxRound + i + 1,
                  has_collected: false,
                }));
                await supabase.from("savings_participants").insert(parts);
                queryClient.invalidateQueries({ queryKey: ["savings-cycles"] });
                setShowAddParticipants(false);
              } finally { setAddingParts(false); }
            }}>
              {addingParts && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("addParticipant")} ({addPartSelected.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Paid Dialog */}
      <Dialog open={showMarkPaidDialog} onOpenChange={setShowMarkPaidDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("recordPayment")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs text-muted-foreground">{t("participants")}</p>
              <p className="text-sm font-medium">{mpMemberName}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("required")}: {formatAmount(mpContribAmount, groupCurrency)}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("amount")} ({groupCurrency})</Label>
              <Input type="number" value={mpAmount} onChange={(e) => setMpAmount(e.target.value)} />
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" className="shrink-0 text-xs flex-1" onClick={() => setMpAmount(String(mpContribAmount))}>
                  {t("fullPayment")} ({formatAmount(mpContribAmount, groupCurrency)})
                </Button>
                <Button variant="outline" size="sm" className="shrink-0 text-xs flex-1" onClick={() => setMpAmount(String(Math.round(mpContribAmount / 2)))}>
                  {t("halfPayment")} ({formatAmount(Math.round(mpContribAmount / 2), groupCurrency)})
                </Button>
              </div>
              {mpAmount && Number(mpAmount) > 0 && Number(mpAmount) < mpContribAmount && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {t("partialWarning", { amount: formatAmount(mpContribAmount - Number(mpAmount), groupCurrency) })}
                </p>
              )}
              {mpAmount && Number(mpAmount) > mpContribAmount && (
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {t("overpaymentNote", { amount: formatAmount(Number(mpAmount) - mpContribAmount, groupCurrency) })}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("paymentMethod")}</Label>
              <Select value={mpMethod} onValueChange={(v) => setMpMethod(v ?? "cash")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t("cash")}</SelectItem>
                  <SelectItem value="mobile_money">{t("mobileMoney")}</SelectItem>
                  <SelectItem value="bank_transfer">{t("bankTransfer")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("notes")}</Label>
              <Input value={mpNotes} onChange={(e) => setMpNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMarkPaidDialog(false)}>{tc("cancel")}</Button>
            <Button disabled={mpSaving || !mpAmount} onClick={async () => {
              if (!mpCycleId || !mpMembershipId) return;
              setMpSaving(true);
              try {
                const supabase = createClient();
                const paidAmount = Number(mpAmount);
                const isPartial = paidAmount < mpContribAmount;
                await supabase.from("savings_contributions").upsert({
                  cycle_id: mpCycleId,
                  membership_id: mpMembershipId,
                  round_number: mpCurrentRound,
                  amount: paidAmount,
                  payment_method: mpMethod,
                  paid_at: new Date().toISOString(),
                  status: isPartial ? "partial" : "paid",
                }, { onConflict: "cycle_id,membership_id,round_number" });
                queryClient.invalidateQueries({ queryKey: ["savings-cycles"] });
                setShowMarkPaidDialog(false);
              } finally { setMpSaving(false); }
            }}>
              {mpSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("markPaid")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Issue Record Button ──────────────────────────────────────────────────

function IssueRecordButton({ cycleId, participants, queryClient, issuesLog, t, tc }: {
  cycleId: string;
  participants: Record<string, unknown>[];
  queryClient: ReturnType<typeof import("@tanstack/react-query").useQueryClient>;
  issuesLog: Array<Record<string, unknown>>;
  t: ReturnType<typeof import("next-intl").useTranslations>;
  tc: ReturnType<typeof import("next-intl").useTranslations>;
}) {
  const [open, setOpen] = useState(false);
  const [issueType, setIssueType] = useState("payment_delay");
  const [description, setDescription] = useState("");
  const [membershipId, setMembershipId] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const newIssue = {
        id: crypto.randomUUID(),
        type: issueType,
        description: description.trim(),
        membership_id: membershipId || null,
        severity,
        date: new Date().toISOString(),
        resolved: false,
      };
      const updated = [...issuesLog, newIssue];
      await supabase.from("savings_cycles").update({ issues_log: updated }).eq("id", cycleId);
      queryClient.invalidateQueries({ queryKey: ["savings-cycles"] });
      setOpen(false);
      setDescription("");
      setMembershipId("");
    } finally { setSaving(false); }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-3 w-3" />
        {t("recordIssue")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("recordIssue")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{t("issueType")}</Label>
              <Select value={issueType} onValueChange={(v) => setIssueType(v ?? "payment_delay")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payment_delay">{t("paymentDelay")}</SelectItem>
                  <SelectItem value="collection_dispute">{t("collectionDispute")}</SelectItem>
                  <SelectItem value="member_default">{t("memberDefault")}</SelectItem>
                  <SelectItem value="late_payment">{t("latePayment")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("description")} *</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>{t("affectedMember")}</Label>
              <Select value={membershipId} onValueChange={(v) => setMembershipId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">—</SelectItem>
                  {participants.map((p: Record<string, unknown>) => {
                    const m = p.membership as Record<string, unknown> | undefined;
                    const mid = (p.membership_id as string) || "";
                    return <SelectItem key={mid} value={mid}>{m ? getMemberName(m) : "—"}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("severity")}</Label>
              <div className="flex gap-2">
                {(["low", "medium", "high"] as const).map((s) => (
                  <Button key={s} type="button" variant={severity === s ? "default" : "outline"} size="sm" className="text-xs" onClick={() => setSeverity(s)}>
                    {t(s)}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{tc("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={saving || !description.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("recordIssue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── ROUND BREAKDOWN TABLE WITH EXPANDABLE HISTORY ───────────────────────

function RoundBreakdownTable({
  cycleId,
  totalRounds,
  currentRound,
  startDate,
  freqDays,
  participants,
  currency,
  amt,
  t,
  tc,
}: {
  cycleId: string;
  totalRounds: number;
  currentRound: number;
  startDate: Date;
  freqDays: number;
  participants: Record<string, unknown>[];
  currency: string;
  amt: number;
  t: ReturnType<typeof import("next-intl").useTranslations>;
  tc: ReturnType<typeof import("next-intl").useTranslations>;
}) {
  const [expandedRound, setExpandedRound] = useState<number | null>(null);
  const [roundData, setRoundData] = useState<Record<string, unknown>[]>([]);
  const [loadingRound, setLoadingRound] = useState(false);

  const toggleRound = async (rnd: number) => {
    if (expandedRound === rnd) {
      setExpandedRound(null);
      return;
    }
    setExpandedRound(rnd);
    setLoadingRound(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("savings_contributions")
        .select("*, membership:memberships!inner(id, display_name, is_proxy, profiles:profiles!memberships_user_id_fkey(id, full_name))")
        .eq("cycle_id", cycleId)
        .eq("round_number", rnd);
      const resolved = (data || []).map((c: Record<string, unknown>) => {
        const m = c.membership as Record<string, unknown> | null;
        return { ...c, membership: m ? { ...m, profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles } : null };
      });
      setRoundData(resolved);
    } catch {
      setRoundData([]);
    } finally {
      setLoadingRound(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{t("roundBreakdown")}</p>
      <div className="rounded-md border overflow-x-auto max-h-[400px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-[30px]"></TableHead>
              <TableHead className="text-xs w-[50px]">#</TableHead>
              <TableHead className="text-xs">{t("dueDate")}</TableHead>
              <TableHead className="text-xs text-center">{t("collector")}</TableHead>
              <TableHead className="text-xs text-center">{tc("status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: totalRounds }, (_, i) => i + 1).map((rnd) => {
              const dueDate = new Date(startDate.getTime() + (rnd - 1) * freqDays * 86400000);
              const collector = participants.find((p: Record<string, unknown>) => (p.collection_round as number) === rnd);
              const cm = collector?.membership as Record<string, unknown> | undefined;
              const cName = cm ? getMemberName(cm) : "—";
              const isCurrent = rnd === currentRound;
              const isPast = rnd < currentRound;
              const isExpanded = expandedRound === rnd;

              return (
                <Fragment key={rnd}>
                  <TableRow
                    className={`${isCurrent ? "bg-blue-50 dark:bg-blue-950/20" : ""} ${isPast ? "cursor-pointer hover:bg-muted/50" : ""}`}
                    onClick={() => isPast && toggleRound(rnd)}
                  >
                    <TableCell className="text-xs px-2">
                      {isPast && (
                        <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      )}
                    </TableCell>
                    <TableCell className="text-xs">R{rnd}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{dueDate.toLocaleDateString()}</TableCell>
                    <TableCell className="text-xs text-center">{cName}</TableCell>
                    <TableCell className="text-center">
                      {isCurrent ? <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-[10px]">{t("inProgress")}</Badge>
                      : isPast ? <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">{t("statusCompleted")}</Badge>
                      : <Badge variant="secondary" className="text-[10px]">{t("upcoming")}</Badge>}
                    </TableCell>
                  </TableRow>
                  {isExpanded && isPast && (
                    <TableRow>
                      <TableCell colSpan={5} className="bg-muted/30 p-3">
                        {loadingRound ? (
                          <div className="flex items-center gap-2 py-2"><Loader2 className="h-3 w-3 animate-spin" /><span className="text-xs text-muted-foreground">Loading...</span></div>
                        ) : (
                          <div className="space-y-3">
                            {/* Payments */}
                            <div>
                              <p className="text-[10px] font-semibold text-muted-foreground mb-1">{t("roundPayments")}</p>
                              {roundData.length > 0 ? (
                                <div className="space-y-1">
                                  {roundData.map((c: Record<string, unknown>) => (
                                    <div key={c.id as string} className="flex items-center justify-between text-xs">
                                      <span>{getMemberName(c.membership as Record<string, unknown>)}</span>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">{formatAmount(Number(c.amount), currency)}</span>
                                        <Badge className={`text-[9px] ${(c.status as string) === "paid" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"}`}>
                                          {(c.status as string) === "paid" ? t("statusPaid") : t("partial")}
                                        </Badge>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[10px] text-muted-foreground">—</p>
                              )}
                            </div>
                            {/* Unpaid */}
                            {(() => {
                              const paidIds = new Set(roundData.map((c) => c.membership_id as string));
                              const unpaid = participants.filter((p: Record<string, unknown>) => !paidIds.has((p.membership_id as string) || ""));
                              if (unpaid.length === 0) return <p className="text-[10px] text-emerald-600">{t("allPaidInFull")}</p>;
                              return (
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground mb-1">{t("roundUnpaid")}</p>
                                  <div className="space-y-0.5">
                                    {unpaid.map((p: Record<string, unknown>) => {
                                      const m = p.membership as Record<string, unknown> | undefined;
                                      return <p key={p.id as string} className="text-[10px] text-red-600">{m ? getMemberName(m) : "—"}</p>;
                                    })}
                                  </div>
                                </div>
                              );
                            })()}
                            {/* Collector */}
                            <div>
                              <p className="text-[10px] font-semibold text-muted-foreground mb-1">{t("roundCollector")}</p>
                              {collector ? (
                                <div className="flex items-center gap-2 text-xs">
                                  <span>{cName}</span>
                                  {(collector.has_collected as boolean) ? (
                                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-[9px]">{t("paidOut")}</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-[9px]">{t("statusPending")}</Badge>
                                  )}
                                  {(collector.collected_at as string) && (
                                    <span className="text-[10px] text-muted-foreground">{new Date(collector.collected_at as string).toLocaleDateString()}</span>
                                  )}
                                </div>
                              ) : <p className="text-[10px] text-muted-foreground">—</p>}
                            </div>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
