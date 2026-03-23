"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Shield,
  UserX,
  CreditCard,
  Eye,
  UserPlus,
  UserMinus,
  CheckCircle,
  Ticket,
  FileDown,
  Pencil,
  Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

type AuditAction =
  | "created_group"
  | "suspended_user"
  | "changed_plan"
  | "impersonated_user"
  | "added_staff"
  | "removed_staff"
  | "resolved_enquiry"
  | "created_voucher"
  | "exported_report"
  | "updated_content";

interface AuditEntry {
  id: string;
  staffName: string;
  action: AuditAction;
  target: string;
  timestamp: string;
}

const actionIcons: Record<AuditAction, typeof Shield> = {
  created_group: Shield,
  suspended_user: UserX,
  changed_plan: CreditCard,
  impersonated_user: Eye,
  added_staff: UserPlus,
  removed_staff: UserMinus,
  resolved_enquiry: CheckCircle,
  created_voucher: Ticket,
  exported_report: FileDown,
  updated_content: Pencil,
};

const actionColors: Record<AuditAction, string> = {
  created_group: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  suspended_user: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  changed_plan: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  impersonated_user: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  added_staff: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  removed_staff: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  resolved_enquiry: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  created_voucher: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  exported_report: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  updated_content: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
};

const actionKeys: Record<AuditAction, string> = {
  created_group: "actionCreatedGroup",
  suspended_user: "actionSuspendedUser",
  changed_plan: "actionChangedPlan",
  impersonated_user: "actionImpersonatedUser",
  added_staff: "actionAddedStaff",
  removed_staff: "actionRemovedStaff",
  resolved_enquiry: "actionResolvedEnquiry",
  created_voucher: "actionCreatedVoucher",
  exported_report: "actionExportedReport",
  updated_content: "actionUpdatedContent",
};

const mockAuditEntries: AuditEntry[] = [
  { id: "1", staffName: "Jude Anyere", action: "created_group", target: "Maroua Women United", timestamp: "2026-03-23 15:42" },
  { id: "2", staffName: "Marie Nguemo", action: "suspended_user", target: "john.doe@email.com", timestamp: "2026-03-23 14:18" },
  { id: "3", staffName: "Jude Anyere", action: "changed_plan", target: "Bamenda Alumni Union → Pro", timestamp: "2026-03-23 11:05" },
  { id: "4", staffName: "Samuel Fon", action: "impersonated_user", target: "grace.tabi@gmail.com", timestamp: "2026-03-22 17:30" },
  { id: "5", staffName: "Jude Anyere", action: "added_staff", target: "emmanuel.nkeng@villageclaq.com (Finance)", timestamp: "2026-03-22 10:15" },
  { id: "6", staffName: "Marie Nguemo", action: "removed_staff", target: "former.staff@villageclaq.com", timestamp: "2026-03-21 16:40" },
  { id: "7", staffName: "Samuel Fon", action: "resolved_enquiry", target: "Ticket #1042 - Payment not reflecting", timestamp: "2026-03-21 14:22" },
  { id: "8", staffName: "Grace Tabi", action: "created_voucher", target: "WELCOME2026 (20% off, 100 uses)", timestamp: "2026-03-20 09:55" },
  { id: "9", staffName: "Emmanuel Nkeng", action: "exported_report", target: "Revenue Report Q1 2026", timestamp: "2026-03-19 17:00" },
  { id: "10", staffName: "Marie Nguemo", action: "updated_content", target: "Homepage testimonials section", timestamp: "2026-03-19 11:30" },
];

const staffNames = [...new Set(mockAuditEntries.map((e) => e.staffName))];
const actionTypes = [...new Set(mockAuditEntries.map((e) => e.action))];

export default function AuditPage() {
  const t = useTranslations("admin");
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");

  const filtered = mockAuditEntries.filter((entry) => {
    if (staffFilter !== "all" && entry.staffName !== staffFilter) return false;
    if (actionFilter !== "all" && entry.action !== actionFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("audit")}</h1>
        <p className="text-sm text-muted-foreground">{t("auditSubtitle")}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="space-y-1 flex-1">
          <Label className="text-xs">{t("filterByStaff")}</Label>
          <Select value={staffFilter} onValueChange={(val) => setStaffFilter(val ?? "all")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allStaff")}</SelectItem>
              {staffNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 flex-1">
          <Label className="text-xs">{t("filterByAction")}</Label>
          <Select value={actionFilter} onValueChange={(val) => setActionFilter(val ?? "all")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allActions")}</SelectItem>
              {actionTypes.map((action) => (
                <SelectItem key={action} value={action}>
                  {t(actionKeys[action])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 flex-1">
          <Label className="text-xs">{t("dateRange")}</Label>
          <Input type="date" />
        </div>
      </div>

      {/* Audit Entries */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card>
            <CardContent className="flex items-center justify-center p-8 text-muted-foreground">
              {t("noAuditLogs")}
            </CardContent>
          </Card>
        )}

        {filtered.map((entry) => {
          const ActionIcon = actionIcons[entry.action];
          return (
            <Card key={entry.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${actionColors[entry.action]}`}>
                  <ActionIcon className="h-4 w-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <span className="text-sm font-medium">{entry.staffName}</span>
                    <Badge variant="outline" className="w-fit text-xs">
                      {t(actionKeys[entry.action])}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {entry.target}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 pl-12 sm:pl-0">
                  <Clock className="h-3 w-3" />
                  {entry.timestamp}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
