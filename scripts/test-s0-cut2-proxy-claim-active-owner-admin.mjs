import assert from "node:assert/strict";
import test from "node:test";
import { read } from "./_cut2_test_helpers.mjs";

test("proxy-claim send is ACTIVE owner/admin only; enqueue proxy_claim; DB phone", () => {
  const src = read("src/app/api/proxy-claim/send/route.ts");
  assert.match(src, /membership_status !== "active"/);
  assert.match(src, /\["owner", "admin"\]/);
  assert.match(src, /is_proxy/);
  assert.match(src, /user_id !== null/);
  assert.match(src, /enqueueOutboundNotification/);
  assert.match(src, /notificationType:\s*"proxy_claim"/);
  assert.doesNotMatch(src, /dispatchWhatsApp/);
  assert.doesNotMatch(src, /sendSmsNotification/);
  assert.match(src, /dbProxyPhone|privacy_settings/);
  for (const deny of ["moderator", "member", "pending_approval", "suspended", "exited", "archived"]) {
    assert.ok(src.includes("active") && src.includes("owner"), deny);
  }
});
