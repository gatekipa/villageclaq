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
  CANONICAL_FUNCTION_IDENTITY_SQL,
  FINITE_DEPENDENCY_ALLOWLIST,
  FINITE_OBJECT_ALLOWLIST,
  F13_WIPE_REJECTION_CODE,
  TRANSACTION_PHASES,
  UNCERTAIN_COMMIT_POLICY,
  canonicalizeFunctionIdentity,
  isFinancialPrefixSelector,
  scopeSqlIdentityDigest,
  sha256Utf8,
  snapshotDependencyTuple,
  validateFounderAuthorizationBinding,
  validateHistoryKeys,
  validateHistorySqlPredicate,
  validateNoBroadCascade,
  validateObjectAllowlist,
  validateTransactionContract,
} from "./f3-db-push-qualification-reset-design.mjs";
import {
  INVENTORY_CAPTURE_SQL,
  QUALIFICATION_RESET_INVENTORY_CAPTURE_SQL,
  QUALIFICATION_RESET_INVENTORY_SCHEMA,
  QUALIFICATION_RESET_INVENTORY_SCHEMA_VERSION,
  buildQualificationResetInventoryPsqlCommand,
  evaluateQualificationResetEligibility,
  looksLikeAlignedPsqlFraming,
  observedFromQualificationResetCapture,
  parseQualificationResetInventoryProcessResult,
  validateQualificationResetInventoryBody,
} from "./f3-db-push-inventory.mjs";
import { parseDuplicateKeySafeJson } from "./f3-db-push-query-parse.mjs";
import { spawnLocalPsqlSync } from "./f3-local-connection-guard.mjs";
import { GATED_PSQL_FILE_RENDERED, writeGatedSqlFile } from "./f3-db-push-remote-sql-file.mjs";
import { assertDbPushGates, refuseProduction, sanitizeForLog, spawnGatedRemotePsqlSync } from "./f3-db-push-target-guard.mjs";
import { buildFunctionalRecursiveRuntimeClosure } from "./f3-db-push-repair-safety-gate.mjs";

const RESET_MODULE_DIR = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(RESET_MODULE_DIR, "../..");

export { scopeSqlIdentityDigest, AUTHENTICATED_HISTORY_KEYS };

export const F13_RUNTIME_PHASE = 2;
export const F15_RUNTIME_LABEL =
  "F15 LOCAL CORRECTION CANDIDATE — AWAITING QA / LOCAL 3-TX PROOF";
export const F14_RUNTIME_LABEL = F15_RUNTIME_LABEL;
export const F13_RUNTIME_LABEL = F15_RUNTIME_LABEL;
export const F13_SHARED_ORCHESTRATION_ID = "runQualificationReset";
export const F13_WIPE_STILL_REJECTED = F13_WIPE_REJECTION_CODE;
export const F13_F15_RUNTIME_CLOSURE_LABEL = "F15_QUALIFICATION_RESET_RUNTIME_CLOSURE";
export const F13_F15_VERIFICATION_UNION_LABEL = "F15_QUALIFICATION_RESET_VERIFICATION_UNION";
export const F13_F14_RUNTIME_CLOSURE_LABEL = F13_F15_RUNTIME_CLOSURE_LABEL;
export const F13_F14_VERIFICATION_UNION_LABEL = F13_F15_VERIFICATION_UNION_LABEL;
export const F13_BASELINE_RUNTIME_CLOSURE = Object.freeze({
  count: 45,
  sha256: "51c4a98fe2f249978dad09451b1a5e4a88617b833f66cafb6252870e6be7ed6d",
  notExpectedF14: true,
});
export const F13_BASELINE_VERIFICATION_UNION = Object.freeze({
  count: 47,
  sha256: "a317ff4f2008e15579e39769f1ed0b151f612a23e5ed444db238cae39c7387fe",
  notExpectedF14: true,
  notExpectedF15: true,
});
export const F14_BASELINE_RUNTIME_CLOSURE = Object.freeze({
  count: 45,
  sha256: "f6205869b233eaccf375b299112f7b9c352d58c6f2659471e06d2ca7a241e31d",
  notExpectedF15: true,
});
export const F14_BASELINE_VERIFICATION_UNION = Object.freeze({
  count: 48,
  sha256: "f6ff6e42b4b5ec14b1a67fe88377d7deafe5f12f2c2c35c834e7c763711e7caa",
  notExpectedF15: true,
});
export const F13_SUMMARY_FILE_HASH_FORBIDDEN =
  "16e4757840aec5f4fb44504fbd33e8480de169553f9a1ccfb180dbde051cb66d";
export const TX_OBSERVATION_SCHEMA_F14 = "f14-qualification-reset-tx-observation-v1";
export const TX_OBSERVATION_SCHEMA = "f15-qualification-reset-tx-observation-v1";
export const TX_OBSERVATION_SUCCESS_SEQUENCE = Object.freeze([
  Object.freeze({ phase: "T1_BEGIN", event: "began" }),
  Object.freeze({ phase: "T2_LOCK", event: "locked" }),
  Object.freeze({ phase: "T3_REVALIDATE", event: "revalidated" }),
  Object.freeze({ phase: "T4_MUTATE", event: "mutate_attempted" }),
  Object.freeze({ phase: "T5_AFFECTED", event: "affected_checked" }),
  Object.freeze({ phase: "T6_FINAL", event: "final_ok" }),
  Object.freeze({ phase: "T7_COMMIT", event: "commit_attempted" }),
  Object.freeze({ phase: "T7_COMMIT", event: "committed", committed: true }),
]);
export const QUALIFICATION_RESET_APPLY_PSQL_ARGV = Object.freeze([
  "-X",
  "-q",
  "-t",
  "-A",
  "-w",
  "-v",
  "ON_ERROR_STOP=1",
]);
export const QUALIFICATION_RESET_LOCAL_PROOF_HELPER_RELPATH =
  "scripts/prove-f3-qualification-reset-local.mjs";
export const QUALIFICATION_RESET_VERIFICATION_ONLY_FILES = Object.freeze([
  "scripts/test-f3-qualification-reset.mjs",
  "scripts/test-f3-qualification-reset-design.mjs",
  QUALIFICATION_RESET_LOCAL_PROOF_HELPER_RELPATH,
]);
export const F13_RESET_SUCCESS_VERDICT = "CLEAN_BASELINE";
export const F13_RESET_ALREADY_CLEAN_VERDICT = "CLEAN_BASELINE";
export const F13_INVENTORY_CAPTURE_REQUIRED = "F13_INVENTORY_CAPTURE_REQUIRED";
export const F13_INVENTORY_CAPTURE_SQL_ARTIFACT =
  "scripts/lib/f3-db-push-inventory.mjs INVENTORY_CAPTURE_SQL";
export {
  INVENTORY_CAPTURE_SQL,
  QUALIFICATION_RESET_INVENTORY_CAPTURE_SQL,
  QUALIFICATION_RESET_INVENTORY_SCHEMA,
  QUALIFICATION_RESET_INVENTORY_SCHEMA_VERSION,
  buildQualificationResetInventoryPsqlCommand,
  parseQualificationResetInventoryProcessResult,
  validateQualificationResetInventoryBody,
};

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
  const raw = typeof item === "string" ? item : String(item.identity || "");
  return raw.includes("(") ? canonicalizeFunctionIdentity(raw) : raw;
}

function snapshotObserved(input = {}) {
  return {
    objects: (input.observedObjects || []).map(identityOf),
    dependencies: (input.observedDependencies || []).map((dep) => {
      const tuple = snapshotDependencyTuple(dep);
      if (tuple) return tuple;
      return {
        incomplete: true,
        identity: typeof dep === "string" ? dep : (dep?.identity ?? null),
        kind: typeof dep === "object" && dep ? dep.kind ?? null : null,
        from: typeof dep === "object" && dep ? dep.from ?? null : null,
        to: typeof dep === "object" && dep ? dep.to ?? null : null,
      };
    }),
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
    inventory: input.inventory || null,
    inventoryCaptured: input.inventoryCaptured === true,
    captureComplete: input.captureComplete === true,
  });
  if (!eligibility.ok) {
    return fail(eligibility.code, eligibility.reason, eligibility);
  }
  if (input.inventoryCaptured !== true) {
    return fail(
      F13_INVENTORY_CAPTURE_REQUIRED,
      "Qualification reset refuses hardcoded empty inventory; capture observed objects/deps/history first",
      { alreadyClean: eligibility.alreadyClean === true, eligible: eligibility.eligible === true },
    );
  }
  if (eligibility.alreadyClean === true || eligibility.eligible !== true) {
    if (eligibility.alreadyClean === true) {
      return {
        ok: true,
        executed: false,
        committed: false,
        alreadyClean: true,
        eligible: false,
        mutation: false,
        sql: null,
        sqlSha256: null,
        dropOrder: [],
        historyDeletes: [],
        verdict: F13_RESET_ALREADY_CLEAN_VERDICT,
        code: "F13_RESET_ALREADY_CLEAN",
        reason: eligibility.reason,
        phase: F13_RUNTIME_PHASE,
        label: F13_RUNTIME_LABEL,
        mutationEntrypointOpen: false,
        wipeToBaselineRejected: true,
        wipeRejectionCode: F13_WIPE_REJECTION_CODE,
        cliPin: CLI_PIN,
        authorization: null,
        observed: snapshotObserved(input),
        eligibility,
        inventoryCaptured: true,
        sharedOrchestration: F13_SHARED_ORCHESTRATION_ID,
      };
    }
    return fail("F13_RESET_NOT_ELIGIBLE", eligibility.reason || "Reset is not eligible", eligibility);
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
    alreadyClean: false,
    eligible: true,
    mutation: true,
    inventoryCaptured: true,
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

function txObservationSql(phase, event, extra = {}) {
  const payload = {
    schema: TX_OBSERVATION_SCHEMA,
    phase,
    event,
    ...extra,
  };
  return `SELECT ${sqlString(JSON.stringify(payload))}::text;`;
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
  // PERFORM inside DO emits no client row. Top-level SELECT of void
  // pg_advisory_xact_lock prints a blank line under psql -At and must not
  // appear among observation records.
  lines.push("DO $f15_advisory_xact_lock$");
  lines.push("BEGIN");
  lines.push(`  PERFORM pg_advisory_xact_lock(${lockK1}, ${lockK2});`);
  lines.push("END");
  lines.push("$f15_advisory_xact_lock$;");
  lines.push(txObservationSql("T1_BEGIN", "began"));
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
  lines.push(txObservationSql("T2_LOCK", "locked"));
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
  lines.push(`  SELECT n.nspname || '.' || c.relname INTO extra`);
  lines.push("  FROM pg_class c");
  lines.push("  JOIN pg_namespace n ON n.oid = c.relnamespace");
  lines.push("  WHERE n.nspname IN ('financial_core', 'financial_private', 'public')");
  lines.push("    AND c.relkind = 'v'");
  lines.push("  LIMIT 1;");
  lines.push("  IF extra IS NOT NULL THEN");
  lines.push("    RAISE EXCEPTION 'F13_UNEXPECTED_OBJECT_OR_DEPENDENCY: %', extra;");
  lines.push("  END IF;");
  lines.push(`  SELECT ${CANONICAL_FUNCTION_IDENTITY_SQL} INTO extra`);
  lines.push("  FROM pg_proc p");
  lines.push("  JOIN pg_namespace n ON n.oid = p.pronamespace");
  lines.push("  WHERE n.nspname IN ('financial_core', 'financial_private', 'public')");
  lines.push(`    AND ${CANONICAL_FUNCTION_IDENTITY_SQL} <> ALL (${sqlTextArray(functionIdentities)})`);
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
  lines.push(txObservationSql("T3_REVALIDATE", "revalidated"));
  lines.push("-- T4_MUTATE / T5_AFFECTED");
  lines.push(txObservationSql("T4_MUTATE", "mutate_attempted"));
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
  lines.push(txObservationSql("T5_AFFECTED", "affected_checked"));
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
  lines.push(txObservationSql("T6_FINAL", "final_ok"));
  lines.push("-- T7_COMMIT");
  lines.push(txObservationSql("T7_COMMIT", "commit_attempted"));
  lines.push("COMMIT;");
  lines.push(txObservationSql("T7_COMMIT", "committed", { committed: true }));

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
  const stdoutRaw = result?.stdout ?? "";
  const stderrRaw = result?.stderr ?? "";
  const stdout = String(sanitizeForLog(String(stdoutRaw)) ?? "");
  const stderr = String(sanitizeForLog(String(stderrRaw)) ?? "");
  const errorRaw = result?.error ?? null;
  const structuredError = errorRaw == null
    ? null
    : {
      code: errorRaw.code ?? null,
      name: errorRaw.name ?? null,
      syscall: errorRaw.syscall ?? null,
      message: String(sanitizeForLog(String(errorRaw.message || errorRaw.code || errorRaw)) ?? ""),
    };
  const error = structuredError?.message ?? null;
  return {
    commandIdentity,
    argv: Array.isArray(result?.argv)
      ? result.argv.map((item) => String(sanitizeForLog(String(item)) ?? ""))
      : [...QUALIFICATION_RESET_APPLY_PSQL_ARGV, "-f", "[FILE]"],
    status: Object.prototype.hasOwnProperty.call(result || {}, "status") && Number.isInteger(result.status)
      ? result.status
      : null,
    stdout,
    stderr,
    originalStdout: stdoutRaw,
    originalStderr: stderrRaw,
    error,
    structuredError,
    signal: result?.signal ?? null,
    timeout: result?.timeout === true || result?.timedOut === true,
    thrown: result?.thrown === true,
  };
}

export function isProtocolDefinedTxObservationWhitespaceLine(line) {
  return typeof line === "string" && /^[ \t\r]*$/.test(line);
}

export function parseQualificationResetTxObservationStdout(stdout) {
  const raw = String(stdout ?? "");
  if (!raw.length) {
    return { ok: false, code: "F13_TX_OBSERVATION_FRAMING", observations: [], reason: "empty stdout" };
  }
  if (looksLikeAlignedPsqlFraming(raw)) {
    return { ok: false, code: "F13_TX_OBSERVATION_FRAMING", observations: [], reason: "aligned psql framing" };
  }
  const body = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
  if (!body.length) {
    return { ok: false, code: "F13_TX_OBSERVATION_FRAMING", observations: [], reason: "empty stdout" };
  }
  const lines = body.split("\n");
  const observations = [];
  for (const line of lines) {
    if (isProtocolDefinedTxObservationWhitespaceLine(line)) {
      continue;
    }
    const parsed = parseDuplicateKeySafeJson(`${line}\n`);
    if (!parsed.ok) {
      return {
        ok: false,
        code: parsed.parser_verdict === "duplicate_keys"
          ? "F13_TX_OBSERVATION_DUPLICATE_KEYS"
          : "F13_TX_OBSERVATION_FRAMING",
        observations,
        reason: parsed.reason || "observation line is not a single JSON object",
        truncated: /comm$/.test(line) || parsed.parser_verdict === "non-JSON",
      };
    }
    const rec = parsed.value;
    if (rec?.schema === TX_OBSERVATION_SCHEMA_F14) {
      return {
        ok: false,
        code: "F13_TX_OBSERVATION_SCHEMA",
        observations,
        reason: "f14 observation schema is retained only as a regression payload",
      };
    }
    if (rec?.schema !== TX_OBSERVATION_SCHEMA) {
      return {
        ok: false,
        code: "F13_TX_OBSERVATION_SCHEMA",
        observations,
        reason: "observation schema is not the F15 protocol",
      };
    }
    if (typeof rec.phase !== "string" || typeof rec.event !== "string") {
      return {
        ok: false,
        code: "F13_TX_OBSERVATION_INVALID",
        observations,
        reason: "phase and event are required strings",
      };
    }
    observations.push(rec);
  }
  if (observations.length === 0) {
    return {
      ok: false,
      code: "F13_TX_OBSERVATION_FRAMING",
      observations: [],
      reason: "no observation records",
    };
  }
  return { ok: true, observations };
}

export function authenticateTxObservationSequence(observations = []) {
  const expected = TX_OBSERVATION_SUCCESS_SEQUENCE;
  const validPhases = new Set(TRANSACTION_PHASES.map((phase) => phase.id));
  let rolledBack = false;
  for (let i = 0; i < observations.length; i += 1) {
    const obs = observations[i];
    if (!validPhases.has(obs.phase)) {
      return { ok: false, completeSuccess: false, reason: "invalid_phase", rolledBack: false };
    }
    if (obs.event === "rolled_back") {
      if (obs.rolledBack !== true) {
        return { ok: false, completeSuccess: false, reason: "invalid_rollback", rolledBack: false };
      }
      if (observations.slice(i + 1).some((row) => row.event === "committed")) {
        return { ok: false, completeSuccess: false, reason: "committed_after_rollback", rolledBack: false };
      }
      rolledBack = true;
      continue;
    }
    if (rolledBack) {
      return { ok: false, completeSuccess: false, reason: "observation_after_rollback", rolledBack: true };
    }
    if (i >= expected.length) {
      return { ok: false, completeSuccess: false, reason: "extra_observation", rolledBack: false };
    }
    const exp = expected[i];
    if (obs.phase !== exp.phase || obs.event !== exp.event) {
      return { ok: false, completeSuccess: false, reason: "missing_duplicate_or_reordered", rolledBack: false };
    }
    if (exp.committed === true) {
      if (obs.committed !== true) {
        return { ok: false, completeSuccess: false, reason: "commit_not_confirmed", rolledBack: false };
      }
      const prior = observations[i - 1];
      if (!prior || prior.phase !== "T7_COMMIT" || prior.event !== "commit_attempted") {
        return { ok: false, completeSuccess: false, reason: "committed_before_ack", rolledBack: false };
      }
    }
  }
  const seen = new Set(observations.map((obs) => `${obs.phase}:${obs.event}`));
  if (seen.size !== observations.filter((obs) => obs.event !== "rolled_back").length && !rolledBack) {
    return { ok: false, completeSuccess: false, reason: "duplicate_observation", rolledBack: false };
  }
  const completeSuccess = !rolledBack
    && observations.length === expected.length
    && observations.at(-1)?.event === "committed"
    && observations.at(-1)?.committed === true
    && observations.at(-2)?.event === "commit_attempted";
  return { ok: true, completeSuccess, rolledBack, prefix: observations.length < expected.length };
}

export function interpretQualificationResetTransportResult(processResult, { thrown = null } = {}) {
  const encoded = encodeProcessResult(
    thrown
      ? {
        status: processResult?.status ?? null,
        stdout: processResult?.stdout ?? "",
        stderr: processResult?.stderr ?? String(thrown.message || thrown),
        error: thrown,
        signal: processResult?.signal ?? null,
        timeout: processResult?.timeout === true,
        thrown: true,
        argv: processResult?.argv,
      }
      : processResult,
    processResult?.commandIdentity || GATED_PSQL_FILE_RENDERED,
  );
  const extracted = parseQualificationResetTxObservationStdout(encoded.stdout);
  const observations = extracted.observations || [];
  const sequence = authenticateTxObservationSequence(observations);
  const events = observations.map((obs) => obs.event);
  const phases = observations.map((obs) => obs.phase);
  const began = observations.some((obs) => obs.phase === "T1_BEGIN" && obs.event === "began");
  const mutateAttempted = observations.some((obs) => obs.phase === "T4_MUTATE" && obs.event === "mutate_attempted");
  const commitAttempted = observations.some((obs) => obs.phase === "T7_COMMIT" && obs.event === "commit_attempted");
  const committedObserved = sequence.completeSuccess === true
    && extracted.ok === true
    && observations.at(-1)?.phase === "T7_COMMIT"
    && observations.at(-1)?.event === "committed"
    && observations.at(-1)?.committed === true;
  const rollbackObserved = sequence.rolledBack === true
    || observations.some((obs) => obs.event === "rolled_back" && obs.rolledBack === true);
  const connectionLoss = UNCERTAIN_COMMIT_RE.test(`${encoded.stderr} ${encoded.error || ""} ${encoded.signal || ""}`)
    || /ECONNRESET/i.test(`${encoded.stderr} ${encoded.error || ""} ${thrown?.code || ""} ${thrown?.message || ""}`);
  const processErrorPresent = thrown != null
    || encoded.status !== 0
    || encoded.status == null
    || Boolean(encoded.signal)
    || encoded.timeout === true
    || Boolean(encoded.structuredError)
    || Boolean(encoded.error && String(encoded.error).trim());
  const processOk = !processErrorPresent;
  const truncatedCommit = extracted.truncated === true || (commitAttempted && !committedObserved);
  const uncertainCommit = !committedObserved && (
    truncatedCommit
    || (commitAttempted && (connectionLoss || encoded.timeout === true || encoded.signal || thrown))
    || (connectionLoss && /COMMIT/i.test(`${encoded.stderr} ${encoded.error || ""}`))
  );

  return {
    planned: { phases: TRANSACTION_PHASES.map((p) => p.id) },
    attempted: {
      processSpawned: true,
      status: encoded.status,
      signal: encoded.signal,
      timeout: encoded.timeout === true,
      thrown: thrown != null,
      processErrorPresent,
    },
    observed: {
      phases,
      events,
      observations,
      began,
      mutateAttempted,
      commitAttempted,
      committed: committedObserved,
      rolledBack: rollbackObserved,
      framingOk: extracted.ok === true,
      framingCode: extracted.ok === true ? null : (extracted.code || null),
      sequence,
    },
    committed: processOk && extracted.ok === true && committedObserved,
    rolledBack: rollbackObserved ? true : null,
    uncertainCommit,
    phaseReached: phases.at(-1) || null,
    processResult: encoded,
    fabricatedFromExitAlone: false,
  };
}

function emptySpies() {
  return {
    planCalls: 0,
    validateCalls: 0,
    captureCalls: 0,
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

function observationLine(phase, event, extra = {}) {
  return `${JSON.stringify({ schema: TX_OBSERVATION_SCHEMA, phase, event, ...extra })}\n`;
}

export function createDisabledQualificationResetTransportAdapter(script = {}) {
  return {
    kind: "disabled",
    disabled: true,
    failAt: script.failAt || null,
    inventoryAtTx: script.inventoryAtTx || null,
    sentinel: script.sentinel || { id: "storage.buckets", preserved: true },
    execute({ sql, plan, inventoryAtTx } = {}) {
      const argv = [...QUALIFICATION_RESET_APPLY_PSQL_ARGV, "-f", "[FILE]"];
      const base = {
        argv,
        error: null,
        signal: null,
        timeout: false,
      };
      const cascade = validateNoBroadCascade(sql || "");
      if (!cascade.ok) {
        return {
          ...base,
          status: 1,
          stdout: "",
          stderr: cascade.reason,
          error: cascade,
        };
      }
      const historyPred = validateHistorySqlPredicate(sql || "");
      if (!historyPred.ok) {
        return {
          ...base,
          status: 1,
          stdout: "",
          stderr: historyPred.reason,
          error: historyPred,
        };
      }
      const observedAtTx = inventoryAtTx || script.inventoryAtTx || plan?.observed;
      if (plan?.observed && observedAtTx && !sameObserved(plan.observed, snapshotObserved({
        observedObjects: observedAtTx.objects || observedAtTx.observedObjects,
        observedDependencies: observedAtTx.dependencies || observedAtTx.observedDependencies,
        observedHistoryRows: observedAtTx.history || observedAtTx.observedHistoryRows,
      }))) {
        return {
          ...base,
          status: 1,
          stdout: observationLine("T1_BEGIN", "began") + observationLine("T3_REVALIDATE", "revalidated"),
          stderr: "ERROR:  F13_STATE_CHANGED_BEFORE_TX",
          error: { code: "F13_STATE_CHANGED_BEFORE_TX" },
        };
      }
      const failAt = script.failAt;
      if (failAt === "throw_econnreset") {
        const err = new Error("read ECONNRESET");
        err.code = "ECONNRESET";
        err.syscall = "read";
        throw err;
      }
      if (failAt === "timeout") {
        return {
          ...base,
          status: null,
          stdout: observationLine("T1_BEGIN", "began") + observationLine("T4_MUTATE", "mutate_attempted") + observationLine("T7_COMMIT", "commit_attempted"),
          stderr: "timeout: psql terminated",
          timeout: true,
          signal: "SIGTERM",
          error: { code: "ETIMEDOUT", message: "timeout during COMMIT" },
        };
      }
      if (failAt === "truncated") {
        return {
          ...base,
          status: 0,
          stdout: observationLine("T1_BEGIN", "began")
            + observationLine("T7_COMMIT", "commit_attempted")
            + `{"schema":"${TX_OBSERVATION_SCHEMA}","phase":"T7_COMMIT","event":"comm`,
          stderr: "",
        };
      }
      if (failAt === "rollback_observed") {
        return {
          ...base,
          status: 1,
          stdout: observationLine("T1_BEGIN", "began")
            + observationLine("T4_MUTATE", "mutate_attempted")
            + observationLine("T4_MUTATE", "rolled_back", { rolledBack: true }),
          stderr: "ERROR:  F13_RESET_SQL_FAILED",
          error: { code: "F13_RESET_SQL_FAILED" },
        };
      }
      if (failAt === "success_status_only") {
        return {
          ...base,
          status: 0,
          stdout: "COMMIT\n",
          stderr: "",
        };
      }
      if (failAt === "before_mutation" || failAt === "T0_BIND") {
        return {
          ...base,
          status: 1,
          stdout: "",
          stderr: "ERROR:  F13_FAILURE_BEFORE_MUTATION",
          error: { code: "F13_FAILURE_BEFORE_MUTATION" },
        };
      }
      if (failAt === "after_begin" || failAt === "T1_BEGIN" || failAt === "T2_LOCK" || failAt === "T3_REVALIDATE") {
        return {
          ...base,
          status: 1,
          stdout: observationLine("T1_BEGIN", "began") + observationLine("T3_REVALIDATE", "revalidated"),
          stderr: "ERROR:  F13_FAILURE_AFTER_BEGIN",
          error: { code: "F13_FAILURE_AFTER_BEGIN" },
        };
      }
      if (failAt === "affected_row" || failAt === "T5_AFFECTED") {
        return {
          ...base,
          status: 1,
          stdout: observationLine("T1_BEGIN", "began") + observationLine("T4_MUTATE", "mutate_attempted"),
          stderr: "ERROR:  F13_AFFECTED_ROW_MISMATCH",
          error: { code: "F13_AFFECTED_ROW_MISMATCH" },
        };
      }
      if (failAt === "final" || failAt === "T6_FINAL") {
        return {
          ...base,
          status: 1,
          stdout: observationLine("T1_BEGIN", "began") + observationLine("T4_MUTATE", "mutate_attempted"),
          stderr: "ERROR:  F13_FINAL_BASELINE_FAILED",
          error: { code: "F13_FINAL_BASELINE_FAILED" },
        };
      }
      if (failAt === "sql_failure") {
        return {
          ...base,
          status: 1,
          stdout: observationLine("T1_BEGIN", "began"),
          stderr: "ERROR:  syntax error at or near \"NOT_A_COMMAND\"",
          error: { code: "F13_RESET_SQL_FAILED" },
        };
      }
      if (failAt === "uncertain_commit" || failAt === "T7_COMMIT") {
        return {
          ...base,
          status: 1,
          stdout: observationLine("T1_BEGIN", "began")
            + observationLine("T4_MUTATE", "mutate_attempted")
            + observationLine("T7_COMMIT", "commit_attempted"),
          stderr: "psql: error: connection to server was lost during COMMIT 08006",
          error: { code: "08006", message: "connection to server was lost during COMMIT" },
        };
      }
      if (script.replayed === true) {
        return {
          ...base,
          status: 1,
          stdout: observationLine("T7_COMMIT", "commit_attempted"),
          stderr: "replay attempted",
          replayed: true,
        };
      }
      return {
        ...base,
        status: 0,
        stdout: observationLine("T1_BEGIN", "began")
          + observationLine("T2_LOCK", "locked")
          + observationLine("T3_REVALIDATE", "revalidated")
          + observationLine("T4_MUTATE", "mutate_attempted")
          + observationLine("T5_AFFECTED", "affected_checked")
          + observationLine("T6_FINAL", "final_ok")
          + observationLine("T7_COMMIT", "commit_attempted")
          + observationLine("T7_COMMIT", "committed", { committed: true }),
        stderr: "",
      };
    },
  };
}

export function createLocalFixtureQualificationResetTransportAdapter({
  url,
  workdir,
} = {}) {
  return {
    kind: "local-fixture-psql",
    disabled: false,
    localFixtureRoutingOnly: true,
    notProductionBypass: true,
    execute({ sql } = {}) {
      if (!url) {
        throw Object.assign(new Error("local fixture URL is required"), {
          code: "F13_LOCAL_FIXTURE_URL_REQUIRED",
        });
      }
      if (!workdir) {
        throw Object.assign(new Error("isolated workdir is required for local qualification reset"), {
          code: "F13_WORKDIR_REQUIRED",
        });
      }
      const abs = writeGatedSqlFile(workdir, "f15-qualification-reset.sql", sql);
      const extra = ["-t", "-A", "-w", "-f", abs];
      const spawned = spawnLocalPsqlSync(url, extra, { role: "work" });
      const res = spawned.result || {};
      return {
        commandIdentity: "local-fixture-psql-file",
        argv: [...QUALIFICATION_RESET_APPLY_PSQL_ARGV, "-f", abs],
        status: Object.prototype.hasOwnProperty.call(res, "status") ? res.status : null,
        stdout: res.stdout || "",
        stderr: res.stderr || "",
        signal: res.signal || null,
        timeout: res.timeout === true,
        error: res.error || null,
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
      const abs = writeGatedSqlFile(workdir, "f13-qualification-reset.sql", sql);
      const argv = [...QUALIFICATION_RESET_APPLY_PSQL_ARGV, "-f", abs];
      const res = spawnGatedRemotePsqlSync(argv);
      return {
        commandIdentity: GATED_PSQL_FILE_RENDERED,
        argv,
        status: res.status,
        stdout: res.stdout || "",
        stderr: res.stderr || "",
        signal: res.signal || null,
        timeout: res.timeout === true,
        error: res.error || null,
      };
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
  if (plan.alreadyClean === true) {
    return {
      ok: true,
      executed: false,
      committed: false,
      mutation: false,
      alreadyClean: true,
      eligible: false,
      verdict: F13_RESET_ALREADY_CLEAN_VERDICT,
      code: plan.code || "F13_RESET_ALREADY_CLEAN",
      reason: plan.reason,
      label: F13_RUNTIME_LABEL,
      phase: F13_RUNTIME_PHASE,
      wipeToBaselineRejected: true,
      wipeRejectionCode: F13_WIPE_REJECTION_CODE,
      automaticReplay: false,
      replayCalls: 0,
      spies,
      plan,
      events: recorder.events || recorder.snapshot?.() || [],
      sharedOrchestration: F13_SHARED_ORCHESTRATION_ID,
    };
  }
  if (plan.eligible !== true) {
    return failRun("F13_RESET_NOT_ELIGIBLE", plan.reason || "Reset is not eligible", { plan });
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
      status: null,
      stdout: "",
      stderr: String(err?.message || err),
      error: err,
      signal: null,
      timeout: false,
    };
  }

  spies.transportCalls += 1;
  spies.applyCalls += 1;
  spies.sqlCalls += 1;

  const interpreted = interpretQualificationResetTransportResult(raw, { thrown });
  const encoded = interpreted.processResult;
  if (interpreted.observed.began) spies.beginObserved += 1;
  if (interpreted.observed.mutateAttempted) spies.mutateAttempted += 1;
  if (interpreted.observed.commitAttempted || interpreted.uncertainCommit) spies.commitAttempted += 1;
  if (interpreted.rolledBack === true) spies.rollbackObserved += 1;

  recordEvent(recorder, "qualification_reset_completed", {
    phase: "qualification_reset",
    processResult: encoded,
    transportInterpretation: {
      planned: interpreted.planned,
      attempted: interpreted.attempted,
      observed: interpreted.observed,
      committed: interpreted.committed,
      rolledBack: interpreted.rolledBack,
      uncertainCommit: interpreted.uncertainCommit,
    },
  });
  spies.completedAfterAwait = true;

  if (raw?.replayed === true) {
    spies.replayCalls += 1;
    return failRun("F13_AUTOMATIC_REPLAY_FORBIDDEN", "Uncertain commit must not automatically replay", {
      plan,
      processResult: encoded,
      transportInterpretation: interpreted,
    });
  }

  if (interpreted.uncertainCommit) {
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
      verdict: "HOLD",
      spies,
      plan,
      processResult: encoded,
      transportInterpretation: interpreted,
      events: recorder.events || [],
    };
  }

  if (thrown || encoded.status !== 0 || encoded.status == null) {
    const sqlCode = raw?.error?.code && String(raw.error.code).startsWith("F13_")
      ? raw.error.code
      : (thrown?.code && String(thrown.code).startsWith("F13_") ? thrown.code : "F13_RESET_SQL_FAILED");
    return failRun(sqlCode, encoded.stderr || thrown?.message || "Qualification reset SQL failed", {
      executed: true,
      rolledBack: interpreted.rolledBack,
      processResult: encoded,
      transportInterpretation: interpreted,
      plan,
      verdict: "HOLD",
    });
  }

  if (interpreted.committed !== true) {
    return failRun("F13_RESET_NOT_COMMITTED", "Transport returned success without a confirmed commit observation", {
      executed: true,
      processResult: encoded,
      transportInterpretation: interpreted,
      plan,
      verdict: "HOLD",
    });
  }

  spies.commitConfirmed += 1;
  spies.committedEffects += 1;
  return {
    ok: true,
    executed: true,
    committed: true,
    mutation: true,
    alreadyClean: false,
    eligible: true,
    verdict: F13_RESET_SUCCESS_VERDICT,
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
    transportInterpretation: interpreted,
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

function resolveQualificationResetCaptureBody(raw) {
  if (raw == null) {
    return {
      ok: false,
      inventoryCaptured: false,
      code: F13_INVENTORY_CAPTURE_REQUIRED,
      reason: "Qualification reset inventory capture is missing",
    };
  }
  if (typeof raw === "object" && !Array.isArray(raw) && Object.prototype.hasOwnProperty.call(raw, "status")) {
    return parseQualificationResetInventoryProcessResult(raw);
  }
  if (typeof raw === "string" || Buffer.isBuffer(raw)) {
    return parseQualificationResetInventoryProcessResult({
      status: 0,
      stdout: raw,
      stderr: "",
      signal: null,
      timeout: false,
    });
  }
  if (typeof raw === "object" && !Array.isArray(raw) && raw.body != null && raw.status != null) {
    return parseQualificationResetInventoryProcessResult(raw);
  }
  return validateQualificationResetInventoryBody(raw);
}

export function qualificationResetInventoryCaptureRequest() {
  return {
    sql: QUALIFICATION_RESET_INVENTORY_CAPTURE_SQL,
    inventoryCaptureSql: INVENTORY_CAPTURE_SQL,
    qualificationResetInventoryCaptureSql: QUALIFICATION_RESET_INVENTORY_CAPTURE_SQL,
    inventoryCaptureSqlArtifact: F13_INVENTORY_CAPTURE_SQL_ARTIFACT,
  };
}

export async function captureQualificationResetInventory({
  captureInventory,
  adapters = {},
  workdir,
  allowLiveCapture = false,
} = {}) {
  const request = qualificationResetInventoryCaptureRequest();
  const captureFn = typeof captureInventory === "function"
    ? captureInventory
    : typeof adapters.captureInventory === "function"
      ? adapters.captureInventory
      : null;
  if (typeof captureFn === "function") {
    let raw;
    try {
      raw = await captureFn(request);
    } catch (err) {
      return {
        ok: false,
        inventoryCaptured: false,
        code: F13_INVENTORY_CAPTURE_REQUIRED,
        reason: err?.message || "Qualification reset inventory capture failed",
        captureSqlWired: true,
        inventoryCaptureSqlArtifact: F13_INVENTORY_CAPTURE_SQL_ARTIFACT,
      };
    }
    const resolved = resolveQualificationResetCaptureBody(raw);
    if (!resolved.ok) {
      return {
        ...resolved,
        inventoryCaptured: false,
        captureSqlWired: true,
        inventoryCaptureSqlArtifact: F13_INVENTORY_CAPTURE_SQL_ARTIFACT,
      };
    }
    const observed = observedFromQualificationResetCapture(resolved.body || raw);
    return {
      ...observed,
      captureSqlWired: true,
      inventoryCaptureSqlArtifact: F13_INVENTORY_CAPTURE_SQL_ARTIFACT,
    };
  }
  if (allowLiveCapture !== true) {
    return {
      ok: false,
      inventoryCaptured: false,
      code: F13_INVENTORY_CAPTURE_REQUIRED,
      reason: "Qualification reset refuses hardcoded empty inventory; capture observed objects/deps/history first",
      captureSqlWired: true,
      inventoryCaptureSqlArtifact: F13_INVENTORY_CAPTURE_SQL_ARTIFACT,
    };
  }
  if (!workdir) {
    return {
      ok: false,
      inventoryCaptured: false,
      code: F13_INVENTORY_CAPTURE_REQUIRED,
      reason: "isolated workdir is required for live qualification-reset inventory capture",
      captureSqlWired: true,
      inventoryCaptureSqlArtifact: F13_INVENTORY_CAPTURE_SQL_ARTIFACT,
    };
  }
  try {
    assertDbPushGates({ optIn: true });
    const abs = writeGatedSqlFile(workdir, "f13-qualification-reset-inventory.sql", QUALIFICATION_RESET_INVENTORY_CAPTURE_SQL);
    const command = buildQualificationResetInventoryPsqlCommand({ sqlFile: abs });
    const raw = spawnGatedRemotePsqlSync(command.argv);
    const resolved = parseQualificationResetInventoryProcessResult({
      status: raw.status,
      stdout: raw.stdout || "",
      stderr: raw.stderr || "",
      signal: raw.signal || null,
      timeout: raw.timeout === true,
      argv: command.argv,
    });
    if (!resolved.ok) {
      return {
        ...resolved,
        inventoryCaptured: false,
        captureSqlWired: true,
        inventoryCaptureSqlArtifact: F13_INVENTORY_CAPTURE_SQL_ARTIFACT,
        captureCommand: command,
      };
    }
    const observed = observedFromQualificationResetCapture(resolved.body);
    return {
      ...observed,
      captureSqlWired: true,
      inventoryCaptureSqlArtifact: F13_INVENTORY_CAPTURE_SQL_ARTIFACT,
      captureCommand: command,
    };
  } catch (err) {
    return {
      ok: false,
      inventoryCaptured: false,
      code: F13_INVENTORY_CAPTURE_REQUIRED,
      reason: err?.message || "Qualification reset inventory capture failed",
      captureSqlWired: true,
      inventoryCaptureSqlArtifact: F13_INVENTORY_CAPTURE_SQL_ARTIFACT,
    };
  }
}

/**
 * Qualify-main --qualification-reset path: capture inventory first, then
 * plan / emit / execute. Observed objects, deps, and history come from
 * INVENTORY_CAPTURE_SQL / QUALIFICATION_RESET_INVENTORY_CAPTURE_SQL — never
 * hardcoded []. alreadyClean is a no-mutation path. leftover requires
 * eligible===true. Successful authorized reset is CLEAN_BASELINE, not HOLD.
 */
export async function runQualificationResetQualifyPath({
  authorization,
  runtimeContext,
  target,
  workdir,
  captureInventory,
  adapters = {},
  allowDisabledTransport = false,
  allowLiveCapture = false,
  recorder,
  onAfterStarted,
} = {}) {
  const captured = await captureQualificationResetInventory({
    captureInventory,
    adapters,
    workdir,
    allowLiveCapture,
  });
  const captureSpies = emptySpies();
  captureSpies.captureCalls += 1;
  if (!captured.ok || captured.inventoryCaptured !== true) {
    return {
      ...fail(
        captured.code || F13_INVENTORY_CAPTURE_REQUIRED,
        captured.reason || "Qualification reset inventory capture is required before plan/emit/execute",
      ),
      spies: captureSpies,
      inventoryCaptured: false,
      captureComplete: false,
      captureSqlWired: captured.captureSqlWired === true,
      inventoryCaptureSqlArtifact: F13_INVENTORY_CAPTURE_SQL_ARTIFACT,
      verdict: "HOLD",
    };
  }

  const input = {
    authorization,
    runtimeContext,
    target,
    workdir,
    observedObjects: captured.observedObjects,
    observedDependencies: captured.observedDependencies,
    observedHistoryRows: captured.observedHistoryRows,
    inventory: captured.inventory || null,
    inventoryCaptured: true,
    captureComplete: captured.captureComplete === true,
    inventoryAtTx: {
      observedObjects: captured.observedObjects,
      observedDependencies: captured.observedDependencies,
      observedHistoryRows: captured.observedHistoryRows,
    },
  };

  const result = await runQualificationReset({
    input,
    adapters: { ...adapters, workdir: adapters.workdir || workdir },
    recorder: recorder || createQualificationResetRecorder(),
    allowDisabledTransport,
    onAfterStarted,
  });

  return {
    ...result,
    inventoryCaptured: true,
    captureComplete: captured.captureComplete === true,
    captureSqlWired: true,
    inventoryCaptureSqlArtifact: F13_INVENTORY_CAPTURE_SQL_ARTIFACT,
    observedFromCapture: {
      observedObjects: captured.observedObjects,
      observedDependencies: captured.observedDependencies,
      observedHistoryRows: captured.observedHistoryRows,
    },
    spies: {
      ...(result.spies || emptySpies()),
      captureCalls: captureSpies.captureCalls,
    },
    verdict: result.ok === true
      ? (result.verdict || F13_RESET_SUCCESS_VERDICT)
      : (result.verdict && result.verdict !== F13_RESET_SUCCESS_VERDICT
        ? result.verdict
        : "HOLD"),
  };
}

function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function gitBlobSha1(buf) {
  const header = Buffer.from(`blob ${buf.length}\0`, "utf8");
  return createHash("sha1").update(Buffer.concat([header, buf])).digest("hex");
}

function fileByteIdentities(rel, repoRoot = DEFAULT_REPO_ROOT) {
  const abs = path.join(repoRoot, rel);
  const worktree = fs.readFileSync(abs);
  const crlf = worktree.includes(0x0d);
  return {
    path: rel,
    worktreeSha256: sha256Bytes(worktree),
    executedByteSha256: sha256Bytes(worktree),
    gitBlobSha1: gitBlobSha1(worktree),
    bytes: worktree.byteLength,
    crlfDetected: crlf,
    crlfNormalizedForPass: false,
  };
}

export function publishQualificationResetClosures({
  repoRoot = DEFAULT_REPO_ROOT,
} = {}) {
  const runtime = buildFunctionalRecursiveRuntimeClosure({
    entrypoint: "scripts/qualify-f3-db-push-disposable.mjs",
  });
  const runtimeFiles = [...runtime.files];
  const unionSet = new Set(runtimeFiles);
  for (const rel of QUALIFICATION_RESET_VERIFICATION_ONLY_FILES) {
    unionSet.add(rel);
  }
  const unionFiles = [...unionSet].sort();
  const sourceSha256 = {};
  const identities = {};
  for (const rel of unionFiles) {
    const id = fileByteIdentities(rel, repoRoot);
    sourceSha256[rel] = id.worktreeSha256;
    identities[rel] = id;
  }
  const digestOf = (files) => sha256Bytes(Buffer.from(files.map((rel) => `${rel}:${sourceSha256[rel]}`).join("\n"), "utf8"));
  const helperInRuntime = runtimeFiles.includes(QUALIFICATION_RESET_LOCAL_PROOF_HELPER_RELPATH);
  return {
    runtime: {
      label: F13_F15_RUNTIME_CLOSURE_LABEL,
      notSummaryFileHash: true,
      forbiddenSummaryHash: F13_SUMMARY_FILE_HASH_FORBIDDEN,
      entrypoint: "scripts/qualify-f3-db-push-disposable.mjs",
      count: runtimeFiles.length,
      sha256: runtime.closure_sha256,
      files: runtimeFiles,
      proofHelperIncludedBecauseRead: helperInRuntime,
    },
    completeVerificationUnion: {
      label: F13_F15_VERIFICATION_UNION_LABEL,
      notSummaryFileHash: true,
      count: unionFiles.length,
      sha256: digestOf(unionFiles),
      files: unionFiles,
      verificationOnly: QUALIFICATION_RESET_VERIFICATION_ONLY_FILES.filter((rel) => !runtimeFiles.includes(rel)),
      proofHelperIncluded: unionFiles.includes(QUALIFICATION_RESET_LOCAL_PROOF_HELPER_RELPATH),
    },
    identities: {
      gitBlob: "gitBlobSha1",
      workingTree: "worktreeSha256",
      executedByte: "executedByteSha256",
      files: identities,
    },
    crlf: {
      detected: Object.values(identities).some((id) => id.crlfDetected),
      normalizedForPass: false,
      policy: "byte-exact; CRLF is a distinct identity and is never normalized to obtain PASS",
    },
    f13BaselineCitedNotExpected: {
      runtime: F13_BASELINE_RUNTIME_CLOSURE,
      union: F13_BASELINE_VERIFICATION_UNION,
    },
    f14BaselineCitedNotExpected: {
      runtime: F14_BASELINE_RUNTIME_CLOSURE,
      union: F14_BASELINE_VERIFICATION_UNION,
    },
  };
}
