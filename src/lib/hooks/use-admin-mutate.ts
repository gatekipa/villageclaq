"use client";

import { useCallback, useState } from "react";

interface MutateOptions {
  action?: string;
  table: string;
  data?: Record<string, unknown>;
  match?: Record<string, unknown>;
  type: "insert" | "update" | "upsert" | "delete";
}

interface UseAdminMutateReturn {
  mutate: (options: MutateOptions) => Promise<{ data: unknown; error: string | null }>;
  loading: boolean;
}

/**
 * Hook for admin pages to perform mutations via the admin API route.
 * Uses service role key on the server side — bypasses ALL RLS.
 */
export function useAdminMutate(): UseAdminMutateReturn {
  const [loading, setLoading] = useState(false);

  const mutate = useCallback(async (options: MutateOptions) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });

      const body = await res.json();

      if (!res.ok) {
        return { data: null, error: body.error || body.message || `HTTP ${res.status}` };
      }

      return { data: body.data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutate, loading };
}
