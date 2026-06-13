import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Static guardrails for the invitations UX sprint (admin + invitee pages).
// Style mirrors scripts/test-membership-status.mjs: read sources as text and
// pin clause presence/absence. i18n bundle presence is asserted ONLY for
// keys that already exist; keys requested via i18nKeysNeeded are pinned as
// t("...") references in the pages instead.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const ADMIN_PAGE = "src/app/[locale]/(dashboard)/dashboard/invitations/page.tsx";
const INVITEE_PAGE = "src/app/[locale]/(dashboard)/dashboard/my-invitations/page.tsx";

const admin = read(ADMIN_PAGE);
const invitee = read(INVITEE_PAGE);
const en = JSON.parse(read("messages/en.json"));
const fr = JSON.parse(read("messages/fr.json"));
const get = (obj, dotted) => dotted.split(".").reduce((acc, k) => acc?.[k], obj);

// ─── Admin page: single-invite feedback ─────────────────────────────────────

test("admin: green success is gated on the email actually sending", () => {
  // setSendSuccess(true) must only appear inside the if (emailSent) branch.
  assert.match(admin, /if \(emailSent\) \{\s*\/\/[^\n]*\n\s*setSendSuccess\(true\);/);
  const successCalls = [...admin.matchAll(/setSendSuccess\(true\)/g)];
  assert.equal(successCalls.length, 1, "exactly one setSendSuccess(true) call");
  // The saved-but-email-failed path renders ONE amber warning, not red+green.
  assert.match(admin, /setSendWarning\(t\("invitations\.savedEmailFailed"\)\)/);
  assert.doesNotMatch(admin, /setSendError\(t\("invitations\.emailSendFailed"\)\)/,
    "old contradictory red emailSendFailed next to green success must be gone");
  assert.match(admin, /text-amber-600 dark:text-amber-400/, "warning renders in amber");
});

test("admin: single-invite validates email with the bulk-path regex and uses a real CTA label", () => {
  assert.match(admin, /const EMAIL_PATTERN = \/\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\.\[\^\\s@\]\+\$\//);
  assert.match(admin, /if \(!EMAIL_PATTERN\.test\(trimmedEmail\)\) \{\s*setSendError\(t\("invitations\.invalidEmail"\)\);/);
  assert.match(admin, /t\("members\.sendInvite"\)/, "CTA uses the proper Send Invitation label");
  assert.doesNotMatch(admin, /t\("common\.submit"\)/, "generic Submit label removed");
});

test("admin: friendly errors only — raw error.message never reaches the UI", () => {
  assert.doesNotMatch(admin, /setSendError\(error\.message\)/);
  assert.match(admin, /console\.warn\("\[Invitations\] invitation insert failed:", error\.message\);\s*setSendError\(t\("invitations\.sendFailed"\)\)/);
  // The 23505 duplicate guard added recently must be preserved.
  assert.match(admin, /error\.code === "23505"/);
  assert.match(admin, /t\("invitations\.duplicateInviteError"\)/);
  // ErrorState no longer receives the raw message; raw goes to console.warn.
  assert.doesNotMatch(admin, /message=\{\(invError \|\| codesError\)\?\.message\}/);
  assert.match(admin, /console\.warn\("\[Invitations\] load failed:", \(invError \|\| codesError\)\?\.message\)/);
});

test("admin: invitation list masks emails and phones, never the full value", () => {
  assert.match(admin, /function maskEmail\(email: string\): string/);
  assert.match(admin, /function maskPhone\(phone: string\): string/);
  assert.match(admin, /maskEmail\(invite\.email as string\)/);
  assert.match(admin, /maskPhone\(invite\.phone as string\)/);
  assert.doesNotMatch(admin, /\{\(invite\.email as string\) \|\|\s*\(invite\.phone as string\)/,
    "unmasked contact render must be gone");
  // Rule 11: the email API failure log masks the recipient too.
  assert.doesNotMatch(admin, /"for", recipientEmail\)/);
  assert.match(admin, /maskEmail\(recipientEmail\)/);
});

test("admin: status clarity — retitled list, computed Expired badge, expiry date on pending rows", () => {
  assert.match(admin, /t\("invitations\.allInvitations"\)/, "list header retitled");
  assert.doesNotMatch(admin, /t\("invitations\.pendingInvitations"\)/, "old misleading header removed");
  assert.match(admin, /const isExpired =\s*\n?\s*status === "pending" &&\s*\n?\s*!!expiresAtRaw &&\s*\n?\s*new Date\(expiresAtRaw\)\.getTime\(\) < Date\.now\(\)/);
  assert.match(admin, /const effectiveStatus = isExpired \? "expired" : status/);
  assert.match(admin, /statusStyles\[effectiveStatus\]/, "badge style keyed by computed status");
  assert.match(admin, /invitations\.\$\{effectiveStatus\}/, "badge label keyed by computed status");
  assert.match(admin, /t\("invitations\.expiresOn"\)/, "pending rows show the expiry date");
  // Resend is hidden on computed-expired rows (revoke remains available).
  assert.match(admin, /!!\(invite\.email\) && !isExpired && \(/);
});

test("admin: revoke and regenerate are confirmed; resend gives inline feedback", () => {
  assert.match(admin, /useConfirmDialog/);
  assert.match(admin, /t\("invitations\.revokeConfirmTitle"\)/);
  // The revoke confirm names its target with the MASKED contact so the
  // admin can verify which invitation they are revoking.
  assert.match(admin, /t\("invitations\.revokeConfirmDesc", \{ contact: maskedContact \}\)/);
  assert.match(admin, /t\("invitations\.regenerateConfirmTitle"\)/);
  assert.match(admin, /t\("invitations\.regenerateConfirmDesc"\)/);
  assert.match(admin, /destructive: true/);
  // The visible Regenerate button goes through the confirming wrapper.
  assert.match(admin, /onClick=\{handleRegenerateClick\}/);
  assert.match(admin, /t\("invitations\.inviteResent"\)/, "inline resend success feedback");
  assert.match(admin, /setResendFeedback\(\{ id: inviteId, ok: emailOk \}\)/);
});

test("admin: no-join-code dead end replaced with a Generate CTA card", () => {
  assert.match(admin, /\{!activeCode && \(/);
  assert.match(admin, /t\("invitations\.noJoinCode"\)/);
  assert.match(admin, /t\("invitations\.noJoinCodeDesc"\)/);
  assert.match(admin, /t\("invitations\.createJoinCode"\)/);
});

test("admin: invite-by-email row stacks on mobile", () => {
  assert.match(admin, /<div className="flex flex-col gap-2 sm:flex-row">/);
  assert.match(admin, /className="w-full sm:w-32"/, "role select full-width on mobile");
});

test("admin: no empty catches remain in notification-adjacent code", () => {
  assert.doesNotMatch(admin, /catch \{\s*\}/);
  assert.doesNotMatch(admin, /catch \{\s*\/\/ Notification failure is non-fatal[^}]*return false;\s*\}/);
  assert.match(admin, /console\.warn\("\[Invitations\] invitation email send failed:"/);
});

// ─── Invitee page (my-invitations) ──────────────────────────────────────────

test("invitee: shows who invited and the invited role", () => {
  assert.match(invitee, /inviter:profiles!invitations_invited_by_fkey\(full_name\)/);
  assert.match(invitee, /getMemberName\(\{ profile: inviter \}\)/, "rule 5: name via getMemberName");
  assert.match(invitee, /t\("invitedBy", \{ name: inviterName \}\)/);
  assert.match(invitee, /invitedRole === "admin" \? ti\("roleAdmin"\) : ti\("roleMember"\)/);
});

test("invitee: accept/decline explainers render under the actions", () => {
  assert.match(invitee, /t\("acceptExplainer"\)/);
  assert.match(invitee, /t\("declineExplainer"\)/);
});

test("invitee: expired invitations render disabled honest state, not a live Accept", () => {
  assert.match(invitee, /const isExpired =\s*\n?\s*status === "pending" &&\s*\n?\s*!!expiresAtRaw &&\s*\n?\s*new Date\(expiresAtRaw\)\.getTime\(\) < Date\.now\(\)/);
  assert.match(invitee, /const isPending = status === "pending" && !isExpired/);
  assert.match(invitee, /const effectiveStatus: InvitationStatus = isExpired \? "expired" : status/);
  assert.match(invitee, /statusConfig\[effectiveStatus\]/);
  // Reuses the existing translated copy "ask the admin to send a new one".
  assert.match(invitee, /\{isExpired && \([\s\S]{0,200}t\("invitationExpired"\)/);
});

test("invitee: post-accept redirect preserves locale and respects remaining invitations", () => {
  assert.match(invitee, /window\.location\.href = `\/\$\{locale\}\/dashboard`/);
  assert.doesNotMatch(invitee, /window\.location\.href = "\/dashboard"/, "locale-less redirect removed");
  assert.match(invitee, /const remainingPending = invitations\.filter/);
  assert.match(invitee, /if \(remainingPending === 0\)/);
  assert.match(invitee, /setShowDashboardLink\(true\)/);
  assert.match(invitee, /t\("goToDashboard"\)/, "manual dashboard link when staying");
});

test("invitee: raw RPC/DB errors stay in the console, UI gets translated copy", () => {
  assert.doesNotMatch(invitee, /setShowError\(claimErr\.message \|\|/);
  assert.doesNotMatch(invitee, /setShowError\(rpcErr\.message \|\|/);
  assert.match(invitee, /console\.warn\("\[MyInvitations\] claim_proxy_membership failed:", claimErr\.message\)/);
  assert.match(invitee, /console\.warn\("\[MyInvitations\] accept_invitation failed:", rpcErr\.message\)/);
  assert.doesNotMatch(invitee, /message=\{\(error as Error\)\?\.message\}/);
  assert.match(invitee, /console\.warn\("\[MyInvitations\] load failed:"/);
});

test("invitee: no empty catches and no silent .catch(() => {}) in notification code", () => {
  assert.doesNotMatch(invitee, /catch \{ \/\* fail-open \*\/ \}/);
  assert.doesNotMatch(invitee, /catch \{ \/\* best-effort \*\/ \}/);
  assert.doesNotMatch(invitee, /\.catch\(\(\) => \{\}\)/);
  assert.match(invitee, /console\.warn\("\[MyInvitations\] welcome email request failed:"/);
  assert.match(invitee, /console\.warn\("\[MyInvitations\] welcome SMS request failed:"/);
});

test("invitee: accept/decline RPC paths and WhatsApp trigger are untouched", () => {
  assert.match(invitee, /supabase\.rpc\("accept_invitation", \{\s*p_invitation_id: invitationId,\s*\}\)/);
  assert.match(invitee, /supabase\.rpc\("decline_invitation", \{\s*p_invitation_id: invitationId,\s*\}\)/);
  assert.match(invitee, /supabase\.rpc\("claim_proxy_membership"/);
  assert.match(invitee, /requestWelcomeWhatsApp\(supabase, welcomeMembershipId, locale\)/);
});

// ─── i18n: only EXISTING keys are asserted in the bundles ───────────────────

test("existing i18n keys reused by this sprint are present in BOTH bundles", () => {
  const existing = [
    "members.sendInvite",
    "invitations.expired",
    "invitations.expiresOn",
    "invitations.duplicateInviteError",
    "invitations.createJoinCode",
    "invitations.regenerateCode",
    "invitations.revokeInvite",
    "invitations.resendInvite",
    "invitations.inviteSent",
    "invitations.roleMember",
    "invitations.roleAdmin",
    "myInvitations.invitationExpired",
    "common.cancel",
    "common.errorTitle",
    "common.errorDesc",
    "common.retry",
  ];
  for (const key of existing) {
    assert.ok(get(en, key) !== undefined, `en.json missing existing key ${key}`);
    assert.ok(get(fr, key) !== undefined, `fr.json missing existing key ${key}`);
  }
});

test("requested (new) i18n keys are referenced via t() in the owning page", () => {
  const adminRefs = [
    't("invitations.allInvitations")',
    't("invitations.invalidEmail")',
    't("invitations.sendFailed")',
    't("invitations.savedEmailFailed")',
    't("invitations.inviteResent")',
    't("invitations.revokeConfirmTitle")',
    't("invitations.revokeConfirmDesc"',
    't("invitations.regenerateConfirmTitle")',
    't("invitations.regenerateConfirmDesc")',
    't("invitations.noJoinCode")',
    't("invitations.noJoinCodeDesc")',
  ];
  for (const ref of adminRefs) {
    assert.ok(admin.includes(ref), `admin page must reference ${ref}`);
  }
  const inviteeRefs = [
    't("invitedBy"',
    't("acceptExplainer")',
    't("declineExplainer")',
    't("goToDashboard")',
  ];
  for (const ref of inviteeRefs) {
    assert.ok(invitee.includes(ref), `invitee page must reference ${ref}`);
  }
});
