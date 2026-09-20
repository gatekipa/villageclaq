/**
 * Pre-stub-floor clean-check for the hosted disposable.
 *
 * Chief 2026-09-13 on jkorwnwwmdeflfntxntl:
 *   clean_ok=true, residuals=[], public tables 0, migrations [],
 *   schema_migrations rows 0, F3 absent, matches post-wipe baseline.
 *
 * Do NOT wipe. If this check fails → HOLD, no floor, no db push.
 * Not a clean 00001–00117 replay. Not production-equivalent.
 *
 * F22 adds a parallel policy-scoped preserve-baseline gate. Historical
 * evaluatePreStubFloorCleanCheck / CLEAN_BASELINE behavior is unchanged.
 */
import { QUALIFICATION_FLOOR_LABEL } from "./f3-db-push-stub-live-pin-floor.mjs";
import {
  FAILED_FLOOR_STORAGE_BUCKETS,
  FAILED_FLOOR_STORAGE_POLICY_NAMES,
  F21_RESET_PRESERVE_BASELINE_VERDICT,
  asList,
  classifyInventory,
  evaluateQualificationResetPreserveBaseline,
  isCleanBaseline,
  observedFromQualificationResetCapture,
} from "./f3-db-push-inventory.mjs";
import { inventoryFromQuery } from "./f3-db-push-query-parse.mjs";
import {
  APPROVED_DISPOSABLE_PROJECT_REF,
  PRODUCTION_REF,
  RECOGNITION_ALLOWLIST,
} from "./f3-db-push-pins.mjs";
import {
  F21_MEMBERSHIP_POLICY_ID,
  F21_QUALIFICATION_RESET_INVENTORY_SCHEMA,
  F20_HISTORICAL_INVENTORY_SCHEMA,
} from "./f3-db-push-qualification-reset-design.mjs";

export const PRE_STUB_FLOOR_CLEAN_CHECK_ARTIFACT = "06-pre-stub-floor-clean-check";

export const PRE_STUB_FLOOR_CLEAN_CHECK_HOLD =
  "HOLD: disposable is not the post-wipe clean baseline; do not wipe; do not install stub+live-pin floor; do not db push";

export const CHIEF_06_PRE_STUB_FLOOR_CLEAN_CHECK = Object.freeze({
  clean_ok: true,
  residuals: Object.freeze([]),
  public_tables: 0,
  migrations: Object.freeze([]),
  schema_migrations_rows: 0,
  f3_absent: true,
  matches_post_wipe_baseline: true,
  do_not_wipe: true,
});

function asHistoryList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (row == null) return "";
      if (typeof row === "string") return row;
      const version = row.version ?? row.Version ?? "";
      const name = row.name ?? row.Name ?? "";
      return name ? `${version}:${name}` : String(version);
    })
    .filter((s) => s !== "");
}

export function passingPreStubFloorCleanInventory() {
  return {
    public_tables: [],
    public_views: [],
    public_types: [],
    public_functions: [],
    schema_migrations_present: true,
    schema_migrations_rows: 0,
    unnest_uuid_shim: false,
    financial_core: false,
    financial_private: false,
    financial_ledger_epochs: false,
    exchange_rates: false,
    auth_handle_new_user_trigger: false,
    organizations_base_country: false,
    groups_group_level: false,
    committees_budget_allocation: false,
  };
}

export const INCOMPLETE_WIPE_RESIDUAL_CLEANUP_NOTE =
  "incomplete prior wipe residuals: the 10 named FAILED_FLOOR_STORAGE_POLICY_NAMES (+ empty floor buckets avatars/group-documents/receipts if safe) may be dropped narrowly. Not --wipe-to-baseline. Not blocking when public/history/F3 match Chief 06.";

export function evaluatePreStubFloorCleanCheck({
  inventory,
  historyRows = [],
  listMigrations = [],
} = {}) {
  const inv = inventoryFromQuery(inventory);
  const classification = classifyInventory(inv);
  const publicTables = asList(inv.public_tables);
  const publicViews = asList(inv.public_views);
  const migrations = asHistoryList(listMigrations);
  const history = asHistoryList(historyRows);
  const schemaRows = Number(inv.schema_migrations_rows ?? 0);
  const f3Absent =
    inv.financial_core !== true &&
    inv.financial_private !== true &&
    inv.financial_ledger_epochs !== true &&
    classification.financialPresent !== true;
  const leftoverStoragePolicies = asList(inv.storage_policies).filter((p) =>
    FAILED_FLOOR_STORAGE_POLICY_NAMES.includes(p),
  );
  const leftoverFloorBuckets = asList(inv.storage_buckets).filter((b) =>
    FAILED_FLOOR_STORAGE_BUCKETS.includes(b),
  );

  const residuals = [];
  if (publicTables.length) residuals.push({ kind: "public_table", names: publicTables });
  if (publicViews.length) residuals.push({ kind: "public_view", names: publicViews });
  if (classification.failedTables?.length) {
    residuals.push({ kind: "failed_floor_table", names: classification.failedTables });
  }
  if (classification.extraTables?.length) {
    residuals.push({ kind: "extra_public_table", names: classification.extraTables });
  }
  if (classification.failedFunctions?.length) {
    residuals.push({ kind: "failed_floor_function", names: classification.failedFunctions });
  }
  if (classification.unnestShim) residuals.push({ kind: "unnest_uuid_shim", names: ["public.unnest(uuid)"] });
  if (!f3Absent) residuals.push({ kind: "financial_object", names: ["financial_*"] });
  if (schemaRows > 0) residuals.push({ kind: "schema_migrations_rows", names: [String(schemaRows)] });
  if (history.length) residuals.push({ kind: "schema_migrations_history", names: history });
  if (migrations.length) residuals.push({ kind: "list_migrations", names: migrations });
  if (classification.extraStoragePolicies?.length) {
    residuals.push({ kind: "extra_storage_policy", names: classification.extraStoragePolicies });
  }

  const uniqueResiduals = [];
  const seen = new Set();
  for (const row of residuals) {
    const key = `${row.kind}:${(row.names || []).join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueResiduals.push(row);
  }

  const matchesPostWipe =
    isCleanBaseline(classification) &&
    publicTables.length === 0 &&
    schemaRows === 0 &&
    history.length === 0 &&
    migrations.length === 0 &&
    f3Absent &&
    inv.unnest_uuid_shim !== true;

  const clean_ok = matchesPostWipe && uniqueResiduals.length === 0;

  return {
    artifact: PRE_STUB_FLOOR_CLEAN_CHECK_ARTIFACT,
    clean_ok,
    residuals: uniqueResiduals,
    residual_cleanup: {
      storage_policies: leftoverStoragePolicies,
      storage_buckets: leftoverFloorBuckets,
      blocking: false,
      drop_narrowly: leftoverStoragePolicies.length > 0 || leftoverFloorBuckets.length > 0,
      wipe_to_baseline: false,
      note: INCOMPLETE_WIPE_RESIDUAL_CLEANUP_NOTE,
    },
    public_tables: publicTables.length,
    public_tables_list: publicTables,
    migrations,
    schema_migrations_rows: schemaRows,
    schema_migrations_history: history,
    f3_absent: f3Absent,
    matches_post_wipe_baseline: matchesPostWipe,
    do_not_wipe: true,
    classification_verdict: classification.verdict,
    label: QUALIFICATION_FLOOR_LABEL,
    recognition: [...RECOGNITION_ALLOWLIST],
    hold: clean_ok ? null : PRE_STUB_FLOOR_CLEAN_CHECK_HOLD,
  };
}

export function assertPreStubFloorCleanCheck(result) {
  if (!result?.clean_ok) {
    const err = new Error(result?.hold || PRE_STUB_FLOOR_CLEAN_CHECK_HOLD);
    err.code = "F3_PRE_STUB_FLOOR_CLEAN_CHECK_HOLD";
    err.cleanCheck = result;
    throw err;
  }
  return result;
}

export function matchesChief06CleanCheck(result) {
  return (
    result?.clean_ok === CHIEF_06_PRE_STUB_FLOOR_CLEAN_CHECK.clean_ok &&
    Array.isArray(result?.residuals) &&
    result.residuals.length === 0 &&
    result.public_tables === 0 &&
    Array.isArray(result?.migrations) &&
    result.migrations.length === 0 &&
    result.schema_migrations_rows === 0 &&
    result.f3_absent === true &&
    result.matches_post_wipe_baseline === true &&
    result.do_not_wipe === true
  );
}

export const F22_PRESERVE_BASELINE_PRE_FLOOR_GATE = "F22_PRESERVE_BASELINE_PRE_FLOOR_GATE";
export const F22_PRESERVE_BASELINE_PRE_FLOOR_HOLD =
  "HOLD: preserve-baseline pre-floor gate did not authenticate current database; do not wipe; do not install stub+live-pin floor; do not db push";
export const F21_PRESERVE_BASELINE_STALE_AUTHORIZATION = "F21_PRESERVE_BASELINE_STALE_AUTHORIZATION";
export const F21_PRESERVE_BASELINE_POLICY_UNSUPPORTED = "F21_PRESERVE_BASELINE_POLICY_UNSUPPORTED";
export const F21_PRESERVE_BASELINE_TARGET_REJECTED = "F21_PRESERVE_BASELINE_TARGET_REJECTED";
export const F21_PRESERVE_BASELINE_FRESH_CAPTURE_REQUIRED = "F21_PRESERVE_BASELINE_FRESH_CAPTURE_REQUIRED";
export const F21_PRESERVE_BASELINE_UNSUPPORTED_SCHEMA = "F21_PRESERVE_BASELINE_UNSUPPORTED_SCHEMA";

const SUPPORTED_PRESERVE_POLICIES = Object.freeze([
  F21_RESET_PRESERVE_BASELINE_VERDICT,
  F21_MEMBERSHIP_POLICY_ID,
]);

function failPreFloor(code, reason, extra = {}) {
  return {
    ok: false,
    allowFloor: false,
    allowMigration: false,
    preserveBaseline: false,
    cleanBaseline: false,
    verdict: "HOLD",
    code,
    reason,
    hold: reason || F22_PRESERVE_BASELINE_PRE_FLOOR_HOLD,
    do_not_wipe: true,
    trustedPreviousResetRecord: false,
    trustedVerdictStringAlone: false,
    strippedUnexpectedObjects: false,
    globallyAllowedExtensionLikeNames: false,
    ...extra,
  };
}

function targetRefOf(target) {
  if (target == null) return "";
  if (typeof target === "string") return target;
  return String(
    target.ref
    || target.project_ref
    || target.projectRef
    || target.approved_disposable_project_ref
    || "",
  );
}

export function authenticatePreFloorTarget(target = {}) {
  const ref = targetRefOf(target);
  const host = String(target.host || target.hostname || "");
  const url = String(target.url || target.dbUrl || "");
  if (ref === PRODUCTION_REF || host.includes(PRODUCTION_REF) || url.includes(PRODUCTION_REF)) {
    return failPreFloor(
      F21_PRESERVE_BASELINE_TARGET_REJECTED,
      "production target llbnliixczcqfftxpsmb is rejected before floor preparation",
      { targetRef: ref || PRODUCTION_REF },
    );
  }
  const localFixture = target.localFixture === true
    && target.localFixtureRoutingOnly === true
    && target.notProductionBypass === true;
  if (ref === APPROVED_DISPOSABLE_PROJECT_REF) {
    return {
      ok: true,
      targetRef: APPROVED_DISPOSABLE_PROJECT_REF,
      localFixture,
      hostedIdentityProof: localFixture !== true,
    };
  }
  if (localFixture && ref) {
    return {
      ok: true,
      targetRef: ref,
      localFixture: true,
      hostedIdentityProof: false,
    };
  }
  return failPreFloor(
    F21_PRESERVE_BASELINE_TARGET_REJECTED,
    "pre-floor target is not the approved disposable or a documented local-fixture substitution",
    { targetRef: ref || null },
  );
}

export function authenticatePreFloorPolicy(policy) {
  if (SUPPORTED_PRESERVE_POLICIES.includes(policy)) {
    return {
      ok: true,
      policy: F21_RESET_PRESERVE_BASELINE_VERDICT,
      membershipPolicyId: F21_MEMBERSHIP_POLICY_ID,
    };
  }
  return failPreFloor(
    F21_PRESERVE_BASELINE_POLICY_UNSUPPORTED,
    "unsupported pre-floor policy; QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1 is required for the preserve path",
    { policy: policy ?? null },
  );
}

function resolveFreshPreserveCapture({
  capture = null,
  observedObjects = null,
  observedDependencies = null,
  observedHistoryRows = null,
  inventory = null,
  inventoryCaptured = false,
  captureComplete = false,
  captureSchema = null,
} = {}) {
  if (inventoryCaptured !== true || captureComplete !== true) {
    return failPreFloor(
      F21_PRESERVE_BASELINE_FRESH_CAPTURE_REQUIRED,
      "preserve-baseline pre-floor gate requires a fresh current-database capture; a previous reset-success record cannot authenticate current database",
    );
  }
  if (capture != null && typeof capture === "object" && !Array.isArray(capture)) {
    if (capture.ok === false) {
      return failPreFloor(
        capture.code || F21_PRESERVE_BASELINE_FRESH_CAPTURE_REQUIRED,
        capture.reason || "fresh preserve-baseline capture failed",
        { captureCode: capture.code || null },
      );
    }
    if (Array.isArray(capture.observedObjects) && capture.inventoryCaptured === true) {
      if (capture.captureSchema && capture.captureSchema !== F21_QUALIFICATION_RESET_INVENTORY_SCHEMA) {
        return failPreFloor(
          F21_PRESERVE_BASELINE_UNSUPPORTED_SCHEMA,
          "fresh capture schema is not f21-qualification-reset-inventory-v1",
          { captureSchema: capture.captureSchema },
        );
      }
      return {
        ok: true,
        observedObjects: capture.observedObjects,
        observedDependencies: Array.isArray(capture.observedDependencies) ? capture.observedDependencies : [],
        observedHistoryRows: Array.isArray(capture.observedHistoryRows) ? capture.observedHistoryRows : [],
        inventory: capture.inventory ?? inventory,
        captureSchema: capture.captureSchema || F21_QUALIFICATION_RESET_INVENTORY_SCHEMA,
      };
    }
    if (Object.prototype.hasOwnProperty.call(capture, "discovered_objects")
      || Object.prototype.hasOwnProperty.call(capture, "schema")) {
      if (capture.schema === F20_HISTORICAL_INVENTORY_SCHEMA
        || capture.schema === "f13-qualification-reset-inventory-v1") {
        return failPreFloor(
          F21_PRESERVE_BASELINE_UNSUPPORTED_SCHEMA,
          "stale F13/F20 inventory schema cannot authorize preserve-baseline floor preparation",
          { captureSchema: capture.schema },
        );
      }
      const observed = observedFromQualificationResetCapture(capture);
      if (!observed.ok) {
        return failPreFloor(
          observed.code || F21_PRESERVE_BASELINE_FRESH_CAPTURE_REQUIRED,
          observed.reason || "fresh capture body is not an authenticated preserve-baseline inventory",
        );
      }
      return {
        ok: true,
        observedObjects: observed.observedObjects,
        observedDependencies: observed.observedDependencies,
        observedHistoryRows: observed.observedHistoryRows,
        inventory: observed.inventory,
        captureSchema: observed.captureSchema,
      };
    }
  }
  if (!Array.isArray(observedObjects) || inventory == null) {
    return failPreFloor(
      F21_PRESERVE_BASELINE_FRESH_CAPTURE_REQUIRED,
      "preserve-baseline pre-floor gate requires typed current-inventory membership arrays",
    );
  }
  if (captureSchema && captureSchema !== F21_QUALIFICATION_RESET_INVENTORY_SCHEMA) {
    return failPreFloor(
      F21_PRESERVE_BASELINE_UNSUPPORTED_SCHEMA,
      "fresh capture schema is not f21-qualification-reset-inventory-v1",
      { captureSchema },
    );
  }
  return {
    ok: true,
    observedObjects,
    observedDependencies: Array.isArray(observedDependencies) ? observedDependencies : [],
    observedHistoryRows: Array.isArray(observedHistoryRows) ? observedHistoryRows : [],
    inventory,
    captureSchema: captureSchema || F21_QUALIFICATION_RESET_INVENTORY_SCHEMA,
  };
}

/**
 * Policy-scoped pre-floor gate for QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1.
 *
 * Authenticates applicable policy, target, current inventory, and typed
 * membership BEFORE permitting floor preparation. Does not strip unexpected
 * objects, trust a verdict string, reuse a previous reset-success record, or
 * globally allow extension-like names. Historical classifyInventory /
 * CLEAN_BASELINE consumers are unchanged.
 */
export function evaluatePreserveBaselinePreFloorGate({
  policy = F21_RESET_PRESERVE_BASELINE_VERDICT,
  target = null,
  capture = null,
  observedObjects = null,
  observedDependencies = null,
  observedHistoryRows = null,
  inventory = null,
  inventoryCaptured = false,
  captureComplete = false,
  captureSchema = null,
  historyRows = [],
  listMigrations = [],
  authorization = null,
  previousResetResult = null,
} = {}) {
  const historical = evaluatePreStubFloorCleanCheck({
    inventory: inventory || capture?.inventory || {},
    historyRows,
    listMigrations,
  });
  const policyAuth = authenticatePreFloorPolicy(policy);
  if (policyAuth.ok !== true) {
    return { ...policyAuth, historical, previousResetResultIgnored: previousResetResult != null };
  }
  const targetAuth = authenticatePreFloorTarget(target);
  if (targetAuth.ok !== true) {
    return { ...targetAuth, historical, previousResetResultIgnored: previousResetResult != null };
  }
  if (authorization != null) {
    const schema = authorization.schema || authorization.inventorySchema || authorization.captureSchema;
    if (schema === F20_HISTORICAL_INVENTORY_SCHEMA
      || schema === "f13-qualification-reset-inventory-v1"
      || authorization.stale === true) {
      return failPreFloor(
        F21_PRESERVE_BASELINE_STALE_AUTHORIZATION,
        "stale F13/F20 authorization cannot authenticate preserve-baseline floor preparation",
        { historical, previousResetResultIgnored: true },
      );
    }
  }
  const fresh = resolveFreshPreserveCapture({
    capture,
    observedObjects,
    observedDependencies,
    observedHistoryRows,
    inventory,
    inventoryCaptured,
    captureComplete,
    captureSchema,
  });
  if (fresh.ok !== true) {
    return {
      ...fresh,
      historical,
      previousResetResultIgnored: previousResetResult != null,
      previousResetVerdict: previousResetResult?.verdict ?? null,
    };
  }
  const listed = asHistoryList(listMigrations);
  const history = asHistoryList(historyRows);
  if (listed.length || history.length || Number(fresh.inventory?.schema_migrations_rows || 0) > 0) {
    return failPreFloor(
      "F13_HISTORY_KEY_MISMATCH",
      "preserve-baseline pre-floor gate requires authenticated history to be absent",
      {
        historical,
        listMigrations: listed,
        history,
        previousResetResultIgnored: previousResetResult != null,
      },
    );
  }
  const baseline = evaluateQualificationResetPreserveBaseline({
    observedObjects: fresh.observedObjects,
    observedHistoryRows: fresh.observedHistoryRows,
    inventory: fresh.inventory,
    inventoryCaptured: true,
    captureComplete: true,
  });
  const classification = classifyInventory(fresh.inventory);
  if (!baseline.ok || baseline.alreadyClean !== true || baseline.verdict !== F21_RESET_PRESERVE_BASELINE_VERDICT) {
    return failPreFloor(
      baseline.code || "F21_PRESERVE_BASELINE_NOT_MET",
      baseline.reason || F22_PRESERVE_BASELINE_PRE_FLOOR_HOLD,
      {
        historical,
        baseline,
        classificationVerdict: classification.verdict,
        unexpectedObjects: baseline.unexpectedObjects,
        unsupportedLeftovers: baseline.unsupportedLeftovers,
        previousResetResultIgnored: previousResetResult != null,
      },
    );
  }
  return {
    ok: true,
    allowFloor: true,
    allowMigration: true,
    preserveBaseline: true,
    cleanBaseline: false,
    verdict: F21_RESET_PRESERVE_BASELINE_VERDICT,
    policy: policyAuth.policy,
    membershipPolicyId: policyAuth.membershipPolicyId,
    targetRef: targetAuth.targetRef,
    localFixture: targetAuth.localFixture === true,
    hostedIdentityProof: targetAuth.hostedIdentityProof === true,
    classificationVerdict: classification.verdict,
    historical,
    baseline,
    observedObjects: fresh.observedObjects,
    observedDependencies: fresh.observedDependencies,
    observedHistoryRows: fresh.observedHistoryRows,
    inventory: fresh.inventory,
    captureSchema: fresh.captureSchema,
    inventoryCaptured: true,
    captureComplete: true,
    do_not_wipe: true,
    trustedPreviousResetRecord: false,
    trustedVerdictStringAlone: false,
    strippedUnexpectedObjects: false,
    globallyAllowedExtensionLikeNames: false,
    previousResetResultIgnored: previousResetResult != null,
    gate: F22_PRESERVE_BASELINE_PRE_FLOOR_GATE,
    hold: null,
  };
}

/**
 * Shared pre-floor resolver used by the real qualification entrypoint.
 * Historical CLEAN_BASELINE still authenticates empty post-wipe inventory.
 * Preserve residuals take the policy-scoped path and never become CLEAN_BASELINE.
 */
export function resolvePreFloorQualificationGate({
  policy = F21_RESET_PRESERVE_BASELINE_VERDICT,
  target = null,
  inventory = null,
  historyRows = [],
  listMigrations = [],
  capture = null,
  observedObjects = null,
  observedDependencies = null,
  observedHistoryRows = null,
  inventoryCaptured = false,
  captureComplete = false,
  captureSchema = null,
  authorization = null,
  previousResetResult = null,
} = {}) {
  const historical = evaluatePreStubFloorCleanCheck({
    inventory,
    historyRows,
    listMigrations,
  });
  if (historical.clean_ok === true) {
    return {
      ok: true,
      allowFloor: true,
      allowMigration: true,
      preserveBaseline: false,
      cleanBaseline: true,
      verdict: "CLEAN_BASELINE",
      gate: "CLEAN_BASELINE",
      historical,
      preserve: null,
      do_not_wipe: true,
      hold: null,
      trustedPreviousResetRecord: false,
    };
  }
  const preserve = evaluatePreserveBaselinePreFloorGate({
    policy,
    target,
    capture,
    observedObjects,
    observedDependencies,
    observedHistoryRows,
    inventory,
    inventoryCaptured,
    captureComplete,
    captureSchema,
    historyRows,
    listMigrations,
    authorization,
    previousResetResult,
  });
  return {
    ...preserve,
    historical,
    preserve,
    gate: preserve.ok === true ? F21_RESET_PRESERVE_BASELINE_VERDICT : (preserve.gate || "HOLD"),
  };
}

export function assertPreFloorQualificationGate(result) {
  if (result?.allowFloor === true) return result;
  const err = new Error(result?.hold || result?.reason || PRE_STUB_FLOOR_CLEAN_CHECK_HOLD);
  err.code = result?.code || "F3_PRE_STUB_FLOOR_CLEAN_CHECK_HOLD";
  err.preFloorGate = result;
  err.cleanCheck = result?.historical || null;
  throw err;
}
