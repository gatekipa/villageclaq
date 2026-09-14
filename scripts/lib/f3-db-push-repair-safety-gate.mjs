/**
 * Repair-safety gate for the db-push qualification sequence.
 *
 * Repair may spawn ONLY after every required proof is true. Any miss,
 * malformed value, ambiguity, or exception → poison cleanup only (when
 * safe); no repair; no next migration; no continuation.
 *
 * Object presence is accepted only by strict structured JSON probe parse.
 * Fingerprints require expected+observed complete-schema canonical equality.
 * Poison must be proven absent by a separate post-cleanup probe before repair.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPROVED_DISPOSABLE_HOST,
  APPROVED_DISPOSABLE_ORG_ID,
  APPROVED_DISPOSABLE_PROJECT_NAME,
  APPROVED_DISPOSABLE_PROJECT_REF,
  CLI_PIN,
  F3_FORWARD_FILES,
  FROZEN_DIGESTS,
  HISTORY_INJECT_MARKER,
  PREASSIGNED_NAMES,
  PREASSIGNED_VERSIONS,
  PRODUCTION_REF,
  RECOGNITION_ALLOWLIST,
  TARGET_OBJECT_PROBES,
} from "./f3-db-push-pins.mjs";
import {
  sha256Buffer,
  sourceFileForVersion,
  timestampFilenameFor,
} from "./f3-db-push-version-map.mjs";
import { extractPsqlErrorLines } from "./f3-db-push-stub-live-pin-floor.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export const REPAIR_SAFETY_HOLD =
  "HOLD: repair-safety gate failed; poison cleaned; repair not spawned; no continuation";

export const PREFIX_COMPLETE_SINGLE_PENDING_HOLD =
  "HOLD: prefix-complete single-pending staging preflight failed; db push not spawned; repair not spawned";

export const PRODUCTION_HISTORY_LIMITATION_WARNING =
  "WARNING: disposable proves prefix-complete staging for F3 qualification history only. Before any production db push, a separately authorized read-only production preflight must prove every production-recorded migration has an authoritative local timestamp file, frozen SQL digest, and order. Empty placeholders and guessed history are forbidden. Do not invent production migrations.";

export const FINGERPRINT_REQUIRED_KEYS = Object.freeze([
  "schema",
  "function_owner",
  "acl",
  "policy",
]);

/** Catalog fields that, if present on either side, must exist on both and match exactly. */
export const FINGERPRINT_OPTIONAL_CATALOG_KEYS = Object.freeze([
  "rls",
  "owner",
  "function_definition",
  "search_path",
  "hgp_pin",
  "hgp",
  "enqueue",
  "object_identity",
  "f3_objects_absent",
]);

export const FINGERPRINT_CATALOG_KEYS = Object.freeze([
  ...FINGERPRINT_REQUIRED_KEYS,
  ...FINGERPRINT_OPTIONAL_CATALOG_KEYS,
  "recognition",
]);

export const FINGERPRINT_META_KEYS = Object.freeze([
  "migration_file",
  "migration_version",
  "migration_name",
  "migration_digest",
  "recognition",
]);

export const FINGERPRINT_ALLOWED_KEYS = Object.freeze([
  ...new Set([...FINGERPRINT_REQUIRED_KEYS, ...FINGERPRINT_CATALOG_KEYS, ...FINGERPRINT_META_KEYS]),
]);

/**
 * Explicit field registry: ONLY these collections are set-canonicalized.
 * Collection order is semantically meaningless; associations stay intact.
 *
 * FORBIDDEN: generic recursive array sort; sorting identity_arguments /
 * table column order / migration history / staged prefix / SQL bodies;
 * splitting arbitrary catalog strings and sorting words; dropping fields;
 * subset comparisons; deriving expected from observed.
 */
export const FINGERPRINT_FIELD_REGISTRY = Object.freeze({
  schema: Object.freeze({
    kind: "record_set",
    fields: Object.freeze(["schema", "owner"]),
    sortBy: Object.freeze(["schema", "owner"]),
    innerSetFields: Object.freeze([]),
    doNotSort: Object.freeze([]),
    notes: "Schema inventory members are (schema, owner). Order of schemas is meaningless.",
  }),
  function_owner: Object.freeze({
    kind: "record_set",
    fields: Object.freeze([
      "schema",
      "function",
      "identity_arguments",
      "owner",
      "security_definer",
      "search_path",
    ]),
    sortBy: Object.freeze(["schema", "function", "identity_arguments", "owner"]),
    innerSetFields: Object.freeze([]),
    doNotSort: Object.freeze(["identity_arguments", "search_path"]),
    notes: "Complete function↔owner association. Owner-name multisets are not compared. identity_arguments are never reordered.",
  }),
  acl: Object.freeze({
    kind: "record_set",
    fields: Object.freeze([
      "object_type",
      "schema",
      "object_name",
      "prokind",
      "identity_arguments",
      "grantee",
      "grantor",
      "privilege",
      "grantable",
    ]),
    sortBy: Object.freeze([
      "object_type",
      "schema",
      "object_name",
      "identity_arguments",
      "grantee",
      "grantor",
      "privilege",
      "grantable",
    ]),
    innerSetFields: Object.freeze([]),
    doNotSort: Object.freeze(["identity_arguments", "object_name", "prokind"]),
    notes: "One record per privilege. Routine identity is schema+object_name+prokind+identity_arguments (never a comma-joined label). Canonicalization reorders complete records only. identity_arguments are never split or reordered.",
  }),
  policy: Object.freeze({
    kind: "record_set",
    fields: Object.freeze([
      "schema",
      "table",
      "policy_name",
      "command",
      "permissive",
      "roles",
      "using",
      "with_check",
    ]),
    sortBy: Object.freeze(["schema", "table", "policy_name", "command"]),
    innerSetFields: Object.freeze(["roles"]),
    doNotSort: Object.freeze(["using", "with_check"]),
    notes: "Roles are a set (order meaningless). USING / WITH CHECK expressions are never sorted or whitespace-normalized.",
  }),
  function_definition: Object.freeze({
    kind: "record_set_or_exact_string",
    fields: Object.freeze([
      "schema",
      "name",
      "identity_arguments",
      "definition",
      "owner",
      "security_mode",
      "search_path",
    ]),
    sortBy: Object.freeze(["schema", "name", "identity_arguments", "owner"]),
    innerSetFields: Object.freeze([]),
    doNotSort: Object.freeze(["identity_arguments", "definition", "search_path", "security_mode"]),
    notes: "Optional. String values compare exactly. Record arrays sort by identity only; definition/owner/search_path/security changes fail.",
  }),
  recognition: Object.freeze({
    kind: "exact_string_set",
    fields: Object.freeze([]),
    sortBy: Object.freeze([]),
    innerSetFields: Object.freeze([]),
    doNotSort: Object.freeze([]),
    notes: "Allowlist tags. Order meaningless. Exact strings only — never word-split.",
  }),
});

export const FINGERPRINT_CANONICALIZATION_REASON =
  "canonicalization format (comma-joined catalog strings → structured ACL identity by catalog fields + registry set-order); semantic members unchanged";

/**
 * Hosted catalog fingerprint query. Overrides floor CATALOG_FINGERPRINT_SQL
 * (comma-joined strings) so observed inventory is structured JSON records.
 * Same object filters as the floor query; representation only.
 *
 * Routine ACL identity is obtained by routine OID inside SQL:
 *   pg_namespace.nspname, pg_proc.proname, pg_proc.prokind,
 *   pg_get_function_identity_arguments(pg_proc.oid).
 * Those fields stay separate. identity_arguments are never concatenated
 * into a comma-bearing object_identity label and never parsed back.
 * ACL rows join to the owning object by OID, then explode with
 * aclexplode; grantee OID 0 is PUBLIC via pg_get_userbyid.
 * acldefault is the catalog default facility when a stored ACL is NULL;
 * this seal keeps NULL as an empty grant row so membership matches the
 * frozen stored-ACL contract (no invented default grants, no OIDs in
 * the fingerprint).
 */
export const CATALOG_FINGERPRINT_SQL = `
SELECT jsonb_build_object(
  'schema', (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'schema', nspname,
        'owner', pg_get_userbyid(nspowner)
      )
      ORDER BY nspname, pg_get_userbyid(nspowner)
    ), '[]'::jsonb)
    FROM pg_namespace
    WHERE nspname IN ('financial_core','financial_private')
  ),
  'function_owner', (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'function', p.proname,
        'identity_arguments', pg_get_function_identity_arguments(p.oid),
        'owner', pg_get_userbyid(p.proowner),
        'security_definer', p.prosecdef,
        'search_path', coalesce(p.proconfig::text, '')
      )
      ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), pg_get_userbyid(p.proowner)
    ), '[]'::jsonb)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public','financial_core','financial_private')
      AND (n.nspname LIKE 'financial_%' OR p.proname ~ 'financial|f3_|guard_ledger')
  ),
  'acl', (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'object_type', x.object_type,
        'schema', x.schema,
        'object_name', x.object_name,
        'prokind', x.prokind,
        'identity_arguments', x.identity_arguments,
        'grantee', x.grantee,
        'grantor', x.grantor,
        'privilege', x.privilege,
        'grantable', x.grantable
      )
      ORDER BY x.object_type, x.schema, x.object_name, x.identity_arguments, x.grantee, x.grantor, x.privilege, x.grantable::text
    ), '[]'::jsonb)
    FROM (
      SELECT
        'table'::text AS object_type,
        n.nspname AS schema,
        c.relname AS object_name,
        ''::text AS prokind,
        ''::text AS identity_arguments,
        CASE
          WHEN c.relacl IS NULL THEN ''
          WHEN a.grantee = 0 THEN 'PUBLIC'
          ELSE pg_get_userbyid(a.grantee)
        END AS grantee,
        CASE
          WHEN c.relacl IS NULL THEN ''
          ELSE pg_get_userbyid(a.grantor)
        END AS grantor,
        CASE
          WHEN c.relacl IS NULL THEN ''
          ELSE a.privilege_type
        END AS privilege,
        CASE
          WHEN c.relacl IS NULL THEN false
          ELSE a.is_grantable
        END AS grantable
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN LATERAL aclexplode(c.relacl) a ON c.relacl IS NOT NULL
      WHERE c.relkind = 'r'
        AND (
          n.nspname IN ('financial_core','financial_private')
          OR (n.nspname = 'public' AND c.relname LIKE 'financial_%')
        )
      UNION ALL
      SELECT
        'routine'::text,
        n.nspname,
        p.proname,
        p.prokind::text,
        pg_get_function_identity_arguments(p.oid),
        CASE
          WHEN p.proacl IS NULL THEN ''
          WHEN a.grantee = 0 THEN 'PUBLIC'
          ELSE pg_get_userbyid(a.grantee)
        END,
        CASE
          WHEN p.proacl IS NULL THEN ''
          ELSE pg_get_userbyid(a.grantor)
        END,
        CASE
          WHEN p.proacl IS NULL THEN ''
          ELSE a.privilege_type
        END,
        CASE
          WHEN p.proacl IS NULL THEN false
          ELSE a.is_grantable
        END
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      -- acldefault('f', proowner) is the catalog default when proacl is NULL.
      -- This seal does not expand those defaults: stored NULL stays an empty
      -- grant row so membership matches the frozen stored-ACL contract.
      LEFT JOIN LATERAL aclexplode(p.proacl) a ON p.proacl IS NOT NULL
      WHERE n.nspname IN ('public','financial_core','financial_private')
        AND (n.nspname LIKE 'financial_%' OR p.proname ~ 'financial|f3_|guard_ledger')
    ) x
  ),
  'policy', (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'schema', schemaname,
        'table', tablename,
        'policy_name', policyname,
        'command', cmd,
        'permissive', (upper(permissive) IN ('PERMISSIVE','YES','T','TRUE')),
        'roles', to_jsonb(roles),
        'using', coalesce(qual, ''),
        'with_check', coalesce(with_check, '')
      )
      ORDER BY schemaname, tablename, policyname, cmd
    ), '[]'::jsonb)
    FROM pg_policies
    WHERE schemaname IN ('public','financial_core','financial_private')
      AND (tablename LIKE 'financial_%' OR schemaname LIKE 'financial_%')
  ),
  'f3_objects_absent', (
    to_regnamespace('financial_private') IS NULL
    AND to_regnamespace('financial_core') IS NULL
    AND to_regclass('public.financial_ledger_epochs') IS NULL
    AND to_regclass('public.financial_accounts') IS NULL
    AND to_regprocedure('public.post_financial_command(jsonb)') IS NULL
    AND to_regprocedure('public.correct_financial_event(jsonb)') IS NULL
    AND to_regprocedure('public.post_financial_opening_cash(jsonb)') IS NULL
  )
)::text
`;

const ACL_PRIVILEGE_LETTERS = Object.freeze({
  a: "INSERT",
  r: "SELECT",
  w: "UPDATE",
  d: "DELETE",
  D: "TRUNCATE",
  x: "REFERENCES",
  t: "TRIGGER",
  X: "EXECUTE",
  U: "USAGE",
  C: "CREATE",
  c: "CONNECT",
  T: "TEMPORARY",
  m: "MAINTAIN",
  s: "SET",
});

function fingerprintCanonicalizationRejected(reason) {
  return Object.freeze({
    __f3_fingerprint_canonicalization_rejected: true,
    reason: String(reason || "canonicalization rejected"),
  });
}

function isFingerprintCanonicalizationRejected(value) {
  return Boolean(value && typeof value === "object" && value.__f3_fingerprint_canonicalization_rejected === true);
}

function compareCanonicalScalars(a, b) {
  if (a === b) return 0;
  const sa = a === null || a === undefined ? "" : typeof a === "boolean" ? (a ? "true" : "false") : String(a);
  const sb = b === null || b === undefined ? "" : typeof b === "boolean" ? (b ? "true" : "false") : String(b);
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
}

function compareRecordsByFields(a, b, fields) {
  for (const field of fields) {
    const cmp = compareCanonicalScalars(a?.[field], b?.[field]);
    if (cmp !== 0) return cmp;
  }
  return compareCanonicalScalars(JSON.stringify(a), JSON.stringify(b));
}

function recordsDeepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function canonicalizeRoleSet(roles) {
  if (Array.isArray(roles)) {
    return [...roles].map((role) => String(role)).sort(compareCanonicalScalars);
  }
  if (typeof roles === "string") {
    const trimmed = roles.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      const body = trimmed.slice(1, -1);
      if (!body) return [];
      return body.split(",").map((part) => part.trim()).filter((part) => part.length > 0).sort(compareCanonicalScalars);
    }
    return trimmed ? [trimmed] : [];
  }
  if (roles == null) return [];
  return fingerprintCanonicalizationRejected("policy roles are not a set of names");
}

function splitSchemaIdentity(identity) {
  const text = String(identity);
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "." && depth === 0) {
      return { schema: text.slice(0, i), object_label: text.slice(i + 1) };
    }
  }
  return null;
}

function matchingParenClose(text, openIndex) {
  if (openIndex < 0 || text[openIndex] !== "(") return -1;
  let depth = 0;
  for (let j = openIndex; j < text.length; j += 1) {
    if (text[j] === "(") depth += 1;
    else if (text[j] === ")") {
      depth -= 1;
      if (depth === 0) return j;
    }
  }
  return -1;
}

/**
 * Offline upgrade of a frozen-contract object label into structured identity.
 * Extracts the whole identity_arguments slice between matching parentheses.
 * Never splits or reconstructs arguments on commas. Display labels are not
 * stored; callers must not parse a generated label back into fingerprint data.
 */
function structuredAclIdentityFromLegacyLabel(label) {
  const text = String(label);
  const open = text.indexOf("(");
  if (open < 0) {
    return {
      ok: true,
      object_type: "table",
      object_name: text,
      prokind: "",
      identity_arguments: "",
    };
  }
  const close = matchingParenClose(text, open);
  if (close < 0) {
    return { ok: false, reason: "acl routine identity arguments are unbalanced" };
  }
  if (close !== text.length - 1) {
    return { ok: false, reason: "acl routine identity has trailing identity junk" };
  }
  return {
    ok: true,
    object_type: "routine",
    object_name: text.slice(0, open),
    prokind: "f",
    identity_arguments: text.slice(open + 1, close),
  };
}

function parseLegacySchema(value) {
  if (value === "") return { ok: true, records: [] };
  const records = [];
  for (const part of String(value).split(",")) {
    const item = part.trim();
    if (!item) continue;
    const colon = item.indexOf(":");
    if (colon <= 0) return { ok: false, reason: "schema member is not schema:owner" };
    records.push({
      schema: item.slice(0, colon),
      owner: item.slice(colon + 1),
    });
  }
  return { ok: true, records };
}

function parseLegacyFunctionOwner(value) {
  const text = String(value);
  const records = [];
  let i = 0;
  while (i < text.length) {
    while (text[i] === ",") i += 1;
    if (i >= text.length) break;
    const ident = splitSchemaIdentity(text.slice(i));
    if (!ident || !ident.schema || !ident.object_label) {
      return { ok: false, reason: "function_owner identity is not schema.function(args)" };
    }
    const start = ident.object_label.indexOf("(");
    const close = matchingParenClose(ident.object_label, start);
    if (close < 0) return { ok: false, reason: "function_owner identity arguments are unbalanced" };
    const functionName = ident.object_label.slice(0, start);
    const identityArguments = ident.object_label.slice(start + 1, close);
    const consumedIdentity = ident.schema.length + 1 + close + 1;
    i += consumedIdentity;
    if (text[i] !== ":") return { ok: false, reason: "function_owner missing owner separator" };
    i += 1;
    const ownerEnd = text.indexOf(":", i);
    if (ownerEnd < 0) return { ok: false, reason: "function_owner missing security separator" };
    const owner = text.slice(i, ownerEnd);
    i = ownerEnd + 1;
    const secEnd = text.indexOf(":", i);
    if (secEnd < 0) return { ok: false, reason: "function_owner missing search_path separator" };
    const securityRaw = text.slice(i, secEnd);
    i = secEnd + 1;
    let brace = 0;
    const searchStart = i;
    while (i < text.length) {
      const ch = text[i];
      if (ch === "{") brace += 1;
      else if (ch === "}") brace = Math.max(0, brace - 1);
      else if (ch === "," && brace === 0) break;
      i += 1;
    }
    const searchPath = text.slice(searchStart, i);
    let securityDefiner = securityRaw;
    if (securityRaw === "true") securityDefiner = true;
    else if (securityRaw === "false") securityDefiner = false;
    records.push({
      schema: ident.schema,
      function: functionName,
      identity_arguments: identityArguments,
      owner,
      security_definer: securityDefiner,
      search_path: searchPath,
    });
  }
  return { ok: true, records };
}

function explodeAclPrivileges(privText) {
  const grants = [];
  const raw = String(privText || "");
  for (let i = 0; i < raw.length; i += 1) {
    const letter = raw[i];
    if (letter === "*") continue;
    const privilege = ACL_PRIVILEGE_LETTERS[letter] || letter;
    const grantable = raw[i + 1] === "*";
    if (grantable) i += 1;
    grants.push({ privilege, grantable });
  }
  return grants;
}

function parseLegacyAcl(value) {
  const text = String(value);
  const records = [];
  let i = 0;
  while (i < text.length) {
    while (text[i] === ",") i += 1;
    if (i >= text.length) break;
    const brace = text.indexOf("{", i);
    const emptySep = text.indexOf(":", i);
    let identity;
    let aclBody;
    if (brace >= 0 && (emptySep < 0 || brace <= emptySep || text[emptySep + 1] === "{")) {
      if (brace < i) return { ok: false, reason: "acl object missing privilege block" };
      identity = text.slice(i, brace);
      if (identity.endsWith(":")) identity = identity.slice(0, -1);
      let depth = 0;
      let j = brace;
      for (; j < text.length; j += 1) {
        if (text[j] === "{") depth += 1;
        else if (text[j] === "}") {
          depth -= 1;
          if (depth === 0) {
            j += 1;
            break;
          }
        }
      }
      aclBody = text.slice(brace + 1, j - 1);
      i = j;
    } else if (emptySep >= 0) {
      identity = text.slice(i, emptySep);
      aclBody = "";
      i = emptySep + 1;
    } else {
      return { ok: false, reason: "acl member is not identity:{grants}" };
    }
    const split = splitSchemaIdentity(identity);
    if (!split) return { ok: false, reason: "acl identity is not schema.object" };
    const structured = structuredAclIdentityFromLegacyLabel(split.object_label);
    if (!structured.ok) return { ok: false, reason: structured.reason };
    const identityFields = {
      object_type: structured.object_type,
      schema: split.schema,
      object_name: structured.object_name,
      prokind: structured.prokind,
      identity_arguments: structured.identity_arguments,
    };
    if (!aclBody) {
      records.push({
        ...identityFields,
        grantee: "",
        grantor: "",
        privilege: "",
        grantable: false,
      });
      continue;
    }
    for (const item of aclBody.split(",")) {
      const entry = item.trim();
      if (!entry) continue;
      const eq = entry.indexOf("=");
      const slash = entry.lastIndexOf("/");
      if (eq < 0 || slash < eq) return { ok: false, reason: "acl grant is not grantee=privs/grantor" };
      const granteeRaw = entry.slice(0, eq);
      const privs = entry.slice(eq + 1, slash);
      const grantor = entry.slice(slash + 1);
      const grantee = granteeRaw === "" ? "PUBLIC" : granteeRaw;
      const exploded = explodeAclPrivileges(privs);
      if (exploded.length === 0) {
        records.push({
          ...identityFields,
          grantee,
          grantor,
          privilege: "",
          grantable: false,
        });
        continue;
      }
      for (const grant of exploded) {
        records.push({
          ...identityFields,
          grantee,
          grantor,
          privilege: grant.privilege,
          grantable: grant.grantable,
        });
      }
    }
  }
  return { ok: true, records };
}

function parseLegacyPolicy(value) {
  const text = String(value);
  const records = [];
  let i = 0;
  const commands = ["SELECT", "INSERT", "UPDATE", "DELETE", "ALL"];
  while (i < text.length) {
    while (text[i] === ",") i += 1;
    if (i >= text.length) break;
    let commandIdx = -1;
    let command = null;
    for (const cmd of commands) {
      const needle = `:${cmd}:`;
      const found = text.indexOf(needle, i);
      if (found >= 0 && (commandIdx < 0 || found < commandIdx)) {
        commandIdx = found;
        command = cmd;
      }
    }
    if (commandIdx < 0 || !command) return { ok: false, reason: "policy missing command" };
    const identity = text.slice(i, commandIdx);
    const parts = identity.split(".");
    if (parts.length < 3) return { ok: false, reason: "policy identity is not schema.table.policy_name" };
    const schema = parts[0];
    const table = parts[1];
    const policyName = parts.slice(2).join(".");
    i = commandIdx + command.length + 2;
    if (text[i] !== "{") return { ok: false, reason: "policy missing roles" };
    const roleEnd = text.indexOf("}", i);
    if (roleEnd < 0) return { ok: false, reason: "policy roles are unbalanced" };
    const roles = canonicalizeRoleSet(text.slice(i, roleEnd + 1));
    if (isFingerprintCanonicalizationRejected(roles)) return { ok: false, reason: roles.reason };
    i = roleEnd + 1;
    if (text[i] !== ":") return { ok: false, reason: "policy missing using separator" };
    i += 1;
    let depth = 0;
    const usingStart = i;
    while (i < text.length) {
      const ch = text[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") depth = Math.max(0, depth - 1);
      else if (ch === ":" && depth === 0 && text[i + 1] !== ":") break;
      if (ch === ":" && text[i + 1] === ":") {
        i += 2;
        continue;
      }
      i += 1;
    }
    const using = text.slice(usingStart, i);
    if (text[i] !== ":") return { ok: false, reason: "policy missing with_check separator" };
    i += 1;
    depth = 0;
    const checkStart = i;
    while (i < text.length) {
      const ch = text[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") depth = Math.max(0, depth - 1);
      else if (ch === "," && depth === 0) break;
      i += 1;
    }
    records.push({
      schema,
      table,
      policy_name: policyName,
      command,
      permissive: true,
      roles,
      using,
      with_check: text.slice(checkStart, i),
    });
  }
  return { ok: true, records };
}

function parseLegacyCollection(key, value) {
  if (key === "schema") return parseLegacySchema(value);
  if (key === "function_owner") return parseLegacyFunctionOwner(value);
  if (key === "acl") return parseLegacyAcl(value);
  if (key === "policy") return parseLegacyPolicy(value);
  return { ok: false, reason: `${key} has no legacy parser` };
}

function normalizeRegistryRecord(key, raw, spec) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return fingerprintCanonicalizationRejected(`${key} record is not an object`);
  }
  const out = {};
  for (const field of spec.fields) {
    if (Object.prototype.hasOwnProperty.call(raw, field)) {
      out[field] = raw[field];
    } else if (field === "permissive" && key === "policy") {
      out[field] = true;
    } else if (field === "roles" && key === "policy") {
      out[field] = [];
    } else if (field === "grantable" && key === "acl") {
      out[field] = false;
    } else if ((field === "identity_arguments" || field === "prokind" || field === "object_name") && key === "acl") {
      out[field] = "";
    } else if ((field === "security_definer" || field === "search_path") && key === "function_owner") {
      out[field] = field === "security_definer" ? null : "";
    } else {
      out[field] = null;
    }
  }
  for (const extra of Object.keys(raw).sort()) {
    if (!spec.fields.includes(extra)) out[extra] = raw[extra];
  }
  if (spec.innerSetFields.includes("roles")) {
    const roles = canonicalizeRoleSet(out.roles);
    if (isFingerprintCanonicalizationRejected(roles)) return roles;
    out.roles = roles;
  }
  return out;
}

function canonicalizeRegisteredField(key, value) {
  const spec = FINGERPRINT_FIELD_REGISTRY[key];
  if (!spec) return value;
  if (spec.kind === "exact_string_set") {
    if (!Array.isArray(value)) return fingerprintCanonicalizationRejected(`${key} is not an array`);
    const items = [];
    for (const item of value) {
      if (typeof item !== "string") return fingerprintCanonicalizationRejected(`${key} member is not a string`);
      items.push(item);
    }
    const sorted = [...items].sort(compareCanonicalScalars);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i] === sorted[i - 1]) {
        return fingerprintCanonicalizationRejected(`${key} duplicate records`);
      }
    }
    return sorted;
  }
  if (spec.kind === "record_set_or_exact_string" && typeof value === "string") {
    return value;
  }
  if (spec.kind === "record_set" || spec.kind === "record_set_or_exact_string") {
    let records;
    if (typeof value === "string") {
      const parsed = parseLegacyCollection(key, value);
      if (!parsed.ok) return fingerprintCanonicalizationRejected(parsed.reason);
      records = parsed.records.map((record) => normalizeRegistryRecord(key, record, spec));
    } else if (Array.isArray(value)) {
      records = value.map((record) => normalizeRegistryRecord(key, record, spec));
    } else {
      return fingerprintCanonicalizationRejected(`${key} must be a string or array of records`);
    }
    for (const record of records) {
      if (isFingerprintCanonicalizationRejected(record)) return record;
    }
    const sorted = [...records].sort((a, b) => compareRecordsByFields(a, b, spec.sortBy));
    for (let i = 1; i < sorted.length; i += 1) {
      if (recordsDeepEqual(sorted[i - 1], sorted[i])) {
        return fingerprintCanonicalizationRejected(`${key} duplicate records`);
      }
    }
    return sorted;
  }
  return value;
}

export function canonicalizeFingerprintForCompare(value, key = null) {
  if (key && FINGERPRINT_FIELD_REGISTRY[key]) {
    return canonicalizeRegisteredField(key, value);
  }
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeFingerprintForCompare(item));
  }
  const out = {};
  for (const nextKey of Object.keys(value).sort()) {
    out[nextKey] = canonicalizeFingerprintForCompare(value[nextKey], nextKey);
    if (isFingerprintCanonicalizationRejected(out[nextKey])) return out[nextKey];
  }
  return out;
}

export function upgradeFingerprintToStructured(fingerprint) {
  const upgraded = canonicalizeFingerprintForCompare(fingerprint);
  if (isFingerprintCanonicalizationRejected(upgraded)) {
    throw new Error(`HOLD: fingerprint canonicalization rejected: ${upgraded.reason}`);
  }
  return upgraded;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
  } else {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return Object.freeze(value);
}

/* AUTO-EMBEDDED from docs/evidence/M3_F3_FROZEN_EXPECTED_FINGERPRINTS_20260914.json
 * Offline construction seal. Not read from DB. Do not assign from observed.
 */
const FROZEN_EXPECTED_FINGERPRINTS_RAW = {
  "00118_f3_bounded_financial_epoch_foundation.sql": {
    "acl": "financial_private.epoch_transitions:{postgres=arwdDxtm/postgres},financial_private.guard_ledger_epoch():{postgres=X/postgres},financial_private.internal_financial_tenants:{postgres=arwdDxtm/postgres},public.financial_ledger_epochs:{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}",
    "policy": "public.financial_ledger_epochs.financial_ledger_epoch_active_reader:SELECT:{authenticated}:(EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.group_id = financial_ledger_epochs.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text)))):",
    "schema": "financial_private:postgres",
    "function_owner": "financial_private.guard_ledger_epoch():postgres:true:{\"search_path=\\\"\\\"\"}",
    "f3_objects_absent": false,
    "migration_file": "00118_f3_bounded_financial_epoch_foundation.sql",
    "migration_version": "20260913173000",
    "migration_name": "00118_f3_bounded_financial_epoch_foundation",
    "migration_digest": "bb823ebdddcefba7774f3347a609a05393d9a67c9430d0bd925c3458eaf5efed",
    "recognition": [
      "manual_income"
    ]
  },
  "00119_f3_01_core_ledger_foundation.sql": {
    "acl": "financial_core.assert_finances_manage(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.assert_financial_event_balanced(p_event_id uuid):{postgres=X/postgres},financial_core.can_manage_finances(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.can_view_finances(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.check_event_balance_from_event():{postgres=X/postgres},financial_core.check_event_balance_from_posting():{postgres=X/postgres},financial_core.currency_scale(p_currency text):{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres},financial_core.guard_financial_account():{postgres=X/postgres},financial_core.guard_financial_category():{postgres=X/postgres},financial_core.guard_financial_event_epoch():{postgres=X/postgres},financial_core.guard_financial_event_history():{postgres=X/postgres},financial_core.guard_financial_fund():{postgres=X/postgres},financial_core.guard_financial_posting_history():{postgres=X/postgres},financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid):{postgres=X/postgres},financial_private.epoch_transitions:{postgres=arwdDxtm/postgres},financial_private.guard_ledger_epoch():{postgres=X/postgres},financial_private.internal_financial_tenants:{postgres=arwdDxtm/postgres},public.financial_accounts:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_categories:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_events:{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=r/postgres},public.financial_funds:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_ledger_epochs:{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres},public.financial_postings:{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=r/postgres}",
    "policy": "public.financial_ledger_epochs.financial_ledger_epoch_active_reader:SELECT:{authenticated}:(EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.group_id = financial_ledger_epochs.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text)))):,public.financial_accounts.financial_accounts_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances):,public.financial_accounts.financial_accounts_manager_insert:INSERT:{authenticated}::( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances),public.financial_accounts.financial_accounts_manager_update:UPDATE:{authenticated}:( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances):( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances),public.financial_funds.financial_funds_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances):,public.financial_funds.financial_funds_manager_insert:INSERT:{authenticated}::( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances),public.financial_funds.financial_funds_manager_update:UPDATE:{authenticated}:( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances):( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances),public.financial_categories.financial_categories_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances):,public.financial_categories.financial_categories_manager_insert:INSERT:{authenticated}::(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)),public.financial_categories.financial_categories_manager_update:UPDATE:{authenticated}:(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)):(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)),public.financial_events.financial_events_finance_reader:SELECT:{authenticated}:( SELECT financial_core.can_view_finances(financial_events.group_id) AS can_view_finances):,public.financial_postings.financial_postings_finance_reader:SELECT:{authenticated}:( SELECT financial_core.can_view_finances(financial_postings.group_id) AS can_view_finances):",
    "schema": "financial_core:postgres,financial_private:postgres",
    "function_owner": "financial_private.guard_ledger_epoch():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_posting_history():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.check_event_balance_from_event():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_account():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_fund():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_category():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_event_epoch():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_event_history():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.assert_financial_event_balanced(p_event_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.check_event_balance_from_posting():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.currency_scale(p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.can_manage_finances(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.can_view_finances(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.assert_finances_manage(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"}",
    "f3_objects_absent": false,
    "migration_file": "00119_f3_01_core_ledger_foundation.sql",
    "migration_version": "20260913173001",
    "migration_name": "00119_f3_01_core_ledger_foundation",
    "migration_digest": "b22e16783fbb429ccae0ce15291d83311861f4e873cd01363bbd630372633f11",
    "recognition": [
      "manual_income"
    ]
  },
  "00120_f3_02_secure_posting_idempotency.sql": {
    "acl": "financial_core.assert_finances_manage(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.assert_financial_event_balanced(p_event_id uuid):{postgres=X/postgres},financial_core.can_manage_finances(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.can_view_finances(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.check_event_balance_from_event():{postgres=X/postgres},financial_core.check_event_balance_from_posting():{postgres=X/postgres},financial_core.check_f3_posting_closure():{postgres=X/postgres},financial_core.currency_scale(p_currency text):{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres},financial_core.f3_amount(p_value jsonb, p_currency text):{postgres=X/postgres},financial_core.f3_canonical(p_payload jsonb):{postgres=X/postgres},financial_core.f3_currency(p_value jsonb):{postgres=X/postgres},financial_core.f3_fingerprint(p_payload jsonb):{postgres=X/postgres},financial_core.f3_timestamp(p_value jsonb):{postgres=X/postgres},financial_core.f3_trim(p_text text):{postgres=X/postgres},financial_core.f3_uuid(p_value jsonb, p_optional boolean):{postgres=X/postgres},financial_core.guard_f3_payload():{postgres=X/postgres},financial_core.guard_f3_posting_closure():{postgres=X/postgres},financial_core.guard_financial_account():{postgres=X/postgres},financial_core.guard_financial_category():{postgres=X/postgres},financial_core.guard_financial_event_epoch():{postgres=X/postgres},financial_core.guard_financial_event_history():{postgres=X/postgres},financial_core.guard_financial_fund():{postgres=X/postgres},financial_core.guard_financial_posting_history():{postgres=X/postgres},financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text):{postgres=X/postgres},financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid):{postgres=X/postgres},financial_core.post_f3_command(p_command jsonb, p_opening jsonb):{postgres=X/postgres},financial_core.posting_command_payloads:{postgres=arwdDxtm/postgres},financial_private.epoch_transitions:{postgres=arwdDxtm/postgres},financial_private.guard_ledger_epoch():{postgres=X/postgres},financial_private.internal_financial_tenants:{postgres=arwdDxtm/postgres},public.financial_accounts:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_categories:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_events:{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=r/postgres},public.financial_funds:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_ledger_epochs:{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres},public.financial_postings:{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=r/postgres},public.post_financial_command(p_command jsonb):{postgres=X/postgres,authenticated=X/postgres}",
    "policy": "public.financial_ledger_epochs.financial_ledger_epoch_active_reader:SELECT:{authenticated}:(EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.group_id = financial_ledger_epochs.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text)))):,public.financial_accounts.financial_accounts_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances):,public.financial_accounts.financial_accounts_manager_insert:INSERT:{authenticated}::( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances),public.financial_accounts.financial_accounts_manager_update:UPDATE:{authenticated}:( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances):( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances),public.financial_funds.financial_funds_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances):,public.financial_funds.financial_funds_manager_insert:INSERT:{authenticated}::( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances),public.financial_funds.financial_funds_manager_update:UPDATE:{authenticated}:( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances):( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances),public.financial_categories.financial_categories_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances):,public.financial_categories.financial_categories_manager_insert:INSERT:{authenticated}::(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)),public.financial_categories.financial_categories_manager_update:UPDATE:{authenticated}:(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)):(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)),public.financial_events.financial_events_finance_reader:SELECT:{authenticated}:( SELECT financial_core.can_view_finances(financial_events.group_id) AS can_view_finances):,public.financial_postings.financial_postings_finance_reader:SELECT:{authenticated}:( SELECT financial_core.can_view_finances(financial_postings.group_id) AS can_view_finances):",
    "schema": "financial_core:postgres,financial_private:postgres",
    "function_owner": "financial_private.guard_ledger_epoch():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_posting_history():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.check_event_balance_from_event():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_account():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_fund():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_category():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_event_epoch():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_event_history():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.assert_financial_event_balanced(p_event_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.check_event_balance_from_posting():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.currency_scale(p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.can_manage_finances(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.can_view_finances(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.assert_finances_manage(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.f3_uuid(p_value jsonb, p_optional boolean):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_currency(p_value jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_payload():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_amount(p_value jsonb, p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_timestamp(p_value jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_trim(p_text text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_canonical(p_payload jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_fingerprint(p_payload jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_posting_closure():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.check_f3_posting_closure():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.post_f3_command(p_command jsonb, p_opening jsonb):postgres:true:{\"search_path=\\\"\\\"\"},public.post_financial_command(p_command jsonb):postgres:true:{\"search_path=\\\"\\\"\"}",
    "f3_objects_absent": false,
    "migration_file": "00120_f3_02_secure_posting_idempotency.sql",
    "migration_version": "20260913173002",
    "migration_name": "00120_f3_02_secure_posting_idempotency",
    "migration_digest": "d81c8f52d4fccea4b654c3a54806ffc07d654ffa2a33540c97b74721d56b9a60",
    "recognition": [
      "manual_income"
    ]
  },
  "00121_f3_03_projection_read_proof.sql": {
    "acl": "financial_core.assert_finances_manage(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.assert_financial_event_balanced(p_event_id uuid):{postgres=X/postgres},financial_core.can_manage_finances(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.can_view_finances(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.check_event_balance_from_event():{postgres=X/postgres},financial_core.check_event_balance_from_posting():{postgres=X/postgres},financial_core.check_f3_posting_closure():{postgres=X/postgres},financial_core.currency_scale(p_currency text):{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres},financial_core.f3_amount(p_value jsonb, p_currency text):{postgres=X/postgres},financial_core.f3_canonical(p_payload jsonb):{postgres=X/postgres},financial_core.f3_currency(p_value jsonb):{postgres=X/postgres},financial_core.f3_fingerprint(p_payload jsonb):{postgres=X/postgres},financial_core.f3_timestamp(p_value jsonb):{postgres=X/postgres},financial_core.f3_trim(p_text text):{postgres=X/postgres},financial_core.f3_uuid(p_value jsonb, p_optional boolean):{postgres=X/postgres},financial_core.format_projection_amount(p_amount numeric, p_currency text):{postgres=X/postgres},financial_core.guard_f3_payload():{postgres=X/postgres},financial_core.guard_f3_posting_closure():{postgres=X/postgres},financial_core.guard_financial_account():{postgres=X/postgres},financial_core.guard_financial_category():{postgres=X/postgres},financial_core.guard_financial_event_epoch():{postgres=X/postgres},financial_core.guard_financial_event_history():{postgres=X/postgres},financial_core.guard_financial_fund():{postgres=X/postgres},financial_core.guard_financial_posting_history():{postgres=X/postgres},financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text):{postgres=X/postgres},financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid):{postgres=X/postgres},financial_core.post_f3_command(p_command jsonb, p_opening jsonb):{postgres=X/postgres},financial_core.posting_command_payloads:{postgres=arwdDxtm/postgres},financial_core.projection_cashbook_rows(p_group_id uuid, p_include_audit boolean):{postgres=X/postgres},financial_private.epoch_transitions:{postgres=arwdDxtm/postgres},financial_private.guard_ledger_epoch():{postgres=X/postgres},financial_private.internal_financial_tenants:{postgres=arwdDxtm/postgres},public.financial_accounts:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_categories:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_events:{postgres=arwdDxtm/postgres,service_role=r/postgres},public.financial_funds:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_ledger_epochs:{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres},public.financial_postings:{postgres=arwdDxtm/postgres,service_role=r/postgres},public.get_financial_cashbook(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_account_id uuid, p_currency text, p_offset integer, p_limit integer):{postgres=X/postgres,authenticated=X/postgres},public.get_financial_projection_bundle(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_as_of_exclusive timestamp with time zone):{postgres=X/postgres,authenticated=X/postgres},public.post_financial_command(p_command jsonb):{postgres=X/postgres,authenticated=X/postgres}",
    "policy": "public.financial_ledger_epochs.financial_ledger_epoch_active_reader:SELECT:{authenticated}:(EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.group_id = financial_ledger_epochs.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text)))):,public.financial_accounts.financial_accounts_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances):,public.financial_accounts.financial_accounts_manager_insert:INSERT:{authenticated}::( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances),public.financial_accounts.financial_accounts_manager_update:UPDATE:{authenticated}:( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances):( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances),public.financial_funds.financial_funds_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances):,public.financial_funds.financial_funds_manager_insert:INSERT:{authenticated}::( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances),public.financial_funds.financial_funds_manager_update:UPDATE:{authenticated}:( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances):( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances),public.financial_categories.financial_categories_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances):,public.financial_categories.financial_categories_manager_insert:INSERT:{authenticated}::(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)),public.financial_categories.financial_categories_manager_update:UPDATE:{authenticated}:(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)):(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)),public.financial_events.financial_events_finance_reader:SELECT:{authenticated}:( SELECT financial_core.can_view_finances(financial_events.group_id) AS can_view_finances):,public.financial_postings.financial_postings_finance_reader:SELECT:{authenticated}:( SELECT financial_core.can_view_finances(financial_postings.group_id) AS can_view_finances):",
    "schema": "financial_core:postgres,financial_private:postgres",
    "function_owner": "financial_core.format_projection_amount(p_amount numeric, p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.projection_cashbook_rows(p_group_id uuid, p_include_audit boolean):postgres:false:{\"search_path=\\\"\\\"\"},public.get_financial_projection_bundle(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_as_of_exclusive timestamp with time zone):postgres:true:{\"search_path=\\\"\\\"\"},public.get_financial_cashbook(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_account_id uuid, p_currency text, p_offset integer, p_limit integer):postgres:true:{\"search_path=\\\"\\\"\"},financial_private.guard_ledger_epoch():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_posting_history():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.check_event_balance_from_event():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_account():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_fund():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_category():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_event_epoch():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_event_history():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.assert_financial_event_balanced(p_event_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.check_event_balance_from_posting():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.currency_scale(p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.can_manage_finances(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.can_view_finances(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.assert_finances_manage(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.f3_uuid(p_value jsonb, p_optional boolean):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_currency(p_value jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_payload():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_amount(p_value jsonb, p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_timestamp(p_value jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_trim(p_text text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_canonical(p_payload jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_fingerprint(p_payload jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_posting_closure():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.check_f3_posting_closure():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.post_f3_command(p_command jsonb, p_opening jsonb):postgres:true:{\"search_path=\\\"\\\"\"},public.post_financial_command(p_command jsonb):postgres:true:{\"search_path=\\\"\\\"\"}",
    "f3_objects_absent": false,
    "migration_file": "00121_f3_03_projection_read_proof.sql",
    "migration_version": "20260913173003",
    "migration_name": "00121_f3_03_projection_read_proof",
    "migration_digest": "51f40ccbd7dad79362b8cf2cd9854b9c8cdfd7295e4c10be5892d953915e90ce",
    "recognition": [
      "manual_income"
    ]
  },
  "00122_f3_04_correction_reversal.sql": {
    "acl": "financial_core.assert_f3_correction_postings(event uuid, expected jsonb):{postgres=X/postgres},financial_core.assert_finances_manage(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.assert_financial_event_balanced(p_event_id uuid):{postgres=X/postgres},financial_core.can_manage_finances(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.can_view_finances(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.check_event_balance_from_event():{postgres=X/postgres},financial_core.check_event_balance_from_posting():{postgres=X/postgres},financial_core.check_f3_correction_closure():{postgres=X/postgres},financial_core.check_f3_posting_closure():{postgres=X/postgres},financial_core.correct_f3_command(cmd jsonb):{postgres=X/postgres},financial_core.correction_command_payloads:{postgres=arwdDxtm/postgres},financial_core.currency_scale(p_currency text):{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres},financial_core.f3_amount(p_value jsonb, p_currency text):{postgres=X/postgres},financial_core.f3_canonical(p_payload jsonb):{postgres=X/postgres},financial_core.f3_correction_canonical(p jsonb):{postgres=X/postgres},financial_core.f3_correction_child_id(g uuid, r uuid, role text):{postgres=X/postgres},financial_core.f3_correction_fingerprint(p jsonb):{postgres=X/postgres},financial_core.f3_correction_posting_json(id uuid, event_id uuid, g uuid, epoch uuid, c text, occurred timestamp with time zone, amount numeric, control financial_control_class, account uuid, fund uuid, category uuid, cat_class financial_category_class, member uuid, project uuid):{postgres=X/postgres},financial_core.f3_correction_reason(p jsonb):{postgres=X/postgres},financial_core.f3_correction_signed_amount(p numeric, c text):{postgres=X/postgres},financial_core.f3_correction_timestamp(p timestamp with time zone):{postgres=X/postgres},financial_core.f3_currency(p_value jsonb):{postgres=X/postgres},financial_core.f3_fingerprint(p_payload jsonb):{postgres=X/postgres},financial_core.f3_timestamp(p_value jsonb):{postgres=X/postgres},financial_core.f3_trim(p_text text):{postgres=X/postgres},financial_core.f3_uuid(p_value jsonb, p_optional boolean):{postgres=X/postgres},financial_core.format_projection_amount(p_amount numeric, p_currency text):{postgres=X/postgres},financial_core.guard_f3_correction_lineage():{postgres=X/postgres},financial_core.guard_f3_correction_payload():{postgres=X/postgres},financial_core.guard_f3_payload():{postgres=X/postgres},financial_core.guard_f3_posting_closure():{postgres=X/postgres},financial_core.guard_financial_account():{postgres=X/postgres},financial_core.guard_financial_category():{postgres=X/postgres},financial_core.guard_financial_event_epoch():{postgres=X/postgres},financial_core.guard_financial_event_history():{postgres=X/postgres},financial_core.guard_financial_fund():{postgres=X/postgres},financial_core.guard_financial_posting_history():{postgres=X/postgres},financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text):{postgres=X/postgres},financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid):{postgres=X/postgres},financial_core.post_f3_command(p_command jsonb, p_opening jsonb):{postgres=X/postgres},financial_core.posting_command_payloads:{postgres=arwdDxtm/postgres},financial_core.projection_cashbook_rows(p_group_id uuid, p_include_audit boolean):{postgres=X/postgres},financial_core.resolve_f3_correction_replacement(d jsonb, target jsonb, replay boolean):{postgres=X/postgres},financial_private.epoch_transitions:{postgres=arwdDxtm/postgres},financial_private.guard_ledger_epoch():{postgres=X/postgres},financial_private.internal_financial_tenants:{postgres=arwdDxtm/postgres},public.correct_financial_event(p_command jsonb):{postgres=X/postgres,authenticated=X/postgres},public.financial_accounts:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_categories:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_events:{postgres=arwdDxtm/postgres,service_role=r/postgres},public.financial_funds:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_ledger_epochs:{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres},public.financial_postings:{postgres=arwdDxtm/postgres,service_role=r/postgres},public.get_financial_cashbook(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_account_id uuid, p_currency text, p_offset integer, p_limit integer):{postgres=X/postgres,authenticated=X/postgres},public.get_financial_projection_bundle(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_as_of_exclusive timestamp with time zone):{postgres=X/postgres,authenticated=X/postgres},public.post_financial_command(p_command jsonb):{postgres=X/postgres,authenticated=X/postgres}",
    "policy": "public.financial_ledger_epochs.financial_ledger_epoch_active_reader:SELECT:{authenticated}:(EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.group_id = financial_ledger_epochs.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text)))):,public.financial_accounts.financial_accounts_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances):,public.financial_accounts.financial_accounts_manager_insert:INSERT:{authenticated}::( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances),public.financial_accounts.financial_accounts_manager_update:UPDATE:{authenticated}:( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances):( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances),public.financial_funds.financial_funds_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances):,public.financial_funds.financial_funds_manager_insert:INSERT:{authenticated}::( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances),public.financial_funds.financial_funds_manager_update:UPDATE:{authenticated}:( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances):( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances),public.financial_categories.financial_categories_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances):,public.financial_categories.financial_categories_manager_insert:INSERT:{authenticated}::(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)),public.financial_categories.financial_categories_manager_update:UPDATE:{authenticated}:(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)):(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)),public.financial_events.financial_events_finance_reader:SELECT:{authenticated}:( SELECT financial_core.can_view_finances(financial_events.group_id) AS can_view_finances):,public.financial_postings.financial_postings_finance_reader:SELECT:{authenticated}:( SELECT financial_core.can_view_finances(financial_postings.group_id) AS can_view_finances):",
    "schema": "financial_core:postgres,financial_private:postgres",
    "function_owner": "financial_core.format_projection_amount(p_amount numeric, p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.projection_cashbook_rows(p_group_id uuid, p_include_audit boolean):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_correction_payload():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_posting_closure():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_reason(p jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_canonical(p jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_fingerprint(p jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_timestamp(p timestamp with time zone):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_signed_amount(p numeric, c text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_child_id(g uuid, r uuid, role text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_posting_json(id uuid, event_id uuid, g uuid, epoch uuid, c text, occurred timestamp with time zone, amount numeric, control financial_control_class, account uuid, fund uuid, category uuid, cat_class financial_category_class, member uuid, project uuid):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.resolve_f3_correction_replacement(d jsonb, target jsonb, replay boolean):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.assert_f3_correction_postings(event uuid, expected jsonb):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_correction_lineage():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.check_f3_correction_closure():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.correct_f3_command(cmd jsonb):postgres:true:{\"search_path=\\\"\\\"\"},public.correct_financial_event(p_command jsonb):postgres:true:{\"search_path=\\\"\\\"\"},public.get_financial_projection_bundle(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_as_of_exclusive timestamp with time zone):postgres:true:{\"search_path=\\\"\\\"\"},public.get_financial_cashbook(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_account_id uuid, p_currency text, p_offset integer, p_limit integer):postgres:true:{\"search_path=\\\"\\\"\"},financial_private.guard_ledger_epoch():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_posting_history():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.check_event_balance_from_event():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_account():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_fund():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_category():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_event_epoch():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_event_history():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.assert_financial_event_balanced(p_event_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.check_event_balance_from_posting():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.currency_scale(p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.can_manage_finances(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.can_view_finances(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.assert_finances_manage(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.f3_uuid(p_value jsonb, p_optional boolean):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_currency(p_value jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_payload():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_amount(p_value jsonb, p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_timestamp(p_value jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_trim(p_text text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_canonical(p_payload jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_fingerprint(p_payload jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.check_f3_posting_closure():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.post_f3_command(p_command jsonb, p_opening jsonb):postgres:true:{\"search_path=\\\"\\\"\"},public.post_financial_command(p_command jsonb):postgres:true:{\"search_path=\\\"\\\"\"}",
    "f3_objects_absent": false,
    "migration_file": "00122_f3_04_correction_reversal.sql",
    "migration_version": "20260913173004",
    "migration_name": "00122_f3_04_correction_reversal",
    "migration_digest": "84f52b89b764a468db7748e5c572f2543c5d466e5369ff36e6889d85ca8434f3",
    "recognition": [
      "manual_income"
    ]
  },
  "00123_f3_05_opening_cash_command.sql": {
    "acl": "financial_core.assert_f3_correction_postings(event uuid, expected jsonb):{postgres=X/postgres},financial_core.assert_finances_manage(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.assert_financial_event_balanced(p_event_id uuid):{postgres=X/postgres},financial_core.can_manage_finances(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.can_view_finances(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.check_event_balance_from_event():{postgres=X/postgres},financial_core.check_event_balance_from_posting():{postgres=X/postgres},financial_core.check_f3_correction_closure():{postgres=X/postgres},financial_core.check_f3_posting_closure():{postgres=X/postgres},financial_core.correct_f3_command(cmd jsonb):{postgres=X/postgres},financial_core.correction_command_payloads:{postgres=arwdDxtm/postgres},financial_core.currency_scale(p_currency text):{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres},financial_core.f3_amount(p_value jsonb, p_currency text):{postgres=X/postgres},financial_core.f3_canonical(p_payload jsonb):{postgres=X/postgres},financial_core.f3_correction_canonical(p jsonb):{postgres=X/postgres},financial_core.f3_correction_child_id(g uuid, r uuid, role text):{postgres=X/postgres},financial_core.f3_correction_fingerprint(p jsonb):{postgres=X/postgres},financial_core.f3_correction_posting_json(id uuid, event_id uuid, g uuid, epoch uuid, c text, occurred timestamp with time zone, amount numeric, control financial_control_class, account uuid, fund uuid, category uuid, cat_class financial_category_class, member uuid, project uuid):{postgres=X/postgres},financial_core.f3_correction_reason(p jsonb):{postgres=X/postgres},financial_core.f3_correction_signed_amount(p numeric, c text):{postgres=X/postgres},financial_core.f3_correction_timestamp(p timestamp with time zone):{postgres=X/postgres},financial_core.f3_currency(p_value jsonb):{postgres=X/postgres},financial_core.f3_fingerprint(p_payload jsonb):{postgres=X/postgres},financial_core.f3_opening_safe_text(p_value text, p_max integer, p_required boolean):{postgres=X/postgres},financial_core.f3_timestamp(p_value jsonb):{postgres=X/postgres},financial_core.f3_trim(p_text text):{postgres=X/postgres},financial_core.f3_uuid(p_value jsonb, p_optional boolean):{postgres=X/postgres},financial_core.format_projection_amount(p_amount numeric, p_currency text):{postgres=X/postgres},financial_core.guard_f3_correction_lineage():{postgres=X/postgres},financial_core.guard_f3_correction_payload():{postgres=X/postgres},financial_core.guard_f3_opening_provenance():{postgres=X/postgres},financial_core.guard_f3_payload():{postgres=X/postgres},financial_core.guard_f3_posting_closure():{postgres=X/postgres},financial_core.guard_financial_account():{postgres=X/postgres},financial_core.guard_financial_category():{postgres=X/postgres},financial_core.guard_financial_event_epoch():{postgres=X/postgres},financial_core.guard_financial_event_history():{postgres=X/postgres},financial_core.guard_financial_fund():{postgres=X/postgres},financial_core.guard_financial_posting_history():{postgres=X/postgres},financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text):{postgres=X/postgres},financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid):{postgres=X/postgres},financial_core.opening_provenances:{postgres=arwdDxtm/postgres},financial_core.post_f3_command(p_command jsonb, p_opening jsonb):{postgres=X/postgres},financial_core.post_f3_opening_cash(p_command jsonb):{postgres=X/postgres},financial_core.posting_command_payloads:{postgres=arwdDxtm/postgres},financial_core.projection_cashbook_rows(p_group_id uuid, p_include_audit boolean):{postgres=X/postgres},financial_core.resolve_f3_correction_replacement(d jsonb, target jsonb, replay boolean):{postgres=X/postgres},financial_private.epoch_transitions:{postgres=arwdDxtm/postgres},financial_private.guard_ledger_epoch():{postgres=X/postgres},financial_private.internal_financial_tenants:{postgres=arwdDxtm/postgres},public.correct_financial_event(p_command jsonb):{postgres=X/postgres,authenticated=X/postgres},public.financial_accounts:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_categories:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_events:{postgres=arwdDxtm/postgres,service_role=r/postgres},public.financial_funds:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_ledger_epochs:{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres},public.financial_postings:{postgres=arwdDxtm/postgres,service_role=r/postgres},public.get_financial_cashbook(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_account_id uuid, p_currency text, p_offset integer, p_limit integer):{postgres=X/postgres,authenticated=X/postgres},public.get_financial_projection_bundle(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_as_of_exclusive timestamp with time zone):{postgres=X/postgres,authenticated=X/postgres},public.post_financial_command(p_command jsonb):{postgres=X/postgres,authenticated=X/postgres},public.post_financial_opening_cash(p_command jsonb):{postgres=X/postgres,authenticated=X/postgres}",
    "policy": "public.financial_ledger_epochs.financial_ledger_epoch_active_reader:SELECT:{authenticated}:(EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.group_id = financial_ledger_epochs.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text)))):,public.financial_accounts.financial_accounts_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances):,public.financial_accounts.financial_accounts_manager_insert:INSERT:{authenticated}::( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances),public.financial_accounts.financial_accounts_manager_update:UPDATE:{authenticated}:( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances):( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances),public.financial_funds.financial_funds_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances):,public.financial_funds.financial_funds_manager_insert:INSERT:{authenticated}::( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances),public.financial_funds.financial_funds_manager_update:UPDATE:{authenticated}:( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances):( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances),public.financial_categories.financial_categories_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances):,public.financial_categories.financial_categories_manager_insert:INSERT:{authenticated}::(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)),public.financial_categories.financial_categories_manager_update:UPDATE:{authenticated}:(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)):(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)),public.financial_events.financial_events_finance_reader:SELECT:{authenticated}:( SELECT financial_core.can_view_finances(financial_events.group_id) AS can_view_finances):,public.financial_postings.financial_postings_finance_reader:SELECT:{authenticated}:( SELECT financial_core.can_view_finances(financial_postings.group_id) AS can_view_finances):",
    "schema": "financial_core:postgres,financial_private:postgres",
    "function_owner": "financial_core.format_projection_amount(p_amount numeric, p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.projection_cashbook_rows(p_group_id uuid, p_include_audit boolean):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_correction_payload():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_posting_closure():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_reason(p jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_canonical(p jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_fingerprint(p jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_timestamp(p timestamp with time zone):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_signed_amount(p numeric, c text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_child_id(g uuid, r uuid, role text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_posting_json(id uuid, event_id uuid, g uuid, epoch uuid, c text, occurred timestamp with time zone, amount numeric, control financial_control_class, account uuid, fund uuid, category uuid, cat_class financial_category_class, member uuid, project uuid):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.resolve_f3_correction_replacement(d jsonb, target jsonb, replay boolean):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.assert_f3_correction_postings(event uuid, expected jsonb):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_correction_lineage():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.check_f3_correction_closure():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.correct_f3_command(cmd jsonb):postgres:true:{\"search_path=\\\"\\\"\"},public.correct_financial_event(p_command jsonb):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_opening_provenance():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.post_f3_opening_cash(p_command jsonb):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.f3_opening_safe_text(p_value text, p_max integer, p_required boolean):postgres:false:{\"search_path=\\\"\\\"\"},public.post_financial_opening_cash(p_command jsonb):postgres:true:{\"search_path=\\\"\\\"\"},public.get_financial_projection_bundle(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_as_of_exclusive timestamp with time zone):postgres:true:{\"search_path=\\\"\\\"\"},public.get_financial_cashbook(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_account_id uuid, p_currency text, p_offset integer, p_limit integer):postgres:true:{\"search_path=\\\"\\\"\"},financial_private.guard_ledger_epoch():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_posting_history():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.check_event_balance_from_event():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_account():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_fund():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_category():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_event_epoch():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_event_history():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.assert_financial_event_balanced(p_event_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.check_event_balance_from_posting():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.currency_scale(p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.can_manage_finances(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.can_view_finances(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.assert_finances_manage(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.f3_uuid(p_value jsonb, p_optional boolean):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_currency(p_value jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_payload():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_amount(p_value jsonb, p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_timestamp(p_value jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_trim(p_text text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_canonical(p_payload jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_fingerprint(p_payload jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.check_f3_posting_closure():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.post_f3_command(p_command jsonb, p_opening jsonb):postgres:true:{\"search_path=\\\"\\\"\"},public.post_financial_command(p_command jsonb):postgres:true:{\"search_path=\\\"\\\"\"}",
    "f3_objects_absent": false,
    "migration_file": "00123_f3_05_opening_cash_command.sql",
    "migration_version": "20260913173005",
    "migration_name": "00123_f3_05_opening_cash_command",
    "migration_digest": "0c8af9d755e5329ca58d6c5ae967fbe5b18e3e41bb836c934cfea0c06afce96d",
    "recognition": [
      "manual_income"
    ]
  }
};

/**
 * Pre-canonicalization seals (comma-joined catalog strings) plus the
 * concatenated object_identity generation (comma-truncation class).
 * Superseded because representation changed — not semantic drift.
 */
export const SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256 = Object.freeze({
  reason: FINGERPRINT_CANONICALIZATION_REASON,
  "00118_f3_bounded_financial_epoch_foundation.sql": "a1538e7d2d451c198350535128ece77cbe54ad31cd11d6d902f7efc0ece231c5",
  "00119_f3_01_core_ledger_foundation.sql": "422c5d8b22ae4c07f59261f09988afccf80efb85f3c05dc5c3c91063a12f7f4c",
  "00120_f3_02_secure_posting_idempotency.sql": "1f5433b99ee60148fe708c51e576ce50cf082e8279e32057aa8e0e1a2e450610",
  "00121_f3_03_projection_read_proof.sql": "6705f7bb63cf18eda2b22bace9ff69c2c915207238f760437eccf08441e95c3c",
  "00122_f3_04_correction_reversal.sql": "e84cf051957897be0434d6b2fb71a3f4317228080d994110ec4470b8cb97b9ee",
  "00123_f3_05_opening_cash_command.sql": "3ff28c4c5f3f31c05014febd2c4e25158b597048f5e1e3bc7ea23a1d7ef40b66",
  concatenated_object_identity: Object.freeze({
    reason: "superseded concatenated ACL object_identity (comma-truncation class); semantic members unchanged",
    "00118_f3_bounded_financial_epoch_foundation.sql": "07ce0b411f0a7098de31ada42dd2863cb6fc50e94fe685ff998b0bd16613e535",
    "00119_f3_01_core_ledger_foundation.sql": "e8005d0591d974d4b24ced9529904bd7c0727bc3fd98a5aeabf61c7325ab4d26",
    "00120_f3_02_secure_posting_idempotency.sql": "ebeb5c45edc4ee41e1fc98687b11d6c0fe122d629a972c8d4b507ab2096b117b",
    "00121_f3_03_projection_read_proof.sql": "f026b6abcfd37efda7c5d12c687077958acf0be01cf9154a77070b32fd245976",
    "00122_f3_04_correction_reversal.sql": "e245610827cc6aebbfd64b86f684f8cea9b6d53311b7788bbd5459c93029faae",
    "00123_f3_05_opening_cash_command.sql": "f25e2ea4a86650faf3d5f0a01175bac4a1d2f44f11e3c2e7fc5a9acff422c09a",
  }),
});

export const FROZEN_EXPECTED_FINGERPRINT_SHA256 = Object.freeze({
  "00118_f3_bounded_financial_epoch_foundation.sql": "0a403e8d3848e07769fcb453b78deebb1ad29217f4ed1d9c684dc64ca1b27a02",
  "00119_f3_01_core_ledger_foundation.sql": "ca61697371861b6a8b59b6be2505bacdc1491446410941ca4f4e3f89a5b1bbdf",
  "00120_f3_02_secure_posting_idempotency.sql": "9c10de93a78f837d84d9b9232c94e0bdb731c9e748763ca53f80349ad0b37161",
  "00121_f3_03_projection_read_proof.sql": "17ebfe3eb6a503056940b58965a86f88b2cad91bea4720c12ac4b9797e7f25af",
  "00122_f3_04_correction_reversal.sql": "07675b49e6321dff9bebfcd5c245e8fb56a97937b823d896032b008427439f16",
  "00123_f3_05_opening_cash_command.sql": "5017ff96ad59c6ca42c93719dfc92f3137ccb591f00bf1acf6bfbefcdf7ba965",
});


function assertSealedExpectedHashesAtLoad() {
  const frozen = {};
  for (const file of Object.keys(FROZEN_EXPECTED_FINGERPRINTS_RAW)) {
    frozen[file] = deepFreeze(upgradeFingerprintToStructured(FROZEN_EXPECTED_FINGERPRINTS_RAW[file]));
  }
  deepFreeze(frozen);
  const sealMismatches = [];
  for (const file of Object.keys(FROZEN_EXPECTED_FINGERPRINT_SHA256)) {
    const actual = fingerprintCanonicalSha256(frozen[file]);
    const sealed = FROZEN_EXPECTED_FINGERPRINT_SHA256[file];
    if (actual !== sealed) {
      sealMismatches.push(`${file} actual=${actual} sealed=${sealed}`);
    }
  }
  if (sealMismatches.length > 0) {
    throw new Error(
      `HOLD: frozen expected fingerprint hash mismatch (module-load, before any DB access): ${sealMismatches.join("; ")}`,
    );
  }
  for (const file of F3_FORWARD_FILES) {
    if (!frozen[file] || !FROZEN_EXPECTED_FINGERPRINT_SHA256[file]) {
      throw new Error(`HOLD: missing frozen expected fingerprint for ${file}`);
    }
  }
  return frozen;
}

export function fingerprintCanonicalSha256(value) {
  const canonical = canonicalizeFingerprintForCompare(value);
  if (isFingerprintCanonicalizationRejected(canonical)) {
    throw new Error(`HOLD: cannot hash rejected fingerprint: ${canonical.reason}`);
  }
  return createHash("sha256").update(JSON.stringify(canonicalize(canonical)), "utf8").digest("hex");
}

export const FROZEN_EXPECTED_FINGERPRINTS = assertSealedExpectedHashesAtLoad();

function requireFrozenFile(file) {
  if (!FROZEN_EXPECTED_FINGERPRINTS[file]) {
    throw new Error(`HOLD: no frozen expected fingerprint for ${file}`);
  }
  return file;
}

export function getFrozenExpectedFingerprint(file) {
  const pin = requireFrozenFile(file);
  return structuredClone(FROZEN_EXPECTED_FINGERPRINTS[pin]);
}

export function expectedFingerprintSha256(file) {
  const pin = requireFrozenFile(file);
  return FROZEN_EXPECTED_FINGERPRINT_SHA256[pin];
}

export function assertExpectedFingerprintImmutable(file) {
  const pin = requireFrozenFile(file);
  const recomputed = fingerprintCanonicalSha256(FROZEN_EXPECTED_FINGERPRINTS[pin]);
  const sealed = FROZEN_EXPECTED_FINGERPRINT_SHA256[pin];
  if (recomputed !== sealed) {
    throw new Error(`HOLD: expected fingerprint mutated for ${pin}`);
  }
  return { file: pin, sha256: recomputed, unchanged: true };
}

export function recordPreDbExpectedHashes() {
  const sha256BeforeDb = {};
  for (const file of F3_FORWARD_FILES) {
    assertExpectedFingerprintImmutable(file);
    sha256BeforeDb[file] = expectedFingerprintSha256(file);
  }
  return Object.freeze({
    recordedBeforeDbAccess: true,
    independentOfObserved: true,
    constructedOffline: true,
    sha256BeforeDb: Object.freeze(sha256BeforeDb),
  });
}

function frozenMigrationName(file) {
  return String(file).replace(/\.sql$/i, "");
}

/**
 * Observed catalog fields come ONLY from the live CATALOG_FINGERPRINT_SQL
 * inventory. Meta fields come ONLY from frozen pins / PREASSIGNED_VERSIONS /
 * FROZEN_DIGESTS / recognition allowlist. Never copies expected↔observed.
 */
export function buildIndependentObservedFingerprint(file, catalogInventory) {
  if (!F3_FORWARD_FILES.includes(file)) {
    throw new Error(`HOLD: unknown file ${file}`);
  }
  if (catalogInventory == null || typeof catalogInventory !== "object" || Array.isArray(catalogInventory)) {
    return {
      migration_file: file,
      migration_version: PREASSIGNED_VERSIONS[file],
      migration_name: frozenMigrationName(file),
      migration_digest: FROZEN_DIGESTS[file],
      recognition: [...RECOGNITION_ALLOWLIST],
    };
  }
  const observed = {};
  const catalogKeyAllow = new Set([...FINGERPRINT_REQUIRED_KEYS, ...FINGERPRINT_OPTIONAL_CATALOG_KEYS]);
  for (const key of Object.keys(catalogInventory)) {
    if (catalogKeyAllow.has(key)) {
      observed[key] = catalogInventory[key];
    }
  }
  observed.migration_file = file;
  observed.migration_version = PREASSIGNED_VERSIONS[file];
  observed.migration_name = frozenMigrationName(file);
  observed.migration_digest = FROZEN_DIGESTS[file];
  observed.recognition = [...RECOGNITION_ALLOWLIST];
  return observed;
}

export function canonicalFingerprintEqual(a, b) {
  const left = canonicalizeFingerprintForCompare(a);
  const right = canonicalizeFingerprintForCompare(b);
  if (isFingerprintCanonicalizationRejected(left) || isFingerprintCanonicalizationRejected(right)) {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}


/**
 * Marker list is retained for evidence/docs only. Authorization MUST NOT
 * use substring / marker approximation.
 */
export const FINGERPRINT_REQUIRED_MARKERS = Object.freeze({
  "00118_f3_bounded_financial_epoch_foundation.sql": Object.freeze(["financial_private"]),
  "00119_f3_01_core_ledger_foundation.sql": Object.freeze(["financial_core", "financial_private"]),
  "00120_f3_02_secure_posting_idempotency.sql": Object.freeze(["financial_core", "post_financial_command"]),
  "00121_f3_03_projection_read_proof.sql": Object.freeze([
    "financial_core",
    "get_financial_projection_bundle",
  ]),
  "00122_f3_04_correction_reversal.sql": Object.freeze(["financial_core", "correct_financial_event"]),
  "00123_f3_05_opening_cash_command.sql": Object.freeze([
    "financial_core",
    "post_financial_opening_cash",
  ]),
});

export const POISON_TRIGGER_NAME = "trg_f3_dbpush_fail_target_history";
export const POISON_FUNCTION_REGPROCEDURE =
  "supabase_migrations.f3_dbpush_fail_target_history()";

export const POISON_ABSENT_PROBE_SQL = `
SELECT jsonb_build_object(
  'trigger_present', EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = '${POISON_TRIGGER_NAME}'
      AND n.nspname = 'supabase_migrations'
      AND NOT t.tgisinternal
  ),
  'function_present', to_regprocedure('${POISON_FUNCTION_REGPROCEDURE}') IS NOT NULL
);
`;

const SQL_FAILURE_LINE = /(?:^|[\s:])(?:ERROR|FATAL|PANIC):/i;
const ENVELOPE_ALLOWED_KEYS = Object.freeze(["rows", "advisory", "warning"]);

export function textOf(input) {
  return `${input?.stdout || ""}\n${input?.stderr || ""}\n${input?.output || ""}`;
}

export function hasSqlFailureOutput(text) {
  return String(text || "")
    .split(/\r?\n/)
    .some((line) => SQL_FAILURE_LINE.test(line));
}

export function extractSqlFailureLines(text) {
  const fromPsql = extractPsqlErrorLines(text);
  const extra = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => {
      if (!line) return false;
      if (/^\s*(NOTICE|WARNING):/i.test(line)) return false;
      return /(?:^|[\s:])(?:FATAL|PANIC):/i.test(line);
    });
  return [...fromPsql, ...extra];
}

export function hasTargetSpecificInjectMarker(text, version) {
  const blob = String(text || "");
  if (!blob.includes(HISTORY_INJECT_MARKER)) return false;
  if (!String(version || "")) return false;
  const v = String(version);
  return (
    blob.includes(`version ${v}`) ||
    blob.includes(`for version ${v}`) ||
    new RegExp(`${HISTORY_INJECT_MARKER}[^\\n]*${v}`).test(blob)
  );
}

export function unrelatedMigrationSqlErrors(text, version, extraText = "") {
  const combined = extraText ? `${text || ""}\n${extraText}` : text;
  const lines = extractSqlFailureLines(combined);
  return lines.filter((line) => {
    if (hasTargetSpecificInjectMarker(line, version)) return false;
    if (line.includes(HISTORY_INJECT_MARKER) && String(line).includes(String(version))) {
      return false;
    }
    return true;
  });
}

export function canonicalize(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = canonicalize(value[key]);
  }
  return out;
}

export function canonicalDeepEqual(a, b) {
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

function sameKeySet(a, b) {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((key, i) => key === kb[i]);
}

function parseEntireJson(stdout) {
  if (stdout == null) return { ok: false, reason: "stdout missing" };
  const raw = String(stdout).trim();
  if (!raw) return { ok: false, reason: "empty" };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, reason: "non-JSON" };
  }
}

export function expectedIdentitiesForExpression(expression) {
  const quoted = String(expression || "").match(/'([^']+)'/);
  if (!quoted) return Object.freeze([]);
  const full = quoted[1];
  const identities = new Set([full]);
  if (full.includes(".")) {
    identities.add(full.slice(full.lastIndexOf(".") + 1));
  }
  return Object.freeze([...identities]);
}

export function expectedRowForFile(file) {
  const expressions = TARGET_OBJECT_PROBES[file] || [];
  const row = {};
  expressions.forEach((expr, i) => {
    row[`p${i}`] = expectedIdentitiesForExpression(expr);
  });
  return row;
}

function rowFromSupportedProbeSchema(parsed) {
  if (Array.isArray(parsed)) {
    if (parsed.length !== 1) return { ok: false, reason: "wrong JSON shape: expected exactly one row" };
    const row = parsed[0];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, reason: "wrong JSON shape: row is not an object" };
    }
    return { ok: true, schema: "array_rows", row };
  }
  if (parsed && typeof parsed === "object") {
    const unexpected = Object.keys(parsed).filter((k) => !ENVELOPE_ALLOWED_KEYS.includes(k));
    if (unexpected.length > 0 && !Array.isArray(parsed.rows)) {
      return { ok: false, reason: "wrong JSON shape" };
    }
    if (!Array.isArray(parsed.rows)) {
      return { ok: false, reason: "wrong JSON shape: missing rows" };
    }
    if (parsed.rows.length !== 1) {
      return { ok: false, reason: "wrong JSON shape: expected exactly one row" };
    }
    const row = parsed.rows[0];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, reason: "wrong JSON shape: row is not an object" };
    }
    return { ok: true, schema: "envelope_rows", row };
  }
  return { ok: false, reason: "wrong JSON shape" };
}

function valueIsExactIdentity(observed, allowed) {
  if (typeof observed !== "string") return false;
  return allowed.includes(observed);
}

/**
 * Strict object-probe parse. No substring / marker fallback.
 * Presence is accepted ONLY when every listed condition holds.
 */
export function evaluateObjectProbe(result = {}, { file, expressions } = {}) {
  if (result == null || typeof result !== "object") {
    return { present: false, reason: "probe result missing" };
  }
  if (result.status !== 0) {
    return { present: false, reason: `probe status ${result.status}` };
  }
  const blob = textOf(result);
  if (hasSqlFailureOutput(blob)) {
    return { present: false, reason: "probe SQL error", errors: extractSqlFailureLines(blob) };
  }
  const parsedStdout = parseEntireJson(result.stdout);
  if (!parsedStdout.ok) {
    return { present: false, reason: parsedStdout.reason };
  }
  const shaped = rowFromSupportedProbeSchema(parsedStdout.value);
  if (!shaped.ok) return { present: false, reason: shaped.reason };

  const targetFile = file || result.file;
  const exprs = expressions || result.expressions || TARGET_OBJECT_PROBES[targetFile] || null;
  if (!Array.isArray(exprs) || exprs.length === 0) {
    return { present: false, reason: "expected probe expressions missing" };
  }

  const expectedKeys = exprs.map((_, i) => `p${i}`);
  const observedKeys = Object.keys(shaped.row).sort();
  const expectedKeySet = [...expectedKeys].sort();
  if (!sameKeySet(Object.fromEntries(expectedKeySet.map((k) => [k, true])), Object.fromEntries(observedKeys.map((k) => [k, true])))) {
    return { present: false, reason: "probe row keys are not the complete expected pN set" };
  }

  const missing = [];
  for (let i = 0; i < exprs.length; i += 1) {
    const key = `p${i}`;
    const allowed = expectedIdentitiesForExpression(exprs[i]);
    const observed = shaped.row[key];
    if (observed == null || observed === false || observed === "f" || observed === "") {
      missing.push(key);
      continue;
    }
    if (!valueIsExactIdentity(observed, allowed)) {
      return { present: false, reason: `p${i} is not an exact structured identity` };
    }
  }
  if (missing.length > 0) {
    return { present: false, reason: `required object missing: ${missing.join(",")}` };
  }
  return { present: true, schema: shaped.schema, row: shaped.row };
}

export function objectsPresentFromProbe(result, options) {
  return evaluateObjectProbe(result, options).present === true;
}

export function fingerprintCompleteAndExact(fingerprint, file) {
  if (!fingerprint || typeof fingerprint !== "object" || Array.isArray(fingerprint)) {
    return { ok: false, reason: "fingerprint missing or not an object" };
  }
  const expected = fingerprint.expected;
  const observed = fingerprint.observed;
  if (expected == null || typeof expected !== "object" || Array.isArray(expected)) {
    return { ok: false, reason: "fingerprint.expected missing or not an object" };
  }
  if (observed == null || typeof observed !== "object" || Array.isArray(observed)) {
    return { ok: false, reason: "fingerprint.observed missing or not an object" };
  }
  const expectedHashBefore = fingerprintCanonicalSha256(expected);
  const allowed = new Set(FINGERPRINT_ALLOWED_KEYS);
  for (const key of new Set([...Object.keys(expected), ...Object.keys(observed)])) {
    if (!allowed.has(key)) {
      return { ok: false, reason: `unexpected fingerprint key ${key}` };
    }
  }
  for (const key of FINGERPRINT_REQUIRED_KEYS) {
    if (!(key in expected) || expected[key] == null) {
      return { ok: false, reason: `expected missing key ${key}` };
    }
    if (!(key in observed) || observed[key] == null) {
      return { ok: false, reason: `observed missing key ${key}` };
    }
  }
  const presentCatalog = new Set();
  for (const key of [...FINGERPRINT_REQUIRED_KEYS, ...FINGERPRINT_OPTIONAL_CATALOG_KEYS]) {
    if (Object.prototype.hasOwnProperty.call(expected, key) || Object.prototype.hasOwnProperty.call(observed, key)) {
      presentCatalog.add(key);
    }
  }
  for (const key of presentCatalog) {
    if (!Object.prototype.hasOwnProperty.call(expected, key)) {
      return { ok: false, reason: `expected missing key ${key}` };
    }
    if (!Object.prototype.hasOwnProperty.call(observed, key)) {
      return { ok: false, reason: `observed missing key ${key}` };
    }
  }
  if (!sameKeySet(expected, observed)) {
    return { ok: false, reason: "expected/observed key sets differ (missing or unexpected keys)" };
  }
  if (expected.f3_objects_absent === true || observed.f3_objects_absent === true) {
    return { ok: false, reason: "fingerprint f3_objects_absent is true after target apply" };
  }
  if (!canonicalFingerprintEqual(expected, observed)) {
    return { ok: false, reason: "fingerprint expected and observed are not canonically equal" };
  }
  const expectedHashAfter = fingerprintCanonicalSha256(expected);
  if (expectedHashBefore !== expectedHashAfter) {
    return { ok: false, reason: "expected fingerprint mutated during compare" };
  }
  const pinFile = file || expected.migration_file;
  if (pinFile && FROZEN_EXPECTED_FINGERPRINT_SHA256[pinFile]) {
    if (expectedHashAfter !== FROZEN_EXPECTED_FINGERPRINT_SHA256[pinFile]) {
      return { ok: false, reason: "expected fingerprint is not the sealed frozen constant" };
    }
    assertExpectedFingerprintImmutable(pinFile);
  }
  return { ok: true };
}

function poisonRowFromSupportedSchema(parsed) {
  if (Array.isArray(parsed)) {
    if (parsed.length !== 1) return { ok: false, reason: "verify malformed: expected one row" };
    const row = parsed[0];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, reason: "verify malformed: row is not an object" };
    }
    if (row.jsonb_build_object && typeof row.jsonb_build_object === "object") {
      return { ok: true, row: row.jsonb_build_object };
    }
    return { ok: true, row };
  }
  if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed.rows)) {
      if (parsed.rows.length !== 1) return { ok: false, reason: "verify malformed: expected one row" };
      const row = parsed.rows[0];
      if (row?.jsonb_build_object && typeof row.jsonb_build_object === "object") {
        return { ok: true, row: row.jsonb_build_object };
      }
      return { ok: true, row };
    }
    if ("trigger_present" in parsed || "function_present" in parsed) {
      return { ok: true, row: parsed };
    }
    if (parsed.jsonb_build_object && typeof parsed.jsonb_build_object === "object") {
      return { ok: true, row: parsed.jsonb_build_object };
    }
  }
  return { ok: false, reason: "verify malformed: unsupported schema" };
}

export function evaluatePoisonAbsent(result) {
  if (result == null || typeof result !== "object") {
    return { ok: false, absent: false, reason: "verify result missing" };
  }
  if (result.status !== 0) {
    return { ok: false, absent: false, reason: `verify status ${result.status}` };
  }
  const blob = textOf(result);
  if (hasSqlFailureOutput(blob)) {
    return { ok: false, absent: false, reason: "verify SQL error", errors: extractSqlFailureLines(blob) };
  }
  const parsed = parseEntireJson(result.stdout);
  if (!parsed.ok) {
    return { ok: false, absent: false, reason: `verify malformed: ${parsed.reason}` };
  }
  const shaped = poisonRowFromSupportedSchema(parsed.value);
  if (!shaped.ok) return { ok: false, absent: false, reason: shaped.reason };
  const row = shaped.row;
  if (!row || typeof row !== "object") {
    return { ok: false, absent: false, reason: "verify malformed: no structured row" };
  }
  if (!("trigger_present" in row) || !("function_present" in row)) {
    return { ok: false, absent: false, reason: "verify malformed: missing trigger_present/function_present" };
  }
  if (row.trigger_present !== false) {
    return { ok: false, absent: false, reason: "poison trigger remains present" };
  }
  if (row.function_present !== false) {
    return { ok: false, absent: false, reason: "poison function remains present" };
  }
  return { ok: true, absent: true, row };
}

export function poisonAbsentFromProbe(result) {
  return evaluatePoisonAbsent(result).absent === true;
}

export function evaluateCleanupProven(result) {
  if (result == null || typeof result !== "object" || Array.isArray(result)) {
    return { ok: false, reason: "cleanup result missing or not an object" };
  }
  if (!Object.prototype.hasOwnProperty.call(result, "status") || result.status !== 0) {
    return { ok: false, reason: `cleanup status ${result.status}` };
  }
  const blob = textOf(result);
  if (hasSqlFailureOutput(blob)) {
    return { ok: false, reason: "cleanup output contains SQL error", errors: extractSqlFailureLines(blob) };
  }
  return { ok: true };
}

export function authorizedStagedFilename(file) {
  if (!F3_FORWARD_FILES.includes(file)) {
    throw new Error(`HOLD: ${file} is not an authorized F3 forward file`);
  }
  return timestampFilenameFor(file);
}

export function authorizedPrefixFilesThrough(throughFile) {
  const idx = F3_FORWARD_FILES.indexOf(throughFile);
  if (idx < 0) {
    throw new Error(`HOLD: ${throughFile} is not an authorized F3 forward file`);
  }
  return F3_FORWARD_FILES.slice(0, idx + 1);
}

export function authorizedStagedPrefixThrough(throughFile) {
  return authorizedPrefixFilesThrough(throughFile).map((file) => timestampFilenameFor(file));
}

export function expectedAppliedPrefixFiles(throughFile, phase = "initial") {
  const idx = F3_FORWARD_FILES.indexOf(throughFile);
  if (idx < 0) {
    throw new Error(`HOLD: ${throughFile} is not an authorized F3 forward file`);
  }
  if (phase === "retry") return F3_FORWARD_FILES.slice(0, idx + 1);
  return F3_FORWARD_FILES.slice(0, idx);
}

export function expectedPendingFiles(throughFile, phase = "initial") {
  if (phase === "retry") return [];
  if (!F3_FORWARD_FILES.includes(throughFile)) {
    throw new Error(`HOLD: ${throughFile} is not an authorized F3 forward file`);
  }
  return [throughFile];
}

export function listIsolatedMigrationFilenames(workdir) {
  const migDir = path.join(workdir, "supabase", "migrations");
  if (!fs.existsSync(migDir)) return [];
  return fs.readdirSync(migDir).sort();
}

function isolatedMigrationsDir(workdir) {
  return path.join(workdir, "supabase", "migrations");
}

function copyAuthorizedSourceToDest(isolated, sourceFile, dest) {
  const intended = timestampFilenameFor(sourceFile);
  const copy = (isolated?.copies || []).find((c) => c.destName === intended);
  const srcFile = copy?.sourceFile || sourceFile;
  const src = path.join(repoRoot, "supabase", "migrations", srcFile);
  if (!fs.existsSync(src)) {
    throw new Error(`HOLD: authorized source missing for ${srcFile}`);
  }
  fs.writeFileSync(dest, fs.readFileSync(src));
}

/**
 * PREFIX-COMPLETE, SINGLE-PENDING staging.
 * Stage every authorized F3 timestamp file through `throughFile` (inclusive).
 * Later F3 files are removed. Unexpected files block.
 * Repository migration bytes are never rewritten.
 */
export function syncIsolatedMigrationsThrough(isolated, throughFile) {
  if (!isolated?.workdir) {
    throw new Error("HOLD: isolated workdir required for staging");
  }
  const intended = authorizedStagedPrefixThrough(throughFile);
  const intendedSet = new Set(intended);
  const authorized = new Set(F3_FORWARD_FILES.map((f) => timestampFilenameFor(f)));
  const migDir = isolatedMigrationsDir(isolated.workdir);
  if (!fs.existsSync(migDir)) {
    throw new Error("HOLD: isolated migrations directory missing");
  }

  const names = fs.readdirSync(migDir);
  const unexpected = names.filter((name) => !authorized.has(name));
  if (unexpected.length > 0) {
    const err = new Error(
      `HOLD: unexpected isolated migration files block execution: ${unexpected.join(",")}`,
    );
    err.code = "F3_DBPUSH_STAGING_UNEXPECTED_FILES";
    throw err;
  }

  for (const name of names) {
    if (!intendedSet.has(name)) {
      fs.rmSync(path.join(migDir, name), { force: true });
    }
  }

  for (const sourceFile of authorizedPrefixFilesThrough(throughFile)) {
    const destName = timestampFilenameFor(sourceFile);
    const dest = path.join(migDir, destName);
    if (!fs.existsSync(dest)) {
      copyAuthorizedSourceToDest(isolated, sourceFile, dest);
    }
  }

  const staged = fs.readdirSync(migDir).filter((name) => name.endsWith(".sql")).sort();
  const expected = [...intended].sort();
  if (staged.length !== expected.length || expected.some((name, i) => staged[i] !== name)) {
    const err = new Error(
      `HOLD: staging did not leave prefix-complete set through ${throughFile}: ${staged.join(",")}`,
    );
    err.code = "F3_DBPUSH_STAGING_INEXACT";
    throw err;
  }
  return staged;
}

export const stagePrefixCompleteThrough = syncIsolatedMigrationsThrough;

function failPreflight(code, reason, extra = {}) {
  return { ok: false, code, reason, ...extra };
}

function unwrapHistoryRows(value) {
  let current = value;
  if (typeof current === "string") {
    try {
      current = JSON.parse(current);
    } catch {
      return { ok: false, reason: "malformed history response: non-JSON row payload", code: "malformed_history" };
    }
  }
  if (Array.isArray(current)) {
    if (
      current.length === 1 &&
      current[0] &&
      typeof current[0] === "object" &&
      !Array.isArray(current[0]) &&
      (Array.isArray(current[0].json_agg) || Array.isArray(current[0].coalesce) || Array.isArray(current[0].rows))
    ) {
      current = current[0].json_agg || current[0].coalesce || current[0].rows;
    } else if (
      current.length === 1 &&
      typeof current[0] === "string"
    ) {
      return unwrapHistoryRows(current[0]);
    }
    return { ok: true, rows: current };
  }
  if (current && typeof current === "object") {
    const unexpected = Object.keys(current).filter(
      (k) => !["json_agg", "coalesce", "rows", "advisory", "warning"].includes(k),
    );
    if (unexpected.length > 0 && !Array.isArray(current.json_agg) && !Array.isArray(current.coalesce) && !Array.isArray(current.rows)) {
      return { ok: false, reason: "malformed history response: unexpected object keys", code: "malformed_history" };
    }
    if (Array.isArray(current.json_agg)) return { ok: true, rows: current.json_agg };
    if (Array.isArray(current.coalesce)) return { ok: true, rows: current.coalesce };
    if (Array.isArray(current.rows)) return { ok: true, rows: current.rows };
    return { ok: false, reason: "malformed history response: missing rows", code: "malformed_history" };
  }
  return { ok: false, reason: "malformed history response: wrong JSON shape", code: "malformed_history" };
}

export function parseRemoteMigrationHistoryResult(result) {
  if (result == null || typeof result !== "object" || Array.isArray(result)) {
    return failPreflight("malformed_history", "malformed history response");
  }
  if (!Object.prototype.hasOwnProperty.call(result, "status") || result.status !== 0) {
    return failPreflight(
      "history_nonzero",
      `history query exits nonzero: status=${result.status}`,
      { status: result.status },
    );
  }
  const blob = textOf(result);
  if (hasSqlFailureOutput(blob)) {
    return failPreflight("malformed_history", "malformed history response: SQL error");
  }
  const parsedStdout = parseEntireJson(result.stdout);
  if (!parsedStdout.ok) {
    return failPreflight("malformed_history", `malformed history response: ${parsedStdout.reason}`);
  }
  const unwrapped = unwrapHistoryRows(parsedStdout.value);
  if (!unwrapped.ok) return unwrapped;
  if (!Array.isArray(unwrapped.rows)) {
    return failPreflight("malformed_history", "malformed history response: rows are not an array");
  }

  const rows = [];
  const seen = new Set();
  for (const row of unwrapped.rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return failPreflight("malformed_history", "malformed history response: row is not an object");
    }
    const version = row.version;
    const name = row.name;
    if (typeof version !== "string" || !/^\d{14}$/.test(version)) {
      return failPreflight("malformed_history", "malformed history response: invalid version");
    }
    if (typeof name !== "string") {
      return failPreflight("malformed_history", "malformed history response: invalid name");
    }
    if (seen.has(version)) {
      return failPreflight("remote_duplicate", `duplicate remote version ${version}`);
    }
    seen.add(version);
    rows.push({ version, name });
  }
  return { ok: true, rows };
}

function inspectLocalStagedMigrations(workdir) {
  const migDir = isolatedMigrationsDir(workdir);
  if (!fs.existsSync(migDir)) {
    return failPreflight("local_missing_dir", "isolated migrations directory missing");
  }
  const names = fs.readdirSync(migDir);
  const sqlFiles = names.filter((name) => name.endsWith(".sql")).sort();
  const authorizedFilenames = new Set(F3_FORWARD_FILES.map((file) => timestampFilenameFor(file)));
  const versionToFiles = new Map();
  const unrelated = [];
  const parsed = [];

  for (const filename of sqlFiles) {
    const match = filename.match(/^(\d{14})_(.+)\.sql$/);
    if (!match) {
      unrelated.push(filename);
      continue;
    }
    const version = match[1];
    const historyName = match[2];
    if (!versionToFiles.has(version)) versionToFiles.set(version, []);
    versionToFiles.get(version).push(filename);
    const sourceFile = sourceFileForVersion(version);
    const authorizedName = sourceFile ? timestampFilenameFor(sourceFile) : null;
    const abs = path.join(migDir, filename);
    const digest = sha256Buffer(fs.readFileSync(abs));
    if (!authorizedFilenames.has(filename) && !sourceFile) {
      unrelated.push(filename);
    }
    parsed.push({
      filename,
      version,
      name: historyName,
      sourceFile,
      digest,
      authorizedFilename: filename === authorizedName,
    });
  }

  const duplicates = [...versionToFiles.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([version, files]) => ({ version, files }));

  return { ok: true, sqlFiles, parsed, unrelated, duplicates, versionToFiles };
}

function evaluateRemoteAppliedPrefix(rows, expectedFiles) {
  const authorizedVersions = new Set(Object.values(PREASSIGNED_VERSIONS));
  const idxByVersion = new Map(F3_FORWARD_FILES.map((file, i) => [PREASSIGNED_VERSIONS[file], i]));

  for (const row of rows) {
    if (!authorizedVersions.has(row.version)) {
      return failPreflight("remote_unknown_version", `remote history unknown version ${row.version}`);
    }
    const file = sourceFileForVersion(row.version);
    if (!file || PREASSIGNED_NAMES[file] !== row.name) {
      return failPreflight(
        "remote_unexpected_name",
        `remote history unexpected name ${row.name} for ${row.version}`,
      );
    }
  }

  const indices = rows.map((row) => idxByVersion.get(row.version));
  for (let i = 1; i < indices.length; i += 1) {
    if (indices[i] <= indices[i - 1]) {
      return failPreflight("remote_out_of_order", "remote history out of order");
    }
    if (indices[i] !== indices[i - 1] + 1) {
      return failPreflight("remote_gap", "remote history gap");
    }
  }
  if (indices.length > 0 && indices[0] !== 0) {
    return failPreflight("remote_gap", "remote history gap");
  }

  return { ok: true };
}

function evaluateRemoteExactAppliedPrefix(rows, expectedFiles) {
  const expected = expectedFiles.map((file) => ({
    version: PREASSIGNED_VERSIONS[file],
    name: PREASSIGNED_NAMES[file],
  }));
  if (rows.length !== expected.length) {
    return failPreflight(
      "remote_applied_prefix_mismatch",
      "remote recorded versions/names do not equal expected applied prefix",
    );
  }
  for (let i = 0; i < expected.length; i += 1) {
    if (rows[i].version !== expected[i].version || rows[i].name !== expected[i].name) {
      return failPreflight(
        "remote_applied_prefix_mismatch",
        "remote recorded versions/names do not equal expected applied prefix",
      );
    }
  }
  return { ok: true, expected };
}

/**
 * Independently verify PREFIX-COMPLETE, SINGLE-PENDING staging before db push.
 * Expected prefix is computed from the frozen F3 map + current file + phase.
 * Never assigned from observed local or remote listings.
 */
export function evaluatePrefixCompleteSinglePendingStaging({
  workdir,
  currentFile,
  historyResult,
  cliVersion,
  phase = "initial",
} = {}) {
  if (cliVersion !== CLI_PIN) {
    return failPreflight("cli_pin", `cliVersion=${cliVersion} required=${CLI_PIN}`);
  }
  if (!F3_FORWARD_FILES.includes(currentFile)) {
    return failPreflight("unauthorized_file", `unknown file ${currentFile}`);
  }
  if (!workdir) {
    return failPreflight("workdir_missing", "isolated workdir required for staging preflight");
  }

  const expectedLocalFiles = authorizedPrefixFilesThrough(currentFile);
  const expectedLocalNames = authorizedStagedPrefixThrough(currentFile);
  const expectedApplied = expectedAppliedPrefixFiles(currentFile, phase);
  const expectedPending = expectedPendingFiles(currentFile, phase);
  const currentVersion = PREASSIGNED_VERSIONS[currentFile];
  const currentName = PREASSIGNED_NAMES[currentFile];
  const currentFilename = timestampFilenameFor(currentFile);
  const laterFiles = F3_FORWARD_FILES.slice(F3_FORWARD_FILES.indexOf(currentFile) + 1);

  const history = parseRemoteMigrationHistoryResult(historyResult);
  if (!history.ok) return history;

  const remoteStructure = evaluateRemoteAppliedPrefix(history.rows, expectedApplied);
  if (!remoteStructure.ok) return remoteStructure;

  const remoteVersionsEarly = history.rows.map((row) => row.version);
  if (phase === "initial" && remoteVersionsEarly.includes(currentVersion)) {
    return failPreflight(
      "current_already_remote",
      "current target already remotely recorded before initial push",
    );
  }

  const remotePrefix = evaluateRemoteExactAppliedPrefix(history.rows, expectedApplied);
  if (!remotePrefix.ok) return remotePrefix;

  const local = inspectLocalStagedMigrations(workdir);
  if (!local.ok) return local;

  if (local.duplicates.length > 0) {
    return failPreflight(
      "duplicate_timestamp",
      `duplicate timestamp exists: ${local.duplicates.map((d) => d.version).join(",")}`,
    );
  }
  if (local.unrelated.length > 0) {
    return failPreflight(
      "unrelated_migration",
      `unrelated migration file present: ${local.unrelated.join(",")}`,
    );
  }

  const laterPresent = local.parsed.filter((row) => laterFiles.some((file) => PREASSIGNED_VERSIONS[file] === row.version));
  if (laterPresent.length > 0) {
    return failPreflight(
      "later_migration_staged",
      `later F3 migration staged: ${laterPresent.map((row) => row.filename).join(",")}`,
    );
  }

  const localByVersion = new Map(local.parsed.map((row) => [row.version, row]));
  for (const file of expectedApplied) {
    const version = PREASSIGNED_VERSIONS[file];
    const row = localByVersion.get(version);
    if (!row) {
      return failPreflight(
        "applied_remote_missing_locally",
        `applied remote version ${version} missing from local workdir`,
      );
    }
    if (row.filename !== timestampFilenameFor(file) || row.name !== PREASSIGNED_NAMES[file]) {
      return failPreflight(
        "applied_local_identity",
        `applied local file wrong name or timestamp for ${file}: ${row.filename}`,
      );
    }
    if (row.digest !== FROZEN_DIGESTS[file]) {
      return failPreflight(
        "applied_local_digest",
        `applied local file wrong digest for ${file}`,
      );
    }
  }

  const currentLocal = localByVersion.get(currentVersion);
  if (phase === "initial" && !currentLocal) {
    return failPreflight("current_missing_locally", `current target ${currentFilename} missing locally`);
  }
  if (currentLocal) {
    if (currentLocal.filename !== currentFilename || currentLocal.name !== currentName) {
      return failPreflight(
        "current_local_identity",
        `current target wrong name or timestamp: ${currentLocal.filename}`,
      );
    }
    if (currentLocal.digest !== FROZEN_DIGESTS[currentFile]) {
      return failPreflight("current_local_digest", "current target does not match authorized digest");
    }
  }

  const remoteVersions = history.rows.map((row) => row.version);
  const localVersions = local.parsed.map((row) => row.version).sort();
  const remoteSet = new Set(remoteVersions);
  const localSet = new Set(localVersions);
  const pending = localVersions.filter((version) => !remoteSet.has(version));
  const remoteMinusLocal = remoteVersions.filter((version) => !localSet.has(version));
  const expectedPendingVersions = expectedPending.map((file) => PREASSIGNED_VERSIONS[file]);

  if (phase === "initial" && remoteSet.has(currentVersion)) {
    return failPreflight(
      "current_already_remote",
      "current target already remotely recorded before initial push",
    );
  }
  if (phase === "retry" && !remoteSet.has(currentVersion)) {
    return failPreflight(
      "current_missing_remote_after_repair",
      "current target absent from remote history before retry",
    );
  }

  if (pending.length !== expectedPendingVersions.length || pending.some((v, i) => v !== expectedPendingVersions[i])) {
    if (pending.length > 1 && phase === "initial") {
      return failPreflight(
        "two_unapplied",
        `local-minus-remote versions ${JSON.stringify(pending)} is not exactly [${currentVersion}]`,
      );
    }
    return failPreflight(
      "pending_mismatch",
      `local-minus-remote versions ${JSON.stringify(pending)} expected ${JSON.stringify(expectedPendingVersions)}`,
    );
  }
  if (remoteMinusLocal.length > 0) {
    return failPreflight(
      "remote_minus_local",
      `remote-minus-local versions is not empty: ${remoteMinusLocal.join(",")}`,
    );
  }

  const observedLocalNames = local.parsed.map((row) => row.filename).sort();
  if (
    observedLocalNames.length !== expectedLocalNames.length ||
    expectedLocalNames.some((name, i) => observedLocalNames[i] !== name)
  ) {
    return failPreflight(
      "local_prefix_mismatch",
      `local staged set ${JSON.stringify(observedLocalNames)} != prefix ${JSON.stringify(expectedLocalNames)}`,
    );
  }

  return {
    ok: true,
    phase,
    currentFile,
    currentVersion,
    staged: observedLocalNames,
    expectedLocal: expectedLocalFiles,
    expectedApplied,
    expectedPending,
    pending,
    remote: history.rows,
    productionHistoryLimitation: PRODUCTION_HISTORY_LIMITATION_WARNING,
  };
}

export function assertPrefixCompleteSinglePendingStaging(input = {}) {
  const result = evaluatePrefixCompleteSinglePendingStaging(input);
  if (!result.ok) {
    const err = new Error(`${PREFIX_COMPLETE_SINGLE_PENDING_HOLD}: ${result.reason}`);
    err.code = result.code || "F3_DBPUSH_STAGING_PREFLIGHT";
    err.preflight = result;
    throw err;
  }
  return result;
}

/**
 * Shared qualify/test orchestration: stage prefix-complete, independently
 * preflight, then maybe db-push. Repair is accepted only so callers can prove
 * it is not invoked when preflight fails.
 */
export async function runPrefixCompleteSinglePendingOrchestration({
  isolated,
  file,
  cliVersion,
  queryHistory,
  dbPush,
  repair,
  phase = "initial",
  stage = true,
} = {}) {
  let staged = null;
  try {
    if (stage) {
      staged = syncIsolatedMigrationsThrough(isolated, file);
    } else if (isolated?.workdir) {
      staged = listIsolatedMigrationFilenames(isolated.workdir).filter((name) => name.endsWith(".sql"));
    }
  } catch (err) {
    return {
      ok: false,
      staged,
      dbPushCalls: 0,
      repairCalls: 0,
      hold: PREFIX_COMPLETE_SINGLE_PENDING_HOLD,
      error: String(err?.message || err),
      code: err?.code || "F3_DBPUSH_STAGING_UNEXPECTED_FILES",
      preflight: err?.preflight || { ok: false, reason: String(err?.message || err), code: err?.code },
    };
  }

  let historyResult;
  try {
    if (typeof queryHistory !== "function") {
      return {
        ok: false,
        staged,
        dbPushCalls: 0,
        repairCalls: 0,
        hold: PREFIX_COMPLETE_SINGLE_PENDING_HOLD,
        preflight: failPreflight("history_query_missing", "history query callback missing"),
      };
    }
    historyResult = await Promise.resolve(queryHistory());
  } catch (err) {
    return {
      ok: false,
      staged,
      dbPushCalls: 0,
      repairCalls: 0,
      hold: PREFIX_COMPLETE_SINGLE_PENDING_HOLD,
      preflight: failPreflight("malformed_history", `malformed history response: ${err?.message || err}`),
    };
  }

  let preflight;
  try {
    preflight = assertPrefixCompleteSinglePendingStaging({
      workdir: isolated?.workdir,
      currentFile: file,
      historyResult,
      cliVersion,
      phase,
    });
  } catch (err) {
    return {
      ok: false,
      staged,
      dbPushCalls: 0,
      repairCalls: 0,
      hold: PREFIX_COMPLETE_SINGLE_PENDING_HOLD,
      preflight: err.preflight || { ok: false, reason: String(err?.message || err), code: err?.code },
    };
  }

  if (typeof dbPush !== "function") {
    return {
      ok: true,
      staged,
      preflight,
      dbPushCalls: 0,
      repairCalls: 0,
      pushResult: null,
    };
  }
  const pushResult = await Promise.resolve(dbPush({ staged, preflight, phase }));
  return {
    ok: true,
    staged,
    preflight,
    pushResult,
    dbPushCalls: 1,
    repairCalls: 0,
  };
}

function disposableIdentityOk(input) {
  if (input.disposableIdentityVerified === true) return true;
  if (input.disposableIdentityVerified === false) return false;
  const ref = input.projectRef || input.identity?.ref || input.identity?.id;
  const name = input.projectName || input.identity?.name;
  const org = input.orgId || input.identity?.organization_id || input.identity?.org;
  const host = input.host || input.identity?.host;
  if (!ref && !name && !org && !host && input.disposableIdentityVerified == null) {
    return false;
  }
  return (
    ref === APPROVED_DISPOSABLE_PROJECT_REF &&
    (name == null || name === APPROVED_DISPOSABLE_PROJECT_NAME) &&
    (org == null || org === APPROVED_DISPOSABLE_ORG_ID) &&
    (host == null || host === APPROVED_DISPOSABLE_HOST)
  );
}

function productionRejectedOk(input) {
  if (input.productionIdentityRejected === true) return true;
  if (input.productionIdentityRejected === false) return false;
  const ref = input.projectRef || input.identity?.ref || input.identity?.id;
  if (ref == null) return false;
  return ref !== PRODUCTION_REF;
}

export function evaluateRepairSafetyGate(input = {}) {
  const file = input.file;
  const version = input.targetVersion || PREASSIGNED_VERSIONS[file];
  const gates = [];
  const fail = (id, detail) => {
    gates.push({ id, ok: false, detail });
  };
  const pass = (id, detail) => {
    gates.push({ id, ok: true, detail: detail || true });
  };

  if (!F3_FORWARD_FILES.includes(file)) {
    fail("authorized_file", `unknown file ${file}`);
  } else {
    pass("authorized_file");
  }

  if (!disposableIdentityOk(input)) {
    fail("disposable_identity", "exact disposable identity not verified");
  } else {
    pass("disposable_identity");
  }

  if (!productionRejectedOk(input)) {
    fail("production_rejected", "production identity was not rejected");
  } else {
    pass("production_rejected");
  }

  if (input.cliVersion !== CLI_PIN) {
    fail("cli_pin", `cliVersion=${input.cliVersion} required=${CLI_PIN}`);
  } else {
    pass("cli_pin");
  }

  const intendedPrefix = F3_FORWARD_FILES.includes(file) ? authorizedStagedPrefixThrough(file) : null;
  const staged = Array.isArray(input.stagedMigrations) ? input.stagedMigrations : null;
  const prefixOk =
    intendedPrefix != null &&
    Array.isArray(staged) &&
    staged.length === intendedPrefix.length &&
    intendedPrefix.every((name, i) => staged[i] === name);
  if (!prefixOk) {
    fail("staged_prefix_complete", `staged=${JSON.stringify(staged)} intended=${JSON.stringify(intendedPrefix)}`);
  } else {
    pass("staged_prefix_complete");
  }

  const injectInstalled =
    input.injectInstalled === true ||
    Number(input.injectStatus) === 0 ||
    input.injectOk === true;
  const injectTargetsVersion =
    String(input.injectSql || "").includes(String(version)) &&
    String(input.injectSql || "").includes(HISTORY_INJECT_MARKER);
  if (!injectInstalled || (input.injectSql != null && !injectTargetsVersion)) {
    fail("inject_installed_exact_version", "failure injection not installed for exact target version");
  } else {
    pass("inject_installed_exact_version");
  }

  const nonzero = input.exitStatus !== 0 && input.exitStatus != null;
  if (!nonzero) fail("nonzero_exit", `exitStatus=${input.exitStatus}`);
  else pass("nonzero_exit");

  const output = textOf(input);
  if (!hasTargetSpecificInjectMarker(output, version)) {
    fail("target_inject_marker", "missing target-specific history-failure marker");
  } else {
    pass("target_inject_marker");
  }

  const probe = input.probe;
  const probeText = probe ? textOf(probe) : textOf({
    stdout: input.probeStdout,
    stderr: input.probeStderr,
    output: input.probeOutput,
  });
  const unrelated = unrelatedMigrationSqlErrors(output, version, probeText);
  if (unrelated.length > 0) {
    fail("no_unrelated_sql_error", unrelated[0]);
  } else {
    pass("no_unrelated_sql_error");
  }

  const rows = Array.isArray(input.historyRows) ? input.historyRows : [];
  const present = rows.some((row) => String(row?.version) === String(version));
  if (present) fail("target_history_absent", "target version unexpectedly present");
  else pass("target_history_absent");

  const probeResult = probe || (
    input.probeStatus != null || input.probeStdout != null || input.probeStderr != null
      ? { status: input.probeStatus, stdout: input.probeStdout, stderr: input.probeStderr, file }
      : null
  );
  const probeEval = evaluateObjectProbe(probeResult || {}, { file });
  const objectsOk = probeEval.present === true;
  if (!objectsOk) {
    fail("expected_objects", probeEval.reason || `objectsPresent=${input.objectsPresent}`);
  } else {
    pass("expected_objects");
  }
  if (input.securityPostconditionsOk === false || !objectsOk) {
    fail(
      "security_postconditions",
      objectsOk ? "security postconditions missing" : "objects missing so security postconditions not proven",
    );
  } else {
    pass("security_postconditions");
  }

  const fp = fingerprintCompleteAndExact(input.fingerprint, file);
  if (!fp.ok) fail("fingerprint_exact", fp.reason);
  else pass("fingerprint_exact");

  const authorized = FROZEN_DIGESTS[file];
  const digestOk =
    input.digest === authorized &&
    (input.onDiskDigest == null || input.onDiskDigest === authorized);
  if (!digestOk) fail("sql_digest", `digest ${input.digest} != ${authorized}`);
  else pass("sql_digest");

  const ok = gates.every((g) => g.ok);
  const originalError =
    unrelated[0] ||
    (hasTargetSpecificInjectMarker(output, version) ? null : extractSqlFailureLines(output)[0]) ||
    input.originalSqlError ||
    null;
  return {
    ok,
    repairAuthorized: ok,
    continuation: ok,
    gates,
    failedGates: gates.filter((g) => !g.ok).map((g) => g.id),
    hold: ok ? null : REPAIR_SAFETY_HOLD,
    originalSqlError: originalError,
    poisonCleanupOnly: !ok,
    nextMigration: ok,
    objectProbe: probeEval,
  };
}

async function invokeMaybeAsync(fn) {
  return await Promise.resolve(fn());
}

/**
 * Classify, then maybe repair. Cleanup always runs (finally-style).
 * Repair is invoked only when the gate authorizes AND cleanup exits 0
 * with no SQL error AND a separate probe proves poison is absent.
 * Optional teardown is recorded separately and never counted as cleanup success.
 */
export async function runRepairSafetyThenMaybeRepair({
  gateInput,
  cleanup,
  verifyPoisonAbsent,
  repair,
  teardown,
} = {}) {
  const gate = evaluateRepairSafetyGate(gateInput);
  let cleanupResult = null;
  let cleanupError = null;
  let verifyResult = null;
  let verifyEval = { ok: false, absent: false, reason: "verify not run" };
  let repairResult = null;
  let repairAttempted = false;
  let teardownResult = null;
  let teardownRecorded = false;

  try {
    if (typeof cleanup === "function") {
      try {
        cleanupResult = await invokeMaybeAsync(cleanup);
      } catch (err) {
        cleanupError = err;
        cleanupResult = { threw: true, error: String(err?.message || err) };
      }
    } else {
      cleanupResult = { missing: true };
    }

    const cleanupProof = evaluateCleanupProven(cleanupResult);
    const cleanupOk = cleanupProof.ok === true && cleanupError == null;

    if (gate.ok && cleanupOk && typeof verifyPoisonAbsent === "function") {
      try {
        verifyResult = await invokeMaybeAsync(verifyPoisonAbsent);
        verifyEval = evaluatePoisonAbsent(verifyResult);
      } catch (err) {
        verifyResult = { threw: true, error: String(err?.message || err) };
        verifyEval = { ok: false, absent: false, reason: "verify threw", error: String(err?.message || err) };
      }
    } else if (gate.ok && cleanupOk && typeof verifyPoisonAbsent !== "function") {
      verifyEval = { ok: false, absent: false, reason: "verifyPoisonAbsent callback missing" };
    } else if (gate.ok && !cleanupOk) {
      verifyEval = { ok: false, absent: false, reason: cleanupProof.reason || "cleanup not proven" };
    }

    const repairAllowed = Boolean(gate.ok && cleanupOk && verifyEval.ok && verifyEval.absent === true);
    if (repairAllowed) {
      if (typeof repair !== "function") {
        throw new Error("HOLD: repair executor required after authorized gate");
      }
      repairAttempted = true;
      repairResult = await invokeMaybeAsync(repair);
    }
  } catch (err) {
    if (typeof teardown === "function" && !teardownRecorded) {
      try {
        teardownResult = await invokeMaybeAsync(teardown);
        teardownRecorded = true;
      } catch {
        /* teardown is never cleanup success */
      }
    }
    throw err;
  }

  if (typeof teardown === "function" && !teardownRecorded) {
    try {
      teardownResult = await invokeMaybeAsync(teardown);
      teardownRecorded = true;
    } catch (err) {
      teardownResult = { threw: true, error: String(err?.message || err) };
      teardownRecorded = true;
    }
  }

  const cleanupProof = evaluateCleanupProven(cleanupResult);
  const cleanupOk = cleanupProof.ok === true && cleanupError == null;
  const repairOk = !repairAttempted || (repairResult && repairResult.status === 0);
  return {
    gate,
    repairAuthorized: Boolean(gate.ok && cleanupOk && verifyEval.ok && verifyEval.absent === true),
    gateAuthorized: gate.ok,
    repairAttempted,
    repair: repairResult,
    continuation: Boolean(repairAttempted && repairOk),
    nextMigration: Boolean(repairAttempted && repairOk),
    cleanup: cleanupResult,
    cleanupError: cleanupError ? String(cleanupError.message || cleanupError) : null,
    cleanupProven: evaluateCleanupProven(cleanupResult).ok === true && cleanupError == null,
    verify: verifyResult,
    poisonAbsent: verifyEval.absent === true,
    poisonVerify: verifyEval,
    teardown: teardownResult,
    teardownRecorded,
    poisonCleanupOnly: true,
    repairOk,
  };
}
