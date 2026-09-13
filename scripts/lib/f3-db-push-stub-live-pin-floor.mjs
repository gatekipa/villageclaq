/**
 * Hosted db-push qualification floor: documented stub + live pins + real 00117.
 *
 * REQUIRED LABEL:
 *   DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY
 *   AND NOT PRODUCTION-EQUIVALENT
 *
 * Components (repo fixtures only; no guessed history identities):
 *   1) STUB_CORE_SQL
 *   2) REGRESSION_SLICE_SQL
 *   3) CUT2_QUEUE_SLICE_SQL
 *   4) Exact live has_group_permission from Cut 3 live-function authority
 *   5) Exact enqueue_outbound_notification from the 00115 extraction path
 *   6) Exact owners/grants/revokes/table+column ACLs (remoteFloorOwnershipAndAclSql)
 *   7) Exact unmodified 00117 bytes via gated psql -f
 *      — NOT Management API, NOT db push for 00117
 *
 * Isolated db-push workdir copies remain 00118–00123 only.
 * Earlier production history is intentionally not reproduced.
 * Do not invent schema_migrations rows for 00117.
 *
 * Greenfield 00001–00116 replay and 00030/00057 transforms are
 * DISALLOWED for this founder auth. Production is forbidden.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LIVE_ENQ_DEF_MD5,
  LIVE_ENQ_SRC_MD5,
  LIVE_HGP_DEF_MD5,
  LIVE_HGP_SRC_MD5,
  LIVE_QUEUE_COL_ACL,
  LIVE_QUEUE_TABLE_ACL,
  extractEnqueueCreateSql,
  extractHasGroupPermissionCreateSql,
} from "../_m2_apply_disposable_floor.mjs";
import {
  CUT2_QUEUE_SLICE_SQL,
  REGRESSION_SLICE_SQL,
  STUB_CORE_SQL,
} from "../fixtures/f3-forward-prerequisites.mjs";
import { remoteFloorOwnershipAndAclSql } from "./f3-management-api-disposable-floor.mjs";
import {
  F3_FORWARD_FILES,
  FILE_BASED_RUNNER_VERDICTS,
  RECOGNITION_ALLOWLIST,
} from "./f3-db-push-pins.mjs";
import { assertFrozenDigestsOnDisk, sha256Buffer, timestampFilenameFor } from "./f3-db-push-version-map.mjs";
import { runGatedRemoteSqlFile, writeGatedSqlFile } from "./f3-db-push-remote-sql-file.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

export const FILE_00117 = "00117_m2_notification_policy_foundation.sql";

export const QUALIFICATION_FLOOR_LABEL =
  "DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT";

export const STUB_LIVE_PIN_FLOOR_AUTHORITY =
  "hosted default: stub+live-pin qualification floor via gated disposable psql -f (STUB_CORE_SQL + REGRESSION_SLICE_SQL + CUT2_QUEUE_SLICE_SQL + Cut 3 live has_group_permission + 00115 enqueue extract + remoteFloorOwnershipAndAclSql + exact unmodified 00117 bytes). Isolated db-push workdir only has 00118–00123. Earlier production history intentionally not reproduced. Do not invent 00117 history rows. NOT Management API, NOT db push for 00117, NOT 00001–00116 replay, NOT 00030/00057 transforms, NOT production-equivalent.";

export const STUB_LIVE_PIN_FLOOR_HOLD =
  "HOLD: stub+live-pin qualification floor or pre-db-push gates failed; db push not started";

export const GREENFIELD_DISALLOWED_FOR_THIS_AUTH =
  "HOLD: greenfield 00001–00117 replay is disallowed for this founder auth; use stub+live-pin";

export const FLOOR_MODES = Object.freeze({
  STUB_LIVE_PIN: "stub-live-pin",
  GREENFIELD: "greenfield",
});

export const HOSTED_DEFAULT_FLOOR_MODE = FLOOR_MODES.STUB_LIVE_PIN;

export const DISCLOSED_STUB_LIVE_PIN_COMPONENTS = Object.freeze([
  "STUB_CORE_SQL",
  "REGRESSION_SLICE_SQL",
  "CUT2_QUEUE_SLICE_SQL",
  "live_has_group_permission_cut3",
  "enqueue_outbound_notification_00115_extract",
  "remoteFloorOwnershipAndAclSql",
  "unmodified_00117_gated_psql",
]);

export const EXPECTED_HGP_EXECUTE_ACL = Object.freeze([
  "authenticated|EXECUTE|postgres|false",
  "postgres|EXECUTE|postgres|false",
  "service_role|EXECUTE|postgres|false",
]);

export const EXPECTED_ENQUEUE_EXECUTE_ACL = Object.freeze([
  "postgres|EXECUTE|postgres|false",
  "service_role|EXECUTE|postgres|false",
]);

export const MECHANICS_PASS_VERDICT = FILE_BASED_RUNNER_VERDICTS.MECHANICS_PASS;

function file00117Abs() {
  return path.join(root, "supabase/migrations", FILE_00117);
}

export function recognitionFromSourcePin() {
  const src = fs.readFileSync(path.join(root, "src/lib/financial-f3-recognition.ts"), "utf8");
  const match = src.match(
    /export const F3_RECOGNIZED_SOA_INCOME_EFFECT_KINDS = \[([^\]]+)\] as const/,
  );
  if (!match) throw new Error("HOLD: recognition allowlist export missing");
  const kinds = [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (JSON.stringify(kinds) !== JSON.stringify([...RECOGNITION_ALLOWLIST])) {
    throw new Error(`HOLD: recognition allowlist drifted: ${JSON.stringify(kinds)}`);
  }
  return [...RECOGNITION_ALLOWLIST];
}

export function readUnmodified00117Bytes() {
  const abs = file00117Abs();
  const bytes = fs.readFileSync(abs);
  const text = bytes.toString("utf8");
  if (!text.includes("m2_notification_policy_foundation")) {
    throw new Error("HOLD: 00117 bytes are not the M2 notification policy foundation");
  }
  if (/INSERT\s+INTO\s+.*schema_migrations/i.test(text)) {
    throw new Error("HOLD: 00117 must not invent schema_migrations rows");
  }
  return { abs, bytes, text, sha256: sha256Buffer(bytes), byteLength: bytes.byteLength };
}

export function liveHasGroupPermissionCreateSql() {
  const sql = extractHasGroupPermissionCreateSql();
  if (!sql.includes("CREATE OR REPLACE FUNCTION public.has_group_permission")) {
    throw new Error("HOLD: Cut 3 live has_group_permission extract missing");
  }
  return sql;
}

export function liveEnqueueCreateSqlFrom00115() {
  const sql = extractEnqueueCreateSql();
  if (!sql.includes("CREATE OR REPLACE FUNCTION public.enqueue_outbound_notification(")) {
    throw new Error("HOLD: 00115 enqueue extract missing");
  }
  return sql;
}

export function stubLivePinFloorSqlSteps() {
  return [
    { id: "prerequisite_stub", basename: "floor-stub-core.sql", sql: STUB_CORE_SQL },
    { id: "regression_slice", basename: "floor-regression-slice.sql", sql: REGRESSION_SLICE_SQL },
    { id: "cut2_queue_slice", basename: "floor-cut2-queue-slice.sql", sql: CUT2_QUEUE_SLICE_SQL },
    {
      id: "live_has_group_permission_cut3",
      basename: "floor-live-hgp.sql",
      sql: liveHasGroupPermissionCreateSql(),
    },
    {
      id: "enqueue_outbound_notification_00115_extract",
      basename: "floor-live-enq.sql",
      sql: liveEnqueueCreateSqlFrom00115(),
    },
    {
      id: "remote_floor_ownership_and_acl",
      basename: "floor-live-acl.sql",
      sql: remoteFloorOwnershipAndAclSql(),
    },
  ];
}

export function assertStubFloorDoesNotReplayOrTransform() {
  const blob = stubLivePinFloorSqlSteps()
    .map((s) => s.sql)
    .join("\n");
  if (/CREATE OR REPLACE FUNCTION public\.unnest\(uuid\)/i.test(blob)) {
    throw new Error("HOLD: stub+live-pin floor must not install public.unnest(uuid) shim");
  }
  if (/unnest\(\s*get_user_group_ids\(\)\s*\)/i.test(blob)) {
    throw new Error("HOLD: stub+live-pin floor must not replay unnest(get_user_group_ids())");
  }
  if (/INSERT\s+INTO\s+.*schema_migrations/i.test(blob)) {
    throw new Error("HOLD: stub+live-pin floor must not invent schema_migrations rows");
  }
  if (/00030_enterprise_branches_committees|00057_profiles_rls_allow_co_members/.test(blob)) {
    throw new Error("HOLD: stub+live-pin floor must not use 00030/00057 transforms");
  }
  return true;
}

export function assertFloorDoesNotUseDisqualifiedRunners() {
  const src = fs.readFileSync(path.join(root, "scripts/lib/f3-db-push-stub-live-pin-floor.mjs"), "utf8");
  if (/applyRemoteManagementApiMigration\s*\(/.test(src)) {
    throw new Error("REFUSE: stub+live-pin floor must not call Management API apply");
  }
  if (/runDbQuery\s*\(/.test(src)) {
    throw new Error("REFUSE: stub+live-pin floor must not apply via supabase db query");
  }
  if (/runDbPushCandidate\s*\(/.test(src)) {
    throw new Error("REFUSE: stub+live-pin floor must not db-push 00117");
  }
  return true;
}

export function resolveHostedFloorMode(raw) {
  const mode = String(raw || HOSTED_DEFAULT_FLOOR_MODE).trim().toLowerCase();
  if (mode === FLOOR_MODES.STUB_LIVE_PIN || mode === "stub_live_pin" || mode === "stub") {
    return FLOOR_MODES.STUB_LIVE_PIN;
  }
  if (mode === FLOOR_MODES.GREENFIELD) {
    const err = new Error(GREENFIELD_DISALLOWED_FOR_THIS_AUTH);
    err.code = "F3_DBPUSH_GREENFIELD_DISALLOWED";
    throw err;
  }
  const err = new Error(`HOLD: unknown floor mode ${mode}; hosted default is ${FLOOR_MODES.STUB_LIVE_PIN}`);
  err.code = "F3_DBPUSH_FLOOR_MODE_HOLD";
  throw err;
}

const ALREADY_EXISTS_ERROR = /already exists|duplicate_object|duplicate_function|duplicate key/i;
export const STDERR_TAIL_MAX = 1600;

/**
 * psql ERROR lines only. NOTICE "extension already exists, skipping" must
 * not count as success when a later ERROR aborted ON_ERROR_STOP.
 */
export function extractPsqlErrorLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => {
      if (!line || /^\s*NOTICE:/i.test(line) || /^\s*WARNING:/i.test(line)) {
        return false;
      }
      return /(?:^|:\s*)ERROR:/i.test(line);
    });
}

export function resultStderrTail(result, max = STDERR_TAIL_MAX) {
  const stderr = String(result?.stderr || "");
  const stdout = String(result?.stdout || "");
  const text = stderr.length > 0 ? (stdout ? `${stderr}\n${stdout}` : stderr) : stdout;
  return text.length > max ? text.slice(-max) : text;
}

/**
 * Status 0 → ok. Nonzero: only `already` when every ERROR line is a
 * duplicate/already-exists. NOTICE matches are ignored. No ERROR lines
 * with status≠0 → fail closed.
 */
export function floorApplyOk(result) {
  if (Number(result?.status) === 0) {
    return { ok: true, already: false, errors: [], errorLines: [] };
  }
  const text = `${result?.stdout || ""}\n${result?.stderr || ""}`;
  const errors = extractPsqlErrorLines(text);
  if (errors.length === 0) {
    return { ok: false, already: false, errors, errorLines: errors };
  }
  const allAlready = errors.every((line) => ALREADY_EXISTS_ERROR.test(line));
  if (allAlready) return { ok: true, already: true, errors, errorLines: errors };
  return { ok: false, already: false, errors, errorLines: errors };
}

export function assertIsolatedWorkdirOnlyF3Forward(workdir) {
  const migDir = path.join(workdir, "supabase", "migrations");
  const names = fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
  const expected = F3_FORWARD_FILES.map((file) => timestampFilenameFor(file)).sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(
      `HOLD: isolated db-push workdir must contain only 00118–00123 copies; observed ${names.join(",")}`,
    );
  }
  if (names.some((n) => n.includes("00117") || /^(000|0010|0011[0-6])/.test(n))) {
    throw new Error("HOLD: isolated workdir leaked pre-00118 history files");
  }
  return { names, expected };
}

function writeFloorSqlDir(workdir) {
  const dir = path.join(workdir, "floor-sql");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Apply the documented stub+live-pin floor via gated disposable psql -f.
 * Floor SQL is written under workdir/floor-sql/ — never into
 * workdir/supabase/migrations (that tree stays 00118–00123 only).
 */
export function installStubLivePinFloor({ workdir } = {}) {
  if (!workdir) throw new Error("HOLD: isolated workdir required for stub+live-pin floor");
  assertFloorDoesNotUseDisqualifiedRunners();
  assertStubFloorDoesNotReplayOrTransform();
  const isolatedMigrations = assertIsolatedWorkdirOnlyF3Forward(workdir);
  const floorDir = writeFloorSqlDir(workdir);
  const steps = [];
  const file00117 = readUnmodified00117Bytes();

  for (const step of stubLivePinFloorSqlSteps()) {
    const abs = writeGatedSqlFile(floorDir, step.basename, step.sql);
    const applied = runGatedRemoteSqlFile(abs);
    const ok = floorApplyOk(applied);
    steps.push({
      id: step.id,
      runner: "gated_psql_file",
      file: path.basename(abs),
      status: applied.status,
      ok: ok.ok,
      already: ok.already,
      stderrTail: resultStderrTail(applied),
      errors: ok.errors,
    });
    if (!ok.ok) {
      return {
        installed: false,
        exact: false,
        mode: FLOOR_MODES.STUB_LIVE_PIN,
        label: QUALIFICATION_FLOOR_LABEL,
        authority: STUB_LIVE_PIN_FLOOR_AUTHORITY,
        components: [...DISCLOSED_STUB_LIVE_PIN_COMPONENTS],
        cleanReplay00001_00117: false,
        productionEquivalent: false,
        invented00117History: false,
        file00117: { sha256: file00117.sha256, byteLength: file00117.byteLength },
        isolatedMigrations,
        steps,
        failedAt: step.id,
        hold: STUB_LIVE_PIN_FLOOR_HOLD,
      };
    }
  }

  const dest00117 = path.join(floorDir, FILE_00117);
  fs.writeFileSync(dest00117, file00117.bytes);
  const copied = fs.readFileSync(dest00117);
  if (sha256Buffer(copied) !== file00117.sha256 || copied.byteLength !== file00117.byteLength) {
    throw new Error("HOLD: 00117 floor-sql copy is not byte-identical to repo");
  }
  const applied00117 = runGatedRemoteSqlFile(dest00117);
  const ok00117 = floorApplyOk(applied00117);
  steps.push({
    id: "unmodified_00117_gated_psql",
    runner: "gated_psql_file",
    file: FILE_00117,
    status: applied00117.status,
    ok: ok00117.ok,
    already: ok00117.already,
    stderrTail: resultStderrTail(applied00117),
    errors: ok00117.errors,
    sha256: file00117.sha256,
    notManagementApi: true,
    notDbPush: true,
  });
  if (!ok00117.ok) {
    return {
      installed: false,
      exact: false,
      mode: FLOOR_MODES.STUB_LIVE_PIN,
      label: QUALIFICATION_FLOOR_LABEL,
      authority: STUB_LIVE_PIN_FLOOR_AUTHORITY,
      components: [...DISCLOSED_STUB_LIVE_PIN_COMPONENTS],
      cleanReplay00001_00117: false,
      productionEquivalent: false,
      invented00117History: false,
      file00117: { sha256: file00117.sha256, byteLength: file00117.byteLength },
      isolatedMigrations,
      steps,
      failedAt: "unmodified_00117_gated_psql",
      hold: STUB_LIVE_PIN_FLOOR_HOLD,
    };
  }

  const after = assertIsolatedWorkdirOnlyF3Forward(workdir);
  return {
    installed: true,
    exact: true,
    mode: FLOOR_MODES.STUB_LIVE_PIN,
    label: QUALIFICATION_FLOOR_LABEL,
    authority: STUB_LIVE_PIN_FLOOR_AUTHORITY,
    components: [...DISCLOSED_STUB_LIVE_PIN_COMPONENTS],
    cleanReplay00001_00117: false,
    productionEquivalent: false,
    invented00117History: false,
    file00117: { sha256: file00117.sha256, byteLength: file00117.byteLength },
    isolatedMigrations: after,
    steps,
    failedAt: null,
    hold: null,
    shimInstalled: false,
    transforms: { "00030": false, "00057": false },
  };
}

export const PRE_DB_PUSH_VERIFICATION_SQL = `
SELECT jsonb_build_object(
  'hgp', (
    SELECT jsonb_build_object(
      'count', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = 'has_group_permission'),
      'ident', pg_get_function_identity_arguments(p.oid),
      'result', pg_get_function_result(p.oid),
      'owner', pg_get_userbyid(p.proowner),
      'definer', p.prosecdef,
      'cfg', p.proconfig,
      'def_md5', md5(pg_get_functiondef(p.oid)),
      'src_md5', md5(p.prosrc)
    )
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'has_group_permission'
    LIMIT 1
  ),
  'hgp_acl', (
    SELECT coalesce(jsonb_agg(part ORDER BY part), '[]'::jsonb)
    FROM (
      SELECT concat_ws('|',
        CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname END,
        a.privilege_type, go.rolname,
        CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END) AS part
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      LEFT JOIN pg_roles gr ON gr.oid = a.grantee
      LEFT JOIN pg_roles go ON go.oid = a.grantor
      WHERE n.nspname = 'public' AND p.proname = 'has_group_permission'
        AND a.privilege_type = 'EXECUTE'
    ) q
  ),
  'enqueue', (
    SELECT jsonb_build_object(
      'count', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = 'enqueue_outbound_notification'),
      'ident', pg_get_function_identity_arguments(p.oid),
      'result', pg_get_function_result(p.oid),
      'owner', pg_get_userbyid(p.proowner),
      'definer', p.prosecdef,
      'cfg', p.proconfig,
      'def_md5', md5(pg_get_functiondef(p.oid)),
      'src_md5', md5(p.prosrc)
    )
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'enqueue_outbound_notification'
    LIMIT 1
  ),
  'enqueue_acl', (
    SELECT coalesce(jsonb_agg(part ORDER BY part), '[]'::jsonb)
    FROM (
      SELECT concat_ws('|',
        CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname END,
        a.privilege_type, go.rolname,
        CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END) AS part
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      LEFT JOIN pg_roles gr ON gr.oid = a.grantee
      LEFT JOIN pg_roles go ON go.oid = a.grantor
      WHERE n.nspname = 'public' AND p.proname = 'enqueue_outbound_notification'
        AND a.privilege_type = 'EXECUTE'
    ) q
  ),
  'queue_table_acl', (
    SELECT coalesce(jsonb_agg(part ORDER BY part), '[]'::jsonb)
    FROM (
      SELECT concat_ws('|',
        CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname END,
        a.privilege_type, go.rolname,
        CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END) AS part
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
      LEFT JOIN pg_roles gr ON gr.oid = a.grantee
      LEFT JOIN pg_roles go ON go.oid = a.grantor
      WHERE n.nspname = 'public' AND c.relname = 'notifications_queue'
    ) q
  ),
  'queue_col_acl', (
    SELECT coalesce(jsonb_agg(part ORDER BY part), '[]'::jsonb)
    FROM (
      SELECT concat_ws('|', att.attname,
        CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname END,
        a.privilege_type, go.rolname,
        CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END) AS part
      FROM pg_attribute att
      JOIN pg_class c ON c.oid = att.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN LATERAL aclexplode(att.attacl) a ON att.attacl IS NOT NULL
      LEFT JOIN pg_roles gr ON gr.oid = a.grantee
      LEFT JOIN pg_roles go ON go.oid = a.grantor
      WHERE n.nspname = 'public' AND c.relname = 'notifications_queue'
        AND att.attnum > 0 AND NOT att.attisdropped AND att.attacl IS NOT NULL
    ) q
  ),
  'policy_tables', (
    SELECT coalesce(string_agg(c.relname, ',' ORDER BY c.relname), '')
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname LIKE 'notification_polic%'
  ),
  'force_rls', (
    SELECT bool_and(c.relrowsecurity AND c.relforcerowsecurity)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN (
      'notification_policies','notification_policy_triggers','notification_policy_occurrences'
    )
  ),
  'policy_row_counts', (
    SELECT jsonb_build_object(
      'policies', (SELECT count(*) FROM public.notification_policies),
      'triggers', (SELECT count(*) FROM public.notification_policy_triggers),
      'occurrences', (SELECT count(*) FROM public.notification_policy_occurrences)
    )
  ),
  'f3_objects_absent', (
    to_regnamespace('financial_private') IS NULL
    AND to_regnamespace('financial_core') IS NULL
    AND to_regclass('public.financial_ledger_epochs') IS NULL
    AND to_regclass('public.financial_accounts') IS NULL
    AND to_regprocedure('public.post_financial_command(jsonb)') IS NULL
    AND to_regprocedure('public.correct_financial_event(jsonb)') IS NULL
    AND to_regprocedure('public.post_financial_opening_cash(jsonb)') IS NULL
  ),
  'unnest_uuid_shim_absent', (
    to_regprocedure('public.unnest(uuid)') IS NULL
  ),
  'history_rows', (
    CASE
      WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN '[]'::jsonb
      ELSE (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'version', version, 'name', coalesce(name, '')
        ) ORDER BY version), '[]'::jsonb)
        FROM supabase_migrations.schema_migrations
      )
    END
  )
)::text
`;

function asList(value) {
  if (Array.isArray(value)) return [...value].map(String).sort();
  if (value == null) return [];
  return [String(value)].sort();
}

function sameSet(actual, expected) {
  return JSON.stringify(asList(actual)) === JSON.stringify(asList(expected));
}

export function passingPreDbPushFixture() {
  return {
    hgp: {
      count: 1,
      ident: "gid uuid, perm_key text, uid uuid",
      result: "boolean",
      owner: "postgres",
      definer: true,
      cfg: ['search_path=""'],
      def_md5: LIVE_HGP_DEF_MD5,
      src_md5: LIVE_HGP_SRC_MD5,
    },
    hgp_acl: [...EXPECTED_HGP_EXECUTE_ACL],
    enqueue: {
      count: 1,
      ident:
        "p_notification_type text, p_domain_object_id uuid, p_channel notification_channel, p_recipient_membership_id uuid, p_locale text",
      result: "TABLE(queue_id uuid, result text)",
      owner: "postgres",
      definer: true,
      cfg: ['search_path=""'],
      def_md5: LIVE_ENQ_DEF_MD5,
      src_md5: LIVE_ENQ_SRC_MD5,
    },
    enqueue_acl: [...EXPECTED_ENQUEUE_EXECUTE_ACL],
    queue_table_acl: [...LIVE_QUEUE_TABLE_ACL],
    queue_col_acl: [...LIVE_QUEUE_COL_ACL],
    policy_tables: "notification_policies,notification_policy_occurrences,notification_policy_triggers",
    force_rls: true,
    policy_row_counts: { policies: 0, triggers: 0, occurrences: 0 },
    f3_objects_absent: true,
    unnest_uuid_shim_absent: true,
    history_rows: [],
  };
}

export function evaluatePreDbPushGates({
  captured,
  recognition = recognitionFromSourcePin(),
  frozenDigests = assertFrozenDigestsOnDisk(),
  isolatedWorkdir = null,
  invented00117History = false,
} = {}) {
  const gates = [];
  const fail = (id, detail) => {
    gates.push({ id, ok: false, detail });
  };
  const pass = (id, detail) => {
    gates.push({ id, ok: true, detail });
  };

  const hgp = captured?.hgp || {};
  if (
    Number(hgp.count) === 1 &&
    hgp.ident === "gid uuid, perm_key text, uid uuid" &&
    hgp.def_md5 === LIVE_HGP_DEF_MD5 &&
    hgp.src_md5 === LIVE_HGP_SRC_MD5 &&
    hgp.owner === "postgres" &&
    hgp.definer === true
  ) {
    pass("hgp_md5", `${hgp.def_md5}|${hgp.src_md5}`);
  } else {
    fail("hgp_md5", JSON.stringify(hgp));
  }
  if (sameSet(captured?.hgp_acl, EXPECTED_HGP_EXECUTE_ACL)) {
    pass("hgp_acl", asList(captured.hgp_acl).join(","));
  } else {
    fail("hgp_acl", asList(captured?.hgp_acl).join(","));
  }

  const enq = captured?.enqueue || {};
  if (
    Number(enq.count) === 1 &&
    enq.def_md5 === LIVE_ENQ_DEF_MD5 &&
    enq.src_md5 === LIVE_ENQ_SRC_MD5 &&
    enq.owner === "postgres" &&
    enq.definer === true
  ) {
    pass("enqueue_md5", `${enq.def_md5}|${enq.src_md5}`);
  } else {
    fail("enqueue_md5", JSON.stringify(enq));
  }
  if (sameSet(captured?.enqueue_acl, EXPECTED_ENQUEUE_EXECUTE_ACL)) {
    pass("enqueue_acl", asList(captured.enqueue_acl).join(","));
  } else {
    fail("enqueue_acl", asList(captured?.enqueue_acl).join(","));
  }

  if (sameSet(captured?.queue_table_acl, LIVE_QUEUE_TABLE_ACL)) {
    pass("queue_table_acl", "exact");
  } else {
    fail("queue_table_acl", asList(captured?.queue_table_acl).join(","));
  }
  if (sameSet(captured?.queue_col_acl, LIVE_QUEUE_COL_ACL)) {
    pass("queue_col_acl", "exact");
  } else {
    fail("queue_col_acl", asList(captured?.queue_col_acl).join(","));
  }

  const tables = String(captured?.policy_tables || "");
  const rows = captured?.policy_row_counts || {};
  if (
    tables === "notification_policies,notification_policy_occurrences,notification_policy_triggers" &&
    (captured?.force_rls === true || captured?.force_rls === "t") &&
    Number(rows.policies) === 0 &&
    Number(rows.triggers) === 0 &&
    Number(rows.occurrences) === 0
  ) {
    pass("m2_00117_postconditions", tables);
  } else {
    fail("m2_00117_postconditions", JSON.stringify({ tables, force_rls: captured?.force_rls, rows }));
  }

  if (captured?.f3_objects_absent === true || captured?.f3_objects_absent === "t") {
    pass("f3_absent", "absent");
  } else {
    fail("f3_absent", String(captured?.f3_objects_absent));
  }

  if (JSON.stringify(recognition) === JSON.stringify([...RECOGNITION_ALLOWLIST])) {
    pass("recognition", JSON.stringify(recognition));
  } else {
    fail("recognition", JSON.stringify(recognition));
  }

  const history = Array.isArray(captured?.history_rows) ? captured.history_rows : [];
  const invented = invented00117History || history.some((row) => {
    const version = String(row?.version || "");
    const name = String(row?.name || "");
    return version === "00117" || name.includes("m2_notification_policy_foundation") || version === "20260912174049";
  });
  if (history.length === 0 && !invented) {
    pass("history_empty", "[]");
  } else {
    fail("history_empty", JSON.stringify(history));
  }

  const residue =
    captured?.unnest_uuid_shim_absent === true || captured?.unnest_uuid_shim_absent === "t";
  if (residue && history.every((row) => !/^(000|0010|0011[0-6])/.test(String(row?.version || "")))) {
    pass("no_residue", "no shim / no pre-00117 history");
  } else {
    fail("no_residue", JSON.stringify({ shim: captured?.unnest_uuid_shim_absent, history }));
  }

  try {
    const observed = frozenDigests && Object.keys(frozenDigests).length
      ? frozenDigests
      : assertFrozenDigestsOnDisk();
    const expected = assertFrozenDigestsOnDisk();
    const ok = F3_FORWARD_FILES.every((file) => observed[file] === expected[file]);
    if (ok) pass("frozen_digests", "00118-00123 unchanged");
    else fail("frozen_digests", "digest drift");
  } catch (err) {
    fail("frozen_digests", String(err.message || err));
  }

  if (isolatedWorkdir) {
    try {
      const listed = assertIsolatedWorkdirOnlyF3Forward(isolatedWorkdir);
      pass("isolated_workdir_00118_00123_only", listed.names.join(","));
    } catch (err) {
      fail("isolated_workdir_00118_00123_only", String(err.message || err));
    }
  } else {
    pass("isolated_workdir_00118_00123_only", "not-checked");
  }

  const ok = gates.every((g) => g.ok);
  return {
    ok,
    hold: ok ? null : STUB_LIVE_PIN_FLOOR_HOLD,
    label: QUALIFICATION_FLOOR_LABEL,
    cleanReplay00001_00117: false,
    productionEquivalent: false,
    gates,
  };
}

export function stubLivePinFloorPrecheck() {
  const recognition = recognitionFromSourcePin();
  const frozenDigests = assertFrozenDigestsOnDisk();
  const file00117 = readUnmodified00117Bytes();
  assertStubFloorDoesNotReplayOrTransform();
  assertFloorDoesNotUseDisqualifiedRunners();
  return {
    mode: HOSTED_DEFAULT_FLOOR_MODE,
    label: QUALIFICATION_FLOOR_LABEL,
    authority: STUB_LIVE_PIN_FLOOR_AUTHORITY,
    components: [...DISCLOSED_STUB_LIVE_PIN_COMPONENTS],
    recognition,
    frozenDigests,
    file00117: { sha256: file00117.sha256, byteLength: file00117.byteLength },
    cleanReplay00001_00117: false,
    productionEquivalent: false,
    invented00117History: false,
    greenfieldDisallowed: true,
    transformsDisallowed: true,
  };
}

/**
 * Local (loopback / f3_* ) apply of the same floor SQL + unmodified 00117.
 * Not hosted. Not db push. Not Management API. Used by the local proof script.
 */
export function installStubLivePinFloorLocal({ url, workdir, psql, psqlFile } = {}) {
  if (!url) throw new Error("HOLD: local work URL required");
  if (!workdir) throw new Error("HOLD: local workdir required");
  if (typeof psql !== "function" || typeof psqlFile !== "function") {
    throw new Error("HOLD: local psql executors required");
  }
  assertStubFloorDoesNotReplayOrTransform();
  const floorDir = writeFloorSqlDir(workdir);
  const file00117 = readUnmodified00117Bytes();
  const steps = [];
  for (const step of stubLivePinFloorSqlSteps()) {
    const abs = path.join(floorDir, step.basename);
    fs.writeFileSync(abs, step.sql);
    try {
      psqlFile(url, abs);
      steps.push({ id: step.id, ok: true, runner: "local_psql_file" });
    } catch (err) {
      steps.push({ id: step.id, ok: false, error: String(err.message || err) });
      return {
        installed: false,
        exact: false,
        reached_00117: false,
        steps,
        failedAt: step.id,
        file00117: { sha256: file00117.sha256 },
        label: QUALIFICATION_FLOOR_LABEL,
      };
    }
  }
  const dest00117 = path.join(floorDir, FILE_00117);
  fs.writeFileSync(dest00117, file00117.bytes);
  try {
    psqlFile(url, dest00117);
    steps.push({ id: "unmodified_00117_gated_psql", ok: true, runner: "local_psql_file", sha256: file00117.sha256 });
  } catch (err) {
    steps.push({ id: "unmodified_00117_gated_psql", ok: false, error: String(err.message || err) });
    return {
      installed: false,
      exact: false,
      reached_00117: false,
      steps,
      failedAt: "unmodified_00117_gated_psql",
      file00117: { sha256: file00117.sha256 },
      label: QUALIFICATION_FLOOR_LABEL,
    };
  }
  const history = psql(
    url,
    `SELECT CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN 0
                ELSE (SELECT count(*) FROM supabase_migrations.schema_migrations) END`,
  );
  return {
    installed: true,
    exact: true,
    reached_00117: true,
    steps,
    failedAt: null,
    file00117: { sha256: file00117.sha256, byteLength: file00117.byteLength },
    invented00117History: Number(history) > 0,
    historyCount: Number(history),
    label: QUALIFICATION_FLOOR_LABEL,
    cleanReplay00001_00117: false,
    productionEquivalent: false,
  };
}
