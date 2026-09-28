import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const layout = fs.readFileSync(
  new URL("../src/app/[locale]/(dashboard)/layout.tsx", import.meta.url),
  "utf8",
);
const onboarding = fs.readFileSync(
  new URL("../src/app/[locale]/(dashboard)/dashboard/onboarding/group/page.tsx", import.meta.url),
  "utf8",
);

test("zero-membership invitation check cannot cancel itself on checking-state updates", () => {
  assert.match(layout, /const invitationCheckKeyRef = useRef<string \| null>\(null\)/);
  assert.match(layout, /const userId = user\?\.id/);
  assert.match(layout, /const checkKey = `\$\{userId\}:\$\{pathname\}`/);
  assert.match(layout, /if \(invitationCheckKeyRef\.current === checkKey\) return/);
  const effectTail = layout.match(/\/\/ CRITICAL: router removed from deps[\s\S]*?\}, \[([^\]]+)\]\);/)?.[1] ?? "";
  assert.doesNotMatch(effectTail, /checkingInvitations|checkedInvitations/);
});

test("a cancelled zero-membership check releases its key for a same-route retry", () => {
  assert.match(
    layout,
    /if \(invitationCheckKeyRef\.current === checkKey\) \{\s*invitationCheckKeyRef\.current = null;\s*\}/,
  );
  assert.match(
    layout,
    /\[loading, memberships\.length, isOnboardingPage, isInviteSafePage, user\?\.id, pathname\]/,
  );

  const keyRef = { current: null };
  const start = (userId, pathname) => {
    const checkKey = `${userId}:${pathname}`;
    if (keyRef.current === checkKey) return false;
    keyRef.current = checkKey;
    return () => {
      if (keyRef.current === checkKey) keyRef.current = null;
    };
  };

  const cancelFirst = start("fictional-user", "/en/dashboard");
  assert.equal(typeof cancelFirst, "function");
  cancelFirst();
  assert.equal(typeof start("fictional-user", "/en/dashboard"), "function");
});

test("completed group setup reloads a route-authoritative group after forced refresh", () => {
  const refreshAt = onboarding.indexOf("await refresh(true)");
  const navigationAt = onboarding.indexOf("window.location.assign");
  assert.ok(refreshAt >= 0 && navigationAt > refreshAt);
  assert.match(
    onboarding.slice(refreshAt, navigationAt + 180),
    /window\.location\.assign\(`\/\$\{locale\}\/dashboard\?group=\$\{encodeURIComponent\(group\.id\)\}`\)/,
  );
});
