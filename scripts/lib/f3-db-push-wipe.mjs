/**
 * Founder-authorized disposable wipe-to-baseline.
 *
 * Compare current disposable inventory to a clean baseline (stock
 * Supabase + empty schema_migrations leftover OR pure stock). Delete
 * ONLY objects/rows demonstrably from the failed 00001–00030 floor.
 * If anything is ambiguous → HOLD. Preserve managed schemas. Never
 * drop storage.buckets rows (00017 used ON CONFLICT DO NOTHING; stock
 * may already own those ids). Never touch production.
 *
 * This is NOT the 00118–00123 candidate runner.
 */
import {
  FAILED_FLOOR_AUTH_TRIGGER,
  FAILED_FLOOR_PUBLIC_FUNCTION_NAMES,
  FAILED_FLOOR_PUBLIC_TABLES,
  FAILED_FLOOR_PUBLIC_TYPES,
  FAILED_FLOOR_STORAGE_POLICY_NAMES,
  MANAGED_SCHEMAS,
  classifyInventory,
  isCleanBaseline,
} from "./f3-db-push-inventory.mjs";
import { PRODUCTION_REF } from "./f3-db-push-pins.mjs";

export const WIPE_HOLD =
  "HOLD: disposable state is ambiguous vs failed floor; refuse wipe";

export const WIPE_AUTHORITY =
  "founder-authorized wipe-to-baseline on jkorwnwwmdeflfntxntl only: drop objects demonstrably created by failed 00001–00029 + partial 00030 floor; preserve managed schemas; leave empty schema_migrations leftover; never drop storage.buckets; never touch llbnliixczcqfftxpsmb";

function ident(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function sqlLit(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

export function buildWipeSql(classification) {
  if (!classification || classification.verdict === "HOLD" || classification.ambiguous?.length) {
    const err = new Error(WIPE_HOLD);
    err.code = "F3_WIPE_AMBIGUOUS_HOLD";
    throw err;
  }
  if (classification.verdict === "CLEAN_BASELINE") {
    return {
      needed: false,
      sql: "SELECT 'already_clean_baseline'::text AS wipe_status;",
      drops: [],
    };
  }
  if (classification.verdict !== "WIPE_ELIGIBLE") {
    const err = new Error(WIPE_HOLD);
    err.code = "F3_WIPE_AMBIGUOUS_HOLD";
    throw err;
  }

  const drops = [];
  const stmts = [];
  stmts.push("-- VillageClaq disposable wipe-to-baseline");
  stmts.push("-- Failed-floor objects only. Managed schemas preserved.");
  stmts.push("-- Production project is never a target.");

  for (const schema of MANAGED_SCHEMAS) {
    stmts.push(`-- PRESERVE SCHEMA ${schema}`);
  }

  if (classification.authTrigger) {
    stmts.push(`DROP TRIGGER IF EXISTS ${ident(FAILED_FLOOR_AUTH_TRIGGER)} ON auth.users;`);
    drops.push({ kind: "trigger", name: `auth.users.${FAILED_FLOOR_AUTH_TRIGGER}` });
  }

  if (classification.unnestShim) {
    stmts.push("DROP FUNCTION IF EXISTS public.unnest(uuid);");
    drops.push({ kind: "function", name: "public.unnest(uuid)" });
  }

  for (const name of classification.failedStoragePolicies || []) {
    if (!FAILED_FLOOR_STORAGE_POLICY_NAMES.includes(name)) continue;
    stmts.push(`DROP POLICY IF EXISTS ${ident(name)} ON storage.objects;`);
    drops.push({ kind: "storage_policy", name });
  }

  for (const name of classification.failedTables || []) {
    if (!FAILED_FLOOR_PUBLIC_TABLES.includes(name)) continue;
    stmts.push(`DROP TABLE IF EXISTS public.${ident(name)} CASCADE;`);
    drops.push({ kind: "table", name: `public.${name}` });
  }

  for (const name of classification.failedFunctions || []) {
    if (name === "unnest") continue;
    if (!FAILED_FLOOR_PUBLIC_FUNCTION_NAMES.includes(name)) continue;
    stmts.push(`DO $wipe$
BEGIN
  EXECUTE coalesce((
    SELECT string_agg('DROP FUNCTION IF EXISTS ' || p.oid::regprocedure || ' CASCADE', '; ')
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ${sqlLit(name)}
  ), 'SELECT 1');
END
$wipe$;`);
    drops.push({ kind: "function", name: `public.${name}` });
  }

  for (const name of classification.failedTypes || []) {
    if (!FAILED_FLOOR_PUBLIC_TYPES.includes(name)) continue;
    stmts.push(`DROP TYPE IF EXISTS public.${ident(name)} CASCADE;`);
    drops.push({ kind: "type", name: `public.${name}` });
  }

  stmts.push("SELECT 'wipe_statements_emitted'::text AS wipe_status;");
  return { needed: true, sql: `${stmts.join("\n")}\n`, drops };
}

export function planWipe(inventory) {
  const classification = classifyInventory(inventory);
  if (classification.verdict === "CLEAN_BASELINE") {
    return {
      action: "NONE",
      classification,
      sql: buildWipeSql(classification),
      authority: WIPE_AUTHORITY,
    };
  }
  if (classification.verdict !== "WIPE_ELIGIBLE") {
    return {
      action: "HOLD",
      classification,
      sql: null,
      authority: WIPE_AUTHORITY,
      hold: WIPE_HOLD,
    };
  }
  return {
    action: "WIPE",
    classification,
    sql: buildWipeSql(classification),
    authority: WIPE_AUTHORITY,
  };
}

export function proveCleanBaseline(inventoryAfter) {
  const classification = classifyInventory(inventoryAfter);
  if (!isCleanBaseline(classification)) {
    const err = new Error(
      `HOLD: post-wipe inventory is not a clean baseline (${classification.verdict}: ${classification.reason})`,
    );
    err.code = "F3_WIPE_POSTCONDITION_HOLD";
    err.classification = classification;
    throw err;
  }
  return { ok: true, classification };
}

export function assertWipeDoesNotTouchProduction(sql) {
  if (new RegExp(PRODUCTION_REF, "i").test(String(sql || ""))) {
    throw new Error("REFUSE: wipe SQL mentioned production ref");
  }
  if (/DROP SCHEMA/i.test(String(sql || ""))) {
    throw new Error("REFUSE: wipe SQL must not DROP SCHEMA");
  }
  if (/storage\.buckets/i.test(String(sql || "")) && /DROP TABLE/i.test(String(sql || ""))) {
    throw new Error("REFUSE: wipe SQL must not drop storage.buckets");
  }
  return true;
}
