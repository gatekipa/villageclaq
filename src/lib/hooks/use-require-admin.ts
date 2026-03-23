"use client";

import { useEffect } from "react";
import { useGroup } from "@/lib/group-context";
import { useRouter } from "@/i18n/routing";

/**
 * Hook that checks if the current user is an admin (owner or admin role).
 * If not, redirects to /dashboard.
 * Returns { isAdmin, loading } so the page can show a skeleton while checking.
 */
export function useRequireAdmin() {
  const { isAdmin, loading, currentMembership } = useGroup();
  const router = useRouter();

  useEffect(() => {
    if (!loading && currentMembership && !isAdmin) {
      router.replace("/dashboard");
    }
  }, [loading, currentMembership, isAdmin, router]);

  return { isAdmin, loading, blocked: !loading && !!currentMembership && !isAdmin };
}
