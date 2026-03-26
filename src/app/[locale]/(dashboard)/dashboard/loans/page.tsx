"use client";
import { formatAmount } from "@/lib/currencies";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Landmark,
  DollarSign,
  Clock,
  CheckCircle2,
  Plus,
  Percent,
  CalendarDays,
  UserCheck,
} from "lucide-react";
import { useLoans } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { DashboardSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { createClient } from "@/lib/supabase/client";

type LoanStatus = "pending" | "approved" | "denied" | "active" | "repaid" | "defaulted";

const statusColors: Record<LoanStatus, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  denied: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  repaid: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
  defaulted: "bg-red-600 text-white dark:bg-red-500",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatCurrency(amount: number, currency = "XAF") {
  try {
    return formatAmount(amount, currency || "XAF");
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function LoansPage() {
  const t = useTranslations("loans");
  const { isAdmin, currentMembership, currentGroup, user } = useGroup();
  const { data: loans, isLoading, isError, error, refetch } = useLoans();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    amount: "",
    reason: "",
    repayment_months: "",
  });

  const currency = currentGroup?.currency || "XAF";

  const handleSubmitLoan = async () => {
    if (!currentMembership || !currentGroup || !user) return;
    setSubmitting(true);
    try {
      const supabase = createClient();
      await supabase.from("loan_requests").insert({
        group_id: currentGroup.id,
        membership_id: currentMembership.id,
        amount: Number(formData.amount),
        reason: formData.reason,
        repayment_months: Number(formData.repayment_months),
        interest_rate: 0,
        status: "pending",
      });
      setDialogOpen(false);
      setFormData({ amount: "", reason: "", repayment_months: "" });
      refetch();
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <DashboardSkeleton />;
  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  const allLoans = loans || [];

  // Filter: admin sees all, member sees own
  const visibleLoans = isAdmin
    ? allLoans
    : allLoans.filter((l: Record<string, unknown>) => {
        const membership = l.membership as Record<string, unknown> | undefined;
        return membership?.id === currentMembership?.id;
      });

  // Stats
  const activeAmount = allLoans
    .filter((l: Record<string, unknown>) => l.status === "active")
    .reduce((sum: number, l: Record<string, unknown>) => sum + Number(l.amount || 0), 0);
  const pendingCount = allLoans.filter((l: Record<string, unknown>) => l.status === "pending").length;
  const totalRepaid = allLoans
    .filter((l: Record<string, unknown>) => l.status === "repaid")
    .reduce((sum: number, l: Record<string, unknown>) => sum + Number(l.amount || 0), 0);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {!isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger>
              <Button className="gap-1.5">
                <Plus className="size-4" />
                {t("requestLoan")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("requestLoan")}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4 pt-2">
                <div className="space-y-2">
                  <Label>{t("amount")}</Label>
                  <Input
                    type="number"
                    placeholder={t("loanAmountPlaceholder")}
                    value={formData.amount}
                    onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("reason")}</Label>
                  <Textarea
                    placeholder={t("reasonPlaceholder")}
                    value={formData.reason}
                    onChange={(e) => setFormData((prev) => ({ ...prev, reason: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("repaymentMonths")}</Label>
                  <Input
                    type="number"
                    placeholder={t("monthsPlaceholder")}
                    value={formData.repayment_months}
                    onChange={(e) => setFormData((prev) => ({ ...prev, repayment_months: e.target.value }))}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleSubmitLoan}
                  disabled={submitting || !formData.amount || !formData.reason || !formData.repayment_months}
                >
                  {t("submitRequest")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                <DollarSign className="size-5 text-emerald-700 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("activeLoans")}</p>
                <p className="text-lg font-bold">{formatCurrency(activeAmount, currency)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
                <Clock className="size-5 text-amber-700 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("pendingRequests")}</p>
                <p className="text-lg font-bold">{pendingCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30">
                <CheckCircle2 className="size-5 text-blue-700 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("totalRepaid")}</p>
                <p className="text-lg font-bold">{formatCurrency(totalRepaid, currency)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Loans List */}
      {visibleLoans.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title={t("noLoans")}
          description={t("noLoansDesc")}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {visibleLoans.map((loan: Record<string, unknown>) => {
            const id = loan.id as string;
            const amount = Number(loan.amount || 0);
            const status = (loan.status as LoanStatus) || "pending";
            const reason = (loan.reason as string) || "";
            const interestRate = Number(loan.interest_rate || 0);
            const repaymentMonths = Number(loan.repayment_months || 0);
            const disbursedAt = loan.disbursed_at as string | null;
            const approvedByName = (loan.approved_by_name as string) || "";
            const repayments = (loan.repayments as Record<string, unknown>[]) || [];

            const membership = loan.membership as Record<string, unknown> | undefined;
            const profile = membership
              ? ((Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles) as Record<string, unknown> | undefined)
              : undefined;
            const memberName = (profile?.full_name as string) || "Member";

            // Repayment progress for active loans
            const totalDue = amount + amount * (interestRate / 100);
            const amountPaid = repayments.reduce(
              (sum: number, r: Record<string, unknown>) => sum + Number(r.amount || 0),
              0
            );
            const progressPercent = totalDue > 0 ? Math.min(Math.round((amountPaid / totalDue) * 100), 100) : 0;

            return (
              <Card key={id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        {getInitials(memberName)}
                      </div>
                      <div>
                        <CardTitle className="text-base">{memberName}</CardTitle>
                        <p className="text-xs text-muted-foreground truncate max-w-xs">{reason}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pl-13 sm:pl-0">
                      <span className="text-lg font-bold">{formatCurrency(amount, currency)}</span>
                      <Badge className={statusColors[status]}>
                        {t(`status_${status}` as Parameters<typeof t>[0])}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {/* Details row */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Percent className="size-3.5" />
                      <span>{t("interestRate")}: {interestRate}%</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <CalendarDays className="size-3.5" />
                      <span>{repaymentMonths} {t("repaymentMonths").toLowerCase()}</span>
                    </div>
                    {approvedByName && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <UserCheck className="size-3.5" />
                        <span>{approvedByName}</span>
                      </div>
                    )}
                    {disbursedAt && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <CalendarDays className="size-3.5" />
                        <span>{t("disbursedAt")}: {formatDate(disbursedAt)}</span>
                      </div>
                    )}
                  </div>

                  {/* Repayment progress for active loans */}
                  {status === "active" && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{t("repaymentProgress")}</span>
                        <span className="font-medium">
                          {formatCurrency(amountPaid, currency)} / {formatCurrency(totalDue, currency)} ({progressPercent}%)
                        </span>
                      </div>
                      <Progress value={progressPercent} className="h-2" />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
