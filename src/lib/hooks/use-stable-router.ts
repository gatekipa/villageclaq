"use client";

import { useRef, useMemo } from "react";
import { useRouter } from "@/i18n/routing";

/**
 * Returns a router object with stable method references.
 *
 * **Why this exists:**
 * `useRouter()` from next-intl (and Next.js) may return a new object reference
 * on every render. Including `router` in a `useEffect` or `useCallback`
 * dependency array causes the hook to re-fire every render.
 *
 * This hook wraps the router methods in stable refs so the returned object
 * is safe to include in dependency arrays (though usually you shouldn't need to).
 *
 * **Usage:**
 * ```ts
 * const router = useStableRouter();
 * // Safe in useEffect deps (but prefer calling router.push directly in handlers)
 * useEffect(() => {
 *   if (condition) router.replace("/somewhere");
 * }, [condition, router]);
 * ```
 *
 * **Preferred pattern:** Use `routerRef` for useEffect, use the raw router for
 * click handlers (which don't need stable references).
 */
export function useStableRouter() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  // Return a stable object whose methods always delegate to the latest router
  const stable = useMemo(
    () => ({
      push: (...args: Parameters<typeof router.push>) => routerRef.current.push(...args),
      replace: (...args: Parameters<typeof router.replace>) => routerRef.current.replace(...args),
      back: () => routerRef.current.back(),
      forward: () => routerRef.current.forward(),
      refresh: () => routerRef.current.refresh(),
      prefetch: (...args: Parameters<typeof router.prefetch>) => routerRef.current.prefetch(...args),
    }),
    [] // stable forever — methods delegate through ref
  );

  return stable;
}
