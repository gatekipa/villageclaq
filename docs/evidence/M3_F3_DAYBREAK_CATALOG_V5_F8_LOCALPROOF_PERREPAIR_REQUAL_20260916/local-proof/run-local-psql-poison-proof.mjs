#!/usr/bin/env node
/**
 * Local 17.6 psql bare-envelope poison transport proof.
 * Discovers repo root from import.meta.url. Invokes the actual isolated
 * psql process-result adapter, the supported strict parser, exact envelope
 * validation, and runRepairSafetyThenMaybeRepair. Repair callback is a
 * non-destructive spy. Never prints password. Never hardcodes /workspace.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const THIS_DIR = path.dirname(THIS_FILE);

const REQUIRED_PARSE_EXPORTS = [
  "parseDuplicateKeySafeJson",
  "parseExactOriginalJsonObject",
  "evaluateOriginalProcessResultContract",
  "evaluateExactPsqlStdoutFraming",
  "hashOriginalStdout",
  "preserveOriginalProcessStdout",
];

const NEGATIVE_CASES = Object.freeze([
  "undefined-parser-export",
  "malformed-output",
  "duplicate-keys",
  "extra-field",
  "wrong-database",
  "wrong-live-role",
  "wrong-connection-metadata",
  "nonzero-process",
  "nonempty-stderr",
  "poison-present",
  "cleanup-failure",
  "fingerprint-mismatch",
]);

function discoverRepoRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 16; i += 1) {
    if (
      fs.existsSync(path.join(dir, "scripts/lib/f3-db-push-repair-safety-gate.mjs"))
      && fs.existsSync(path.join(dir, "scripts/lib/f3-db-push-query-parse.mjs"))
      && fs.existsSync(path.join(dir, "package.json"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function loadEnvFile(p) {
  const env = {};
  if (!p || !fs.existsSync(p)) return env;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    env[t.slice(0, i)] = t.slice(i + 1);
  }
  return env;
}

function parseLocalProofArgs(argv = process.argv.slice(2)) {
  const get = (name, alt) => {
    const eq = argv.find((a) => String(a).startsWith(`${name}=`));
    if (eq) return String(eq).slice(name.length + 1);
    const idx = argv.indexOf(name);
    if (idx >= 0 && argv[idx + 1] != null && !String(argv[idx + 1]).startsWith("-")) {
      return argv[idx + 1];
    }
    return alt;
  };
  return {
    outDir: get("--out-dir", null),
    envFile: get("--env-file", process.env.F3_LOCAL_PSQL_ENV_FILE || null),
    caseId: get("--case", "positive"),
    pghost: get("--pghost", null),
    pgport: get("--pgport", null),
    pgdatabase: get("--pgdatabase", null),
    pguser: get("--pguser", null),
    pgsslmode: get("--pgsslmode", null),
  };
}

function redact(obj) {
  const s = JSON.stringify(obj, null, 2);
  return s
    .replace(/("PGPASSWORD"\s*:\s*")[^"]*(")/g, "$1<redacted>$2")
    .replace(/(password["']?\s*[:=]\s*["'])[^"']*(["'])/gi, "$1<redacted>$2");
}

function sha256Buf(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf ?? ""), "utf8");
  return {
    sha256: createHash("sha256").update(b).digest("hex"),
    byteLength: b.byteLength,
    buf: b,
  };
}

function resolveConnection({ args, envFileValues, injected }) {
  if (injected?.connection) return injected.connection;
  const fileEnv = envFileValues || {};
  return {
    host: args.pghost || process.env.PGHOST || fileEnv.PGHOST || fileEnv.POSTGRES_HOST || null,
    port: Number(args.pgport || process.env.PGPORT || fileEnv.PGPORT || fileEnv.POSTGRES_PORT || 0) || null,
    database: args.pgdatabase || process.env.PGDATABASE || fileEnv.PGDATABASE || fileEnv.POSTGRES_DB || null,
    user: args.pguser || process.env.PGUSER || fileEnv.PGUSER || fileEnv.POSTGRES_USER || null,
    password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD
      || fileEnv.PGPASSWORD || fileEnv.POSTGRES_PASSWORD || null,
    sslmode: args.pgsslmode || process.env.PGSSLMODE || fileEnv.PGSSLMODE || "disable",
    credentialSource: args.envFile
      ? `file:${args.envFile}`
      : (process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD)
        ? "env:PGPASSWORD"
        : fileEnv.PGPASSWORD || fileEnv.POSTGRES_PASSWORD
          ? "env-file"
          : null,
  };
}

function runLocalIsolatedPsql({ connection, sql, argv, spawnImpl = spawnSync }) {
  if (!connection?.host || !connection?.database || !connection?.user) {
    return {
      spawned: false,
      status: 1,
      stdout: "",
      stderr: "",
      signal: null,
      timeout: false,
      spawnError: "local connection host/database/user missing",
      transport: "isolated-psql-local",
      argv: null,
    };
  }
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "f3-local-poison-psql-home-"));
  const env = Object.create(null);
  env.PGHOST = String(connection.host);
  env.PGPORT = String(connection.port || 5432);
  env.PGDATABASE = String(connection.database);
  env.PGUSER = String(connection.user);
  if (connection.password) env.PGPASSWORD = String(connection.password);
  env.PGSSLMODE = String(connection.sslmode || "disable");
  env.PGCONNECT_TIMEOUT = "15";
  env.PATH = process.env.PATH || "/usr/bin:/bin";
  env.HOME = home;
  const args = [...argv, "-c", sql];
  if (args.some((a) => a === "-d" || String(a).startsWith("postgres://") || String(a).startsWith("postgresql://"))) {
    try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* ignore */ }
    return {
      spawned: false,
      status: 1,
      stdout: "",
      stderr: "",
      signal: null,
      timeout: false,
      spawnError: "poison psql must not take a URL on argv",
      transport: "isolated-psql-local",
      argv: args,
    };
  }
  try {
    const child = spawnImpl("psql", args, {
      encoding: "buffer",
      env,
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    const stdoutBuf = Buffer.isBuffer(child.stdout)
      ? child.stdout
      : Buffer.from(child.stdout || "");
    const stderrBuf = Buffer.isBuffer(child.stderr)
      ? child.stderr
      : Buffer.from(child.stderr || "");
    return {
      spawned: true,
      status: child.status,
      signal: child.signal ?? null,
      stdout: stdoutBuf.toString("utf8"),
      stderr: stderrBuf.toString("utf8"),
      stdoutBuf,
      stderrBuf,
      timeout: child.error?.code === "ETIMEDOUT" || child.timeout === true,
      spawnError: child.error && child.error.code !== "ETIMEDOUT"
        ? String(child.error.message || child.error)
        : null,
      transport: "isolated-psql",
      argv: args,
      envKeys: Object.keys(env).sort(),
    };
  } finally {
    try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

function applyCaseToProcess(caseId, processResult, envelopeRow) {
  if (caseId === "positive" || caseId === "cleanup-failure" || caseId === "fingerprint-mismatch"
    || caseId === "wrong-connection-metadata" || caseId === "undefined-parser-export") {
    return processResult;
  }
  if (caseId === "malformed-output") {
    return { ...processResult, stdout: "not-json\n", stdoutBuf: Buffer.from("not-json\n") };
  }
  if (caseId === "duplicate-keys") {
    const stdout = '{"schema_version":"f3-poison-envelope-v1","poisonPresent":false,"current_database":"postgres","current_user":"postgres","probe_marker":"f3_poison_absent_probe","poisonPresent":true}\n';
    return { ...processResult, stdout, stdoutBuf: Buffer.from(stdout) };
  }
  if (caseId === "extra-field") {
    const stdout = `${JSON.stringify({ ...envelopeRow, extra: true })}\n`;
    return { ...processResult, stdout, stdoutBuf: Buffer.from(stdout) };
  }
  if (caseId === "wrong-database") {
    const stdout = `${JSON.stringify({ ...envelopeRow, current_database: "template1" })}\n`;
    return { ...processResult, stdout, stdoutBuf: Buffer.from(stdout) };
  }
  if (caseId === "wrong-live-role") {
    const stdout = `${JSON.stringify({ ...envelopeRow, current_user: "ubuntu" })}\n`;
    return { ...processResult, stdout, stdoutBuf: Buffer.from(stdout) };
  }
  if (caseId === "nonzero-process") {
    return { ...processResult, status: 1 };
  }
  if (caseId === "nonempty-stderr") {
    return { ...processResult, stderr: "WARNING: local proof\n", stderrBuf: Buffer.from("WARNING: local proof\n") };
  }
  if (caseId === "poison-present") {
    const stdout = `${JSON.stringify({ ...envelopeRow, poisonPresent: true })}\n`;
    return { ...processResult, stdout, stdoutBuf: Buffer.from(stdout) };
  }
  return processResult;
}

export async function runLocalPsqlPoisonProof(options = {}) {
  const args = options.args || parseLocalProofArgs(options.argv || process.argv.slice(2));
  const repoRoot = options.repoRoot || discoverRepoRoot(THIS_DIR);
  const outDir = path.resolve(args.outDir || options.outDir || path.join(THIS_DIR, "out"));
  fs.mkdirSync(outDir, { recursive: true });

  const failHold = (report) => {
    const payload = {
      verdict: "HOLD",
      must_local_psql_proof_on_17_6: true,
      repairCalls: 0,
      ...report,
    };
    fs.writeFileSync(path.join(outDir, "STATUS.json"), redact(payload));
    fs.writeFileSync(
      path.join(outDir, "STATUS.md"),
      `# Local psql poison proof\n\nVerdict: **HOLD**\n\n${payload.hold_reason || payload.reason || ""}\n`,
    );
    return payload;
  };

  if (!repoRoot) {
    return failHold({
      reason: "HOLD: cannot discover repo root from import.meta.url",
      hold_reason: "repo root missing",
    });
  }

  const gatePath = path.join(repoRoot, "scripts/lib/f3-db-push-repair-safety-gate.mjs");
  const parsePath = path.join(repoRoot, "scripts/lib/f3-db-push-query-parse.mjs");
  const pinsPath = path.join(repoRoot, "scripts/lib/f3-db-push-pins.mjs");
  const injectPath = path.join(repoRoot, "scripts/lib/f3-db-push-history-inject.mjs");
  const versionPath = path.join(repoRoot, "scripts/lib/f3-db-push-version-map.mjs");

  const parse = options.parseModule || await import(pathToFileURL(parsePath).href);
  const gate = options.gateModule || await import(pathToFileURL(gatePath).href);
  const pins = options.pinsModule || await import(pathToFileURL(pinsPath).href);
  const inject = options.injectModule || await import(pathToFileURL(injectPath).href);
  const versions = options.versionModule || await import(pathToFileURL(versionPath).href);

  const missingParse = REQUIRED_PARSE_EXPORTS.filter((name) => typeof parse[name] !== "function");
  if (args.caseId === "undefined-parser-export" || missingParse.length) {
    const decidedHold = {
      repairCalls: 0,
      repairAuthorized: false,
      callbackOrder: [],
    };
    return failHold({
      reason: "HOLD: undefined/missing parser export",
      hold_reason: `missing parser exports: ${(missingParse.length ? missingParse : ["parseDuplicateKeySafeJson"]).join(",")}`,
      missingParse,
      gate: decidedHold,
      repairCalls: 0,
      exact_command: { argv: ["psql", ...(gate.PSQL_POISON_QUERY_ARGV || [])] },
    });
  }

  const envFileValues = args.envFile ? loadEnvFile(path.resolve(args.envFile)) : {};
  const connection = resolveConnection({ args, envFileValues, injected: options });
  const spawnImpl = options.spawnImpl || spawnSync;
  const liveAvailable = options.injectedProcessResult != null
    || typeof options.spawnImpl === "function"
    || Boolean(connection.host && connection.database && connection.user && connection.password);

  const FILE118 = pins.F3_FORWARD_FILES[0];
  const expected = gate.getFrozenExpectedFingerprint(FILE118);
  const catalog = gate.catalogInventoryFromFingerprint(expected);
  const fingerprint = {
    expected,
    observed: gate.buildIndependentObservedFingerprint(FILE118, catalog),
  };
  const descriptors = gate.getFrozenExpectedObjectProbeDescriptors(FILE118);
  const probeRow = {};
  descriptors.forEach((descriptor, i) => {
    probeRow[`p${i}`] = { ...descriptor };
  });
  const gateInput = {
    file: FILE118,
    targetVersion: pins.PREASSIGNED_VERSIONS[FILE118],
    injectInstalled: true,
    injectStatus: 0,
    injectSql: inject.historyInjectSqlForFile(FILE118),
    exitStatus: 3,
    stdout: "",
    stderr: `${pins.HISTORY_INJECT_MARKER}: blocked INSERT for version ${pins.PREASSIGNED_VERSIONS[FILE118]} name ${pins.PREASSIGNED_NAMES[FILE118]}`,
    historyRows: [],
    objectsPresent: true,
    securityPostconditionsOk: true,
    probe: {
      status: 0,
      stdout: JSON.stringify([probeRow]),
      stderr: "",
      file: FILE118,
    },
    fingerprint: args.caseId === "fingerprint-mismatch"
      ? { expected, observed: { ...fingerprint.observed, relations: [] } }
      : fingerprint,
    digest: pins.FROZEN_DIGESTS[FILE118],
    onDiskDigest: pins.FROZEN_DIGESTS[FILE118],
    disposableIdentityVerified: true,
    productionIdentityRejected: true,
    cliVersion: pins.CLI_PIN,
    stagedMigrations: [versions.timestampFilenameFor(FILE118)],
  };

  const approved = gate.constructImmutableValidatedTargetFromConnection({
    source: "local-psql-poison-proof-gate",
  });
  const disposableEnvelope = gate.assembleFinalPoisonExactRow();

  let processResult;
  if (options.injectedProcessResult) {
    processResult = options.injectedProcessResult;
  } else if (liveAvailable) {
    processResult = runLocalIsolatedPsql({
      connection,
      sql: gate.POISON_ABSENT_PROBE_SQL,
      argv: gate.PSQL_POISON_QUERY_ARGV,
      spawnImpl,
    });
  } else {
    return failHold({
      reason: "HOLD: local PostgreSQL 17.6 / psql unavailable; injected spawn required",
      hold_reason: "MUST_LOCAL_PSQL_PROOF_ON_17_6",
      must_local_psql_proof_on_17_6: true,
      exact_command: { argv: ["psql", ...gate.PSQL_POISON_QUERY_ARGV, "-c", "<POISON_ABSENT_PROBE_SQL>"] },
    });
  }

  processResult = applyCaseToProcess(args.caseId, processResult, disposableEnvelope);
  const stdoutBuf = processResult.stdoutBuf
    || Buffer.from(String(processResult.stdout ?? ""), "utf8");
  const stderrBuf = processResult.stderrBuf
    || Buffer.from(String(processResult.stderr ?? ""), "utf8");
  const hashedOutBefore = sha256Buf(stdoutBuf);
  const hashedErrBefore = sha256Buf(stderrBuf);
  fs.writeFileSync(path.join(outDir, "raw-stdout.bin"), stdoutBuf);
  fs.writeFileSync(path.join(outDir, "raw-stderr.bin"), stderrBuf);

  const preserved = parse.preserveOriginalProcessStdout({
    status: processResult.status,
    stdout: stdoutBuf.toString("utf8"),
    stderr: stderrBuf.toString("utf8"),
    signal: processResult.signal ?? null,
    timeout: processResult.timeout === true,
    spawnError: processResult.spawnError || null,
    originalStdout: stdoutBuf.toString("utf8"),
    transport: processResult.transport || "isolated-psql",
    argv: processResult.argv,
  });
  const original = preserved.ok ? preserved.preserved : {
    status: processResult.status,
    stdout: stdoutBuf.toString("utf8"),
    stderr: stderrBuf.toString("utf8"),
    signal: processResult.signal ?? null,
    timeout: processResult.timeout === true,
    spawnError: processResult.spawnError || null,
  };

  const contract = parse.evaluateOriginalProcessResultContract(original);
  const framing = parse.evaluateExactPsqlStdoutFraming(original.stdout);
  const parsed = parse.parseExactOriginalJsonObject(original);
  const dup = parsed.ok
    ? parse.parseDuplicateKeySafeJson(
      stdoutBuf.subarray(framing.payloadStart ?? 0, framing.payloadEnd ?? stdoutBuf.byteLength),
    )
    : parse.parseDuplicateKeySafeJson(original.stdout);
  const envelope = parsed.ok
    ? gate.exactPoisonEnvelopeFromOriginal(parsed.value)
    : { ok: false, reason: parsed.reason || "parse failed before envelope" };

  const localExpectedDb = connection.database || envelope.ok && envelope.row.current_database;
  const localExpectedRole = connection.user || envelope.ok && envelope.row.current_user;
  const live = envelope.ok
    ? {
      current_database: envelope.row.current_database,
      current_user: envelope.row.current_user,
      provenance: "original_query_output",
    }
    : null;
  const localBindOk = live
    && live.current_database === localExpectedDb
    && live.current_user === localExpectedRole;

  const callbackOrder = [];
  const frozenTarget = args.caseId === "wrong-connection-metadata"
    ? { ok: false, reason: "wrong connection metadata", target: null }
    : approved;
  const cleanup = args.caseId === "cleanup-failure"
    ? () => {
      callbackOrder.push("cleanup");
      return { status: 1, stdout: "", stderr: "ERROR: cleanup failed" };
    }
    : () => {
      callbackOrder.push("cleanup");
      return { status: 0, stdout: "", stderr: "", sql: inject.REMOVE_HISTORY_INJECT_SQL };
    };

  const decided = await gate.runRepairSafetyThenMaybeRepair({
    gateInput,
    frozenTarget: frozenTarget.ok ? frozenTarget.target : undefined,
    frozenTargetResult: frozenTarget.ok ? undefined : frozenTarget,
    cleanup,
    verifyPoisonAbsent: () => {
      callbackOrder.push("verify");
      return original;
    },
    repair: () => {
      callbackOrder.push("repair");
      return { status: 0, spy: true, remoteRepair: false };
    },
  });

  const live17_6 = options.livePostgres176 === true;
  const mustLocal = live17_6 !== true;
  const positiveOk = args.caseId === "positive"
    && processResult.status === 0
    && stderrBuf.byteLength === 0
    && framing.ok === true
    && contract.ok === true
    && parsed.ok === true
    && dup.ok === true
    && envelope.ok === true
    && localBindOk === true
    && decided.repairAuthorized === true
    && decided.repairCalls === 1
    && callbackOrder.join(",") === "cleanup,verify,repair";

  const expectedRepairCalls = args.caseId === "positive" ? 1 : 0;
  const continueOk = args.caseId === "positive" ? positiveOk : (
    decided.repairCalls === 0
    && decided.repairAuthorized === false
  );

  const report = {
    verdict: continueOk && args.caseId === "positive" ? "CONTINUE" : (continueOk ? "HOLD" : "HOLD"),
    caseId: args.caseId,
    must_local_psql_proof_on_17_6: mustLocal,
    captured_at_et: new Date().toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" }),
    repo_root: repoRoot,
    out_dir: outDir,
    exact_command: {
      argv: ["psql", ...(processResult.argv || gate.PSQL_POISON_QUERY_ARGV || [])],
      password_on_argv: false,
      env_keys: processResult.envKeys || null,
    },
    process: {
      exit_status: processResult.status,
      signal: processResult.signal ?? null,
      timeout: processResult.timeout === true,
      spawnError: processResult.spawnError || null,
      spawned: processResult.spawned === true,
      transport: processResult.transport || "isolated-psql",
    },
    stderr: {
      byte_length: hashedErrBefore.byteLength,
      sha256: hashedErrBefore.sha256,
      exact_zero_bytes: hashedErrBefore.byteLength === 0,
    },
    stdout: {
      byte_length: hashedOutBefore.byteLength,
      sha256: hashedOutBefore.sha256,
      BEFORE_parse: true,
      last_byte: stdoutBuf.length ? stdoutBuf[stdoutBuf.length - 1] : null,
    },
    parser: {
      contract_ok: contract.ok === true,
      framing_ok: framing.ok === true,
      parse_ok: parsed.ok === true,
      duplicate_key_safe: dup.ok === true,
      envelope_ok: envelope.ok === true,
      parser_verdict: envelope.parser_verdict || parsed.parser_verdict || contract.parser_verdict || null,
    },
    live_bind: {
      ok: localBindOk === true,
      live,
      expected_database: localExpectedDb,
      expected_user: localExpectedRole,
    },
    gate_input: {
      file: gateInput.file,
      digest: gateInput.digest,
      cliVersion: gateInput.cliVersion,
      fingerprint_expected_sha256: gate.expectedFingerprintSha256(FILE118),
    },
    gate_result: {
      repairAuthorized: decided.repairAuthorized === true,
      gateAuthorized: decided.gateAuthorized === true,
      failedGates: decided.gate?.failedGates || [],
      repairCalls: decided.repairCalls,
      cleanupCalls: decided.cleanupCalls,
      verifyCalls: decided.verifyCalls,
    },
    callback_order: callbackOrder,
    repairCalls: decided.repairCalls,
    expectedRepairCalls,
    repair_is_spy: true,
    hold_reason: continueOk && args.caseId === "positive"
      ? null
      : (
        missingParse.length ? "undefined/missing parser export" :
        processResult.status !== 0 && args.caseId !== "nonzero-process" && args.caseId === "positive" ? `psql exit ${processResult.status}` :
        !continueOk && args.caseId !== "positive" ? null :
        !positiveOk ? "positive local proof conditions not met" :
        null
      ),
  };

  if (args.caseId !== "positive") {
    report.verdict = decided.repairCalls === 0 ? "HOLD" : "UNEXPECTED";
    report.hold_reason = report.hold_reason || args.caseId;
  }
  if (args.caseId === "positive" && !live17_6 && !options.injectedProcessResult && typeof options.spawnImpl !== "function") {
    report.verdict = "HOLD";
    report.must_local_psql_proof_on_17_6 = true;
    report.hold_reason = "MUST_LOCAL_PSQL_PROOF_ON_17_6";
  }

  fs.writeFileSync(path.join(outDir, "STATUS.json"), redact(report));
  fs.writeFileSync(path.join(outDir, "STATUS.md"), `# Local psql poison proof\n\nVerdict: **${report.verdict}**\n\n` +
    `- case: ${report.caseId}\n` +
    `- exit: ${report.process.exit_status}\n` +
    `- stderr bytes: ${report.stderr.byte_length}\n` +
    `- stdout sha256: ${report.stdout.sha256} len=${report.stdout.byte_length}\n` +
    `- envelope ok: ${report.parser.envelope_ok}\n` +
    `- local bind ok: ${report.live_bind.ok}\n` +
    `- gate authorized: ${report.gate_result.repairAuthorized}\n` +
    `- callback order: ${report.callback_order.join(" → ")}\n` +
    `- repairCalls: ${report.repairCalls}\n` +
    (report.hold_reason ? `\nHOLD reason: ${report.hold_reason}\n` : "\n"));

  return report;
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === THIS_FILE;

if (invokedDirectly) {
  const report = await runLocalPsqlPoisonProof();
  console.log(JSON.stringify({
    verdict: report.verdict,
    caseId: report.caseId,
    exit: report.process?.exit_status ?? null,
    stderr_bytes: report.stderr?.byte_length ?? null,
    stdout_sha256: report.stdout?.sha256 ?? null,
    repairCalls: report.repairCalls,
    must_local_psql_proof_on_17_6: report.must_local_psql_proof_on_17_6,
    hold_reason: report.hold_reason || null,
  }, null, 2));
  process.exit(report.verdict === "CONTINUE" ? 0 : 1);
}
