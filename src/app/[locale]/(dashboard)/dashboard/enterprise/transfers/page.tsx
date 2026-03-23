"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  ArrowLeft,
  ArrowRightLeft,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  FileText,
} from "lucide-react";

type TransferStatus = "requested" | "source_approved" | "dest_approved" | "completed" | "rejected";

interface Transfer {
  id: string;
  memberName: string;
  sourceBranch: string;
  destBranch: string;
  status: TransferStatus;
  reason: string;
  requestedBy: string;
  date: string;
  yearsOfMembership: number;
  totalContributions: number;
}

const mockTransfers: Transfer[] = [
  { id: "1", memberName: "François Mbassi", sourceBranch: "Douala Chapter", destBranch: "Paris Chapter", status: "requested", reason: "Relocating to Paris for work", requestedBy: "Jean-Pierre Kamga", date: "2026-03-20", yearsOfMembership: 3, totalContributions: 540000 },
  { id: "2", memberName: "Rosalie Edimo", sourceBranch: "Yaoundé Chapter", destBranch: "Douala Chapter", status: "source_approved", reason: "Moving to Douala", requestedBy: "Admin Yaoundé", date: "2026-03-10", yearsOfMembership: 2, totalContributions: 360000 },
  { id: "3", memberName: "Patrick Biyick", sourceBranch: "Douala Chapter", destBranch: "Maryland Chapter", status: "completed", reason: "Emigrating to the US", requestedBy: "Jean-Pierre Kamga", date: "2026-01-15", yearsOfMembership: 4, totalContributions: 720000 },
  { id: "4", memberName: "Yvonne Tchana", sourceBranch: "Bamenda Chapter", destBranch: "Douala Chapter", status: "rejected", reason: "Outstanding dues not cleared", requestedBy: "Admin Bamenda", date: "2025-12-05", yearsOfMembership: 1, totalContributions: 120000 },
];

const statusConfig: Record<TransferStatus, { color: string; icon: typeof CheckCircle2 }> = {
  requested: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: Clock },
  source_approved: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: AlertCircle },
  dest_approved: { color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400", icon: AlertCircle },
  completed: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  rejected: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
};

const branches = ["Douala Chapter", "Yaoundé Chapter", "Paris Chapter", "Maryland Chapter", "Bamenda Chapter"];
const members = ["François Mbassi", "Rosalie Edimo", "Jean-Pierre Kamga", "Sylvie Mbarga", "Emmanuel Tabi"];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "XAF", minimumFractionDigits: 0 }).format(amount);
}

export default function TransfersPage() {
  const t = useTranslations();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/enterprise">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("enterprise.memberTransfer")}</h1>
            <p className="text-sm text-muted-foreground">{t("enterprise.subtitle")}</p>
          </div>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />{t("enterprise.transferMember")}
        </Button>
      </div>

      {/* Transfer List */}
      <div className="space-y-3">
        {mockTransfers.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center justify-center py-12">
            <ArrowRightLeft className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">{t("enterprise.noTransfers")}</h3>
          </CardContent></Card>
        ) : (
          mockTransfers.map((transfer) => {
            const config = statusConfig[transfer.status];
            const StatusIcon = config.icon;
            return (
              <Card key={transfer.id} className="transition-shadow hover:shadow-md cursor-pointer" onClick={() => setSelectedTransfer(transfer)}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm">{transfer.memberName}</h3>
                        <Badge className={config.color}><StatusIcon className="mr-1 h-3 w-3" />{t(`enterprise.transferStatus.${transfer.status}`)}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {transfer.sourceBranch} → {transfer.destBranch} · {transfer.date}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{transfer.reason}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(transfer.status === "requested" || transfer.status === "source_approved") && (
                        <>
                          <Button size="sm" variant="outline" className="text-destructive" onClick={(e) => { e.stopPropagation(); }}>
                            <XCircle className="mr-1 h-3.5 w-3.5" />{t("enterprise.rejectTransfer")}
                          </Button>
                          <Button size="sm" onClick={(e) => { e.stopPropagation(); }}>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />{t("enterprise.approveTransfer")}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Transfer Detail */}
      {selectedTransfer && (
        <Dialog open={!!selectedTransfer} onOpenChange={() => setSelectedTransfer(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("enterprise.memberTransfer")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border p-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Member</span><span className="font-medium">{selectedTransfer.memberName}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("enterprise.sourceBranch")}</span><span className="font-medium">{selectedTransfer.sourceBranch}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("enterprise.destBranch")}</span><span className="font-medium">{selectedTransfer.destBranch}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("enterprise.transferReason")}</span><span className="font-medium">{selectedTransfer.reason}</span></div>
              </div>
              <Card className="bg-muted/50"><CardContent className="pt-4 space-y-1 text-sm">
                <h4 className="font-semibold mb-2">Transfer Summary</h4>
                <div className="flex justify-between"><span className="text-muted-foreground">Years of Membership</span><span className="font-medium">{selectedTransfer.yearsOfMembership}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total Contributions</span><span className="font-medium text-primary">{formatCurrency(selectedTransfer.totalContributions)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Standing at Transfer</span><Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">Good</Badge></div>
              </CardContent></Card>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedTransfer(null)}>{t("common.close")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Transfer Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("enterprise.transferMember")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("contributions.member")}</Label>
              <Select><SelectTrigger><SelectValue placeholder={t("minutes.selectMember")} /></SelectTrigger>
                <SelectContent>{members.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("enterprise.sourceBranch")}</Label>
              <Select><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{branches.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("enterprise.destBranch")}</Label>
              <Select><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{branches.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("enterprise.transferReason")}</Label>
              <Textarea rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => setShowCreateDialog(false)}>{t("enterprise.transferMember")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
