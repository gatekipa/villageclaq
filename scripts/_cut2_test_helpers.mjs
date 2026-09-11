import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("..", import.meta.url));

export function pgUrl() {
  return process.env.CUT2_DISPOSABLE_DATABASE_URL || "postgresql://postgres@localhost:5432/s0p0b_cut2_disposable";
}

export function psql(sql, extra = []) {
  const args = process.env.CUT2_DISPOSABLE_DATABASE_URL
    ? ["psql", ["-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A", "-d", process.env.CUT2_DISPOSABLE_DATABASE_URL, "-c", sql, ...extra]]
    : ["sudo", ["-u", "postgres", "psql", "-d", "s0p0b_cut2_disposable", "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A", "-c", sql, ...extra]];
  const res = spawnSync(args[0], args[1], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "" },
  });
  if (res.status !== 0) {
    throw new Error((res.stderr || res.stdout || "psql failed").trim());
  }
  return (res.stdout || "").trim();
}

export function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

export const PRODUCERS = [
  "src/lib/payment-receipt-producer.ts",
  "src/lib/payment-reminder-producer.ts",
  "src/lib/welcome-producer.ts",
  "src/lib/standing-change-producer.ts",
  "src/lib/relief-enrollment-producer.ts",
  "src/lib/relief-claim-decision-producer.ts",
  "src/lib/remittance-decision-producer.ts",
  "src/lib/hosting-assignment-producer.ts",
  "src/lib/hosting-reminder-producer.ts",
  "src/lib/event-reminder-producer.ts",
  "src/lib/loan-approved-producer.ts",
  "src/lib/loan-overdue-producer.ts",
  "src/lib/fine-issued-producer.ts",
  "src/lib/member-invitation-producer.ts",
  "src/lib/subscription-expiring-producer.ts",
];
