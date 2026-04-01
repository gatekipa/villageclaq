"use client";

import { type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useGroup } from "@/lib/group-context";
import { DashboardSkeleton } from "@/components/ui/page-skeleton";
import { Shield } from "lucide-react";

/**
 * Hides children if the user lacks the required permission.
 * Owner/admin always see children.
 * Use for wrapping action buttons, forms, etc.
 */
export function PermissionGate({
  permission,
  anyOf,
  children,
  fallback,
}: {
  /** Single permission key to check */
  permission?: string;
  /** Pass multiple — user needs ANY one of them */
  anyOf?: string[];
  children: ReactNode;
  /** Optional fallback when permission denied (default: nothing) */
  fallback?: ReactNode;
}) {
  const { hasPermission, hasAnyPermission, isLoading } = usePermissions();

  if (isLoading) return null;

  const allowed = permission
    ? hasPermission(permission)
    : anyOf
    ? hasAnyPermission(...anyOf)
    : true;

  if (!allowed) return fallback ? <>{fallback}</> : null;
  return <>{children}</>;
}

/**
 * Full-page access denied message.
 * Use when an entire page requires a permission.
 */
export function AccessDenied() {
  const t = useTranslations("roles");
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Shield className="h-12 w-12 text-muted-foreground/50 mb-4" />
      <h2 className="text-lg font-semibold">{t("accessDenied")}</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-md">
        {t("accessDeniedDesc")}
      </p>
    </div>
  );
}

/**
 * Wraps an entire page. Shows skeleton while loading permissions,
 * access denied if permission missing, children if allowed.
 * Owner/admin always pass.
 */
export function RequirePermission({
  permission,
  anyOf,
  children,
}: {
  permission?: string;
  anyOf?: string[];
  children: ReactNode;
}) {
  const { hasPermission, hasAnyPermission, isLoading } = usePermissions();
  const { loading: groupLoading } = useGroup();

  // Bug #286: Wait for group context to load before checking permissions
  // Without this, isAdmin is false during loading → shows Access Denied flash
  if (isLoading || groupLoading) return <DashboardSkeleton />;

  const allowed = permission
    ? hasPermission(permission)
    : anyOf
    ? hasAnyPermission(...anyOf)
    : true;

  if (!allowed) return <AccessDenied />;
  return <>{children}</>;
}
