import assert from "node:assert/strict";
import test from "node:test";
import { psql } from "./_cut2_test_helpers.mjs";

test("duplicate lookup only provenance=1 + channel + template + idempotencyKey", () => {
  const body = psql("SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='enqueue_outbound_notification';");
  assert.match(body, /cut2_provenance_version = 1/);
  assert.match(body, /idempotencyKey/);
  assert.match(body, /trusted_idempotency_conflict_mismatch/);
  assert.match(body, /result := 'duplicate'/);
});
