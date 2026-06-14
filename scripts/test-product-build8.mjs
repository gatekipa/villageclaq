import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// ───────────────────────────────────────────────────────────────────────────
// Build 8 — Announcement Producerization + Real Delivery State (PREPARED, NOT
// CUTOVER). Static guardrails proving the new machinery is DORMANT (imported by
// nothing live), nothing was cut over, no migration is applied, the ANNOUNCEMENT
// template is not remapped, and Build-7 honesty + the P0 guard are intact.
// ───────────────────────────────────────────────────────────────────────────

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(root, rel));

const PRODUCER = "src/lib/announcement-producer.ts";
const MAPPER = "src/lib/announcement-delivery-status-mapping.ts";
const ROLLUP = "src/lib/announcement-delivery-rollup.ts";
const MIG_106 = "supabase/migrations/00106_announcement_delivery_idempotency.sql";
const MIG_107 = "supabase/migrations/00107_announcement_delivery_states.sql";
const CRON = "src/app/api/cron/send-scheduled-announcements/route.ts";
const AUDIT = "scripts/audit-whatsapp.mjs";
const CHANNELS = "src/lib/announcement-channels.ts";
const RECORD = "src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx";

const DORMANT_MODULES = [
  "@/lib/announcement-producer",
  "@/lib/announcement-delivery-status-mapping",
  "@/lib/announcement-delivery-rollup",
];

// Recursively collect every .ts/.tsx under src/.
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (/\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

// ── 1. Dormant artifacts exist and carry the DORMANT banner ─────────────────

test("dormant producer/mapper/rollup exist and are banner-marked DORMANT", () => {
  for (const f of [PRODUCER, MAPPER, ROLLUP]) assert.ok(exists(f), `${f} exists`);
  assert.ok(/DORMANT — Build 8/.test(read(PRODUCER)), "producer banner");
  assert.ok(/DORMANT — Build 8/.test(read(MAPPER)), "mapper banner");
  assert.ok(/DORMANT — Build 8/.test(read(ROLLUP)), "rollup banner");
  assert.ok(/export async function produceAnnouncementDeliveries/.test(read(PRODUCER)), "producer entry exists");
});

// ── 2. DORMANCY: nothing live imports the new modules ───────────────────────

test("no route/component/cron imports the dormant modules (only the modules + tests may)", () => {
  const allowed = new Set([
    "src/lib/announcement-producer.ts", // imports the mapping type
    "src/lib/announcement-delivery-rollup.ts", // imports producer + mapping types
  ]);
  const offenders = [];
  for (const f of walk("src")) {
    if (allowed.has(f)) continue;
    const src = read(f);
    for (const mod of DORMANT_MODULES) {
      if (src.includes(mod)) offenders.push(`${f} imports ${mod}`);
    }
  }
  assert.deepEqual(offenders, [], `dormant modules must not be imported by live code:\n${offenders.join("\n")}`);
});

// ── 3. Cron + audit allowlist unchanged (no cutover) ────────────────────────

test("scheduled cron does NOT import the producer and stays on the audit allowlist", () => {
  assert.ok(!read(CRON).includes("announcement-producer"), "cron does not import the producer (no cutover)");
  // audit still lists the cron as an allowed direct-dispatch route
  assert.ok(/send-scheduled-announcements/.test(read(AUDIT)), "cron still referenced in audit allowlist");
});

// ── 4. Producer behaviour invariants (string-level) ─────────────────────────

test("producer is queue/ledger only — no send/dispatch calls, queue rows are 'queued'", () => {
  const p = read(PRODUCER);
  for (const sendFn of ["dispatchWhatsApp", "sendEmail", "sendSmsNotification", "notifyBulkFromClient", "notifyFromClient"]) {
    assert.ok(!p.includes(sendFn), `producer must not call ${sendFn}`);
  }
  assert.ok(/status: "queued"/.test(p), "external queue rows are 'queued'");
  assert.ok(!/status: "sent"/.test(p), "producer never writes a 'sent' status");
  // in-app is terminal in_app_published and never enqueued
  assert.ok(/status: "in_app_published", enqueue: false/.test(p), "in_app is in_app_published, not enqueued");
  // idempotency anchor + 23505 handling
  assert.ok(/23505/.test(p), "handles unique-violation 23505 as duplicate");
  // group scoping persisted
  assert.ok(/group_id: groupId/.test(p), "delivery rows carry group_id (tenant scoping)");
});

// ── 5. Template NOT remapped; mapper maps 131049 specifically ───────────────

test("ANNOUNCEMENT template unchanged + producer uses it; mapper maps 131049 to blocked_by_policy", () => {
  assert.ok(/WA_TEMPLATES\.ANNOUNCEMENT/.test(read(PRODUCER)), "producer references the unchanged ANNOUNCEMENT template");
  const m = read(MAPPER);
  assert.ok(/131049/.test(m) && /blocked_by_policy/.test(m), "mapper maps 131049 -> blocked_by_policy");
  assert.ok(/case "sent":\s*return "sent_to_provider"/.test(m), "sent -> sent_to_provider (acceptance != delivery)");
});

// ── 6. Migration 00107 exists, create-not-apply, additive ───────────────────

test("00107 exists, create-not-apply, adds enum values + columns, no destructive SQL", () => {
  assert.ok(exists(MIG_106) && exists(MIG_107), "both migrations exist");
  const m = read(MIG_107);
  assert.ok(/CREATED, NOT APPLIED/.test(m), "00107 marked created-not-applied");
  for (const v of ["queued", "sent_to_provider", "in_app_published", "blocked_by_policy", "unavailable", "skipped_no_recipient", "skipped_channel_disabled"]) {
    assert.ok(new RegExp(`ADD VALUE IF NOT EXISTS '${v}'`).test(m), `00107 adds enum value ${v}`);
  }
  for (const c of ["group_id", "queued_at", "failed_at", "failure_reason", "provider_message_id"]) {
    assert.ok(new RegExp(`ADD COLUMN IF NOT EXISTS ${c}`).test(m), `00107 adds column ${c}`);
  }
  assert.ok(!/DROP TABLE|TRUNCATE|DELETE FROM/.test(m), "no destructive statements");
});

// ── 7. Build-7 honesty + P0 guard untouched ─────────────────────────────────

test("Build-7 honesty model unchanged (status union has no delivered/failed)", () => {
  const c = read(CHANNELS);
  // The AnnouncementStatus union must remain exactly the 4 honest values —
  // delivered/failed are not derivable without evidence and must not appear in
  // the type (comments elsewhere may mention them; we scope to the union).
  const m = c.match(/export type AnnouncementStatus =([\s\S]*?);/);
  assert.ok(m, "AnnouncementStatus union present");
  const union = m[1];
  for (const v of ["draft", "scheduled", "published", "published_external"]) {
    assert.ok(union.includes(`"${v}"`), `union has ${v}`);
  }
  assert.ok(!union.includes('"delivered"') && !union.includes('"failed"'), "union has no delivered/failed");
});

test("P0 bulk-record receipt guard remains intact (not in this build)", () => {
  const r = read(RECORD);
  assert.ok(/const \[bulkSendReceipts, setBulkSendReceipts\] = useState\(false\)/.test(r), "receipts opt-in default OFF");
  assert.ok(/disabled=\{bulkSubmitting \|\| \(bulkSendReceipts && !bulkReconfirm\)\}/.test(r), "reconfirm gate intact");
  assert.ok(!/onClick=\{handleBulkSave\}/.test(r), "no direct-save path");
});
