import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Guardrails for the invitation integrity batch:
//   - 00099: phone twin of 00029's email unique index (one active invitation
//     per (group_id, normalized phone digits); terminal rows excluded).
//   - 00100: the 00027 invitee UPDATE policy is dropped (accept/decline are
//     RPC-only — PR #14 precedent) and the invitee SELECT policy gains the
//     verified-email gate.
//   - The three admin invite pages surface 23505 (unique_violation) with the
//     invitations.duplicateInviteError i18n key.
// These are static guarantees — the repo has no live-DB SQL harness, so
// index/policy behavior is pinned by asserting the migrations encode it.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const M_PHONE_INDEX = "supabase/migrations/00099_phone_invitation_unique.sql";
const M_POLICY = "supabase/migrations/00100_invitee_update_policy_hardening.sql";
const M_EMAIL_INDEX = "supabase/migrations/00029_invitation_unique_and_deactivated_group_guard.sql";
const M_SUPERSEDED = "supabase/migrations/00092_membership_status_self_freeze.sql";

const PAGE_MY_INVITATIONS = "src/app/[locale]/(dashboard)/dashboard/my-invitations/page.tsx";
const ADMIN_INSERT_PAGES = [
  "src/app/[locale]/(dashboard)/dashboard/invitations/page.tsx",
  "src/app/[locale]/(dashboard)/dashboard/members/page.tsx",
  "src/app/[locale]/(dashboard)/dashboard/enterprise/branches/page.tsx",
];

// Drop full-line `--` comments so assertions about executable statements
// cannot be satisfied (or violated) by header/rollback prose.
function executableSql(sql) {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

test("00099 creates the phone twin of the 00029 email index (normalized digits, active statuses only)", () => {
  const sql = read(M_PHONE_INDEX);
  // Index name + expression: (group_id, regexp_replace digits).
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS invitations_group_phone_active_unique/);
  assert.match(
    sql,
    /ON public\.invitations \(group_id, \(regexp_replace\(phone, '\\D', '', 'g'\)\)\)/,
    "index must be on (group_id, normalized phone digits)",
  );
  // Partial predicate: same lifecycle semantics as the 00029 email index —
  // terminal declined/revoked/expired rows stay OUT so re-invites work.
  assert.match(
    sql,
    /WHERE status IN \('pending', 'accepted'\) AND phone IS NOT NULL/,
    "partial predicate must cover active statuses and exclude email-only rows",
  );
});

test("00099 has a non-destructive preflight and a rollback note — and NO data rewrites", () => {
  const sql = read(M_PHONE_INDEX);
  // Preflight: count duplicate (group_id, digits) pairs and abort — no
  // automatic dedupe.
  assert.match(sql, /preflight failed/);
  assert.match(sql, /RAISE EXCEPTION/);
  assert.match(sql, /HAVING count\(\*\) > 1/);
  // Preflight must run BEFORE the index DDL (measured on executable SQL so
  // header prose mentioning the DDL cannot satisfy the ordering).
  const exec = executableSql(sql);
  const preflightAt = exec.indexOf("preflight failed");
  const indexAt = exec.indexOf("CREATE UNIQUE INDEX");
  assert.ok(preflightAt > 0 && indexAt > 0, "preflight and index DDL must both exist");
  assert.ok(preflightAt < indexAt, "preflight must precede the index DDL");
  // No destructive statements anywhere in the executable SQL.
  assert.doesNotMatch(exec, /\bDELETE\s+FROM\b/i, "00099 must not delete data");
  assert.doesNotMatch(exec, /\bUPDATE\s+(public\.)?\w+\s+SET\b/i, "00099 must not rewrite rows");
  // Rollback documented.
  assert.match(sql, /ROLLBACK/);
  assert.match(sql, /DROP INDEX IF EXISTS (public\.)?invitations_group_phone_active_unique/);
});

test("00029's email index is unchanged — 00099 is a twin, not a replacement", () => {
  const sql = read(M_EMAIL_INDEX);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS invitations_group_email_active_unique/);
  assert.match(sql, /\(group_id, lower\(email\)\)/);
  assert.match(sql, /WHERE status IN \('pending', 'accepted'\)/);
});

test("00100 drops the invitee UPDATE policy and never targets the admin UPDATE policy", () => {
  const sql = read(M_POLICY);
  const exec = executableSql(sql);
  const dropTargets = [...exec.matchAll(/DROP POLICY IF EXISTS "([^"]+)" ON public\.invitations/g)]
    .map((m) => m[1])
    .sort();
  assert.deepEqual(
    dropTargets,
    ["Invitees can update their invitations", "Invitees can view their invitations"],
    "executable DROPs must target exactly the two 00027 invitee policies",
  );
  assert.ok(
    !dropTargets.includes("Group admins can update invitations"),
    "the admin UPDATE policy must never be a DROP target",
  );
  // The admin policy stays the revoke path; stamped-row SELECT stays too.
  assert.doesNotMatch(exec, /"Users can view their stamped invitations"/);
  assert.doesNotMatch(exec, /"Invitees can view their phone invitations"/);
});

test("00100 recreates the invitee SELECT policy behind the verified-email gate — and ships NO invitee UPDATE policy", () => {
  const sql = read(M_POLICY);
  const exec = executableSql(sql);
  const creates = [...exec.matchAll(/CREATE POLICY "([^"]+)"[\s\S]*?;/g)];
  assert.equal(creates.length, 1, "exactly one executable CREATE POLICY (the SELECT recreate)");
  assert.equal(creates[0][1], "Invitees can view their invitations");
  assert.match(creates[0][0], /FOR SELECT/);
  assert.doesNotMatch(creates[0][0], /FOR UPDATE/);
  // Verified-email gate via the SECURITY DEFINER helper. Supabase JWTs
  // carry NO usable top-level email_verified claim — gating on
  // auth.jwt()->>'email_verified' would be NULL -> false for EVERY session
  // and silently hide all email invitations from legitimate invitees. The
  // authoritative source is auth.users.email_confirmed_at, read through
  // caller_email_is_verified() (get_my_phone_digits precedent, 00095).
  assert.match(creates[0][0], /email = \(auth\.jwt\(\)->>'email'\)/);
  assert.match(
    creates[0][0],
    /public\.caller_email_is_verified\(\)/,
    "SELECT policy must gate on caller_email_is_verified(), not a JWT claim",
  );
  assert.doesNotMatch(
    creates[0][0],
    /email_verified/,
    "the policy must not reference the nonexistent email_verified JWT claim",
  );
  // The helper itself: SECURITY DEFINER, reads email_confirmed_at, granted
  // to authenticated.
  assert.match(exec, /CREATE OR REPLACE FUNCTION public\.caller_email_is_verified\(\)/);
  assert.match(exec, /email_confirmed_at IS NOT NULL/);
  assert.match(exec, /GRANT EXECUTE ON FUNCTION public\.caller_email_is_verified\(\) TO authenticated/);
  // The DROP of the stale policy must precede its recreate.
  const dropAt = exec.indexOf('DROP POLICY IF EXISTS "Invitees can view their invitations"');
  const createAt = exec.indexOf('CREATE POLICY "Invitees can view their invitations"');
  assert.ok(dropAt > 0 && createAt > 0 && dropAt < createAt, "DROP must precede CREATE for the SELECT policy");
  // Rollback quotes the 00027 originals verbatim (comment-only prose: the
  // re-CREATE of the UPDATE policy exists ONLY behind `--`).
  assert.match(sql, /ROLLBACK/);
  assert.match(sql, /--\s+CREATE POLICY "Invitees can update their invitations"/);
  assert.match(sql, /--\s+WITH CHECK \(/);
});

test("my-invitations is RPC-only: decline/accept via RPCs, no direct invitations writes", () => {
  const source = read(PAGE_MY_INVITATIONS);
  assert.ok(source.includes('rpc("decline_invitation"'), "decline must go through decline_invitation()");
  assert.ok(source.includes('rpc("accept_invitation"'), "accept must go through accept_invitation()");
  // The invitee page must never PATCH or INSERT invitation rows directly —
  // 00100 removes the policy that would have allowed it, and PR #14's phone
  // invitees never had one.
  for (const match of source.matchAll(/\.from\("invitations"\)([\s\S]{0,300})/g)) {
    assert.ok(
      !match[1].includes(".update(") && !match[1].includes(".insert("),
      "my-invitations must not direct-write the invitations table",
    );
  }
});

test("each admin insert site maps 23505 to invitations.duplicateInviteError", () => {
  for (const rel of ADMIN_INSERT_PAGES) {
    const source = read(rel);
    assert.ok(source.includes('.code === "23505"'), `${rel} must branch on the 23505 unique_violation code`);
    assert.ok(source.includes('"duplicateInviteError"') || source.includes("duplicateInviteError"), `${rel} must reference the duplicateInviteError key`);
  }
  // The invitations page uses the un-namespaced hook; the other two pull a
  // dedicated invitations-namespace hook so all three resolve the SAME key.
  assert.ok(read(ADMIN_INSERT_PAGES[0]).includes('t("invitations.duplicateInviteError")'));
  for (const rel of ADMIN_INSERT_PAGES.slice(1)) {
    const source = read(rel);
    assert.ok(source.includes('useTranslations("invitations")'), `${rel} must scope a hook to the invitations namespace`);
    assert.ok(source.includes('tInv("duplicateInviteError")'), `${rel} must surface tInv("duplicateInviteError")`);
  }
});

test("the duplicateInviteError key exists in BOTH locale files (rule 1: no dangling t() keys)", () => {
  for (const rel of ["messages/en.json", "messages/fr.json"]) {
    const messages = JSON.parse(read(rel));
    const value = messages?.invitations?.duplicateInviteError;
    assert.equal(typeof value, "string", `${rel} must define invitations.duplicateInviteError`);
    assert.ok(value.length > 0, `${rel} invitations.duplicateInviteError must be non-empty`);
  }
});

test("00092 remains untouched: SUPERSEDED banner and fail-fast RAISE before any DDL", () => {
  const superseded = read(M_SUPERSEDED);
  assert.match(superseded, /SUPERSEDED \(2026-06-13\) — DO NOT APPLY THIS MIGRATION/);
  const guardAt = superseded.indexOf("RAISE EXCEPTION");
  const ddlAt = superseded.indexOf("CREATE OR REPLACE FUNCTION");
  assert.ok(guardAt > 0 && ddlAt > 0, "guard and historical DDL must both exist");
  assert.ok(guardAt < ddlAt, "the fail-fast RAISE must precede all executable DDL");
});
