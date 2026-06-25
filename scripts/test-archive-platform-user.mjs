import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Backend Audit Batch B — fix the broken archive_platform_user RPC.
// The 00085 definition did `UPDATE profiles SET ... email = NULL ...`, but
// public.profiles has NO `email` column, so every archive call aborted (500).
// 00110 redefines the function without the non-existent column. These are
// static guardrails (read the migration + route as text); no DB is touched.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const MIGRATION = "supabase/migrations/00110_fix_archive_platform_user_profile_fields.sql";
const ROUTE = "src/app/api/admin/users/archive/route.ts";

const MIG = read(MIGRATION);
const ROUTE_SRC = read(ROUTE);

// The LIVE public.profiles columns (source of truth, from the deployed schema).
// Notably there is NO `email` column — email lives in auth.users.
const PROFILE_COLUMNS = new Set([
  "id", "full_name", "display_name", "avatar_url", "phone", "preferred_locale",
  "preferred_theme", "timezone", "created_at", "updated_at",
  "notification_preferences", "date_of_birth",
]);

// The function body between the dollar-quote delimiters.
const bodyStart = MIG.indexOf("AS $function$") + "AS $function$".length;
const bodyEnd = MIG.lastIndexOf("$function$");
const BODY = MIG.slice(bodyStart, bodyEnd);
// Executable SQL only — strip `-- ...` line comments (a comment explaining that
// the email column is intentionally absent is correct and must not trip the
// "no email reference" check, which targets the actual statements).
const BODY_SQL = BODY.replace(/--[^\n]*/g, "");

// ── Migration shape ─────────────────────────────────────────────────────────

test("00110 migration exists and redefines archive_platform_user", () => {
  assert.ok(fs.existsSync(path.join(root, MIGRATION)), "00110 migration present");
  assert.match(MIG, /CREATE OR REPLACE FUNCTION public\.archive_platform_user\(p_user_id uuid, p_reason text\)/);
});

test("function is SECURITY DEFINER with a pinned (safe) search_path", () => {
  assert.match(MIG, /SECURITY DEFINER/);
  assert.match(MIG, /SET search_path TO 'public'/, "search_path pinned, not mutable");
});

// ── The actual fix: no reference to the non-existent profiles.email ─────────

test("function body no longer references a profiles email column", () => {
  assert.doesNotMatch(BODY_SQL, /\bemail\s*=\s*NULL\b/i, "no `email = NULL` assignment in executable SQL");
  assert.doesNotMatch(BODY_SQL, /\bemail\b/i, "no `email` reference in the executable SQL");
});

test("UPDATE profiles SET touches ONLY columns that exist on public.profiles", () => {
  const m = BODY.match(/UPDATE profiles SET([\s\S]*?)WHERE/i);
  assert.ok(m, "UPDATE profiles clause present");
  const assigned = [...m[1].matchAll(/(\w+)\s*=/g)].map((x) => x[1]);
  assert.ok(assigned.length >= 4, "anonymises several profile fields");
  for (const col of assigned) {
    assert.ok(PROFILE_COLUMNS.has(col), `assigned column "${col}" must exist on public.profiles`);
    assert.notEqual(col, "email", "must not assign the non-existent email column");
  }
  // The anonymisation set we expect (only existing columns).
  for (const col of ["full_name", "display_name", "phone", "avatar_url", "updated_at"]) {
    assert.ok(assigned.includes(col), `anonymises ${col}`);
  }
});

// ── Authorization + safety invariants preserved ─────────────────────────────

test("authorization + self/owner guards are preserved", () => {
  assert.match(BODY, /'auth_required'/);
  assert.match(BODY, /'reason_required'/);
  assert.match(BODY, /'cannot_archive_self'/);
  assert.match(BODY, /is_platform_super_admin\(v_caller\)/, "super-admin gate retained");
  assert.match(BODY, /'not_authorized'/);
  assert.match(BODY, /role = 'owner' AND membership_status = 'active'/, "active-owner guard retained");
  assert.match(BODY, /'user_owns_groups'/);
});

test("soft-delete + audit preserved; no hard delete of any rows", () => {
  assert.match(BODY, /UPDATE memberships SET membership_status = 'archived'/, "memberships archived, not deleted");
  assert.match(BODY, /INSERT INTO platform_audit_logs/, "archive is audit-logged");
  // No destructive SQL anywhere in the migration.
  assert.doesNotMatch(MIG, /\bDELETE\s+FROM\b/i, "no DELETE");
  assert.doesNotMatch(MIG, /\bDROP\s+TABLE\b/i, "no DROP TABLE");
  assert.doesNotMatch(MIG, /\bTRUNCATE\b/i, "no TRUNCATE");
});

test("financial tables are not touched by the function (history preserved)", () => {
  assert.doesNotMatch(BODY, /\bpayments\b/i, "function does not touch payments");
  assert.doesNotMatch(BODY, /\bcontribution_obligations\b/i, "function does not touch obligations");
  assert.doesNotMatch(BODY, /\bcontribution_types\b/i, "function does not touch contribution types");
});

test("migration applies no data DML at apply-time (function body runs only when called)", () => {
  // Outside the dollar-quoted body, the migration is comments + the CREATE
  // statement only — no top-level INSERT/UPDATE/DELETE on data tables.
  const outside = MIG.slice(0, MIG.indexOf("AS $function$")) + MIG.slice(MIG.lastIndexOf("$function$"));
  assert.doesNotMatch(outside, /^\s*(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\b/im, "no top-level data DML");
});

// ── Admin route unchanged-and-correct ───────────────────────────────────────

test("admin archive route still calls the RPC correctly and assumes no email field", () => {
  assert.match(ROUTE_SRC, /auth\.rpc\("archive_platform_user", \{\s*p_user_id: userId,\s*p_reason: reason,\s*\}\)/);
  assert.doesNotMatch(ROUTE_SRC, /\bemail\b/i, "route does not assume an email field");
  assert.match(ROUTE_SRC, /terminateUserSessions\(userId\)/, "still terminates archived user sessions");
});

test("admin route does not log raw PII (userId/reason)", () => {
  const logs = ROUTE_SRC.split("\n").filter((l) => /console\.(log|warn|error)/.test(l));
  for (const l of logs) {
    assert.doesNotMatch(l, /\buserId\b|\breason\b/, `no raw userId/reason in log: ${l.trim()}`);
  }
});

// ── Cross-guards (unchanged elsewhere) ──────────────────────────────────────

test("/api/admin/query embed lockdown remains intact", () => {
  const r = read("src/app/api/admin/query/route.ts");
  assert.match(r, /import \{ validateSelect, isAllowedColumn \} from "@\/lib\/admin-query-config"/);
  assert.match(r, /validateSelect\(q\.table, q\.select\)/);
});

test("P0 bulk-receipt confirmed-only guard remains intact", () => {
  assert.match(read("src/lib/payment-receipt-producer.ts"), /payment\.status !== "confirmed"/);
});

test("Build 8 announcement producer remains dormant (no live route import)", () => {
  const apiDir = path.join(root, "src/app");
  function walk(dir) {
    let hit = false;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) hit = walk(p) || hit;
      else if ((e.name.endsWith(".ts") || e.name.endsWith(".tsx")) &&
        /from "@\/lib\/announcement-producer"/.test(fs.readFileSync(p, "utf8"))) hit = true;
    }
    return hit;
  }
  assert.equal(walk(apiDir), false);
});

test("no send / reminder / receipt path in the changed files", () => {
  for (const [name, src] of [["migration", MIG], ["route", ROUTE_SRC]]) {
    assert.doesNotMatch(src, /sendSms|sendWhatsapp|sendEmail|africastalking|notifications_queue|payment-reminder/i,
      `${name} introduces no send/reminder/receipt path`);
  }
});
