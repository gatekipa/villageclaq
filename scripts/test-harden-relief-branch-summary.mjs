import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Backend Audit Batch C — harden relief_branch_summary.
// The view was an OWNER-RIGHTS (security-definer) view granted to authenticated
// + anon, bypassing RLS (Supabase advisor security ERROR). 00111 moves the
// privileged aggregate into a bounded SECURITY DEFINER function and recreates
// the view as a thin security_invoker passthrough (clears the ERROR; consumers
// unchanged). Static guardrails — no DB is touched.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const MIGRATION = "supabase/migrations/00111_harden_relief_branch_summary.sql";
const MIG = read(MIGRATION);

// Function body between the dollar-quote delimiters.
const fnStart = MIG.indexOf("AS $function$") + "AS $function$".length;
const fnEnd = MIG.lastIndexOf("$function$");
const FN_BODY = MIG.slice(fnStart, fnEnd);
// View portion (from the CREATE VIEW to end).
const VIEW_PART = MIG.slice(MIG.indexOf("CREATE VIEW public.relief_branch_summary"));

// ── Migration shape ─────────────────────────────────────────────────────────

test("00111 migration exists and defines the function + recreates the view", () => {
  assert.ok(fs.existsSync(path.join(root, MIGRATION)), "00111 present");
  assert.match(MIG, /CREATE OR REPLACE FUNCTION public\.get_relief_branch_summary\(\)/);
  assert.match(MIG, /CREATE VIEW public\.relief_branch_summary/);
});

// ── The fix: view no longer owner-rights; function holds the definer rights ──

test("view is recreated WITH (security_invoker = true) — clears the definer-view ERROR", () => {
  assert.match(VIEW_PART, /WITH \(security_invoker = true\)/, "view is security_invoker");
  assert.match(VIEW_PART, /AS SELECT \* FROM public\.get_relief_branch_summary\(\)/, "view is a thin passthrough");
});

test("the privileged aggregate function is SECURITY DEFINER with a pinned search_path", () => {
  const fnHeader = MIG.slice(MIG.indexOf("CREATE OR REPLACE FUNCTION"), fnStart);
  assert.match(fnHeader, /SECURITY DEFINER/);
  assert.match(fnHeader, /SET search_path TO 'public'/, "search_path pinned (safe)");
  assert.match(fnHeader, /STABLE/, "read-only function");
});

// ── Caller boundary + correctness preserved ─────────────────────────────────

test("function keeps the explicit caller-organisation boundary (get_user_group_ids)", () => {
  assert.match(FN_BODY, /get_user_group_ids\(\)/, "caller-aware org boundary");
  assert.match(FN_BODY, /organization_id/, "scoped by organisation");
  assert.match(FN_BODY, /rp\.shared_from_org = true/, "only org-shared relief plans");
});

test("function preserves confirmed-only money + the original aggregate columns", () => {
  assert.match(FN_BODY, /p\.status = 'confirmed'/, "collections are confirmed-only");
  assert.match(FN_BODY, /rr\.status = 'confirmed'/, "remittances are confirmed-only");
  for (const col of [
    "relief_plan_id uuid", "plan_name text", "collecting_group_id uuid",
    "branch_name text", "branch_currency text", "enrolled_count bigint",
    "full_member_count bigint", "relief_only_count bigint", "external_count bigint",
    "paid_this_month bigint", "collected_this_month numeric", "total_remitted numeric",
  ]) {
    assert.ok(MIG.includes(col), `RETURNS TABLE keeps column: ${col}`);
  }
});

// ── Grants safe ─────────────────────────────────────────────────────────────

test("grants: anon revoked; authenticated + service_role only", () => {
  assert.match(MIG, /REVOKE ALL ON FUNCTION public\.get_relief_branch_summary\(\) FROM anon;/);
  assert.match(MIG, /GRANT EXECUTE ON FUNCTION public\.get_relief_branch_summary\(\) TO authenticated, service_role;/);
  assert.match(MIG, /REVOKE ALL ON public\.relief_branch_summary FROM anon;/);
  assert.match(MIG, /GRANT SELECT ON public\.relief_branch_summary TO authenticated, service_role;/);
  assert.doesNotMatch(MIG, /GRANT (SELECT|EXECUTE|ALL)[^;]*TO[^;]*\banon\b/i, "nothing granted to anon");
});

// ── Blast radius: only the view + function + grants; no other relief changes ─

test("no unrelated relief tables or RLS policies are changed", () => {
  assert.doesNotMatch(MIG, /CREATE POLICY|DROP POLICY|ALTER POLICY/i, "no policy changes");
  assert.doesNotMatch(MIG, /ALTER TABLE/i, "no table alterations");
  // The only objects touched are the function + the relief_branch_summary view.
  assert.doesNotMatch(MIG, /DROP TABLE|TRUNCATE/i, "no destructive table ops");
});

test("migration applies no data DML at apply-time", () => {
  // The SELECT lives inside the function body (runs only when called). Outside
  // the dollar-quoted body there must be no INSERT/UPDATE/DELETE on data rows.
  const outside = MIG.slice(0, MIG.indexOf("AS $function$")) + MIG.slice(MIG.lastIndexOf("$function$"));
  assert.doesNotMatch(outside, /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i, "no top-level data DML");
});

// ── Consumers unchanged (the view name + columns are preserved) ─────────────

test("relief-rollup + reports consumers still query the (preserved) view — no route change", () => {
  const rollup = read("src/app/[locale]/(dashboard)/dashboard/enterprise/relief-rollup/page.tsx");
  const reports = read("src/app/[locale]/(dashboard)/dashboard/reports/[reportId]/page.tsx");
  assert.match(rollup, /\.from\("relief_branch_summary"\)/, "rollup still selects the view");
  assert.match(reports, /\.from\("relief_branch_summary"\)/, "reports still selects the view");
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

test("migration introduces no send / reminder / receipt path", () => {
  assert.doesNotMatch(MIG, /sendSms|sendWhatsapp|sendEmail|africastalking|notifications_queue|payment-reminder/i);
});
