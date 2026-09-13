/**
 * Executable F3 00118–00123 SQL pre-commit rollback + retry proofs.
 * Disposable PostgreSQL 17 only. No production URL. No notifications.
 *
 * SCOPE: failure BEFORE the migration's sole final COMMIT (security-tail
 * inject inside the same transaction). This suite is NOT CLI-equivalent
 * and is NOT the post-commit / pre-external-history proof. Production
 * S0/M2 apply records generated timestamp versions after SQL commit
 * (Management API file-stream). See
 * scripts/test-financial-f3-external-ledger.mjs for that runner.
 *
 * Apply path: psql -f used by applyForwardMigration, plus a disposable
 * schema_migrations table that records source labels 00118…00123 only
 * after a successful file apply. Injected copies INSERT the label inside
 * the transaction before RAISE EXCEPTION, then prove rollback.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createDisposableDatabase, psql, psqlFile } from "./fixtures/disposable-postgres.mjs";
import {
  F3_FORWARD_CHAIN,
  STUB_CORE_SQL,
  applyForwardMigrationWithLedger,
  applyForwardMigrationsWithLedger,
  ensureMigrationLedger,
  installLiveHasGroupPermission,
  migrationLedgerVersion,
  readMigrationLedger,
} from "./fixtures/f3-forward-prerequisites.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const MIGRATIONS = path.join(root, "supabase/migrations");

const INJECT_SITES = {
  hgp_post: "$f3_hgp_post$;",
  owner_pin: "$f3_owner_pin$;",
  grant_revoke: "$f3_owner_acl$;",
  role_check: "SET ROLE postgres;",
};

const TARGET_ABSENT_SQL = {
  "00118_f3_bounded_financial_epoch_foundation.sql": [
    "to_regnamespace('financial_private')",
    "to_regclass('public.financial_ledger_epochs')",
  ],
  "00119_f3_01_core_ledger_foundation.sql": [
    "to_regnamespace('financial_core')",
    "to_regclass('public.financial_accounts')",
    "to_regclass('public.financial_events')",
    "to_regclass('public.financial_postings')",
    "to_regtype('public.financial_event_class')",
  ],
  "00120_f3_02_secure_posting_idempotency.sql": [
    "to_regprocedure('public.post_financial_command(jsonb)')",
  ],
  "00121_f3_03_projection_read_proof.sql": [
    "to_regprocedure('public.get_financial_projection_bundle(uuid,timestamptz,timestamptz,timestamptz)')",
    "to_regprocedure('public.get_financial_cashbook(uuid,timestamptz,timestamptz,uuid,text,integer,integer)')",
  ],
  "00122_f3_04_correction_reversal.sql": [
    "to_regprocedure('public.correct_financial_event(jsonb)')",
  ],
  "00123_f3_05_opening_cash_command.sql": [
    "to_regprocedure('public.post_financial_opening_cash(jsonb)')",
  ],
};

const FINGERPRINT_SQL = `
SELECT jsonb_build_object(
  'schema', (
    SELECT coalesce(string_agg(nspname || ':' || pg_get_userbyid(nspowner), ',' ORDER BY nspname), '')
    FROM pg_namespace WHERE nspname IN ('financial_core','financial_private')
  ),
  'function_owner', (
    SELECT coalesce(string_agg(
      n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' ||
      pg_get_userbyid(p.proowner) || ':' || p.prosecdef::text || ':' || coalesce(p.proconfig::text, ''),
      ',' ORDER BY 1), '')
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public','financial_core','financial_private')
      AND (n.nspname LIKE 'financial_%' OR p.proname ~ 'financial|f3_|guard_ledger')
  ),
  'acl', (
    SELECT coalesce(string_agg(part, ',' ORDER BY part), '') FROM (
      SELECT n.nspname || '.' || c.relname || ':' || coalesce(c.relacl::text, '') AS part
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND (n.nspname IN ('financial_core','financial_private')
             OR (n.nspname = 'public' AND c.relname LIKE 'financial_%'))
      UNION ALL
      SELECT n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' ||
             coalesce(p.proacl::text, '')
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('public','financial_core','financial_private')
        AND (n.nspname LIKE 'financial_%' OR p.proname ~ 'financial|f3_|guard_ledger')
    ) a
  ),
  'policy', (
    SELECT coalesce(string_agg(
      schemaname || '.' || tablename || '.' || policyname || ':' || cmd || ':' ||
      coalesce(roles::text, '') || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''),
      ',' ORDER BY 1), '')
    FROM pg_policies
    WHERE schemaname IN ('public','financial_core','financial_private')
      AND (tablename LIKE 'financial_%' OR schemaname LIKE 'financial_%')
  ),
  'ledger', (
    SELECT coalesce(string_agg(version || ':' || name, ',' ORDER BY version), '')
    FROM supabase_migrations.schema_migrations
  )
)::text
`;

function readMigration(name) {
  return fs.readFileSync(path.join(MIGRATIONS, name), "utf8");
}

function topLevelBeginCommit(sql) {
  const tag = /\$([A-Za-z_][A-Za-z_0-9]*)?\$/g;
  let inDollar = null;
  const begins = [];
  const commits = [];
  sql.split("\n").forEach((raw, i) => {
    const tags = [...raw.matchAll(tag)].map((m) => m[0]);
    if (inDollar) {
      if (tags.includes(inDollar)) inDollar = null;
      return;
    }
    if (tags.length) {
      const opened = tags[0];
      if (!tags.slice(1).includes(opened)) {
        inDollar = opened;
        return;
      }
    }
    const s = raw.trim();
    if (s === "BEGIN;") begins.push(i + 1);
    if (s === "COMMIT;") commits.push(i + 1);
  });
  return { begins, commits };
}

function injectFailure(src, site, name) {
  const marker = INJECT_SITES[site];
  if (!marker) throw new Error(`unknown inject site ${site}`);
  const idx = src.indexOf(marker);
  if (idx < 0) throw new Error(`${name} missing marker for ${site}`);
  if (src.indexOf(marker, idx + marker.length) !== -1) {
    throw new Error(`${name} marker for ${site} is not unique`);
  }
  const version = migrationLedgerVersion(name);
  const stem = name.replace(/\.sql$/, "");
  const insert = `
INSERT INTO supabase_migrations.schema_migrations(version, name)
VALUES ('${version}', '${stem}');
DO $f3_atomicity_inject$
BEGIN
  RAISE EXCEPTION 'F3_ATOMICITY_INJECT:${site}';
END
$f3_atomicity_inject$;
`;
  return src.slice(0, idx + marker.length) + insert + src.slice(idx + marker.length);
}

function applyInjected(url, name, site) {
  const injected = injectFailure(readMigration(name), site, name);
  const tmp = path.join("/tmp", `f3_inject_${name.slice(0, 5)}_${site}_${process.pid}.sql`);
  fs.writeFileSync(tmp, injected);
  try {
    psqlFile(url, tmp);
    throw new Error("expected injected migration to fail");
  } catch (err) {
    const msg = String(err.message || err);
    if (/expected injected/.test(msg)) throw err;
    return msg;
  } finally {
    fs.unlinkSync(tmp);
  }
}

function fingerprint(url) {
  const json = psql(url, FINGERPRINT_SQL);
  return {
    json,
    md5: createHash("md5").update(json).digest("hex"),
    parsed: JSON.parse(json),
  };
}

function f3Inventory(url) {
  return JSON.parse(psql(
    url,
    `SELECT jsonb_build_object(
      'schemas', (SELECT count(*) FROM pg_namespace WHERE nspname IN ('financial_core','financial_private')),
      'relations', (
        SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r','i','S','t','v')
          AND (n.nspname IN ('financial_core','financial_private')
               OR (n.nspname = 'public' AND c.relname LIKE 'financial_%'))
      ),
      'functions', (
        SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('financial_core','financial_private')
           OR (n.nspname = 'public' AND p.proname ~ 'financial|f3_|guard_ledger')
      ),
      'policies', (
        SELECT count(*) FROM pg_policy po
        JOIN pg_class c ON c.oid = po.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('financial_core','financial_private')
           OR (n.nspname = 'public' AND c.relname LIKE 'financial_%')
      ),
      'types', (
        SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname LIKE 'financial_%'
      ),
      'grants_on_missing', 0
    )`,
  ));
}

function sessionIdentity(url) {
  return psql(url, "SELECT current_user || ':' || session_user || ':' || current_setting('role');");
}

function assertTargetsAbsent(url, name) {
  for (const expr of TARGET_ABSENT_SQL[name]) {
    assert.equal(psql(url, `SELECT ${expr} IS NULL`), "t", `${name} leftover ${expr}`);
  }
}

function assertTargetsPresent(url, name) {
  for (const expr of TARGET_ABSENT_SQL[name]) {
    assert.equal(psql(url, `SELECT ${expr} IS NULL`), "f", `${name} missing ${expr} after clean apply`);
  }
}

function assertSuccessfulSecurity(url) {
  assert.match(sessionIdentity(url), /^ubuntu:ubuntu:(ubuntu|none)$/);
  const drift = psql(
    url,
    `SELECT coalesce(string_agg(n.nspname||'.'||p.proname||':'||pg_get_userbyid(p.proowner), ',' ORDER BY 1), '')
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.prosecdef
       AND n.nspname IN ('public','financial_core','financial_private')
       AND p.proname NOT IN ('has_group_permission','enqueue_outbound_notification')
       AND (pg_get_userbyid(p.proowner) IS DISTINCT FROM 'postgres'
            OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[])`,
  );
  assert.equal(drift, "");
  const rlsOff = psql(
    url,
    `SELECT coalesce(string_agg(n.nspname||'.'||c.relname, ','), '')
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r'
       AND n.nspname IN ('public','financial_private','financial_core')
       AND c.relname LIKE 'financial_%'
       AND NOT c.relrowsecurity`,
  );
  assert.equal(rlsOff, "");
  const hgp = psql(
    url,
    `SELECT count(*) || ':' || md5(pg_get_functiondef(p.oid)) || ':' || md5(p.prosrc)
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_group_permission'
     GROUP BY p.oid`,
  );
  assert.equal(hgp, "1:695368464e97297fbf0f90ce7345162f:96a296dfd541c7fc75ec68c4da1d92ff");
  for (const fn of [
    ["public.post_financial_command(jsonb)", "to_regprocedure('public.post_financial_command(jsonb)')"],
    ["public.correct_financial_event(jsonb)", "to_regprocedure('public.correct_financial_event(jsonb)')"],
    ["public.post_financial_opening_cash(jsonb)", "to_regprocedure('public.post_financial_opening_cash(jsonb)')"],
  ]) {
    if (psql(url, `SELECT ${fn[1]} IS NOT NULL`) === "t") {
      assert.equal(psql(url, `SELECT has_function_privilege('authenticated','${fn[0]}','EXECUTE')`), "t");
      assert.equal(psql(url, `SELECT has_function_privilege('anon','${fn[0]}','EXECUTE')`), "f");
      assert.equal(psql(url, `SELECT has_function_privilege('service_role','${fn[0]}','EXECUTE')`), "f");
    }
  }
}

function predecessorOf(name) {
  const idx = F3_FORWARD_CHAIN.indexOf(name);
  return idx <= 0 ? null : F3_FORWARD_CHAIN[idx - 1];
}

function withFloor(throughPredecessor, fn) {
  const db = createDisposableDatabase("atom");
  try {
    psql(db.url, STUB_CORE_SQL);
    installLiveHasGroupPermission(db.url);
    ensureMigrationLedger(db.url);
    if (throughPredecessor) {
      applyForwardMigrationsWithLedger(db.url, throughPredecessor);
    }
    return fn(db);
  } finally {
    db.close();
  }
}

function runFailureRetry(name, site, { requireClean00118 = false } = {}) {
  return withFloor(predecessorOf(name), (db) => {
    const pre = fingerprint(db.url);
    const preLedger = readMigrationLedger(db.url);
    const preRole = sessionIdentity(db.url);
    const version = migrationLedgerVersion(name);
    const err = applyInjected(db.url, name, site);
    assert.match(err, new RegExp(`F3_ATOMICITY_INJECT:${site}`));
    assert.equal(sessionIdentity(db.url), preRole);
    assert.match(sessionIdentity(db.url), /^ubuntu:ubuntu:/);
    assert.equal(readMigrationLedger(db.url), preLedger);
    assert.doesNotMatch(readMigrationLedger(db.url), new RegExp(`(?:^|,)${version}:`));
    const postFail = fingerprint(db.url);
    assert.equal(postFail.md5, pre.md5, `${name} ${site} fingerprint changed after rollback`);
    assert.deepEqual(postFail.parsed, pre.parsed);
    assertTargetsAbsent(db.url, name);
    if (requireClean00118) {
      assert.deepEqual(f3Inventory(db.url), {
        schemas: 0,
        relations: 0,
        functions: 0,
        policies: 0,
        types: 0,
        grants_on_missing: 0,
      });
    }
    applyForwardMigrationWithLedger(db.url, name);
    assertTargetsPresent(db.url, name);
    assert.match(readMigrationLedger(db.url), new RegExp(`${version}:`));
    assertSuccessfulSecurity(db.url);
    const postOk = fingerprint(db.url);
    assert.notEqual(postOk.md5, pre.md5, `${name} clean apply must change fingerprint`);
    return { pre, postFail, postOk, err, ledgerAfter: readMigrationLedger(db.url) };
  });
}

test("generator emits one BEGIN + final COMMIT after the security tail", () => {
  const regen = spawnSync("python3", [path.join(root, "scripts/generate-f3-forward-migrations.py")], {
    encoding: "utf8",
    cwd: root,
  });
  assert.equal(regen.status, 0, regen.stderr || regen.stdout);
  for (const name of F3_FORWARD_CHAIN) {
    const src = readMigration(name);
    const { begins, commits } = topLevelBeginCommit(src);
    assert.deepEqual(begins, [src.split("\n").findIndex((l) => l.trim() === "BEGIN;") + 1]);
    assert.equal(begins.length, 1, name);
    assert.equal(commits.length, 1, name);
    const tail = src.indexOf("DO $f3_hgp_post$");
    const owner = src.indexOf("DO $f3_owner_pin$");
    const role = src.indexOf("SET ROLE postgres;");
    const reset = src.indexOf("RESET ROLE;");
    const commitPos = src.lastIndexOf("\nCOMMIT;\n");
    assert.ok(tail < owner && owner < role && role < reset && reset < commitPos, name);
    assert.equal(src.slice(commitPos + "\nCOMMIT;\n".length).trim(), "", name);
    assert.doesNotMatch(src.slice(0, commitPos), /^COMMIT;/m);
  }
});

test("00118–00123 bytes are generator output (idempotent regenerate)", () => {
  const before = Object.fromEntries(
    F3_FORWARD_CHAIN.map((name) => [name, createHash("sha256").update(readMigration(name)).digest("hex")]),
  );
  const regen = spawnSync("python3", [path.join(root, "scripts/generate-f3-forward-migrations.py")], {
    encoding: "utf8",
    cwd: root,
  });
  assert.equal(regen.status, 0, regen.stderr || regen.stdout);
  for (const name of F3_FORWARD_CHAIN) {
    const after = createHash("sha256").update(readMigration(name)).digest("hex");
    assert.equal(after, before[name], name);
  }
});

test("00118 hgp_post failure rolls back all F3 objects and ledger; clean retry works", () => {
  runFailureRetry("00118_f3_bounded_financial_epoch_foundation.sql", "hgp_post", {
    requireClean00118: true,
  });
});

test("00118 owner_pin failure rolls back; clean retry works", () => {
  runFailureRetry("00118_f3_bounded_financial_epoch_foundation.sql", "owner_pin", {
    requireClean00118: true,
  });
});

test("00118 grant_revoke failure rolls back; clean retry works", () => {
  runFailureRetry("00118_f3_bounded_financial_epoch_foundation.sql", "grant_revoke", {
    requireClean00118: true,
  });
});

test("00118 role_check failure rolls back; session is ubuntu; clean retry works", () => {
  runFailureRetry("00118_f3_bounded_financial_epoch_foundation.sql", "role_check", {
    requireClean00118: true,
  });
});

test("00119 hgp_post failure leaves 00118 fingerprint unchanged; clean retry works", () => {
  runFailureRetry("00119_f3_01_core_ledger_foundation.sql", "hgp_post");
});

test("00120 hgp_post failure leaves 00118-00119 fingerprint unchanged; clean retry works", () => {
  runFailureRetry("00120_f3_02_secure_posting_idempotency.sql", "hgp_post");
});

test("00120 grant_revoke failure rolls back target only; clean retry works", () => {
  runFailureRetry("00120_f3_02_secure_posting_idempotency.sql", "grant_revoke");
});

test("00120 role_check failure rolls back target only; session is ubuntu", () => {
  runFailureRetry("00120_f3_02_secure_posting_idempotency.sql", "role_check");
});

test("00121 hgp_post failure leaves preceding fingerprint unchanged; clean retry works", () => {
  runFailureRetry("00121_f3_03_projection_read_proof.sql", "hgp_post");
});

test("00122 hgp_post failure leaves preceding fingerprint unchanged; clean retry works", () => {
  runFailureRetry("00122_f3_04_correction_reversal.sql", "hgp_post");
});

test("00123 hgp_post failure leaves preceding fingerprint unchanged; clean retry works", () => {
  runFailureRetry("00123_f3_05_opening_cash_command.sql", "hgp_post");
});

test("successful 00118-00123 apply records ledger 00118-00123 and leaves session ubuntu", () => {
  withFloor(null, (db) => {
    applyForwardMigrationsWithLedger(db.url, "00123_f3_05_opening_cash_command.sql");
    assert.equal(
      readMigrationLedger(db.url),
      F3_FORWARD_CHAIN.map((n) => `${n.slice(0, 5)}:${n.replace(/\.sql$/, "")}`).join(","),
    );
    assertSuccessfulSecurity(db.url);
    assertTargetsPresent(db.url, "00118_f3_bounded_financial_epoch_foundation.sql");
    assertTargetsPresent(db.url, "00123_f3_05_opening_cash_command.sql");
  });
});
