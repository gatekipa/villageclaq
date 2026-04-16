"use client";

import { useEffect, useRef } from "react";
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

  // Stable ref for router — useRouter() may return a new object on every render.
  // Including router directly in useEffect deps would re-trigger the effect.
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (!loading && currentMembership && !isAdmin) {
      routerRef.current.replace("/dashboard");
    }
  }, [loading, currentMembership, isAdmin]);

  return { isAdmin, loading, blocked: !loading && !!currentMembership && !isAdmin };
}
