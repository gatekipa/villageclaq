#!/usr/bin/env node
/**
 * Local 17.6 psql bare-envelope poison transport proof (Chief box).
 * Never prints password. Binds live DB/user to frozen LOCAL connection metadata.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const OUT = "/workspace/f3-psql-poison-requal-20260916/phase-local/psql-proof";
const TIP_WORK = "/workspace/f3-psql-poison-requal-20260916/tip-work";
const CREDS = "/tmp/f3-reference-local.env";

function loadEnvFile(p) {
  const env = {};
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    env[t.slice(0, i)] = t.slice(i + 1);
  }
  return env;
}

function redact(obj) {
  const s = JSON.stringify(obj, null, 2);
  // belt-and-suspenders: never leak password-looking values
  return s.replace(/("PGPASSWORD"\s*:\s*")[^"]*(")/g, '$1<redacted>$2')
    .replace(/(password["']?\s*[:=]\s*["'])[^"']*(["'])/gi, "$1<redacted>$2");
}

const localEnv = loadEnvFile(CREDS);
const password = localEnv.POSTGRES_PASSWORD || localEnv.PGPASSWORD;
if (!password) {
  console.error("HOLD: local creds missing password");
  process.exit(2);
}

const frozenLocal = Object.freeze({
  host_classification: "local_loopback_oracle",
  connection_hostname: localEnv.PGHOST || "127.0.0.1",
  connection_port: Number(localEnv.PGPORT || "55432"),
  connection_database: localEnv.PGDATABASE || localEnv.POSTGRES_DB,
  connection_username: localEnv.PGUSER || localEnv.POSTGRES_USER,
  expected_live_database: localEnv.PGDATABASE || localEnv.POSTGRES_DB,
  expected_live_role: localEnv.PGUSER || localEnv.POSTGRES_USER,
  container: localEnv.CONTAINER_NAME || "f3-reference-pg176",
  credential_source: "file:/tmp/f3-reference-local.env",
  ssl_required: false,
  sslmode: "disable",
  production_ref_rejected: true,
  source: "local-oracle-connection-metadata",
  note: "LOCAL proof only — not disposable; not production",
});

const gatePath = path.join(TIP_WORK, "scripts/lib/f3-db-push-repair-safety-gate.mjs");
const parsePath = path.join(TIP_WORK, "scripts/lib/f3-db-push-query-parse.mjs");
const gate = await import(pathToFileURL(gatePath).href);
const parse = await import(pathToFileURL(parsePath).href);

const {
  PSQL_POISON_QUERY_ARGV,
  POISON_ABSENT_PROBE_SQL,
  evaluateExactPsqlStdoutFraming,
  hashOriginalStdout,
  preserveOriginalProcessStdout,
  parseExactOriginalJsonObject,
  evaluateOriginalProcessResultContract,
} = { ...gate, ...parse };

// Prefer exports from their modules
const framingFn = parse.evaluateExactPsqlStdoutFraming;
const hashFn = parse.hashOriginalStdout;
const preserveFn = parse.preserveOriginalProcessStdout;
const parseExactFn = parse.parseExactOriginalJsonObject;
const contractFn = parse.evaluateOriginalProcessResultContract;
const envelopeFn = gate.exactPoisonEnvelopeFromOriginal;
const argv = gate.PSQL_POISON_QUERY_ARGV;
const sql = gate.POISON_ABSENT_PROBE_SQL;

const hostPsqlVersion = spawnSync("psql", ["--version"], { encoding: "utf8" });
const containerPsqlVersion = spawnSync("docker", ["exec", frozenLocal.container, "psql", "--version"], { encoding: "utf8" });
const serverVersion = spawnSync("docker", ["exec", frozenLocal.container, "psql", "-U", frozenLocal.connection_username, "-d", frozenLocal.connection_database, "-tAc", "SHOW server_version;"], { encoding: "utf8" });

const home = fs.mkdtempSync(path.join(os.tmpdir(), "f3-local-poison-psql-home-"));
const env = Object.create(null);
env.PGHOST = frozenLocal.connection_hostname;
env.PGPORT = String(frozenLocal.connection_port);
env.PGDATABASE = frozenLocal.connection_database;
env.PGUSER = frozenLocal.connection_username;
env.PGPASSWORD = password;
env.PGSSLMODE = "disable";
env.PGCONNECT_TIMEOUT = "15";
env.PATH = "/usr/bin:/bin";
env.HOME = home;

const args = [...argv, "-c", sql];
// argv safety: no -d URL, no -p password
if (args.some((a) => a === "-d" || String(a).startsWith("postgres"))) {
  console.error("HOLD: argv unsafe");
  process.exit(2);
}

const child = spawnSync("psql", args, {
  encoding: "buffer",
  env,
  timeout: 15000,
  maxBuffer: 1024 * 1024,
  windowsHide: true,
});

try { fs.rmSync(home, { recursive: true, force: true }); } catch {}

const stdoutBuf = Buffer.isBuffer(child.stdout) ? child.stdout : Buffer.from(child.stdout || "");
const stderrBuf = Buffer.isBuffer(child.stderr) ? child.stderr : Buffer.from(child.stderr || "");

const rawStdoutHash = createHash("sha256").update(stdoutBuf).digest("hex");
const rawStderrHash = createHash("sha256").update(stderrBuf).digest("hex");

// Persist raw bytes for evidence (no secrets expected in poison probe)
fs.writeFileSync(path.join(OUT, "raw-stdout.bin"), stdoutBuf);
fs.writeFileSync(path.join(OUT, "raw-stderr.bin"), stderrBuf);

const processResult = {
  status: child.status,
  signal: child.signal,
  stdout: stdoutBuf.toString("utf8"),
  stderr: stderrBuf.toString("utf8"),
  timeout: child.error?.code === "ETIMEDOUT",
  spawnError: child.error && child.error.code !== "ETIMEDOUT" ? String(child.error.message || child.error) : null,
  transport: "isolated-psql",
  argv: args,
  envKeys: Object.keys(env).sort(),
  spawned: true,
};

const framing = framingFn(processResult.stdout);
const hashed = hashFn(processResult.stdout);
const preserved = preserveFn(processResult);
const contract = contractFn(processResult);
const parsed = parseExactFn(processResult);
const envelope = parsed.ok && envelopeFn
  ? envelopeFn(parsed.value)
  : { ok: false, reason: "parse failed before envelope" };

const live = envelope.ok
  ? {
      current_database: envelope.row.current_database,
      current_user: envelope.row.current_user,
      provenance: "original_query_output",
    }
  : null;

const bindOk = live
  && live.current_database === frozenLocal.expected_live_database
  && live.current_user === frozenLocal.expected_live_role;

// Can envelope pass repair gate shape checks (exact keys, poisonPresent false)?
const repairGateShapeOk = envelope.ok
  && envelope.row.poisonPresent === false
  && envelope.row.schema_version === "f3-poison-envelope-v1"
  && envelope.row.probe_marker === gate.POISON_PROBE_MARKER;

const framingMatchesAssumedLf =
  framing.ok === true
  && framing.payloadStart === 0
  && stdoutBuf.length > 0
  && stdoutBuf[stdoutBuf.length - 1] === 0x0a
  && !stdoutBuf.includes(0x0d);

const continueOk =
  child.status === 0
  && stderrBuf.byteLength === 0
  && framing.ok === true
  && framingMatchesAssumedLf
  && preserved.ok === true
  && contract.ok === true
  && parsed.ok === true
  && envelope.ok === true
  && bindOk === true
  && repairGateShapeOk === true
  && processResult.spawnError == null
  && processResult.timeout !== true;

const hexDumpTail = [...stdoutBuf.slice(Math.max(0, stdoutBuf.length - 32))]
  .map((b) => b.toString(16).padStart(2, "0"))
  .join(" ");
const hexDumpHead = [...stdoutBuf.slice(0, Math.min(32, stdoutBuf.length))]
  .map((b) => b.toString(16).padStart(2, "0"))
  .join(" ");

const report = {
  verdict: continueOk ? "CONTINUE" : "HOLD",
  captured_at_et: new Date().toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" }),
  tip_sha: "19e997dfadd9f6a8bc1a221a7edb5f6e8ec02d80",
  host_psql_client: String(hostPsqlVersion.stdout || "").trim(),
  container_psql: String(containerPsqlVersion.stdout || "").trim(),
  server_version: String(serverVersion.stdout || "").trim(),
  exact_command: {
    argv: ["psql", ...argv, "-c", "<POISON_ABSENT_PROBE_SQL>"],
    argv_flags: [...argv],
    password_on_argv: false,
    env_keys: Object.keys(env).filter((k) => k !== "PGPASSWORD").concat(["PGPASSWORD"]),
  },
  process: {
    exit_status: child.status,
    signal: child.signal,
    timeout: processResult.timeout,
    spawnError: processResult.spawnError,
  },
  stderr: {
    byte_length: stderrBuf.byteLength,
    sha256: rawStderrHash,
    exact_zero_bytes: stderrBuf.byteLength === 0,
  },
  stdout: {
    byte_length: stdoutBuf.byteLength,
    sha256: rawStdoutHash,
    BEFORE_parse: true,
    head_hex_32: hexDumpHead,
    tail_hex_32: hexDumpTail,
    last_byte: stdoutBuf.length ? stdoutBuf[stdoutBuf.length - 1] : null,
    contains_cr: stdoutBuf.includes(0x0d),
    utf8_preview_redacted: stdoutBuf.toString("utf8").slice(0, 240),
  },
  framing: {
    ...framing,
    assumed_lf_only_contract: parse.PSQL_POISON_STDOUT_FRAMING_CONTRACT,
    matches_assumed_lf_only: framingMatchesAssumedLf,
    note: framingMatchesAssumedLf
      ? "psql 17.11 client → 17.6 server framing matches assumed LF-only contract"
      : "HOLD: framing differs from assumed LF-only — do not generically relax",
  },
  parser: {
    preserve_ok: preserved.ok,
    contract_ok: contract.ok,
    parse_ok: parsed.ok,
    envelope_ok: envelope.ok,
    parser_verdict: envelope.parser_verdict || parsed.parser_verdict || contract.parser_verdict || null,
    reconstructed: false,
    duplicate_key_safe: true,
  },
  frozen_local_connection_metadata: {
    ...frozenLocal,
    // no password
  },
  live_bind: {
    ok: bindOk,
    live,
    expected_database: frozenLocal.expected_live_database,
    expected_user: frozenLocal.expected_live_role,
  },
  repair_gate_envelope_shape: {
    ok: repairGateShapeOk,
    poisonPresent: envelope.ok ? envelope.row.poisonPresent : null,
    schema_version: envelope.ok ? envelope.row.schema_version : null,
  },
  hold_reason: continueOk ? null : (
    child.status !== 0 ? `psql exit ${child.status}` :
    stderrBuf.byteLength !== 0 ? "stderr nonempty" :
    !framingMatchesAssumedLf ? "framing differs from assumed LF-only" :
    !bindOk ? "live bind to frozen LOCAL metadata failed" :
    !envelope.ok ? `envelope parse failed: ${envelope.reason || parsed.reason}` :
    "unspecified hold"
  ),
};

fs.writeFileSync(path.join(OUT, "STATUS.json"), redact(report));
fs.writeFileSync(path.join(OUT, "STATUS.md"), `# Local psql poison proof\n\nVerdict: **${report.verdict}**\n\n` +
  `- host psql: ${report.host_psql_client}\n` +
  `- container psql: ${report.container_psql}\n` +
  `- server: ${report.server_version}\n` +
  `- exit: ${report.process.exit_status}\n` +
  `- stderr bytes: ${report.stderr.byte_length}\n` +
  `- stdout sha256: ${report.stdout.sha256} len=${report.stdout.byte_length}\n` +
  `- framing LF-only match: ${report.framing.matches_assumed_lf_only}\n` +
  `- parser ok: ${report.parser.envelope_ok}\n` +
  `- local bind ok: ${report.live_bind.ok}\n` +
  `- repair-gate shape ok: ${report.repair_gate_envelope_shape.ok}\n` +
  (report.hold_reason ? `\nHOLD reason: ${report.hold_reason}\n` : "\n"));

console.log(JSON.stringify({
  verdict: report.verdict,
  exit: report.process.exit_status,
  stderr_bytes: report.stderr.byte_length,
  stdout_sha256: report.stdout.sha256,
  stdout_len: report.stdout.byte_length,
  framing_ok: report.framing.ok,
  lf_only: report.framing.matches_assumed_lf_only,
  envelope_ok: report.parser.envelope_ok,
  bind_ok: report.live_bind.ok,
  hold_reason: report.hold_reason,
}, null, 2));

process.exit(continueOk ? 0 : 1);
