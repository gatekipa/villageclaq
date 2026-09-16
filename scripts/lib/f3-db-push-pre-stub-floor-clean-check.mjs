/**
 * Pre-stub-floor clean-check for the hosted disposable.
 *
 * Chief 2026-09-13 on jkorwnwwmdeflfntxntl:
 *   clean_ok=true, residuals=[], public tables 0, migrations [],
 *   schema_migrations rows 0, F3 absent, matches post-wipe baseline.
 *
 * Do NOT wipe. If this check fails → HOLD, no floor, no db push.
 * Not a clean 00001–00117 replay. Not production-equivalent.
 */
import { QUALIFICATION_FLOOR_LABEL } from "./f3-db-push-stub-live-pin-floor.mjs";
import {
  FAILED_FLOOR_STORAGE_BUCKETS,
  FAILED_FLOOR_STORAGE_POLICY_NAMES,
  asList,
  classifyInventory,
  isCleanBaseline,
} from "./f3-db-push-inventory.mjs";
import { inventoryFromQuery } from "./f3-db-push-query-parse.mjs";
import { RECOGNITION_ALLOWLIST } from "./f3-db-push-pins.mjs";

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
