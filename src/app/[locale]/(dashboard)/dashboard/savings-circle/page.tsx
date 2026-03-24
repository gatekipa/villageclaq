"use client";

import { useState } from "react";
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
  CircleDollarSign,
  Users,
  Repeat,
  Shuffle,
  Gavel,
  Plus,
  Loader2,
} from "lucide-react";
import { useSavingsCycles, useCreateSavingsCycle } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";

type RotationType = "sequential" | "random" | "auction";
type Frequency = "weekly" | "biweekly" | "monthly";

function formatCurrency(amount: number, currency = "XAF") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const rotationIcons: Record<RotationType, typeof Repeat> = {
  sequential: Repeat,
  random: Shuffle,
  auction: Gavel,
};

export default function SavingsCirclePage() {
  const t = useTranslations("savingsCircle");
  const tc = useTranslations("common");
  const { currentGroup, isAdmin } = useGroup();
  const { data: cycles, isLoading, isError, error, refetch } = useSavingsCycles();
  const createCycle = useCreateSavingsCycle();

  // Create dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [cycleName, setCycleName] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<string>("monthly");
  const [totalRounds, setTotalRounds] = useState("");
  const [startDate, setStartDate] = useState("");
  const [rotationType, setRotationType] = useState<string>("sequential");
  const [createError, setCreateError] = useState("");

  const resetCreateForm = () => {
    setCycleName("");
    setAmount("");
    setFrequency("monthly");
    setTotalRounds("");
    setStartDate("");
    setRotationType("sequential");
    setCreateError("");
  };

  const handleCreateCycle = async () => {
    if (!cycleName.trim() || !amount || !totalRounds || !startDate) {
      setCreateError(tc("required"));
      return;
    }
    setCreateError("");
    try {
      await createCycle.mutateAsync({
        name: cycleName.trim(),
        amount: Number(amount),
        currency: currentGroup?.currency || "XAF",
        frequency,
        total_rounds: Number(totalRounds),
        rotation_type: rotationType,
        start_date: startDate,
      });
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
              <div className="space-y-2">
                <Label>{t("rotationType")}</Label>
                <Select value={rotationType} onValueChange={(v) => setRotationType(v ?? "sequential")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sequential">{t("sequential")}</SelectItem>
                    <SelectItem value="random">{t("random")}</SelectItem>
                    <SelectItem value="auction">{t("auction")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <CircleDollarSign className="size-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("activeCycles")}</p>
              <p className="text-xl font-bold text-foreground">
                {cycles.filter((c: Record<string, unknown>) => c.status === "active").length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Users className="size-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("participants")}</p>
              <p className="text-xl font-bold text-foreground">
                {cycles.reduce((sum: number, c: Record<string, unknown>) => {
                  const participants = (c.savings_participants as unknown[]) || [];
                  return sum + participants.length;
                }, 0)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

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
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="default" className={statusColor}>
                      {t(`status${status.charAt(0).toUpperCase() + status.slice(1)}` as Parameters<typeof t>[0])}
                    </Badge>
                    <Badge variant="outline">{t(freq)}</Badge>
                    <Badge variant="secondary" className="gap-1">
                      <RotationIcon className="size-3" />
                      {t(rotType)}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
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
                      {formatCurrency(potSize, currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {totalMembers} members x {formatCurrency(amt, currency)}
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
                      {formatCurrency(amt, currency)}
                    </p>
                  </div>
                </div>

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
                {participants.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-foreground">{t("participants")}</h4>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {participants.map((p: Record<string, unknown>) => {
                        const pid = p.id as string;
                        const membership = p.membership as Record<string, unknown> | undefined;
                        const profile = membership
                          ? (Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles) as Record<string, unknown> | undefined
                          : undefined;
                        const fullName = (profile?.full_name as string) || "Member";
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
                  </div>
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
            <div className="space-y-2">
              <Label>{t("rotationType")}</Label>
              <Select value={rotationType} onValueChange={(v) => setRotationType(v ?? "sequential")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequential">{t("sequential")}</SelectItem>
                  <SelectItem value="random">{t("random")}</SelectItem>
                  <SelectItem value="auction">{t("auction")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
