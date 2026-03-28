"use client";
import { formatAmount } from "@/lib/currencies";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  const handleAdvanceRound = async () => {
    if (currentRound >= totalRounds) return; // Guard: cannot advance past total
    setAdvancing(true);
    const supabase = createClient();
    await supabase
      .from("savings_cycles")
      .update({ current_round: currentRound + 1 })
      .eq("id", cycleId);
    queryClient.invalidateQueries({ queryKey: ["savings-cycles"] });
    setAdvancing(false);
  };

  const handleRecordCollection = async () => {
    if (!collectorParticipantId) return;
    setRecordingCollection(true);
    try {
      const supabase = createClient();
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

          {/* Record Collection Dialog */}
          <Dialog open={showCollectionDialog} onOpenChange={setShowCollectionDialog}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>{t("recordCollection")}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">{t("collector")}</p>
                  <p className="text-sm font-medium">{collectorName}</p>
                </div>
                <div className="space-y-2">
                  <Label>{t("amount")}</Label>
                  <Input type="number" value={collectionAmount} onChange={(e) => setCollectionAmount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{tc("method") || "Method"}</Label>
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
          const parts = enrollMembers.map((m: Record<string, unknown>, i: number) => ({
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

          return (
            <Card key={id}>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-lg">{name}</CardTitle>
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
                {/* Meeting info */}
                {((cycle.meeting_schedule as string) || (cycle.meeting_location as string)) && (
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {(cycle.meeting_schedule as string) && <span>📅 {t("meets")}: {cycle.meeting_schedule as string}</span>}
                    {(cycle.meeting_location as string) && <span>📍 {cycle.meeting_location as string}</span>}
                  </div>
                )}
                {/* Cycle overview grid */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("currentRound")}</p>
                    <p className="text-lg font-semibold text-foreground">
                      {currentRound} {t("of")} {totalRnds}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("potSize")}</p>
                    <p className="text-lg font-semibold text-foreground">
                      {formatAmount(potSize, currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {totalMembers} members x {formatAmount(amt, currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("participants")}</p>
                    <p className="text-lg font-semibold text-foreground">
                      {totalMembers}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("amount")}</p>
                    <p className="text-lg font-semibold text-foreground">
                      {formatAmount(amt, currency)}
                    </p>
                  </div>
                </div>

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
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {participants.map((p: Record<string, unknown>) => {
                        const pid = p.id as string;
                        const membership = p.membership as Record<string, unknown> | undefined;
                        const fullName = membership ? getMemberName(membership) : "Member";
                        const profile = membership
                          ? (Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles) as Record<string, unknown> | undefined
                          : undefined;
                        const avatarUrl = (profile?.avatar_url as string) || "";
                        const collectionRound = (p.collection_round as number) || 0;
                        const hasCollected = p.has_collected as boolean;

                        return (
                          <div
                            key={pid}
                            className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 dark:bg-muted/10"
                          >
                            <div className="flex items-center gap-2">
                              <Avatar className="h-7 w-7">
                                <AvatarImage src={avatarUrl || undefined} />
                                <AvatarFallback className="text-xs">
                                  {getInitials(fullName)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <span className="text-sm text-foreground truncate block">{fullName}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  R{collectionRound}
                                </span>
                              </div>
                            </div>
                            {hasCollected ? (
                              <Badge variant="default" className="bg-emerald-600 text-white dark:bg-emerald-500 text-xs">
                                {t("statusPaid")}
                              </Badge>
                            ) : collectionRound <= currentRound ? (
                              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs">
                                {t("statusPending")}
                              </Badge>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-4 text-center">{t("noCyclesDesc")}</p>
                  )}
                </div>

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
    </div>
  );
}
