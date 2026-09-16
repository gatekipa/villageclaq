/**
 * Part 1 — PG 17.6 local seal for catalog-v4 referenced-side FK tip 50b3d884.
 * Isolated to local Docker f3-reference-pg176 @ 127.0.0.1:55432.
 * Never contacts hosted disposable or production.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const TIP = "/workspace/f3-catalog-v4-remediate-20260915/tip-extract";
const OUT = "/workspace/f3-catalog-v4-remediate-20260915/phase-local";
const SEAL_DB = "f3_reference_catalog_v4_20260915";
const ENVELOPE_DIGEST =
  "eb58900b492b95371decfdab86b3786afc2c8089c6b0a117497f9e0b22c41a2a";
const EXPECTED_MODULE_SHA =
  "d96554569cb8b452445c7f14faa6218845d34a1812aba97c8abf196f0834cc57";
const CLOUD_AGENT_V4 = Object.freeze({
  "00118_f3_bounded_financial_epoch_foundation.sql":
    "92140cbe453f5edc47d7d85c022adfeb69212fff18ebfbff09dd588918756c94",
  "00119_f3_01_core_ledger_foundation.sql":
    "647e0174fcd0ed47a5281aad66dd2e056b1ae69c603b670c2fe6aea66e685109",
  "00120_f3_02_secure_posting_idempotency.sql":
    "8ab365c03f6340d42676f5f7c06bca9e0386e7bcdd5d9d18d34d2726123b050a",
  "00121_f3_03_projection_read_proof.sql":
    "9c02198e6e277590cf5c514704314a719d5323ae547623edd630f6c5591b1dc6",
  "00122_f3_04_correction_reversal.sql":
    "41fd34c976ed48f7a9d1ce6a154a2dba16d37487cffb364693bbae2046cbc31c",
  "00123_f3_05_opening_cash_command.sql":
    "a1eb6ba2741c8337bea35553f3d8b128e0ca83d1db014bd67342187b59cb78b6",
});
const CLAIMED_TRIGGER_COUNTS = Object.freeze({
  "00118_f3_bounded_financial_epoch_foundation.sql": { total:21, internal:20, referencing:10, referenced:10, user:1 },
  "00119_f3_01_core_ledger_foundation.sql": { total:101, internal:92, referencing:50, referenced:42, user:7 },
  "00120_f3_02_secure_posting_idempotency.sql": { total:108, internal:96, referencing:52, referenced:44, user:9 },
  "00121_f3_03_projection_read_proof.sql": { total:108, internal:96, referencing:52, referenced:44, user:9 },
  "00122_f3_04_correction_reversal.sql": { total:131, internal:116, referencing:62, referenced:54, user:11 },
  "00123_f3_05_opening_cash_command.sql": { total:140, internal:124, referencing:66, referenced:58, user:12 },
});

function loadReferenceEnv() {
  const env = {};
  for (const line of fs.readFileSync("/tmp/f3-reference-local.env", "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    env[t.slice(0, i)] = t.slice(i + 1).replace(/^["']|["']$/g, "");
  }
  if (env.PGHOST !== "127.0.0.1" || env.PGPORT !== "55432") {
    throw new Error("REFUSE: reference env must be 127.0.0.1:55432");
  }
  if (env.CONTAINER_NAME !== "f3-reference-pg176") {
    throw new Error("REFUSE: unexpected container");
  }
  if (/llbnliixczcqfftxpsmb/i.test(JSON.stringify(env))) {
    throw new Error("REFUSE: production marker in reference env");
  }
  return env;
}

const REF_ENV = loadReferenceEnv();

function assertOracleUrl(url) {
  if (typeof url !== "string" || !url.includes("127.0.0.1:55432")) {
    throw new Error("REFUSE: seal URL must target 127.0.0.1:55432 only");
  }
  if (/llbnliixczcqfftxpsmb|supabase\.(co|com)|pooler/i.test(url)) {
    throw new Error("REFUSE: hosted/production marker in URL");
  }
}

const {
  sealExpectedFingerprintsFromLocalOracle,
  getFrozenExpectedFingerprint,
  buildIndependentObservedFingerprint,
  fingerprintCanonicalSha256,
  CATALOG_FINGERPRINT_SQL,
  FROZEN_EXPECTED_FINGERPRINT_SHA256,
  EXPECTED_FINGERPRINT_SEAL_PROVENANCE,
  SEALED_PLATFORM_ACL_ENVELOPE,
  SEALED_PLATFORM_ACL_ENVELOPE_DIGEST,
  applyPlatformAclEnvelopeToLocalOracle,
  platformAclEnvelopeDigest,
  F3_FUNCTIONAL_RECURSIVE_CLOSURE,
  F3_FULL_FINGERPRINT_SCHEMA_VERSION,
  F3_FK_TRIGGER_UNIVERSE_BY_MIGRATION,
  enumerateFkConstraintTriggerUniverse,
  CATALOG_V3_00123_SUPERSESSION,
  CATALOG_V3_00123_HASH_D692,
  CATALOG_V3_00123_HASH_D802,
} = await import(path.join(TIP, "scripts/lib/f3-db-push-repair-safety-gate.mjs"));

const {
  collectIndependentFullCatalogReference,
  compareIndependentStructuredOutputs,
  independentlyNormalizeCatalog,
  INDEPENDENT_REFERENCE_MODULE_RELPATH,
  INDEPENDENT_REFERENCE_SCHEMA_VERSION,
} = await import(path.join(TIP, "scripts/lib/f3-full-catalog-independent-reference.mjs"));

const { F3_FORWARD_FILES, RECOGNITION_ALLOWLIST, FROZEN_DIGESTS, PREASSIGNED_VERSIONS } =
  await import(path.join(TIP, "scripts/lib/f3-db-push-pins.mjs"));

const { psql, psqlFile, psqlAdmin } = await import(
  path.join(TIP, "scripts/fixtures/disposable-postgres.mjs")
);
const { LOCAL_TCP_PASSWORD } = await import(
  path.join(TIP, "scripts/lib/f3-local-connection-guard.mjs")
);

const ADMIN_URL = `postgresql://ubuntu:${encodeURIComponent(LOCAL_TCP_PASSWORD)}@127.0.0.1:55432/postgres`;
assertOracleUrl(ADMIN_URL);

{
  const refUrl = `postgresql://${encodeURIComponent(REF_ENV.PGUSER)}:${encodeURIComponent(REF_ENV.POSTGRES_PASSWORD)}@127.0.0.1:55432/postgres`;
  assertOracleUrl(refUrl);
  const check = spawnSync(
    "psql",
    [refUrl, "-v", "ON_ERROR_STOP=1", "-tAc", "SELECT current_user;"],
    { encoding: "utf8" },
  );
  if (check.status !== 0 || !String(check.stdout).includes(REF_ENV.PGUSER)) {
    throw new Error(`REFUSE: reference-local.env user cannot connect: ${check.stderr || check.stdout}`);
  }
}

function adminUrl() {
  assertOracleUrl(ADMIN_URL);
  return ADMIN_URL;
}

function createDisposableDatabase(label) {
  const preferred = label === "oracle_seal" ? SEAL_DB : null;
  const raw =
    preferred ||
    `f3_reference_catalog_v4_${String(label || "suite").replace(/[^a-z0-9_]/gi, "_").slice(0, 18)}_${process.pid}`;
  const name = raw.toLowerCase().slice(0, 63);
  if (!name.startsWith("f3_reference_")) {
    throw new Error("work db must start with f3_reference_");
  }
  const url = `postgresql://ubuntu:${encodeURIComponent(LOCAL_TCP_PASSWORD)}@127.0.0.1:55432/${name}`;
  assertOracleUrl(url);
  try {
    psqlAdmin(
      ADMIN_URL,
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid();`,
    );
  } catch { /* ignore */ }
  psqlAdmin(ADMIN_URL, `DROP DATABASE IF EXISTS ${name};`);
  psqlAdmin(ADMIN_URL, `CREATE DATABASE ${name} OWNER ubuntu;`);
  const ver = psql(url, "SHOW server_version;");
  const verNum = psql(url, "SHOW server_version_num;");
  if (!String(ver).startsWith("17.6") || !String(verNum).startsWith("170006")) {
    throw new Error(`REFUSE: expected PG 17.6 on 55432, got version=${ver} num=${verNum}`);
  }
  const dbname = psql(url, "SELECT current_database();");
  const bootPath =
    label === "oracle_seal"
      ? path.join(OUT, "seal-db-bootstrap.json")
      : path.join(OUT, `verify-db-bootstrap-${name}.json`);
  fs.writeFileSync(
    bootPath,
    JSON.stringify(
      {
        label,
        database: name,
        container: "f3-reference-pg176",
        listen: "127.0.0.1:55432",
        reference_env_user: REF_ENV.PGUSER,
        reference_env_host: REF_ENV.PGHOST,
        reference_env_port: REF_ENV.PGPORT,
        proof: {
          server_version: ver,
          server_version_num: verNum,
          current_database: dbname,
          host: "127.0.0.1",
          port: 55432,
        },
        note: "Fresh f3_reference_* DB on SAME 17.6 container; platform ACL envelope + stub+live-pin floor + 00117 + 00118-23",
        host_17_11_on_5432_avoided: true,
        production_contacted: false,
        disposable_reset: false,
      },
      null,
      2,
    ),
  );
  return {
    name,
    url,
    close: () => {
      try {
        psqlAdmin(
          ADMIN_URL,
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid();`,
        );
      } catch { /* ignore */ }
      try {
        psqlAdmin(ADMIN_URL, `DROP DATABASE IF EXISTS ${name};`);
      } catch { /* ignore */ }
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
      diffs.push({
        path: prefix || "$",
        builder_len: Array.isArray(a) ? a.length : null,
        reference_len: Array.isArray(b) ? b.length : null,
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

function writeJson(rel, obj) {
  const abs = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(obj, null, 2) + "\n");
  return abs;
}

const origCanon = fs.readFileSync(
  "/workspace/f3-catalog-v4-remediate-20260915/original-envelope/platform-acl-envelope.canonical.json",
);
const origCanonSha = createHash("sha256").update(origCanon).digest("hex");
const tipRecomputed = platformAclEnvelopeDigest(SEALED_PLATFORM_ACL_ENVELOPE);
const envelopeProof = {
  tip_digest_constant: SEALED_PLATFORM_ACL_ENVELOPE_DIGEST,
  tip_envelope_digest_field: SEALED_PLATFORM_ACL_ENVELOPE.digest_sha256,
  tip_recomputed: tipRecomputed,
  original_canonical_bytes: origCanon.length,
  original_canonical_sha256: origCanonSha,
  expected_pin: ENVELOPE_DIGEST,
  match:
    SEALED_PLATFORM_ACL_ENVELOPE_DIGEST === ENVELOPE_DIGEST &&
    SEALED_PLATFORM_ACL_ENVELOPE.digest_sha256 === ENVELOPE_DIGEST &&
    tipRecomputed === ENVELOPE_DIGEST &&
    origCanonSha === ENVELOPE_DIGEST &&
    origCanon.length === 10222,
  original_has_REDACTED: origCanon.includes(Buffer.from("[REDACTED]")),
  tip_envelope_has_REDACTED: JSON.stringify(SEALED_PLATFORM_ACL_ENVELOPE).includes("[REDACTED]"),
  not_from_hosted_fingerprint_72af6699:
    SEALED_PLATFORM_ACL_ENVELOPE.not_from_hosted_fingerprint_72af6699 === true,
  not_from_financial_ledger_epochs:
    SEALED_PLATFORM_ACL_ENVELOPE.not_from_financial_ledger_epochs === true,
  provenance_claim: SEALED_PLATFORM_ACL_ENVELOPE.provenance,
  semantic_match_tip: true,
};
writeJson("envelope-proof.json", envelopeProof);

const moduleSha =
  F3_FUNCTIONAL_RECURSIVE_CLOSURE.source_sha256[INDEPENDENT_REFERENCE_MODULE_RELPATH] ||
  F3_FUNCTIONAL_RECURSIVE_CLOSURE.independent_reference_source_sha256;
const moduleProof = {
  claimed: EXPECTED_MODULE_SHA,
  tip_closure: moduleSha,
  file_sha256: createHash("sha256")
    .update(fs.readFileSync(path.join(TIP, INDEPENDENT_REFERENCE_MODULE_RELPATH)))
    .digest("hex"),
  match: moduleSha === EXPECTED_MODULE_SHA,
};
writeJson("independent-module-sha-proof.json", moduleProof);

const closureProof = {
  closure_complete: F3_FUNCTIONAL_RECURSIVE_CLOSURE.closure_complete === true,
  missing: F3_FUNCTIONAL_RECURSIVE_CLOSURE.missing,
  unresolved: F3_FUNCTIONAL_RECURSIVE_CLOSURE.unresolved,
  unexplained_exclusions: F3_FUNCTIONAL_RECURSIVE_CLOSURE.unexplained_exclusions,
  uncommitted_functional_diffs: F3_FUNCTIONAL_RECURSIVE_CLOSURE.uncommitted_functional_diffs,
  hosted_tree_mismatches: F3_FUNCTIONAL_RECURSIVE_CLOSURE.hosted_tree_mismatches,
  schema_primary: F3_FULL_FINGERPRINT_SCHEMA_VERSION,
  schema_independent: INDEPENDENT_REFERENCE_SCHEMA_VERSION,
};
writeJson("recursive-closure.json", closureProof);

console.log(
  JSON.stringify({
    phase: "start_seal",
    target: "127.0.0.1:55432",
    pg: "17.6",
    seal_db: SEAL_DB,
    envelope_ok: envelopeProof.match,
    module_ok: moduleProof.match,
    closure_complete: closureProof.closure_complete,
    schemas: [F3_FULL_FINGERPRINT_SCHEMA_VERSION, INDEPENDENT_REFERENCE_SCHEMA_VERSION],
  }),
);

const sealed = await sealExpectedFingerprintsFromLocalOracle({
  fixtures: {
    createDisposableDatabase,
    psql,
    psqlFile,
    psqlAdmin,
    adminUrl,
  },
});

console.log(
  JSON.stringify(
    {
      phase: "seal_complete",
      ok: sealed.ok,
      status: sealed.status,
      reason: sealed.reason || null,
      hashes: sealed.hashes || null,
      independentAgrees: sealed.independentAgrees ?? null,
      schema_version: sealed.schema_version || null,
      serverVersion: sealed.serverVersion || null,
      stageComparisons: sealed.stageComparisons
        ? Object.fromEntries(
            Object.entries(sealed.stageComparisons).map(([k, v]) => [
              k,
              {
                ok: v.ok,
                primarySha256: v.primarySha256,
                independentSha256: v.independentSha256,
                missingKeys: v.missingKeys,
                extraKeys: v.extraKeys,
                unequalKeys: v.unequalKeys,
              },
            ]),
          )
        : null,
    },
    null,
    2,
  ),
);

writeJson("seal-result.json", {
  ok: sealed.ok,
  status: sealed.status,
  reason: sealed.reason || null,
  hashes: sealed.hashes || null,
  recognition: sealed.recognition || null,
  provenance: sealed.provenance || null,
  schema_version: sealed.schema_version || null,
  platformAclCalibration: sealed.platformAclCalibration || null,
  platformAclApplied: sealed.platformAclApplied || null,
  independentAgrees: sealed.independentAgrees ?? null,
  stageComparisons: sealed.stageComparisons || null,
  serverVersion: sealed.serverVersion || null,
  mustReverifyOn176: sealed.mustReverifyOn176 ?? null,
  catalog_keys: sealed.catalogs ? Object.keys(sealed.catalogs) : [],
});

if (sealed.primaryStructured) {
  for (const [file, fp] of Object.entries(sealed.primaryStructured)) {
    writeJson(`primary/${file}.json`, fp);
  }
}
if (sealed.independentStructured) {
  for (const [file, fp] of Object.entries(sealed.independentStructured)) {
    writeJson(`independent/${file}.json`, fp);
  }
}
if (sealed.stageComparisons) {
  writeJson("comparisons/stage-comparisons.json", sealed.stageComparisons);
}

if (!sealed.ok || !sealed.hashes) {
  writeJson("verify-complete.json", {
    ready_candidate: false,
    hold_reason: sealed.reason || sealed.status,
    seal_ok: false,
  });
  console.error("SEAL_FAILED", sealed.status, sealed.reason);
  process.exit(1);
}

const verifyDb = createDisposableDatabase("oracle_verify");
const workdir = fs.mkdtempSync("/tmp/f3-oracle-verify-");
const { installStubLivePinFloorLocal } = await import(
  path.join(TIP, "scripts/lib/f3-db-push-stub-live-pin-floor.mjs")
);

function applySqlAsPostgresRole(url, sql) {
  return psql(url, `SET ROLE postgres;\n${sql}`);
}
function applyFileAsPostgresRole(url, absPath) {
  const sql = fs.readFileSync(absPath, "utf8");
  const tmp = path.join(workdir, `apply-${path.basename(absPath)}`);
  fs.writeFileSync(tmp, `SET ROLE postgres;\n${sql}`);
  return psqlFile(url, tmp);
}

const appliedDefaults = applyPlatformAclEnvelopeToLocalOracle({
  envelope: SEALED_PLATFORM_ACL_ENVELOPE,
  applySql: (sql) => {
    if (/ALTER DEFAULT PRIVILEGES/i.test(sql)) {
      return applySqlAsPostgresRole(verifyDb.url, sql);
    }
    return psql(verifyDb.url, sql);
  },
});
if (!appliedDefaults.ok) {
  console.error("VERIFY_PLATFORM_ACL_FAILED", appliedDefaults);
  process.exit(1);
}
writeJson("verify-platform-acl-applied.json", appliedDefaults);

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
const independentHashes = {};
const tipEmbedded = { ...FROZEN_EXPECTED_FINGERPRINT_SHA256 };
let allEqual = true;
let allMatchTip = true;
let allMatchCloud = true;

function frozenMigrationName(file) {
  return file.replace(/\.sql$/, "");
}
function sourceLabelForFile(file) {
  const match = String(file).match(/^(0011[89]|0012[0-3])/);
  return match ? match[1] : String(file).replace(/\.sql$/i, "");
}

for (const file of F3_FORWARD_FILES) {
  const abs = path.join(TIP, "supabase/migrations", file);
  const bytes = fs.readFileSync(abs);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== FROZEN_DIGESTS[file]) {
    throw new Error(`HOLD: digest drift ${file}`);
  }
  applyFileAsPostgresRole(verifyDb.url, abs);

  const raw = applySqlAsPostgresRole(verifyDb.url, CATALOG_FINGERPRINT_SQL);
  const catalog = JSON.parse(String(raw || "").trim());
  const primaryFp = buildIndependentObservedFingerprint(file, catalog);
  const primarySha = fingerprintCanonicalSha256(primaryFp);

  const independent = collectIndependentFullCatalogReference({
    queryText: (sql) => applySqlAsPostgresRole(verifyDb.url, sql),
    file,
    migration: {
      file,
      source_label: sourceLabelForFile(file),
      version: PREASSIGNED_VERSIONS[file],
      name: frozenMigrationName(file),
      digest: FROZEN_DIGESTS[file],
      recognition: [...RECOGNITION_ALLOWLIST],
    },
  });
  const referenceSha = independent.sha256;
  independentHashes[file] = referenceSha;

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

  const compared = compareIndependentStructuredOutputs(
    independentlyNormalizeCatalog(primaryFp),
    independent.fingerprint,
  );

  const sealSha = sealed.hashes[file];
  const tipSha = tipEmbedded[file];
  const cloudSha = CLOUD_AGENT_V4[file];

  const equalBuilderRef = builderSha != null && builderSha === referenceSha;
  const equalPrimaryIndependent = compared.ok === true && primarySha === referenceSha;
  const equalSealIndependent = sealSha === referenceSha;
  const equalTipIndependent = tipSha === referenceSha;
  const equalCloudIndependent = cloudSha === referenceSha;
  if (!equalBuilderRef || !equalPrimaryIndependent || !equalSealIndependent) allEqual = false;
  if (!equalTipIndependent) allMatchTip = false;
  if (!equalCloudIndependent) allMatchCloud = false;

  writeJson(`primary/verify-${file}.json`, primaryFp);
  writeJson(`independent/verify-${file}.json`, independent.fingerprint);
  writeJson(`comparisons/${file}.json`, {
    ...compared,
    primarySha256: primarySha,
    independentSha256: referenceSha,
    builderSha256: builderSha,
    tipEmbeddedSha256: tipSha,
    cloudAgentV3Sha256: cloudSha,
    sealHelperSha256: sealSha,
  });

  builderVsRef[file] = {
    equal: equalBuilderRef && equalPrimaryIndependent,
    builder_sha256: builderSha,
    primary_sha256: primarySha,
    reference_sha256: referenceSha,
    seal_helper_sha256: sealSha,
    tip_embedded_sha256: tipSha,
    cloud_agent_v4_sha256: cloudSha,
    seal_equals_independent_reference: equalSealIndependent,
    tip_equals_independent_reference: equalTipIndependent,
    cloud_equals_independent_reference: equalCloudIndependent,
    structured_compare_ok: compared.ok,
    missingKeys: compared.missingKeys,
    extraKeys: compared.extraKeys,
    unequalKeys: compared.unequalKeys,
    builder_error: builderErr,
    field_diffs:
      equalBuilderRef && equalPrimaryIndependent
        ? []
        : deepDiff(builderFp || primaryFp, independent.fingerprint).slice(0, 30),
    recognition_builder: builderFp?.recognition ?? primaryFp?.recognition ?? null,
    recognition_reference: independent.fingerprint?.recognition ?? null,
    schema_version_primary: primaryFp?.schema_version ?? null,
    schema_version_independent: independent.fingerprint?.schema_version ?? null,
    migration_digest: digest,
  };
}


// Trigger universe + referenced-side + per-trigger defer flags
const triggerUniverseProof = {};
let triggerUniverseOk = true;
for (const file of F3_FORWARD_FILES) {
  const claimed = CLAIMED_TRIGGER_COUNTS[file];
  const tipUniverse = F3_FK_TRIGGER_UNIVERSE_BY_MIGRATION[file];
  const indFp = JSON.parse(fs.readFileSync(path.join(OUT, `independent/verify-${file}.json`), "utf8"));
  const primFp = JSON.parse(fs.readFileSync(path.join(OUT, `primary/verify-${file}.json`), "utf8"));
  const enumerated = enumerateFkConstraintTriggerUniverse(indFp);
  const counts = {
    total: enumerated.total,
    internal: enumerated.internal_constraint,
    referencing: enumerated.referencing_action,
    referenced: enumerated.referenced_action,
    user: enumerated.user,
  };
  const deferFlagsOk = (indFp.triggers || []).every(
    (r) => typeof r.tgdeferrable === "boolean" && typeof r.tginitdeferred === "boolean"
      && !Object.prototype.hasOwnProperty.call(r, "deferrable")
      && !Object.prototype.hasOwnProperty.call(r, "initially_deferred"),
  );
  const matchClaimed =
    counts.total === claimed.total &&
    counts.internal === claimed.internal &&
    counts.referencing === claimed.referencing &&
    counts.referenced === claimed.referenced &&
    counts.user === claimed.user;
  const matchTipUniverse =
    tipUniverse &&
    tipUniverse.total === claimed.total &&
    tipUniverse.internal_constraint === claimed.internal &&
    tipUniverse.referencing_action === claimed.referencing &&
    tipUniverse.referenced_action === claimed.referenced &&
    tipUniverse.user === claimed.user &&
    counts.total === tipUniverse.total;
  const requiredRefs = ["public.profiles", "public.groups", "public.organizations"];
  const tipRefs = tipUniverse?.referenced_side_relations || [];
  const obsRefs = enumerated.referenced_side_relations || [];
  const requiredPresent = requiredRefs.every((x) => tipRefs.includes(x) || obsRefs.includes(x));
  const row = {
    claimed,
    observed_counts: counts,
    tip_universe_counts: tipUniverse
      ? {
          total: tipUniverse.total,
          internal: tipUniverse.internal_constraint,
          referencing: tipUniverse.referencing_action,
          referenced: tipUniverse.referenced_action,
          user: tipUniverse.user,
          referenced_side_relations: tipUniverse.referenced_side_relations,
        }
      : null,
    match_claimed: matchClaimed,
    match_tip_universe: !!matchTipUniverse,
    enumerated,
    referenced_side_observed: obsRefs,
    required_referenced_side_present: requiredPresent,
    per_trigger_tgdeferrable_tginitdeferred: deferFlagsOk,
    primary_trigger_count: (primFp.triggers || []).length,
    independent_trigger_count: (indFp.triggers || []).length,
  };
  if (!row.match_claimed || !row.match_tip_universe || !row.required_referenced_side_present || !row.per_trigger_tgdeferrable_tginitdeferred) {
    triggerUniverseOk = false;
  }
  triggerUniverseProof[file] = row;
}
writeJson("trigger-universe-proof.json", triggerUniverseProof);
writeJson("d692-d802-supersession.json", {
  CATALOG_V3_00123_SUPERSESSION,
  CATALOG_V3_00123_HASH_D692,
  CATALOG_V3_00123_HASH_D802,
  both_superseded_by_v4: CATALOG_V3_00123_SUPERSESSION.both_superseded_by_v4 === true,
});

verifyDb.close();
try {
  fs.rmSync(workdir, { recursive: true, force: true });
} catch { /* ignore */ }

writeJson("independent-hashes.json", independentHashes);
writeJson("tip-embedded-hashes.json", tipEmbedded);
writeJson("cloud-agent-v4-expected-hashes.json", CLOUD_AGENT_V4);
writeJson("builder-vs-reference.json", builderVsRef);

const ready =
  sealed.ok === true &&
  sealed.independentAgrees === true &&
  allEqual === true &&
  allMatchTip === true &&
  allMatchCloud === true &&
  triggerUniverseOk === true &&
  envelopeProof.match === true &&
  envelopeProof.original_has_REDACTED === false &&
  envelopeProof.tip_envelope_has_REDACTED === false &&
  moduleProof.match === true &&
  closureProof.closure_complete === true &&
  Object.values(builderVsRef).every(
    (x) =>
      Array.isArray(x.recognition_reference) &&
      x.recognition_reference.length === 1 &&
      x.recognition_reference[0] === "manual_income" &&
      x.schema_version_primary === "f3-full-catalog-v4" &&
      x.schema_version_independent === "f3-full-catalog-v4" &&
      (x.missingKeys?.length ?? 0) === 0 &&
      (x.extraKeys?.length ?? 0) === 0 &&
      (x.unequalKeys?.length ?? 0) === 0,
  );

const holdReasons = [];
if (!allMatchCloud) {
  holdReasons.push("17.6_recompute_or_tip_ne_cloud_v4_founder_pin");
}
if (!triggerUniverseOk) holdReasons.push("trigger_universe_or_referenced_side_or_tgdefer_mismatch");
if (!allMatchTip) holdReasons.push("17.6_recompute_ne_tip_embedded");
if (!allEqual) holdReasons.push("builder_ne_independent_or_structured_mismatch");
if (!sealed.ok) holdReasons.push("seal_not_ok");
if (!moduleProof.match) holdReasons.push("module_sha_mismatch");
if (!envelopeProof.match) holdReasons.push("envelope_mismatch");
if (!closureProof.closure_complete) holdReasons.push("closure_incomplete");

writeJson("verify-complete.json", {
  all_builder_eq_reference: allEqual,
  all_tip_eq_independent: allMatchTip,
  all_cloud_eq_independent: allMatchCloud,
  trigger_universe_ok: triggerUniverseOk,
  ready_candidate: ready,
  hold_reasons: holdReasons,
  independent_hashes: independentHashes,
  tip_embedded: tipEmbedded,
  cloud_agent_v4: CLOUD_AGENT_V4,
  trigger_universe: triggerUniverseProof,
});

console.log(
  JSON.stringify(
    {
      phase: "verify_complete",
      all_builder_eq_reference: allEqual,
      all_tip_eq_independent: allMatchTip,
      all_cloud_eq_independent: allMatchCloud,
      independent_hashes: independentHashes,
      tip_embedded: tipEmbedded,
      cloud_agent_v4: CLOUD_AGENT_V4,
      envelope_ok: envelopeProof.match,
      module_ok: moduleProof.match,
      ready_candidate: ready,
      hold_reasons: holdReasons,
    },
    null,
    2,
  ),
);

process.exit(ready ? 0 : 1);
