/**
 * CLI 2.117.0 command builders for the db push qualification candidate.
 *
 * Flags are taken from `supabase --help` / `db push --help` /
 * `migration repair --help` / `migration list --help` / `db query --help`
 * on 2.117.0. Do not invent flags. Never `-p` / `--password`.
 *
 * Candidate apply command:
 *   supabase db push --db-url <in-process URL> --workdir <isolated> --yes --skip-vault
 *
 * Repair (founder-controlled, never automatic):
 *   supabase migration repair <FILENAME_VERSION> --status applied --db-url <URL> --workdir <isolated> --yes
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CLI_PIN,
  MANAGEMENT_API_APPLY_PERMANENTLY_DISQUALIFIED,
} from "./f3-db-push-pins.mjs";
import {
  assertArgvSafe,
  assertConstructedDbUrl,
  assertDbPushGates,
  buildDisposableDbUrlFromEnv,
  sanitizeForLog,
  spawnDbPushChildSync,
  spawnDbPushHelpSync,
} from "./f3-db-push-target-guard.mjs";
import { isFourteenDigitVersion, refuseClockOrGuessedVersion } from "./f3-db-push-version-map.mjs";

export const PINNED_CLI_VERSION = CLI_PIN;

function candidateBins() {
  const extra = [];
  const homeBin = path.join(os.homedir(), ".local", "bin", "supabase");
  if (fs.existsSync(homeBin)) extra.push(homeBin);
  extra.push("supabase");
  return extra;
}

export function resolveSupabaseBin() {
  for (const bin of candidateBins()) {
    const res = spawnDbPushHelpSync(bin, ["--version"]);
    const text = `${res.stdout || ""}${res.stderr || ""}`.trim();
    if (res.status === 0 && text) {
      return { bin, available: true, status: res.status, text };
    }
  }
  return { bin: null, available: false, status: 1, text: "" };
}

export function discoverSupabaseCli() {
  const found = resolveSupabaseBin();
  const versionMatch = /(\d+\.\d+\.\d+)/.exec(found.text);
  return {
    available: found.available,
    bin: found.bin,
    status: found.status,
    text: found.text,
    version: versionMatch ? versionMatch[1] : null,
    pinned: CLI_PIN,
    matchesPin: versionMatch ? versionMatch[1] === CLI_PIN : false,
  };
}

export function readCliHelp(bin, args) {
  const res = spawnDbPushHelpSync(bin, args);
  const text = `${res.stdout || ""}\n${res.stderr || ""}`;
  return { status: res.status, text };
}

export function readDbPushHelp(bin) {
  const help = readCliHelp(bin, ["db", "push", "--help"]);
  return {
    ...help,
    hasDbUrl: /--db-url/.test(help.text),
    hasYes: /--yes/.test(help.text),
    hasWorkdir: /--workdir/.test(help.text),
    hasSkipVault: /--skip-vault/.test(help.text),
    hasPassword: /--password|-p /.test(help.text),
    hasLinked: /--linked/.test(help.text),
    hasDryRun: /--dry-run/.test(help.text),
  };
}

export function readMigrationRepairHelp(bin) {
  const help = readCliHelp(bin, ["migration", "repair", "--help"]);
  return {
    ...help,
    hasStatus: /--status/.test(help.text),
    hasApplied: /applied/.test(help.text),
    hasDbUrl: /--db-url/.test(help.text),
    hasYes: /--yes/.test(help.text),
    hasWorkdir: /--workdir/.test(help.text),
    hasPassword: /--password|-p /.test(help.text),
  };
}

export function readMigrationListHelp(bin) {
  const help = readCliHelp(bin, ["migration", "list", "--help"]);
  return {
    ...help,
    hasDbUrl: /--db-url/.test(help.text),
    hasWorkdir: /--workdir/.test(help.text),
  };
}

export function readDbQueryHelp(bin) {
  const help = readCliHelp(bin, ["db", "query", "--help"]);
  return {
    ...help,
    hasDbUrl: /--db-url/.test(help.text),
    hasFile: /--file/.test(help.text),
    hasWorkdir: /--workdir/.test(help.text),
  };
}

export function assertDbPushHelpUsable(help) {
  if (!help || help.status !== 0 || !help.hasDbUrl || !help.hasYes || !help.hasWorkdir || !help.hasSkipVault) {
    throw new Error("HOLD: supabase db push --help did not show --db-url, --yes, --workdir, and --skip-vault");
  }
  return help;
}

export function assertRepairHelpUsable(help) {
  if (!help || help.status !== 0 || !help.hasStatus || !help.hasApplied || !help.hasDbUrl) {
    throw new Error("HOLD: supabase migration repair --help did not show --status applied and --db-url");
  }
  return help;
}

function requireWorkdir(workdir) {
  if (!workdir) throw new Error("isolated --workdir is required");
  if (!fs.existsSync(path.join(workdir, "supabase"))) {
    throw new Error("isolated workdir is missing supabase/");
  }
  return workdir;
}

/**
 * Exact candidate command from CLI 2.117.0 help. Not a substitute runner.
 */
export function buildDbPushCommand({ dbUrl, workdir, help }) {
  assertDbPushHelpUsable(help);
  const safeUrl = assertConstructedDbUrl(dbUrl);
  const wd = requireWorkdir(workdir);
  const args = ["db", "push", "--db-url", safeUrl, "--workdir", wd, "--yes", "--skip-vault"];
  assertArgvSafe(args);
  return { command: "supabase", args, rendered: "supabase db push --db-url [REDACTED] --workdir [ISOLATED] --yes --skip-vault" };
}

export function buildRepairCommand({ version, dbUrl, workdir, help }) {
  assertRepairHelpUsable(help);
  refuseClockOrGuessedVersion(version);
  if (!isFourteenDigitVersion(version)) {
    throw new Error("REFUSE: repair version must be the preassigned filename version");
  }
  const safeUrl = assertConstructedDbUrl(dbUrl);
  const wd = requireWorkdir(workdir);
  const args = ["migration", "repair", version, "--status", "applied", "--db-url", safeUrl, "--workdir", wd];
  if (help.hasYes) args.push("--yes");
  assertArgvSafe(args);
  return {
    command: "supabase",
    args,
    rendered: `supabase migration repair ${version} --status applied --db-url [REDACTED] --workdir [ISOLATED] --yes`,
  };
}

export function buildMigrationListCommand({ dbUrl, workdir, help }) {
  if (!help || help.status !== 0 || !help.hasDbUrl) {
    throw new Error("HOLD: supabase migration list --help did not show --db-url");
  }
  const safeUrl = assertConstructedDbUrl(dbUrl);
  const args = ["migration", "list", "--db-url", safeUrl];
  if (help.hasWorkdir && workdir) args.push("--workdir", requireWorkdir(workdir));
  assertArgvSafe(args);
  return { command: "supabase", args, rendered: "supabase migration list --db-url [REDACTED] --workdir [ISOLATED]" };
}

export function buildDbQueryCommand({ dbUrl, workdir, help, sql, fileAbsPath }) {
  if (!help || help.status !== 0 || !help.hasDbUrl) {
    throw new Error("HOLD: supabase db query --help did not show --db-url");
  }
  const safeUrl = assertConstructedDbUrl(dbUrl);
  const args = ["db", "query", "--db-url", safeUrl];
  if (help.hasWorkdir && workdir) args.push("--workdir", requireWorkdir(workdir));
  if (fileAbsPath) {
    if (!help.hasFile) throw new Error("HOLD: db query --help did not show --file");
    args.push("--file", fileAbsPath);
  } else if (sql != null) {
    args.push(String(sql));
  } else {
    throw new Error("db query requires sql or fileAbsPath");
  }
  assertArgvSafe(args);
  return { command: "supabase", args, rendered: "supabase db query --db-url [REDACTED] --workdir [ISOLATED]" };
}

function runSpec(bin, spec) {
  assertDbPushGates({ optIn: true });
  if (!MANAGEMENT_API_APPLY_PERMANENTLY_DISQUALIFIED) {
    throw new Error("REFUSE: Management API apply must remain permanently disqualified");
  }
  const res = spawnDbPushChildSync(bin, spec.args);
  return {
    command: spec.rendered,
    status: res.status,
    stdout: sanitizeForLog(res.stdout || ""),
    stderr: sanitizeForLog(res.stderr || ""),
    signal: res.signal || null,
  };
}

export function runDbPushCandidate({ bin, workdir, help }) {
  const dbUrl = buildDisposableDbUrlFromEnv();
  const spec = buildDbPushCommand({ dbUrl, workdir, help });
  return runSpec(bin, spec);
}

export function runFilenameVersionRepair({ bin, version, workdir, help }) {
  const dbUrl = buildDisposableDbUrlFromEnv();
  const spec = buildRepairCommand({ version, dbUrl, workdir, help });
  return runSpec(bin, spec);
}

export function runMigrationList({ bin, workdir, help }) {
  const dbUrl = buildDisposableDbUrlFromEnv();
  const spec = buildMigrationListCommand({ dbUrl, workdir, help });
  return runSpec(bin, spec);
}

export function runDbQuery({ bin, workdir, help, sql, fileAbsPath }) {
  const dbUrl = buildDisposableDbUrlFromEnv();
  const spec = buildDbQueryCommand({ dbUrl, workdir, help, sql, fileAbsPath });
  return runSpec(bin, spec);
}

export function writeIsolatedSqlFile(workdir, basename, sql) {
  const abs = path.join(workdir, basename);
  if (!abs.startsWith(workdir)) throw new Error("REFUSE: SQL file escaped isolated workdir");
  fs.writeFileSync(abs, sql);
  return abs;
}
