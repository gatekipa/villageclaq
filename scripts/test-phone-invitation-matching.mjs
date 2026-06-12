import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const helperPath = new URL("../src/lib/phone-digits.ts", import.meta.url);
const migrationPath = new URL("../supabase/migrations/00095_phone_invitation_matching.sql", import.meta.url);
const pagePath = new URL("../src/app/[locale]/(dashboard)/dashboard/my-invitations/page.tsx", import.meta.url);
const layoutPath = new URL("../src/app/[locale]/(dashboard)/layout.tsx", import.meta.url);
const rootCallbackPath = new URL("../src/app/auth/callback/route.ts", import.meta.url);
const localeCallbackPath = new URL("../src/app/[locale]/(auth)/callback/route.ts", import.meta.url);
const require = createRequire(import.meta.url);

function loadHelper() {
  const source = fs.readFileSync(helperPath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const cjsModule = { exports: {} };
  vm.runInNewContext(compiled, { exports: cjsModule.exports, module: cjsModule, require }, { filename: helperPath.pathname });
  return cjsModule.exports;
}

// ── Behavioral: the digits matching rule ────────────────────────────────

test("phoneDigits normalizes to digits-only and rejects empties", () => {
  const { phoneDigits } = loadHelper();
  assert.equal(phoneDigits("+1 (240) 555-0123"), "12405550123");
  assert.equal(phoneDigits("237 6 77 12 34 56"), "237677123456");
  assert.equal(phoneDigits(""), null);
  assert.equal(phoneDigits(null), null);
  assert.equal(phoneDigits(undefined), null);
  assert.equal(phoneDigits("---"), null);
});

test("phoneDigitsMatch is exact-digits equality — never suffix matching", () => {
  const { phoneDigitsMatch } = loadHelper();
  // Same number, different formatting → match.
  assert.equal(phoneDigitsMatch("+12405550123", "1 (240) 555-0123"), true);
  // Different numbers → no match.
  assert.equal(phoneDigitsMatch("+12405550123", "+12405550124"), false);
  // Suffix overlap (local vs E.164) is a deliberate non-match: false
  // negatives only, never false positives.
  assert.equal(phoneDigitsMatch("0677123456", "+237677123456"), false);
  // Empties never match anything (no NULL = NULL trap).
  assert.equal(phoneDigitsMatch("", ""), false);
  assert.equal(phoneDigitsMatch(null, null), false);
  assert.equal(phoneDigitsMatch("+12405550123", null), false);
});

// ── Migration 00095: visibility + acceptance gates ──────────────────────

test("migration restores phone visibility through a SECURITY DEFINER helper, never auth.users in a policy", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  // The helper reads auth.users + profiles under SECURITY DEFINER (the
  // 00015 lesson: policies cannot subquery auth.users directly).
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_my_phone_digits\(\)/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SELECT u\.phone FROM auth\.users u WHERE u\.id = auth\.uid\(\)/);
  assert.match(sql, /SELECT p\.phone FROM public\.profiles p WHERE p\.id = auth\.uid\(\)/);
  // The SELECT policy routes through the helper and never touches auth.users.
  const policy = sql.slice(
    sql.indexOf('CREATE POLICY "Invitees can view their phone invitations"'),
    sql.indexOf("-- Remove any earlier-iteration phone UPDATE policy"),
  );
  assert.doesNotMatch(policy, /auth\.users/);
  assert.match(policy, /public\.get_my_phone_digits\(\)/);
  assert.match(sql, /"Invitees can view their phone invitations"\s+ON public\.invitations FOR SELECT/);
  // There is deliberately NO invitee phone UPDATE policy (the repoint
  // vector): the migration only DROPs it, decline is RPC-only.
  assert.doesNotMatch(sql, /CREATE POLICY "Invitees can update their phone invitations"/);
  assert.match(sql, /DROP POLICY IF EXISTS "Invitees can update their phone invitations"/);
});

test("the shared identity gate admits verified email OR member-role phone, with the empty-string guard", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  const fn = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.caller_matches_invitation"),
    sql.indexOf("CREATE OR REPLACE FUNCTION public.accept_invitation"),
  );
  // Email leg: verified JWT email, NULLIF closes the email='' trap.
  assert.match(fn, /NULLIF\(p_email, ''\) IS NOT NULL/);
  assert.match(fn, /lower\(p_email\) = lower\(NULLIF\(auth\.jwt\(\) ->> 'email', ''\)\)/);
  // Phone leg: email-NULL, exact normalized digits, member-role only.
  assert.match(fn, /NULLIF\(p_email, ''\) IS NULL/);
  assert.match(fn, /NULLIF\(regexp_replace\(p_phone, '\\D', '', 'g'\), ''\) = public\.get_my_phone_digits\(\)/);
  assert.match(fn, /COALESCE\(p_role, 'member'\) = 'member'/);
});

test("accept_invitation uses the shared gate and keeps everything load-bearing byte-for-byte", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  const fn = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.accept_invitation"),
    sql.indexOf("CREATE OR REPLACE FUNCTION public.decline_invitation"),
  );
  // Gate goes through the shared helper; error code unchanged (no i18n churn).
  assert.match(fn, /IF NOT public\.caller_matches_invitation\(\s*v_invitation\.email, v_invitation\.phone, v_invitation\.role::text\s*\) THEN/);
  assert.match(fn, /'error', 'email_mismatch'/);
  // The invitation SELECT now includes phone.
  assert.match(fn, /SELECT id, group_id, email, phone, role, status, expires_at, claim_membership_id/);
  // Load-bearing logic retained:
  assert.match(fn, /'error', 'invitation_not_pending'/);
  assert.match(fn, /'error', 'invitation_expired'/);
  assert.match(fn, /'error', 'use_claim_rpc'/);
  assert.match(fn, /'error', 'group_full'/);
  assert.match(fn, /'membership_id', v_existing_id, 'already_member', true/);
  assert.match(fn, /SET status = 'accepted', accepted_at = now\(\), user_id = v_user_id/);
  assert.match(fn, /'ok', true, 'membership_id', v_membership_id, 'group_id', v_invitation\.group_id/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.accept_invitation\(uuid, text\) TO authenticated/);
  assert.match(sql, /NOTIFY pgrst, 'reload schema'/);
});

test("decline and count RPCs are present, gated, and never mutate target fields", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  // decline: SECURITY DEFINER, shared gate, pending-only, flips status +
  // stamps user_id and NOTHING else (no group_id/role mutation).
  const decline = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.decline_invitation"),
    sql.indexOf("CREATE OR REPLACE FUNCTION public.count_my_pending_invitations"),
  );
  assert.match(decline, /SECURITY DEFINER/);
  assert.match(decline, /public\.caller_matches_invitation\(/);
  assert.match(decline, /'error', 'invitation_not_pending'/);
  assert.match(decline, /SET status = 'declined', user_id = v_user_id/);
  assert.doesNotMatch(decline, /group_id =/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.decline_invitation\(uuid\) TO authenticated/);
  // count: invitee-scoped (user_id OR shared gate), never the inviter or
  // group-member RLS legs.
  const count = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.count_my_pending_invitations"));
  assert.match(count, /i\.status = 'pending'/);
  assert.match(count, /i\.user_id = auth\.uid\(\)/);
  assert.match(count, /public\.caller_matches_invitation\(i\.email, i\.phone, i\.role::text\)/);
  assert.doesNotMatch(count, /invited_by/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.count_my_pending_invitations\(\) TO authenticated/);
});

// ── Page: visibility query + post-filter + welcome chain ────────────────

test("my-invitations matches phone invitees and post-filters the broad phone leg", () => {
  const page = fs.readFileSync(pagePath, "utf8");
  // The email bail is gone — phone-only users proceed.
  assert.doesNotMatch(page, /if \(!authUser\?\.email\) return \[\];/);
  // Caller phone resolution: auth phone first, profiles.phone fallback.
  assert.match(page, /phoneDigits\(authUser\.phone\)/);
  assert.match(page, /\.from\("profiles"\)/);
  // The phone or-leg plus the MANDATORY client-side digits post-filter
  // (group members can see all group invitations through the admin policy).
  assert.match(page, /and\(email\.is\.null,phone\.not\.is\.null\)/);
  assert.match(page, /phoneDigitsMatch\(row\.phone as string \| null, callerDigits\)/);
  // Email and user_id matching preserved.
  assert.match(page, /user_id\.eq\.\$\{authUser\.id\}/);
  assert.match(page, /email\.eq\.\$\{authUser\.email\}/);
  // The welcome producer chain is untouched and decline goes through the RPC.
  assert.match(page, /requestWelcomeWhatsApp\(supabase, welcomeMembershipId, locale\)/);
  assert.match(page, /accept_invitation/);
  assert.match(page, /claim_proxy_membership/);
  assert.match(page, /\.rpc\("decline_invitation", \{/);
  // The raw decline UPDATE is gone (it required the dropped UPDATE policy).
  assert.doesNotMatch(page, /\.update\(\{ status: "declined"/);
});

test("routing counters use the invitee-scoped count RPC and both callbacks stay identical", () => {
  const layout = fs.readFileSync(layoutPath, "utf8");
  const rootCallback = fs.readFileSync(rootCallbackPath, "utf8");
  const localeCallback = fs.readFileSync(localeCallbackPath, "utf8");

  for (const [name, src] of [["layout", layout], ["root callback", rootCallback], ["locale callback", localeCallback]]) {
    assert.match(src, /\.rpc\(\s*"count_my_pending_invitations"\s*\)/, `${name} must count via the RPC`);
  }

  // Rule 10: the two auth callbacks carry byte-identical counting logic.
  const extract = (src) => {
    const start = src.indexOf("let inviteCount = 0;");
    return src.slice(start, src.indexOf("getPostAuthRedirect", start)).replace(/\s+/g, " ").trim();
  };
  assert.equal(extract(rootCallback), extract(localeCallback), "both auth callbacks must count invitations identically");
});
