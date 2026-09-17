/**
 * Inventory capture helpers for disposable wipe-to-baseline.
 *
 * Preserves failed-run evidence. Classifies current disposable objects
 * against a clean baseline (stock Supabase + empty schema_migrations
 * leftover OR pure stock). Does not apply migrations.
 */
import { RECOGNITION_ALLOWLIST } from "./f3-db-push-pins.mjs";
import {
  AUTHENTICATED_HISTORY_KEYS,
  CANONICAL_FUNCTION_IDENTITY_SQL,
  FINITE_DEPENDENCY_ALLOWLIST,
  FINITE_OBJECT_ALLOWLIST,
  canonicalizeFunctionIdentity,
  isFinancialPrefixSelector,
  validateHistoryKeys,
  validateObjectAllowlist,
} from "./f3-db-push-qualification-reset-design.mjs";

export const MANAGED_SCHEMAS = Object.freeze([
  "auth",
  "storage",
  "realtime",
  "supabase_functions",
  "supabase_migrations",
  "extensions",
  "graphql",
  "graphql_public",
  "vault",
  "net",
  "cron",
  "pgbouncer",
  "pgmq",
  "pgsodium",
  "information_schema",
  "pg_catalog",
  "pg_toast",
]);

/**
 * Public tables created by repository floor 00001–00030.
 * Hosted failed floor applied 00001–00029 + partial 00030 (exchange_rates).
 * Later 00031–00117 tables are NOT in this list; if present → HOLD.
 */
export const FAILED_FLOOR_PUBLIC_TABLES = Object.freeze([
  "profiles",
  "organizations",
  "groups",
  "memberships",
  "group_positions",
  "position_assignments",
  "position_permissions",
  "invitations",
  "join_codes",
  "notifications",
  "contribution_types",
  "contribution_obligations",
  "payments",
  "events",
  "event_rsvps",
  "event_attendances",
  "hosting_rosters",
  "hosting_assignments",
  "hosting_swap_requests",
  "meeting_minutes",
  "relief_plans",
  "relief_enrollments",
  "relief_claims",
  "relief_payouts",
  "family_members",
  "member_transfers",
  "platform_staff",
  "subscription_plans",
  "vouchers",
  "voucher_usages",
  "contact_enquiries",
  "platform_audit_logs",
  "announcements",
  "announcement_deliveries",
  "savings_cycles",
  "savings_participants",
  "savings_contributions",
  "elections",
  "election_candidates",
  "election_options",
  "election_votes",
  "documents",
  "activity_feed",
  "feed_reactions",
  "payment_reminder_rules",
  "payment_reminders_sent",
  "fine_rules",
  "fines",
  "event_photos",
  "loan_requests",
  "loan_repayments",
  "projects",
  "project_contributions",
  "project_expenses",
  "project_milestones",
  "badges",
  "member_badges",
  "help_articles",
  "feedback",
  "feedback_votes",
  "changelogs",
  "group_audit_logs",
  "notifications_queue",
  "testimonials",
  "faqs",
  "disputes",
  "committees",
  "committee_members",
  "sub_group_transfers",
  "group_payment_config",
  "exchange_rates",
]);

export const FAILED_FLOOR_PUBLIC_TYPES = Object.freeze([
  "membership_role",
  "membership_standing",
  "invitation_status",
  "notification_type",
  "contribution_frequency",
  "obligation_status",
  "payment_method",
  "event_type",
  "recurrence_rule",
  "rsvp_response",
  "attendance_status",
  "checkin_method",
  "event_status",
  "rotation_type",
  "hosting_status",
  "swap_request_status",
  "minutes_status",
  "relief_event_type",
  "relief_contribution_frequency",
  "relief_claim_status",
  "family_relationship",
  "transfer_status",
  "platform_role",
  "plan_billing_period",
  "voucher_discount_type",
  "enquiry_status",
  "announcement_channel",
  "delivery_status",
  "savings_frequency",
  "savings_rotation_type",
  "savings_cycle_status",
  "savings_contribution_status",
  "election_type",
  "election_status",
  "document_category",
  "reminder_severity",
  "fine_trigger",
  "fine_status",
  "loan_status",
  "project_status",
  "feedback_type",
  "feedback_severity",
  "feedback_status",
  "notification_channel",
  "notification_queue_status",
]);

export const FAILED_FLOOR_PUBLIC_FUNCTION_NAMES = Object.freeze([
  "handle_new_user",
  "update_updated_at",
  "generate_obligations_for_type",
  "update_obligation_on_payment",
  "get_user_group_ids",
  "is_group_member",
  "is_group_admin",
  "create_proxy_member",
  "claim_proxy_membership",
  "get_member_phones",
  "is_group_owner",
  "is_platform_staff",
  "is_platform_super_admin",
]);

export const FAILED_FLOOR_STORAGE_POLICY_NAMES = Object.freeze([
  "Authenticated users can upload receipts",
  "Authenticated users can view receipts",
  "Authenticated users can delete own receipts",
  "Anyone can view avatars",
  "Authenticated users can upload avatars",
  "Users can update own avatars",
  "Users can delete own avatars",
  "Authenticated users can upload group documents",
  "Authenticated users can view group documents",
  "Authenticated users can delete group documents",
]);

/** Floor buckets that may remain after an incomplete prior wipe. Never drop via --wipe-to-baseline. */
export const FAILED_FLOOR_STORAGE_BUCKETS = Object.freeze([
  "avatars",
  "group-documents",
  "receipts",
]);

export const FAILED_FLOOR_AUTH_TRIGGER = "on_auth_user_created";

export const INVENTORY_CAPTURE_OBJECT_SQL = `jsonb_build_object(
  'recognition_pin', '${RECOGNITION_ALLOWLIST[0]}',
  'schemas', (
    SELECT coalesce(jsonb_agg(nspname ORDER BY nspname), '[]'::jsonb)
    FROM pg_namespace
    WHERE nspname NOT LIKE 'pg_temp%'
      AND nspname NOT LIKE 'pg_toast_temp%'
  ),
  'public_tables', (
    SELECT coalesce(jsonb_agg(relname ORDER BY relname), '[]'::jsonb)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  ),
  'public_views', (
    SELECT coalesce(jsonb_agg(relname ORDER BY relname), '[]'::jsonb)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
  ),
  'public_types', (
    SELECT coalesce(jsonb_agg(t.typname ORDER BY t.typname), '[]'::jsonb)
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typtype IN ('e', 'c')
      AND NOT EXISTS (
        SELECT 1 FROM pg_class c WHERE c.reltype = t.oid AND c.relkind = 'r'
      )
  ),
  'public_functions', (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'name', p.proname,
        'identity', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
      ) ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
    ), '[]'::jsonb)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  ),
  'unnest_uuid_shim', to_regprocedure('public.unnest(uuid)') IS NOT NULL,
  'auth_handle_new_user_trigger', EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth' AND c.relname = 'users' AND t.tgname = 'on_auth_user_created'
  ),
  'schema_migrations_present', to_regclass('supabase_migrations.schema_migrations') IS NOT NULL,
  'schema_migrations_rows', CASE
    WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN 0
    ELSE (SELECT count(*)::int FROM supabase_migrations.schema_migrations)
  END,
  'financial_private', to_regnamespace('financial_private') IS NOT NULL,
  'financial_core', to_regnamespace('financial_core') IS NOT NULL,
  'financial_ledger_epochs', to_regclass('public.financial_ledger_epochs') IS NOT NULL,
  'exchange_rates', to_regclass('public.exchange_rates') IS NOT NULL,
  'committees_budget_allocation', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'committees' AND column_name = 'budget_allocation'
  ),
  'organizations_base_country', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'base_country'
  ),
  'groups_group_level', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'groups' AND column_name = 'group_level'
  ),
  'storage_policies', (
    SELECT coalesce(jsonb_agg(policyname ORDER BY policyname), '[]'::jsonb)
    FROM pg_policies
    WHERE schemaname = 'storage'
  ),
  'storage_buckets', (
    SELECT CASE
      WHEN to_regclass('storage.buckets') IS NULL THEN '[]'::jsonb
      ELSE coalesce((SELECT jsonb_agg(id ORDER BY id) FROM storage.buckets), '[]'::jsonb)
    END
  )
)`;

export const INVENTORY_CAPTURE_SQL = `
SELECT ${INVENTORY_CAPTURE_OBJECT_SQL}::text
`;

function sqlInventoryString(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function allowlistPresenceProbe(row) {
  const id = sqlInventoryString(row.identity);
  if (row.kind === "function") return `to_regprocedure(${id}) IS NOT NULL`;
  if (row.kind === "table" || row.kind === "sequence") return `to_regclass(${id}) IS NOT NULL`;
  if (row.kind === "type") return `to_regtype(${id}) IS NOT NULL`;
  if (row.kind === "schema") return `to_regnamespace(${id}) IS NOT NULL`;
  if (row.kind === "extension") return `EXISTS (SELECT 1 FROM pg_extension WHERE extname = ${id})`;
  return "false";
}

const ALLOWLIST_PRESENCE_VALUES = FINITE_OBJECT_ALLOWLIST
  .map((row) => `      (${sqlInventoryString(row.identity)}, ${allowlistPresenceProbe(row)})`)
  .join(",\n");

const NAMED_DEPENDENCY_IDENTITIES = FINITE_DEPENDENCY_ALLOWLIST
  .map((dep) => dep.identity)
  .filter((identity) => identity && !/[\s>]/.test(identity));

export const QUALIFICATION_RESET_INVENTORY_SCHEMA = "f13-qualification-reset-inventory-v1";
export const QUALIFICATION_RESET_INVENTORY_SCHEMA_VERSION = 1;
export const QUALIFICATION_RESET_INVENTORY_MANDATORY_FIELDS = Object.freeze([
  "schema",
  "schema_version",
  "inventory_capture_sql",
  "inventory",
  "discovered_objects",
  "discovered_dependencies",
  "observed_objects",
  "observed_dependencies",
  "observed_history_rows",
  "capture_complete",
]);
export const QUALIFICATION_RESET_INVENTORY_INVENTORY_FIELDS = Object.freeze([
  "recognition_pin",
  "schemas",
  "public_tables",
  "public_views",
  "public_types",
  "public_functions",
  "unnest_uuid_shim",
  "auth_handle_new_user_trigger",
  "schema_migrations_present",
  "schema_migrations_rows",
  "financial_private",
  "financial_core",
  "financial_ledger_epochs",
  "exchange_rates",
  "committees_budget_allocation",
  "organizations_base_country",
  "groups_group_level",
  "storage_policies",
  "storage_buckets",
]);

/**
 * Machine-readable psql framing for inventory capture. `-X` ignores
 * ~/.psqlrc; `-q -t -A` is tuples-only unaligned; isolated HOME/PSQLRC
 * prevent user startup/output config from changing framing.
 */
export const QUALIFICATION_RESET_INVENTORY_PSQL_ARGV = Object.freeze([
  "-X",
  "-q",
  "-t",
  "-A",
  "-w",
  "-v",
  "ON_ERROR_STOP=1",
]);

export const QUALIFICATION_RESET_INVENTORY_PSQL_ISOLATED_ENV_KEYS = Object.freeze([
  "PGHOST",
  "PGPORT",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
  "PGSSLMODE",
  "PGCONNECT_TIMEOUT",
  "PATH",
  "HOME",
  "PSQLRC",
  "PAGER",
]);

export function buildQualificationResetInventoryPsqlCommand({
  sqlFile = "[FILE]",
  isolatedHome = "[ISOLATED_HOME]",
} = {}) {
  return {
    command: "psql",
    argv: [...QUALIFICATION_RESET_INVENTORY_PSQL_ARGV, "-f", sqlFile],
    envKeys: [...QUALIFICATION_RESET_INVENTORY_PSQL_ISOLATED_ENV_KEYS],
    isolatedHome,
    psqlrc: `${isolatedHome}/.psqlrc`,
    ignoreUserPsqlrc: true,
    tuplesOnlyUnaligned: true,
    onErrorStop: true,
    readOnlyCapture: true,
  };
}

const DISCOVERED_OBJECT_SQL = `(
    SELECT coalesce(jsonb_agg(obj ORDER BY obj->>'kind', obj->>'identity'), '[]'::jsonb)
    FROM (
      SELECT jsonb_build_object(
        'kind', 'table',
        'identity', n.nspname || '.' || c.relname
      ) AS obj
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public', 'financial_core', 'financial_private')
        AND c.relkind = 'r'
      UNION ALL
      SELECT jsonb_build_object(
        'kind', 'view',
        'identity', n.nspname || '.' || c.relname
      )
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public', 'financial_core', 'financial_private')
        AND c.relkind = 'v'
      UNION ALL
      SELECT jsonb_build_object(
        'kind', 'sequence',
        'identity', n.nspname || '.' || c.relname
      )
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public', 'financial_core', 'financial_private')
        AND c.relkind = 'S'
      UNION ALL
      SELECT jsonb_build_object(
        'kind', 'type',
        'identity', n.nspname || '.' || t.typname
      )
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname IN ('public', 'financial_core', 'financial_private')
        AND t.typtype IN ('e', 'c')
        AND NOT EXISTS (
          SELECT 1 FROM pg_class c WHERE c.reltype = t.oid AND c.relkind = 'r'
        )
      UNION ALL
      SELECT jsonb_build_object(
        'kind', 'function',
        'identity', ${CANONICAL_FUNCTION_IDENTITY_SQL}
      )
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('public', 'financial_core', 'financial_private')
      UNION ALL
      SELECT jsonb_build_object(
        'kind', 'schema',
        'identity', n.nspname
      )
      FROM pg_namespace n
      WHERE n.nspname IN ('financial_core', 'financial_private')
      UNION ALL
      SELECT jsonb_build_object(
        'kind', 'extension',
        'identity', e.extname
      )
      FROM pg_extension e
      WHERE e.extname = 'btree_gist'
    ) discovered
  )`;

const DISCOVERED_DEPENDENCY_SQL = `(
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'kind', 'foreign_key',
        'identity', con.conname,
        'from', n.nspname || '.' || rel.relname,
        'to', fn.nspname || '.' || frel.relname
      ) ORDER BY con.conname
    ), '[]'::jsonb)
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    JOIN pg_class frel ON frel.oid = con.confrelid
    JOIN pg_namespace fn ON fn.oid = frel.relnamespace
    WHERE con.contype = 'f'
      AND n.nspname IN ('public', 'financial_core', 'financial_private')
  )`;

/**
 * Reset inventory: existing INVENTORY_CAPTURE_SQL object plus the
 * complete discovered object/dependency universe (not allowlist-only
 * presence probes). Classification against FINITE_* allowlists happens
 * after discovery. Used by --qualification-reset. Not a wipe selector.
 */
export const QUALIFICATION_RESET_INVENTORY_CAPTURE_SQL = `
SELECT jsonb_build_object(
  'schema', '${QUALIFICATION_RESET_INVENTORY_SCHEMA}',
  'schema_version', ${QUALIFICATION_RESET_INVENTORY_SCHEMA_VERSION},
  'inventory_capture_sql', 'scripts/lib/f3-db-push-inventory.mjs INVENTORY_CAPTURE_SQL',
  'capture_complete', true,
  'inventory', ${INVENTORY_CAPTURE_OBJECT_SQL},
  'discovered_objects', ${DISCOVERED_OBJECT_SQL},
  'discovered_dependencies', ${DISCOVERED_DEPENDENCY_SQL},
  'observed_objects', ${DISCOVERED_OBJECT_SQL},
  'observed_dependencies', ${DISCOVERED_DEPENDENCY_SQL},
  'allowlist_presence', (
    SELECT coalesce(jsonb_agg(identity ORDER BY identity), '[]'::jsonb)
    FROM (
      VALUES
${ALLOWLIST_PRESENCE_VALUES}
    ) AS t(identity, present)
    WHERE present
  ),
  'observed_history_rows', (
    SELECT CASE
      WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN '[]'::jsonb
      ELSE coalesce((
        SELECT jsonb_agg(jsonb_build_object('version', version::text, 'name', name) ORDER BY version)
        FROM supabase_migrations.schema_migrations
      ), '[]'::jsonb)
    END
  )
)::text
`;

export function deriveObservedObjectsFromInventoryCapture(inventory = {}) {
  const objects = [];
  for (const name of asList(inventory.public_tables)) objects.push(`public.${name}`);
  for (const name of asList(inventory.public_types)) objects.push(`public.${name}`);
  const functions = Array.isArray(inventory.public_functions) ? inventory.public_functions : [];
  for (const fn of functions) {
    if (fn && fn.identity) objects.push(canonicalizeFunctionIdentity(String(fn.identity)));
    else if (fn && fn.name) objects.push(`public.${fn.name}`);
  }
  if (inventory.financial_core) objects.push("financial_core");
  if (inventory.financial_private) objects.push("financial_private");
  if (inventory.financial_ledger_epochs) objects.push("public.financial_ledger_epochs");
  return objects;
}

function captureFail(code, reason, extra = {}) {
  return {
    ok: false,
    inventoryCaptured: false,
    alreadyClean: false,
    eligible: false,
    code,
    reason,
    ...extra,
  };
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function identityFromDiscovered(item) {
  if (typeof item === "string") return item;
  if (item && typeof item.identity === "string") {
    return item.kind === "function" ? canonicalizeFunctionIdentity(item.identity) : item.identity;
  }
  return null;
}

export function looksLikeAlignedPsqlFraming(text) {
  const raw = String(text ?? "");
  return /jsonb_build_object|\(\d+\s+rows?\)|-{3,}|^\s*[|+]/.test(raw)
    && /[\u2500-\u257F]|\(\d+\s+rows?\)/i.test(raw);
}

export function validateQualificationResetInventoryBody(body) {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return captureFail("F13_INVENTORY_CAPTURE_MALFORMED", "Qualification reset inventory capture is missing or malformed");
  }
  if (body.schema !== QUALIFICATION_RESET_INVENTORY_SCHEMA) {
    return captureFail("F13_INVENTORY_SCHEMA_MISMATCH", "Inventory capture schema/version is not the required exact schema", {
      expectedSchema: QUALIFICATION_RESET_INVENTORY_SCHEMA,
      actualSchema: body.schema ?? null,
    });
  }
  if (body.schema_version !== QUALIFICATION_RESET_INVENTORY_SCHEMA_VERSION) {
    return captureFail("F13_INVENTORY_SCHEMA_MISMATCH", "Inventory capture schema_version is not the required exact version", {
      expectedVersion: QUALIFICATION_RESET_INVENTORY_SCHEMA_VERSION,
      actualVersion: body.schema_version ?? null,
    });
  }
  const missing = QUALIFICATION_RESET_INVENTORY_MANDATORY_FIELDS.filter((key) => !Object.prototype.hasOwnProperty.call(body, key));
  if (missing.length) {
    return captureFail("F13_INVENTORY_CAPTURE_INCOMPLETE", "Inventory capture is missing mandatory fields", { missing });
  }
  if (body.inventory_capture_sql !== "scripts/lib/f3-db-push-inventory.mjs INVENTORY_CAPTURE_SQL") {
    return captureFail("F13_INVENTORY_CAPTURE_INCOMPLETE", "inventory_capture_sql artifact identity is required");
  }
  if (body.capture_complete !== true) {
    return captureFail("F13_INVENTORY_CAPTURE_INCOMPLETE", "capture_complete must be true; empty defaults are forbidden");
  }
  if (!isPlainObject(body.inventory)) {
    return captureFail("F13_INVENTORY_CAPTURE_MALFORMED", "inventory must be an object");
  }
  const missingInventory = QUALIFICATION_RESET_INVENTORY_INVENTORY_FIELDS.filter((key) => (
    !Object.prototype.hasOwnProperty.call(body.inventory, key)
  ));
  if (missingInventory.length) {
    return captureFail("F13_INVENTORY_CAPTURE_INCOMPLETE", "inventory object is missing mandatory fields", {
      missingInventory,
    });
  }
  for (const key of ["discovered_objects", "discovered_dependencies", "observed_objects", "observed_dependencies", "observed_history_rows"]) {
    if (!Array.isArray(body[key])) {
      return captureFail("F13_INVENTORY_CAPTURE_MALFORMED", `${key} must be an array; missing/malformed values are not empty`, {
        field: key,
      });
    }
  }
  const listFields = ["schemas", "public_tables", "public_views", "public_types", "storage_policies", "storage_buckets"];
  for (const key of listFields) {
    if (!Array.isArray(body.inventory[key])) {
      return captureFail("F13_INVENTORY_CAPTURE_MALFORMED", `inventory.${key} must be an array`, { field: key });
    }
  }
  if (!Array.isArray(body.inventory.public_functions)) {
    return captureFail("F13_INVENTORY_CAPTURE_MALFORMED", "inventory.public_functions must be an array");
  }
  if (typeof body.inventory.schema_migrations_rows !== "number" || !Number.isFinite(body.inventory.schema_migrations_rows)) {
    return captureFail("F13_INVENTORY_CAPTURE_MALFORMED", "inventory.schema_migrations_rows must be a number");
  }
  for (const key of ["unnest_uuid_shim", "auth_handle_new_user_trigger", "schema_migrations_present", "financial_private", "financial_core", "financial_ledger_epochs", "exchange_rates", "committees_budget_allocation", "organizations_base_country", "groups_group_level"]) {
    if (typeof body.inventory[key] !== "boolean") {
      return captureFail("F13_INVENTORY_CAPTURE_MALFORMED", `inventory.${key} must be a boolean`, { field: key });
    }
  }
  return { ok: true, body };
}

export function parseQualificationResetInventoryProcessResult(result) {
  if (result == null || typeof result !== "object" || Array.isArray(result)) {
    return captureFail("F13_INVENTORY_CAPTURE_REQUIRED", "Inventory capture process result is missing");
  }
  const status = result.status;
  if (!Number.isInteger(status) || status !== 0) {
    return captureFail("F13_INVENTORY_CAPTURE_PROCESS_FAILED", "Inventory capture process was unsuccessful", {
      status: status ?? null,
      signal: result.signal ?? null,
      timeout: result.timeout === true,
      stderr: result.stderr ?? "",
      stdout: result.stdout ?? "",
    });
  }
  if (result.signal || result.timeout === true || result.timedOut === true) {
    return captureFail("F13_INVENTORY_CAPTURE_PROCESS_FAILED", "Inventory capture process was signaled or timed out", {
      signal: result.signal ?? null,
      timeout: true,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    });
  }
  const stdout = result.stdout;
  if (!(typeof stdout === "string" || Buffer.isBuffer(stdout))) {
    return captureFail("F13_INVENTORY_CAPTURE_MALFORMED", "Inventory capture stdout is missing");
  }
  const raw = Buffer.isBuffer(stdout) ? stdout.toString("utf8") : stdout;
  if (looksLikeAlignedPsqlFraming(raw)) {
    return captureFail("F13_INVENTORY_CAPTURE_FRAMING", "Aligned/headed psql output is not machine-readable inventory", {
      stdout: raw,
    });
  }
  if (!raw.length) {
    return captureFail("F13_INVENTORY_CAPTURE_INCOMPLETE", "Inventory capture stdout is empty; empty is not a complete empty universe");
  }
  const trimmed = raw.endsWith("\n") && !raw.endsWith("\n\n") ? raw.slice(0, -1) : raw;
  if (trimmed !== trimmed.trim() || trimmed.includes("\n")) {
    return captureFail("F13_INVENTORY_CAPTURE_FRAMING", "Inventory capture stdout has unexpected prefix, suffix, or extra rows", {
      stdout: raw,
    });
  }
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return captureFail("F13_INVENTORY_CAPTURE_MALFORMED", "Inventory capture stdout is not a single JSON object", {
      stdout: raw,
    });
  }
  const validated = validateQualificationResetInventoryBody(parsed);
  if (!validated.ok) {
    return { ...validated, stdout: raw };
  }
  return { ok: true, body: parsed, stdout: raw, processStatus: status };
}

export function observedFromQualificationResetCapture(body = {}) {
  const validated = validateQualificationResetInventoryBody(body);
  if (!validated.ok) return validated;
  const discovered = body.discovered_objects;
  const discoveredDeps = body.discovered_dependencies;
  const observedField = body.observed_objects;
  const observedDepField = body.observed_dependencies;
  const discoveredIdentities = discovered.map(identityFromDiscovered);
  const observedIdentities = observedField.map(identityFromDiscovered);
  if (discoveredIdentities.some((id) => !id) || observedIdentities.some((id) => !id)) {
    return captureFail("F13_INVENTORY_CAPTURE_MALFORMED", "Discovered object identities are incomplete");
  }
  if (JSON.stringify(discoveredIdentities) !== JSON.stringify(observedIdentities)) {
    return captureFail(
      "F13_INVENTORY_CAPTURE_INCOMPLETE",
      "observed_objects must preserve the complete discovered object universe",
    );
  }
  const discoveredDepIdentities = discoveredDeps.map(identityFromDiscovered);
  const observedDepIdentities = observedDepField.map(identityFromDiscovered);
  if (discoveredDepIdentities.some((id) => !id) || observedDepIdentities.some((id) => !id)) {
    return captureFail("F13_INVENTORY_CAPTURE_MALFORMED", "Discovered dependency identities are incomplete");
  }
  if (JSON.stringify(discoveredDepIdentities) !== JSON.stringify(observedDepIdentities)) {
    return captureFail(
      "F13_INVENTORY_CAPTURE_INCOMPLETE",
      "observed_dependencies must preserve the complete discovered dependency universe",
    );
  }
  const history = body.observed_history_rows.map((row) => {
    if (!isPlainObject(row) || !Object.prototype.hasOwnProperty.call(row, "version") || !Object.prototype.hasOwnProperty.call(row, "name")) {
      return null;
    }
    return {
      version: row.version == null ? "" : String(row.version),
      name: row.name == null ? null : String(row.name),
    };
  });
  if (history.some((row) => row == null)) {
    return captureFail("F13_INVENTORY_CAPTURE_MALFORMED", "observed_history_rows must be {version,name} objects");
  }
  return {
    ok: true,
    inventoryCaptured: true,
    captureComplete: true,
    observedObjects: discoveredIdentities,
    observedDependencies: discoveredDepIdentities,
    observedHistoryRows: history,
    discoveredObjects: discovered,
    discoveredDependencies: discoveredDeps,
    inventory: body.inventory,
    captureSchema: body.schema,
    schemaVersion: body.schema_version,
    allowlistPresence: Array.isArray(body.allowlist_presence) ? body.allowlist_presence : undefined,
  };
}


export function emptyQualificationResetInventoryObject(overrides = {}) {
  return {
    recognition_pin: "financial_ledger_epochs",
    schemas: ["public"],
    public_tables: [],
    public_views: [],
    public_types: [],
    public_functions: [],
    unnest_uuid_shim: false,
    auth_handle_new_user_trigger: false,
    schema_migrations_present: true,
    schema_migrations_rows: 0,
    financial_private: false,
    financial_core: false,
    financial_ledger_epochs: false,
    exchange_rates: false,
    committees_budget_allocation: false,
    organizations_base_country: false,
    groups_group_level: false,
    storage_policies: [],
    storage_buckets: [],
    ...overrides,
  };
}

/**
 * Complete inventory-capture body for tests and the local proof helper.
 * Missing/malformed arrays are never defaulted to empty here — callers
 * must supply discovered/observed fields explicitly or accept [].
 */
export function completeCaptureBody(overrides = {}) {
  const discovered = Object.prototype.hasOwnProperty.call(overrides, "discovered_objects")
    ? overrides.discovered_objects
    : [];
  const deps = Object.prototype.hasOwnProperty.call(overrides, "discovered_dependencies")
    ? overrides.discovered_dependencies
    : [];
  const reserved = new Set([
    "inventory",
    "discovered_objects",
    "discovered_dependencies",
    "observed_objects",
    "observed_dependencies",
    "observed_history_rows",
    "allowlist_presence",
  ]);
  return {
    schema: QUALIFICATION_RESET_INVENTORY_SCHEMA,
    schema_version: QUALIFICATION_RESET_INVENTORY_SCHEMA_VERSION,
    inventory_capture_sql: "scripts/lib/f3-db-push-inventory.mjs INVENTORY_CAPTURE_SQL",
    capture_complete: true,
    inventory: emptyQualificationResetInventoryObject(overrides.inventory || {}),
    discovered_objects: discovered,
    discovered_dependencies: deps,
    observed_objects: Object.prototype.hasOwnProperty.call(overrides, "observed_objects")
      ? overrides.observed_objects
      : discovered,
    observed_dependencies: Object.prototype.hasOwnProperty.call(overrides, "observed_dependencies")
      ? overrides.observed_dependencies
      : deps,
    observed_history_rows: Object.prototype.hasOwnProperty.call(overrides, "observed_history_rows")
      ? overrides.observed_history_rows
      : [],
    allowlist_presence: Object.prototype.hasOwnProperty.call(overrides, "allowlist_presence")
      ? overrides.allowlist_presence
      : [],
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !reserved.has(key))),
  };
}

export function asList(value) {
  if (Array.isArray(value)) return value.map(String);
  return [];
}

export function classifyInventory(inventory) {
  const publicTables = asList(inventory?.public_tables);
  const publicViews = asList(inventory?.public_views);
  const publicTypes = asList(inventory?.public_types);
  const publicFunctions = Array.isArray(inventory?.public_functions) ? inventory.public_functions : [];
  const functionNames = publicFunctions.map((f) => (f && f.name) || String(f));
  const storagePolicies = asList(inventory?.storage_policies);

  const failedTables = publicTables.filter((t) => FAILED_FLOOR_PUBLIC_TABLES.includes(t));
  const extraTables = publicTables.filter((t) => !FAILED_FLOOR_PUBLIC_TABLES.includes(t));
  const failedTypes = publicTypes.filter((t) => FAILED_FLOOR_PUBLIC_TYPES.includes(t));
  const extraTypes = publicTypes.filter((t) => !FAILED_FLOOR_PUBLIC_TYPES.includes(t));
  const failedFunctions = functionNames.filter((n) => FAILED_FLOOR_PUBLIC_FUNCTION_NAMES.includes(n) || n === "unnest");
  const extraFunctions = functionNames.filter(
    (n) => !FAILED_FLOOR_PUBLIC_FUNCTION_NAMES.includes(n) && n !== "unnest",
  );
  const failedStoragePolicies = storagePolicies.filter((p) => FAILED_FLOOR_STORAGE_POLICY_NAMES.includes(p));
  const extraStoragePolicies = storagePolicies.filter((p) => !FAILED_FLOOR_STORAGE_POLICY_NAMES.includes(p));
  const storageBuckets = asList(inventory?.storage_buckets);
  const incompleteWipeBuckets = storageBuckets.filter((b) => FAILED_FLOOR_STORAGE_BUCKETS.includes(b));

  const financialPresent = Boolean(
    inventory?.financial_private ||
      inventory?.financial_core ||
      inventory?.financial_ledger_epochs,
  );
  const historyRows = Number(inventory?.schema_migrations_rows || 0);
  const leftoverOk =
    inventory?.schema_migrations_present === true || inventory?.schema_migrations_present === false;

  const ambiguous = [];
  if (extraTables.length) ambiguous.push({ kind: "public_table", names: extraTables });
  if (publicViews.length) ambiguous.push({ kind: "public_view", names: publicViews });
  if (extraTypes.length) ambiguous.push({ kind: "public_type", names: extraTypes });
  if (extraFunctions.length) ambiguous.push({ kind: "public_function", names: extraFunctions });
  if (extraStoragePolicies.length) ambiguous.push({ kind: "extra_storage_policy", names: extraStoragePolicies });
  if (financialPresent) ambiguous.push({ kind: "financial_object", names: ["financial_*"] });
  if (historyRows > 0) ambiguous.push({ kind: "schema_migrations_rows", names: [String(historyRows)] });

  const publicFailedPresent =
    failedTables.length > 0 ||
    failedTypes.length > 0 ||
    failedFunctions.length > 0 ||
    inventory?.unnest_uuid_shim === true ||
    inventory?.auth_handle_new_user_trigger === true ||
    inventory?.exchange_rates === true ||
    inventory?.organizations_base_country === true ||
    inventory?.groups_group_level === true;

  const failedPresent = publicFailedPresent || failedStoragePolicies.length > 0;

  // Chief 06: public empty + history empty + F3 absent. The 10 named floor
  // storage policies + avatars/group-documents/receipts buckets are incomplete
  // prior-wipe residuals — not a veto. Extra/unknown storage policies HOLD.
  const cleanBaseline =
    !publicFailedPresent &&
    extraTables.length === 0 &&
    publicViews.length === 0 &&
    extraTypes.length === 0 &&
    extraFunctions.length === 0 &&
    extraStoragePolicies.length === 0 &&
    !financialPresent &&
    historyRows === 0 &&
    leftoverOk;

  let verdict = "HOLD";
  let reason = "";
  if (ambiguous.length) {
    verdict = "HOLD";
    reason = "HOLD: disposable inventory contains objects not demonstrably from the failed floor";
  } else if (cleanBaseline) {
    verdict = "CLEAN_BASELINE";
    reason = "public VillageClaq floor objects absent; managed schemas preserved; schema_migrations leftover empty or absent";
  } else if (failedPresent) {
    verdict = "WIPE_ELIGIBLE";
    reason = "objects match failed-floor catalog (00001–00029 + partial 00030); no extras";
  } else {
    verdict = "HOLD";
    reason = "HOLD: inventory could not be classified as failed-floor or clean baseline";
  }

  return {
    verdict,
    reason,
    failedPresent,
    cleanBaseline,
    leftoverOk,
    historyRows,
    failedTables,
    extraTables,
    failedTypes,
    extraTypes,
    failedFunctions,
    extraFunctions,
    failedStoragePolicies,
    extraStoragePolicies,
    extraStoragePoliciesPreserved: extraStoragePolicies,
    incompleteWipeStoragePolicies: failedStoragePolicies,
    incompleteWipeBuckets,
    publicFailedPresent,
    unnestShim: inventory?.unnest_uuid_shim === true,
    authTrigger: inventory?.auth_handle_new_user_trigger === true,
    financialPresent,
    ambiguous,
    storageBucketsUntouched: true,
    recognition: [...RECOGNITION_ALLOWLIST],
  };
}

export function isCleanBaseline(classification) {
  return classification?.verdict === "CLEAN_BASELINE" && classification?.cleanBaseline === true;
}

/**
 * Exact-identity eligibility for the F13 qualification-reset path.
 * Leftovers are eligible only when every observed identity is in the
 * finite allowlist and every history row matches authenticated keys.
 * `financial_*` / `financial_object` remains a HOLD classifier hint —
 * never a destructive selector and never an eligibility grant.
 */
export function evaluateQualificationResetEligibility({
  observedObjectIdentities = [],
  observedDependencies = [],
  observedHistoryRows = [],
  inventoryCaptured = false,
  captureComplete = false,
} = {}) {
  if (!Array.isArray(observedObjectIdentities) || !Array.isArray(observedDependencies) || !Array.isArray(observedHistoryRows)) {
    return {
      ok: false,
      eligible: false,
      alreadyClean: false,
      verdict: "HOLD",
      code: "F13_INVENTORY_CAPTURE_INCOMPLETE",
      reason: "incomplete discovered object/dependency/history representation blocks eligibility",
      financialPrefixUsedAsSelector: false,
    };
  }
  const identities = observedObjectIdentities.map((item) => {
    const raw = typeof item === "string" ? item : item?.identity;
    if (!raw) return raw;
    return String(raw).includes("(") ? canonicalizeFunctionIdentity(raw) : raw;
  });
  if (identities.some((identity) => identity == null || identity === "")) {
    return {
      ok: false,
      eligible: false,
      alreadyClean: false,
      verdict: "HOLD",
      code: "F13_INVENTORY_CAPTURE_INCOMPLETE",
      reason: "incomplete object identity representation blocks eligibility",
      financialPrefixUsedAsSelector: false,
    };
  }
  if (identities.some((identity) => isFinancialPrefixSelector(identity))) {
    return {
      ok: false,
      eligible: false,
      alreadyClean: false,
      verdict: "HOLD",
      code: "F13_UNEXPECTED_OBJECT_OR_DEPENDENCY",
      reason: "financial_* prefix is not a destructive allowlist",
      financialPrefixUsedAsSelector: false,
    };
  }
  const objects = validateObjectAllowlist(identities, observedDependencies);
  if (!objects.ok) {
    return {
      ok: false,
      eligible: false,
      alreadyClean: false,
      verdict: "HOLD",
      code: objects.code,
      reason: objects.reason,
      unexpectedObjects: objects.unexpectedObjects,
      unexpectedDependencies: objects.unexpectedDependencies,
      financialPrefixUsedAsSelector: false,
    };
  }
  const history = validateHistoryKeys(observedHistoryRows);
  if (!history.ok) {
    return {
      ok: false,
      eligible: false,
      alreadyClean: false,
      verdict: "HOLD",
      code: history.code,
      reason: history.reason,
      errors: history.errors,
      financialPrefixUsedAsSelector: false,
    };
  }
  const leftovers = identities.filter(Boolean);
  if (leftovers.length === 0 && observedHistoryRows.length === 0) {
    if (inventoryCaptured !== true || captureComplete !== true) {
      return {
        ok: false,
        eligible: false,
        alreadyClean: false,
        verdict: "HOLD",
        code: "F13_INVENTORY_CAPTURE_REQUIRED",
        reason: "alreadyClean requires positive evidence of a complete empty capture",
        financialPrefixUsedAsSelector: false,
      };
    }
    return {
      ok: true,
      eligible: false,
      alreadyClean: true,
      verdict: "CLEAN_BASELINE",
      reason: "complete empty discovered universe; reset mutation not required",
      financialPrefixUsedAsSelector: false,
      allowedCount: FINITE_OBJECT_ALLOWLIST.length,
      historyKeyCount: AUTHENTICATED_HISTORY_KEYS.length,
      captureComplete: true,
    };
  }
  if (inventoryCaptured !== true || captureComplete !== true) {
    return {
      ok: false,
      eligible: false,
      alreadyClean: false,
      verdict: "HOLD",
      code: "F13_INVENTORY_CAPTURE_REQUIRED",
      reason: "eligible===true requires a complete discovered-universe capture",
      leftoverCount: leftovers.length,
      financialPrefixUsedAsSelector: false,
    };
  }
  return {
    ok: true,
    eligible: true,
    alreadyClean: false,
    verdict: "RESET_ELIGIBLE",
    reason: "every leftover identity is in FINITE_OBJECT_ALLOWLIST and history matches authenticated keys",
    financialPrefixUsedAsSelector: false,
    leftoverCount: leftovers.length,
    allowedCount: FINITE_OBJECT_ALLOWLIST.length,
    historyMatched: history.matched,
    historyKeyCount: AUTHENTICATED_HISTORY_KEYS.length,
    captureComplete: true,
  };
}
