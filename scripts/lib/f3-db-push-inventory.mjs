/**
 * Inventory capture helpers for disposable wipe-to-baseline.
 *
 * Preserves failed-run evidence. Classifies current disposable objects
 * against a clean baseline (stock Supabase + empty schema_migrations
 * leftover OR pure stock). Does not apply migrations.
 */
import { RECOGNITION_ALLOWLIST } from "./f3-db-push-pins.mjs";
import { parseDuplicateKeySafeJson } from "./f3-db-push-query-parse.mjs";
import {
  AUTHENTICATED_HISTORY_KEYS,
  CANONICAL_FUNCTION_IDENTITY_SQL,
  FINITE_DEPENDENCY_ALLOWLIST,
  FINITE_OBJECT_ALLOWLIST,
  canonicalDependencyTuple,
  canonicalizeFunctionIdentity,
  isFinancialPrefixSelector,
  snapshotDependencyTuple,
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

function discoveredObjectRecord(item) {
  if (typeof item === "string") {
    if (item.includes("(")) {
      return { kind: "function", identity: canonicalizeFunctionIdentity(item) };
    }
    if (item === "financial_core" || item === "financial_private") {
      return { kind: "schema", identity: item };
    }
    if (item === "btree_gist") {
      return { kind: "extension", identity: item };
    }
    return { kind: null, identity: item };
  }
  if (item && typeof item.identity === "string") {
    return {
      kind: item.kind == null ? null : String(item.kind),
      identity: item.kind === "function" ? canonicalizeFunctionIdentity(item.identity) : item.identity,
    };
  }
  return null;
}

/**
 * Broader inventory.* fields are independent evidence with documented
 * meaning from INVENTORY_CAPTURE_OBJECT_SQL. They must agree with the
 * canonical discovered/observed universe. Empty discovered arrays must
 * not hide populated inventory facts.
 */
export function reconcileQualificationResetInventoryFacts(body) {
  const inventory = body?.inventory || {};
  const discovered = Array.isArray(body?.discovered_objects) ? body.discovered_objects : [];
  const history = Array.isArray(body?.observed_history_rows) ? body.observed_history_rows : [];
  const records = discovered.map(discoveredObjectRecord);
  if (records.some((row) => row == null || !row.identity)) {
    return captureFail("F13_INVENTORY_CAPTURE_MALFORMED", "Discovered object identities are incomplete");
  }
  const identities = new Set(records.map((row) => row.identity));
  const contradictions = [];

  const requireIdentity = (field, identity, meaning) => {
    if (!identities.has(identity)) {
      contradictions.push({ field, identity, meaning, inventoryFactRetained: true });
    }
  };

  for (const name of asList(inventory.public_tables)) {
    requireIdentity("public_tables", `public.${name}`, "inventory.public_tables is the public relkind=r set");
  }
  for (const name of asList(inventory.public_views)) {
    requireIdentity("public_views", `public.${name}`, "inventory.public_views is the public relkind=v set");
  }
  for (const name of asList(inventory.public_types)) {
    requireIdentity("public_types", `public.${name}`, "inventory.public_types is the public enum/composite set");
  }
  const functions = Array.isArray(inventory.public_functions) ? inventory.public_functions : [];
  for (const fn of functions) {
    if (fn && fn.identity) {
      requireIdentity(
        "public_functions",
        canonicalizeFunctionIdentity(String(fn.identity)),
        "inventory.public_functions[].identity is a public function",
      );
    } else if (fn && fn.name) {
      const match = [...identities].some((id) => id === `public.${fn.name}` || id.startsWith(`public.${fn.name}(`));
      if (!match) {
        contradictions.push({
          field: "public_functions",
          identity: `public.${fn.name}`,
          meaning: "inventory.public_functions[].name is a public function",
          inventoryFactRetained: true,
        });
      }
    }
  }
  if (inventory.financial_core === true) {
    const present = identities.has("financial_core")
      || [...identities].some((id) => id === "financial_core" || id.startsWith("financial_core."));
    if (!present) {
      contradictions.push({
        field: "financial_core",
        identity: "financial_core",
        meaning: "inventory.financial_core means to_regnamespace('financial_core')",
        inventoryFactRetained: true,
      });
    }
  }
  if (inventory.financial_private === true) {
    const present = identities.has("financial_private")
      || [...identities].some((id) => id === "financial_private" || id.startsWith("financial_private."));
    if (!present) {
      contradictions.push({
        field: "financial_private",
        identity: "financial_private",
        meaning: "inventory.financial_private means to_regnamespace('financial_private')",
        inventoryFactRetained: true,
      });
    }
  }
  if (inventory.financial_ledger_epochs === true) {
    requireIdentity("financial_ledger_epochs", "public.financial_ledger_epochs", "inventory.financial_ledger_epochs means the table exists");
  }
  if (inventory.exchange_rates === true) {
    requireIdentity("exchange_rates", "public.exchange_rates", "inventory.exchange_rates means the table exists");
  }
  if (inventory.unnest_uuid_shim === true) {
    const present = [...identities].some((id) => (
      id === "public.unnest(uuid)" || id.startsWith("public.unnest(")
    ));
    if (!present) {
      contradictions.push({
        field: "unnest_uuid_shim",
        identity: "public.unnest(uuid)",
        meaning: "inventory.unnest_uuid_shim means to_regprocedure('public.unnest(uuid)')",
        inventoryFactRetained: true,
      });
    }
  }
  if (inventory.organizations_base_country === true) {
    requireIdentity(
      "organizations_base_country",
      "public.organizations",
      "inventory.organizations_base_country is a public.organizations column leftover",
    );
  }
  if (inventory.groups_group_level === true) {
    requireIdentity(
      "groups_group_level",
      "public.groups",
      "inventory.groups_group_level is a public.groups column leftover",
    );
  }
  if (inventory.committees_budget_allocation === true) {
    requireIdentity(
      "committees_budget_allocation",
      "public.committees",
      "inventory.committees_budget_allocation is a public.committees column leftover",
    );
  }

  const expectedHistoryCount = Number(inventory.schema_migrations_rows);
  if (Number.isFinite(expectedHistoryCount) && expectedHistoryCount !== history.length) {
    contradictions.push({
      field: "schema_migrations_rows",
      identity: String(expectedHistoryCount),
      meaning: "inventory.schema_migrations_rows is the schema_migrations row count",
      observedHistoryCount: history.length,
      inventoryFactRetained: true,
    });
  }

  for (const row of records) {
    const identity = row.identity;
    if (row.kind === "table" && identity.startsWith("public.")) {
      const name = identity.slice("public.".length);
      if (!asList(inventory.public_tables).includes(name) && name !== "exchange_rates" && name !== "financial_ledger_epochs") {
        if (inventory.financial_ledger_epochs === true && name === "financial_ledger_epochs") continue;
        contradictions.push({
          field: "public_tables",
          identity,
          meaning: "discovered public table must appear in inventory.public_tables",
          inventoryFactRetained: true,
        });
      }
    }
    if (row.kind === "view" && identity.startsWith("public.")) {
      const name = identity.slice("public.".length);
      if (!asList(inventory.public_views).includes(name)) {
        contradictions.push({
          field: "public_views",
          identity,
          meaning: "discovered public view must appear in inventory.public_views",
          inventoryFactRetained: true,
        });
      }
    }
    if (row.kind === "schema" && identity === "financial_core" && inventory.financial_core !== true) {
      contradictions.push({
        field: "financial_core",
        identity,
        meaning: "discovered financial_core schema requires inventory.financial_core=true",
        inventoryFactRetained: true,
      });
    }
    if (row.kind === "schema" && identity === "financial_private" && inventory.financial_private !== true) {
      contradictions.push({
        field: "financial_private",
        identity,
        meaning: "discovered financial_private schema requires inventory.financial_private=true",
        inventoryFactRetained: true,
      });
    }
    if (identity === "public.financial_ledger_epochs" && inventory.financial_ledger_epochs !== true) {
      contradictions.push({
        field: "financial_ledger_epochs",
        identity,
        meaning: "discovered financial_ledger_epochs requires inventory.financial_ledger_epochs=true",
        inventoryFactRetained: true,
      });
    }
  }

  if (contradictions.length) {
    return captureFail(
      "F13_INVENTORY_CAPTURE_CONTRADICTION",
      "Broader inventory facts contradict the discovered/observed universe; facts were not discarded",
      {
        contradictions,
        alreadyClean: false,
        eligible: false,
        verdict: "HOLD",
      },
    );
  }
  return { ok: true };
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
  const duplicateSafe = parseDuplicateKeySafeJson(raw.endsWith("\n") ? raw : `${raw}\n`);
  if (!duplicateSafe.ok) {
    if (duplicateSafe.parser_verdict === "duplicate_keys") {
      return captureFail(
        "F13_INVENTORY_CAPTURE_DUPLICATE_KEYS",
        "Duplicate JSON member names are rejected before parse can discard an earlier value",
        { parser_verdict: duplicateSafe.parser_verdict, stdout: raw },
      );
    }
    return captureFail("F13_INVENTORY_CAPTURE_MALFORMED", "Inventory capture stdout is not a single JSON object", {
      stdout: raw,
      parser_verdict: duplicateSafe.parser_verdict || null,
    });
  }
  const parsed = duplicateSafe.value;
  const validated = validateQualificationResetInventoryBody(parsed);
  if (!validated.ok) {
    return { ...validated, stdout: raw };
  }
  return { ok: true, body: parsed, stdout: raw, processStatus: status };
}

export function observedFromQualificationResetCapture(body = {}) {
  const validated = validateQualificationResetInventoryBody(body);
  if (!validated.ok) return validated;
  const reconciled = reconcileQualificationResetInventoryFacts(body);
  if (!reconciled.ok) return reconciled;
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
  const discoveredDepTuples = discoveredDeps.map((item) => {
    if (item == null || (typeof item === "object" && Object.keys(item).length === 0)) return null;
    return snapshotDependencyTuple(item);
  });
  const observedDepTuples = observedDepField.map((item) => {
    if (item == null || (typeof item === "object" && Object.keys(item).length === 0)) return null;
    return snapshotDependencyTuple(item);
  });
  if (discoveredDeps.length === 0 && observedDepField.length === 0) {
    // empty dependency universe is complete
  } else if (discoveredDepTuples.some((row) => row == null) || observedDepTuples.some((row) => row == null)) {
    return captureFail(
      "F13_INVENTORY_CAPTURE_MALFORMED",
      "Discovered dependency identities are incomplete; name-only fallback is forbidden",
    );
  }
  if (JSON.stringify(discoveredDepTuples) !== JSON.stringify(observedDepTuples)) {
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
    observedDependencies: discoveredDepTuples.filter(Boolean),
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

/**
 * Every inventory field that can keep qualification-reset from affirming
 * CLEAN_BASELINE. Empty discovered objects/history are never sufficient
 * by themselves. Auth/Storage leftovers HOLD without expanding deletion
 * and are never routed through --wipe-to-baseline.
 */
export const BASELINE_AFFECTING_INVENTORY_FIELDS = Object.freeze([
  Object.freeze({
    field: "public_tables",
    cleanEvidence: "[]",
    classifier: true,
    dirtyBlocksCleanBaseline: true,
    unsupportedManagedLeftover: false,
  }),
  Object.freeze({
    field: "public_views",
    cleanEvidence: "[]",
    classifier: true,
    dirtyBlocksCleanBaseline: true,
    unsupportedManagedLeftover: false,
  }),
  Object.freeze({
    field: "public_types",
    cleanEvidence: "[]",
    classifier: true,
    dirtyBlocksCleanBaseline: true,
    unsupportedManagedLeftover: false,
  }),
  Object.freeze({
    field: "public_functions",
    cleanEvidence: "[]",
    classifier: true,
    dirtyBlocksCleanBaseline: true,
    unsupportedManagedLeftover: false,
  }),
  Object.freeze({
    field: "unnest_uuid_shim",
    cleanEvidence: false,
    classifier: true,
    dirtyBlocksCleanBaseline: true,
    unsupportedManagedLeftover: true,
    holdWithoutDeletion: true,
    wipeRouted: false,
  }),
  Object.freeze({
    field: "auth_handle_new_user_trigger",
    cleanEvidence: false,
    classifier: true,
    dirtyBlocksCleanBaseline: true,
    unsupportedManagedLeftover: true,
    holdWithoutDeletion: true,
    wipeRouted: false,
  }),
  Object.freeze({
    field: "schema_migrations_present",
    cleanEvidence: "boolean (true or false)",
    classifier: true,
    dirtyBlocksCleanBaseline: true,
    unsupportedManagedLeftover: false,
  }),
  Object.freeze({
    field: "schema_migrations_rows",
    cleanEvidence: 0,
    classifier: true,
    dirtyBlocksCleanBaseline: true,
    unsupportedManagedLeftover: false,
  }),
  Object.freeze({
    field: "financial_private",
    cleanEvidence: false,
    classifier: true,
    dirtyBlocksCleanBaseline: true,
    unsupportedManagedLeftover: false,
  }),
  Object.freeze({
    field: "financial_core",
    cleanEvidence: false,
    classifier: true,
    dirtyBlocksCleanBaseline: true,
    unsupportedManagedLeftover: false,
  }),
  Object.freeze({
    field: "financial_ledger_epochs",
    cleanEvidence: false,
    classifier: true,
    dirtyBlocksCleanBaseline: true,
    unsupportedManagedLeftover: false,
  }),
  Object.freeze({
    field: "exchange_rates",
    cleanEvidence: false,
    classifier: true,
    dirtyBlocksCleanBaseline: true,
    unsupportedManagedLeftover: false,
  }),
  Object.freeze({
    field: "organizations_base_country",
    cleanEvidence: false,
    classifier: true,
    dirtyBlocksCleanBaseline: true,
    unsupportedManagedLeftover: false,
  }),
  Object.freeze({
    field: "groups_group_level",
    cleanEvidence: false,
    classifier: true,
    dirtyBlocksCleanBaseline: true,
    unsupportedManagedLeftover: false,
  }),
  Object.freeze({
    field: "committees_budget_allocation",
    cleanEvidence: false,
    classifier: false,
    dirtyBlocksCleanBaseline: true,
    unsupportedManagedLeftover: false,
    reconcileOnly: true,
  }),
  Object.freeze({
    field: "storage_policies",
    cleanEvidence: "[] or named failed-floor residuals only",
    classifier: true,
    dirtyBlocksCleanBaseline: true,
    unsupportedManagedLeftover: true,
    namedFloorResidualAllowed: true,
    holdWithoutDeletion: true,
    wipeRouted: false,
  }),
  Object.freeze({
    field: "storage_buckets",
    cleanEvidence: "[] or named failed-floor residuals only",
    classifier: true,
    dirtyBlocksCleanBaseline: true,
    unsupportedManagedLeftover: true,
    namedFloorResidualAllowed: true,
    holdWithoutDeletion: true,
    wipeRouted: false,
    permittedIdentitiesFrom: "FAILED_FLOOR_STORAGE_BUCKETS",
    nonDeletedIsNotNonBlocking: true,
  }),
]);

/** Permitted bucket identities from the existing approved baseline contract. Not an auto-allowlist. */
export const APPROVED_BASELINE_STORAGE_BUCKETS = FAILED_FLOOR_STORAGE_BUCKETS;

export function extraStoragePolicies(inventory) {
  return asList(inventory?.storage_policies).filter((name) => (
    !FAILED_FLOOR_STORAGE_POLICY_NAMES.includes(name)
  ));
}

export function readInventoryNameListField(inventory, field) {
  if (inventory == null || typeof inventory !== "object" || Array.isArray(inventory)) {
    return { present: false, ok: false, missing: true, malformed: false, names: [] };
  }
  if (!Object.prototype.hasOwnProperty.call(inventory, field)) {
    return { present: false, ok: false, missing: true, malformed: false, names: [] };
  }
  const value = inventory[field];
  if (!Array.isArray(value)) {
    return { present: true, ok: false, missing: false, malformed: true, names: [] };
  }
  if (value.some((item) => typeof item !== "string" || item.length === 0)) {
    return { present: true, ok: false, missing: false, malformed: true, names: [] };
  }
  return { present: true, ok: true, missing: false, malformed: false, names: value };
}

export function extraStorageBuckets(inventory) {
  const read = readInventoryNameListField(inventory, "storage_buckets");
  if (!read.ok) return [];
  return read.names.filter((name) => !APPROVED_BASELINE_STORAGE_BUCKETS.includes(name));
}

export function listUnsupportedManagedLeftovers(inventory) {
  const items = [];
  if (inventory == null || typeof inventory !== "object" || Array.isArray(inventory)) {
    return items;
  }
  if (inventory.auth_handle_new_user_trigger === true) {
    items.push({
      kind: "auth_handle_new_user_trigger",
      field: "auth_handle_new_user_trigger",
      deletionExpanded: false,
      wipeRouted: false,
      reason: "Auth leftover is unsupported for qualification-reset deletion; HOLD without wipe",
    });
  }
  if (inventory.unnest_uuid_shim === true) {
    items.push({
      kind: "unnest_uuid_shim",
      field: "unnest_uuid_shim",
      deletionExpanded: false,
      wipeRouted: false,
      reason: "public.unnest(uuid) is not a qualification-reset allowlisted drop; HOLD without wipe",
    });
  }
  const unexpectedPolicies = extraStoragePolicies(inventory);
  if (unexpectedPolicies.length) {
    items.push({
      kind: "storage_policies",
      field: "storage_policies",
      names: unexpectedPolicies,
      deletionExpanded: false,
      wipeRouted: false,
      reason: "Unexpected storage policies are unsupported leftovers; HOLD without expanding deletion",
    });
  }
  const bucketsField = readInventoryNameListField(inventory, "storage_buckets");
  if (bucketsField.present && bucketsField.malformed) {
    items.push({
      kind: "storage_buckets",
      field: "storage_buckets",
      names: [],
      deletionExpanded: false,
      wipeRouted: false,
      reason: "Malformed storage_buckets is fail-closed HOLD; deletion is not expanded and wipe is not used",
    });
  } else {
    const unexpectedBuckets = extraStorageBuckets(inventory);
    if (unexpectedBuckets.length) {
      items.push({
        kind: "storage_buckets",
        field: "storage_buckets",
        names: unexpectedBuckets,
        deletionExpanded: false,
        wipeRouted: false,
        reason: "Unexpected storage buckets are unsupported leftovers; HOLD without expanding deletion or wipe",
      });
    }
  }
  return items;
}

export function evaluateQualificationResetCleanBaseline({
  inventory = null,
  discoveredObjects = [],
  observedHistoryRows = [],
} = {}) {
  if (inventory == null || typeof inventory !== "object" || Array.isArray(inventory)) {
    return {
      ok: false,
      cleanBaseline: false,
      alreadyClean: false,
      verdict: "HOLD",
      code: "F13_INVENTORY_CAPTURE_INCOMPLETE",
      reason: "CLEAN_BASELINE requires affirmative inventory facts; empty object/history alone is insufficient",
      deletionExpanded: false,
      wipeRouted: false,
    };
  }
  const missing = BASELINE_AFFECTING_INVENTORY_FIELDS
    .filter((row) => row.dirtyBlocksCleanBaseline)
    .map((row) => row.field)
    .filter((field) => !Object.prototype.hasOwnProperty.call(inventory, field));
  if (missing.length) {
    return {
      ok: false,
      cleanBaseline: false,
      alreadyClean: false,
      verdict: "HOLD",
      code: "F13_INVENTORY_CAPTURE_INCOMPLETE",
      reason: "CLEAN_BASELINE is missing required inventory facts",
      missing,
      deletionExpanded: false,
      wipeRouted: false,
    };
  }
  const bucketsField = readInventoryNameListField(inventory, "storage_buckets");
  if (bucketsField.malformed) {
    return {
      ok: false,
      cleanBaseline: false,
      alreadyClean: false,
      verdict: "HOLD",
      code: "F13_INVENTORY_CAPTURE_MALFORMED",
      reason: "storage_buckets must be an array of non-empty strings; malformed values fail closed",
      deletionExpanded: false,
      wipeRouted: false,
    };
  }
  const reconciled = reconcileQualificationResetInventoryFacts({
    inventory,
    discovered_objects: discoveredObjects,
    observed_history_rows: observedHistoryRows,
  });
  if (!reconciled.ok) {
    return {
      ...reconciled,
      cleanBaseline: false,
      alreadyClean: false,
      verdict: "HOLD",
      deletionExpanded: false,
      wipeRouted: false,
    };
  }
  const unsupported = listUnsupportedManagedLeftovers(inventory);
  const classification = classifyInventory(inventory);
  if (
    unsupported.length
    || classification.verdict !== "CLEAN_BASELINE"
    || classification.cleanBaseline !== true
  ) {
    return {
      ok: false,
      cleanBaseline: false,
      alreadyClean: false,
      eligible: false,
      verdict: "HOLD",
      code: unsupported.length
        ? "F13_UNSUPPORTED_MANAGED_LEFTOVER"
        : "F13_INVENTORY_NOT_CLEAN_BASELINE",
      reason: unsupported.length
        ? "Unsupported Auth/Storage/managed leftovers HOLD; deletion is not expanded and wipe is not used"
        : "Broader inventory classifier does not affirm CLEAN_BASELINE",
      unsupportedLeftovers: unsupported,
      classificationVerdict: classification.verdict,
      deletionExpanded: false,
      wipeRouted: false,
    };
  }
  return {
    ok: true,
    cleanBaseline: true,
    alreadyClean: true,
    verdict: "CLEAN_BASELINE",
    classificationVerdict: classification.verdict,
    unsupportedLeftovers: [],
    deletionExpanded: false,
    wipeRouted: false,
  };
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
  const bucketsField = readInventoryNameListField(inventory, "storage_buckets");
  const storageBuckets = bucketsField.ok ? bucketsField.names : asList(inventory?.storage_buckets);
  const extraStorageBuckets = storageBuckets.filter((b) => !APPROVED_BASELINE_STORAGE_BUCKETS.includes(b));
  const incompleteWipeBuckets = storageBuckets.filter((b) => APPROVED_BASELINE_STORAGE_BUCKETS.includes(b));
  const storageBucketsMalformed = bucketsField.present && bucketsField.malformed;

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
  if (extraStorageBuckets.length) ambiguous.push({ kind: "extra_storage_bucket", names: extraStorageBuckets });
  if (storageBucketsMalformed) ambiguous.push({ kind: "malformed_storage_buckets", names: ["storage_buckets"] });
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

  // Named floor storage policies + approved baseline buckets (avatars /
  // group-documents / receipts) are incomplete prior-wipe residuals.
  // Extra/unknown storage policies or buckets HOLD. Non-deletion of a
  // captured field is not a non-blocking exemption.
  const cleanBaseline =
    !publicFailedPresent &&
    extraTables.length === 0 &&
    publicViews.length === 0 &&
    extraTypes.length === 0 &&
    extraFunctions.length === 0 &&
    extraStoragePolicies.length === 0 &&
    extraStorageBuckets.length === 0 &&
    !storageBucketsMalformed &&
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
    extraStorageBuckets,
    extraStorageBucketsPreserved: extraStorageBuckets,
    incompleteWipeStoragePolicies: failedStoragePolicies,
    incompleteWipeBuckets,
    storageBucketsMalformed,
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
  inventory = null,
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
  if (inventory != null) {
    const bucketsField = readInventoryNameListField(inventory, "storage_buckets");
    if (bucketsField.present && bucketsField.malformed) {
      return {
        ok: false,
        eligible: false,
        alreadyClean: false,
        verdict: "HOLD",
        code: "F13_INVENTORY_CAPTURE_MALFORMED",
        reason: "storage_buckets must be an array of non-empty strings; malformed values fail closed",
        deletionExpanded: false,
        wipeRouted: false,
        financialPrefixUsedAsSelector: false,
      };
    }
    const reconciled = reconcileQualificationResetInventoryFacts({
      inventory,
      discovered_objects: observedObjectIdentities,
      observed_history_rows: observedHistoryRows,
    });
    if (!reconciled.ok) {
      return {
        ok: false,
        eligible: false,
        alreadyClean: false,
        verdict: "HOLD",
        code: reconciled.code,
        reason: reconciled.reason,
        contradictions: reconciled.contradictions,
        financialPrefixUsedAsSelector: false,
      };
    }
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
    const baseline = evaluateQualificationResetCleanBaseline({
      inventory,
      discoveredObjects: observedObjectIdentities,
      observedHistoryRows,
    });
    if (!baseline.ok || baseline.cleanBaseline !== true) {
      return {
        ok: false,
        eligible: false,
        alreadyClean: false,
        verdict: "HOLD",
        code: baseline.code || "F13_INVENTORY_NOT_CLEAN_BASELINE",
        reason: baseline.reason || "CLEAN_BASELINE requires consistent affirmative evidence across all required inventory facts",
        contradictions: baseline.contradictions,
        unsupportedLeftovers: baseline.unsupportedLeftovers,
        classificationVerdict: baseline.classificationVerdict,
        missing: baseline.missing,
        deletionExpanded: false,
        wipeRouted: false,
        financialPrefixUsedAsSelector: false,
      };
    }
    return {
      ok: true,
      eligible: false,
      alreadyClean: true,
      verdict: "CLEAN_BASELINE",
      reason: "complete empty discovered universe and all baseline-affecting inventory facts affirm CLEAN_BASELINE",
      financialPrefixUsedAsSelector: false,
      allowedCount: FINITE_OBJECT_ALLOWLIST.length,
      historyKeyCount: AUTHENTICATED_HISTORY_KEYS.length,
      captureComplete: true,
      classificationVerdict: baseline.classificationVerdict,
      deletionExpanded: false,
      wipeRouted: false,
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
  if (inventory != null) {
    const unsupported = listUnsupportedManagedLeftovers(inventory);
    if (unsupported.length) {
      return {
        ok: false,
        eligible: false,
        alreadyClean: false,
        verdict: "HOLD",
        code: "F13_UNSUPPORTED_MANAGED_LEFTOVER",
        reason: "Unsupported Auth/Storage/managed leftovers HOLD; approved object leftovers are not reset by expanding deletion",
        unsupportedLeftovers: unsupported,
        leftoverCount: leftovers.length,
        deletionExpanded: false,
        wipeRouted: false,
        financialPrefixUsedAsSelector: false,
      };
    }
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
