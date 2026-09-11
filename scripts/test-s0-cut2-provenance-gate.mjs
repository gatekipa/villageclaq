import assert from "node:assert/strict";
import test from "node:test";
import { psql } from "./_cut2_test_helpers.mjs";

test("only cut2_provenance_version=1 is trusted; RPC hardcodes 1; clients cannot mint it", () => {
  const col = psql("SELECT column_default IS NULL FROM information_schema.columns WHERE table_name='notifications_queue' AND column_name='cut2_provenance_version';");
  assert.match(col, /t/);
  const args = psql("SELECT pg_get_function_identity_arguments(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='enqueue_outbound_notification';");
  assert.doesNotMatch(args, /provenance/);
  const body = psql("SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='enqueue_outbound_notification';");
  assert.match(body, /cut2_provenance_version/);
  assert.match(body, /1/);
  const ins = psql("SELECT has_table_privilege('anon','public.notifications_queue','INSERT')::text || ',' || has_table_privilege('authenticated','public.notifications_queue','INSERT')::text || ',' || has_table_privilege('service_role','public.notifications_queue','INSERT')::text;");
  const norm = ins.replace(/\s/g, "").replace(/false/g, "f").replace(/true/g, "t");
  assert.equal(norm, "f,f,f");
});
