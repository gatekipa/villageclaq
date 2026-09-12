import assert from "node:assert/strict";
import test from "node:test";
import { psql } from "./_cut2_test_helpers.mjs";

test("conflict without trusted canonical row → trusted_idempotency_conflict_mismatch; no mutation", () => {
  const body = psql("SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='enqueue_outbound_notification';");
  assert.match(body, /trusted_idempotency_conflict_mismatch/);
  assert.match(body, /unique_violation/);
});
