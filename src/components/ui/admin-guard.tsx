"use client";

import { type ReactNode } from "react";
import { useRequireAdmin } from "@/lib/hooks/use-require-admin";
import { DashboardSkeleton } from "@/components/ui/page-skeleton";

/**
 * Wraps admin-only page content. Shows skeleton while loading,
 * redirects non-admins to /dashboard, renders children for admins.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const { isAdmin, loading, blocked } = useRequireAdmin();

  if (loading) return <DashboardSkeleton />;
  if (blocked || !isAdmin) return null; // redirect is happening

  return <>{children}</>;
}
