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
  assert.match(layout, /const checkKey = `\$\{user\.id\}:\$\{pathname\}`/);
  assert.match(layout, /if \(invitationCheckKeyRef\.current === checkKey\) return/);
  const effectTail = layout.match(/\/\/ CRITICAL: router removed from deps[\s\S]*?\}, \[([^\]]+)\]\);/)?.[1] ?? "";
  assert.doesNotMatch(effectTail, /checkingInvitations|checkedInvitations/);
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
