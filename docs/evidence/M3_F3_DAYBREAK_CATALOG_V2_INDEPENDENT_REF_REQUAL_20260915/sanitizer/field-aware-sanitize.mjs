/**
 * Field-aware sanitizer for Daybreak evidence.
 * May redact only genuine secrets/transport fields.
 * MUST NOT alter semantic ACL/fingerprint/catalog/migration identity fields.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const SEMANTIC_KEY_DENYLIST_FOR_REDACTION = new Set([
  "role",
  "roles",
  "grantee",
  "grantor",
  "owner",
  "owners",
  "privilege",
  "privileges",
  "grantable",
  "is_grantable",
  "schema",
  "schemaname",
  "object_name",
  "object_type",
  "relname",
  "proname",
  "policy",
  "policies",
  "policy_name",
  "using",
  "with_check",
  "definition",
  "definitions",
  "type",
  "types",
  "migration_version",
  "migration_name",
  "migration_digest",
  "migration_file",
  "migration_source_label",
  "digest",
  "digests",
  "sha256",
  "fingerprint",
  "recognition",
  "schema_version",
  "acl",
  "acls",
  "column_acl",
  "attacl",
  "tgenabled",
  "service_role",
  "expected",
  "observed",
  "hgp",
  "rls",
  "routines",
  "relations",
  "columns",
  "constraints",
  "indexes",
  "triggers",
  "function_owner",
  "prokind",
  "identity_arguments",
  "functiondef",
]);

const SECRET_KEY_ALLOWLIST = new Set([
  "password",
  "passwd",
  "db_password",
  "postgres_password",
  "jwt",
  "token",
  "access_token",
  "refresh_token",
  "api_key",
  "apikey",
  "authorization",
  "service_role_key", // transport secret key material — NOT the role name service_role
  "anon_key",
  "secret",
  "connection_string",
  "database_url",
  "direct_url",
  "db_url",
  "url", // only when value looks like connection URL
]);

const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const CONN_RE = /postgres(?:ql)?:\/\/[^\s"'\\]+/gi;
const ABS_PATH_RE = /(?:^|[\s"'=])(\/(?:home|workspace|tmp|var|Users)\/[^\s"']+)/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const API_KEY_RE = /(?:sb_publishable_|sb_secret_|sk_live_|sk_test_)[A-Za-z0-9_-]+/g;

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function isSemanticKey(key) {
  if (!key) return false;
  const k = String(key);
  if (SEMANTIC_KEY_DENYLIST_FOR_REDACTION.has(k)) return true;
  if (k === "service_role") return true; // role identity
  if (/^(expected_|observed_|fingerprint)/.test(k)) return true;
  return false;
}

function looksLikeSecretValue(v) {
  if (typeof v !== "string") return false;
  if (JWT_RE.test(v)) { JWT_RE.lastIndex = 0; return true; }
  if (CONN_RE.test(v)) { CONN_RE.lastIndex = 0; return true; }
  if (BEARER_RE.test(v)) { BEARER_RE.lastIndex = 0; return true; }
  if (API_KEY_RE.test(v)) { API_KEY_RE.lastIndex = 0; return true; }
  return false;
}

function redactString(s, counts) {
  let out = s;
  const repl = (re, type) => {
    out = out.replace(re, () => {
      counts[type] = (counts[type] || 0) + 1;
      return "[REDACTED]";
    });
  };
  repl(JWT_RE, "jwt");
  repl(CONN_RE, "connection_url");
  repl(BEARER_RE, "bearer_token");
  repl(API_KEY_RE, "api_key");
  // absolute paths only when not inside digest-looking hex-only strings
  out = out.replace(ABS_PATH_RE, (full, p) => {
    counts.absolute_path = (counts.absolute_path || 0) + 1;
    return full.replace(p, "[REDACTED_PATH]");
  });
  return out;
}

/**
 * Walk JSON. Never redact values under semantic keys.
 * Redact secret-keyed values and secret-shaped free strings elsewhere.
 */
export function sanitizeJsonValue(value, counts = {}, pathKeys = []) {
  if (value == null) return value;
  if (typeof value === "string") {
    const leafKey = pathKeys[pathKeys.length - 1];
    if (isSemanticKey(leafKey)) {
      // Never touch semantic leaf strings — even if they look like tokens
      if (value.includes("[REDACTED]")) {
        counts.semantic_redacted_detected = (counts.semantic_redacted_detected || 0) + 1;
      }
      return value;
    }
    if (leafKey && SECRET_KEY_ALLOWLIST.has(String(leafKey).toLowerCase())) {
      if (leafKey.toLowerCase() === "url" && !looksLikeSecretValue(value) && !/postgres/i.test(value)) {
        return value;
      }
      counts[String(leafKey).toLowerCase()] = (counts[String(leafKey).toLowerCase()] || 0) + 1;
      return "[REDACTED]";
    }
    return redactString(value, counts);
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => sanitizeJsonValue(v, counts, pathKeys.concat(String(i))));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (isSemanticKey(k)) {
        // Deep-copy semantic subtrees WITHOUT redaction
        out[k] = structuredClone ? structuredClone(v) : JSON.parse(JSON.stringify(v));
        // But still scan for accidental [REDACTED] in semantic subtree
        const blob = JSON.stringify(out[k]);
        if (blob && blob.includes("[REDACTED]")) {
          counts.semantic_subtree_redacted_detected =
            (counts.semantic_subtree_redacted_detected || 0) + 1;
        }
      } else {
        out[k] = sanitizeJsonValue(v, counts, pathKeys.concat(k));
      }
    }
    return out;
  }
  return value;
}

export function sanitizeText(text, extraSecrets = [], counts = {}) {
  let out = String(text ?? "");
  for (const s of extraSecrets.filter(Boolean)) {
    if (!s) continue;
    const parts = out.split(String(s));
    if (parts.length > 1) {
      counts.explicit_secret = (counts.explicit_secret || 0) + (parts.length - 1);
      out = parts.join("[REDACTED]");
    }
  }
  out = redactString(out, counts);
  return out;
}

export function sanitizeArtifact({ inputPath, outputPath, extraSecrets = [], semantic = false }) {
  const raw = fs.readFileSync(inputPath);
  const preSha = sha256(raw);
  const counts = {};
  let outBuf;
  let semanticByteEqual = null;
  if (semantic) {
    // Semantic artifact: must remain byte-identical (no sanitization)
    outBuf = raw;
    semanticByteEqual = true;
    if (raw.includes(Buffer.from("[REDACTED]"))) {
      counts.semantic_redacted_detected = 1;
    }
  } else if (String(inputPath).endsWith(".json")) {
    try {
      const parsed = JSON.parse(raw.toString("utf8"));
      const sanitized = sanitizeJsonValue(parsed, counts);
      outBuf = Buffer.from(JSON.stringify(sanitized, null, 2) + "\n", "utf8");
    } catch {
      outBuf = Buffer.from(sanitizeText(raw.toString("utf8"), extraSecrets, counts), "utf8");
    }
  } else {
    outBuf = Buffer.from(sanitizeText(raw.toString("utf8"), extraSecrets, counts), "utf8");
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, outBuf);
  const postSha = sha256(outBuf);
  return {
    inputPath,
    outputPath,
    pre_sha256: preSha,
    post_sha256: postSha,
    byte_equal: preSha === postSha,
    semantic,
    semantic_byte_equal: semanticByteEqual,
    redaction_counts: counts,
    total_redactions: Object.values(counts).reduce((a, b) => a + (typeof b === "number" ? b : 0), 0),
  };
}

export function buildSanitizationManifest(entries) {
  const semanticChanged = entries.filter((e) => e.semantic && !e.byte_equal);
  const semanticRedacted = entries.filter(
    (e) => (e.redaction_counts?.semantic_redacted_detected || 0) > 0 ||
      (e.redaction_counts?.semantic_subtree_redacted_detected || 0) > 0,
  );
  const byType = {};
  for (const e of entries) {
    for (const [k, v] of Object.entries(e.redaction_counts || {})) {
      byType[k] = (byType[k] || 0) + v;
    }
  }
  return {
    artifact: "sanitization-manifest",
    policy:
      "credentials/tokens/connection URLs/API keys/absolute machine paths ONLY; never role names, service_role ACL grantee, grantors, owners, schema/object identities, migration versions/names/digests, privileges, policy expressions, definitions, types, catalog fields, fingerprint values",
    entries,
    redaction_count_by_type: byType,
    semantic_artifacts_changed: semanticChanged.length,
    semantic_redacted_inside_digest_bearing: semanticRedacted.length,
    hold_required: semanticChanged.length > 0 || semanticRedacted.length > 0,
    redacted_nonsemantic_fields: Object.keys(byType).filter(
      (k) => !k.startsWith("semantic_"),
    ),
  };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("field-aware-sanitize.mjs")) {
  const args = process.argv.slice(2);
  if (args[0] === "self-test") {
    const sample = {
      acl: [{ grantee: "service_role", grantor: "postgres", privilege: "SELECT" }],
      migration_digest: "bb823ebdddcefba7774f3347a609a05393d9a67c9430d0bd925c3458eaf5efed",
      password: "super-secret",
      db_url: "postgresql://ubuntu:hunter2@127.0.0.1:55432/db",
      note: "path /workspace/foo and token eyJhbGciOiJIUzI1NiJ9.aaa.bbb",
    };
    const counts = {};
    const out = sanitizeJsonValue(sample, counts);
    const ok =
      out.acl[0].grantee === "service_role" &&
      out.migration_digest.startsWith("bb823") &&
      out.password === "[REDACTED]" &&
      out.db_url === "[REDACTED]" &&
      !JSON.stringify(out.acl).includes("[REDACTED]");
    console.log(JSON.stringify({ ok, counts, out }, null, 2));
    process.exit(ok ? 0 : 1);
  }
}
