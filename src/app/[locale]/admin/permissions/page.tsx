"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useAdminQuery } from "@/lib/hooks/use-admin-query";
import { useAdminMutate } from "@/lib/hooks/use-admin-mutate";
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
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

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
const EDITABLE_ROLES: StaffRole[] = ["admin", "support", "sales", "finance"];

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

// All permission keys from sections
const ALL_PERM_KEYS = SECTIONS.flatMap((s) => s.permissions.map((p) => p.key));

/** Convert DB rows (permission_key → roles_allowed[]) into flat boolean map */
function dbToFlatMap(
  rows: Array<{ permission_key: string; roles_allowed: string[] }>
): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const role of EDITABLE_ROLES) {
    for (const pk of ALL_PERM_KEYS) {
      map[`${role}_${pk}`] = false;
    }
  }
  for (const row of rows) {
    for (const role of EDITABLE_ROLES) {
      map[`${role}_${row.permission_key}`] = row.roles_allowed.includes(role);
    }
  }
  return map;
}

/** Convert flat boolean map back to DB rows */
function flatMapToDbRows(
  map: Record<string, boolean>
): Array<{ permission_key: string; roles_allowed: string[] }> {
  const rows: Array<{ permission_key: string; roles_allowed: string[] }> = [];
  for (const pk of ALL_PERM_KEYS) {
    const allowed: string[] = [];
    for (const role of EDITABLE_ROLES) {
      if (map[`${role}_${pk}`]) allowed.push(role);
    }
    rows.push({ permission_key: pk, roles_allowed: allowed });
  }
  return rows;
}

export default function PermissionsPage() {
  const t = useTranslations("admin");
  const { mutate, loading: mutateLoading } = useAdminMutate();

  const { results, loading: queryLoading, refetch } = useAdminQuery([
    {
      key: "permissions",
      table: "platform_permissions",
      select: "permission_key, roles_allowed, description",
    },
  ]);

  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState<string | null>(null);

  // Load DB permissions into local state once
  useEffect(() => {
    if (!queryLoading && !initialized) {
      const rows = (results.permissions?.data ?? []) as Array<{
        permission_key: string;
        roles_allowed: string[];
      }>;
      if (rows.length > 0) {
        setPermissions(dbToFlatMap(rows));
      }
      setInitialized(true);
    }
  }, [queryLoading, results, initialized]);

  const togglePermission = useCallback((role: StaffRole, permKey: string) => {
    const key = `${role}_${permKey}`;
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setShowError(null);

    try {
      const dbRows = flatMapToDbRows(permissions);

      // Upsert all permission rows atomically
      const { error } = await mutate({
        action: "update_permissions_matrix",
        table: "platform_permissions",
        type: "upsert",
        data: dbRows as unknown as Record<string, unknown>,
      });

      if (error) {
        setShowError(error);
      } else {
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
        refetch();
      }
    } finally {
      setSaving(false);
    }
  }, [permissions, mutate, refetch]);

  const handleReset = useCallback(() => {
    const rows = (results.permissions?.data ?? []) as Array<{
      permission_key: string;
      roles_allowed: string[];
    }>;
    if (rows.length > 0) {
      setPermissions(dbToFlatMap(rows));
    }
  }, [results]);

  const loading = queryLoading || !initialized;

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

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
          <Button onClick={handleSave} disabled={saving || mutateLoading} className="gap-2">
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

      {/* Error Banner */}
      {showError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {showError}
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
