import assert from "node:assert/strict";
import test from "node:test";
import { read } from "./_cut2_test_helpers.mjs";

test("POST /api/whatsapp/send all branches 410", () => {
  const src = read("src/app/api/whatsapp/send/route.ts");
  assert.match(src, /status:\s*410/);
  assert.match(src, /export async function POST/);
  assert.doesNotMatch(src, /dispatchWhatsApp/);
  assert.doesNotMatch(src, /sendWhatsAppMessage/);
  assert.doesNotMatch(src, /sendWhatsAppText/);
  assert.doesNotMatch(src, /queueWhatsAppMessage/);
});
