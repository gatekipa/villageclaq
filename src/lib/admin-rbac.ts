/**
 * Platform-admin RBAC matrix — server-side source of truth.
 *
 * Every table referenced by /api/admin/query, /api/admin/mutate, and
 * /api/admin/export consults this module. Routes hand off the caller's
 * `platform_role` + the table (+ mutation type) they're about to
 * perform, and this module returns allow/deny.
 *
 * The matrix mirrors the PRD RBAC table:
 *
 *   | super_admin | admin | sales | support | finance |
 *
 * INTENTIONAL EXCEPTION — the previous version of /api/admin/query ran
 * under the service role with NO role filter, letting any active staff
 * (e.g. Sales) read any table (e.g. payments). That defeated the
 * entire three-layer RBAC story. This module closes that gap — routes
 * must call canRead/canMutate before hitting the service-role client.
 */

export type PlatformRole =
  | "super_admin"
  | "admin"
  | "sales"
  | "support"
  | "finance";

/**
 * Tables a role may READ via /api/admin/query. "*" means every table
 * in the allowlist accepted by the routes (super_admin). Anything not
 * in the role's set is 403 regardless of whether the query is a select
 * on a different table. Read is the superset of what the role needs
 * to render their dashboards.
 */
const READ_ALLOWLIST: Record<PlatformRole, Set<string> | "*"> = {
  super_admin: "*",

  admin: new Set([
    "groups", "profiles", "memberships",
    "platform_audit_logs", "platform_staff", "platform_config", "platform_permissions",
    "contact_enquiries", "testimonials", "faqs",
    "group_subscriptions", "subscription_plans",
    "events", "payments", "contribution_obligations",
    "announcements", "meeting_minutes", "relief_plans", "relief_claims",
    "fines", "loans", "hosting_assignments",
  ]),

  sales: new Set([
    "groups", "profiles",
    "testimonials", "faqs", "contact_enquiries",
    "platform_config",
  ]),

  support: new Set([
    "groups", "profiles", "memberships",
    "contact_enquiries",
    "platform_config",
    "events", "meeting_minutes", "announcements",
    "contribution_obligations", "payments",
    "fines", "disputes", "hosting_assignments",
  ]),

  finance: new Set([
    "groups", "profiles",
    "payments", "group_subscriptions", "subscription_plans", "subscription_vouchers",
    "contribution_obligations",
    "platform_config",
  ]),
};

/**
 * Tables a role may MUTATE. Tighter than READ — a Support agent
 * can read a member's payments for a ticket, but can never write
 * to `payments`.
 */
const MUTATE_ALLOWLIST: Record<PlatformRole, Set<string> | "*"> = {
  super_admin: "*",

  admin: new Set([
    "platform_audit_logs",
    "platform_config",
    "contact_enquiries",
    "testimonials",
    "faqs",
    // Deliberately omitted for platform_admin:
    //   platform_staff (super_admin only — V10 gate)
    //   subscription_plans / subscription_vouchers (finance)
  ]),

  sales: new Set([
    "testimonials",
    "faqs",
    "contact_enquiries",
  ]),

  support: new Set([
    "contact_enquiries",
  ]),

  finance: new Set([
    "subscription_plans",
    "subscription_vouchers",
    "group_subscriptions",
  ]),
};

/**
 * Export channels a role may download. Support must never export
 * contributions; Sales must never export member rosters (PII); only
 * Super/Platform Admin can export members. Finance is intentionally
 * absent from the member roster — revenue data is exported separately
 * via the finance dashboard.
 */
const EXPORT_ALLOWLIST: Record<PlatformRole, Set<string> | "*"> = {
  super_admin: "*",
  admin: new Set(["members", "attendance", "contributions", "relief"]),
  sales: new Set([]),
  support: new Set(["attendance"]),
  finance: new Set(["contributions"]),
};

export function canRead(role: PlatformRole, table: string): boolean {
  const set = READ_ALLOWLIST[role];
  if (set === "*") return true;
  return set.has(table);
}

export function canMutate(role: PlatformRole, table: string): boolean {
  const set = MUTATE_ALLOWLIST[role];
  if (set === "*") return true;
  return set.has(table);
}

export function canExport(role: PlatformRole, type: string): boolean {
  const set = EXPORT_ALLOWLIST[role];
  if (set === "*") return true;
  return set.has(type);
}

/** Staff-roster writes are gated to super_admin only — V10 fix. */
export function canManageStaff(role: PlatformRole): boolean {
  return role === "super_admin";
}

/** Only super_admin and platform_admin can CRUD platform-wide settings. */
export function canManageSettings(role: PlatformRole): boolean {
  return role === "super_admin" || role === "admin";
}
