/**
 * Server-owned safety config + validator for POST /api/admin/query.
 *
 * /api/admin/query runs under the SERVICE ROLE (RLS fully bypassed). Before
 * this module the only gate was canRead(role, table) on the TOP-LEVEL table —
 * but the caller-supplied `select` string was forwarded verbatim to PostgREST,
 * so a caller could embed related resources, e.g.
 *
 *     { table: "groups", select: "*, memberships(*, payments(*))" }
 *
 * and read tables OUTSIDE their role allowlist (cross-tenant financial + PII
 * leak — any non-super staff role could reach every tenant's payments/roster).
 *
 * This module makes select/filter/order safe BY CONSTRUCTION:
 *
 *  - Relational EMBEDS (any "(") are rejected for ALL roles — including
 *    super_admin — UNLESS the exact (whitespace-normalised) select is one of
 *    the frozen known-good shapes the existing Platform Admin pages send
 *    (EMBED_ALLOWLIST). An attacker cannot craft a NEW embed; only these
 *    pre-vetted shapes execute, and each is still gated by canRead(role,
 *    hostTable) in the route, so this changes nothing for legitimate users.
 *  - A bare "*" is allowed only on platform-global config/marketing tables
 *    that carry no cross-tenant member PII (WILDCARD_TABLES). Every other
 *    table must list explicit identifier columns.
 *  - Flat selects must be comma-separated bare identifiers — no "(", ":", ".",
 *    "*" or "!", so no embed / alias / FK-hint syntax can slip through.
 *  - filter / order columns must be bare identifiers, blocking dotted
 *    embedded-resource paths (e.g. "memberships.user_id") that could reach
 *    another table or be used for injection.
 *
 * canRead(role, table) (src/lib/admin-rbac.ts) still gates the host table —
 * this is the second wall directly below it.
 *
 * NOTE: EMBED_ALLOWLIST is intentionally a closed set harvested verbatim from
 * the current admin pages. If a Platform Admin page legitimately adds/edits an
 * embed select, this list must be updated in the same PR — the failure mode is
 * a loud 400 ("EMBED_NOT_ALLOWED") in dev/preview, never a silent leak.
 */

/** A safe Postgres identifier — letters, digits, underscore only. */
const IDENTIFIER = /^[a-z0-9_]+$/i;

/** Collapse ALL whitespace so allowlist matching ignores formatting. */
export function normalizeSelect(select: string): string {
  return select.replace(/\s+/g, "");
}

/**
 * Tables whose full row ("*") is safe to return — platform-global config /
 * marketing data with NO cross-tenant member PII. Everything else must
 * enumerate explicit columns.
 */
export const WILDCARD_TABLES: ReadonlySet<string> = new Set([
  "testimonials",
  "faqs",
  "contact_enquiries",
  "subscription_plans",
  "subscription_vouchers",
]);

/**
 * The exact relational-embed selects the existing Platform Admin pages send,
 * keyed by host table. Stored verbatim (copied from the source call sites) and
 * matched after normalizeSelect(). Any embed NOT in this frozen set is rejected
 * for EVERY role.
 */
const EMBED_ALLOWLIST_RAW: Record<string, string[]> = {
  // admin/page.tsx, anomalies, transactions, offline-payments
  payments: [
    "amount, currency, groups!inner(name)",
    "id, amount, currency, recorded_at, group_id, memberships!inner(display_name, profiles!memberships_user_id_fkey(full_name))",
    "id, amount, currency, payment_method, reference_number, recorded_at, groups!inner(name), memberships!inner(display_name, profiles!memberships_user_id_fkey(full_name)), contribution_types(name), recorder:profiles!payments_recorded_by_fkey(full_name)",
    "id, amount, currency, payment_method, reference_number, recorded_at, notes, groups!inner(name), memberships!inner(display_name, profiles!memberships_user_id_fkey(full_name)), contribution_types(name), recorder:profiles!payments_recorded_by_fkey(full_name)",
  ],
  // anomalies, group-admins, multi-group
  memberships: [
    "group_id, groups!inner(name)",
    "id, user_id, role, display_name, groups!inner(name, is_active), profiles!memberships_user_id_fkey(full_name, updated_at)",
    "user_id, role, groups!inner(name), profiles!memberships_user_id_fkey(full_name, created_at)",
  ],
  // audit, staff
  platform_audit_logs: [
    "id, action, target_type, target_id, details, created_at, staff_id, platform_staff(user_id, profiles(full_name))",
    "id, action, target_type, target_id, details, created_at, platform_staff(profiles(full_name))",
  ],
  // group-actions
  activity_feed: [
    "id, group_id, action_type, entity_type, entity_id, message, message_fr, metadata, created_at, groups:group_id(name), memberships:actor_membership_id(display_name, profiles(full_name))",
  ],
  // notifications
  notifications: [
    "id, user_id, type, title, is_read, created_at, profiles:user_id(full_name)",
  ],
  // reports/relief
  relief_plans: [
    "id, name, is_active, group_id, contribution_amount, groups:group_id(name, currency)",
  ],
  // staff
  platform_staff: [
    "id, user_id, role, is_active, created_at, profiles(id, full_name, avatar_url)",
  ],
};

const EMBED_ALLOWLIST: Record<string, ReadonlySet<string>> = Object.fromEntries(
  Object.entries(EMBED_ALLOWLIST_RAW).map(([table, selects]) => [
    table,
    new Set(selects.map(normalizeSelect)),
  ])
);

export type SelectValidation =
  | { ok: true; select: string }
  | { ok: false; code: string; message: string };

/**
 * Validate (and normalise) a caller-supplied `select` for a given host table.
 * Returns the safe select string to forward, or a rejection with a code.
 */
export function validateSelect(table: string, select: string): SelectValidation {
  const trimmed = (select ?? "").trim();
  if (!trimmed) {
    return { ok: false, code: "EMPTY_SELECT", message: "select is required" };
  }

  // 1. Bare wildcard — only on vetted platform-global tables.
  if (trimmed === "*") {
    if (WILDCARD_TABLES.has(table)) return { ok: true, select: "*" };
    return {
      ok: false,
      code: "WILDCARD_NOT_ALLOWED",
      message: `"*" is not allowed on ${table}; list explicit columns`,
    };
  }

  // 2. Relational embed — ONLY the frozen known-good shapes per host table.
  if (/[()]/.test(trimmed)) {
    const allowed = EMBED_ALLOWLIST[table];
    if (allowed && allowed.has(normalizeSelect(trimmed))) {
      return { ok: true, select: trimmed };
    }
    return {
      ok: false,
      code: "EMBED_NOT_ALLOWED",
      message: `relational embeds are not allowed on ${table} via this endpoint`,
    };
  }

  // 3. Flat select — every comma-separated token must be a bare identifier.
  //    Rejects "*", aliases (":"), dotted paths ("."), and FK hints ("!").
  const tokens = trimmed.split(",").map((t) => t.trim());
  for (const tok of tokens) {
    if (!IDENTIFIER.test(tok)) {
      return { ok: false, code: "ILLEGAL_SELECT_TOKEN", message: `illegal select token "${tok}"` };
    }
  }
  return { ok: true, select: tokens.join(", ") };
}

/**
 * filter / order columns must be bare identifiers (no embedded-resource paths,
 * no relational/alias syntax). Blocks filtering/ordering through to another
 * table and column-name injection.
 */
export function isAllowedColumn(column: unknown): boolean {
  return typeof column === "string" && IDENTIFIER.test(column);
}
