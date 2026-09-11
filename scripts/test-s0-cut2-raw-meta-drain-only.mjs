import assert from "node:assert/strict";
import test from "node:test";
import { read } from "./_cut2_test_helpers.mjs";

test("raw Meta/provider adapter call sites restricted to drain boundary", () => {
  const send = read("src/lib/send-whatsapp.ts");
  assert.match(send, /CUT2_RAW_META_CONTEXT === ["']drain["']/);
  assert.match(send, /cut2_raw_meta_drain_only/);
  const drain = read("src/app/api/cron/drain-notification-queue/route.ts");
  assert.match(drain, /CUT2_RAW_META_CONTEXT/);
  assert.match(drain, /dispatchWhatsAppWithResult/);
  const proxy = read("src/app/api/proxy-claim/send/route.ts");
  assert.doesNotMatch(proxy, /dispatchWhatsApp/);
  const waRoute = read("src/app/api/whatsapp/send/route.ts");
  assert.doesNotMatch(waRoute, /sendWhatsAppMessage/);
  const cronAnn = read("src/app/api/cron/send-scheduled-announcements/route.ts");
  assert.doesNotMatch(cronAnn, /dispatchWhatsApp\(/);
});
