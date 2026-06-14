import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Static guardrails for Build-5 — Performance + Slowness Program. Pins the
// shipped perf fixes (no full-table fetch where a scoped/single-row fetch is
// enough, admin query hard-capped, dead query gone, money rollups still
// confirmed-only and group-scoped) and the index migration.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const present = (rel) => fs.existsSync(path.join(root, rel));

const HOOKS = "src/lib/hooks/use-supabase-query.ts";
const DASHBOARD = "src/app/[locale]/(dashboard)/dashboard/page.tsx";
const ADMIN_QUERY = "src/app/api/admin/query/route.ts";
const FINANCES = "src/app/[locale]/(dashboard)/dashboard/finances/page.tsx";
const MIGRATION = "supabase/migrations/00105_performance_indexes.sql";

const hooks = read(HOOKS);
const dashboard = read(DASHBOARD);
const adminQuery = read(ADMIN_QUERY);
const finances = read(FINANCES);
const migration = read(MIGRATION);

// ── 1. Dashboard over-fetch → scoped single-row hooks ───────────────────────

test("dashboard uses scoped single-row event/minutes hooks, not full-table scans", () => {
  assert.ok(/export function useNextEvent/.test(hooks), "useNextEvent hook exists");
  assert.ok(/export function useLatestMinutes/.test(hooks), "useLatestMinutes hook exists");
  // both must be bounded to one row
  const nextEvent = hooks.slice(hooks.indexOf("function useNextEvent"), hooks.indexOf("function useNextEvent") + 900);
  const latest = hooks.slice(hooks.indexOf("function useLatestMinutes"), hooks.indexOf("function useLatestMinutes") + 1200);
  assert.ok(/\.limit\(1\)/.test(nextEvent) && /maybeSingle\(\)/.test(nextEvent), "useNextEvent is single-row");
  assert.ok(/\.limit\(1\)/.test(latest) && /maybeSingle\(\)/.test(latest), "useLatestMinutes is single-row");
  // latest minutes must NOT select the heavy body — only specific columns
  assert.ok(!/from\("meeting_minutes"\)\s*\.select\("\*/.test(latest), "useLatestMinutes does not select *");
  // must select the REAL jsonb columns, never the non-existent *_count columns
  // (selecting a non-existent column 400s and breaks the card for every group)
  assert.ok(/decisions_json/.test(latest) && /action_items_json/.test(latest), "selects the real jsonb columns");
  assert.ok(!/decisions_count|action_items_count/.test(latest), "does not select non-existent *_count columns");
  // dashboard consumes the scoped hooks, not the full-table ones
  assert.ok(dashboard.includes("useNextEvent") && dashboard.includes("useLatestMinutes"), "dashboard uses scoped hooks");
  assert.ok(!/= useEvents\(\)/.test(dashboard), "dashboard no longer full-table useEvents()");
  assert.ok(!/= useMeetingMinutes\(\)/.test(dashboard), "dashboard no longer full-table useMeetingMinutes()");
});

// ── 2. Admin query route is hard-capped (no unbounded RLS-bypassing fetch) ───

test("/api/admin/query enforces a hard server-side row cap", () => {
  assert.ok(/ADMIN_MAX_LIMIT/.test(adminQuery), "defines a max limit");
  assert.ok(/Math\.min\(q\.limit \?\? /.test(adminQuery), "clamps to default/max even when no limit supplied");
  // the old unconditional `if (q.limit)` gate must be gone
  assert.ok(!/if \(q\.limit\) \{\s*query = query\.limit\(q\.limit\);/.test(adminQuery), "no unbounded path remains");
});

// ── 3. Dead/no-op query removed from finances ───────────────────────────────

test("finances loan stats no longer fires the dead no-op overdue query", () => {
  assert.ok(
    !/\.in\("loan_id", \(activeLoans/.test(finances),
    "the no-op .in(loan_id, … ? [] : ['']) dead query is removed",
  );
  // the real group-scoped overdue join remains
  assert.ok(finances.includes('loans!inner(group_id)'), "real overdue join retained");
});

// ── 4. Group-scoping / no cross-group cache pollution (regression guard) ─────

test("core group-data hooks keep groupId in their React-Query key", () => {
  for (const key of [
    '["members", groupId]',
    '["next-event", groupId]',
    '["latest-minutes", groupId]',
    '["contribution-types", groupId]',
  ]) {
    assert.ok(hooks.includes(key), `hook key ${key} is group-scoped`);
  }
});

// ── 5. No-send guarantee on the perf-touched routes ─────────────────────────

test("dashboard + finances never import a send/receipt path", () => {
  const sendMarkers = /payment-receipt-producer|requestWelcomeWhatsApp|requestMemberInvitationWhatsApp|notify-money-path|receipt-notifications/;
  assert.ok(!sendMarkers.test(dashboard), "dashboard imports no send path");
  assert.ok(!sendMarkers.test(finances), "finances imports no send path");
});

// ── 6. Index migration 00105 — additive, guarded, documented ────────────────

test("migration 00105 adds the audited indexes, guarded + documented", () => {
  assert.ok(present(MIGRATION), "migration exists");
  // the Build-4 per-type gap is the headline index
  assert.ok(
    /idx_payments_group_type_active[\s\S]*payments \(group_id, contribution_type_id\)[\s\S]*WHERE relief_plan_id IS NULL/.test(migration),
    "indexes payments(group_id, contribution_type_id) partial on relief-null",
  );
  // all eight expected indexes present
  for (const idx of [
    "idx_payments_group_type_active", "idx_payments_group_recorded",
    "idx_payments_member_type_recorded", "idx_payments_obligation_status",
    "idx_obligations_group_status_due", "idx_notifications_queue_queued",
    "idx_group_audit_logs_entity_created", "idx_memberships_is_proxy",
  ]) {
    assert.ok(migration.includes(idx), `migration adds ${idx}`);
  }
  // re-runnable + non-destructive
  const creates = (migration.match(/CREATE INDEX IF NOT EXISTS/g) || []).length;
  assert.equal(creates, 8, "all eight use CREATE INDEX IF NOT EXISTS");
  assert.ok(!/DROP TABLE|ALTER TABLE|DELETE FROM|UPDATE /.test(migration), "purely additive (no DDL/DML beyond indexes)");
  assert.ok(/PREFLIGHT/.test(migration) && /ROLLBACK/.test(migration) && /VERIFICATION/.test(migration), "has preflight/rollback/verification");
});
