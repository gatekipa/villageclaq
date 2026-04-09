"use client";

import { useState, useEffect, useCallback } from "react";

interface QuerySpec {
  key: string;
  table: string;
  select: string;
  filters?: Array<{ column: string; op: string; value: unknown }>;
  order?: { column: string; ascending?: boolean };
  limit?: number;
  count?: "exact" | "planned";
}

interface QueryResult<T = unknown> {
  data: T[];
  error: string | null;
  count?: number;
}

interface UseAdminQueryReturn {
  results: Record<string, QueryResult>;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook for admin pages to fetch data via the admin API route.
 * Uses service role key on the server side — bypasses ALL RLS.
 *
 * Usage:
 * ```ts
 * const { results, loading } = useAdminQuery([
 *   { key: "groups", table: "groups", select: "id, name, is_active, created_at", order: { column: "created_at", ascending: false } },
 *   { key: "members", table: "memberships", select: "group_id" },
 * ]);
 * const groups = results.groups?.data ?? [];
 * ```
 */
export function useAdminQuery(queries: QuerySpec[]): UseAdminQueryReturn {
  const [results, setResults] = useState<Record<string, QueryResult>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);

  // Stable serialization of queries for dependency tracking
  const queriesKey = JSON.stringify(queries);

  const refetch = useCallback(() => setTrigger((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/admin/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queries: JSON.parse(queriesKey) }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            body.error || body.message || `HTTP ${res.status}`
          );
        }

        const body = await res.json();
        if (!cancelled) {
          setResults(body.results ?? {});
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[useAdminQuery]", err);
          setError((err as Error).message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [queriesKey, trigger]);

  return { results, loading, error, refetch };
}

/**
 * Single-query convenience wrapper.
 */
export function useAdminTable<T = Record<string, unknown>>(
  table: string,
  select: string,
  options?: {
    filters?: QuerySpec["filters"];
    order?: QuerySpec["order"];
    limit?: number;
    count?: QuerySpec["count"];
  }
): { data: T[]; loading: boolean; error: string | null; count?: number; refetch: () => void } {
  const queries: QuerySpec[] = [
    {
      key: "result",
      table,
      select,
      ...options,
    },
  ];

  const { results, loading, error, refetch } = useAdminQuery(queries);
  const result = results.result;

  return {
    data: (result?.data as T[]) ?? [],
    loading,
    error: error || result?.error || null,
    count: result?.count,
    refetch,
  };
}
