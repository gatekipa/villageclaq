"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
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
  Loader2,
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
import { createClient } from "@/lib/supabase/client";

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
  action: string;
  target: string;
  timestamp: string;
}

const actionIcons: Record<string, typeof Shield> = {
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

const actionColors: Record<string, string> = {
  created_group: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  suspended_user: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  changed_plan: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  impersonated_user: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  added_staff: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  removed_staff: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  resolved_enquiry: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  created_voucher: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  exported_report: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  updated_content: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

const actionKeys: Record<string, string> = {
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

export default function AuditPage() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");

  useEffect(() => {
    async function fetchLogs() {
      const supabase = createClient();
      const { data } = await supabase
        .from("platform_audit_logs")
        .select("id, action, target_type, target_id, details, created_at, staff_id, platform_staff(user_id, profiles(full_name))")
        .order("created_at", { ascending: false })
        .limit(100);

      if (data) {
        setEntries(data.map((row: Record<string, unknown>) => {
          const staff = row.platform_staff as Record<string, unknown> | null;
          const profiles = staff?.profiles as Record<string, unknown> | null;
          const details = row.details as Record<string, unknown> | null;
          return {
            id: row.id as string,
            staffName: (profiles?.full_name as string) || "Staff",
            action: row.action as string,
            target: (details?.target_description as string) || `${row.target_type || ""} ${row.target_id || ""}`.trim(),
            timestamp: new Date(row.created_at as string).toLocaleString(getDateLocale(locale)),
          };
        }));
      }
      setLoading(false);
    }
    fetchLogs();
  }, []);

  const staffNames = useMemo(() => [...new Set(entries.map((e) => e.staffName))], [entries]);
  const actionTypes = useMemo(() => [...new Set(entries.map((e) => e.action))], [entries]);

  const filtered = entries.filter((entry) => {
    if (staffFilter !== "all" && entry.staffName !== staffFilter) return false;
    if (actionFilter !== "all" && entry.action !== actionFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("audit")}</h1>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="space-y-1 flex-1">
          <Label className="text-xs">{t("auditStaff")}</Label>
          <Select value={staffFilter} onValueChange={(val) => setStaffFilter(val ?? "all")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {staffNames.map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 flex-1">
          <Label className="text-xs">{t("auditAction")}</Label>
          <Select value={actionFilter} onValueChange={(val) => setActionFilter(val ?? "all")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {actionTypes.map((action) => (
                <SelectItem key={action} value={action}>
                  {actionKeys[action] ? t(actionKeys[action]) : action}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card>
            <CardContent className="flex items-center justify-center p-8 text-muted-foreground">
              {t("noAuditLogs")}
            </CardContent>
          </Card>
        )}

        {filtered.map((entry) => {
          const ActionIcon = actionIcons[entry.action] || Shield;
          return (
            <Card key={entry.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${actionColors[entry.action] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"}`}>
                  <ActionIcon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <span className="text-sm font-medium">{entry.staffName}</span>
                    <Badge variant="outline" className="w-fit text-xs">
                      {actionKeys[entry.action] ? t(actionKeys[entry.action]) : entry.action}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{entry.target}</p>
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
