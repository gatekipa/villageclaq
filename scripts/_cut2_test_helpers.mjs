import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("..", import.meta.url));

const DEFAULT_DB = "s0p0b_cut2_disposable";
const DEFAULT_URL = "postgresql://postgres@localhost:5432/s0p0b_cut2_disposable";

let cachedPsql = null;

export function pgUrl() {
  return process.env.CUT2_DISPOSABLE_DATABASE_URL || DEFAULT_URL;
}

function lookLikeWindows() {
  return process.platform === "win32";
}

function tryPsql(bin, argsPrefix) {
  const res = spawnSync(bin, [...argsPrefix, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A", "-c", "select 1"], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "" },
  });
  if (res.status === 0 && String(res.stdout || "").trim() === "1") {
    return { bin, argsPrefix };
  }
  return null;
}

function disposablePrerequisiteError(detail) {
  const win = lookLikeWindows();
  const example = win
    ? `$env:CUT2_DISPOSABLE_DATABASE_URL="postgresql://postgres@localhost:5432/s0p0b_cut2_disposable"`
    : `export CUT2_DISPOSABLE_DATABASE_URL=postgresql://postgres@localhost:5432/s0p0b_cut2_disposable`;
  return new Error(
    [
      "CUT2 disposable PostgreSQL is required and was not found.",
      detail || "No supported local psql target answered select 1.",
      "",
      "Set CUT2_DISPOSABLE_DATABASE_URL to a LOCAL disposable database, then re-run.",
      `Exact command: ${example}`,
      "Then apply supabase/migrations/00115_s0_p0b_cut2_notification_queue.sql to that database.",
      "",
      "Do not point this at production (llbnliixczcqfftxpsmb).",
      "This harness never assumes sudo -u postgres and never silently skips.",
    ].join("\n"),
  );
}

export function resolveDisposablePsql() {
  if (cachedPsql) return cachedPsql;

  const url = process.env.CUT2_DISPOSABLE_DATABASE_URL;
  if (url) {
    if (/llbnliixczcqfftxpsmb/i.test(url)) {
      throw disposablePrerequisiteError("CUT2_DISPOSABLE_DATABASE_URL must not target production.");
    }
    const hit = tryPsql("psql", ["-d", url]);
    if (!hit) {
      throw disposablePrerequisiteError(`CUT2_DISPOSABLE_DATABASE_URL is set but psql cannot connect: ${url}`);
    }
    cachedPsql = hit;
    return cachedPsql;
  }

  const probes = [
    ["psql", ["-d", DEFAULT_URL]],
    ["psql", ["-d", DEFAULT_DB]],
    ["psql", ["-h", process.env.PGHOST || "localhost", "-p", process.env.PGPORT || "5432", "-U", process.env.PGUSER || "postgres", "-d", DEFAULT_DB]],
  ];

  for (const [bin, argsPrefix] of probes) {
    const hit = tryPsql(bin, argsPrefix);
    if (hit) {
      cachedPsql = hit;
      return cachedPsql;
    }
  }

  // Optional detected path only: passwordless `sudo -n` as postgres.
  // Never assumed; never used on Windows; never used if sudo needs a password.
  if (!lookLikeWindows()) {
    const sudoHit = tryPsql("sudo", ["-n", "-u", "postgres", "psql", "-d", DEFAULT_DB]);
    if (sudoHit) {
      cachedPsql = sudoHit;
      return cachedPsql;
    }
  }

  throw disposablePrerequisiteError(null);
}

export function psql(sql, extra = []) {
  const inv = resolveDisposablePsql();
  const res = spawnSync(inv.bin, [...inv.argsPrefix, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A", "-c", sql, ...extra], {
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
