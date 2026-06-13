import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Static guardrails for Build-3 — Join System Hardening + Platform Admin
// Control Plane. Two headline QA findings drive this:
//   1. A new group's EMAIL invite never arrived but onboarding showed success
//      (silent fire-and-forget). It must report delivery truth.
//   2. Platform-admin Suspend / Change Plan / Archive were dummy buttons and the
//      plan label showed the community category (group_type), not the billing
//      tier (group_subscriptions.tier).
// Plus audit-surfaced security: proxy-claim tokens had no identity binding,
// create_proxy_member let any member mint privileged proxies, and the support
// "impersonation" feature is audit-record-only (no real context switch).
//
// Style mirrors scripts/test-product-multitenant.mjs: read sources as text and
// assert clause presence/absence — there is no React harness.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const present = (rel) => fs.existsSync(path.join(root, rel));

const ONBOARDING = "src/app/[locale]/(dashboard)/dashboard/onboarding/group/page.tsx";
const ADMIN_GROUPS = "src/app/[locale]/admin/groups/page.tsx";
const GROUP_ACTION = "src/app/api/admin/group-action/route.ts";
const MUTATE_ROUTE = "src/app/api/admin/mutate/route.ts";
const MIGRATION = "supabase/migrations/00103_join_platform_admin_hardening.sql";
const CLAIM_PAGE = "src/app/[locale]/claim/[token]/page.tsx";
const BANNER = "src/components/admin/impersonation-banner.tsx";
const DASH_LAYOUT = "src/app/[locale]/(dashboard)/layout.tsx";

const onboarding = read(ONBOARDING);
const adminGroups = read(ADMIN_GROUPS);
const groupAction = read(GROUP_ACTION);
const mutateRoute = read(MUTATE_ROUTE);
const migration = read(MIGRATION);
const claimPage = read(CLAIM_PAGE);
const banner = read(BANNER);
const dashLayout = read(DASH_LAYOUT);
const en = JSON.parse(read("messages/en.json"));
const fr = JSON.parse(read("messages/fr.json"));

// ---------------------------------------------------------------------------
// 1. Onboarding invite delivery truth (QA finding #1)
// ---------------------------------------------------------------------------

test("onboarding email send is awaited and its result is checked", () => {
  assert.ok(
    onboarding.includes('const res = await fetch("/api/email/send"'),
    "email send must be awaited (not fire-and-forget)",
  );
  assert.ok(
    onboarding.includes("if (res.ok)"),
    "the HTTP response must be checked so a 500 is not treated as success",
  );
  assert.ok(
    onboarding.includes("emailFailed++") && onboarding.includes("emailSent++"),
    "per-channel success/failure must be tallied",
  );
});

test("onboarding surfaces an honest completion outcome instead of always navigating", () => {
  assert.ok(onboarding.includes("setSetupOutcome"), "tracks a delivery outcome");
  assert.ok(
    onboarding.includes("setupCompleteTitle") &&
      onboarding.includes("inviteEmailFailedCount"),
    "renders an honest completion screen with failure counts",
  );
});

test("onboarding no longer drops email via the null-userId channel-pref gate", () => {
  assert.ok(
    !onboarding.includes("getEnabledChannels"),
    "the second silent-loss vector (getEnabledChannels with null userId) is removed",
  );
});

test("onboarding reports WhatsApp invites as queued, not sent, and labels phone=WhatsApp", () => {
  assert.ok(onboarding.includes("phoneQueued"), "WhatsApp leg reported as queued");
  assert.ok(
    onboarding.includes("invitePhoneWhatsappNote"),
    "UI clarifies phone invitations are delivered via WhatsApp",
  );
});

// ---------------------------------------------------------------------------
// 2. Platform-admin plan label + real actions (QA finding #2)
// ---------------------------------------------------------------------------

test("admin groups reads the billing tier from group_subscriptions, not group_type", () => {
  assert.ok(
    adminGroups.includes("group_subscriptions"),
    "queries group_subscriptions for the plan tier",
  );
  assert.ok(
    adminGroups.includes("tierByGroup") && adminGroups.includes("planLabel"),
    "renders a tier-derived plan label",
  );
  // The Plan Tier field must use planLabel(group), not the old group_type value.
  assert.ok(
    adminGroups.includes("{planLabel(group)}"),
    "Plan Tier field renders planLabel(group)",
  );
});

test("admin groups wires the real actions to the dedicated group-action route", () => {
  assert.ok(
    adminGroups.includes('"/api/admin/group-action"'),
    "actions POST to /api/admin/group-action",
  );
  assert.ok(
    adminGroups.includes("openAction") && adminGroups.includes("submitAction"),
    "actions open a confirm dialog and submit",
  );
});

test("admin groups gates the memberships query so sales/finance don't 403 the whole batch", () => {
  assert.ok(
    adminGroups.includes("canReadMemberships"),
    "memberships query is role-gated (sales/finance cannot read memberships)",
  );
  // memberCount falls back to a dash when memberships are not readable.
  assert.ok(
    adminGroups.includes('canReadMemberships ? group.memberCount : "--"'),
    "member count shows -- when not readable instead of breaking the page",
  );
});

test("admin groups maps machine error codes to translated copy (no raw enum tokens)", () => {
  assert.ok(adminGroups.includes("ACTION_ERROR_KEY"), "uses an error-code -> i18n key map");
  assert.ok(
    !/body\.message \|\| body\.error/.test(adminGroups),
    "never renders body.error / body.message raw",
  );
  assert.ok(
    adminGroups.includes('setActionError(t("actionFailedGeneric"))'),
    "network/parse errors fall back to a translated generic message",
  );
});

test("admin groups gates Suspend/Archive behind the lifecycle schema probe", () => {
  assert.ok(adminGroups.includes("lifecycleProbe"), "soft-probes groups.status");
  assert.ok(adminGroups.includes("lifecycleReady"), "computes lifecycle readiness");
  assert.ok(
    adminGroups.includes("lifecyclePendingMigration"),
    "shows a pending-migration notice when the schema is absent",
  );
  assert.ok(
    /disabled=\{!lifecycleReady\}/.test(adminGroups),
    "Suspend/Archive buttons are disabled until the schema is live",
  );
});

test("admin groups captures a reason for destructive actions", () => {
  assert.ok(
    adminGroups.includes("reasonRequired") && adminGroups.includes("reasonRequiredError"),
    "requires a reason for suspend/archive",
  );
});

// ---------------------------------------------------------------------------
// 3. group-action route — scoped, RBAC'd, audited
// ---------------------------------------------------------------------------

test("group-action route exists and enforces split RBAC", () => {
  assert.ok(present(GROUP_ACTION), "dedicated route exists");
  // lifecycle → super_admin/admin ; plan → super_admin/finance
  assert.ok(
    groupAction.includes('role === "super_admin" || role === "admin"'),
    "lifecycle actions gated to super_admin/admin",
  );
  assert.ok(
    groupAction.includes('role === "super_admin" || role === "finance"'),
    "change_plan gated to super_admin/finance",
  );
});

test("group-action requires a reason for suspend/archive and audits every action", () => {
  assert.ok(groupAction.includes("REASON_REQUIRED"), "suspend/archive require a reason");
  assert.ok(
    groupAction.includes("platform_audit_logs"),
    "writes an audit log row for every action",
  );
});

test("group-action only touches scoped columns — generic mutate allowlist NOT widened", () => {
  // We deliberately did NOT add `groups` to the generic /api/admin/mutate
  // allowlist (which would expose every groups column to arbitrary writes).
  assert.ok(
    !mutateRoute.includes('"groups"'),
    "generic mutate route must not allow arbitrary writes to the groups table",
  );
  // change_plan writes ONLY tier — never status — so it cannot resurrect a
  // past_due/cancelled/expired subscription to 'active' on the conflict path.
  assert.ok(
    groupAction.includes("upsert({ group_id: groupId, tier }"),
    "plan change upserts only group_id + tier (no status clobber)",
  );
  assert.ok(
    groupAction.includes('onConflict: "group_id"'),
    "plan change upserts on group_id, preserving other subscription columns",
  );
});

// ---------------------------------------------------------------------------
// 4. Migration 00103 — created (applied separately at release)
// ---------------------------------------------------------------------------

test("migration 00103 models the group lifecycle", () => {
  assert.ok(present(MIGRATION), "migration file exists");
  assert.ok(
    /status.*IN.*'active'.*'suspended'.*'archived'/s.test(migration),
    "adds a status lifecycle with active/suspended/archived",
  );
  assert.ok(
    migration.includes("suspended_at") && migration.includes("archived_at"),
    "adds reason/timestamp columns",
  );
  assert.ok(
    migration.includes("enforce_group_lifecycle"),
    "enforces the lifecycle as authoritative over is_active",
  );
});

test("migration 00103 makes the platform lifecycle authoritative over is_active (no owner override)", () => {
  // A platform-suspended/archived group must be forced is_active=false on EVERY
  // update so an owner's is_active=true write can never un-suspend it.
  assert.ok(
    /NEW\.status IN \('suspended', 'archived'\)/.test(migration),
    "trigger checks suspended/archived on every update",
  );
  assert.ok(
    /NEW\.is_active := false/.test(migration),
    "suspended/archived forces is_active=false",
  );
});

test("owner reactivate screen honestly handles a platform-suspended group", () => {
  assert.ok(
    dashLayout.includes("reactivateBlocked"),
    "owner reactivate detects the DB trigger refusal",
  );
  assert.ok(
    dashLayout.includes('deactivateGroupScreen.platformSuspended"'),
    "shows an honest 'suspended by VillageClaq' message",
  );
  assert.ok(
    en.settings.deactivateGroupScreen.platformSuspended &&
      fr.settings.deactivateGroupScreen.platformSuspended,
    "platformSuspended copy exists in both locales",
  );
});

test("migration 00103 binds the proxy claim to the claimer identity", () => {
  assert.ok(
    migration.includes("claim_identity_mismatch"),
    "rejects a claim whose token email/phone does not match the claimer",
  );
  assert.ok(
    migration.includes("claim_user_mismatch"),
    "rejects acting on behalf of an arbitrary user id (uses auth.uid())",
  );
  assert.ok(
    migration.includes("get_my_phone_digits") && migration.includes("auth.jwt"),
    "matches against verified phone digits and JWT email",
  );
});

test("migration 00103 hardens proxy creation and token exposure", () => {
  assert.ok(
    migration.includes("invalid_proxy_role"),
    "whitelists the proxy role (no privileged proxies)",
  );
  assert.ok(
    /role IN \('owner', 'admin', 'moderator'\)/.test(migration),
    "requires an officer caller to create proxies",
  );
  assert.ok(
    /REVOKE SELECT ON public\.proxy_claim_tokens FROM anon/.test(migration),
    "removes the anon raw-table grant on proxy_claim_tokens",
  );
});

test("migration 00103 repairs the support-session ticket gate", () => {
  assert.ok(
    migration.includes("ticket_not_active"),
    "support ticket gate accepts active tickets (was the non-existent 'open')",
  );
  assert.ok(
    /status NOT IN \('new', 'in_progress'\)/.test(migration),
    "uses the real enquiry_status values",
  );
  // assigned_to holds a platform_staff.id, so it must be compared to the
  // caller's staff id, not auth.uid() (the 00085 bug that made the gate
  // unreachable for every support agent).
  assert.ok(
    /assigned_to IS DISTINCT FROM v_staff_id/.test(migration),
    "ticket ownership compared against the caller's staff id",
  );
});

// ---------------------------------------------------------------------------
// 5. Claim page maps the new identity-mismatch error
// ---------------------------------------------------------------------------

test("claim page surfaces a friendly identity-mismatch message", () => {
  assert.ok(
    claimPage.includes("claim_identity_mismatch") && claimPage.includes("claim_user_mismatch"),
    "maps the new RPC errors",
  );
  assert.ok(claimPage.includes('t("identityMismatch")'), "shows a friendly message");
});

// ---------------------------------------------------------------------------
// 6. Impersonation honesty — no false "you are impersonating X"
// ---------------------------------------------------------------------------

test("support-session banner tells the truth (no impersonation claim)", () => {
  assert.ok(
    banner.includes('t("supportSessionBannerTitle")'),
    'banner says "Platform support session active"',
  );
  assert.ok(
    !banner.includes('t("impersonationBannerTitle"'),
    'banner no longer claims "you are impersonating X"',
  );
  assert.ok(
    banner.includes("session.reason"),
    "banner surfaces the session reason",
  );
});

test("impersonation copy reframed as an audited support session", () => {
  assert.notEqual(en.admin.impersonate, "Impersonate", "trigger label reframed");
  assert.ok(
    en.admin.supportSessionBannerTitle && fr.admin.supportSessionBannerTitle,
    "support-session banner copy exists in both locales",
  );
  assert.ok(
    /does NOT sign you in/i.test(en.admin.impersonateUserDesc),
    "dialog copy states there is no real context switch",
  );
});

// ---------------------------------------------------------------------------
// 7. i18n parity for all new keys
// ---------------------------------------------------------------------------

test("all Build-3 keys present in both locales", () => {
  const adminKeys = [
    "tierFree", "tierStarter", "tierPro", "tierEnterprise", "confirm",
    "reasonOptional", "reasonRequiredError", "reasonPlaceholder",
    "actionFailedGeneric", "actionForbidden", "actionInvalidTier",
    "lifecyclePendingMigration",
    "suspendGroupConfirm", "activateGroupConfirm", "archiveGroupConfirm",
    "changePlanConfirm", "supportSessionBannerTitle",
    "supportSessionBannerSubject", "supportSessionBannerReason",
  ];
  const onboardingKeys = [
    "progressInvites", "setupCompleteTitle", "setupCompleteGroupCreated",
    "inviteEmailSentCount", "inviteWhatsappQueuedCount", "inviteEmailFailedCount",
    "inviteSaveFailed", "inviteResendHint", "continueToDashboard",
    "invitePhoneWhatsappNote",
  ];
  for (const k of adminKeys) {
    assert.ok(en.admin[k], `en.admin.${k} present`);
    assert.ok(fr.admin[k], `fr.admin.${k} present`);
  }
  for (const k of onboardingKeys) {
    assert.ok(en.onboarding[k], `en.onboarding.${k} present`);
    assert.ok(fr.onboarding[k], `fr.onboarding.${k} present`);
  }
  assert.ok(en.claim.identityMismatch && fr.claim.identityMismatch, "claim.identityMismatch present");
});
