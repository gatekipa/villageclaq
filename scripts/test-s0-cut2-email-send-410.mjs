import assert from "node:assert/strict";
import test from "node:test";
import { read } from "./_cut2_test_helpers.mjs";

test("POST /api/email/send is 410 GONE for every body", () => {
  const src = read("src/app/api/email/send/route.ts");
  assert.match(src, /status:\s*410/);
  assert.match(src, /export async function POST/);
  assert.match(src, /export async function GET/);
  assert.doesNotMatch(src, /sendEmail\(/);
  assert.doesNotMatch(src, /getResendClient/);
  assert.doesNotMatch(src, /resend\.emails/);
  assert.doesNotMatch(src, /notifications_queue/);
  assert.doesNotMatch(src, /enqueue_outbound_notification/);
  assert.doesNotMatch(src, /enqueueCut2ProducerChannels/);
  assert.doesNotMatch(src, /request\.json/);
});
