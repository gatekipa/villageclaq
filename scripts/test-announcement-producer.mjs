import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Build-8 unit tests for the DORMANT announcement producer (real logic via
// ts.transpile + vm + stubbed @/lib deps + an in-memory fake Supabase — same
// harness style as test-welcome-producer.mjs). Asserts: per-recipient delivery
// rows, in-app != external, honest blocked/skipped states, idempotency, queue
// rows only for sendable channels, group_id persisted, and that NO send/dispatch
// function is ever invoked (the producer imports none).

const sourcePath = new URL("../src/lib/announcement-producer.ts", import.meta.url);
const require = createRequire(import.meta.url);

const ids = {
  announcement: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  group: "99999999-9999-4999-8999-999999999999",
  mAfrican: "11111111-1111-4111-8111-111111111111",
  mUS: "22222222-2222-4222-8222-222222222222",
  mNoPhone: "33333333-3333-4333-8333-333333333333",
  proxy: "44444444-4444-4444-8444-444444444444",
  banned: "55555555-5555-4555-8555-555555555555",
  uAfrican: "a1111111-1111-4111-8111-111111111111",
  uUS: "a2222222-2222-4222-8222-222222222222",
  uNoPhone: "a3333333-3333-4333-8333-333333333333",
  uBanned: "a5555555-5555-4555-8555-555555555555",
};

const AFRICAN_PHONE = "+237670000001";
const US_PHONE = "+13014335857";

function loadProducer() {
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const cjsModule = { exports: {} };
  const localRequire = (id) => {
    if (id === "@/lib/format-phone-whatsapp") {
      return {
        formatPhoneForWhatsApp(phone) {
          if (!phone) return null;
          const digits = String(phone).replace(/\D/g, "");
          return digits.length >= 7 && digits.length <= 15 ? digits : null;
        },
      };
    }
    if (id === "@/lib/is-african-phone") {
      // African = NOT a US/Canada +1 number (sufficient for these tests).
      return { isAfricanPhoneNumber: (phone) => !!phone && !String(phone).replace(/[^\d+]/g, "").startsWith("+1") };
    }
    if (id === "@/lib/mask-phone") {
      return { maskPhoneNumber: (p) => { const d = String(p || "").replace(/\D/g, ""); return d ? `${d.slice(0, 3)}******${d.slice(-3)}` : "(missing)"; } };
    }
    if (id === "@/lib/get-member-name") {
      return { getMemberName: (r) => r?.display_name || r?.profile?.full_name || r?.profiles?.full_name || "Member" };
    }
    if (id === "@/lib/notification-prefs") {
      return { getEnabledChannels: async () => ({ in_app: true, email: true, sms: true, whatsapp: true, push: false }) };
    }
    if (id === "@/lib/whatsapp-templates") {
      return { WA_TEMPLATES: { ANNOUNCEMENT: "villageclaq_announcement_v2" } };
    }
    if (id === "@/lib/announcement-channels") {
      return { isWhatsAppCategoryRestricted: () => true };
    }
    return require(id);
  };
  vm.runInNewContext(compiled, { console: { log() {}, warn() {} }, exports: cjsModule.exports, module: cjsModule, require: localRequire }, { filename: sourcePath.pathname });
  return cjsModule.exports;
}

const producer = loadProducer();

function recipients() {
  return [
    { id: ids.mAfrican, user_id: ids.uAfrican, role: "member", display_name: "Afri", is_proxy: false, standing: "good", privacy_settings: {}, profiles: { full_name: "Afri", phone: AFRICAN_PHONE, preferred_locale: "en" } },
    { id: ids.mUS, user_id: ids.uUS, role: "member", display_name: "Yank", is_proxy: false, standing: "good", privacy_settings: {}, profiles: { full_name: "Yank", phone: US_PHONE, preferred_locale: "en" } },
    { id: ids.mNoPhone, user_id: ids.uNoPhone, role: "member", display_name: "NoPhone", is_proxy: false, standing: "good", privacy_settings: {}, profiles: { full_name: "NoPhone", phone: null, preferred_locale: "fr" } },
    { id: ids.proxy, user_id: null, role: "member", display_name: "Proxy", is_proxy: true, standing: "good", privacy_settings: { proxy_phone: AFRICAN_PHONE }, profiles: null },
    { id: ids.banned, user_id: ids.uBanned, role: "member", display_name: "Banned", is_proxy: false, standing: "banned", privacy_settings: {}, profiles: { full_name: "Banned", phone: AFRICAN_PHONE, preferred_locale: "en" } },
  ];
}

function createFake(state) {
  const deliveries = new Set(state.existingDeliveries || []);
  const calls = { deliveryInserts: [], queueInserts: [] };
  class Builder {
    constructor(table) { this.table = table; this.op = "select"; this.filters = {}; this._in = null; this.payload = null; }
    select() { return this; }
    eq(col, val) { this.filters[col] = val; return this; }
    in(col, vals) { this._in = { col, vals }; return this; }
    limit() { return this; }
    insert(payload) { this.op = "insert"; this.payload = payload; return this; }
    maybeSingle() { return Promise.resolve(this._single()); }
    then(resolve) { return Promise.resolve(resolve(this._many())); }
    _single() {
      if (this.table === "announcements") return { data: state.announcement, error: null };
      if (this.table === "groups") return { data: { name: state.groupName ?? "Njimafor Diaspora" }, error: null };
      if (this.table === "announcement_deliveries" && this.op === "select") {
        const key = `${this.filters.announcement_id}|${this.filters.membership_id}|${this.filters.channel}`;
        return { data: deliveries.has(key) ? { id: "existing" } : null, error: null };
      }
      return { data: null, error: null };
    }
    _many() {
      if (this.table === "memberships") {
        let rows = state.recipients;
        if (this._in) rows = rows.filter((r) => this._in.vals.includes(r[this._in.col]));
        return { data: rows, error: null };
      }
      if (this.op === "insert") return this._doInsert();
      return { data: [], error: null };
    }
    _doInsert() {
      if (this.table === "announcement_deliveries") {
        const p = this.payload;
        const key = `${p.announcement_id}|${p.membership_id}|${p.channel}`;
        if (state.forceInsertConflict || deliveries.has(key)) return { data: null, error: { code: "23505", message: "dup" } };
        deliveries.add(key);
        calls.deliveryInserts.push(p);
        return { data: [{ id: "new" }], error: null };
      }
      if (this.table === "notifications_queue") {
        calls.queueInserts.push(this.payload);
        return { data: [{ id: "newq" }], error: null };
      }
      return { data: null, error: null };
    }
  }
  return { calls, deliveries, from: (t) => new Builder(t) };
}

function announcement(overrides = {}) {
  return { id: ids.announcement, group_id: ids.group, title: "Hi", title_fr: "Salut", content: "Body", content_fr: "Corps", channels: ["in_app", "email", "sms", "whatsapp"], audience: { type: "all" }, sent_at: null, ...overrides };
}

// ── classifyChannelForRecipient (pure matrix) ───────────────────────────────

const ALL_ON = { in_app: true, email: true, sms: true, whatsapp: true, push: false };

// classifyChannelForRecipient returns an object created INSIDE the vm realm, so
// deepStrictEqual fails on the cross-realm prototype. Compare fields instead.
function expectClass(channel, enabled, phone, status, enqueue) {
  const r = producer.classifyChannelForRecipient(channel, enabled, phone);
  assert.equal(r.status, status, `${channel} status`);
  assert.equal(r.enqueue, enqueue, `${channel} enqueue`);
}

test("in_app classifies as in_app_published, never enqueued", () => {
  expectClass("in_app", ALL_ON, null, "in_app_published", false);
});

test("email enabled -> queued + enqueue; disabled -> skipped_channel_disabled", () => {
  expectClass("email", ALL_ON, null, "queued", true);
  expectClass("email", { ...ALL_ON, email: false }, null, "skipped_channel_disabled", false);
});

test("sms: African -> queued; US -> unavailable; no phone -> skipped_no_recipient; disabled -> skipped", () => {
  expectClass("sms", ALL_ON, AFRICAN_PHONE, "queued", true);
  expectClass("sms", ALL_ON, US_PHONE, "unavailable", false);
  expectClass("sms", ALL_ON, null, "skipped_no_recipient", false);
  expectClass("sms", { ...ALL_ON, sms: false }, AFRICAN_PHONE, "skipped_channel_disabled", false);
});

test("whatsapp: valid phone -> queued (US too, webhook maps 131049 later); no phone -> skipped; disabled -> skipped", () => {
  expectClass("whatsapp", ALL_ON, AFRICAN_PHONE, "queued", true);
  // US WhatsApp still enqueues — honest blocked_by_policy comes from the 131049 webhook, not a false "sent".
  expectClass("whatsapp", ALL_ON, US_PHONE, "queued", true);
  expectClass("whatsapp", ALL_ON, null, "skipped_no_recipient", false);
  expectClass("whatsapp", { ...ALL_ON, whatsapp: false }, AFRICAN_PHONE, "skipped_channel_disabled", false);
});

// ── produceAnnouncementDeliveries (integration with fake supabase) ───────────

test("produces per-recipient rows; excludes proxies (no user_id) and banned", async () => {
  const fake = createFake({ announcement: announcement(), recipients: recipients() });
  const res = await producer.produceAnnouncementDeliveries(fake, ids.announcement);
  assert.equal(res.status, "produced");
  assert.equal(res.recipientCount, 3, "proxy + banned excluded -> 3 real recipients");
  // 3 recipients x 4 channels = 12 delivery rows
  assert.equal(res.deliveryRowsCreated, 12);
  // every delivery row carries group_id (tenant scoping)
  assert.ok(fake.calls.deliveryInserts.every((d) => d.group_id === ids.group), "all delivery rows have group_id");
  // no row was created for the proxy or banned membership
  assert.ok(!fake.calls.deliveryInserts.some((d) => d.membership_id === ids.proxy || d.membership_id === ids.banned));
});

test("in-app rows are in_app_published with NO queue row; external sendable rows are queued WITH a queue row", async () => {
  const fake = createFake({ announcement: announcement(), recipients: recipients() });
  await producer.produceAnnouncementDeliveries(fake, ids.announcement);
  const inApp = fake.calls.deliveryInserts.filter((d) => d.channel === "in_app");
  assert.equal(inApp.length, 3);
  assert.ok(inApp.every((d) => d.status === "in_app_published"), "in_app -> in_app_published");
  // no in_app queue rows (in_app never goes through notifications_queue)
  assert.ok(!fake.calls.queueInserts.some((q) => q.channel === "in_app"), "no in_app queue rows");
  // queue rows exist only for enabled, sendable external channels
  assert.ok(fake.calls.queueInserts.length > 0, "external queue rows created");
  assert.ok(fake.calls.queueInserts.every((q) => ["email", "sms", "whatsapp"].includes(q.channel)));
  assert.ok(fake.calls.queueInserts.every((q) => q.status === "queued"), "queue rows are 'queued', never 'sent'");
  assert.ok(fake.calls.queueInserts.every((q) => q.data.template === "villageclaq_announcement_v2"), "uses the unchanged announcement template");
});

test("US member's SMS is unavailable (no queue row); WhatsApp still queues", async () => {
  const fake = createFake({ announcement: announcement(), recipients: recipients() });
  await producer.produceAnnouncementDeliveries(fake, ids.announcement);
  const usSms = fake.calls.deliveryInserts.find((d) => d.membership_id === ids.mUS && d.channel === "sms");
  assert.equal(usSms.status, "unavailable");
  assert.ok(!fake.calls.queueInserts.some((q) => q.membershipId === ids.mUS && q.channel === "sms"), "no SMS queue row for US member");
  const usWa = fake.calls.deliveryInserts.find((d) => d.membership_id === ids.mUS && d.channel === "whatsapp");
  assert.equal(usWa.status, "queued");
});

test("member with no phone: sms+whatsapp skipped_no_recipient, no queue rows; email still queued", async () => {
  const fake = createFake({ announcement: announcement(), recipients: recipients() });
  await producer.produceAnnouncementDeliveries(fake, ids.announcement);
  const np = fake.calls.deliveryInserts.filter((d) => d.membership_id === ids.mNoPhone);
  assert.equal(np.find((d) => d.channel === "sms").status, "skipped_no_recipient");
  assert.equal(np.find((d) => d.channel === "whatsapp").status, "skipped_no_recipient");
  assert.equal(np.find((d) => d.channel === "email").status, "queued");
  assert.ok(!fake.calls.queueInserts.some((q) => q.membershipId === ids.mNoPhone && (q.channel === "sms" || q.channel === "whatsapp")));
});

test("idempotent: a second produce run creates ZERO new rows (check-before-insert)", async () => {
  const fake = createFake({ announcement: announcement(), recipients: recipients() });
  await producer.produceAnnouncementDeliveries(fake, ids.announcement);
  const firstQueue = fake.calls.queueInserts.length;
  const res2 = await producer.produceAnnouncementDeliveries(fake, ids.announcement);
  assert.equal(res2.deliveryRowsCreated, 0, "no new delivery rows on re-run");
  assert.equal(res2.queueRowsCreated, 0, "no new queue rows on re-run");
  assert.equal(fake.calls.queueInserts.length, firstQueue, "queue inserts unchanged on re-run");
});

test("23505 unique-violation on insert is treated as duplicate (skipped), never an error", async () => {
  const fake = createFake({ announcement: announcement(), recipients: recipients(), forceInsertConflict: true });
  const res = await producer.produceAnnouncementDeliveries(fake, ids.announcement);
  assert.equal(res.status, "produced");
  assert.equal(res.deliveryRowsCreated, 0, "all inserts hit 23505 -> 0 created");
  assert.equal(res.queueRowsCreated, 0, "no queue rows when delivery row lost the race");
});

test("skips when announcement not found / no channels / no recipients", async () => {
  const missing = createFake({ announcement: null, recipients: recipients() });
  assert.equal((await producer.produceAnnouncementDeliveries(missing, ids.announcement)).reason, "announcement_not_found");
  const noChannels = createFake({ announcement: announcement({ channels: [] }), recipients: recipients() });
  assert.equal((await producer.produceAnnouncementDeliveries(noChannels, ids.announcement)).reason, "no_channels_selected");
  const noRecips = createFake({ announcement: announcement(), recipients: [] });
  assert.equal((await producer.produceAnnouncementDeliveries(noRecips, ids.announcement)).reason, "no_recipients");
});

test("roles audience filters recipients by role", async () => {
  const ann = announcement({ audience: { type: "roles", roles: ["admin"] } });
  const recips = recipients().map((r, i) => (i === 0 ? { ...r, role: "admin" } : r));
  const fake = createFake({ announcement: ann, recipients: recips });
  const res = await producer.produceAnnouncementDeliveries(fake, ids.announcement);
  assert.equal(res.recipientCount, 1, "only the admin recipient");
});
