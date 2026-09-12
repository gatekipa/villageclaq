import assert from "node:assert/strict";
import test from "node:test";
import { psql, read } from "./_cut2_test_helpers.mjs";

test("NULL provenance untouched; drain selects only provenance=1", () => {
  const drain = read("src/app/api/cron/drain-notification-queue/route.ts");
  assert.match(drain, /\.eq\(["']cut2_provenance_version["'],\s*1\)/);
  assert.match(drain, /cut2_db_not_ready/);
  assert.match(drain, /processed:\s*0/);
  const trg = psql("SELECT tgname FROM pg_trigger WHERE tgname='trg_cut2_protect_queue_immutables';");
  assert.match(trg, /trg_cut2_protect_queue_immutables/);
});
