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
