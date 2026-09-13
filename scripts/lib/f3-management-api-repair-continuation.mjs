/**
 * Disposable-only founder repair + VillageClaq continuation after a
 * recoverable Management API post-COMMIT history failure.
 *
 * Discovers CLI version and `supabase migration repair --help` at runtime.
 * Does not guess flags. Repairs ONLY the recovered server-generated version.
 * Does NOT claim Management API custom skip unless a live re-POST is observed.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPROVED_DISPOSABLE_PROJECT_REF,
  HOLD_VERSION_UNRECOVERABLE,
  PRODUCTION_REF,
  applyRemoteManagementApiMigrationFromFile,
  assertRemoteManagementApiGates,
  listRemoteManagementApiMigrations,
  sanitizeForLog,
  sha256Text,
} from "./f3-management-api-remote-harness.mjs";
import { F3_FORWARD_FILES, FROZEN_DIGESTS } from "./f3-management-api-disposable-floor.mjs";
import { isFourteenDigitVersion } from "./f3-management-api-history-inject.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

export const DISPOSABLE_DB_URL_ENV = "F3_DISPOSABLE_DB_URL";

export function discoverSupabaseCli() {
  const res = spawnSync("supabase", ["--version"], { encoding: "utf8" });
  return {
    available: res.status === 0,
    status: res.status,
    text: `${res.stdout || ""}${res.stderr || ""}`.trim(),
  };
}

export function readMigrationRepairHelp() {
  const res = spawnSync("supabase", ["migration", "repair", "--help"], { encoding: "utf8" });
  const text = `${res.stdout || ""}\n${res.stderr || ""}`;
  return {
    status: res.status,
    text,
    hasStatus: /--status/.test(text),
    hasApplied: /applied/.test(text),
    hasDbUrl: /--db-url/.test(text),
    hasYes: /--yes/.test(text),
    hasWorkdir: /--workdir/.test(text),
  };
}

export function assertRepairHelpUsable(help) {
  if (!help || help.status !== 0 || !help.hasStatus || !help.hasApplied || !help.hasDbUrl) {
    throw new Error("HOLD: supabase migration repair --help did not show --status applied and --db-url");
  }
  return help;
}

/** Live probe: history failed before version persistence → repair is forbidden. */
export function refuseRepairWhenUnrecoverable(recovery) {
  if (!recovery || recovery.ok !== true || recovery.repairForbidden === true) {
    const err = new Error(HOLD_VERSION_UNRECOVERABLE);
    err.code = "F3_REMOTE_REPAIR_FORBIDDEN";
    err.details = { repair: "FORBIDDEN", hold: HOLD_VERSION_UNRECOVERABLE };
    throw err;
  }
  return recovery;
}

export function createAuthorizedRepairLookup({ version, name, sqlBytes, digest }) {
  if (!isFourteenDigitVersion(version)) {
    throw new Error(`${HOLD_VERSION_UNRECOVERABLE}: repair lookup refuses non-authoritative version`);
  }
  if (!name) throw new Error("repair lookup requires recovered name");
  const actual = sha256Text(sqlBytes);
  if (digest && actual !== digest) {
    throw new Error(`REFUSE: lookup SQL digest ${actual} !== authorized ${digest}`);
  }
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-mapi-repair-wd-"));
  const migDir = path.join(workdir, "supabase", "migrations");
  fs.mkdirSync(migDir, { recursive: true });
  fs.writeFileSync(
    path.join(workdir, "supabase", "config.toml"),
    `project_id = "f3-mapi-disposable-repair"\n`,
  );
  const lookup = path.join(migDir, `${version}_${name}.sql`);
  fs.writeFileSync(lookup, sqlBytes);
  return { workdir, lookup, digest: actual };
}

export function assertDisposableRepairDbUrl(dbUrl) {
  const url = String(dbUrl || "");
  if (!url) {
    const err = new Error("REPAIR_AWAITING_DISPOSABLE_DB_URL");
    err.code = "F3_REMOTE_REPAIR_DB_URL_MISSING";
    throw err;
  }
  if (url.includes(PRODUCTION_REF)) {
    throw new Error("REFUSE: repair db-url must never target production");
  }
  if (/supabase\.(co|com)/i.test(url) && !url.includes(APPROVED_DISPOSABLE_PROJECT_REF)) {
    throw new Error("REFUSE: hosted repair db-url must target approved disposable ref only");
  }
  return url;
}

/**
 * Build the repair command from discovered --help. Do not invent flags.
 */
export function buildRepairCommand({ version, dbUrl, workdir, help }) {
  assertRepairHelpUsable(help);
  if (!isFourteenDigitVersion(version)) {
    throw new Error(`${HOLD_VERSION_UNRECOVERABLE}: will not repair a non-authoritative version`);
  }
  const safeUrl = assertDisposableRepairDbUrl(dbUrl);
  const args = ["migration", "repair", version, "--status", "applied", "--db-url", safeUrl];
  if (help.hasWorkdir && workdir) args.push("--workdir", workdir);
  if (help.hasYes) args.push("--yes");
  return { command: "supabase", args, rendered: ["supabase", ...args].join(" ") };
}

export function runDiscoveredRepair({ version, dbUrl, workdir, help, recovery }) {
  if (recovery !== undefined) refuseRepairWhenUnrecoverable(recovery);
  const spec = buildRepairCommand({ version, dbUrl, workdir, help });
  const res = spawnSync(spec.command, spec.args, { encoding: "utf8" });
  return {
    command: sanitizeForLog(spec.rendered),
    status: res.status,
    stdout: sanitizeForLog(res.stdout || ""),
    stderr: sanitizeForLog(res.stderr || ""),
  };
}

export function readAuthorizedSqlBytes(file) {
  const abs = path.join(root, "supabase/migrations", file);
  const sqlBytes = fs.readFileSync(abs, "utf8");
  const digest = sha256Text(sqlBytes);
  if (FROZEN_DIGESTS[file] && digest !== FROZEN_DIGESTS[file]) {
    throw new Error(`FROZEN DIGEST DRIFT ${file}`);
  }
  return { abs, sqlBytes, digest };
}

/**
 * Continue VillageClaq orchestration: apply the next authorized file via
 * Management API file-stream. Observe whether the API advances, retries,
 * or errors. Do not claim custom skip unless the live response shows it.
 */
export async function continueVillageClaqManagementApiOrchestration({
  nextFile,
  projectRef = APPROVED_DISPOSABLE_PROJECT_REF,
  listBefore,
} = {}) {
  assertRemoteManagementApiGates({ projectRef, optIn: true });
  if (!F3_FORWARD_FILES.includes(nextFile) && nextFile !== "probe") {
    throw new Error(`continuation file ${nextFile} is not an authorized F3 forward file`);
  }
  const { abs } = readAuthorizedSqlBytes(nextFile);
  const apply = await applyRemoteManagementApiMigrationFromFile({
    fileAbsPath: abs,
    projectRef,
    optIn: true,
    beforeHistory: listBefore || null,
  });
  const after = await listRemoteManagementApiMigrations({
    projectRef,
    optIn: true,
    skipIdentity: true,
  });
  apply.capture.afterHistory = after.rows;
  return {
    nextFile,
    apply,
    afterHistory: after.rows,
    advanced: apply.ok === true,
    retriedSameFile: false,
    observedCustomSkip: false,
    note:
      "VillageClaq orchestration advanced one authorized file via Management API file-stream. Custom API skip is NOT claimed unless a dedicated re-POST observation says so.",
  };
}

export function nextAuthorizedFile(currentFile) {
  const idx = F3_FORWARD_FILES.indexOf(currentFile);
  if (idx < 0) return F3_FORWARD_FILES[0];
  return F3_FORWARD_FILES[idx + 1] || null;
}

export function repairPreparedButNotRun({ version, name, lookup, help }) {
  return {
    status: "REPAIR_AWAITING_DISPOSABLE_DB_URL",
    version,
    name,
    lookup,
    helpExcerpt: help ? sanitizeForLog(help.text).slice(0, 2000) : null,
    instruction:
      "Set F3_DISPOSABLE_DB_URL to the disposable project connection string (never production), then re-run. Repair uses only the recovered YYYYMMDDHHMMSS version as --status applied.",
  };
}
