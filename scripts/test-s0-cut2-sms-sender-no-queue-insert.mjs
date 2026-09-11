import assert from "node:assert/strict";
import test from "node:test";
import { read } from "./_cut2_test_helpers.mjs";

test("sms-sender and send-sms-notification do not INSERT notifications_queue", () => {
  const sender = read("src/lib/notifications/sms-sender.ts");
  const notif = read("src/lib/send-sms-notification.ts");
  assert.doesNotMatch(sender, /\.from\(["']notifications_queue["']\)/);
  assert.doesNotMatch(sender, /\.insert\(/);
  assert.doesNotMatch(notif, /\.from\(["']notifications_queue["']\)/);
  assert.doesNotMatch(notif, /\.insert\(/);
});
