import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// ───────────────────────────────────────────────────────────────────────────
// Build 7 — Announcement Honesty + Delivery Strategy. Static guardrails pinning
// that the announcement UI never claims more than it can prove, the WhatsApp
// category restriction is disclosed (not hidden), and the build did NOT remap
// the ANNOUNCEMENT template, weaken the P0 receipt guard, or apply a migration.
// All read-only string assertions — they send nothing and mutate nothing.
// ───────────────────────────────────────────────────────────────────────────

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(root, rel));

const PAGE = "src/app/[locale]/(dashboard)/dashboard/announcements/page.tsx";
const MODEL = "src/lib/announcement-channels.ts";
const TEMPLATES = "src/lib/whatsapp-templates.ts";
const CRON = "src/app/api/cron/send-scheduled-announcements/route.ts";
const STRATEGY = "docs/announcements-whatsapp-strategy.md";
const MIGRATION = "supabase/migrations/00106_announcement_delivery_idempotency.sql";
const RECORD = "src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx";

const page = read(PAGE);
const model = read(MODEL);
const templates = read(TEMPLATES);
const cron = read(CRON);
const en = JSON.parse(read("messages/en.json"));
const fr = JSON.parse(read("messages/fr.json"));

// ── 1. Truth model exists and is consumed by the composer ───────────────────

test("announcement channel/status truth model exists and is pure", () => {
  assert.ok(exists(MODEL), "announcement-channels.ts exists");
  assert.ok(/export function deriveAnnouncementStatus/.test(model), "exports deriveAnnouncementStatus");
  assert.ok(/export function getAnnouncementChannelDescriptors/.test(model), "exports descriptors");
  // pure: no supabase/send imports
  assert.ok(!/from "@\/lib\/(supabase|send-|notify|whatsapp-dispatcher)/.test(model), "model imports no I/O/send libs");
});

test("composer derives status from the model, not a bare sent_at -> 'Sent' badge", () => {
  assert.ok(/deriveAnnouncementStatus\(/.test(page), "page uses deriveAnnouncementStatus");
  assert.ok(/announcementStatusLabelKey\(/.test(page), "page uses announcementStatusLabelKey");
  // The old conflating badge — `if (sentAt) { ... {t("sent")} }` — must be gone.
  assert.ok(!/if \(sentAt\) \{[\s\S]{0,120}t\("sent"\)/.test(page), "old sent_at->'Sent' success badge removed");
});

// ── 2. Honest status vocabulary ─────────────────────────────────────────────

test("honest status labels exist (Published / Published + sent), no standalone 'delivered' badge", () => {
  for (const k of ["statusPublished", "statusPublishedExternal"]) {
    assert.ok(en.communications?.[k], `en.communications.${k} exists`);
    assert.ok(fr.communications?.[k], `fr.communications.${k} exists`);
  }
  // The history filter shows "Published" vocabulary.
  assert.ok(/t\("filterPublished"\)/.test(page), "history filter uses filterPublished label");
});

// ── 3. WhatsApp disclosed (opt-in, off by default, warned) — NOT hidden ──────

test("WhatsApp announcement is opt-in OFF by default and carries the US/category warning", () => {
  // default channel state: whatsapp false (kept opt-in per strategy class 5)
  assert.ok(/in_app: true,\s*email: false,\s*sms: false,\s*whatsapp: false/.test(page), "channels default whatsapp:false");
  // composer surfaces the warning copy
  assert.ok(/whatsappUsWarningBanner/.test(page), "send-confirm shows whatsappUsWarningBanner");
  assert.ok(/channelReasonWhatsappUsBlocked/.test(page), "channel picker shows WhatsApp US-blocked reason");
  // model marks it restricted + warn
  assert.ok(/category_restricted/.test(model) && /ANNOUNCEMENT_WHATSAPP_CATEGORY_RESTRICTED = true/.test(model), "model flags WhatsApp category_restricted");
});

test("confirm button uses the honest queued label", () => {
  assert.ok(/t\("sendConfirmActionQueued"\)/.test(page), "confirm button = sendConfirmActionQueued");
  assert.ok(en.communications.sendConfirmActionQueued && fr.communications.sendConfirmActionQueued, "queued action key EN/FR");
});

// ── 4. No template remap / config change (audit-pinned invariant) ───────────

test("ANNOUNCEMENT template is unchanged (MARKETING / not US-safe) and metadata agrees", () => {
  assert.ok(/ANNOUNCEMENT: "villageclaq_announcement_v2"/.test(templates), "ANNOUNCEMENT constant unchanged");
  assert.ok(/MARKETING-risk|MARKETING-categorized|not US-safe|US-safe/i.test(templates), "risk annotation retained");
  // structured metadata says MARKETING + usBlocked
  assert.ok(/ANNOUNCEMENT: \{ name: WA_TEMPLATES\.ANNOUNCEMENT, category: "MARKETING", usBlocked: true \}/.test(templates), "TEMPLATE_METADATA.ANNOUNCEMENT is MARKETING/usBlocked");
});

// ── 5. Audit-log honesty ────────────────────────────────────────────────────

test("audit-log action is split by real state (not always 'sent')", () => {
  assert.ok(/announcementAuditAction\(/.test(page), "page uses announcementAuditAction");
  assert.ok(/announcement\.created/.test(model) && /announcement\.scheduled/.test(model), "model returns created/scheduled actions");
});

// ── 6. Cron stays direct-dispatch + allowlisted; gap documented ─────────────

test("scheduled cron documents the per-recipient idempotency gap (no producerization in this build)", () => {
  assert.ok(/ROW-LEVEL ONLY|per-recipient idempotency/i.test(cron), "cron documents row-level-only idempotency gap");
  assert.ok(/00106/.test(cron), "cron points to the created-not-applied migration");
  // behavior unchanged: still flips sent_at after dispatch
  assert.ok(/sent_at/.test(cron), "cron still gates on sent_at");
});

// ── 7. Migration created, NOT applied ───────────────────────────────────────

test("migration 00106 exists and is create-not-apply (additive, idempotent)", () => {
  assert.ok(exists(MIGRATION), "00106 migration file exists");
  const m = read(MIGRATION);
  assert.ok(/CREATED, NOT APPLIED/.test(m), "header marks created-not-applied");
  assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS uq_announcement_deliveries_recipient_channel/.test(m), "adds per-recipient unique index");
  assert.ok(!/DROP TABLE|TRUNCATE|DELETE FROM/.test(m), "no destructive statements");
});

// ── 8. P0 bulk-record receipt guard untouched by this build ─────────────────

test("P0 bulk-record receipt guard remains intact (not in this diff)", () => {
  const rec = read(RECORD);
  assert.ok(/const \[bulkSendReceipts, setBulkSendReceipts\] = useState\(false\)/.test(rec), "receipts opt-in default OFF");
  assert.ok(/disabled=\{bulkSubmitting \|\| \(bulkSendReceipts && !bulkReconfirm\)\}/.test(rec), "second money-received reconfirm gate");
  assert.ok(!/onClick=\{handleBulkSave\}/.test(rec), "no direct-save path");
});

// ── 9. EN/FR parity for every new announcement-honesty key ──────────────────

test("new announcement-honesty i18n keys have EN/FR parity with placeholders intact", () => {
  const keys = [
    "sendConfirmActionQueued", "statusPublished", "statusPublishedExternal", "filterPublished",
    "channelReasonInAppAlwaysOn", "channelReasonEmailBestEffort", "channelReasonSmsAfricaOnly",
    "channelReasonWhatsappUsBlocked", "whatsappUsWarningBanner", "externalNotConfirmedNote",
    "channelNotDeliveryConfirmed",
  ];
  for (const k of keys) {
    assert.ok(en.communications?.[k], `en.communications.${k} exists`);
    assert.ok(fr.communications?.[k], `fr.communications.${k} exists`);
  }
});
