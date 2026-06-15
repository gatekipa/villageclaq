"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export interface GrowthLineConfig {
  dataKey: string;
  stroke: string;
  name?: string;
}

/**
 * WS4 (B11): the recharts growth line chart used on the platform-admin overview,
 * extracted so it can be lazy-loaded via next/dynamic — keeps recharts off the
 * admin overview first-paint bundle on slow links. Purely presentational.
 */
export default function GrowthLineChart({
  data,
  lines,
  height = 250,
  showLegend = false,
}: {
  data: Array<Record<string, unknown>>;
  lines: GrowthLineConfig[];
  height?: number;
  showLegend?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        {showLegend && <Legend />}
        {lines.map((l) => (
          <Line
            key={l.dataKey}
            type="monotone"
            dataKey={l.dataKey}
            name={l.name}
            stroke={l.stroke}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
