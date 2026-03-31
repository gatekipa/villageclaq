"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Shield,
  ShieldCheck,
  Headphones,
  TrendingUp,
  Wallet,
  CheckCircle2,
  Info,
  Save,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

type StaffRole = "super_admin" | "admin" | "support" | "sales" | "finance";

interface PermissionDef {
  key: string;
  labelKey: string;
}

interface PermissionSection {
  titleKey: string;
  permissions: PermissionDef[];
}

const ROLES: StaffRole[] = ["super_admin", "admin", "support", "sales", "finance"];

const roleColors: Record<StaffRole, string> = {
  super_admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  admin: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  support: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  sales: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  finance: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

const roleIcons: Record<StaffRole, typeof Shield> = {
  super_admin: ShieldCheck,
  admin: Shield,
  support: Headphones,
  sales: TrendingUp,
  finance: Wallet,
};

const SECTIONS: PermissionSection[] = [
  {
    titleKey: "sectionPlatformOverview",
    permissions: [
      { key: "view_dashboard", labelKey: "permViewDashboard" },
      { key: "view_analytics", labelKey: "permViewAnalytics" },
      { key: "view_usage_stats", labelKey: "permViewUsageStats" },
    ],
  },
  {
    titleKey: "sectionUsersAndGroups",
    permissions: [
      { key: "view_groups", labelKey: "permViewGroups" },
      { key: "manage_groups", labelKey: "permManageGroups" },
      { key: "view_users", labelKey: "permViewUsers" },
      { key: "manage_users", labelKey: "permManageUsers" },
      { key: "export_data", labelKey: "permExportData" },
    ],
  },
  {
    titleKey: "sectionFinancialControls",
    permissions: [
      { key: "view_transactions", labelKey: "permViewTransactions" },
      { key: "export_transactions", labelKey: "permExportTransactions" },
      { key: "manage_subscriptions", labelKey: "permManageSubscriptions" },
      { key: "manage_vouchers", labelKey: "permManageVouchers" },
      { key: "flag_anomalies", labelKey: "permFlagAnomalies" },
    ],
  },
  {
    titleKey: "sectionReports",
    permissions: [
      { key: "view_reports", labelKey: "permViewReports" },
      { key: "export_reports", labelKey: "permExportReports" },
    ],
  },
  {
    titleKey: "sectionSystemConfiguration",
    permissions: [
      { key: "edit_settings", labelKey: "permEditSettings" },
      { key: "manage_notifications", labelKey: "permManageNotifications" },
      { key: "view_security", labelKey: "permViewSecurity" },
    ],
  },
  {
    titleKey: "sectionContentManagement",
    permissions: [
      { key: "manage_testimonials", labelKey: "permManageTestimonials" },
      { key: "manage_faqs", labelKey: "permManageFaqs" },
      { key: "manage_enquiries", labelKey: "permManageEnquiries" },
    ],
  },
  {
    titleKey: "sectionAccessControl",
    permissions: [
      { key: "manage_staff", labelKey: "permManageStaff" },
      { key: "edit_permissions", labelKey: "permEditPermissions" },
      { key: "view_audit_log", labelKey: "permViewAuditLog" },
    ],
  },
];

const DEFAULT_PERMISSIONS: Record<string, boolean> = {
  // Admin — most ON except edit_permissions and manage_staff
  admin_view_dashboard: true,
  admin_view_analytics: true,
  admin_view_usage_stats: true,
  admin_view_groups: true,
  admin_manage_groups: true,
  admin_view_users: true,
  admin_manage_users: true,
  admin_export_data: true,
  admin_view_transactions: true,
  admin_export_transactions: true,
  admin_manage_subscriptions: true,
  admin_manage_vouchers: true,
  admin_flag_anomalies: true,
  admin_view_reports: true,
  admin_export_reports: true,
  admin_edit_settings: true,
  admin_manage_notifications: true,
  admin_view_security: true,
  admin_manage_testimonials: true,
  admin_manage_faqs: true,
  admin_manage_enquiries: true,
  admin_manage_staff: false,
  admin_edit_permissions: false,
  admin_view_audit_log: true,

  // Support — View-only + Manage Enquiries
  support_view_dashboard: true,
  support_view_analytics: true,
  support_view_usage_stats: true,
  support_view_groups: true,
  support_manage_groups: false,
  support_view_users: true,
  support_manage_users: false,
  support_export_data: false,
  support_view_transactions: true,
  support_export_transactions: false,
  support_manage_subscriptions: false,
  support_manage_vouchers: false,
  support_flag_anomalies: false,
  support_view_reports: true,
  support_export_reports: false,
  support_edit_settings: false,
  support_manage_notifications: false,
  support_view_security: false,
  support_manage_testimonials: false,
  support_manage_faqs: false,
  support_manage_enquiries: true,
  support_manage_staff: false,
  support_edit_permissions: false,
  support_view_audit_log: false,

  // Sales — View + Manage Subscriptions + Manage Vouchers
  sales_view_dashboard: true,
  sales_view_analytics: true,
  sales_view_usage_stats: true,
  sales_view_groups: true,
  sales_manage_groups: false,
  sales_view_users: true,
  sales_manage_users: false,
  sales_export_data: false,
  sales_view_transactions: true,
  sales_export_transactions: false,
  sales_manage_subscriptions: true,
  sales_manage_vouchers: true,
  sales_flag_anomalies: false,
  sales_view_reports: true,
  sales_export_reports: false,
  sales_edit_settings: false,
  sales_manage_notifications: false,
  sales_view_security: false,
  sales_manage_testimonials: false,
  sales_manage_faqs: false,
  sales_manage_enquiries: false,
  sales_manage_staff: false,
  sales_edit_permissions: false,
  sales_view_audit_log: false,

  // Finance — Financial Controls + View/Export Reports
  finance_view_dashboard: true,
  finance_view_analytics: true,
  finance_view_usage_stats: true,
  finance_view_groups: true,
  finance_manage_groups: false,
  finance_view_users: true,
  finance_manage_users: false,
  finance_export_data: true,
  finance_view_transactions: true,
  finance_export_transactions: true,
  finance_manage_subscriptions: false,
  finance_manage_vouchers: false,
  finance_flag_anomalies: true,
  finance_view_reports: true,
  finance_export_reports: true,
  finance_edit_settings: false,
  finance_manage_notifications: false,
  finance_view_security: false,
  finance_manage_testimonials: false,
  finance_manage_faqs: false,
  finance_manage_enquiries: false,
  finance_manage_staff: false,
  finance_edit_permissions: false,
  finance_view_audit_log: true,
};

export default function PermissionsPage() {
  const t = useTranslations("admin");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({ ...DEFAULT_PERMISSIONS });
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const togglePermission = useCallback((role: StaffRole, permKey: string) => {
    const key = `${role}_${permKey}`;
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleSave = useCallback(() => {
    setSaving(true);
    // Simulate save — no DB table exists
    setTimeout(() => {
      setSaving(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }, 500);
  }, []);

  const handleReset = useCallback(() => {
    setPermissions({ ...DEFAULT_PERMISSIONS });
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("rolePermissionsTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("rolePermissionsDesc")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            {t("resetToDefault")}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("saveChanges")}
          </Button>
        </div>
      </div>

      {/* Success Banner */}
      {showSuccess && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
          {t("permissionsSaved")}
        </div>
      )}

      {/* Info Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-900/20">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
        <div>
          <p className="text-sm text-blue-700 dark:text-blue-300">{t("permissionSystem")}</p>
          <p className="mt-1 text-xs text-blue-600/70 dark:text-blue-400/70">{t("permissionsPersistNote")}</p>
        </div>
      </div>

      {/* Permissions Matrix */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              {/* Column Headers */}
              <thead>
                <tr className="border-b border-border">
                  <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left text-sm font-medium text-muted-foreground min-w-[200px]">
                    &nbsp;
                  </th>
                  {ROLES.map((role) => {
                    const RoleIcon = roleIcons[role];
                    return (
                      <th key={role} className="px-3 py-3 text-center min-w-[110px]">
                        <Badge className={`gap-1.5 ${roleColors[role]}`}>
                          <RoleIcon className="h-3 w-3" />
                          {t(`roles.${role}`)}
                        </Badge>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map((section) => (
                  <>
                    {/* Section Header */}
                    <tr key={`section-${section.titleKey}`} className="bg-muted/50">
                      <td
                        colSpan={ROLES.length + 1}
                        className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        {t(section.titleKey)}
                      </td>
                    </tr>
                    {/* Permission Rows */}
                    {section.permissions.map((perm) => (
                      <tr
                        key={perm.key}
                        className="border-b border-border/50 transition-colors hover:bg-muted/30"
                      >
                        <td className="sticky left-0 z-10 bg-card px-4 py-2.5 text-sm">
                          {t(perm.labelKey)}
                        </td>
                        {ROLES.map((role) => {
                          if (role === "super_admin") {
                            return (
                              <td key={role} className="px-3 py-2.5 text-center">
                                <div className="flex justify-center">
                                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                                </div>
                              </td>
                            );
                          }
                          const permKey = `${role}_${perm.key}`;
                          return (
                            <td key={role} className="px-3 py-2.5 text-center">
                              <div className="flex justify-center">
                                <Switch
                                  checked={permissions[permKey] ?? false}
                                  onCheckedChange={() => togglePermission(role, perm.key)}
                                />
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
