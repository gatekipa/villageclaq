"use client";

import { useSearchParams } from "next/navigation";
import { useRef, useMemo } from "react";

/**
 * Returns a stable object containing search param values.
 *
 * **Why this exists:**
 * `useSearchParams()` from Next.js returns a new `URLSearchParams` object on
 * every render. Including it in a `useCallback` or `useEffect` dependency array
 * causes the hook to fire on every render → infinite loops.
 *
 * This hook serializes the params into a plain string and only returns a new
 * object reference when the actual URL query string changes.
 *
 * **Usage:**
 * ```ts
 * const { get, toString } = useStableSearchParams();
 * const groupId = get("group");  // stable between renders if URL hasn't changed
 * ```
 */
export function useStableSearchParams() {
  const searchParams = useSearchParams();

  // Serialize to string — this is a primitive, so it's safe in deps.
  const serialized = searchParams.toString();

  // Only create a new wrapper when the serialized string actually changes.
  const stable = useMemo(() => {
    const params = new URLSearchParams(serialized);
    return {
      get: (key: string) => params.get(key),
      getAll: (key: string) => params.getAll(key),
      has: (key: string) => params.has(key),
      toString: () => serialized,
      /** Raw string — safe to use in dependency arrays */
      key: serialized,
    };
  }, [serialized]);

  return stable;
}

/**
 * Returns a single search param value as a stable string.
 * Safe to use directly in dependency arrays.
 */
export function useSearchParam(name: string): string | null {
  const searchParams = useSearchParams();
  const value = searchParams.get(name);
  // useRef to keep the same reference if value hasn't changed
  const ref = useRef(value);
  if (ref.current !== value) {
    ref.current = value;
  }
  return ref.current;
}
