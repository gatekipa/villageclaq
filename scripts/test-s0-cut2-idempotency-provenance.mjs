import assert from "node:assert/strict";
import test from "node:test";
import { psql } from "./_cut2_test_helpers.mjs";

test("trusted unique index only matches provenance=1; legacy keys cannot poison", () => {
  const def = psql("SELECT indexdef FROM pg_indexes WHERE indexname='idx_notifications_queue_cut2_semantic_idempotency_unique';");
  assert.match(def, /cut2_provenance_version = 1/);
  assert.match(def, /idempotencyKey/);
  assert.doesNotMatch(def, /status/);
  const n = psql("SELECT count(*) FROM pg_indexes WHERE tablename='notifications_queue' AND indexdef LIKE '%whatsapp%' AND indexdef LIKE '%UNIQUE%' AND indexdef NOT LIKE '%cut2_provenance_version = 1%';");
  assert.equal(n.trim(), "0");
});
