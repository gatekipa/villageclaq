/**
 * Pre-00118 floor for the db push qualification candidate.
 *
 * Uses repository-controlled floor authority: bootstrap + migrations
 * through 00117 as listed by `_f3_apply_current_main_floor.mjs`.
 * This is NOT the candidate runner (not db push of 00118–00123).
 *
 * Floor SQL is applied via the gated remote `psql -f` executor
 * (`f3-db-push-remote-sql-file.mjs`) — the same multi-statement authority
 * as `_f3_apply_current_main_floor.mjs`. `supabase db query --file` is
 * forbidden for floor files (Chief hosted HOLD: prepared-statement
 * multi-command rejection). If the exact pre-00118 state cannot be
 * reproduced → HOLD.
 *
 * Recognition allowlist remains exactly ["manual_income"] (source pin;
 * F3 objects must be absent at the floor).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractHasGroupPermissionCreateSql } from "../_m2_apply_disposable_floor.mjs";
import { BOOTSTRAP, listMainMigrationsThrough00117 } from "../_f3_apply_current_main_floor.mjs";
import { RECOGNITION_ALLOWLIST } from "./f3-db-push-pins.mjs";
import { runGatedRemoteSqlFile, writeGatedSqlFile } from "./f3-db-push-remote-sql-file.mjs";
import { assertFrozenDigestsOnDisk } from "./f3-db-push-version-map.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

export const FLOOR_AUTHORITY =
  "repository-controlled floor through 00117 via existing `_f3_apply_current_main_floor.mjs` file list + bootstrap + installLiveHasGroupPermission before 00116/00117; applied with gated remote psql -f against the session-mode pooler URL (NOT db query --file, NOT db push, NOT Management API apply)";

export const FLOOR_HOLD_IF_INEXACT =
  "HOLD: exact legitimate VillageClaq state immediately before 00118 could not be reproduced from repository-controlled floor authority";

export const CATALOG_FINGERPRINT_SQL = `
SELECT jsonb_build_object(
  'schema', (
    SELECT coalesce(string_agg(nspname || ':' || pg_get_userbyid(nspowner), ',' ORDER BY nspname), '')
    FROM pg_namespace WHERE nspname IN ('financial_core','financial_private')
  ),
  'function_owner', (
    SELECT coalesce(string_agg(
      n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' ||
      pg_get_userbyid(p.proowner) || ':' || p.prosecdef::text || ':' || coalesce(p.proconfig::text, ''),
      ',' ORDER BY 1), '')
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public','financial_core','financial_private')
      AND (n.nspname LIKE 'financial_%' OR p.proname ~ 'financial|f3_|guard_ledger')
  ),
  'acl', (
    SELECT coalesce(string_agg(part, ',' ORDER BY part), '') FROM (
      SELECT n.nspname || '.' || c.relname || ':' || coalesce(c.relacl::text, '') AS part
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND (n.nspname IN ('financial_core','financial_private')
             OR (n.nspname = 'public' AND c.relname LIKE 'financial_%'))
      UNION ALL
      SELECT n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' ||
             coalesce(p.proacl::text, '')
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('public','financial_core','financial_private')
        AND (n.nspname LIKE 'financial_%' OR p.proname ~ 'financial|f3_|guard_ledger')
    ) a
  ),
  'policy', (
    SELECT coalesce(string_agg(
      schemaname || '.' || tablename || '.' || policyname || ':' || cmd || ':' ||
      coalesce(roles::text, '') || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''),
      ',' ORDER BY 1), '')
    FROM pg_policies
    WHERE schemaname IN ('public','financial_core','financial_private')
      AND (tablename LIKE 'financial_%' OR schemaname LIKE 'financial_%')
  ),
  'f3_objects_absent', (
    to_regnamespace('financial_private') IS NULL
    AND to_regnamespace('financial_core') IS NULL
    AND to_regclass('public.financial_ledger_epochs') IS NULL
    AND to_regclass('public.financial_accounts') IS NULL
    AND to_regprocedure('public.post_financial_command(jsonb)') IS NULL
    AND to_regprocedure('public.correct_financial_event(jsonb)') IS NULL
    AND to_regprocedure('public.post_financial_opening_cash(jsonb)') IS NULL
  )
)::text
`;

export const RECOGNITION_SOURCE_SQL = `
SELECT '${RECOGNITION_ALLOWLIST[0]}'::text AS recognition_allowlist_pin;
`;

export function listFloorMigrationsThrough00117() {
  const files = listMainMigrationsThrough00117();
  if (files.some((f) => /^0011[89]_/.test(f) || /^0012[0-3]_/.test(f))) {
    throw new Error("REFUSE: floor file list leaked 00118–00123");
  }
  if (!files.includes("00117_m2_notification_policy_foundation.sql")) {
    throw new Error("HOLD: floor list is missing 00117");
  }
  return files;
}

export function floorFileAbsPath(name) {
  return path.join(root, "supabase/migrations", name);
}

export function readFloorBootstrapSql() {
  if (!BOOTSTRAP || !BOOTSTRAP.includes("CREATE EXTENSION IF NOT EXISTS pgcrypto")) {
    throw new Error("HOLD: repository floor bootstrap is missing");
  }
  return BOOTSTRAP;
}

export function assertFloorDoesNotUseCandidateRunner() {
  const src = fs.readFileSync(path.join(root, "scripts/lib/f3-db-push-floor.mjs"), "utf8");
  if (/applyRemoteManagementApiMigration\s*\(/.test(src)) {
    throw new Error("REFUSE: floor module must not call Management API apply");
  }
  if (/runDbQuery\s*\(/.test(src)) {
    throw new Error("REFUSE: floor module must not apply via supabase db query");
  }
  return true;
}

/**
 * Same live HGP pin as `installLiveHasGroupPermission` in
 * `f3-forward-prerequisites.mjs`. ubuntu REVOKE is skipped when that
 * local-only role is absent on hosted Supabase.
 */
export function liveHasGroupPermissionSql() {
  return (
    extractHasGroupPermissionCreateSql() +
    `
ALTER FUNCTION public.has_group_permission(uuid, text, uuid) OWNER TO postgres;
DO $hgp$
BEGIN
  REVOKE ALL ON FUNCTION public.has_group_permission(uuid, text, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.has_group_permission(uuid, text, uuid) FROM anon;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ubuntu') THEN
    REVOKE ALL ON FUNCTION public.has_group_permission(uuid, text, uuid) FROM ubuntu;
  END IF;
END
$hgp$;
GRANT EXECUTE ON FUNCTION public.has_group_permission(uuid, text, uuid)
  TO authenticated, service_role;
`
  );
}

export function installLiveHasGroupPermissionRemote(workdir) {
  const abs = writeGatedSqlFile(workdir, "floor-live-hgp.sql", liveHasGroupPermissionSql());
  return runGatedRemoteSqlFile(abs);
}

function floorApplyOk(result) {
  if (result.status === 0) return { ok: true, already: false };
  const text = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (/already exists|duplicate_object|duplicate_function/i.test(text)) {
    return { ok: true, already: true };
  }
  return { ok: false, already: false };
}

/**
 * Install bootstrap + 00001–00117 on the authorized disposable using
 * gated `psql -f`. Preserves HGP pin before 00116/00117 and after the
 * floor, matching `_f3_apply_current_main_floor.mjs`.
 */
export function installRepositoryControlledFloor({ workdir }) {
  if (!workdir) throw new Error("HOLD: isolated workdir required for floor install");
  assertFloorDoesNotUseCandidateRunner();
  const steps = [];
  const bootstrapFile = writeGatedSqlFile(workdir, "floor-bootstrap.sql", readFloorBootstrapSql());
  const boot = runGatedRemoteSqlFile(bootstrapFile);
  const bootOk = floorApplyOk(boot);
  steps.push({ id: "bootstrap", runner: "gated_psql_file", status: boot.status, ok: bootOk.ok, already: bootOk.already });
  if (!bootOk.ok) {
    return { installed: false, exact: false, steps, failedAt: "bootstrap" };
  }

  for (const file of listFloorMigrationsThrough00117()) {
    if (/^0011[6-7]_/.test(file)) {
      const hgp = installLiveHasGroupPermissionRemote(workdir);
      const hgpOk = floorApplyOk(hgp);
      steps.push({ id: `hgp-before-${file}`, runner: "gated_psql_file", status: hgp.status, ok: hgpOk.ok, already: hgpOk.already });
      if (!hgpOk.ok) {
        return { installed: false, exact: false, steps, failedAt: `hgp-before-${file}` };
      }
    }
    const applied = runGatedRemoteSqlFile(floorFileAbsPath(file));
    const ok = floorApplyOk(applied);
    steps.push({ id: file, runner: "gated_psql_file", status: applied.status, ok: ok.ok, already: ok.already });
    if (!ok.ok) {
      return { installed: false, exact: false, steps, failedAt: file };
    }
  }

  const hgpAfter = installLiveHasGroupPermissionRemote(workdir);
  const afterOk = floorApplyOk(hgpAfter);
  steps.push({ id: "hgp-after-00117", runner: "gated_psql_file", status: hgpAfter.status, ok: afterOk.ok, already: afterOk.already });
  if (!afterOk.ok) {
    return { installed: false, exact: false, steps, failedAt: "hgp-after-00117" };
  }
  return { installed: true, exact: true, steps, failedAt: null };
}

export function recognitionFromSource() {
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

export function floorPrecheck() {
  const files = listFloorMigrationsThrough00117();
  const recognition = recognitionFromSource();
  const digests = assertFrozenDigestsOnDisk();
  return {
    authority: FLOOR_AUTHORITY,
    files,
    fileCount: files.length,
    includes00117: files.includes("00117_m2_notification_policy_foundation.sql"),
    excludes00118plus: !files.some((f) => /^0011[89]_/.test(f) || /^0012[0-3]_/.test(f)),
    recognition,
    frozenDigests: digests,
    holdIfInexact: FLOOR_HOLD_IF_INEXACT,
  };
}
