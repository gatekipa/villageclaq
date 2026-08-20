import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Phase 0B — storage bucket + policy static guardrails. No DB is touched.
//
// Live posture (verified 2026-08-20, docs/storage-bucket-audit-2026-08-20.md):
//   receipts        private, signed-URL access only
//   group-documents private, group-authorized, signed-URL access only
//   avatars         public (UI renders getPublicUrl output directly)
// These tests pin the CODE to that contract so a regression (a getPublicUrl
// call on a private bucket, a migration flipping a bucket public, a policy
// opening reads to anon) fails CI before it ships.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(root, rel));

/** Recursively collect source files under a dir. */
function walk(rel, exts, out = []) {
  const abs = path.join(root, rel);
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const child = path.join(rel, entry.name);
    if (entry.isDirectory()) walk(child, exts, out);
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(child);
  }
  return out;
}

const SRC_FILES = walk("src", [".ts", ".tsx"]);
const MIGRATIONS = walk("supabase/migrations", [".sql"]);

// ── Buckets are documented ──────────────────────────────────────────────────

test("storage audit doc exists and covers all three buckets", () => {
  const DOC = "docs/storage-bucket-audit-2026-08-20.md";
  assert.ok(exists(DOC), `${DOC} present`);
  const doc = read(DOC);
  for (const bucket of ["receipts", "group-documents", "avatars"]) {
    assert.ok(doc.includes(`\`${bucket}\``), `${bucket} documented`);
  }
});

// ── Upload paths reference the correct bucket ───────────────────────────────

test("receipt upload paths use the receipts bucket", () => {
  for (const rel of [
    "src/components/payments/pay-now-dialog.tsx",
    "src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx",
    "src/app/[locale]/(dashboard)/dashboard/my-fines/page.tsx",
  ]) {
    const srcText = read(rel);
    assert.match(srcText, /\.from\("receipts"\)[\s\S]{0,200}?\.upload\(/, `${rel} uploads to receipts`);
  }
});

test("avatar upload paths use the avatars bucket", () => {
  for (const rel of [
    "src/app/[locale]/(dashboard)/dashboard/my-profile/page.tsx",
    "src/app/[locale]/(dashboard)/dashboard/onboarding/member/page.tsx",
    "src/app/[locale]/(dashboard)/dashboard/onboarding/group/page.tsx",
  ]) {
    const srcText = read(rel);
    assert.match(srcText, /\.from\("avatars"\)[\s\S]{0,200}?\.upload\(/, `${rel} uploads to avatars`);
  }
});

test("group document upload paths use the group-documents bucket", () => {
  for (const rel of [
    "src/app/[locale]/(dashboard)/dashboard/documents/page.tsx",
    "src/app/[locale]/(dashboard)/dashboard/minutes/page.tsx",
    "src/app/[locale]/(dashboard)/dashboard/constitution/page.tsx",
    "src/app/[locale]/(dashboard)/dashboard/relief/my/page.tsx",
  ]) {
    const srcText = read(rel);
    assert.match(srcText, /\.from\("group-documents"\)[\s\S]{0,300}?\.upload\(/, `${rel} uploads to group-documents`);
  }
});

// ── Private buckets never use getPublicUrl ──────────────────────────────────

test("no src file calls getPublicUrl on receipts or group-documents", () => {
  for (const rel of SRC_FILES) {
    const srcText = read(rel);
    for (const bucket of ["receipts", "group-documents"]) {
      // A .from("<bucket>") chain that reaches getPublicUrl within the same
      // expression is a private-bucket leak.
      const re = new RegExp(`\\.from\\(["']${bucket}["']\\)[\\s\\S]{0,300}?getPublicUrl`, "m");
      assert.ok(!re.test(srcText), `${rel} must not getPublicUrl on ${bucket}`);
    }
  }
});

test("private-bucket display paths go through signed URLs", () => {
  const helper = read("src/lib/storage-urls.ts");
  assert.match(helper, /createSignedUrl/, "storage-urls helper signs URLs");
  assert.match(helper, /"receipts" \| "group-documents"/, "helper is typed to the two private buckets");
});

// ── Migrations keep the private posture ─────────────────────────────────────

test("no migration marks receipts or group-documents public", () => {
  for (const rel of MIGRATIONS) {
    const sql = read(rel);
    for (const bucket of ["receipts", "group-documents"]) {
      const insertRe = new RegExp(
        `INSERT INTO storage\\.buckets[^;]*'${bucket}'[^;]*;`,
        "gi",
      );
      for (const stmt of sql.match(insertRe) || []) {
        assert.ok(!/true\s*\)/.test(stmt), `${rel}: ${bucket} bucket insert must be public=false`);
      }
      const updateRe = new RegExp(
        `UPDATE storage\\.buckets\\s+SET\\s+public\\s*=\\s*true[^;]*'${bucket}'`,
        "i",
      );
      assert.ok(!updateRe.test(sql.replace(/^\s*--.*$/gm, "")), `${rel}: no live SQL flips ${bucket} public`);
    }
  }
});

test("00112 SELECT-policy hardening drops the open read policies and scopes reads to authenticated group members", () => {
  const MIG = "supabase/migrations/00112_storage_select_policy_hardening.sql";
  assert.ok(exists(MIG), "00112 present");
  const sql = read(MIG);
  assert.match(sql, /DROP POLICY IF EXISTS "Anyone can view receipts"/);
  assert.match(sql, /DROP POLICY IF EXISTS "Anyone can view group documents"/);
  assert.match(sql, /CREATE POLICY "receipts_select_group" ON storage\.objects FOR SELECT TO authenticated/);
  assert.match(sql, /CREATE POLICY "gdocs_select_group" ON storage\.objects FOR SELECT TO authenticated/);
  assert.match(sql, /is_group_member\(storage_path_group_id_v2\(name\)\)/, "reads are group-membership-scoped");
  // Avatars stays public-read by design — 00112 must not drop it.
  assert.ok(!sql.includes(`"Anyone can view avatars"`) || !/DROP POLICY[^;]*"Anyone can view avatars"/.test(sql),
    "00112 leaves the avatars read policy alone");
  // The new policies must never be granted to anon/public.
  for (const stmt of sql.match(/CREATE POLICY[^;]+;/g) || []) {
    assert.ok(!/TO\s+(public|anon)\b/i.test(stmt), "no storage read policy granted to public/anon");
  }
});

test("00112 is re-runnable: each CREATE POLICY is preceded by its own DROP POLICY IF EXISTS", () => {
  const sql = read("supabase/migrations/00112_storage_select_policy_hardening.sql");
  const creates = [...sql.matchAll(/CREATE POLICY "([^"]+)"/g)];
  assert.ok(creates.length >= 2, "sanity: the block creates the read policies");
  for (const match of creates) {
    const name = match[1];
    const dropIdx = sql.indexOf(`DROP POLICY IF EXISTS "${name}"`);
    assert.notEqual(dropIdx, -1, `${name} must have a DROP POLICY IF EXISTS`);
    // Ordering matters: a drop placed *after* the create still leaves the
    // second paste of this dashboard block failing on "already exists".
    assert.ok(
      dropIdx < match.index,
      `DROP POLICY IF EXISTS "${name}" must come before its CREATE POLICY`,
    );
  }
});

test("storage_path_group_id_v2 guards each uuid cast inside its own WHEN branch", () => {
  const sql = read("supabase/migrations/00112_storage_select_policy_hardening.sql");
  const fnStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.storage_path_group_id_v2");
  const fnBody = sql.slice(fnStart, sql.indexOf("$$;", fnStart));

  // An unguarded `[n]::uuid` raises 22P02 on a key like minutes/not-a-uuid/x.pdf,
  // which inside a policy predicate becomes a query error instead of a clean
  // denial. Checking that a guard and a cast both exist *somewhere* is too weak
  // — they must pair up within the same WHEN … THEN branch, so split on WHEN
  // and assert per branch.
  const branches = fnBody.split(/\bWHEN\b/).slice(1);
  const castingBranches = branches.filter((b) => b.includes("::uuid"));
  assert.equal(castingBranches.length, 2, "exactly the two path shapes cast a segment");

  const castedSegments = new Set();
  for (const branch of castingBranches) {
    const cast = branch.match(/\(storage\.foldername\(p_name\)\)\[(\d)\]::uuid/);
    assert.ok(cast, "branch casts a path segment");
    const idx = cast[1];
    castedSegments.add(idx);
    const guard = new RegExp(
      `\\(storage\\.foldername\\(p_name\\)\\)\\[${idx}\\]\\s*~\\s*'\\^\\[0-9a-fA-F\\]\\{8\\}`,
    );
    assert.match(guard.test(branch) ? branch : "", guard,
      `segment [${idx}] must be UUID-pattern guarded in the SAME branch that casts it`);
    // And the guard must precede the cast within that branch.
    assert.ok(branch.search(guard) < branch.indexOf("::uuid"), `guard precedes the cast for segment [${idx}]`);
  }
  assert.deepEqual([...castedSegments].sort(), ["1", "2"], "both the bare and prefixed path shapes are handled");
  assert.ok(!/NULLIF\([^)]*\)::uuid/.test(fnBody), "no unguarded NULLIF(...)::uuid cast remains");
});

// ── No secrets or raw PII in storage logging ────────────────────────────────

test("storage helper logs bucket + object key only — no signed URLs, tokens, or phone numbers", () => {
  const helper = read("src/lib/storage-urls.ts");
  for (const line of helper.split("\n").filter((l) => /console\.(warn|error|log)/.test(l))) {
    // "createSignedUrl" as a function NAME in a message is fine; interpolating
    // the signed URL VALUE (or any token/key material) is not.
    assert.ok(
      !/\$\{[^}]*(signedUrl|token|apikey|service_role)[^}]*\}/i.test(line),
      `no secret material logged: ${line.trim()}`,
    );
    assert.ok(!/phone/i.test(line), `no phone PII logged: ${line.trim()}`);
  }
});
