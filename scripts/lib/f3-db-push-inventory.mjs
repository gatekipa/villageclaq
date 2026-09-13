/**
 * Inventory capture helpers for disposable wipe-to-baseline.
 *
 * Preserves failed-run evidence. Classifies current disposable objects
 * against a clean baseline (stock Supabase + empty schema_migrations
 * leftover OR pure stock). Does not apply migrations.
 */
import { RECOGNITION_ALLOWLIST } from "./f3-db-push-pins.mjs";

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

export const INVENTORY_CAPTURE_SQL = `
SELECT jsonb_build_object(
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
)::text
`;

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
