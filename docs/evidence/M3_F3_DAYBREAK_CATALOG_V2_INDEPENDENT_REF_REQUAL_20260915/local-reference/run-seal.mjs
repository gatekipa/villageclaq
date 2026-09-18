/**
 * Phase E — PG 17.6 re-verify for catalog-v2 + independent reference tip 019321b4.
 * Isolated to local Docker f3-reference-pg176 @ 127.0.0.1:55432.
 * Never contacts hosted disposable or production.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const TIP = "/workspace/f3-remediate-daybreak-20260915/tip-extract";
const OUT = "/workspace/f3-remediate-daybreak-20260915/phase-b-17.6";
const SEAL_DB = "f3_reference_catalog_v2_20260915";
const ENVELOPE_DIGEST =
  "eb58900b492b95371decfdab86b3786afc2c8089c6b0a117497f9e0b22c41a2a";
const EXPECTED_MODULE_SHA =
  "de4ed3fd1f79103cb85591209246e0dbd2194d0f5adbc2a6c82497fe83449c3f";
const CLOUD_AGENT_V2 = Object.freeze({
  "00118_f3_bounded_financial_epoch_foundation.sql":
    "903235f58c9b1b1ed8217edf3c23a3eea570230c614e45aab712989618a773bf",
  "00119_f3_01_core_ledger_foundation.sql":
    "6dd0e4702cc824fa811fcac3d760583bdb810a04910b9d3d7bb098eaf0d2f6cd",
  "00120_f3_02_secure_posting_idempotency.sql":
    "d94a0a091f5a177fb0bcc00a1e47945e771c8f33c89d9560d60784a3cc0d08c2",
  "00121_f3_03_projection_read_proof.sql":
    "aa0dcf787befffd5ef3a3ee6a2a7271c9fce31610b34d9000f698fe82c9b8f9c",
  "00122_f3_04_correction_reversal.sql":
    "80c1b264c3b50dd3fbc5f7c21145fe96cd9cf099415d9ae7ce3210ed087219be",
  "00123_f3_05_opening_cash_command.sql":
    "f287f559f875d64dd1856ac312214c08ad0438ff502f812b80c67c19fe982baa",
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
} = await import(path.join(TIP, "scripts/lib/f3-db-push-repair-safety-gate.mjs"));

const {
  collectIndependentFullCatalogReference,
  compareIndependentStructuredOutputs,
  independentlyNormalizeCatalog,
  INDEPENDENT_REFERENCE_MODULE_RELPATH,
} = await import(path.join(TIP, "scripts/lib/f3-full-catalog-independent-reference.mjs"));

const { F3_FORWARD_FILES, RECOGNITION_ALLOWLIST, FROZEN_DIGESTS, PREASSIGNED_VERSIONS } =
  await import(path.join(TIP, "scripts/lib/f3-db-push-pins.mjs"));

const { psql, psqlFile, psqlAdmin } = await import(
  path.join(TIP, "scripts/fixtures/disposable-postgres.mjs")
);
const { LOCAL_TCP_PASSWORD } = await import(
  path.join(TIP, "scripts/lib/f3-local-connection-guard.mjs")
);

// Prefer reference-local.env user for isolation proof; tip seal also works via ubuntu+LOCAL_TCP.
// Use ubuntu URL because tip floor/seal expects OWNER ubuntu + SET ROLE postgres patterns.
const ADMIN_URL = `postgresql://ubuntu:${encodeURIComponent(LOCAL_TCP_PASSWORD)}@127.0.0.1:55432/postgres`;
assertOracleUrl(ADMIN_URL);

// Also prove f3_ref_oracle from reference-local.env can connect (isolation gate)
{
  const refUrl = `postgresql://${encodeURIComponent(REF_ENV.PGUSER)}:${encodeURIComponent(REF_ENV.POSTGRES_PASSWORD)}@127.0.0.1:55432/postgres`;
  assertOracleUrl(refUrl);
  const check = spawnSync(
    "psql",
    [refUrl, "-v", "ON_ERROR_STOP=1", "-tAc", "SELECT current_user || '|' || inet_server_port();"],
    { encoding: "utf8" },
  );
  if (check.status !== 0 || !String(check.stdout).includes("55432") && !String(check.stdout).includes(REF_ENV.PGUSER)) {
    // port may not show via inet_server_port the same way — just require success + user
    if (check.status !== 0 || !String(check.stdout).includes(REF_ENV.PGUSER)) {
      throw new Error(`REFUSE: reference-local.env user cannot connect: ${check.stderr || check.stdout}`);
    }
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
    `f3_reference_catalog_v2_${String(label || "suite").replace(/[^a-z0-9_]/gi, "_").slice(0, 18)}_${process.pid}`;
  const name = raw.toLowerCase().slice(0, 63);
  if (!name.startsWith("f3_reference_catalog_v2")) {
    throw new Error("work db must start with f3_reference_catalog_v2");
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
        note: "Fresh f3_reference_catalog_v2_* DB on SAME 17.6 container; platform ACL envelope + stub+live-pin floor + 00117 + 00118-23",
        preexisting_oracle_untouched: "f3_reference_oracle_20260915",
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

// --- Envelope proofs ---
const origCanon = fs.readFileSync(
  "/workspace/f3-remediate-daybreak-20260915/original-envelope/platform-acl-envelope.canonical.json",
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

console.log(
  JSON.stringify({
    phase: "start_seal",
    target: "127.0.0.1:55432",
    pg: "17.6",
    seal_db: SEAL_DB,
    envelope_ok: envelopeProof.match,
    module_ok: moduleProof.match,
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

// Publish FULL primary + independent structured outputs for all six
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
  process.exitCode = sealed.status === "NOT_RUN" ? 2 : 1;
  console.error("SEAL_FAILED", sealed.status, sealed.reason);
  process.exit(process.exitCode);
}

// --- Second independent pass on a fresh verify DB (belt + suspenders) ---
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

  // Primary path via CATALOG_FINGERPRINT_SQL + builder
  const raw = applySqlAsPostgresRole(verifyDb.url, CATALOG_FINGERPRINT_SQL);
  const catalog = JSON.parse(String(raw || "").trim());
  const primaryFp = buildIndependentObservedFingerprint(file, catalog);
  const primarySha = fingerprintCanonicalSha256(primaryFp);

  // Independent collector
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
  const cloudSha = CLOUD_AGENT_V2[file];

  const equalBuilderRef = builderSha != null && builderSha === referenceSha;
  const equalPrimaryIndependent = compared.ok === true && primarySha === referenceSha;
  const equalSealIndependent = sealSha === referenceSha;
  const equalTipIndependent = tipSha === referenceSha;
  const equalCloudIndependent = cloudSha === referenceSha;
  if (!equalBuilderRef || !equalPrimaryIndependent || !equalSealIndependent) allEqual = false;
  if (!equalTipIndependent) allMatchTip = false;
  if (!equalCloudIndependent) allMatchCloud = false;

  // Publish verify-pass full structured (supersedes if seal already wrote; keep both)
  writeJson(`primary/verify-${file}.json`, primaryFp);
  writeJson(`independent/verify-${file}.json`, independent.fingerprint);
  writeJson(`comparisons/${file}.json`, {
    ...compared,
    primarySha256: primarySha,
    independentSha256: referenceSha,
    builderSha256: builderSha,
    tipEmbeddedSha256: tipSha,
    cloudAgentV2Sha256: cloudSha,
    sealHelperSha256: sealSha,
  });

  builderVsRef[file] = {
    equal: equalBuilderRef && equalPrimaryIndependent,
    builder_sha256: builderSha,
    primary_sha256: primarySha,
    reference_sha256: referenceSha,
    seal_helper_sha256: sealSha,
    tip_embedded_sha256: tipSha,
    cloud_agent_v2_sha256: cloudSha,
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

verifyDb.close();
try {
  fs.rmSync(workdir, { recursive: true, force: true });
} catch { /* ignore */ }

writeJson("independent-hashes.json", independentHashes);
writeJson("tip-embedded-hashes.json", tipEmbedded);
writeJson("cloud-agent-v2-expected-hashes.json", CLOUD_AGENT_V2);
writeJson("builder-vs-reference.json", builderVsRef);

const ready =
  sealed.ok === true &&
  sealed.independentAgrees === true &&
  allEqual === true &&
  allMatchTip === true &&
  allMatchCloud === true &&
  envelopeProof.match === true &&
  envelopeProof.original_has_REDACTED === false &&
  envelopeProof.tip_envelope_has_REDACTED === false &&
  moduleProof.match === true &&
  Object.values(builderVsRef).every(
    (x) =>
      Array.isArray(x.recognition_reference) &&
      x.recognition_reference.length === 1 &&
      x.recognition_reference[0] === "manual_income" &&
      x.schema_version_primary === "f3-full-catalog-v2" &&
      x.schema_version_independent === "f3-full-catalog-v2",
  );

writeJson("verify-complete.json", {
  all_builder_eq_reference: allEqual,
  all_tip_eq_independent: allMatchTip,
  all_cloud_eq_independent: allMatchCloud,
  ready_candidate: ready,
  independent_hashes: independentHashes,
  tip_embedded: tipEmbedded,
  cloud_agent_v2: CLOUD_AGENT_V2,
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
      envelope_ok: envelopeProof.match,
      module_ok: moduleProof.match,
      ready_candidate: ready,
    },
    null,
    2,
  ),
);

process.exit(ready ? 0 : 1);
