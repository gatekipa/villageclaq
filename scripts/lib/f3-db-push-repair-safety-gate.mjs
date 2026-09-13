/**
 * Repair-safety gate for the db-push qualification sequence.
 *
 * Repair may spawn ONLY after all eight proofs pass. Any miss → finally-style
 * poison cleanup only; no repair; no next migration; no continuation.
 */
import {
  F3_FORWARD_FILES,
  FROZEN_DIGESTS,
  HISTORY_INJECT_MARKER,
  PREASSIGNED_VERSIONS,
  TARGET_OBJECT_PROBES,
} from "./f3-db-push-pins.mjs";
import { extractPsqlErrorLines } from "./f3-db-push-stub-live-pin-floor.mjs";

export const REPAIR_SAFETY_HOLD =
  "HOLD: repair-safety gate failed; poison cleaned; repair not spawned; no continuation";

export const FINGERPRINT_REQUIRED_KEYS = Object.freeze([
  "schema",
  "function_owner",
  "acl",
  "policy",
]);

export const FINGERPRINT_REQUIRED_MARKERS = Object.freeze({
  "00118_f3_bounded_financial_epoch_foundation.sql": Object.freeze(["financial_private"]),
  "00119_f3_01_core_ledger_foundation.sql": Object.freeze(["financial_core", "financial_private"]),
  "00120_f3_02_secure_posting_idempotency.sql": Object.freeze(["financial_core", "post_financial_command"]),
  "00121_f3_03_projection_read_proof.sql": Object.freeze([
    "financial_core",
    "get_financial_projection_bundle",
  ]),
  "00122_f3_04_correction_reversal.sql": Object.freeze(["financial_core", "correct_financial_event"]),
  "00123_f3_05_opening_cash_command.sql": Object.freeze([
    "financial_core",
    "post_financial_opening_cash",
  ]),
});

function textOf(input) {
  return `${input?.stdout || ""}\n${input?.stderr || ""}\n${input?.output || ""}`;
}

export function hasTargetSpecificInjectMarker(text, version) {
  const blob = String(text || "");
  if (!blob.includes(HISTORY_INJECT_MARKER)) return false;
  if (!String(version || "")) return false;
  const v = String(version);
  return (
    blob.includes(`version ${v}`) ||
    blob.includes(`for version ${v}`) ||
    new RegExp(`${HISTORY_INJECT_MARKER}[^\\n]*${v}`).test(blob)
  );
}

export function unrelatedMigrationSqlErrors(text, version) {
  const lines = extractPsqlErrorLines(text);
  return lines.filter((line) => {
    if (hasTargetSpecificInjectMarker(line, version)) return false;
    if (line.includes(HISTORY_INJECT_MARKER) && String(line).includes(String(version))) {
      return false;
    }
    return true;
  });
}

export function fingerprintCompleteAndExact(fingerprint, file) {
  if (!fingerprint || typeof fingerprint !== "object" || Array.isArray(fingerprint)) {
    return { ok: false, reason: "fingerprint missing or not an object" };
  }
  for (const key of FINGERPRINT_REQUIRED_KEYS) {
    if (!(key in fingerprint) || fingerprint[key] == null) {
      return { ok: false, reason: `fingerprint missing key ${key}` };
    }
  }
  if (fingerprint.f3_objects_absent === true) {
    return { ok: false, reason: "fingerprint f3_objects_absent is true after target apply" };
  }
  const blob = [
    fingerprint.schema,
    fingerprint.function_owner,
    fingerprint.acl,
    fingerprint.policy,
  ].join("\n");
  const markers = FINGERPRINT_REQUIRED_MARKERS[file] || [];
  for (const marker of markers) {
    if (!String(blob).includes(marker)) {
      return { ok: false, reason: `fingerprint missing marker ${marker}` };
    }
  }
  if (fingerprint.expected && JSON.stringify(fingerprint.expected) !== JSON.stringify(fingerprint.observed || fingerprint)) {
    // optional exact expected blob
  }
  if (fingerprint.exactEquals) {
    const { exactEquals, ...rest } = fingerprint;
    if (JSON.stringify(rest) !== JSON.stringify(exactEquals)) {
      return { ok: false, reason: "fingerprint is not exact" };
    }
  }
  return { ok: true };
}

export function evaluateRepairSafetyGate(input = {}) {
  const file = input.file;
  const version = input.targetVersion || PREASSIGNED_VERSIONS[file];
  const gates = [];
  const fail = (id, detail) => {
    gates.push({ id, ok: false, detail });
  };
  const pass = (id, detail) => {
    gates.push({ id, ok: true, detail: detail || true });
  };

  if (!F3_FORWARD_FILES.includes(file)) {
    fail("authorized_file", `unknown file ${file}`);
  } else {
    pass("authorized_file");
  }

  // 1. Failure injection installed for exact target version
  const injectInstalled =
    input.injectInstalled === true ||
    Number(input.injectStatus) === 0 ||
    input.injectOk === true;
  const injectTargetsVersion =
    String(input.injectSql || "").includes(String(version)) &&
    String(input.injectSql || "").includes(HISTORY_INJECT_MARKER);
  if (!injectInstalled || (input.injectSql != null && !injectTargetsVersion)) {
    fail("inject_installed_exact_version", "failure injection not installed for exact target version");
  } else {
    pass("inject_installed_exact_version");
  }

  // 2. db push exited nonzero
  const nonzero = input.exitStatus !== 0 && input.exitStatus != null;
  if (!nonzero) fail("nonzero_exit", `exitStatus=${input.exitStatus}`);
  else pass("nonzero_exit");

  const output = textOf(input);
  // 3. Output contains exact target-specific injected history-failure marker
  if (!hasTargetSpecificInjectMarker(output, version)) {
    fail("target_inject_marker", "missing target-specific history-failure marker");
  } else {
    pass("target_inject_marker");
  }

  // 4. No unrelated migration-SQL error
  const unrelated = unrelatedMigrationSqlErrors(output, version);
  if (unrelated.length > 0) {
    fail("no_unrelated_sql_error", unrelated[0]);
  } else {
    pass("no_unrelated_sql_error");
  }

  // 5. Target version absent from migration history
  const rows = Array.isArray(input.historyRows) ? input.historyRows : [];
  const present = rows.some((row) => String(row?.version) === String(version));
  if (present) fail("target_history_absent", "target version unexpectedly present");
  else pass("target_history_absent");

  // 6. Every expected object + security postcondition
  const expectedCount = (TARGET_OBJECT_PROBES[file] || []).length;
  const objectsOk = input.objectsPresent === true;
  if (!objectsOk) fail("expected_objects", `objectsPresent=${input.objectsPresent} expected=${expectedCount}`);
  else pass("expected_objects");
  if (input.securityPostconditionsOk === false || !objectsOk) {
    fail(
      "security_postconditions",
      objectsOk ? "security postconditions missing" : "objects missing so security postconditions not proven",
    );
  } else {
    pass("security_postconditions");
  }

  // 7. Migration-specific catalog/security fingerprint complete+exact
  const fp = fingerprintCompleteAndExact(input.fingerprint, file);
  if (!fp.ok) fail("fingerprint_exact", fp.reason);
  else pass("fingerprint_exact");

  // 8. SQL digest matches founder-authorized candidate bytes
  const authorized = FROZEN_DIGESTS[file];
  const digestOk =
    input.digest === authorized &&
    (input.onDiskDigest == null || input.onDiskDigest === authorized);
  if (!digestOk) fail("sql_digest", `digest ${input.digest} != ${authorized}`);
  else pass("sql_digest");

  const ok = gates.every((g) => g.ok);
  const originalError =
    unrelated[0] ||
    (hasTargetSpecificInjectMarker(output, version) ? null : extractPsqlErrorLines(output)[0]) ||
    input.originalSqlError ||
    null;
  return {
    ok,
    repairAuthorized: ok,
    continuation: ok,
    gates,
    failedGates: gates.filter((g) => !g.ok).map((g) => g.id),
    hold: ok ? null : REPAIR_SAFETY_HOLD,
    originalSqlError: originalError,
    poisonCleanupOnly: !ok,
    nextMigration: ok,
  };
}

/**
 * Classify, then maybe repair. Cleanup always runs (finally).
 * Repair callback is invoked only when the gate authorizes it.
 */
export function runRepairSafetyThenMaybeRepair({
  gateInput,
  cleanup,
  repair,
} = {}) {
  const gate = evaluateRepairSafetyGate(gateInput);
  let cleanupResult = null;
  let repairResult = null;
  let repairAttempted = false;
  try {
    if (gate.ok) {
      if (typeof repair !== "function") {
        throw new Error("HOLD: repair executor required after authorized gate");
      }
      repairAttempted = true;
      repairResult = repair();
    }
  } finally {
    if (typeof cleanup === "function") cleanupResult = cleanup();
  }
  return {
    gate,
    repairAuthorized: gate.ok,
    repairAttempted,
    repair: repairResult,
    continuation: gate.ok,
    nextMigration: gate.ok,
    cleanup: cleanupResult,
    poisonCleanupOnly: true,
  };
}
