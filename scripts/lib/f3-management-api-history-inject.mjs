/**
 * Disposable-only Management API post-COMMIT history-failure injection.
 *
 * Installs a trigger on supabase_migrations.schema_migrations that raises
 * AFTER the server assigns version+name, exposing that identity in the
 * exception (Management API response). FORBIDDEN: apply-time clock,
 * guessed / inferred / nearest timestamps.
 *
 * Authoritative recovery sources only:
 *   1) apply response body / bodyText
 *   2) GET list_migrations
 *   3) schema_migrations rows
 *
 * If none of those expose an exact version+name → HOLD.
 * Never targets production. Never mutates 00118–00123 SQL bytes.
 */
import {
  HOLD_VERSION_UNRECOVERABLE,
  assertRemoteManagementApiGates,
  queryRemoteDisposableDatabase,
} from "./f3-management-api-remote-harness.mjs";

export const HISTORY_INJECT_MARKER = "F3_MAPI_HISTORY_INJECT";
export const PROBE_NAME = "f3_mapi_history_inject_probe";

export const INSTALL_HISTORY_INJECT_SQL = `
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  name text,
  statements text[]
);
CREATE SCHEMA IF NOT EXISTS villageclaq_f3_mapi;
CREATE TABLE IF NOT EXISTS villageclaq_f3_mapi.probe_commit_marker (
  id int PRIMARY KEY,
  note text NOT NULL
);

CREATE OR REPLACE FUNCTION villageclaq_f3_mapi.fail_history_after_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION '${HISTORY_INJECT_MARKER} version=% name=%', NEW.version, NEW.name
    USING ERRCODE = 'P0001',
          DETAIL = format('{"source":"schema_migrations_trigger","version":%L,"name":%L}', NEW.version, NEW.name);
END;
$$;

DROP TRIGGER IF EXISTS trg_f3_mapi_fail_history ON supabase_migrations.schema_migrations;
CREATE TRIGGER trg_f3_mapi_fail_history
BEFORE INSERT ON supabase_migrations.schema_migrations
FOR EACH ROW
EXECUTE FUNCTION villageclaq_f3_mapi.fail_history_after_identity();
`;

export const REMOVE_HISTORY_INJECT_SQL = `
DROP TRIGGER IF EXISTS trg_f3_mapi_fail_history ON supabase_migrations.schema_migrations;
DROP FUNCTION IF EXISTS villageclaq_f3_mapi.fail_history_after_identity();
`;

export const PROBE_SQL = `
CREATE TABLE IF NOT EXISTS villageclaq_f3_mapi.probe_commit_marker (
  id int PRIMARY KEY,
  note text NOT NULL
);
INSERT INTO villageclaq_f3_mapi.probe_commit_marker(id, note)
VALUES (1, 'post-commit-probe')
ON CONFLICT (id) DO UPDATE SET note = EXCLUDED.note;
COMMIT;
`;

export const READ_SCHEMA_MIGRATIONS_SQL = `
SELECT coalesce(
  json_agg(json_build_object('version', version, 'name', coalesce(name, '')) ORDER BY version),
  '[]'::json
)
FROM supabase_migrations.schema_migrations;
`;

export const PROBE_MARKER_PRESENT_SQL = `
SELECT EXISTS (
  SELECT 1 FROM villageclaq_f3_mapi.probe_commit_marker
  WHERE id = 1 AND note = 'post-commit-probe'
);
`;

const VERSION_RE = /(\d{14})/;
const INJECT_PAIR_RE = /F3_MAPI_HISTORY_INJECT version=([0-9]{14}) name=([A-Za-z0-9_]+)/;
const DETAIL_PAIR_RE = /"version"\s*:\s*"([0-9]{14})"\s*,\s*"name"\s*:\s*"([A-Za-z0-9_]+)"/;

export function identityKey(row) {
  if (!row) return "";
  return `${row.version || ""}:${row.name || ""}`;
}

export function normalizeHistoryRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      version: row.version != null ? String(row.version) : "",
      name: row.name != null ? String(row.name) : "",
    }))
    .filter((row) => row.version || row.name);
}

export function parseIdentityFromAuthoritativeText(text) {
  if (text == null) return null;
  const s = String(text);
  const inject = INJECT_PAIR_RE.exec(s);
  if (inject) {
    return {
      version: inject[1],
      name: inject[2],
      source: "response",
      artifact: "apply_response_exception",
    };
  }
  const detail = DETAIL_PAIR_RE.exec(s);
  if (detail) {
    return {
      version: detail[1],
      name: detail[2],
      source: "response",
      artifact: "apply_response_detail_json",
    };
  }
  return null;
}

function identitiesFromList(rows) {
  return normalizeHistoryRows(rows).filter((row) => /^\d{14}$/.test(row.version));
}

function addedIdentities(beforeRows, afterRows) {
  const before = new Set(identitiesFromList(beforeRows).map(identityKey));
  return identitiesFromList(afterRows).filter((row) => !before.has(identityKey(row)));
}

/**
 * Recover exact server-generated version+name from authoritative artifacts only.
 * Does not invent, clock, nearest-match, or infer a missing version.
 */
export function recoverServerGeneratedIdentity({
  applyResponse,
  listBefore,
  listAfter,
  schemaRows,
} = {}) {
  const candidates = [];

  const fromResponse = parseIdentityFromAuthoritativeText(
    [
      applyResponse?.bodyText,
      typeof applyResponse?.body === "string" ? applyResponse.body : JSON.stringify(applyResponse?.body || ""),
    ].join("\n"),
  );
  if (fromResponse) candidates.push(fromResponse);

  const listAdded = addedIdentities(listBefore, listAfter);
  if (listAdded.length === 1 && /^\d{14}$/.test(listAdded[0].version)) {
    candidates.push({
      version: listAdded[0].version,
      name: listAdded[0].name,
      source: "list_migrations",
      artifact: "GET /v1/projects/{ref}/database/migrations",
    });
  } else if (listAdded.length > 1) {
    return {
      ok: false,
      hold: HOLD_VERSION_UNRECOVERABLE,
      reason: "list_migrations_added_multiple_rows",
      candidates: listAdded,
    };
  }

  const schemaAdded = addedIdentities(listBefore, schemaRows);
  if (schemaAdded.length === 1 && /^\d{14}$/.test(schemaAdded[0].version)) {
    candidates.push({
      version: schemaAdded[0].version,
      name: schemaAdded[0].name,
      source: "schema_migrations",
      artifact: "supabase_migrations.schema_migrations",
    });
  } else if (schemaAdded.length > 1) {
    return {
      ok: false,
      hold: HOLD_VERSION_UNRECOVERABLE,
      reason: "schema_migrations_added_multiple_rows",
      candidates: schemaAdded,
    };
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      hold: HOLD_VERSION_UNRECOVERABLE,
      reason: "no_authoritative_version",
      candidates: [],
    };
  }

  const versions = new Set(candidates.map((c) => `${c.version}:${c.name}`));
  if (versions.size !== 1) {
    return {
      ok: false,
      hold: HOLD_VERSION_UNRECOVERABLE,
      reason: "authoritative_artifacts_disagree",
      candidates,
    };
  }

  const chosen = candidates[0];
  if (!/^\d{14}$/.test(chosen.version)) {
    return {
      ok: false,
      hold: HOLD_VERSION_UNRECOVERABLE,
      reason: "version_not_yyyyMMddHHmmss",
      candidates,
    };
  }

  return {
    ok: true,
    hold: null,
    version: chosen.version,
    name: chosen.name,
    sources: candidates.map((c) => c.source),
    artifacts: candidates.map((c) => c.artifact),
    candidates,
  };
}

export function refuseClockOrGuessedVersion(version, { nowMs } = {}) {
  if (version == null) return;
  if (nowMs != null) {
    throw new Error("REFUSE: apply-time clock is forbidden as a repaired version");
  }
  if (!/^\d{14}$/.test(String(version))) {
    throw new Error("REFUSE: version is not an authoritative YYYYMMDDHHMMSS identity");
  }
}

export function isFourteenDigitVersion(value) {
  return /^\d{14}$/.test(String(value || ""));
}

export function responseLooksLikeInjectFailure(applyResult) {
  const text = `${applyResult?.bodyText || ""} ${JSON.stringify(applyResult?.body || "")}`;
  return text.includes(HISTORY_INJECT_MARKER) || Boolean(parseIdentityFromAuthoritativeText(text));
}

export async function installHistoryInject({ projectRef } = {}) {
  assertRemoteManagementApiGates({ projectRef, optIn: true });
  return queryRemoteDisposableDatabase({
    query: INSTALL_HISTORY_INJECT_SQL,
    projectRef,
  });
}

export async function removeHistoryInject({ projectRef } = {}) {
  assertRemoteManagementApiGates({ projectRef, optIn: true });
  return queryRemoteDisposableDatabase({
    query: REMOVE_HISTORY_INJECT_SQL,
    projectRef,
    skipIdentity: true,
  });
}

export async function readRemoteSchemaMigrations({ projectRef } = {}) {
  assertRemoteManagementApiGates({ projectRef, optIn: true });
  const result = await queryRemoteDisposableDatabase({
    query: READ_SCHEMA_MIGRATIONS_SQL,
    projectRef,
    skipIdentity: true,
  });
  let rows = [];
  const parsed = result.rawParsed;
  if (Array.isArray(parsed)) {
    const first = parsed[0];
    const value =
      first && typeof first === "object"
        ? first.json_agg || first.coalesce || Object.values(first)[0]
        : first;
    if (typeof value === "string") {
      try {
        rows = JSON.parse(value);
      } catch {
        rows = [];
      }
    } else if (Array.isArray(value)) {
      rows = value;
    }
  } else if (typeof result.bodyText === "string") {
    const match = result.bodyText.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        rows = JSON.parse(match[0]);
      } catch {
        rows = [];
      }
    }
  }
  return { ...result, rows: normalizeHistoryRows(rows) };
}

export { VERSION_RE };
