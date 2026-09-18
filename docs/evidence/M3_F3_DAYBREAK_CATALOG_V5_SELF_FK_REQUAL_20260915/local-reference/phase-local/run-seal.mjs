/**
 * Part 1 — PG 17.6 local seal for catalog-v5 self-FK RI roles tip cc8495f0.
 * Isolated to local Docker f3-reference-pg176 @ 127.0.0.1:55432.
 * Never contacts hosted disposable or production.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const TIP = "/workspace/f3-catalog-v5-remediate-20260915/tip-work";
const OUT = "/workspace/f3-catalog-v5-remediate-20260915/phase-local";
const SEAL_DB = "f3_reference_catalog_v5_20260915";
const ENVELOPE_DIGEST =
  "eb58900b492b95371decfdab86b3786afc2c8089c6b0a117497f9e0b22c41a2a";
const EXPECTED_MODULE_SHA =
  "3742c0396903f3e91a779deec9b62d93a879f134c186f3b4b817a19c6ca99c91";
const CLOUD_AGENT_V5 = Object.freeze({
  "00118_f3_bounded_financial_epoch_foundation.sql":
    "888c794355982346573a3353caa7fa74181bc0048cc95990de60416de893ab1d",
  "00119_f3_01_core_ledger_foundation.sql":
    "5e03111ffb34be3ed76a714370c93e70210a9741a25ac7b9158a9a9ad22f12f4",
  "00120_f3_02_secure_posting_idempotency.sql":
    "35eba6966d2c077a9467f09adc6c85306b951c9d8388ee758a60d924c05ae51a",
  "00121_f3_03_projection_read_proof.sql":
    "8f65797949d8c5afb7dfa99b8020da52385347099b2a5b9be5148b253e76bde6",
  "00122_f3_04_correction_reversal.sql":
    "6e3240759aec64d4692422aac006b4fb865e3039832be84efea86b39c0253175",
  "00123_f3_05_opening_cash_command.sql":
    "d5e50fd760a9629bf4e1574fd256ecf0d4a108df83dec27323a608e0466dcb34",
});
// Required partition table (founder pin). Reproduced from PG 17.6 structured records — not used as sole authority.
const REQUIRED_PARTITION_TABLE = Object.freeze({
  "00118_f3_bounded_financial_epoch_foundation.sql": { total:21, internal_fk:20, ordinary_user:1, user_defined_constraint:0, referencing:10, referenced:10 },
  "00119_f3_01_core_ledger_foundation.sql": { total:101, internal_fk:92, ordinary_user:7, user_defined_constraint:2, referencing:46, referenced:46 },
  "00120_f3_02_secure_posting_idempotency.sql": { total:108, internal_fk:96, ordinary_user:9, user_defined_constraint:3, referencing:48, referenced:48 },
  "00121_f3_03_projection_read_proof.sql": { total:108, internal_fk:96, ordinary_user:9, user_defined_constraint:3, referencing:48, referenced:48 },
  "00122_f3_04_correction_reversal.sql": { total:131, internal_fk:116, ordinary_user:11, user_defined_constraint:4, referencing:58, referenced:58 },
  "00123_f3_05_opening_cash_command.sql": { total:140, internal_fk:124, ordinary_user:12, user_defined_constraint:4, referencing:62, referenced:62 },
});
const CLAIMED_TRIGGER_COUNTS = REQUIRED_PARTITION_TABLE;

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
  REPRODUCED_TRIGGER_PARTITION_EXPECTATIONS,
  reproduceTriggerPartitionsFromFingerprint,
  reconcileTriggerPartitions,
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
    `f3_reference_catalog_v5_${String(label || "suite").replace(/[^a-z0-9_]/gi, "_").slice(0, 18)}_${process.pid}`;
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
  "/workspace/f3-catalog-v5-remediate-20260915/original-envelope/platform-acl-envelope.canonical.json",
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
  const cloudSha = CLOUD_AGENT_V5[file];

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
    cloudAgentV5Sha256: cloudSha,
    sealHelperSha256: sealSha,
  });

  builderVsRef[file] = {
    equal: equalBuilderRef && equalPrimaryIndependent,
    builder_sha256: builderSha,
    primary_sha256: primarySha,
    reference_sha256: referenceSha,
    seal_helper_sha256: sealSha,
    tip_embedded_sha256: tipSha,
    cloud_agent_v5_sha256: cloudSha,
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


// Trigger universe + V5 self-FK RI role partitions + per-trigger defer flags
// Partitions MUST be reproduced from PG 17.6 structured records (not hardcoded-as-authority).
const triggerUniverseProof = {};
const partitionProof = {};
let triggerUniverseOk = true;
let partitionsReconcileOk = true;
let selfFkRolesOk = true;

function classifyRiFunctionRole(functionName) {
  const name = String(functionName || "");
  const match = /^RI_FKey_(check|noaction|restrict|cascade|setnull|setdefault)_(ins|upd|del)$/.exec(name);
  if (!match) return null;
  const family = match[1];
  const suffix = match[2];
  if (family === "check" && (suffix === "ins" || suffix === "upd")) return "referencing_action";
  if (["noaction", "restrict", "cascade", "setnull", "setdefault"].includes(family)
      && (suffix === "upd" || suffix === "del")) return "referenced_action";
  return null;
}

for (const file of F3_FORWARD_FILES) {
  const required = REQUIRED_PARTITION_TABLE[file];
  const tipUniverse = F3_FK_TRIGGER_UNIVERSE_BY_MIGRATION[file];
  const tipExpect = REPRODUCED_TRIGGER_PARTITION_EXPECTATIONS[file];
  const indFp = JSON.parse(fs.readFileSync(path.join(OUT, `independent/verify-${file}.json`), "utf8"));
  const primFp = JSON.parse(fs.readFileSync(path.join(OUT, `primary/verify-${file}.json`), "utf8"));

  // Reproduce partitions from live 17.6 structured records (independent + primary)
  const indParts = reproduceTriggerPartitionsFromFingerprint(indFp);
  const primParts = reproduceTriggerPartitionsFromFingerprint(primFp);
  const enumerated = enumerateFkConstraintTriggerUniverse(indFp);

  const reproduced = {
    total: indParts.total,
    internal_fk: indParts.internal_fk,
    ordinary_user: indParts.ordinary_user,
    user_defined_constraint: indParts.user_defined_constraint,
    referencing: indParts.referencing,
    referenced: indParts.referenced,
  };

  const matchRequired =
    reproduced.total === required.total &&
    reproduced.internal_fk === required.internal_fk &&
    reproduced.ordinary_user === required.ordinary_user &&
    reproduced.user_defined_constraint === required.user_defined_constraint &&
    reproduced.referencing === required.referencing &&
    reproduced.referenced === required.referenced;

  const matchTipExpect =
    tipExpect &&
    tipExpect.total === required.total &&
    tipExpect.internal_fk === required.internal_fk &&
    tipExpect.ordinary_user === required.ordinary_user &&
    tipExpect.user_defined_constraint === required.user_defined_constraint &&
    tipExpect.referencing === required.referencing &&
    tipExpect.referenced === required.referenced;

  const internalFkEqualsRefPlusRefd = reproduced.internal_fk === reproduced.referencing + reproduced.referenced;
  const primaryIndependentPartitionsEqual =
    primParts.ok === true &&
    indParts.ok === true &&
    primParts.total === indParts.total &&
    primParts.internal_fk === indParts.internal_fk &&
    primParts.ordinary_user === indParts.ordinary_user &&
    primParts.user_defined_constraint === indParts.user_defined_constraint &&
    primParts.referencing === indParts.referencing &&
    primParts.referenced === indParts.referenced;

  // Self-FK RI roles via RI function (NOT relation equality):
  // check_ins/upd => referencing; noaction_upd/restrict_del (and siblings) => referenced
  const roleChecks = [];
  let roleOk = true;
  for (const row of indFp.triggers || []) {
    if (!(row?.tgisinternal === true && row?.constraint_association === true && row?.constraint_type === "f")) {
      continue;
    }
    const viaFn = classifyRiFunctionRole(row.function_name);
    const observed = row.action_role;
    const ok = viaFn != null && viaFn === observed;
    if (!ok) roleOk = false;
    // Sample self-FK cases where referencing_relation === referenced_relation
    const isSelfFk =
      row.referencing_schema &&
      row.referenced_schema &&
      row.referencing_schema === row.referenced_schema &&
      row.referencing_relation === row.referenced_relation;
    if (isSelfFk || roleChecks.length < 8) {
      roleChecks.push({
        function_name: row.function_name,
        action_role_observed: observed,
        action_role_via_ri_function: viaFn,
        is_self_fk: !!isSelfFk,
        // Prove classification is NOT relation equality:
        owning_eq_referencing:
          `${row.schema}.${row.relation}` === `${row.referencing_schema}.${row.referencing_relation}`,
        referencing_eq_referenced:
          `${row.referencing_schema}.${row.referencing_relation}` ===
          `${row.referenced_schema}.${row.referenced_relation}`,
        ok,
      });
    }
  }
  if (!roleOk) selfFkRolesOk = false;

  const deferFlagsOk = (indFp.triggers || []).every(
    (r) => typeof r.tgdeferrable === "boolean" && typeof r.tginitdeferred === "boolean"
      && !Object.prototype.hasOwnProperty.call(r, "deferrable")
      && !Object.prototype.hasOwnProperty.call(r, "initially_deferred"),
  );

  const requiredRefs = ["public.profiles", "public.groups", "public.organizations"];
  const tipRefs = tipUniverse?.referenced_side_relations || [];
  const obsRefs = enumerated.referenced_side_relations || [];
  const requiredPresent = requiredRefs.every((x) => tipRefs.includes(x) || obsRefs.includes(x));

  const row = {
    required_partition_table: required,
    reproduced_from_17_6_independent: reproduced,
    reproduced_from_17_6_primary: {
      total: primParts.total,
      internal_fk: primParts.internal_fk,
      ordinary_user: primParts.ordinary_user,
      user_defined_constraint: primParts.user_defined_constraint,
      referencing: primParts.referencing,
      referenced: primParts.referenced,
      ok: primParts.ok,
      reason: primParts.reason || null,
    },
    tip_embedded_expectations: tipExpect || null,
    match_required_partition_table: matchRequired,
    match_tip_expectations: !!matchTipExpect,
    internal_fk_equals_referencing_plus_referenced: internalFkEqualsRefPlusRefd,
    primary_independent_partitions_equal: primaryIndependentPartitionsEqual,
    partitions_ok: indParts.ok === true && primParts.ok === true,
    self_fk_ri_roles_via_function_ok: roleOk,
    self_fk_ri_role_samples: roleChecks.slice(0, 24),
    tip_universe_counts: tipUniverse
      ? {
          total: tipUniverse.total,
          internal_fk: tipUniverse.internal_fk,
          ordinary_user: tipUniverse.ordinary_user,
          user_defined_constraint: tipUniverse.user_defined_constraint,
          referencing: tipUniverse.referencing_action,
          referenced: tipUniverse.referenced_action,
          referenced_side_relations: tipUniverse.referenced_side_relations,
        }
      : null,
    enumerated,
    referenced_side_observed: obsRefs,
    required_referenced_side_present: requiredPresent,
    per_trigger_tgdeferrable_tginitdeferred: deferFlagsOk,
    primary_trigger_count: (primFp.triggers || []).length,
    independent_trigger_count: (indFp.triggers || []).length,
  };

  if (
    !row.match_required_partition_table ||
    !row.match_tip_expectations ||
    !row.internal_fk_equals_referencing_plus_referenced ||
    !row.primary_independent_partitions_equal ||
    !row.partitions_ok ||
    !row.self_fk_ri_roles_via_function_ok ||
    !row.required_referenced_side_present ||
    !row.per_trigger_tgdeferrable_tginitdeferred
  ) {
    triggerUniverseOk = false;
    partitionsReconcileOk = false;
  }

  triggerUniverseProof[file] = row;
  partitionProof[file] = {
    required,
    reproduced,
    match: matchRequired,
    internal_fk_sum_ok: internalFkEqualsRefPlusRefd,
  };
}
writeJson("trigger-universe-proof.json", triggerUniverseProof);
writeJson("partition-table-reproduced.json", partitionProof);
writeJson("self-fk-ri-roles-proof.json", {
  ok: selfFkRolesOk,
  method: "RI_FKey function family+suffix (check_ins/upd=>referencing; noaction/restrict/cascade/setnull/setdefault_upd/del=>referenced)",
  not_relation_equality: true,
});

writeJson("d692-d802-supersession.json", {
  CATALOG_V3_00123_SUPERSESSION,
  CATALOG_V3_00123_HASH_D692,
  CATALOG_V3_00123_HASH_D802,
  both_superseded_by_v4: CATALOG_V3_00123_SUPERSESSION.both_superseded_by_v4 === true,
  both_superseded_by_v5: CATALOG_V3_00123_SUPERSESSION.both_superseded_by_v5 === true,
  v5_00123: CLOUD_AGENT_V5["00123_f3_05_opening_cash_command.sql"],
});

verifyDb.close();
try {
  fs.rmSync(workdir, { recursive: true, force: true });
} catch { /* ignore */ }

writeJson("independent-hashes.json", independentHashes);
writeJson("tip-embedded-hashes.json", tipEmbedded);
writeJson("cloud-agent-v5-expected-hashes.json", CLOUD_AGENT_V5);
writeJson("builder-vs-reference.json", builderVsRef);

const ready =
  sealed.ok === true &&
  sealed.independentAgrees === true &&
  allEqual === true &&
  allMatchTip === true &&
  allMatchCloud === true &&
  triggerUniverseOk === true &&
  partitionsReconcileOk === true &&
  selfFkRolesOk === true &&
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
      x.schema_version_primary === "f3-full-catalog-v5" &&
      x.schema_version_independent === "f3-full-catalog-v5" &&
      (x.missingKeys?.length ?? 0) === 0 &&
      (x.extraKeys?.length ?? 0) === 0 &&
      (x.unequalKeys?.length ?? 0) === 0,
  );

const holdReasons = [];
if (!allMatchCloud) {
  holdReasons.push("17.6_recompute_or_tip_ne_cloud_v5_founder_pin");
}
if (!triggerUniverseOk) holdReasons.push("trigger_universe_or_partition_or_self_fk_ri_or_tgdefer_mismatch");
if (!partitionsReconcileOk) holdReasons.push("partitions_fail_to_reconcile_with_required_table");
if (!selfFkRolesOk) holdReasons.push("self_fk_ri_roles_not_via_ri_function");
if (!allMatchTip) holdReasons.push("17.6_recompute_ne_tip_embedded");
if (!allEqual) holdReasons.push("builder_ne_independent_or_structured_mismatch");
if (!sealed.ok) holdReasons.push("seal_not_ok");
if (!moduleProof.match) holdReasons.push("module_sha_mismatch");
if (!envelopeProof.match) holdReasons.push("envelope_mismatch");
if (!closureProof.closure_complete) holdReasons.push("closure_incomplete");

const tipHashesMatch176 = allMatchTip && allEqual;
const cloudHashesMatch176 = allMatchCloud && allEqual;
let localVerdict;
if (!allEqual || !partitionsReconcileOk || !selfFkRolesOk) {
  localVerdict = "HOLD";
} else if (tipHashesMatch176 && cloudHashesMatch176) {
  localVerdict = "READY_TO_FF";
} else if (allEqual && partitionsReconcileOk) {
  localVerdict = "OFFLINE_RESEAL_REQUIRED";
} else {
  localVerdict = "HOLD";
}

writeJson("verify-complete.json", {
  all_builder_eq_reference: allEqual,
  all_tip_eq_independent: allMatchTip,
  all_cloud_eq_independent: allMatchCloud,
  trigger_universe_ok: triggerUniverseOk,
  partitions_reconcile_ok: partitionsReconcileOk,
  self_fk_ri_roles_ok: selfFkRolesOk,
  local_verdict: localVerdict,
  ready_candidate: ready && localVerdict === "READY_TO_FF",
  hold_reasons: holdReasons,
  independent_hashes: independentHashes,
  tip_embedded: tipEmbedded,
  cloud_agent_v5: CLOUD_AGENT_V5,
  required_partition_table: REQUIRED_PARTITION_TABLE,
  trigger_universe: triggerUniverseProof,
  note_17_11_must_recollect_on_17_6: true,
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
      cloud_agent_v5: CLOUD_AGENT_V5,
      envelope_ok: envelopeProof.match,
      module_ok: moduleProof.match,
      ready_candidate: ready && localVerdict === "READY_TO_FF",
      local_verdict: localVerdict,
      hold_reasons: holdReasons,
      partitions_reconcile_ok: partitionsReconcileOk,
      self_fk_ri_roles_ok: selfFkRolesOk,
    },
    null,
    2,
  ),
);

process.exit(ready && localVerdict === "READY_TO_FF" ? 0 : (localVerdict === "OFFLINE_RESEAL_REQUIRED" ? 2 : 1));
