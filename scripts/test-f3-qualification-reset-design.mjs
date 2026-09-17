/**
 * Offline design validators for F13 qualification-reset corrections.
 * No hosted/disposable contact. No mutation entrypoint.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  APPROVED_DISPOSABLE_PROJECT_REF,
  PREASSIGNED_NAMES,
  PREASSIGNED_VERSIONS,
  PRODUCTION_REF,
} from "./lib/f3-db-push-pins.mjs";
import {
  AUTHENTICATED_HISTORY_KEYS,
  CANONICAL_FUNCTION_IDENTITY_SQL,
  F13_DESIGN_LABEL,
  F13_MUTATION_ENTRYPOINT_OPEN,
  F13_SUPPORTED_INTERFACE,
  F13_WIPE_REJECTION_CODE,
  FINITE_DEPENDENCY_ALLOWLIST,
  FINITE_OBJECT_ALLOWLIST,
  FORBIDDEN_SELECTORS,
  NULL_OR_EMPTY_NAME_PROVENANCE,
  TRANSACTION_PHASES,
  UNCERTAIN_COMMIT_POLICY,
  allowlistIdentityMatches,
  canonicalizeFunctionIdentity,
  exportDesignArtifact,
  functionIdentitiesEqual,
  isFinancialPrefixSelector,
  parseFunctionIdentity,
  planQualificationResetDesign,
  rejectLiveContact,
  scopeSqlIdentityDigest,
  validateFounderAuthorizationBinding,
  validateHistoryKeys,
  validateHistorySqlPredicate,
  validateNoBroadCascade,
  validateObjectAllowlist,
  validateTransactionContract,
} from "./lib/f3-db-push-qualification-reset-design.mjs";
import {
  WIPE_TO_BASELINE_REJECTION_CODE,
  assertWipeToBaselineRejected,
  evaluateWipeToBaselineArg,
  parseArgs,
} from "./qualify-f3-db-push-disposable.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PACKAGE_DIR = path.join(
  ROOT,
  "docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F13_RESET_DESIGN_CORRECTED_20260917",
);
const F9_SOURCE = path.join(
  ROOT,
  "docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F9_EVENT_DURABLE_REQUAL_20260916/hosted/reset/reset-result.json",
);
const F9_COPY = path.join(PACKAGE_DIR, "provenance/F9-reset-result.sanitized.json");

const F12_REJECTED_SQL = `
BEGIN;
DROP SCHEMA IF EXISTS financial_core CASCADE;
DROP TABLE IF EXISTS public."groups" CASCADE;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260913173000' AND (name = 'f3_bounded_financial_epoch_foundation' OR name IS NULL OR name = '');
COMMIT;
`;

const HISTORICAL_REJECTED_SQL = `
DROP SCHEMA IF EXISTS financial_core CASCADE;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260913173000';
`;

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function validAuth(overrides = {}) {
  return {
    targetRef: APPROVED_DISPOSABLE_PROJECT_REF,
    functionalCandidateSha: "1ec0e4da782ed7715a543be23f79bc0f10a28af2",
    closureDigest: "08c2d46d7ff0d7e80d4df30342ca804cd7f1ddc408951491f77d5bb92ce1157b",
    scopeSqlIdentitySha256: scopeSqlIdentityDigest(),
    executionBudget: {
      constrainedResets: 1,
      completeQualsFrom00118: 1,
      secondReset: false,
    },
    authorizationArtifactSatisfied: true,
    ...overrides,
  };
}

function validPlanInput(overrides = {}) {
  return {
    observedObjects: [],
    observedDependencies: [],
    observedHistoryRows: AUTHENTICATED_HISTORY_KEYS.map((k) => ({ version: k.version, name: k.name })),
    authorization: validAuth(),
    transaction: {
      phases: TRANSACTION_PHASES,
      advisoryLockOnly: false,
      serializable: true,
      automaticReplay: false,
      claimRollbackWithoutEvidence: false,
    },
    ...overrides,
  };
}

test("F13-A01 financial_* prefix is not a destructive allowlist", () => {
  assert.equal(isFinancialPrefixSelector("financial_*"), true);
  assert.equal(isFinancialPrefixSelector("financial_object"), true);
  assert.equal(isFinancialPrefixSelector("public.financial_accounts"), false);
  const blocked = validateObjectAllowlist(["financial_*"], []);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "F13_UNEXPECTED_OBJECT_OR_DEPENDENCY");
  assert.match(blocked.unexpectedObjects[0].reason, /prefix/);
});

test("F13-A02 exact schema-qualified identities are accepted", () => {
  const ok = validateObjectAllowlist(
    ["public.financial_accounts", "financial_core.post_f3_command(jsonb,jsonb)"],
    [{
      kind: "foreign_key",
      identity: "memberships_group_id_fkey",
      from: "public.memberships",
      to: "public.groups",
    }],
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.allowedCount, FINITE_OBJECT_ALLOWLIST.length);
  assert.ok(ok.allowedCount >= 90);
});

test("F13-A03 unexpected object blocks", () => {
  const blocked = validateObjectAllowlist(["public.not_on_allowlist"], []);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.executed, false);
});

test("F13-A04 unexpected dependency blocks", () => {
  const blocked = validateObjectAllowlist([], ["some_unknown_fkey"]);
  assert.equal(blocked.ok, false);
  assert.match(blocked.unexpectedDependencies[0].reason, /FINITE_DEPENDENCY_ALLOWLIST/);
});

test("F13-A05 broad CASCADE is rejected including F12 and historical SQL", () => {
  const f12 = validateNoBroadCascade(F12_REJECTED_SQL);
  assert.equal(f12.ok, false);
  assert.equal(f12.code, "F13_BROAD_CASCADE_FORBIDDEN");
  const hist = validateNoBroadCascade(HISTORICAL_REJECTED_SQL);
  assert.equal(hist.ok, false);
  const restrict = validateNoBroadCascade("DROP TABLE public.financial_accounts RESTRICT;");
  assert.equal(restrict.ok, true);
});

test("F13-A06 every allowlist row has identity, provenance, state, action, effects, order", () => {
  const orders = [];
  for (const row of FINITE_OBJECT_ALLOWLIST) {
    assert.ok(row.id && row.kind && row.schema && row.identity, row.id);
    assert.ok(row.provenance && row.requiredStartingState && row.intendedAction, row.id);
    assert.ok(Array.isArray(row.permittedDependentEffects), row.id);
    assert.equal(typeof row.dropOrder, "number", row.id);
    if (row.kind === "function") {
      assert.ok(row.signature.includes("("), row.id);
      assert.equal(row.identity, row.signature, row.id);
    }
    assert.doesNotMatch(row.intendedAction, /\bCASCADE\b/);
    orders.push(row.dropOrder);
  }
  assert.equal(new Set(orders).size, orders.length);
  assert.ok(FORBIDDEN_SELECTORS.includes("financial_* prefix as destructive allowlist"));
  assert.ok(FORBIDDEN_SELECTORS.includes("DROP SCHEMA ... CASCADE"));
});

test("F13-A07 schemas are dropped RESTRICT after emptiness, never CASCADE", () => {
  const schemas = FINITE_OBJECT_ALLOWLIST.filter((o) => o.kind === "schema");
  assert.deepEqual(schemas.map((s) => s.identity).sort(), ["financial_core", "financial_private"]);
  for (const s of schemas) {
    assert.match(s.intendedAction, /RESTRICT/);
    assert.doesNotMatch(s.intendedAction, /CASCADE/);
  }
});

test("F13-B01 complete transaction phases are required", () => {
  const missing = validateTransactionContract({ phases: ["T0_BIND"], serializable: true });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "F13_TX_PHASES_INCOMPLETE");
  const ok = validateTransactionContract({
    phases: TRANSACTION_PHASES,
    advisoryLockOnly: false,
    serializable: true,
    automaticReplay: false,
    claimRollbackWithoutEvidence: false,
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(TRANSACTION_PHASES.map((p) => p.id), [
    "T0_BIND", "T1_BEGIN", "T2_LOCK", "T3_REVALIDATE", "T4_MUTATE", "T5_AFFECTED", "T6_FINAL", "T7_COMMIT",
  ]);
});

test("F13-B02 advisory lock alone is insufficient", () => {
  const blocked = validateTransactionContract({
    phases: TRANSACTION_PHASES,
    advisoryLockOnly: true,
    serializable: false,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "F13_ADVISORY_LOCK_INSUFFICIENT");
});

test("F13-B03 uncertain commit forbids automatic replay and unverifiable rollback", () => {
  assert.equal(UNCERTAIN_COMMIT_POLICY.automaticReplay, false);
  assert.equal(UNCERTAIN_COMMIT_POLICY.unverifiableRollbackClaimForbidden, true);
  assert.equal(
    validateTransactionContract({
      phases: TRANSACTION_PHASES,
      serializable: true,
      automaticReplay: true,
    }).code,
    "F13_AUTOMATIC_REPLAY_FORBIDDEN",
  );
  assert.equal(
    validateTransactionContract({
      phases: TRANSACTION_PHASES,
      serializable: true,
      claimRollbackWithoutEvidence: true,
    }).code,
    "F13_UNVERIFIABLE_ROLLBACK_FORBIDDEN",
  );
});

test("F13-C01 exact PREASSIGNED version+name keys match F12 tip pins", () => {
  assert.equal(AUTHENTICATED_HISTORY_KEYS.length, 6);
  assert.equal(AUTHENTICATED_HISTORY_KEYS[0].version, "20260913173000");
  assert.equal(AUTHENTICATED_HISTORY_KEYS[5].version, "20260913173005");
  for (const key of AUTHENTICATED_HISTORY_KEYS) {
    assert.equal(key.version, PREASSIGNED_VERSIONS[key.file]);
    assert.equal(key.name, PREASSIGNED_NAMES[key.file]);
    assert.ok(key.version.startsWith("202609131730"));
    assert.notEqual(key.version, key.file);
  }
});

test("F13-C02 null or empty names are rejected without authenticated provenance", () => {
  assert.equal(NULL_OR_EMPTY_NAME_PROVENANCE.authenticated, false);
  assert.deepEqual(NULL_OR_EMPTY_NAME_PROVENANCE.finiteScopeEntries, []);
  const empty = validateHistoryKeys([{ version: "20260913173000", name: "" }]);
  assert.equal(empty.ok, false);
  const nul = validateHistoryKeys([{ version: "20260913173000", name: null }]);
  assert.equal(nul.ok, false);
  assert.match(nul.errors[0].reason, /abort whole operation/);
});

test("F13-C03 mismatched name aborts the whole operation", () => {
  const rows = AUTHENTICATED_HISTORY_KEYS.map((k, i) => ({
    version: k.version,
    name: i === 2 ? "wrong_source_label" : k.name,
  }));
  const blocked = validateHistoryKeys(rows);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "F13_HISTORY_KEY_MISMATCH");
  assert.match(blocked.errors[0].reason, /WHOLE operation/);
});

test("F13-C04 source-label substitution SQL is rejected", () => {
  const f12 = validateHistorySqlPredicate(F12_REJECTED_SQL);
  assert.equal(f12.ok, false);
  const hist = validateHistorySqlPredicate(HISTORICAL_REJECTED_SQL);
  assert.equal(hist.ok, false);
  const exact = validateHistorySqlPredicate(
    "DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260913173000' AND name = 'f3_bounded_financial_epoch_foundation';",
  );
  assert.equal(exact.ok, true);
});

test("F13-C05 historical six-row deletion does not establish live state", () => {
  const ok = validateHistoryKeys(AUTHENTICATED_HISTORY_KEYS.map((k) => ({ version: k.version, name: k.name })));
  assert.equal(ok.ok, true);
  assert.equal(ok.historicalSixRowDeletionEstablishesLiveState, false);
  assert.equal(ok.liveCheckRequiredLater, true);
});

test("F13-D01 flag alone is not founder authorization", () => {
  const flagOnly = validateFounderAuthorizationBinding({
    flag: "--qualification-reset",
    authorizationArtifactSatisfied: false,
    targetRef: APPROVED_DISPOSABLE_PROJECT_REF,
    functionalCandidateSha: "1ec0e4da782ed7715a543be23f79bc0f10a28af2",
    closureDigest: "x",
    scopeSqlIdentitySha256: "y",
    executionBudget: { constrainedResets: 1, completeQualsFrom00118: 1, secondReset: false },
  });
  assert.equal(flagOnly.ok, false);
  assert.equal(flagOnly.code, "F13_FLAG_NOT_AUTHORIZATION");
  const incomplete = validateFounderAuthorizationBinding({ flag: "--qualification-reset" });
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.flagAloneIsNotAuthorization, true);
});

test("F13-D02 complete binding of target, candidate, closure, scope, budget is required", () => {
  const ok = validateFounderAuthorizationBinding(validAuth());
  assert.equal(ok.ok, true);
  assert.equal(ok.bound.targetRef, APPROVED_DISPOSABLE_PROJECT_REF);
  const badBudget = validateFounderAuthorizationBinding(validAuth({
    executionBudget: { constrainedResets: 2, completeQualsFrom00118: 1, secondReset: true },
  }));
  assert.equal(badBudget.ok, false);
});

test("F13-D03 production and wipe flag remain refused", () => {
  const prod = validateFounderAuthorizationBinding(validAuth({ targetRef: PRODUCTION_REF }));
  assert.equal(prod.ok, false);
  const wipe = validateFounderAuthorizationBinding(validAuth({ wipeToBaseline: true }));
  assert.equal(wipe.ok, false);
  assert.equal(wipe.code, F13_WIPE_REJECTION_CODE);
  assert.equal(evaluateWipeToBaselineArg(true).code, WIPE_TO_BASELINE_REJECTION_CODE);
  assert.equal(WIPE_TO_BASELINE_REJECTION_CODE, F13_WIPE_REJECTION_CODE);
  assert.throws(() => assertWipeToBaselineRejected(parseArgs(["--wipe-to-baseline"])), (err) => (
    err.code === WIPE_TO_BASELINE_REJECTION_CODE
  ));
});

test("F13-D04 Phase 1 planner never opens mutation and refuses live contact", () => {
  assert.equal(F13_MUTATION_ENTRYPOINT_OPEN, false);
  assert.equal(F13_SUPPORTED_INTERFACE.mutationEntrypointOpen, false);
  assert.equal(F13_SUPPORTED_INTERFACE.flagAloneIsNotAuthorization, true);
  assert.equal(rejectLiveContact({ DATABASE_URL: "postgresql://example" }).ok, false);
  assert.equal(rejectLiveContact({ execute: true }).ok, false);
  assert.equal(planQualificationResetDesign(validPlanInput()).ok, true);
  assert.equal(planQualificationResetDesign(validPlanInput()).executed, false);
  assert.equal(planQualificationResetDesign(validPlanInput()).mutationEntrypointOpen, false);
  assert.equal(planQualificationResetDesign(validPlanInput({ execute: true })).ok, false);
});

test("F13-D05 planner fail-closes on F12-style SQL even with otherwise valid auth", () => {
  const blocked = planQualificationResetDesign(validPlanInput({ sqlText: F12_REJECTED_SQL }));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.executed, false);
});

test("F13-E01 F9 sanitized artifact is byte-for-byte the finalized source", () => {
  assert.equal(fs.existsSync(F9_SOURCE), true);
  assert.equal(fs.existsSync(F9_COPY), true);
  const src = fs.readFileSync(F9_SOURCE);
  const copy = fs.readFileSync(F9_COPY);
  assert.equal(src.equals(copy), true);
  assert.equal(sha256File(F9_SOURCE), "dddf20e1c0762515a4132c77550f96665d2c56476780a9abc65f03a92bb127b6");
  assert.equal(sha256File(F9_COPY), "dddf20e1c0762515a4132c77550f96665d2c56476780a9abc65f03a92bb127b6");
  assert.equal(src.length, 2749);
});

test("F13-E02 new package discloses zero workspace absolute paths", () => {
  function walk(dir) {
    const out = [];
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) out.push(...walk(p));
      else out.push(p);
    }
    return out;
  }
  const files = walk(PACKAGE_DIR);
  assert.ok(files.length > 5);
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(text, /\/workspace\//, file);
    assert.doesNotMatch(text, /\/home\/ubuntu\//, file);
  }
});

test("F13-E03 historical complete argv remains CANNOT CONFIRM", () => {
  const provenance = JSON.parse(fs.readFileSync(path.join(PACKAGE_DIR, "provenance/PROVENANCE.json"), "utf8"));
  assert.equal(provenance.historical_complete_argv, "CANNOT CONFIRM");
  assert.equal(provenance.f9_reset_result.source_commit, "f5727733a036536c0374d93570f61e80a127d428");
  assert.equal(
    provenance.f9_reset_result.repo_relative_path,
    "docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F9_EVENT_DURABLE_REQUAL_20260916/hosted/reset/reset-result.json",
  );
});

test("F13-E04 design artifact export stays offline and labeled", () => {
  const artifact = exportDesignArtifact();
  assert.equal(artifact.label, F13_DESIGN_LABEL);
  assert.equal(artifact.mutationEntrypointOpen, false);
  assert.equal(artifact.wipeToBaselineRejected, true);
  assert.ok(scopeSqlIdentityDigest().length === 64);
});

test("F14-A01 named-arg and catalog identities compare as the same function", () => {
  assert.match(CANONICAL_FUNCTION_IDENTITY_SQL, /format_type/);
  assert.match(CANONICAL_FUNCTION_IDENTITY_SQL, /proargtypes/);
  assert.doesNotMatch(CANONICAL_FUNCTION_IDENTITY_SQL, /pg_get_function_identity_arguments/);
  const named = parseFunctionIdentity("public.post_financial_opening_cash(p_command jsonb)");
  assert.equal(named.identity, "public.post_financial_opening_cash(jsonb)");
  assert.deepEqual(named.argTypes, ["jsonb"]);
  assert.equal(
    canonicalizeFunctionIdentity("public.post_financial_opening_cash(p_command jsonb)"),
    "public.post_financial_opening_cash(jsonb)",
  );
  assert.equal(
    functionIdentitiesEqual(
      "public.post_financial_opening_cash(p_command jsonb)",
      "public.post_financial_opening_cash(jsonb)",
    ),
    true,
  );
  assert.equal(
    allowlistIdentityMatches(
      "public.post_financial_opening_cash(p_command jsonb)",
      "public.post_financial_opening_cash(jsonb)",
    ),
    true,
  );
});

test("F14-A02 allowed function surface includes zero-arg, custom types, and timestamptz aliases", () => {
  const zeroArg = FINITE_OBJECT_ALLOWLIST.find((row) => row.identity === "public.notification_policy_set_updated_at()");
  assert.ok(zeroArg);
  assert.equal(canonicalizeFunctionIdentity("public.notification_policy_set_updated_at()"), zeroArg.identity);

  const custom = "public.enqueue_outbound_notification(text,uuid,public.notification_channel,uuid,text)";
  assert.equal(
    canonicalizeFunctionIdentity(custom),
    "public.enqueue_outbound_notification(text,uuid,notification_channel,uuid,text)",
  );
  assert.equal(
    validateObjectAllowlist([
      "public.enqueue_outbound_notification(p_kind text, p_group uuid, p_channel notification_channel, p_member uuid, p_body text)",
    ], []).ok,
    true,
  );

  const cashbook = "public.get_financial_cashbook(uuid,timestamptz,timestamptz,uuid,text,int4,int4)";
  assert.equal(
    functionIdentitiesEqual(
      cashbook,
      "public.get_financial_cashbook(uuid,timestamp with time zone,timestamp with time zone,uuid,text,integer,integer)",
    ),
    true,
  );
  assert.equal(validateObjectAllowlist([cashbook], []).ok, true);

  const arrayForm = canonicalizeFunctionIdentity("financial_core.probe(pg_catalog.text[])");
  assert.equal(arrayForm, "financial_core.probe(text[])");
  assert.equal(validateObjectAllowlist(["public.zero_arg_probe()"], []).ok, false);
});

test("F15-C2-A01 matching constraint name cannot authorize different endpoints", () => {
  const altered = validateObjectAllowlist(["public.financial_accounts"], [{
    kind: "foreign_key",
    identity: "memberships_group_id_fkey",
    from: "public.financial_accounts",
    to: "public.groups",
  }]);
  assert.equal(altered.ok, false);
  assert.equal(altered.code, "F13_UNEXPECTED_OBJECT_OR_DEPENDENCY");

  const nameOnly = validateObjectAllowlist(["public.financial_accounts"], ["memberships_group_id_fkey"]);
  assert.equal(nameOnly.ok, false);
});

test("F15-C3-A01 allowlist carries actual catalog FK identities from migrations", () => {
  const required = [
    "posting_command_payloads_event_id_fkey",
    "correction_command_payloads_target_event_id_group_id_fkey",
    "correction_command_payloads_reversal_event_id_group_id_fkey",
    "correction_command_payloads_replacement_event_id_group_id_fkey",
  ];
  for (const identity of required) {
    const row = FINITE_DEPENDENCY_ALLOWLIST.find((dep) => dep.identity === identity);
    assert.ok(row, identity);
    assert.equal(row.kind, "foreign_key");
    assert.ok(row.from.includes("."), identity);
    assert.ok(row.to.includes("."), identity);
  }
  assert.equal(
    FINITE_DEPENDENCY_ALLOWLIST.some((dep) => /event_id -> public.financial_events/.test(dep.identity)),
    false,
  );
  assert.equal(
    FINITE_DEPENDENCY_ALLOWLIST.some((dep) => dep.id === "dep.financial_events.correction_command_payloads_fks"),
    false,
  );
});

