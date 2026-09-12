/**
 * Bounded current-main regression after F3 forward apply.
 * Disposable only. No production URL, send, queue insert, or storage mutation.
 *
 * Floor: stub current-main objects + live Cut 2 HGP/enqueue/queue pins
 * + real 00117 + NEW 00118–00123. Greenfield 00001–00116 replay remains
 * a documented historical-apply gap (00030 unnest / 00061 param rename).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import {
  LIVE_ENQ_DEF_MD5,
  LIVE_ENQ_SRC_MD5,
  LIVE_HGP_DEF_MD5,
  LIVE_HGP_SRC_MD5,
  LIVE_QUEUE_COL_ACL,
  LIVE_QUEUE_TABLE_ACL,
  readQueueColumnAcl,
  readQueueTableAcl,
} from "./_m2_apply_disposable_floor.mjs";
import { createDisposablePostgres } from "./fixtures/disposable-postgres.mjs";
import { F3_FORWARD_CHAIN, installF3RegressionFloor } from "./fixtures/f3-forward-prerequisites.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const MAIN_PIN = "d83d13d4fe9915a0d1ff149ce29a53ad708c9853";
const db = createDisposablePostgres({ name: "f3-regression", label: "f3-regression" });

before(async () => {
  await db.start();
  installF3RegressionFloor(db.url, { through: "00123_f3_05_opening_cash_command.sql" });
});
after(() => db.stop());

test("00001-00117 bytes are unchanged vs main pin", () => {
  const diff = spawnSync(
    "git",
    ["diff", "--name-only", MAIN_PIN, "--", "supabase/migrations"],
    { encoding: "utf8", cwd: root },
  );
  assert.equal(diff.status, 0, diff.stderr);
  const touched = (diff.stdout || "")
    .split("\n")
    .map((f) => path.basename(f.trim()))
    .filter((f) => /^(000\d{2}|0010\d|0011[0-7])_/.test(f) || /^2026090[6-9]|^20260910/.test(f));
  assert.deepEqual(touched, []);
});

test("F3 batch is exactly 00118-00123; no timestamp F3 history", () => {
  const files = fs.readdirSync(path.join(root, "supabase/migrations"));
  const extras = files.filter((f) => /^0011[89]|^001[2-9]/.test(f));
  assert.deepEqual(extras.sort(), [...F3_FORWARD_CHAIN].sort());
  assert.deepEqual(files.filter((f) => /^2026090[6-9]|^20260910/.test(f)), []);
});

test("F3 SQL does not replace HGP, transfer RPCs, standing, enqueue, or Cut 3 storage", () => {
  for (const name of F3_FORWARD_CHAIN) {
    const src = fs.readFileSync(path.join(root, "supabase/migrations", name), "utf8");
    const ddl = src.replace(/--[^\n]*/g, "");
    assert.doesNotMatch(src, /CREATE OR REPLACE FUNCTION public\.has_group_permission/);
    assert.doesNotMatch(src, /CREATE OR REPLACE FUNCTION public\.(request_member_transfer|execute_member_transfer)/);
    assert.doesNotMatch(src, /CREATE OR REPLACE FUNCTION public\.compute_member_standing/);
    assert.doesNotMatch(ddl, /enqueue_outbound_notification/);
    assert.doesNotMatch(ddl, /notifications_queue/);
    assert.doesNotMatch(src, /storage_receipts_authorized|storage_path_group_id/);
    assert.doesNotMatch(ddl, /notification_polic(y|ies)/);
  }
});

test("has_group_permission live pin unchanged after 00117+00118-00123", () => {
  const row = db.sql(`
    SELECT pg_get_function_identity_arguments(p.oid) || '|' ||
           md5(pg_get_functiondef(p.oid)) || '|' ||
           md5(p.prosrc) || '|' ||
           pg_get_userbyid(p.proowner) || '|' ||
           p.prosecdef::text
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='has_group_permission'
  `);
  assert.equal(
    row,
    `gid uuid, perm_key text, uid uuid|${LIVE_HGP_DEF_MD5}|${LIVE_HGP_SRC_MD5}|postgres|true`,
  );
  assert.equal(
    db.sql(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='has_group_permission'`),
    "1",
  );
});

test("enqueue_outbound_notification live pin unchanged", () => {
  const row = db.sql(`
    SELECT md5(pg_get_functiondef(p.oid)) || '|' || md5(p.prosrc)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='enqueue_outbound_notification'
  `);
  assert.equal(row, `${LIVE_ENQ_DEF_MD5}|${LIVE_ENQ_SRC_MD5}`);
});

test("Cut 2 notifications_queue ACL unchanged (table + column)", () => {
  assert.deepEqual(readQueueTableAcl(db.url), LIVE_QUEUE_TABLE_ACL);
  assert.deepEqual(readQueueColumnAcl(db.url), LIVE_QUEUE_COL_ACL);
});

test("M2 policy tables exist, dormant, zero rows", () => {
  assert.equal(db.sql(`SELECT to_regclass('public.notification_policies') IS NOT NULL`), "t");
  assert.equal(db.sql(`SELECT to_regclass('public.notification_policy_triggers') IS NOT NULL`), "t");
  assert.equal(db.sql(`SELECT to_regclass('public.notification_policy_occurrences') IS NOT NULL`), "t");
  assert.equal(db.sql(`SELECT count(*) FROM public.notification_policies`), "0");
  assert.equal(db.sql(`SELECT count(*) FROM public.notification_policy_triggers`), "0");
  assert.equal(db.sql(`SELECT count(*) FROM public.notification_policy_occurrences`), "0");
  const def = db.sql(`
    SELECT column_default FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notification_policies' AND column_name='enabled'
  `);
  assert.match(def, /false/);
});

test("current-main contribution/payment/application/relief/transfer tables survive", () => {
  for (const rel of [
    "payments",
    "contribution_obligations",
    "payment_obligation_applications",
    "member_transfers",
    "relief_plans",
    "relief_enrollments",
    "relief_claims",
    "events",
    "notifications_queue",
  ]) {
    assert.equal(db.sql(`SELECT to_regclass('public.${rel}') IS NOT NULL`), "t", rel);
  }
});

test("S0-008 transfer stubs and standing stub are not replaced", () => {
  assert.match(
    db.sql(`SELECT request_member_transfer('{}'::jsonb)::text`),
    /s0-008-00082-untouched/,
  );
  assert.match(
    db.sql(`SELECT execute_member_transfer('{}'::jsonb)::text`),
    /s0-008-00082-untouched/,
  );
  assert.equal(db.sql(`SELECT compute_member_standing('00000000-0000-4000-8000-000000000001')`), "good");
});

test("F3 public command RPCs are authenticated-only", () => {
  for (const fn of [
    "public.post_financial_command(jsonb)",
    "public.correct_financial_event(jsonb)",
    "public.post_financial_opening_cash(jsonb)",
  ]) {
    assert.equal(db.sql(`SELECT has_function_privilege('authenticated','${fn}','EXECUTE')`), "t");
    assert.equal(db.sql(`SELECT has_function_privilege('anon','${fn}','EXECUTE')`), "f");
    assert.equal(db.sql(`SELECT has_function_privilege('service_role','${fn}','EXECUTE')`), "f");
  }
});

test("raw posted truth is not writable by authenticated", () => {
  for (const table of ["financial_events", "financial_postings"]) {
    assert.equal(db.sql(`SELECT has_table_privilege('authenticated','public.${table}','INSERT')`), "f");
    assert.equal(db.sql(`SELECT has_table_privilege('authenticated','public.${table}','UPDATE')`), "f");
    assert.equal(db.sql(`SELECT has_table_privilege('authenticated','public.${table}','DELETE')`), "f");
  }
});

test("no F3 function inserts notifications_queue", () => {
  const hits = db.sql(`
    SELECT coalesce(string_agg(n.nspname||'.'||p.proname, ','), '')
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.prosrc ILIKE '%notifications_queue%'
      AND (
        n.nspname IN ('financial_core','financial_private')
        OR p.proname IN (
          'post_financial_command','correct_financial_event',
          'post_financial_opening_cash','guard_ledger_epoch'
        )
      )
  `);
  assert.equal(hits, "");
});

test("Cut 3 storage helpers remain absent on this slice (F3 did not create them)", () => {
  assert.equal(db.sql(`SELECT to_regproc('public.storage_path_group_id') IS NULL`), "t");
  assert.equal(db.sql(`SELECT to_regproc('public.storage_receipts_authorized') IS NULL`), "t");
});
