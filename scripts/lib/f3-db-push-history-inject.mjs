/**
 * Disposable history-failure mechanism restricted to ONE preassigned
 * filename version. Used only for the db push qualification sequence.
 *
 * This is not Management API inject. Marker is distinct:
 *   F3_DBPUSH_DISPOSABLE_HISTORY_INJECT
 */
import {
  F3_FORWARD_FILES,
  HISTORY_INJECT_MARKER,
  PREASSIGNED_VERSIONS,
} from "./f3-db-push-pins.mjs";
import { isFourteenDigitVersion, preassignedVersionFor } from "./f3-db-push-version-map.mjs";

function lit(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function assertExactTargetVersion(version) {
  if (!isFourteenDigitVersion(version)) {
    throw new Error("REFUSE: history inject version must be YYYYMMDDHHMMSS");
  }
  const allowed = new Set(Object.values(PREASSIGNED_VERSIONS));
  if (!allowed.has(String(version))) {
    throw new Error("REFUSE: history inject is restricted to a preassigned 00118–00123 filename version");
  }
  return String(version);
}

export function historyInjectSqlForVersion(version) {
  const v = assertExactTargetVersion(version);
  return `
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  name text,
  statements text[]
);
CREATE OR REPLACE FUNCTION supabase_migrations.f3_dbpush_fail_target_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.version = ${lit(v)} THEN
    RAISE EXCEPTION '${HISTORY_INJECT_MARKER}: blocked INSERT for version % name %', NEW.version, NEW.name
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_f3_dbpush_fail_target_history ON supabase_migrations.schema_migrations;
CREATE TRIGGER trg_f3_dbpush_fail_target_history
BEFORE INSERT ON supabase_migrations.schema_migrations
FOR EACH ROW
EXECUTE FUNCTION supabase_migrations.f3_dbpush_fail_target_history();
`;
}

export function historyInjectSqlForFile(file) {
  if (!F3_FORWARD_FILES.includes(file)) {
    throw new Error(`REFUSE: history inject file ${file} is not an authorized F3 forward file`);
  }
  return historyInjectSqlForVersion(preassignedVersionFor(file));
}

export const REMOVE_HISTORY_INJECT_SQL = `
DROP TRIGGER IF EXISTS trg_f3_dbpush_fail_target_history ON supabase_migrations.schema_migrations;
DROP FUNCTION IF EXISTS supabase_migrations.f3_dbpush_fail_target_history();
`;

export const READ_SCHEMA_MIGRATIONS_SQL = `
SELECT coalesce(
  json_agg(json_build_object('version', version, 'name', coalesce(name, '')) ORDER BY version),
  '[]'::json
)
FROM supabase_migrations.schema_migrations;
`;

export const READ_SCHEMA_MIGRATIONS_COLUMNS_SQL = `
SELECT coalesce(
  json_agg(json_build_object(
    'column_name', column_name,
    'data_type', data_type,
    'is_nullable', is_nullable,
    'column_default', column_default
  ) ORDER BY ordinal_position),
  '[]'::json
)
FROM information_schema.columns
WHERE table_schema = 'supabase_migrations'
  AND table_name = 'schema_migrations';
`;

export const INVENTORY_SQL = `
SELECT jsonb_build_object(
  'throwaway_table', to_regclass('public.f3_mapi_throwaway_probe') IS NOT NULL,
  'throwaway_seq', to_regclass('public.f3_mapi_throwaway_probe_id_seq') IS NOT NULL,
  'schema_migrations', to_regclass('supabase_migrations.schema_migrations') IS NOT NULL,
  'inject_function', to_regprocedure('supabase_migrations.f3_dbpush_fail_target_history()') IS NOT NULL,
  'mapi_inject_function', to_regprocedure('supabase_migrations.f3_mapi_block_history_insert()') IS NOT NULL,
  'history_rows', CASE
    WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN 0
    ELSE (SELECT count(*) FROM supabase_migrations.schema_migrations)
  END
)::text;
`;

export const DROP_THROWAWAY_PROBE_SQL = `
DROP TABLE IF EXISTS public.f3_mapi_throwaway_probe CASCADE;
`;

export function objectProbeSql(expressions) {
  const selects = expressions.map((expr, i) => `${expr} AS p${i}`).join(",\n  ");
  return `SELECT ${selects};`;
}

export function classifyDbPushHistoryFailure({
  exitStatus,
  stdout,
  stderr,
  historyRows,
  targetVersion,
  objectsPresent,
} = {}) {
  const text = `${stdout || ""}\n${stderr || ""}`;
  const historyFailed =
    /history INSERT blocked/i.test(text) ||
    text.includes(HISTORY_INJECT_MARKER) ||
    /F3_DBPUSH_DISPOSABLE_HISTORY_INJECT/.test(text);
  const rows = Array.isArray(historyRows) ? historyRows : [];
  const versionPresent = rows.some((row) => String(row.version) === String(targetVersion));
  const nonzero = exitStatus !== 0 && exitStatus != null;
  return {
    nonzeroExit: nonzero,
    historyFailed,
    historyInsertMentioned: historyFailed,
    targetVersionPresent: versionPresent,
    targetVersionAbsent: !versionPresent,
    sqlCommitted: objectsPresent === true,
    rolledBack: objectsPresent === false,
    split:
      objectsPresent === true && !versionPresent
        ? "POST_COMMIT_HISTORY_FAILURE"
        : objectsPresent === false
          ? "PRE_COMMIT_OR_ATOMIC_ROLLBACK"
          : "UNKNOWN",
    knownFilenameVersion: targetVersion,
    repairAuthorizedByFilenameVersion: Boolean(targetVersion) && !versionPresent && objectsPresent === true,
  };
}
