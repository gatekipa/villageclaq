/**
 * ACL portability + digest supersede proofs for 00118–00123.
 * No hosted call. Does not create role ubuntu.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  F3_FORWARD_FILES,
  FROZEN_DIGESTS,
  SUPERSEDED_FROZEN_DIGESTS,
} from "./lib/f3-db-push-pins.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const MIG = path.join(root, "supabase/migrations");
const GENERATOR = path.join(root, "scripts/generate-f3-forward-migrations.py");

const UNCONDITIONAL_COMBO =
  /REVOKE ALL ON FUNCTION[\s\S]{0,240}FROM PUBLIC, anon, authenticated, service_role, ubuntu/;
const STANDARD_REVOKE =
  /EXECUTE 'REVOKE ALL ON FUNCTION [^']+ FROM PUBLIC, anon, authenticated, service_role'/;
const OPTIONAL_UBUNTU =
  /IF EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'ubuntu'\) THEN\s+EXECUTE 'REVOKE ALL ON FUNCTION [^']+ FROM ubuntu';/;

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function aclBlock(sql) {
  const start = sql.indexOf("DO $f3_owner_acl$");
  const end = sql.indexOf("$f3_owner_acl$;", start);
  assert.ok(start >= 0 && end > start, "missing $f3_owner_acl$");
  return sql.slice(start, end + "$f3_owner_acl$;".length);
}

test("founder-authorized digests supersede the pre-portability pins", () => {
  for (const file of F3_FORWARD_FILES) {
    const onDisk = sha256(fs.readFileSync(path.join(MIG, file)));
    assert.equal(onDisk, FROZEN_DIGESTS[file], file);
    assert.notEqual(FROZEN_DIGESTS[file], SUPERSEDED_FROZEN_DIGESTS[file], file);
  }
});

test("exactly 24 ubuntu REVOKEs are optional; no ubuntu role is created", () => {
  let optional = 0;
  let standard = 0;
  for (const file of F3_FORWARD_FILES) {
    const sql = fs.readFileSync(path.join(MIG, file), "utf8");
    assert.doesNotMatch(sql, /CREATE ROLE ubuntu/i);
    assert.doesNotMatch(sql, UNCONDITIONAL_COMBO);
    const std = [...sql.matchAll(new RegExp(STANDARD_REVOKE.source, "g"))];
    const opt = [...sql.matchAll(new RegExp(OPTIONAL_UBUNTU.source, "g"))];
    assert.equal(std.length, 4, `${file} standard revokes`);
    assert.equal(opt.length, 4, `${file} optional ubuntu revokes`);
    standard += std.length;
    optional += opt.length;
    const block = aclBlock(sql);
    assert.match(block, /to_regprocedure\('public\.post_financial_command\(jsonb\)'\) IS NOT NULL/);
    assert.match(block, /GRANT EXECUTE ON FUNCTION public\.post_financial_command\(jsonb\) TO authenticated/);
  }
  assert.equal(standard, 24);
  assert.equal(optional, 24);
});

test("semantic diff is only optional-ubuntu handling inside \$f3_owner_acl\$", () => {
  const first = aclBlock(fs.readFileSync(path.join(MIG, F3_FORWARD_FILES[0]), "utf8"));
  for (const file of F3_FORWARD_FILES) {
    const sql = fs.readFileSync(path.join(MIG, file), "utf8");
    assert.equal(aclBlock(sql), first, `${file} ACL block drifted from 00118`);
    const outside = sql.replace(first, "DO $f3_owner_acl$\n-- PORTABLE_ACL\n$f3_owner_acl$;");
    assert.doesNotMatch(outside, /FROM ubuntu/);
    assert.doesNotMatch(outside, /rolname = 'ubuntu'/);
  }
  const generator = fs.readFileSync(GENERATOR, "utf8");
  assert.match(generator, /IF EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'ubuntu'\) THEN/);
  assert.doesNotMatch(generator, /service_role, ubuntu/);
  assert.doesNotMatch(generator, /CREATE ROLE ubuntu/i);
});

test("optional-role REVOKE is a no-op when absent and revokes when present", async (t) => {
  let createDisposableDatabase;
  let psql;
  try {
    ({ createDisposableDatabase, psql } = await import("./fixtures/disposable-postgres.mjs"));
  } catch (err) {
    t.skip(`disposable module unavailable: ${err.message}`);
    return;
  }
  let db;
  try {
    db = createDisposableDatabase("acl");
  } catch (err) {
    t.skip(`local PostgreSQL 17 unavailable: ${err.message}`);
    return;
  }
  try {
    psql(
      db.url,
      `
      CREATE FUNCTION public.acl_port_probe() RETURNS void LANGUAGE sql AS $b$ SELECT $b$;
      DO $absent$
      BEGIN
        EXECUTE 'REVOKE ALL ON FUNCTION public.acl_port_probe() FROM PUBLIC';
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acl_port_missing_role') THEN
          EXECUTE 'REVOKE ALL ON FUNCTION public.acl_port_probe() FROM acl_port_missing_role';
        END IF;
      END
      $absent$;
      `,
    );
    psql(db.url, `CREATE ROLE acl_port_probe_role NOLOGIN`);
    psql(db.url, `GRANT EXECUTE ON FUNCTION public.acl_port_probe() TO acl_port_probe_role`);
    assert.equal(
      psql(db.url, `SELECT has_function_privilege('acl_port_probe_role','public.acl_port_probe()','EXECUTE')`),
      "t",
    );
    psql(
      db.url,
      `
      DO $present$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acl_port_probe_role') THEN
          EXECUTE 'REVOKE ALL ON FUNCTION public.acl_port_probe() FROM acl_port_probe_role';
        END IF;
      END
      $present$;
      `,
    );
    assert.equal(
      psql(db.url, `SELECT has_function_privilege('acl_port_probe_role','public.acl_port_probe()','EXECUTE')`),
      "f",
    );
    const mig = fs.readFileSync(path.join(MIG, F3_FORWARD_FILES[2]), "utf8");
    assert.match(mig, /IF EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'ubuntu'\) THEN/);
    assert.doesNotMatch(mig, /CREATE ROLE ubuntu/i);
  } finally {
    db.close();
  }
});
