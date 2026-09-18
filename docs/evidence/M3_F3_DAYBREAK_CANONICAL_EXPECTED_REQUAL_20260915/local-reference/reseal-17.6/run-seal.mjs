/**
 * Isolated reseal against local Docker PG 17.6 on 127.0.0.1:55432 only.
 * Never contacts hosted disposable or production.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const TIP = "/tmp/vc-canon-seal/tip";
const OUT = "/workspace/f3-canonical-oracle/reseal-17.6";
const FORBIDDEN_HOSTED_00118 =
  "72af66999f3a53a870cd1a5d0ed99a2acb7f510c69bfe16204b9fe0f217f757f";
const CLOUD_AGENT_17_11 = {
  "00118_f3_bounded_financial_epoch_foundation.sql": "8299680fd5b3def52a981ae8c8ee097f29f13507b91d4f0799557236f1b5001c",
  "00119_f3_01_core_ledger_foundation.sql": "0ee6c447ac89510f381abd30908b7fb5ba304537e60c577d6eedcc7835a7ed43",
  "00120_f3_02_secure_posting_idempotency.sql": "13234a1e57a8c181da1a356ba1f236efc919efb6edb642062239499ff10d0ce9",
  "00121_f3_03_projection_read_proof.sql": "b1693eda6e5e3944db092d800e037e366c9fd8e18723db962493b502c539cb30",
  "00122_f3_04_correction_reversal.sql": "9add78f222edc0f933512f726f08ed92feed94432b9a9234c32e6952a1dfc00c",
  "00123_f3_05_opening_cash_command.sql": "0234d2bf2374c8a681d186b8d77364b4b4db02eac76cebf786173d4a835f9547",
};

// Fail-closed: refuse any non-loopback / non-55432 target
function assertOracleUrl(url) {
  if (typeof url !== "string" || !url.includes("127.0.0.1:55432")) {
    throw new Error(`REFUSE: seal URL must target 127.0.0.1:55432 only, got redacted`);
  }
  if (/llbnliixczcqfftxpsmb|supabase\.(co|com)|pooler/i.test(url)) {
    throw new Error("REFUSE: hosted/production marker in URL");
  }
}

const {
  sealExpectedFingerprintsFromLocalOracle,
  getFrozenExpectedFingerprint,
  buildExpandedExpectedFingerprint,
  buildIndependentObservedFingerprint,
  fingerprintCanonicalSha256,
  CATALOG_FINGERPRINT_SQL,
  FROZEN_EXPECTED_FINGERPRINT_SHA256,
  EXPECTED_FINGERPRINT_SEAL_PROVENANCE,
} = await import(path.join(TIP, "scripts/lib/f3-db-push-repair-safety-gate.mjs"));

const {
  F3_FORWARD_FILES,
  RECOGNITION_ALLOWLIST,
} = await import(path.join(TIP, "scripts/lib/f3-db-push-pins.mjs"));

const {
  psql,
  psqlFile,
  psqlAdmin,
  LOCAL_TCP_PASSWORD,
} = await import(path.join(TIP, "scripts/fixtures/disposable-postgres.mjs")).then(async (mod) => {
  // LOCAL_TCP_PASSWORD is in connection-guard, re-export via creating URLs
  const guard = await import(path.join(TIP, "scripts/lib/f3-local-connection-guard.mjs"));
  return { ...mod, LOCAL_TCP_PASSWORD: guard.LOCAL_TCP_PASSWORD };
});

const ADMIN_URL = `postgresql://ubuntu:${encodeURIComponent(LOCAL_TCP_PASSWORD)}@127.0.0.1:55432/postgres`;
assertOracleUrl(ADMIN_URL);

function adminUrl() {
  assertOracleUrl(ADMIN_URL);
  return ADMIN_URL;
}

function createDisposableDatabase(label) {
  // Prefer stable documented name; fall back to unique if exists mid-run
  const preferred = "f3_reference_seal_20260915";
  const raw =
    label === "oracle_seal"
      ? preferred
      : `f3_reference_${String(label || "suite").replace(/[^a-z0-9_]/gi, "_").slice(0, 20)}_${process.pid}`;
  const name = raw.toLowerCase().slice(0, 63);
  if (!name.startsWith("f3_")) throw new Error("work db must start with f3_");
  const url = `postgresql://ubuntu:${encodeURIComponent(LOCAL_TCP_PASSWORD)}@127.0.0.1:55432/${name}`;
  assertOracleUrl(url);
  psqlAdmin(ADMIN_URL, `DROP DATABASE IF EXISTS ${name};`);
  psqlAdmin(ADMIN_URL, `CREATE DATABASE ${name} OWNER ubuntu;`);
  // Prove PG 17.6
  const ver = psql(url, "SHOW server_version;");
  const verNum = psql(url, "SHOW server_version_num;");
  if (!String(ver).startsWith("17.6") || !String(verNum).startsWith("170006")) {
    throw new Error(`REFUSE: expected PG 17.6 on 55432, got version=${ver} num=${verNum}`);
  }
  const dbname = psql(url, "SELECT current_database();");
  const listenProof = {
    server_version: ver,
    server_version_num: verNum,
    current_database: dbname,
    host: "127.0.0.1",
    port: 55432,
  };
  const bootPath = label === "oracle_seal"
    ? path.join(OUT, "seal-db-bootstrap.json")
    : path.join(OUT, `verify-db-bootstrap-${name}.json`);
  fs.writeFileSync(bootPath, JSON.stringify({
    label,
    database: name,
    container: "f3-reference-pg176",
    listen: "127.0.0.1:55432",
    proof: listenProof,
    note: "Fresh f3_reference_* DB on SAME 17.6 container; floor+00117+00118-23 applied by seal/verify helper",
    preexisting_oracle_untouched: "f3_reference_oracle_20260915",
  }, null, 2));
  return {
    name,
    url,
    close: () => {
      try { psqlAdmin(ADMIN_URL, `DROP DATABASE IF EXISTS ${name};`); } catch { /* ignore */ }
    },
  };
}

function deepDiff(a, b, prefix = "") {
  const diffs = [];
  if (a === b) return diffs;
  if (typeof a !== typeof b || a == null || b == null || typeof a !== "object") {
    diffs.push({ path: prefix || "$", builder: a, reference: b });
    return diffs;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      diffs.push({ path: prefix || "$", builder_len: Array.isArray(a) ? a.length : null, reference_len: Array.isArray(b) ? b.length : null });
      // also sample first mismatch content hashes
      diffs.push({
        path: (prefix || "$") + "#json_sha",
        builder: createHash("sha256").update(JSON.stringify(a)).digest("hex"),
        reference: createHash("sha256").update(JSON.stringify(b)).digest("hex"),
      });
      return diffs;
    }
    for (let i = 0; i < a.length; i++) {
      diffs.push(...deepDiff(a[i], b[i], `${prefix}[${i}]`));
      if (diffs.length > 40) break;
    }
    return diffs;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of [...keys].sort()) {
    if (!(k in a)) diffs.push({ path: `${prefix}.${k}`, missing_in: "builder" });
    else if (!(k in b)) diffs.push({ path: `${prefix}.${k}`, missing_in: "reference" });
    else diffs.push(...deepDiff(a[k], b[k], `${prefix}.${k}`));
    if (diffs.length > 40) break;
  }
  return diffs;
}

console.log(JSON.stringify({ phase: "start_seal", target: "127.0.0.1:55432", pg: "17.6" }));

const sealed = await sealExpectedFingerprintsFromLocalOracle({
  fixtures: {
    createDisposableDatabase,
    psql,
    psqlFile,
    psqlAdmin,
    adminUrl,
  },
});

console.log(JSON.stringify({
  phase: "seal_complete",
  ok: sealed.ok,
  status: sealed.status,
  reason: sealed.reason || null,
  hashes: sealed.hashes || null,
  recognition: sealed.recognition || null,
  provenance_method: sealed.provenance?.method || null,
  local_pg_claim: sealed.provenance?.local_pg || null,
}, null, 2));

fs.writeFileSync(path.join(OUT, "seal-result.json"), JSON.stringify({
  ok: sealed.ok,
  status: sealed.status,
  reason: sealed.reason || null,
  hashes: sealed.hashes || null,
  recognition: sealed.recognition || null,
  provenance: sealed.provenance || null,
  schema_version: sealed.schema_version || null,
  catalog_keys: sealed.catalogs ? Object.keys(sealed.catalogs) : [],
}, null, 2));

if (!sealed.ok || !sealed.hashes || !sealed.catalogs) {
  process.exitCode = sealed.status === "NOT_RUN" ? 2 : 1;
  console.error("SEAL_FAILED", sealed.status, sealed.reason);
  process.exit(process.exitCode);
}

// --- Independent verification pass on a SECOND fresh DB ---
const verifyDb = createDisposableDatabase("oracle_verify");
const workdir = fs.mkdtempSync("/tmp/f3-oracle-verify-");
const { installStubLivePinFloorLocal } = await import(path.join(TIP, "scripts/lib/f3-db-push-stub-live-pin-floor.mjs"));

function applySqlAsPostgresRole(url, sql) {
  return psql(url, `SET ROLE postgres;\n${sql}`);
}
function applyFileAsPostgresRole(url, absPath) {
  const sql = fs.readFileSync(absPath, "utf8");
  const tmp = path.join(workdir, `apply-${path.basename(absPath)}`);
  fs.writeFileSync(tmp, `SET ROLE postgres;\n${sql}`);
  return psqlFile(url, tmp);
}

applySqlAsPostgresRole(
  verifyDb.url,
  `CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE OR REPLACE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT extensions.uuid_generate_v4() $$;
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY, statements text[], name text
);`,
);

const installed = installStubLivePinFloorLocal({
  url: verifyDb.url,
  workdir,
  psql: (url, query) => applySqlAsPostgresRole(url, query),
  psqlFile: (url, abs) => applyFileAsPostgresRole(url, abs),
});
if (!installed?.installed || !installed?.reached_00117) {
  console.error("VERIFY_FLOOR_FAILED", installed);
  process.exit(1);
}

const builderVsRef = {};
const newExpectedHashes = {};
const independentHashes = {};
let allEqual = true;

for (const file of F3_FORWARD_FILES) {
  const abs = path.join(TIP, "supabase/migrations", file);
  applyFileAsPostgresRole(verifyDb.url, abs);
  const raw = applySqlAsPostgresRole(verifyDb.url, CATALOG_FINGERPRINT_SQL);
  const catalog = JSON.parse(String(raw || "").trim());
  const referenceFp = buildIndependentObservedFingerprint(file, catalog);
  const referenceSha = fingerprintCanonicalSha256(referenceFp);
  independentHashes[file] = referenceSha;

  // Offline builder from EMBEDDED tip catalog (cloud-agent 17.11 seal inputs)
  let builderFp;
  let builderSha;
  let builderErr = null;
  try {
    builderFp = getFrozenExpectedFingerprint(file);
    builderSha = fingerprintCanonicalSha256(builderFp);
  } catch (e) {
    builderErr = String(e.message || e);
    builderFp = null;
    builderSha = null;
  }

  // Seal helper output for this file
  const sealSha = sealed.hashes[file];
  const sealCatalog = sealed.catalogs[file];
  const sealRebuilt = buildIndependentObservedFingerprint(file, sealCatalog);
  const sealRebuiltSha = fingerprintCanonicalSha256(sealRebuilt);

  // Source-derived rebuild from THIS process's independent catalog (= reference)
  const fromLocalCatalogSha = fingerprintCanonicalSha256(
    buildIndependentObservedFingerprint(file, catalog),
  );

  const equalBuilderRef = builderSha != null && builderSha === referenceSha;
  const equalSealIndependent = sealSha === referenceSha;
  const equalSealRebuilt = sealRebuiltSha === sealSha;

  if (!equalBuilderRef || !equalSealIndependent) allEqual = false;

  const fieldDiffs = equalBuilderRef
    ? []
    : deepDiff(builderFp, referenceFp).slice(0, 30);

  builderVsRef[file] = {
    equal: equalBuilderRef,
    builder_sha256: builderSha,
    reference_sha256: referenceSha,
    seal_helper_sha256: sealSha,
    seal_rebuilt_from_seal_catalog_sha256: sealRebuiltSha,
    seal_equals_independent_reference: equalSealIndependent,
    seal_catalog_reproducible: equalSealRebuilt,
    from_local_catalog_sha256: fromLocalCatalogSha,
    builder_error: builderErr,
    field_diffs: fieldDiffs,
    recognition_builder: builderFp?.recognition ?? null,
    recognition_reference: referenceFp?.recognition ?? null,
  };
  newExpectedHashes[file] = referenceSha;
}

verifyDb.close();
try { fs.rmSync(workdir, { recursive: true, force: true }); } catch { /* ignore */ }

const vsCloud = {};
for (const file of F3_FORWARD_FILES) {
  const a = newExpectedHashes[file];
  const b = CLOUD_AGENT_17_11[file];
  vsCloud[file] = { seal_17_6: a, cloud_agent_17_11: b, identical: a === b };
}

const notHosted = {
  forbidden_hosted_00118: FORBIDDEN_HOSTED_00118,
  local_17_6_00118: newExpectedHashes["00118_f3_bounded_financial_epoch_foundation.sql"],
  ne_forbidden: newExpectedHashes["00118_f3_bounded_financial_epoch_foundation.sql"] !== FORBIDDEN_HOSTED_00118,
  tip_embedded_00118: CLOUD_AGENT_17_11["00118_f3_bounded_financial_epoch_foundation.sql"],
  local_ne_tip_embedded_00118:
    newExpectedHashes["00118_f3_bounded_financial_epoch_foundation.sql"] !==
    CLOUD_AGENT_17_11["00118_f3_bounded_financial_epoch_foundation.sql"],
  recomputed_on_pg: "17.6",
  container: "f3-reference-pg176",
  listen: "127.0.0.1:55432",
  not_copied_from_hosted_observed: true,
  not_copied_from_cloud_agent_without_recompute: true,
  seal_helper_ok: sealed.ok === true,
  method: "independent_local_pg17.6_CATALOG_FINGERPRINT_SQL",
};

fs.writeFileSync(path.join(OUT, "new-expected-hashes.json"), JSON.stringify(newExpectedHashes, null, 2));
fs.writeFileSync(path.join(OUT, "builder-vs-reference.json"), JSON.stringify(builderVsRef, null, 2));
fs.writeFileSync(path.join(OUT, "not-hosted-proof.json"), JSON.stringify(notHosted, null, 2));
fs.writeFileSync(path.join(OUT, "vs-cloud-agent-17.11.json"), JSON.stringify(vsCloud, null, 2));

console.log(JSON.stringify({
  phase: "verify_complete",
  all_builder_eq_reference: Object.values(builderVsRef).every((x) => x.equal),
  all_seal_eq_independent: Object.values(builderVsRef).every((x) => x.seal_equals_independent_reference),
  new_expected_hashes: newExpectedHashes,
  vs_cloud_identical: Object.values(vsCloud).every((x) => x.identical),
  not_hosted_00118: notHosted.ne_forbidden,
}, null, 2));
