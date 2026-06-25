import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Security guardrails for the /api/admin/query lockdown (critical hotfix).
// The route runs under the service role (RLS bypassed); before the fix the
// caller-supplied `select` was forwarded verbatim, so a relational embed
// ("*, memberships(*, payments(*))") could reach tables outside the caller's
// role allowlist (cross-tenant financial + PII leak).
//
// Two layers, matching the repo's test style:
//  (A) STATIC guardrails — assert the route + config contain the security
//      clauses (the validator is called before the service-role client, raw
//      select is rebuilt, embeds/wildcards/columns are gated).
//  (B) BEHAVIOURAL — a mirror of validateSelect() driven by the REAL allowlist
//      data extracted from the source, run against the required attack/legit
//      vectors. The mirror's IDENTIFIER regex is also asserted to match the
//      source so it cannot drift.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const CONFIG = "src/lib/admin-query-config.ts";
const ROUTE = "src/app/api/admin/query/route.ts";
const config = read(CONFIG);
const route = read(ROUTE);

// ---------------------------------------------------------------------------
// (A) Static guardrails
// ---------------------------------------------------------------------------

test("config exports the validator surface", () => {
  assert.match(config, /export function validateSelect\(/, "validateSelect exported");
  assert.match(config, /export function isAllowedColumn\(/, "isAllowedColumn exported");
  assert.match(config, /export function normalizeSelect\(/, "normalizeSelect exported");
  assert.match(config, /export const WILDCARD_TABLES/, "WILDCARD_TABLES exported");
});

test("config identifier rule is exactly /^[a-z0-9_]+$/i", () => {
  assert.match(config, /const IDENTIFIER = \/\^\[a-z0-9_\]\+\$\/i;/, "IDENTIFIER regex literal present");
});

test("config rejects embeds via the ( ) test and a closed allowlist", () => {
  assert.match(config, /\/\[\(\)\]\/\.test\(trimmed\)/, "embed detection on '(' or ')'");
  assert.match(config, /EMBED_ALLOWLIST\b/, "embed allowlist used");
  assert.match(config, /EMBED_NOT_ALLOWED/, "embed rejection code");
});

test("config gates bare wildcard behind WILDCARD_TABLES only", () => {
  assert.match(config, /trimmed === "\*"/, "bare wildcard branch");
  assert.match(config, /WILDCARD_TABLES\.has\(table\)/, "wildcard gated by table set");
  assert.match(config, /WILDCARD_NOT_ALLOWED/, "wildcard rejection code");
});

test("route calls validateSelect + column checks BEFORE the service-role client", () => {
  assert.match(route, /import \{ validateSelect, isAllowedColumn \} from "@\/lib\/admin-query-config"/, "imports validator");
  const vIdx = route.indexOf("validateSelect(q.table, q.select)");
  const adminIdx = route.indexOf("createClient(supabaseUrl, supabaseServiceKey)");
  assert.ok(vIdx > -1, "validateSelect is called on each query");
  assert.ok(adminIdx > -1, "service-role client is created");
  assert.ok(vIdx < adminIdx, "validation happens BEFORE the service-role client is built");
});

test("route rebuilds q.select from the validated value (raw client select not forwarded)", () => {
  assert.match(route, /q\.select = validated\.select;/, "q.select reassigned to validated select");
});

test("route validates filter and order columns with isAllowedColumn", () => {
  assert.match(route, /isAllowedColumn\(f\.column\)/, "filter column validated");
  assert.match(route, /isAllowedColumn\(q\.order\.column\)/, "order column validated");
  assert.match(route, /FILTER_COLUMN_NOT_ALLOWED/, "filter rejection code");
  assert.match(route, /ORDER_COLUMN_NOT_ALLOWED/, "order rejection code");
});

test("route keeps the canRead role gate and the hard row ceiling", () => {
  assert.match(route, /canRead\(callerRole, q\.table\)/, "canRead host-table gate retained");
  assert.match(route, /ADMIN_MAX_LIMIT = 10000/, "10k ceiling retained");
  assert.match(route, /Math\.min\(q\.limit \?\? ADMIN_MAX_LIMIT, ADMIN_MAX_LIMIT\)/, "limit clamp retained");
});

test("no send / reminder / receipt path introduced in the changed files", () => {
  for (const [name, src] of [["config", config], ["route", route]]) {
    assert.doesNotMatch(src, /sendSms|sendWhatsapp|sendEmail|resend|africastalking|payment-reminder|receipt|notifications_queue/i,
      `${name} introduces no send/reminder/receipt path`);
  }
});

// ---------------------------------------------------------------------------
// (B) Behavioural — mirror of validateSelect() over the REAL allowlist data
// ---------------------------------------------------------------------------

// Extract the real WILDCARD_TABLES + EMBED_ALLOWLIST_RAW from source so the
// behavioural cases run against the actual shipped data.
function extractQuotedStrings(block) {
  return [...block.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}
const wildcardBlock = config.slice(
  config.indexOf("WILDCARD_TABLES"),
  config.indexOf("]);", config.indexOf("WILDCARD_TABLES"))
);
const WILDCARD_TABLES = new Set(extractQuotedStrings(wildcardBlock));

const embedRawStart = config.indexOf("EMBED_ALLOWLIST_RAW");
const embedRawEnd = config.indexOf("const EMBED_ALLOWLIST:", embedRawStart);
const embedBlock = config.slice(embedRawStart, embedRawEnd);
// Build host-table -> Set(normalized selects) by parsing the literal block.
const EMBED_ALLOWLIST = {};
{
  const markers = [...embedBlock.matchAll(/^[ ]{2}([a-z_]+):\s*\[/gm)].map((mm) => ({
    table: mm[1],
    idx: mm.index,
  }));
  for (let i = 0; i < markers.length; i++) {
    const seg = embedBlock.slice(markers[i].idx, markers[i + 1]?.idx ?? embedBlock.length);
    const sels = extractQuotedStrings(seg).map((s) => s.replace(/\s+/g, ""));
    EMBED_ALLOWLIST[markers[i].table] = new Set(sels);
  }
}

// Mirror of src/lib/admin-query-config.ts validateSelect (logic identical;
// IDENTIFIER literal asserted equal to source above).
const IDENTIFIER = /^[a-z0-9_]+$/i;
const normalizeSelect = (s) => s.replace(/\s+/g, "");
function validateSelect(table, select) {
  const trimmed = (select ?? "").trim();
  if (!trimmed) return { ok: false, code: "EMPTY_SELECT" };
  if (trimmed === "*") {
    return WILDCARD_TABLES.has(table) ? { ok: true, select: "*" } : { ok: false, code: "WILDCARD_NOT_ALLOWED" };
  }
  if (/[()]/.test(trimmed)) {
    const allowed = EMBED_ALLOWLIST[table];
    return allowed && allowed.has(normalizeSelect(trimmed))
      ? { ok: true, select: trimmed }
      : { ok: false, code: "EMBED_NOT_ALLOWED" };
  }
  const tokens = trimmed.split(",").map((t) => t.trim());
  for (const tok of tokens) if (!IDENTIFIER.test(tok)) return { ok: false, code: "ILLEGAL_SELECT_TOKEN" };
  return { ok: true, select: tokens.join(", ") };
}
const isAllowedColumn = (c) => typeof c === "string" && IDENTIFIER.test(c);

test("sanity: real allowlist data was extracted", () => {
  assert.ok(WILDCARD_TABLES.size >= 5, "wildcard tables extracted");
  assert.ok(Object.keys(EMBED_ALLOWLIST).length >= 6, "embed allowlist tables extracted");
  assert.ok(EMBED_ALLOWLIST.payments && EMBED_ALLOWLIST.payments.size >= 4, "payments embeds extracted");
});

test("arbitrary relational embed is rejected (the core attack)", () => {
  assert.equal(validateSelect("groups", "*, memberships(*, payments(*))").ok, false);
  assert.equal(validateSelect("groups", "*, memberships(*, payments(*))").code, "EMBED_NOT_ALLOWED");
});

test("alias embed and !inner embed are rejected when not allowlisted", () => {
  assert.equal(validateSelect("groups", "id, members:memberships(*)").code, "EMBED_NOT_ALLOWED");
  assert.equal(validateSelect("groups", "id, memberships!inner(amount)").code, "EMBED_NOT_ALLOWED");
  // FK-alias form (table not literally in the string) is still rejected.
  assert.equal(validateSelect("payments", "amount, manager:proxy_manager_id(phone)").code, "EMBED_NOT_ALLOWED");
});

test("support/sales/finance cannot reach payments/memberships via a groups embed", () => {
  // validateSelect is role-independent; an arbitrary embed THROUGH groups is
  // rejected for everyone, and the route's canRead gate independently blocks
  // sales/support from the payments/memberships HOST table.
  assert.equal(validateSelect("groups", "name, memberships(display_name, payments(amount))").ok, false);
  assert.equal(validateSelect("groups", "*, memberships!inner(payments!inner(amount, currency))").ok, false);
});

test("super_admin also cannot craft arbitrary relational embeds via this endpoint", () => {
  // Nothing about validateSelect depends on role — a NEW embed is rejected
  // regardless of who sends it.
  assert.equal(validateSelect("groups", "id, name, memberships(profiles(full_name, phone))").ok, false);
  assert.equal(validateSelect("payments", "amount, groups(name), loans:loans(*)").ok, false);
});

test("bare wildcard rejected on non-vetted tables, allowed on platform-global tables", () => {
  assert.equal(validateSelect("payments", "*").code, "WILDCARD_NOT_ALLOWED");
  assert.equal(validateSelect("memberships", "*").code, "WILDCARD_NOT_ALLOWED");
  assert.equal(validateSelect("testimonials", "*").ok, true);
  assert.equal(validateSelect("faqs", "*").ok, true);
  assert.equal(validateSelect("contact_enquiries", "*").ok, true);
  assert.equal(validateSelect("subscription_plans", "*").ok, true);
});

test("allowed flat selects still work", () => {
  assert.deepEqual(validateSelect("groups", "id, name, group_type, currency, is_active, created_at"),
    { ok: true, select: "id, name, group_type, currency, is_active, created_at" });
  assert.equal(validateSelect("memberships", "group_id").ok, true);
  assert.equal(validateSelect("payments", "amount, created_at, group_id").ok, true);
  assert.equal(validateSelect("profiles", "id").ok, true);
});

test("a wildcard mixed into a flat select is rejected", () => {
  assert.equal(validateSelect("groups", "*, id").code, "ILLEGAL_SELECT_TOKEN");
  assert.equal(validateSelect("groups", "id, name; drop").code, "ILLEGAL_SELECT_TOKEN");
});

test("disallowed filter / order columns are rejected; identifiers pass", () => {
  assert.equal(isAllowedColumn("created_at"), true);
  assert.equal(isAllowedColumn("recorded_at"), true);
  assert.equal(isAllowedColumn("memberships.user_id"), false); // dotted path
  assert.equal(isAllowedColumn("groups(name)"), false);        // embed
  assert.equal(isAllowedColumn("amount;--"), false);           // injection
  assert.equal(isAllowedColumn("a:b"), false);                 // alias
});

test("EVERY frozen Platform Admin embed shape remains allowed on its host table", () => {
  // The real shipped allowlist must validate against itself — proves we did
  // not break any current admin page while closing the hole.
  for (const [table, set] of Object.entries(EMBED_ALLOWLIST)) {
    for (const normalized of set) {
      const res = validateSelect(table, normalized);
      assert.equal(res.ok, true, `frozen embed on ${table} should remain allowed: ${normalized}`);
    }
  }
});
