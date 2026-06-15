"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { formatAmount } from "@/lib/currencies";

function formatCompact(amount: number) {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
  return amount.toString();
}

export interface MonthlyTrendDatum {
  month: string;
  amount: number;
}

/**
 * WS4 (B11): the recharts monthly-collection bar chart, extracted from the
 * finances route so it can be lazy-loaded via next/dynamic. This keeps recharts
 * (~74KB gzip) off the finances first-paint critical path on low-bandwidth
 * links / low-end phones. Purely presentational — it receives the already-
 * computed monthly trend and renders it; no data fetching, no money logic.
 */
export default function MonthlyTrendChart({
  data,
  currency,
  collectedLabel,
}: {
  data: MonthlyTrendDatum[];
  currency: string;
  collectedLabel: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
        <YAxis
          className="text-xs"
          tick={{ fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(v) => formatCompact(Number(v))}
        />
        <Tooltip
          formatter={(value) => [formatAmount(Number(value), currency), collectedLabel]}
          contentStyle={{
            backgroundColor: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            color: "hsl(var(--popover-foreground))",
          }}
        />
        <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={index === data.length - 1 ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.3)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
