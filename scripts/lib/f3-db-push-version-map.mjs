/**
 * Isolated workdir mapping for the db push qualification candidate.
 *
 * Copies 00118–00123 into timestamp-named files. Never renames or
 * rewrites repository source migrations. Copies must be byte-identical
 * to the frozen digests. Versions are known before execution.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  F3_FORWARD_FILES,
  FROZEN_DIGESTS,
  PREASSIGNED_NAMES,
  PREASSIGNED_VERSIONS,
  PRODUCTION_HISTORY_CEILING_VERSION,
  PRODUCTION_REF,
} from "./f3-db-push-pins.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

export function sha256Text(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function sha256Buffer(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function isFourteenDigitVersion(value) {
  return /^\d{14}$/.test(String(value || ""));
}

export function historyNameFromSourceFile(file) {
  const name = PREASSIGNED_NAMES[file];
  if (!name) throw new Error(`no preassigned history name for ${file}`);
  return name;
}

export function preassignedVersionFor(file) {
  const version = PREASSIGNED_VERSIONS[file];
  if (!isFourteenDigitVersion(version)) {
    throw new Error(`preassigned version for ${file} is not YYYYMMDDHHMMSS`);
  }
  return version;
}

export function timestampFilenameFor(file) {
  return `${preassignedVersionFor(file)}_${historyNameFromSourceFile(file)}.sql`;
}

export function sourceFileForVersion(version) {
  for (const file of F3_FORWARD_FILES) {
    if (PREASSIGNED_VERSIONS[file] === version) return file;
  }
  return null;
}

export function refuseClockOrGuessedVersion(version, { nowMs, sourceLabel } = {}) {
  if (nowMs != null) {
    throw new Error("REFUSE: apply-time clock is forbidden as a repaired version");
  }
  if (sourceLabel && /^0011[89]$|^0012[0-3]$/.test(String(sourceLabel))) {
    throw new Error("REFUSE: source label is not the filename version");
  }
  if (!isFourteenDigitVersion(version)) {
    throw new Error("REFUSE: version is not a preassigned YYYYMMDDHHMMSS filename version");
  }
  const known = new Set(Object.values(PREASSIGNED_VERSIONS));
  if (!known.has(String(version))) {
    throw new Error("REFUSE: version is not in the preassigned 00118–00123 map");
  }
}

export function listRepoMigrationFilenames() {
  const dir = path.join(root, "supabase/migrations");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
}

export function listRepoTimestampFilenames(filenames = listRepoMigrationFilenames()) {
  return filenames.filter((f) => /^\d{14}_/.test(f));
}

export function assertFrozenDigestsOnDisk() {
  const dir = path.join(root, "supabase/migrations");
  const observed = {};
  for (const [file, digest] of Object.entries(FROZEN_DIGESTS)) {
    const abs = path.join(dir, file);
    const bytes = fs.readFileSync(abs);
    const actual = sha256Buffer(bytes);
    if (actual !== digest) {
      throw new Error(`FROZEN DIGEST DRIFT ${file}: ${actual} !== ${digest}`);
    }
    observed[file] = actual;
  }
  return observed;
}

/**
 * Collision check vs production ceiling, disposable history, and repo names.
 * Reconfirms the pre-assigned PASS: all six versions > 20260912174049,
 * disposable history empty, no timestamp filenames in supabase/migrations.
 */
export function assertVersionCollisionPass({
  disposableHistoryVersions = [],
  repoMigrationFilenames = listRepoMigrationFilenames(),
} = {}) {
  const assigned = F3_FORWARD_FILES.map((file) => ({
    file,
    version: preassignedVersionFor(file),
    timestampFilename: timestampFilenameFor(file),
  }));
  const repoTimestampFilenames = listRepoTimestampFilenames(repoMigrationFilenames);
  const disposable = (disposableHistoryVersions || []).map(String);

  for (const row of assigned) {
    if (row.version <= PRODUCTION_HISTORY_CEILING_VERSION) {
      throw new Error(
        `VERSION COLLISION: ${row.file} version ${row.version} is not after production ceiling ${PRODUCTION_HISTORY_CEILING_VERSION}`,
      );
    }
    if (disposable.includes(row.version)) {
      throw new Error(`VERSION COLLISION: ${row.version} already present on disposable history`);
    }
    if (repoTimestampFilenames.includes(row.timestampFilename)) {
      throw new Error(`VERSION COLLISION: ${row.timestampFilename} already exists in repo migrations`);
    }
    if (String(row.version).includes(PRODUCTION_REF) || row.file.includes(PRODUCTION_REF)) {
      throw new Error("VERSION COLLISION: production ref leaked into version map");
    }
  }
  if (repoTimestampFilenames.length > 0) {
    throw new Error(
      `VERSION COLLISION: supabase/migrations contains timestamp filenames: ${repoTimestampFilenames.join(",")}`,
    );
  }
  return Object.freeze({
    pass: true,
    productionCeiling: PRODUCTION_HISTORY_CEILING_VERSION,
    disposableHistoryVersions: disposable,
    repoTimestampFilenames,
    assigned,
  });
}

export function readAuthorizedSourceBytes(file) {
  if (!F3_FORWARD_FILES.includes(file)) {
    throw new Error(`REFUSE: ${file} is not an authorized F3 forward file`);
  }
  const abs = path.join(root, "supabase/migrations", file);
  const bytes = fs.readFileSync(abs);
  const digest = sha256Buffer(bytes);
  if (digest !== FROZEN_DIGESTS[file]) {
    throw new Error(`FROZEN DIGEST DRIFT ${file}`);
  }
  return { abs, bytes, text: bytes.toString("utf8"), digest, byteLength: bytes.byteLength };
}

/**
 * Isolated workdir copies ONLY. Never writes into repo supabase/migrations.
 */
export function createIsolatedDbPushWorkdir({
  files = [...F3_FORWARD_FILES],
  collision = assertVersionCollisionPass(),
} = {}) {
  assertFrozenDigestsOnDisk();
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-dbpush-wd-"));
  if (workdir.includes(PRODUCTION_REF)) {
    throw new Error("REFUSE: isolated workdir path contains production ref");
  }
  const migDir = path.join(workdir, "supabase", "migrations");
  fs.mkdirSync(migDir, { recursive: true });
  fs.writeFileSync(
    path.join(workdir, "supabase", "config.toml"),
    [
      "# Isolated db push qualification workdir. Not production.",
      'project_id = "villageclaq-f3-dbpush-disposable"',
      "",
    ].join("\n"),
  );

  const copies = [];
  for (const file of files) {
    const source = readAuthorizedSourceBytes(file);
    const destName = timestampFilenameFor(file);
    const destAbs = path.join(migDir, destName);
    fs.writeFileSync(destAbs, source.bytes);
    const after = fs.readFileSync(destAbs);
    const afterDigest = sha256Buffer(after);
    if (afterDigest !== source.digest || after.byteLength !== source.byteLength) {
      throw new Error(`REFUSE: isolated copy of ${file} is not byte-identical`);
    }
    copies.push({
      sourceFile: file,
      sourceAbs: source.abs,
      destName,
      destAbs,
      version: preassignedVersionFor(file),
      name: historyNameFromSourceFile(file),
      byteLength: source.byteLength,
      sha256Before: source.digest,
      sha256After: afterDigest,
    });
  }

  const repoAfter = assertFrozenDigestsOnDisk();
  return {
    workdir,
    collision,
    copies,
    repoDigestsUnchanged: repoAfter,
  };
}

export function isolatedMigrationsDir(workdir) {
  return path.join(workdir, "supabase", "migrations");
}

export function listIsolatedMigrationFilenames(workdir) {
  const dir = isolatedMigrationsDir(workdir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
}

/**
 * Stage only the current target file in the isolated supabase/migrations
 * workdir so a successful repair+retry cannot cascade-apply later F3 files
 * in one `db push`. Bytes stay the founder-authorized freeze.
 */
export function stageIsolatedWorkdirTarget(workdir, file) {
  if (!workdir) throw new Error("HOLD: isolated workdir required for per-file staging");
  if (!F3_FORWARD_FILES.includes(file)) {
    throw new Error(`REFUSE: ${file} is not an authorized F3 forward file`);
  }
  const migDir = isolatedMigrationsDir(workdir);
  fs.mkdirSync(migDir, { recursive: true });
  for (const name of fs.readdirSync(migDir)) {
    if (name.endsWith(".sql")) fs.unlinkSync(path.join(migDir, name));
  }
  const source = readAuthorizedSourceBytes(file);
  const destName = timestampFilenameFor(file);
  const destAbs = path.join(migDir, destName);
  fs.writeFileSync(destAbs, source.bytes);
  const after = fs.readFileSync(destAbs);
  const afterDigest = sha256Buffer(after);
  if (afterDigest !== source.digest || after.byteLength !== source.byteLength) {
    throw new Error(`REFUSE: staged copy of ${file} is not byte-identical`);
  }
  const remaining = listIsolatedMigrationFilenames(workdir);
  if (remaining.length !== 1 || remaining[0] !== destName) {
    throw new Error(
      `HOLD: isolated workdir must contain only ${destName}; observed ${remaining.join(",")}`,
    );
  }
  return {
    sourceFile: file,
    destName,
    destAbs,
    version: preassignedVersionFor(file),
    sha256: afterDigest,
    staged: remaining,
  };
}

export function nextAuthorizedFile(currentFile) {
  const idx = F3_FORWARD_FILES.indexOf(currentFile);
  if (idx < 0) return F3_FORWARD_FILES[0];
  return F3_FORWARD_FILES[idx + 1] || null;
}
