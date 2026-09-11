import assert from "node:assert/strict";
import test from "node:test";
import { read } from "./_cut2_test_helpers.mjs";

test("POST /api/sms/send is 410 GONE for every body", () => {
  const src = read("src/app/api/sms/send/route.ts");
  assert.match(src, /status:\s*410/);
  assert.match(src, /export async function POST/);
  assert.doesNotMatch(src, /sendSmsNotification/);
  assert.doesNotMatch(src, /notifications_queue/);
  assert.doesNotMatch(src, /enqueue_outbound_notification/);
});
