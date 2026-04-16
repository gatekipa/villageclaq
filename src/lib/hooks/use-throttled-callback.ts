"use client";

import { useRef, useCallback } from "react";

/**
 * Wraps a callback with a cooldown period. If called again within the cooldown,
 * the call is silently dropped.
 *
 * **Why this exists:**
 * Infinite fetch loops are the #1 production bug pattern in this codebase.
 * Wrapping data-fetching callbacks with a throttle provides a safety net:
 * even if a dependency array bug causes repeated calls, the actual network
 * requests are limited to once per `intervalMs`.
 *
 * @param fn      The function to throttle
 * @param intervalMs  Minimum milliseconds between calls (default: 5000)
 *
 * **Usage:**
 * ```ts
 * const throttledFetch = useThrottledCallback(fetchData, 5000);
 * useEffect(() => { throttledFetch(); }, [throttledFetch]);
 * ```
 */
export function useThrottledCallback<T extends (...args: unknown[]) => unknown>(
  fn: T,
  intervalMs = 5000
): T {
  const lastCallTime = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const throttled = useCallback(
    (...args: unknown[]) => {
      const now = Date.now();
      if (now - lastCallTime.current < intervalMs) {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            `[useThrottledCallback] Call throttled — last call was ${now - lastCallTime.current}ms ago (limit: ${intervalMs}ms)`
          );
        }
        return;
      }
      lastCallTime.current = now;
      return fnRef.current(...args);
    },
    [intervalMs]
  ) as unknown as T;

  return throttled;
}
