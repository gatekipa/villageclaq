import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const M6_01 = "supabase/migrations/00126_m6_01_governance_canonical.sql";
const M6_02 = "supabase/migrations/00127_m6_02_quorum_lifecycle_canonical.sql";
const HOOKS = "src/lib/hooks/use-governance-mutations.ts";

test("Test 1: Concurrency and double-voting race defense in cast_ballot", () => {
  const sql = read(M6_01);
  assert.match(sql, /INSERT INTO election_vote_receipts/);
  assert.match(sql, /ON CONFLICT.*DO NOTHING/);
  assert.match(sql, /error', 'already_voted/);
  assert.match(sql, /message', 'Ballot already submitted/);
});

test("Test 2: Quorum denominator isolation", () => {
  const sql = read(M6_02);
  assert.match(sql, /WHERE group_id = v_group_id AND membership_status = 'active'/);
  assert.match(sql, /v_required_count := CEIL\(v_eligible_count \* \(v_threshold \/ 100\.0\)\)/);
});

test("Test 3: Assembly state machine and auto-transition to in_session", () => {
  const sql = read(M6_02);
  assert.match(sql, /v_quorum_achieved := v_present_count >= COALESCE\(v_required_quorum, 0\)/);
  assert.match(sql, /IF v_quorum_achieved AND v_assembly_status = 'called_to_order' THEN/);
  assert.match(sql, /UPDATE public\.assemblies SET status = 'in_session'/);
});

test("Test 4: Post-adjournment immutability locks", () => {
  const sql1 = read(M6_01);
  assert.match(sql1, /IF v_assembly_status = 'adjourned' THEN/);
  assert.match(sql1, /RAISE EXCEPTION 'RESOLUTION_IMMUTABLE_AFTER_ADJOURNMENT'/);

  const sql2 = read(M6_02);
  assert.match(sql2, /IF v_assembly_status = 'adjourned' THEN/);
  assert.match(sql2, /RAISE EXCEPTION 'ATTENDANCE_IMMUTABLE_AFTER_ADJOURNMENT'/);
});

test("Test 5: Sealed ballot box and reopen prevention", () => {
  const sql = read(M6_01);
  assert.match(sql, /IF OLD\.status = 'closed' AND NEW\.status <> 'closed' THEN/);
  assert.match(sql, /RAISE EXCEPTION 'ELECTION_SEALED_REOPEN_PROHIBITED'/);
  assert.match(sql, /IF v_election_status <> 'open' THEN/);
  assert.match(sql, /RAISE EXCEPTION 'ELECTION_NOT_ACCEPTING_VOTES'/);
});

test("Test 6: Resolution threshold rule math", () => {
  const sql = read(M6_02);
  assert.match(sql, /v_adopted := v_for > v_against/);
  assert.match(sql, /v_adopted := v_for >= \(\(2\.0 \/ 3\.0\) \* v_total\)/);
  assert.match(sql, /v_adopted := v_for >= \(\(3\.0 \/ 4\.0\) \* v_total\)/);
  assert.match(sql, /v_adopted := \(v_against = 0\) AND \(v_for > 0\)/);
});

test("Test 7: Tenant boundary isolation in use-governance-mutations.ts", () => {
  const ts = read(HOOKS);
  // Match check in mutations
  assert.match(ts, /if \(!groupId \|\| input\.groupId !== groupId\) \{/);
  assert.match(ts, /throw new Error\("STALE_TENANT_ABORT: active context does not match requested tenant\."\);/);
});
