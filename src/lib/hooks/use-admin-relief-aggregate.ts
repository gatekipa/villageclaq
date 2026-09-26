"use client";

import { useEffect, useState } from "react";

export interface ReliefAggregate {
  plan_id: string;
  plan_name: string;
  group_name: string;
  currency: string;
  contribution_amount: number;
  is_active: boolean;
  active_enrollments: number;
  claims_all: number;
  claims_since: number;
  claim_amount_since: number;
  payouts_all: number;
  payouts_since: number;
  payouts_by_month: Array<{ month: string; amount: number }>;
}

export type ReliefRange = "1m" | "3m" | "6m" | "1y" | "all";

export function useAdminReliefAggregate(range: ReliefRange) {
  const [plans, setPlans] = useState<ReliefAggregate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/admin/relief-aggregate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ range }),
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Relief aggregate HTTP ${response.status}`);
      return response.json();
    }).then((body) => {
      if (active) { setPlans(body.plans ?? []); setError(null); }
    }).catch((cause) => {
      if (active) setError((cause as Error).message);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range]);
  return { plans, loading, error };
}
