import assert from "node:assert/strict";
import test from "node:test";
import { read, PRODUCERS } from "./_cut2_test_helpers.mjs";

test("all 15 produce* use adapter; production adapter has no queue insert", () => {
  for (const p of PRODUCERS) {
    const src = read(p);
    assert.match(src, /enqueueCut2ProducerChannels/, p);
    assert.doesNotMatch(src, /\.from\(["']notifications_queue["']\)\s*\.insert/, p);
  }
  const adapter = read("src/lib/enqueue-outbound-notification.ts");
  assert.match(adapter, /enqueue_outbound_notification/);
  assert.match(adapter, /fail_closed/);
  assert.doesNotMatch(adapter, /\.from\(["']notifications_queue["']\)\s*\.insert/);
  assert.doesNotMatch(adapter, /CUT2_ENQUEUE_MODE[\s\S]{0,200}\.insert/);
});
