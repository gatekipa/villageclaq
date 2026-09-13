/**
 * Pre-00118 floor for the db push qualification candidate.
 *
 * Uses repository-controlled floor authority: bootstrap + migrations
 * through 00117 as listed by `_f3_apply_current_main_floor.mjs`.
 * This is NOT the candidate runner (not db push of 00118–00123).
 *
 * Floor SQL is applied via `supabase db query --db-url` after gates.
 * If the exact pre-00118 state cannot be reproduced → HOLD.
 *
 * Recognition allowlist remains exactly ["manual_income"] (source pin;
 * F3 objects must be absent at the floor).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BOOTSTRAP, listMainMigrationsThrough00117 } from "../_f3_apply_current_main_floor.mjs";
import { RECOGNITION_ALLOWLIST } from "./f3-db-push-pins.mjs";
import { assertFrozenDigestsOnDisk } from "./f3-db-push-version-map.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

export const FLOOR_AUTHORITY =
  "repository-controlled floor through 00117 via existing `_f3_apply_current_main_floor.mjs` file list + bootstrap; applied with supabase db query --db-url (NOT db push, NOT Management API apply)";

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
  if (/applyRemoteManagementApiMigration/.test(src)) {
    throw new Error("REFUSE: floor module must not call Management API apply");
  }
  return true;
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
