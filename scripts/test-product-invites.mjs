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

test("admin: success is gated on the semantic invitation notice result", () => {
  assert.match(admin, /if \(emailSent\) \{\s*setSendSuccess\(true\)/);
  assert.match(admin, /setSendWarning\(t\("invitations\.savedEmailFailed"\)\)/);
  assert.match(admin, /enqueueInvitationNotice\(result\.invitation_id\)/);
});

test("admin: single-invite validates email with the bulk-path regex and uses a real CTA label", () => {
  assert.match(admin, /const EMAIL_PATTERN = \/\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\.\[\^\\s@\]\+\$\//);
  assert.match(admin, /if \(!EMAIL_PATTERN\.test\(trimmedEmail\)\) \{\s*setSendError\(t\("invitations\.invalidEmail"\)\);/);
  assert.match(admin, /t\("members\.sendInvite"\)/, "CTA uses the proper Send Invitation label");
  assert.doesNotMatch(admin, /t\("common\.submit"\)/, "generic Submit label removed");
});

test("admin: mutation failures show translated copy, never raw errors", () => {
  assert.doesNotMatch(admin, /setSendError\(error\.message\)/);
  assert.match(admin, /setSendError\(t\("invitations\.sendFailed"\)\)/);
  assert.match(admin, /rpcError\.code === "23505"/);
  assert.match(admin, /t\("invitations\.duplicateInviteError"\)/);
  assert.doesNotMatch(admin, /message=\{\(invError \|\| codesError\)\?\.message\}/);
});

test("admin: invitation list masks recipient contacts", () => {
  assert.match(admin, /function maskEmail\(email: string\): string/);
  assert.match(admin, /function maskPhone\(phone: string\): string/);
  assert.match(admin, /maskEmail\(invite\.email as string\)/);
  assert.match(admin, /maskPhone\(invite\.phone as string\)/);
  assert.doesNotMatch(admin, /\{\(invite\.email as string\) \|\|\s*\(invite\.phone as string\)/);
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

test("admin: only inviters can see the no-code Generate action", () => {
  assert.match(admin, /\{canInvite && !activeCode && \(/);
  assert.match(admin, /t\("invitations\.noJoinCode"\)/);
  assert.match(admin, /t\("invitations\.createJoinCode"\)/);
});

test("admin: invite-by-email row stacks on mobile", () => {
  assert.match(admin, /<div className="flex flex-col gap-2 sm:flex-row">/);
  assert.match(admin, /className="w-full sm:w-32"/, "role select full-width on mobile");
});

test("admin: invitation notice errors are logged and produce false", () => {
  assert.doesNotMatch(admin, /catch \{\s*\}/);
  assert.match(admin, /console\.warn\("\[Invitations\] invitation enqueue failed:"/);
  assert.match(admin, /return false;/);
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

test("invitee: welcome dispatch failures are visible in diagnostics", () => {
  assert.doesNotMatch(invitee, /catch \{\s*\}/);
  assert.doesNotMatch(invitee, /\.catch\(\(\) => \{\}\)/);
  assert.match(invitee, /console\.warn\("\[MyInvitations\] welcome notification dispatch failed:"/);
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
