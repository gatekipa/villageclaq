/**
 * F13 Phase 2 qualification-reset runtime planner / SQL emitter / transport.
 *
 * Imports fail-closed design validators and calls them before emit.
 * RESTRICT only. Exact PREASSIGNED version+name history predicates.
 * Refuses extras, production, wipe, CASCADE, Management API apply.
 *
 * LOCAL / OFFLINE by default. Live apply is gated psql -X -v ON_ERROR_STOP=1 -f
 * of SQL generated from the finite allowlist, inside one SERIALIZABLE TX.
 * Test adapters are not a production validation bypass.
 *
 * Label: F13 RESET IMPLEMENTATION CANDIDATE — LOCAL VERIFICATION PENDING CHIEF / QA
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPROVED_DISPOSABLE_HOST,
  APPROVED_DISPOSABLE_ORG_ID,
  APPROVED_DISPOSABLE_POOLER_HOST,
  APPROVED_DISPOSABLE_POOLER_PORT,
  APPROVED_DISPOSABLE_POOLER_USER,
  APPROVED_DISPOSABLE_PROJECT_NAME,
  APPROVED_DISPOSABLE_PROJECT_REF,
  CLI_PIN,
  PRODUCTION_REF,
  TRANSACTION_POOLER_PORT,
} from "./f3-db-push-pins.mjs";
import {
  AUTHENTICATED_HISTORY_KEYS,
  FINITE_DEPENDENCY_ALLOWLIST,
  FINITE_OBJECT_ALLOWLIST,
  F13_WIPE_REJECTION_CODE,
  TRANSACTION_PHASES,
  UNCERTAIN_COMMIT_POLICY,
  isFinancialPrefixSelector,
  scopeSqlIdentityDigest,
  sha256Utf8,
  validateFounderAuthorizationBinding,
  validateHistoryKeys,
  validateHistorySqlPredicate,
  validateNoBroadCascade,
  validateObjectAllowlist,
  validateTransactionContract,
} from "./f3-db-push-qualification-reset-design.mjs";
import { evaluateQualificationResetEligibility } from "./f3-db-push-inventory.mjs";
import { GATED_PSQL_FILE_RENDERED, runGatedRemoteSqlText } from "./f3-db-push-remote-sql-file.mjs";
import { assertDbPushGates, refuseProduction, sanitizeForLog } from "./f3-db-push-target-guard.mjs";

const RESET_MODULE_DIR = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(RESET_MODULE_DIR, "../..");

export { scopeSqlIdentityDigest, AUTHENTICATED_HISTORY_KEYS };

export const F13_RUNTIME_PHASE = 2;
export const F13_RUNTIME_LABEL =
  "F13 RESET IMPLEMENTATION CANDIDATE — LOCAL VERIFICATION PENDING CHIEF / QA";
export const F13_SHARED_ORCHESTRATION_ID = "runQualificationReset";
export const F13_WIPE_STILL_REJECTED = F13_WIPE_REJECTION_CODE;

export const F13_TX_TIMEOUTS = Object.freeze({
  lock_timeout: "5s",
  statement_timeout: "60s",
  idle_in_transaction_session_timeout: "30s",
});

export const F13_REQUIRED_AUTH_FIELDS = Object.freeze([
  "targetRef",
  "functionalCandidateSha",
  "closureDigest",
  "scopeSqlIdentitySha256",
  "executionBudget",
]);

export const F13_EXECUTION_BUDGET = Object.freeze({
  constrainedResets: 1,
  completeQualsFrom00118: 1,
  secondReset: false,
});

const SECRET_NEEDLES = Object.freeze([
  "DATABASE_URL",
  "DISPOSABLE_DB_URL",
  "VILLAGECLAQ_F3_DISPOSABLE_DB_PASSWORD",
  "PGPASSWORD",
  "postgresql://",
  "postgres://",
  "pgbouncer",
]);

const UNCERTAIN_COMMIT_RE =
  /terminating connection|connection (?:to server )?(?:lost|closed)|server closed|57P01|57P02|57P03|08006|08003|could not receive data/i;

function fail(code, reason, extra = {}) {
  return {
    ok: false,
    executed: false,
    committed: false,
    mutationEntrypointOpen: false,
    code,
    reason,
    wipeToBaselineRejected: true,
    wipeRejectionCode: F13_WIPE_REJECTION_CODE,
    automaticReplay: false,
    ...extra,
  };
}

function sqlString(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function sqlTextArray(values) {
  if (!values.length) return "ARRAY[]::text[]";
  return `ARRAY[${values.map((v) => sqlString(v)).join(", ")}]`;
}

function identityOf(item) {
  if (item == null) return "";
  if (typeof item === "string") return item;
  return String(item.identity || "");
}

function snapshotObserved(input = {}) {
  return {
    objects: (input.observedObjects || []).map(identityOf),
    dependencies: (input.observedDependencies || []).map(identityOf),
    history: (input.observedHistoryRows || []).map((row) => ({
      version: row?.version == null ? "" : String(row.version),
      name: row?.name == null ? null : String(row.name),
    })),
  };
}

function sameObserved(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function artifactLooksSecret(value) {
  const blob = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return SECRET_NEEDLES.find((n) => blob.includes(n)) || null;
}

export function parseFounderAuthorizationArtifactArg(argv = []) {
  const list = Array.isArray(argv) ? argv : [];
  const eq = list.find((a) => String(a).startsWith("--founder-authorization-artifact="));
  if (eq) return String(eq).slice("--founder-authorization-artifact=".length);
  const idx = list.indexOf("--founder-authorization-artifact");
  if (idx >= 0 && list[idx + 1] != null && !String(list[idx + 1]).startsWith("-")) {
    return list[idx + 1];
  }
  return null;
}

export function resolveRepoRelativeArtifactPath(repoRelativePath, repoRoot = DEFAULT_REPO_ROOT) {
  const rel = String(repoRelativePath ?? "").trim().replaceAll("\\", "/");
  if (!rel) {
    return fail("F13_AUTH_ARTIFACT_PATH", "Founder authorization artifact path is required");
  }
  if (
    rel.startsWith("/")
    || rel.startsWith("~")
    || rel.includes("://")
    || rel.split("/").includes("..")
    || rel.includes("\0")
  ) {
    return fail("F13_AUTH_ARTIFACT_PATH", "Founder authorization artifact must be a repo-relative path");
  }
  const root = path.resolve(repoRoot);
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) {
    return fail("F13_AUTH_ARTIFACT_PATH", "Founder authorization artifact escaped the repository root");
  }
  return { ok: true, relative: rel, absolute: abs, repoRoot: root };
}

export function loadFounderAuthorizationArtifact(repoRelativePath, { repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const resolved = resolveRepoRelativeArtifactPath(repoRelativePath, repoRoot);
  if (!resolved.ok) return resolved;
  if (!fs.existsSync(resolved.absolute)) {
    return fail("F13_FOUNDER_AUTH_MISSING", "Founder authorization artifact is missing", {
      path: resolved.relative,
    });
  }
  let raw;
  try {
    raw = fs.readFileSync(resolved.absolute, "utf8");
  } catch (err) {
    return fail("F13_FOUNDER_AUTH_MISSING", "Founder authorization artifact could not be read", {
      path: resolved.relative,
      detail: String(err?.message || err),
    });
  }
  const secret = artifactLooksSecret(raw);
  if (secret) {
    return fail("F13_AUTH_ARTIFACT_SECRET", "Founder authorization artifact must not contain connection material", {
      hit: secret,
    });
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail("F13_FOUNDER_AUTH_MALFORMED", "Founder authorization artifact is not valid JSON", {
      path: resolved.relative,
    });
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fail("F13_FOUNDER_AUTH_MALFORMED", "Founder authorization artifact must be a JSON object", {
      path: resolved.relative,
    });
  }
  return {
    ok: true,
    path: resolved.relative,
    artifact: parsed,
    sha256: sha256Utf8(raw),
  };
}

export function expectedQualificationResetRuntimeBinding(runtimeContext = {}) {
  const scope = runtimeContext.scopeSqlIdentitySha256 || scopeSqlIdentityDigest();
  return {
    targetRef: runtimeContext.targetRef || APPROVED_DISPOSABLE_PROJECT_REF,
    functionalCandidateSha: runtimeContext.functionalCandidateSha || null,
    closureDigest: runtimeContext.closureDigest || null,
    scopeSqlIdentitySha256: scope,
    executionBudget: { ...F13_EXECUTION_BUDGET },
  };
}

export function bindFounderAuthorizationArtifact(artifact, runtimeContext = {}) {
  if (artifact == null || typeof artifact !== "object" || Array.isArray(artifact)) {
    return fail("F13_FOUNDER_AUTH_MALFORMED", "Founder authorization artifact must be a JSON object");
  }
  const secret = artifactLooksSecret(artifact);
  if (secret) {
    return fail("F13_AUTH_ARTIFACT_SECRET", "Founder authorization artifact must not contain connection material", {
      hit: secret,
    });
  }
  const expected = expectedQualificationResetRuntimeBinding(runtimeContext);
  const missing = F13_REQUIRED_AUTH_FIELDS.filter((key) => {
    const value = artifact[key];
    return value == null || (typeof value === "string" && value.trim() === "");
  });
  if (missing.length) {
    return fail("F13_FOUNDER_AUTH_INCOMPLETE", "Flag alone is not founder authorization", {
      missing,
      flagAloneIsNotAuthorization: true,
    });
  }
  if (artifact.wipeToBaseline === true || artifact.flag === "--wipe-to-baseline") {
    return fail(F13_WIPE_REJECTION_CODE, "wipe-to-baseline remains rejected");
  }
  if (String(artifact.targetRef) === PRODUCTION_REF || /llbnliixczcqfftxpsmb/i.test(JSON.stringify(artifact))) {
    return fail("F13_PRODUCTION_REFUSED", "Production ref is refused");
  }
  if (artifact.targetRef !== APPROVED_DISPOSABLE_PROJECT_REF || artifact.targetRef !== expected.targetRef) {
    return fail("F13_FOUNDER_AUTH_TARGET", "Authorization target is not the bound disposable", {
      targetRef: artifact.targetRef,
    });
  }
  if (!expected.functionalCandidateSha || !expected.closureDigest || !expected.scopeSqlIdentitySha256) {
    return fail("F13_FOUNDER_AUTH_STALE", "Runtime binding is incomplete; refuse rather than skip live identity checks", {
      missingRuntime: [
        !expected.functionalCandidateSha ? "functionalCandidateSha" : null,
        !expected.closureDigest ? "closureDigest" : null,
        !expected.scopeSqlIdentitySha256 ? "scopeSqlIdentitySha256" : null,
      ].filter(Boolean),
    });
  }
  if (
    String(artifact.functionalCandidateSha) !== String(expected.functionalCandidateSha)
    || String(artifact.closureDigest) !== String(expected.closureDigest)
  ) {
    return fail("F13_FOUNDER_AUTH_STALE", "Founder authorization artifact is stale against the bound candidate/closure", {
      flagAloneIsNotAuthorization: true,
    });
  }
  if (String(artifact.scopeSqlIdentitySha256) !== String(expected.scopeSqlIdentitySha256)) {
    return fail("F13_FOUNDER_AUTH_MISMATCH", "Founder authorization scope/SQL identity digest does not match the finite allowlist", {
      flagAloneIsNotAuthorization: true,
    });
  }
  const budget = artifact.executionBudget || {};
  if (
    budget.constrainedResets !== 1
    || budget.completeQualsFrom00118 !== 1
    || budget.secondReset !== false
  ) {
    return fail("F13_BUDGET_INVALID", "Execution budget must be exactly one reset and one qualify", { budget });
  }
  const design = validateFounderAuthorizationBinding({
    ...artifact,
    authorizationArtifactSatisfied: true,
    flag: "--qualification-reset",
  });
  if (!design.ok) return design;
  return {
    ok: true,
    executed: false,
    authorizationArtifactSatisfied: true,
    flagAloneIsNotAuthorization: true,
    bound: design.bound,
    expected,
  };
}

export function evaluateQualificationResetArgv(argv = [], runtimeContext = {}) {
  const list = Array.isArray(argv) ? argv : [];
  if (list.includes("--wipe-to-baseline")) {
    return fail(F13_WIPE_REJECTION_CODE, "wipe-to-baseline remains rejected", {
      wipeToBaselineRejected: true,
    });
  }
  const qualificationReset = list.includes("--qualification-reset");
  const artifactPath = parseFounderAuthorizationArtifactArg(list);
  if (!qualificationReset) {
    return { ok: true, qualificationReset: false, founderAuthorizationArtifact: artifactPath };
  }
  if (list.includes("--prep-floor") || list.includes("--sequence-f3") || list.includes("--greenfield")) {
    return fail("F13_INVALID_FLAG_COMBINATION", "Qualification reset must not share argv with prep-floor/sequence-f3/greenfield");
  }
  if (list.includes("--seal-expected-from-local-oracle")) {
    return fail("F13_INVALID_FLAG_COMBINATION", "Qualification reset must not share argv with seal-expected-from-local-oracle");
  }
  if (!artifactPath || !String(artifactPath).trim()) {
    return fail("F13_FLAG_NOT_AUTHORIZATION", "Proposed Phase-2 flag is not founder authorization by itself", {
      flagAloneIsNotAuthorization: true,
      missing: ["--founder-authorization-artifact"],
    });
  }
  const loaded = loadFounderAuthorizationArtifact(artifactPath, { repoRoot: runtimeContext.repoRoot });
  if (!loaded.ok) return loaded;
  const bound = bindFounderAuthorizationArtifact(loaded.artifact, runtimeContext);
  if (!bound.ok) return bound;
  return {
    ok: true,
    qualificationReset: true,
    founderAuthorizationArtifact: loaded.path,
    artifactSha256: loaded.sha256,
    authorization: bound.bound,
    authorizationArtifactSatisfied: true,
  };
}

function refuseRuntimeTarget(target = {}) {
  const blob = JSON.stringify(target);
  try {
    refuseProduction(blob);
  } catch (err) {
    return fail(err.code || "F13_PRODUCTION_REFUSED", err.message || "Production ref is refused");
  }
  if (String(target.ref || target.targetRef || "") === PRODUCTION_REF) {
    return fail("F13_PRODUCTION_REFUSED", "Production ref is refused");
  }
  if (Number(target.poolerPort || target.port) === TRANSACTION_POOLER_PORT) {
    return fail("F13_TRANSACTION_POOLER_REFUSED", "Transaction pooler :6543 is never a reset target");
  }
  if (target.ref && target.ref !== APPROVED_DISPOSABLE_PROJECT_REF) {
    return fail("F13_WRONG_TARGET", "Reset target is not the bound disposable", { targetRef: target.ref });
  }
  return { ok: true };
}

export function planQualificationReset(input = {}) {
  if (input.wipeToBaseline === true || input.flag === "--wipe-to-baseline") {
    return fail(F13_WIPE_REJECTION_CODE, "wipe-to-baseline remains rejected");
  }
  const targetCheck = refuseRuntimeTarget(input.target || { ref: input.targetRef || APPROVED_DISPOSABLE_PROJECT_REF });
  if (!targetCheck.ok) return targetCheck;

  const cascade = validateNoBroadCascade(input.sqlText || "");
  if (!cascade.ok) return cascade;
  const historySql = input.sqlText ? validateHistorySqlPredicate(input.sqlText) : { ok: true };
  if (!historySql.ok) return historySql;

  const objects = validateObjectAllowlist(input.observedObjects || [], input.observedDependencies || []);
  if (!objects.ok) return objects;
  const history = validateHistoryKeys(input.observedHistoryRows || []);
  if (!history.ok) return history;
  const eligibility = evaluateQualificationResetEligibility({
    observedObjectIdentities: input.observedObjects || [],
    observedDependencies: input.observedDependencies || [],
    observedHistoryRows: input.observedHistoryRows || [],
  });
  if (!eligibility.ok) {
    return fail(eligibility.code, eligibility.reason, eligibility);
  }

  const authInput = input.authorization;
  if (!authInput) {
    return fail("F13_FOUNDER_AUTH_INCOMPLETE", "Flag alone is not founder authorization", {
      missing: ["authorization"],
      flagAloneIsNotAuthorization: true,
    });
  }
  const auth = authInput.authorizationArtifactSatisfied === true && authInput.bound
    ? { ok: true, bound: authInput.bound }
    : bindFounderAuthorizationArtifact(authInput, input.runtimeContext || {});
  if (!auth.ok) return auth;

  const tx = validateTransactionContract(input.transaction || {
    phases: TRANSACTION_PHASES,
    advisoryLockOnly: false,
    serializable: true,
    automaticReplay: false,
    claimRollbackWithoutEvidence: false,
  });
  if (!tx.ok) return tx;

  const observed = snapshotObserved(input);
  const sql = buildQualificationResetSql({
    observedHistoryRows: observed.history,
    scopeSqlIdentitySha256: auth.bound.scopeSqlIdentitySha256,
  });
  if (!sql.ok) return sql;
  if (input.sqlText && sha256Utf8(input.sqlText) !== sql.sha256) {
    return fail("F13_SQL_DIGEST_MISMATCH", "Caller SQL digest does not match the finite-allowlist emitter");
  }

  return {
    ok: true,
    executed: false,
    committed: false,
    phase: F13_RUNTIME_PHASE,
    label: F13_RUNTIME_LABEL,
    mutationEntrypointOpen: false,
    wipeToBaselineRejected: true,
    wipeRejectionCode: F13_WIPE_REJECTION_CODE,
    cliPin: CLI_PIN,
    target: Object.freeze({
      accept: APPROVED_DISPOSABLE_PROJECT_REF,
      name: APPROVED_DISPOSABLE_PROJECT_NAME,
      org: APPROVED_DISPOSABLE_ORG_ID,
      host: APPROVED_DISPOSABLE_HOST,
      poolerHost: APPROVED_DISPOSABLE_POOLER_HOST,
      poolerPort: APPROVED_DISPOSABLE_POOLER_PORT,
      poolerUser: APPROVED_DISPOSABLE_POOLER_USER,
      reject: Object.freeze([PRODUCTION_REF, `transaction pooler :${TRANSACTION_POOLER_PORT}`]),
    }),
    authorization: auth.bound,
    observed,
    objectCount: FINITE_OBJECT_ALLOWLIST.length,
    dependencyCount: FINITE_DEPENDENCY_ALLOWLIST.length,
    historyKeyCount: AUTHENTICATED_HISTORY_KEYS.length,
    transactionPhases: TRANSACTION_PHASES.map((p) => p.id),
    timeouts: F13_TX_TIMEOUTS,
    uncertainCommit: UNCERTAIN_COMMIT_POLICY,
    sql: sql.sql,
    sqlSha256: sql.sha256,
    dropOrder: sql.dropOrder,
    historyDeletes: sql.historyDeletes,
    sharedOrchestration: F13_SHARED_ORCHESTRATION_ID,
    transport: GATED_PSQL_FILE_RENDERED,
  };
}

function presenceProbe(row) {
  const id = sqlString(row.identity);
  if (row.kind === "function") return `to_regprocedure(${id})`;
  if (row.kind === "table" || row.kind === "sequence") return `to_regclass(${id})`;
  if (row.kind === "type") return `to_regtype(${id})`;
  if (row.kind === "schema") return `to_regnamespace(${id})`;
  if (row.kind === "extension") {
    return `NULLIF((SELECT extname FROM pg_extension WHERE extname = ${id}), NULL)`;
  }
  return `NULL`;
}

function dropStatement(row) {
  const identity = row.identity;
  if (row.kind === "function") return `DROP FUNCTION IF EXISTS ${identity} RESTRICT;`;
  if (row.kind === "table") return `DROP TABLE IF EXISTS ${identity} RESTRICT;`;
  if (row.kind === "type") return `DROP TYPE IF EXISTS ${identity} RESTRICT;`;
  if (row.kind === "sequence") return `DROP SEQUENCE IF EXISTS ${identity} RESTRICT;`;
  if (row.kind === "schema") return `DROP SCHEMA IF EXISTS ${identity} RESTRICT;`;
  if (row.kind === "extension") {
    return [
      `IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = ${sqlString(identity)}) THEN`,
      `    IF EXISTS (`,
      `      SELECT 1`,
      `      FROM pg_depend d`,
      `      JOIN pg_extension e ON e.oid = d.refobjid`,
      `      WHERE e.extname = ${sqlString(identity)}`,
      `        AND d.deptype = 'n'`,
      `    ) THEN`,
      `      RAISE EXCEPTION 'F13_UNEXPECTED_OBJECT_OR_DEPENDENCY: leftover dependents of %', ${sqlString(identity)};`,
      `    END IF;`,
      `    EXECUTE 'DROP EXTENSION IF EXISTS ${identity} RESTRICT';`,
      `  END IF;`,
    ].join("\n");
  }
  throw new Error(`unsupported allowlist kind ${row.kind}`);
}

function advisoryLockKeys(digest) {
  const hex = String(digest || "0").replace(/[^0-9a-f]/gi, "").padEnd(16, "0").slice(0, 16);
  const k1 = Number.parseInt(hex.slice(0, 8), 16) << 0;
  const k2 = Number.parseInt(hex.slice(8, 16), 16) << 0;
  return [k1, k2];
}

export function buildQualificationResetSql({
  observedHistoryRows = [],
  scopeSqlIdentitySha256 = scopeSqlIdentityDigest(),
} = {}) {
  const historyCheck = validateHistoryKeys(observedHistoryRows);
  if (!historyCheck.ok) return historyCheck;

  const ordered = [...FINITE_OBJECT_ALLOWLIST].sort((a, b) => a.dropOrder - b.dropOrder);
  const tableIdentities = ordered.filter((o) => o.kind === "table" || o.kind === "sequence").map((o) => o.identity);
  const functionIdentities = ordered.filter((o) => o.kind === "function").map((o) => o.identity);
  const typeIdentities = ordered.filter((o) => o.kind === "type").map((o) => o.identity);
  const presentByVersion = new Map(
    (observedHistoryRows || []).map((row) => [String(row.version), row]),
  );
  const historyDeletes = AUTHENTICATED_HISTORY_KEYS.map((key) => ({
    version: key.version,
    name: key.name,
    expectedPresent: presentByVersion.has(key.version),
  }));

  const [lockK1, lockK2] = advisoryLockKeys(scopeSqlIdentitySha256);
  const lines = [];
  lines.push("-- F13 qualification-reset generated from FINITE_OBJECT_ALLOWLIST");
  lines.push(`-- scopeSqlIdentitySha256 ${scopeSqlIdentitySha256}`);
  lines.push("-- RESTRICT only. Generated from the finite allowlist; unexpected leftovers block.");
  lines.push("-- T0_BIND completed client-side (candidate SHA, disposable pins, founder artifact, production refuse).");
  lines.push("-- T1_BEGIN");
  lines.push("BEGIN ISOLATION LEVEL SERIALIZABLE;");
  lines.push(`SET LOCAL lock_timeout = ${sqlString(F13_TX_TIMEOUTS.lock_timeout)};`);
  lines.push(`SET LOCAL statement_timeout = ${sqlString(F13_TX_TIMEOUTS.statement_timeout)};`);
  lines.push(`SET LOCAL idle_in_transaction_session_timeout = ${sqlString(F13_TX_TIMEOUTS.idle_in_transaction_session_timeout)};`);
  lines.push(`SELECT pg_advisory_xact_lock(${lockK1}, ${lockK2});`);
  lines.push("-- T2_LOCK");
  lines.push("DO $f13_lock$");
  lines.push("BEGIN");
  lines.push("  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN");
  lines.push("    RAISE EXCEPTION 'F13_HISTORY_RELATION_MISSING';");
  lines.push("  END IF;");
  lines.push("  EXECUTE 'LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE';");
  for (const identity of tableIdentities) {
    lines.push(`  IF to_regclass(${sqlString(identity)}) IS NOT NULL THEN`);
    lines.push(`    EXECUTE 'LOCK TABLE ${identity} IN ACCESS EXCLUSIVE MODE';`);
    lines.push("  END IF;");
  }
  lines.push("END");
  lines.push("$f13_lock$;");
  lines.push("-- T3_REVALIDATE");
  lines.push("DO $f13_revalidate$");
  lines.push("DECLARE");
  lines.push("  extra text;");
  lines.push("  hist_count integer;");
  lines.push("  hist_name text;");
  lines.push("BEGIN");
  lines.push(`  SELECT n.nspname || '.' || c.relname INTO extra`);
  lines.push("  FROM pg_class c");
  lines.push("  JOIN pg_namespace n ON n.oid = c.relnamespace");
  lines.push("  WHERE n.nspname IN ('financial_core', 'financial_private', 'public')");
  lines.push("    AND c.relkind IN ('r', 'S')");
  lines.push(`    AND (n.nspname || '.' || c.relname) <> ALL (${sqlTextArray(tableIdentities)})`);
  lines.push("  LIMIT 1;");
  lines.push("  IF extra IS NOT NULL THEN");
  lines.push("    RAISE EXCEPTION 'F13_UNEXPECTED_OBJECT_OR_DEPENDENCY: %', extra;");
  lines.push("  END IF;");
  lines.push("  SELECT n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' INTO extra");
  lines.push("  FROM pg_proc p");
  lines.push("  JOIN pg_namespace n ON n.oid = p.pronamespace");
  lines.push("  WHERE n.nspname IN ('financial_core', 'financial_private', 'public')");
  lines.push(`    AND (n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')') <> ALL (${sqlTextArray(functionIdentities)})`);
  lines.push("  LIMIT 1;");
  lines.push("  IF extra IS NOT NULL THEN");
  lines.push("    RAISE EXCEPTION 'F13_UNEXPECTED_OBJECT_OR_DEPENDENCY: %', extra;");
  lines.push("  END IF;");
  lines.push("  SELECT n.nspname || '.' || t.typname INTO extra");
  lines.push("  FROM pg_type t");
  lines.push("  JOIN pg_namespace n ON n.oid = t.typnamespace");
  lines.push("  WHERE n.nspname IN ('financial_core', 'financial_private', 'public')");
  lines.push("    AND t.typtype IN ('e', 'c')");
  lines.push("    AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.reltype = t.oid AND c.relkind = 'r')");
  lines.push(`    AND (n.nspname || '.' || t.typname) <> ALL (${sqlTextArray(typeIdentities)})`);
  lines.push("  LIMIT 1;");
  lines.push("  IF extra IS NOT NULL THEN");
  lines.push("    RAISE EXCEPTION 'F13_UNEXPECTED_OBJECT_OR_DEPENDENCY: %', extra;");
  lines.push("  END IF;");
  lines.push("  SELECT con.conname INTO extra");
  lines.push("  FROM pg_constraint con");
  lines.push("  JOIN pg_class rel ON rel.oid = con.conrelid");
  lines.push("  JOIN pg_namespace n ON n.oid = rel.relnamespace");
  lines.push("  JOIN pg_class frel ON frel.oid = con.confrelid");
  lines.push("  JOIN pg_namespace fn ON fn.oid = frel.relnamespace");
  lines.push("  WHERE con.contype = 'f'");
  lines.push(`    AND (`);
  lines.push(`      ((n.nspname || '.' || rel.relname) = ANY (${sqlTextArray(tableIdentities)}))`);
  lines.push("      IS DISTINCT FROM");
  lines.push(`      ((fn.nspname || '.' || frel.relname) = ANY (${sqlTextArray(tableIdentities)}))`);
  lines.push("    )");
  lines.push("  LIMIT 1;");
  lines.push("  IF extra IS NOT NULL THEN");
  lines.push("    RAISE EXCEPTION 'F13_UNEXPECTED_OBJECT_OR_DEPENDENCY: %', extra;");
  lines.push("  END IF;");
  lines.push(`  SELECT version INTO extra FROM supabase_migrations.schema_migrations`);
  lines.push(`  WHERE version <> ALL (${sqlTextArray(AUTHENTICATED_HISTORY_KEYS.map((k) => k.version))})`);
  lines.push("  LIMIT 1;");
  lines.push("  IF extra IS NOT NULL THEN");
  lines.push("    RAISE EXCEPTION 'F13_HISTORY_KEY_MISMATCH: extra version %', extra;");
  lines.push("  END IF;");
  for (const key of AUTHENTICATED_HISTORY_KEYS) {
    const expectedPresent = presentByVersion.has(key.version);
    lines.push(`  SELECT count(*), min(name) INTO hist_count, hist_name`);
    lines.push(`  FROM supabase_migrations.schema_migrations`);
    lines.push(`  WHERE version = ${sqlString(key.version)};`);
    lines.push(`  IF hist_count > 1 THEN`);
    lines.push(`    RAISE EXCEPTION 'F13_HISTORY_KEY_MISMATCH: duplicate version %', ${sqlString(key.version)};`);
    lines.push("  END IF;");
    if (expectedPresent) {
      lines.push(`  IF hist_count <> 1 OR hist_name IS DISTINCT FROM ${sqlString(key.name)} THEN`);
      lines.push(`    RAISE EXCEPTION 'F13_HISTORY_KEY_MISMATCH: version % name %', ${sqlString(key.version)}, coalesce(hist_name, '<null>');`);
      lines.push("  END IF;");
    } else {
      lines.push(`  IF hist_count <> 0 THEN`);
      lines.push(`    RAISE EXCEPTION 'F13_HISTORY_KEY_MISMATCH: unexpected present version %', ${sqlString(key.version)};`);
      lines.push("  END IF;");
    }
  }
  lines.push("END");
  lines.push("$f13_revalidate$;");
  lines.push("-- T4_MUTATE / T5_AFFECTED");
  lines.push("DO $f13_mutate$");
  lines.push("DECLARE");
  lines.push("  deleted_count integer;");
  lines.push("  deleted_name text;");
  lines.push("  deleted_version text;");
  lines.push("BEGIN");
  for (const row of ordered) {
    if (row.kind === "schema") {
      const contents = ordered.filter((o) => o.schema === row.identity && o.kind !== "schema");
      lines.push(`  IF to_regnamespace(${sqlString(row.identity)}) IS NOT NULL THEN`);
      lines.push("    IF EXISTS (");
      lines.push("      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace");
      lines.push(`      WHERE n.nspname = ${sqlString(row.identity)}`);
      lines.push("    ) OR EXISTS (");
      lines.push("      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace");
      lines.push(`      WHERE n.nspname = ${sqlString(row.identity)}`);
      lines.push("    ) OR EXISTS (");
      lines.push("      SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace");
      lines.push(`      WHERE n.nspname = ${sqlString(row.identity)} AND t.typtype IN ('e', 'c')`);
      lines.push("        AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.reltype = t.oid AND c.relkind = 'r')");
      lines.push("    ) THEN");
      lines.push(`      RAISE EXCEPTION 'F13_SCHEMA_NOT_EMPTY: %', ${sqlString(row.identity)};`);
      lines.push("    END IF;");
      lines.push(`    EXECUTE 'DROP SCHEMA IF EXISTS ${row.identity} RESTRICT';`);
      lines.push("  END IF;");
      void contents;
    } else if (row.kind === "extension") {
      lines.push(`  ${dropStatement(row)}`);
    } else {
      lines.push(`  EXECUTE ${sqlString(dropStatement(row))};`);
    }
  }
  for (const key of historyDeletes) {
    lines.push("  deleted_version := NULL;");
    lines.push("  deleted_name := NULL;");
    lines.push("  deleted_count := 0;");
    lines.push(`  DELETE FROM supabase_migrations.schema_migrations`);
    lines.push(`  WHERE version = ${sqlString(key.version)} AND name = ${sqlString(key.name)}`);
    lines.push("  RETURNING version, name INTO deleted_version, deleted_name;");
    lines.push("  GET DIAGNOSTICS deleted_count = ROW_COUNT;");
    if (key.expectedPresent) {
      lines.push(`  IF deleted_count <> 1 OR deleted_version IS DISTINCT FROM ${sqlString(key.version)} OR deleted_name IS DISTINCT FROM ${sqlString(key.name)} THEN`);
      lines.push(`    RAISE EXCEPTION 'F13_AFFECTED_ROW_MISMATCH: % %', ${sqlString(key.version)}, coalesce(deleted_name, '<null>');`);
      lines.push("  END IF;");
    } else {
      lines.push("  IF deleted_count <> 0 THEN");
      lines.push(`    RAISE EXCEPTION 'F13_AFFECTED_ROW_MISMATCH: unexpected delete of %', ${sqlString(key.version)};`);
      lines.push("  END IF;");
    }
  }
  lines.push("END");
  lines.push("$f13_mutate$;");
  lines.push("-- T6_FINAL");
  lines.push("DO $f13_final$");
  lines.push("DECLARE");
  lines.push("  leftover text;");
  lines.push("BEGIN");
  for (const row of ordered) {
    lines.push(`  IF ${presenceProbe(row)} IS NOT NULL THEN`);
    lines.push(`    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', ${sqlString(row.identity)};`);
    lines.push("  END IF;");
  }
  for (const key of AUTHENTICATED_HISTORY_KEYS) {
    lines.push(`  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = ${sqlString(key.version)}) THEN`);
    lines.push(`    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: history % still present', ${sqlString(key.version)};`);
    lines.push("  END IF;");
  }
  lines.push("  leftover := NULL;");
  lines.push("END");
  lines.push("$f13_final$;");
  lines.push("-- T7_COMMIT");
  lines.push("COMMIT;");

  const sql = `${lines.join("\n")}\n`;
  const cascade = validateNoBroadCascade(sql);
  if (!cascade.ok) return cascade;
  const historyPred = validateHistorySqlPredicate(sql);
  if (!historyPred.ok) return historyPred;
  if (/\bCASCADE\b/i.test(sql) || /name\s+IS\s+NULL/i.test(sql) || /financial_\*/.test(sql)) {
    return fail("F13_EMITTER_REFUSED_FORBIDDEN_SQL", "Emitter refused to produce CASCADE, null-name, or prefix SQL");
  }

  return {
    ok: true,
    sql,
    sha256: sha256Utf8(sql),
    dropOrder: ordered.map((row) => row.id),
    historyDeletes,
    timeouts: F13_TX_TIMEOUTS,
  };
}

function encodeProcessResult(result, commandIdentity) {
  const stdout = String(sanitizeForLog(String(result?.stdout ?? "")) ?? "");
  const stderr = String(sanitizeForLog(String(result?.stderr ?? "")) ?? "");
  const errorRaw = result?.error ?? null;
  const error = errorRaw == null
    ? null
    : String(sanitizeForLog(typeof errorRaw === "object" ? String(errorRaw.message || errorRaw.code || "") : String(errorRaw)) ?? "");
  return {
    commandIdentity,
    argv: Array.isArray(result?.argv) ? result.argv.map((item) => String(sanitizeForLog(String(item)) ?? "")) : ["-X", "-v", "ON_ERROR_STOP=1", "-f", "[FILE]"],
    status: Number.isInteger(result?.status) ? result.status : 1,
    stdout,
    stderr,
    error,
    signal: result?.signal ?? null,
    timeout: result?.timeout === true,
  };
}

function isUncertainCommit(result) {
  const blob = `${result?.stderr || ""} ${result?.error || ""} ${result?.signal || ""}`;
  return UNCERTAIN_COMMIT_RE.test(blob) || result?.uncertainCommit === true;
}

function emptySpies() {
  return {
    planCalls: 0,
    validateCalls: 0,
    transportCalls: 0,
    applyCalls: 0,
    sqlCalls: 0,
    beginObserved: 0,
    mutateAttempted: 0,
    commitAttempted: 0,
    commitConfirmed: 0,
    rollbackObserved: 0,
    replayCalls: 0,
    committedEffects: 0,
    startedBeforeInvoke: false,
    completedAfterAwait: false,
  };
}

export function createDisabledQualificationResetTransportAdapter(script = {}) {
  return {
    kind: "disabled",
    disabled: true,
    failAt: script.failAt || null,
    inventoryAtTx: script.inventoryAtTx || null,
    sentinel: script.sentinel || { id: "storage.buckets", preserved: true },
    execute({ sql, plan, inventoryAtTx } = {}) {
      const cascade = validateNoBroadCascade(sql || "");
      if (!cascade.ok) {
        return {
          status: 1,
          stdout: "",
          stderr: cascade.reason,
          error: cascade,
          signal: null,
          timeout: false,
          phaseReached: "T0_BIND",
          rolledBack: true,
          committed: false,
          replayed: false,
          sentinelPreserved: true,
        };
      }
      const historyPred = validateHistorySqlPredicate(sql || "");
      if (!historyPred.ok) {
        return {
          status: 1,
          stdout: "",
          stderr: historyPred.reason,
          error: historyPred,
          signal: null,
          timeout: false,
          phaseReached: "T0_BIND",
          rolledBack: true,
          committed: false,
          replayed: false,
          sentinelPreserved: true,
        };
      }
      const observedAtTx = inventoryAtTx || script.inventoryAtTx || plan?.observed;
      if (plan?.observed && observedAtTx && !sameObserved(plan.observed, snapshotObserved({
        observedObjects: observedAtTx.objects || observedAtTx.observedObjects,
        observedDependencies: observedAtTx.dependencies || observedAtTx.observedDependencies,
        observedHistoryRows: observedAtTx.history || observedAtTx.observedHistoryRows,
      }))) {
        return {
          status: 1,
          stdout: "",
          stderr: "F13_STATE_CHANGED_BEFORE_TX",
          error: { code: "F13_STATE_CHANGED_BEFORE_TX" },
          signal: null,
          timeout: false,
          phaseReached: "T3_REVALIDATE",
          began: true,
          rolledBack: true,
          committed: false,
          replayed: false,
          sentinelPreserved: true,
        };
      }
      const failAt = script.failAt;
      if (failAt === "before_mutation" || failAt === "T0_BIND") {
        return {
          status: 1,
          stdout: "",
          stderr: "F13_FAILURE_BEFORE_MUTATION",
          error: { code: "F13_FAILURE_BEFORE_MUTATION" },
          signal: null,
          timeout: false,
          phaseReached: "T0_BIND",
          began: false,
          rolledBack: false,
          committed: false,
          replayed: false,
          sentinelPreserved: true,
        };
      }
      if (failAt === "after_begin" || failAt === "T1_BEGIN" || failAt === "T2_LOCK" || failAt === "T3_REVALIDATE") {
        return {
          status: 1,
          stdout: "",
          stderr: "F13_FAILURE_AFTER_BEGIN",
          error: { code: "F13_FAILURE_AFTER_BEGIN" },
          signal: null,
          timeout: false,
          phaseReached: failAt === "after_begin" ? "T3_REVALIDATE" : failAt,
          began: true,
          rolledBack: true,
          committed: false,
          replayed: false,
          sentinelPreserved: true,
        };
      }
      if (failAt === "affected_row" || failAt === "T5_AFFECTED") {
        return {
          status: 1,
          stdout: "",
          stderr: "F13_AFFECTED_ROW_MISMATCH",
          error: { code: "F13_AFFECTED_ROW_MISMATCH" },
          signal: null,
          timeout: false,
          phaseReached: "T5_AFFECTED",
          began: true,
          mutated: true,
          rolledBack: true,
          committed: false,
          replayed: false,
          sentinelPreserved: true,
        };
      }
      if (failAt === "final" || failAt === "T6_FINAL") {
        return {
          status: 1,
          stdout: "",
          stderr: "F13_FINAL_BASELINE_FAILED",
          error: { code: "F13_FINAL_BASELINE_FAILED" },
          signal: null,
          timeout: false,
          phaseReached: "T6_FINAL",
          began: true,
          mutated: true,
          rolledBack: true,
          committed: false,
          replayed: false,
          sentinelPreserved: true,
        };
      }
      if (failAt === "uncertain_commit" || failAt === "T7_COMMIT") {
        return {
          status: 1,
          stdout: "",
          stderr: "connection to server was lost during COMMIT 08006",
          error: { code: "08006", message: "connection to server was lost during COMMIT" },
          signal: null,
          timeout: false,
          phaseReached: "T7_COMMIT",
          began: true,
          mutated: true,
          uncertainCommit: true,
          rolledBack: null,
          committed: false,
          replayed: false,
          sentinelPreserved: null,
        };
      }
      return {
        status: 0,
        stdout: "f13_qualification_reset_ok",
        stderr: "",
        error: null,
        signal: null,
        timeout: false,
        phaseReached: "T7_COMMIT",
        began: true,
        mutated: true,
        rolledBack: false,
        committed: true,
        replayed: false,
        sentinelPreserved: script.sentinel?.preserved !== false,
      };
    },
  };
}

export function createLiveQualificationResetTransportAdapter({ workdir } = {}) {
  return {
    kind: "live-gated-psql",
    disabled: false,
    execute({ sql } = {}) {
      assertDbPushGates({ optIn: true });
      if (!workdir) {
        throw Object.assign(new Error("isolated workdir is required for live qualification reset"), {
          code: "F13_WORKDIR_REQUIRED",
        });
      }
      return runGatedRemoteSqlText(workdir, "f13-qualification-reset.sql", sql);
    },
  };
}

function recordEvent(recorder, type, payload) {
  if (recorder && typeof recorder.record === "function") {
    recorder.record(type, payload);
    return;
  }
  if (recorder && Array.isArray(recorder.events)) {
    recorder.events.push({ type, at: new Date().toISOString(), ...payload });
  }
}

export async function runQualificationReset({
  input = {},
  adapters = {},
  recorder = { events: [] },
  allowDisabledTransport = false,
  onAfterStarted = null,
} = {}) {
  const spies = emptySpies();
  const failRun = (code, reason, extra = {}) => ({
    ...fail(code, reason, extra),
    spies,
    events: recorder.events || recorder.snapshot?.() || [],
    automaticReplay: false,
    replayCalls: spies.replayCalls,
  });

  spies.planCalls += 1;
  spies.validateCalls += 1;
  const plan = planQualificationReset(input);
  if (!plan.ok) {
    return { ...plan, spies, events: recorder.events || [] };
  }

  const inventoryAtTx = input.inventoryAtTx || adapters.inventoryAtTx || null;
  if (inventoryAtTx) {
    const txSnap = snapshotObserved({
      observedObjects: inventoryAtTx.objects || inventoryAtTx.observedObjects,
      observedDependencies: inventoryAtTx.dependencies || inventoryAtTx.observedDependencies,
      observedHistoryRows: inventoryAtTx.history || inventoryAtTx.observedHistoryRows,
    });
    if (!sameObserved(plan.observed, txSnap)) {
      return failRun("F13_STATE_CHANGED_BEFORE_TX", "Observed state changed between plan and TX validation", {
        planObserved: plan.observed,
      });
    }
  }

  let transport = adapters.transport;
  if (!transport) {
    if (allowDisabledTransport) {
      transport = createDisabledQualificationResetTransportAdapter(adapters.disabledScript || {});
    } else {
      transport = createLiveQualificationResetTransportAdapter({ workdir: adapters.workdir || input.workdir });
    }
  }
  if (transport.disabled === true && allowDisabledTransport !== true) {
    return failRun("F13_DISABLED_TRANSPORT_NOT_AUTHORIZED", "Disabled/test transport is not a production validation bypass");
  }
  if (typeof transport.execute !== "function") {
    return failRun("F13_TRANSPORT_MISSING", "Qualification reset transport adapter is missing");
  }

  const commandIdentity = adapters.commandIdentity || GATED_PSQL_FILE_RENDERED;
  recordEvent(recorder, "qualification_reset_started", {
    phase: "qualification_reset",
    commandIdentity,
    sqlSha256: plan.sqlSha256,
  });
  spies.startedBeforeInvoke = true;
  if (typeof onAfterStarted === "function") {
    await onAfterStarted({
      pendingStarted: true,
      completed: false,
      events: recorder.events || recorder.snapshot?.() || [],
      spies: { ...spies },
    });
  }

  let thrown = null;
  let raw;
  try {
    raw = await Promise.resolve(transport.execute({
      sql: plan.sql,
      plan,
      inventoryAtTx,
    }));
  } catch (err) {
    thrown = err;
    raw = {
      status: 1,
      stdout: "",
      stderr: String(err?.message || err),
      error: err,
      signal: null,
      timeout: false,
      rolledBack: true,
      committed: false,
    };
  }

  spies.transportCalls += 1;
  spies.applyCalls += 1;
  spies.sqlCalls += 1;
  if (raw?.began) spies.beginObserved += 1;
  if (raw?.mutated) spies.mutateAttempted += 1;
  if (raw?.phaseReached === "T7_COMMIT" || raw?.committed === true || raw?.uncertainCommit === true) {
    spies.commitAttempted += 1;
  }
  if (raw?.rolledBack === true) spies.rollbackObserved += 1;

  const encoded = encodeProcessResult(raw, commandIdentity);
  recordEvent(recorder, "qualification_reset_completed", {
    phase: "qualification_reset",
    processResult: encoded,
  });
  spies.completedAfterAwait = true;

  if (raw?.replayed === true) {
    spies.replayCalls += 1;
    return failRun("F13_AUTOMATIC_REPLAY_FORBIDDEN", "Uncertain commit must not automatically replay", {
      plan,
      processResult: encoded,
    });
  }

  if (thrown || encoded.status !== 0) {
    if ((raw?.uncertainCommit === true || isUncertainCommit(raw) || isUncertainCommit(encoded)) && spies.commitAttempted > 0) {
      return {
        ok: false,
        executed: true,
        committed: false,
        code: UNCERTAIN_COMMIT_POLICY.requiredLabel,
        reason: UNCERTAIN_COMMIT_POLICY.nextStep,
        uncertainCommit: true,
        automaticReplay: false,
        unverifiableRollbackClaimForbidden: true,
        rolledBack: null,
        spies,
        plan,
        processResult: encoded,
        events: recorder.events || [],
      };
    }
    return failRun(raw?.error?.code || "F13_RESET_SQL_FAILED", raw?.stderr || thrown?.message || "Qualification reset SQL failed", {
      executed: true,
      rolledBack: raw?.rolledBack === true,
      processResult: encoded,
      plan,
      sentinelPreserved: raw?.sentinelPreserved !== false,
    });
  }

  if (raw?.committed !== true) {
    return failRun("F13_RESET_NOT_COMMITTED", "Transport returned success without a confirmed commit", {
      executed: true,
      processResult: encoded,
      plan,
    });
  }

  spies.commitConfirmed += 1;
  spies.committedEffects += 1;
  return {
    ok: true,
    executed: true,
    committed: true,
    code: "F13_RESET_COMMITTED",
    label: F13_RUNTIME_LABEL,
    phase: F13_RUNTIME_PHASE,
    wipeToBaselineRejected: true,
    wipeRejectionCode: F13_WIPE_REJECTION_CODE,
    automaticReplay: false,
    replayCalls: 0,
    spies,
    plan,
    processResult: encoded,
    sentinelPreserved: raw?.sentinelPreserved !== false,
    events: recorder.events || recorder.snapshot?.() || [],
    sharedOrchestration: F13_SHARED_ORCHESTRATION_ID,
  };
}

export function createQualificationResetRecorder() {
  const events = [];
  return {
    events,
    record(type, payload = {}) {
      events.push({ type, at: new Date().toISOString(), ...payload });
    },
    snapshot() {
      return [...events];
    },
  };
}
