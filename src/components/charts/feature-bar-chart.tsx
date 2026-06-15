"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface FeatureDatum {
  name: string;
  count: number;
}

/**
 * WS4 (B11): the recharts horizontal feature-usage bar chart on the platform-admin
 * analytics route, extracted so it can be lazy-loaded via next/dynamic — keeps
 * recharts off the analytics first-paint bundle. Purely presentational.
 */
export default function FeatureBarChart({
  data,
  height = 300,
}: {
  data: FeatureDatum[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
        <Tooltip />
        <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
