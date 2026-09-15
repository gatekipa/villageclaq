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

/**
 * Immutable complete-catalog fingerprint schema.
 * Expected and observed MUST share this version, the exact required-key
 * set, nested key contracts, types, and shapes. Prior ten-field hashes
 * are SUPERSEDED.
 */
export const F3_FULL_FINGERPRINT_SCHEMA_VERSION = "f3-full-catalog-v1";

export const F3_FULL_FINGERPRINT_NESTED_KEYS = Object.freeze({
  schemas: Object.freeze(["name", "owner", "acl"]),
  schema: Object.freeze(["schema", "owner"]),
  schema_acl: Object.freeze(["grantee", "grantor", "privilege", "grantable"]),
  relations: Object.freeze([
    "schema",
    "name",
    "relkind",
    "persistence",
    "owner",
    "replica_identity",
    "rls_enabled",
    "rls_force",
    "acl",
  ]),
  columns: Object.freeze([
    "schema",
    "relation",
    "ordinal",
    "name",
    "type",
    "typmod",
    "nullable",
    "default",
    "identity",
    "generated",
    "collation",
  ]),
  types: Object.freeze(["schema", "name", "kind", "labels", "owner", "acl"]),
  views: Object.freeze([
    "schema",
    "name",
    "kind",
    "definition",
    "security_invoker",
    "security_barrier",
    "owner",
    "acl",
  ]),
  routines: Object.freeze([
    "schema",
    "name",
    "identity_arguments",
    "result_type",
    "language",
    "owner",
    "functiondef",
    "volatility",
    "parallel",
    "strict",
    "leakproof",
    "security_definer",
    "proconfig",
    "search_path",
    "acl",
  ]),
  rls: Object.freeze(["schema", "relation", "rls_enabled", "rls_force"]),
  policies: Object.freeze([
    "schema",
    "table",
    "policy_name",
    "command",
    "permissive",
    "roles",
    "using",
    "with_check",
  ]),
  acls: Object.freeze([
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
  constraints: Object.freeze(["schema", "relation", "name", "contype", "definition"]),
  indexes: Object.freeze(["schema", "relation", "name", "unique", "definition"]),
  triggers: Object.freeze([
    "schema",
    "relation",
    "name",
    "constraint_trigger",
    "timing_events",
    "for_each",
    "function_identity",
  ]),
  hgp: Object.freeze([
    "schema",
    "name",
    "identity_arguments",
    "result_type",
    "language",
    "owner",
    "security_definer",
    "proconfig",
    "def_md5",
    "src_md5",
    "count",
  ]),
  enqueue: Object.freeze([
    "schema",
    "name",
    "identity_arguments",
    "result_type",
    "language",
    "owner",
    "security_definer",
    "proconfig",
    "def_md5",
    "src_md5",
    "count",
  ]),
});

export const FINGERPRINT_REQUIRED_KEYS = Object.freeze([
  "schema_version",
  "schema",
  "schemas",
  "function_owner",
  "acl",
  "acls",
  "policy",
  "policies",
  "relations",
  "columns",
  "types",
  "views",
  "routines",
  "rls",
  "constraints",
  "indexes",
  "triggers",
  "hgp",
  "enqueue",
  "f3_objects_absent",
]);

/** Catalog fields that, if present on either side, must exist on both and match exactly. */
export const FINGERPRINT_OPTIONAL_CATALOG_KEYS = Object.freeze([
  "owner",
  "function_definition",
  "search_path",
  "hgp_pin",
  "object_identity",
]);

export const FINGERPRINT_CATALOG_KEYS = Object.freeze([
  ...FINGERPRINT_REQUIRED_KEYS,
  ...FINGERPRINT_OPTIONAL_CATALOG_KEYS,
  "recognition",
]);

export const FINGERPRINT_META_KEYS = Object.freeze([
  "schema_version",
  "migration_file",
  "migration_source_label",
  "migration_version",
  "migration_name",
  "migration_digest",
  "recognition",
]);

export const FINGERPRINT_ALLOWED_KEYS = Object.freeze([
  ...new Set([...FINGERPRINT_REQUIRED_KEYS, ...FINGERPRINT_CATALOG_KEYS, ...FINGERPRINT_META_KEYS]),
]);

export const F3_HGP_PIN = Object.freeze({
  schema: "public",
  name: "has_group_permission",
  identity_arguments: "gid uuid, perm_key text, uid uuid",
  result_type: "boolean",
  language: "plpgsql",
  owner: "postgres",
  security_definer: true,
  proconfig: Object.freeze(['search_path=""']),
  def_md5: "695368464e97297fbf0f90ce7345162f",
  src_md5: "96a296dfd541c7fc75ec68c4da1d92ff",
  count: 1,
});

export const F3_ENQUEUE_PIN = Object.freeze({
  schema: "public",
  name: "enqueue_outbound_notification",
  identity_arguments:
    "p_notification_type text, p_domain_object_id uuid, p_channel notification_channel, p_recipient_membership_id uuid, p_locale text",
  result_type: "TABLE(queue_id uuid, result text)",
  language: "plpgsql",
  owner: "postgres",
  security_definer: true,
  proconfig: Object.freeze(['search_path=""']),
  def_md5: "dbdb16cdced6cae9cbdbfb6a6a9f421f",
  src_md5: "3fa76af51e431ccbd31eb033dcff0b80",
  count: 1,
});

export const TEN_FIELD_FINGERPRINT_SCHEMA_VERSION = "ten-field";
export const TEN_FIELD_SCHEMA_SUPERSEDED_REASON =
  "SUPERSEDED: ten-field fingerprint schema omitted required catalog/security fields";

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
  schemas: Object.freeze({
    kind: "record_set",
    fields: F3_FULL_FINGERPRINT_NESTED_KEYS.schemas,
    sortBy: Object.freeze(["name", "owner"]),
    innerSetFields: Object.freeze([]),
    doNotSort: Object.freeze([]),
    notes: "Complete schema inventory with structured ACL. Order of schemas is meaningless.",
  }),
  relations: Object.freeze({
    kind: "record_set",
    fields: F3_FULL_FINGERPRINT_NESTED_KEYS.relations,
    sortBy: Object.freeze(["schema", "name", "relkind"]),
    innerSetFields: Object.freeze([]),
    doNotSort: Object.freeze(["persistence", "replica_identity"]),
    notes: "Relation identity includes relkind, persistence, owner, replica identity, explicit RLS, ACL.",
  }),
  columns: Object.freeze({
    kind: "record_set",
    fields: F3_FULL_FINGERPRINT_NESTED_KEYS.columns,
    sortBy: Object.freeze(["schema", "relation", "ordinal", "name"]),
    innerSetFields: Object.freeze([]),
    doNotSort: Object.freeze(["type", "typmod", "default", "identity", "generated", "collation"]),
    notes: "Column ordinal is semantic. Types are canonical. Never sort table column order independently of ordinal.",
  }),
  types: Object.freeze({
    kind: "record_set",
    fields: F3_FULL_FINGERPRINT_NESTED_KEYS.types,
    sortBy: Object.freeze(["schema", "name", "kind"]),
    innerSetFields: Object.freeze([]),
    doNotSort: Object.freeze(["labels"]),
    notes: "Enum labels keep semantic CREATE order. Never sort labels.",
  }),
  views: Object.freeze({
    kind: "record_set",
    fields: F3_FULL_FINGERPRINT_NESTED_KEYS.views,
    sortBy: Object.freeze(["schema", "name", "kind"]),
    innerSetFields: Object.freeze([]),
    doNotSort: Object.freeze(["definition"]),
    notes: "View/matview definition and security options compare exactly.",
  }),
  routines: Object.freeze({
    kind: "record_set",
    fields: F3_FULL_FINGERPRINT_NESTED_KEYS.routines,
    sortBy: Object.freeze(["schema", "name", "identity_arguments", "owner"]),
    innerSetFields: Object.freeze([]),
    doNotSort: Object.freeze(["identity_arguments", "functiondef", "result_type", "proconfig", "search_path"]),
    notes: "identity_arguments are never comma-split or reordered. functiondef is the complete definition.",
  }),
  rls: Object.freeze({
    kind: "record_set",
    fields: F3_FULL_FINGERPRINT_NESTED_KEYS.rls,
    sortBy: Object.freeze(["schema", "relation"]),
    innerSetFields: Object.freeze([]),
    doNotSort: Object.freeze([]),
    notes: "Explicit RLS records. Absent is not false. Empty array is allowed only when no target relation has RLS state.",
  }),
  policies: Object.freeze({
    kind: "record_set",
    fields: F3_FULL_FINGERPRINT_NESTED_KEYS.policies,
    sortBy: Object.freeze(["schema", "table", "policy_name", "command"]),
    innerSetFields: Object.freeze(["roles"]),
    doNotSort: Object.freeze(["using", "with_check"]),
    notes: "Same association as policy. USING / WITH CHECK never sorted or whitespace-normalized.",
  }),
  acls: Object.freeze({
    kind: "record_set",
    fields: F3_FULL_FINGERPRINT_NESTED_KEYS.acls,
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
    notes: "Full ACL association. Whole-record sort only. identity_arguments never split.",
  }),
  constraints: Object.freeze({
    kind: "record_set",
    fields: F3_FULL_FINGERPRINT_NESTED_KEYS.constraints,
    sortBy: Object.freeze(["schema", "relation", "name", "contype"]),
    innerSetFields: Object.freeze([]),
    doNotSort: Object.freeze(["definition"]),
    notes: "Named and inline table constraints for 00118–00123 targets.",
  }),
  indexes: Object.freeze({
    kind: "record_set",
    fields: F3_FULL_FINGERPRINT_NESTED_KEYS.indexes,
    sortBy: Object.freeze(["schema", "relation", "name"]),
    innerSetFields: Object.freeze([]),
    doNotSort: Object.freeze(["definition"]),
    notes: "Index definitions compare exactly, including predicates.",
  }),
  triggers: Object.freeze({
    kind: "record_set",
    fields: F3_FULL_FINGERPRINT_NESTED_KEYS.triggers,
    sortBy: Object.freeze(["schema", "relation", "name"]),
    innerSetFields: Object.freeze([]),
    doNotSort: Object.freeze(["timing_events", "function_identity"]),
    notes: "Trigger timing/events and function identity compare exactly.",
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
  ),
  'schema_version', '${F3_FULL_FINGERPRINT_SCHEMA_VERSION}'::text,
  'schemas', (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'name', n.nspname,
        'owner', pg_get_userbyid(n.nspowner),
        'acl', coalesce((
          SELECT jsonb_agg(
            jsonb_build_object(
              'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
              'grantor', pg_get_userbyid(a.grantor),
              'privilege', a.privilege_type,
              'grantable', a.is_grantable
            )
            ORDER BY CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
                     pg_get_userbyid(a.grantor), a.privilege_type, a.is_grantable::text
          )
          FROM aclexplode(n.nspacl) a
          WHERE n.nspacl IS NOT NULL
        ), '[]'::jsonb)
      )
      ORDER BY n.nspname
    ), '[]'::jsonb)
    FROM pg_namespace n
    WHERE n.nspname IN ('financial_core','financial_private')
  ),
  'relations', (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'name', c.relname,
        'relkind', c.relkind::text,
        'persistence', CASE c.relpersistence WHEN 'p' THEN 'permanent' WHEN 'u' THEN 'unlogged' ELSE 'temporary' END,
        'owner', pg_get_userbyid(c.relowner),
        'replica_identity', CASE c.relreplident WHEN 'd' THEN 'default' WHEN 'n' THEN 'nothing' WHEN 'f' THEN 'full' ELSE 'index' END,
        'rls_enabled', c.relrowsecurity,
        'rls_force', c.relforcerowsecurity,
        'acl', coalesce((
          SELECT jsonb_agg(
            jsonb_build_object(
              'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
              'grantor', pg_get_userbyid(a.grantor),
              'privilege', a.privilege_type,
              'grantable', a.is_grantable
            )
            ORDER BY CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
                     pg_get_userbyid(a.grantor), a.privilege_type, a.is_grantable::text
          )
          FROM aclexplode(c.relacl) a
          WHERE c.relacl IS NOT NULL
        ), '[]'::jsonb)
      )
      ORDER BY n.nspname, c.relname
    ), '[]'::jsonb)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r','p')
      AND (
        n.nspname IN ('financial_core','financial_private')
        OR (n.nspname = 'public' AND c.relname LIKE 'financial_%')
      )
  ),
  'columns', (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'relation', c.relname,
        'ordinal', a.attnum,
        'name', a.attname,
        'type', format_type(a.atttypid, NULL),
        'typmod', CASE WHEN a.atttypmod >= 0 THEN a.atttypmod ELSE NULL END,
        'nullable', NOT a.attnotnull,
        'default', pg_get_expr(ad.adbin, ad.adrelid),
        'identity', CASE a.attidentity WHEN 'a' THEN 'always' WHEN 'd' THEN 'by_default' ELSE NULL END,
        'generated', CASE a.attgenerated WHEN 's' THEN 'stored' ELSE NULL END,
        'collation', NULLIF(coll.collname, '')
      )
      ORDER BY n.nspname, c.relname, a.attnum
    ), '[]'::jsonb)
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
    LEFT JOIN pg_collation coll ON coll.oid = a.attcollation AND a.attcollation <> 0
    WHERE a.attnum > 0 AND NOT a.attisdropped
      AND c.relkind IN ('r','p')
      AND (
        n.nspname IN ('financial_core','financial_private')
        OR (n.nspname = 'public' AND c.relname LIKE 'financial_%')
      )
  ),
  'types', (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'name', t.typname,
        'kind', CASE t.typtype WHEN 'e' THEN 'enum' WHEN 'd' THEN 'domain' WHEN 'c' THEN 'composite' ELSE t.typtype::text END,
        'labels', CASE
          WHEN t.typtype = 'e' THEN coalesce((
            SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
            FROM pg_enum e WHERE e.enumtypid = t.oid
          ), '[]'::jsonb)
          ELSE '[]'::jsonb
        END,
        'owner', pg_get_userbyid(t.typowner),
        'acl', coalesce((
          SELECT jsonb_agg(
            jsonb_build_object(
              'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
              'grantor', pg_get_userbyid(a.grantor),
              'privilege', a.privilege_type,
              'grantable', a.is_grantable
            )
            ORDER BY CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
                     pg_get_userbyid(a.grantor), a.privilege_type, a.is_grantable::text
          )
          FROM aclexplode(t.typacl) a
          WHERE t.typacl IS NOT NULL
        ), '[]'::jsonb)
      )
      ORDER BY n.nspname, t.typname
    ), '[]'::jsonb)
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname IN ('public','financial_core','financial_private')
      AND t.typtype IN ('e','d','c')
      AND (n.nspname LIKE 'financial_%' OR t.typname LIKE 'financial_%')
  ),
  'views', (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'name', c.relname,
        'kind', CASE c.relkind WHEN 'm' THEN 'matview' ELSE 'view' END,
        'definition', pg_get_viewdef(c.oid, true),
        'security_invoker', coalesce((c.reloptions::text LIKE '%security_invoker=true%'), false),
        'security_barrier', coalesce((c.reloptions::text LIKE '%security_barrier=true%'), false),
        'owner', pg_get_userbyid(c.relowner),
        'acl', coalesce((
          SELECT jsonb_agg(
            jsonb_build_object(
              'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
              'grantor', pg_get_userbyid(a.grantor),
              'privilege', a.privilege_type,
              'grantable', a.is_grantable
            )
            ORDER BY CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
                     pg_get_userbyid(a.grantor), a.privilege_type, a.is_grantable::text
          )
          FROM aclexplode(c.relacl) a
          WHERE c.relacl IS NOT NULL
        ), '[]'::jsonb)
      )
      ORDER BY n.nspname, c.relname
    ), '[]'::jsonb)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('v','m')
      AND (
        n.nspname IN ('financial_core','financial_private')
        OR (n.nspname = 'public' AND c.relname LIKE 'financial_%')
      )
  ),
  'routines', (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'name', p.proname,
        'identity_arguments', pg_get_function_identity_arguments(p.oid),
        'result_type', pg_get_function_result(p.oid),
        'language', l.lanname,
        'owner', pg_get_userbyid(p.proowner),
        'functiondef', pg_get_functiondef(p.oid),
        'volatility', CASE p.provolatile WHEN 'i' THEN 'immutable' WHEN 's' THEN 'stable' ELSE 'volatile' END,
        'parallel', CASE p.proparallel WHEN 's' THEN 'safe' WHEN 'r' THEN 'restricted' ELSE 'unsafe' END,
        'strict', p.proisstrict,
        'leakproof', p.proleakproof,
        'security_definer', p.prosecdef,
        'proconfig', coalesce(to_jsonb(p.proconfig), '[]'::jsonb),
        'search_path', coalesce(p.proconfig::text, ''),
        'acl', coalesce((
          SELECT jsonb_agg(
            jsonb_build_object(
              'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
              'grantor', pg_get_userbyid(a.grantor),
              'privilege', a.privilege_type,
              'grantable', a.is_grantable
            )
            ORDER BY CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
                     pg_get_userbyid(a.grantor), a.privilege_type, a.is_grantable::text
          )
          FROM aclexplode(p.proacl) a
          WHERE p.proacl IS NOT NULL
        ), '[]'::jsonb)
      )
      ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
    ), '[]'::jsonb)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname IN ('public','financial_core','financial_private')
      AND (n.nspname LIKE 'financial_%' OR p.proname ~ 'financial|f3_|guard_ledger')
  ),
  'rls', (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'relation', c.relname,
        'rls_enabled', c.relrowsecurity,
        'rls_force', c.relforcerowsecurity
      )
      ORDER BY n.nspname, c.relname
    ), '[]'::jsonb)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r','p')
      AND (
        n.nspname IN ('financial_core','financial_private')
        OR (n.nspname = 'public' AND c.relname LIKE 'financial_%')
      )
  ),
  'policies', (
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
  'acls', (
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
        CASE WHEN c.relacl IS NULL THEN '' WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
        CASE WHEN c.relacl IS NULL THEN '' ELSE pg_get_userbyid(a.grantor) END AS grantor,
        CASE WHEN c.relacl IS NULL THEN '' ELSE a.privilege_type END AS privilege,
        CASE WHEN c.relacl IS NULL THEN false ELSE a.is_grantable END AS grantable
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
        CASE WHEN p.proacl IS NULL THEN '' WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
        CASE WHEN p.proacl IS NULL THEN '' ELSE pg_get_userbyid(a.grantor) END,
        CASE WHEN p.proacl IS NULL THEN '' ELSE a.privilege_type END,
        CASE WHEN p.proacl IS NULL THEN false ELSE a.is_grantable END
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      LEFT JOIN LATERAL aclexplode(p.proacl) a ON p.proacl IS NOT NULL
      WHERE n.nspname IN ('public','financial_core','financial_private')
        AND (n.nspname LIKE 'financial_%' OR p.proname ~ 'financial|f3_|guard_ledger')
    ) x
  ),
  'constraints', (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'relation', c.relname,
        'name', con.conname,
        'contype', con.contype::text,
        'definition', pg_get_constraintdef(con.oid)
      )
      ORDER BY n.nspname, c.relname, con.conname
    ), '[]'::jsonb)
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE (
      n.nspname IN ('financial_core','financial_private')
      OR (n.nspname = 'public' AND c.relname LIKE 'financial_%')
    )
  ),
  'indexes', (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'relation', t.relname,
        'name', ic.relname,
        'unique', i.indisunique,
        'definition', pg_get_indexdef(i.indexrelid)
      )
      ORDER BY n.nspname, t.relname, ic.relname
    ), '[]'::jsonb)
    FROM pg_index i
    JOIN pg_class ic ON ic.oid = i.indexrelid
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE NOT i.indisprimary
      AND (
        n.nspname IN ('financial_core','financial_private')
        OR (n.nspname = 'public' AND t.relname LIKE 'financial_%')
      )
  ),
  'triggers', (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'relation', c.relname,
        'name', t.tgname,
        'constraint_trigger', t.tgconstraint <> 0,
        'timing_events', pg_get_triggerdef(t.oid),
        'for_each', CASE WHEN (t.tgtype & 1) = 1 THEN 'row' ELSE 'statement' END,
        'function_identity', format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
      )
      ORDER BY n.nspname, c.relname, t.tgname
    ), '[]'::jsonb)
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal
      AND (
        n.nspname IN ('financial_core','financial_private')
        OR (n.nspname = 'public' AND c.relname LIKE 'financial_%')
      )
  ),
  'hgp', (
    SELECT jsonb_build_object(
      'schema', 'public',
      'name', 'has_group_permission',
      'identity_arguments', pg_get_function_identity_arguments(p.oid),
      'result_type', pg_get_function_result(p.oid),
      'language', l.lanname,
      'owner', pg_get_userbyid(p.proowner),
      'security_definer', p.prosecdef,
      'proconfig', coalesce(to_jsonb(p.proconfig), '[]'::jsonb),
      'def_md5', md5(pg_get_functiondef(p.oid)),
      'src_md5', md5(p.prosrc),
      'count', (SELECT count(*) FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
                WHERE n2.nspname = 'public' AND p2.proname = 'has_group_permission')
    )
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public' AND p.proname = 'has_group_permission'
    LIMIT 1
  ),
  'enqueue', (
    SELECT jsonb_build_object(
      'schema', 'public',
      'name', 'enqueue_outbound_notification',
      'identity_arguments', pg_get_function_identity_arguments(p.oid),
      'result_type', pg_get_function_result(p.oid),
      'language', l.lanname,
      'owner', pg_get_userbyid(p.proowner),
      'security_definer', p.prosecdef,
      'proconfig', coalesce(to_jsonb(p.proconfig), '[]'::jsonb),
      'def_md5', md5(pg_get_functiondef(p.oid)),
      'src_md5', md5(p.prosrc),
      'count', (SELECT count(*) FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
                WHERE n2.nspname = 'public' AND p2.proname = 'enqueue_outbound_notification')
    )
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public' AND p.proname = 'enqueue_outbound_notification'
    LIMIT 1
  )
)::text
`;

/**
 * Catalog-boundary object-probe identity fields. OIDs may be used only
 * inside SQL to resolve/join; they MUST NOT appear here, in expected
 * constants, in cross-database fingerprints, or in evidence hashes.
 */
export const OBJECT_PROBE_IDENTITY_FIELDS = Object.freeze([
  "object_type",
  "schema",
  "object_name",
  "prokind",
  "identity_arguments",
]);

const OBJECT_PROBE_IDENTITY_KEYSET = Object.freeze([...OBJECT_PROBE_IDENTITY_FIELDS].sort());
const OBJECT_PROBE_OID_KEYS = Object.freeze([
  "oid",
  "pronamespace",
  "regprocedure",
  "regproc",
  "regclass",
  "regtype",
  "regnamespace",
  "tableoid",
]);

const OBJECT_PROBE_RESOLVER_RE =
  /^(to_regprocedure|to_regclass|to_regtype|to_regnamespace)\('([^']+)'\)$/;

function frozenObjectProbeDescriptor(descriptor) {
  const keys = Object.keys(descriptor).sort();
  if (keys.length !== OBJECT_PROBE_IDENTITY_KEYSET.length
    || keys.some((key, i) => key !== OBJECT_PROBE_IDENTITY_KEYSET[i])) {
    throw new Error("HOLD: frozen object-probe descriptor keys are not the exact catalog field set");
  }
  for (const field of OBJECT_PROBE_IDENTITY_FIELDS) {
    if (typeof descriptor[field] !== "string") {
      throw new Error(`HOLD: frozen object-probe descriptor field ${field} is not a string`);
    }
  }
  for (const key of OBJECT_PROBE_OID_KEYS) {
    if (Object.prototype.hasOwnProperty.call(descriptor, key)) {
      throw new Error("HOLD: frozen object-probe descriptor must not include OID fields");
    }
  }
  return Object.freeze({ ...descriptor });
}

/**
 * Frozen object-probe expected descriptors.
 *
 * Provenance: derived offline from the frozen SQL/security contract
 * (CREATE SCHEMA / CREATE TABLE / CREATE TYPE / CREATE FUNCTION in
 * 00118–00123) together with TARGET_OBJECT_PROBES lookup keys.
 * Routine identity_arguments use PostgreSQL catalog spelling
 * (`timestamp with time zone`), never the `timestamptz` lookup alias.
 * Committed before any DB access. NEVER assigned from live observed
 * catalog. OIDs are never stored.
 */
export const FROZEN_EXPECTED_OBJECT_PROBE_DESCRIPTORS = deepFreeze({
  "00118_f3_bounded_financial_epoch_foundation.sql": Object.freeze([
    frozenObjectProbeDescriptor({
      object_type: "namespace",
      schema: "financial_private",
      object_name: "financial_private",
      prokind: "",
      identity_arguments: "",
    }),
    frozenObjectProbeDescriptor({
      object_type: "class",
      schema: "public",
      object_name: "financial_ledger_epochs",
      prokind: "",
      identity_arguments: "",
    }),
  ]),
  "00119_f3_01_core_ledger_foundation.sql": Object.freeze([
    frozenObjectProbeDescriptor({
      object_type: "namespace",
      schema: "financial_core",
      object_name: "financial_core",
      prokind: "",
      identity_arguments: "",
    }),
    frozenObjectProbeDescriptor({
      object_type: "class",
      schema: "public",
      object_name: "financial_accounts",
      prokind: "",
      identity_arguments: "",
    }),
    frozenObjectProbeDescriptor({
      object_type: "class",
      schema: "public",
      object_name: "financial_events",
      prokind: "",
      identity_arguments: "",
    }),
    frozenObjectProbeDescriptor({
      object_type: "class",
      schema: "public",
      object_name: "financial_postings",
      prokind: "",
      identity_arguments: "",
    }),
    frozenObjectProbeDescriptor({
      object_type: "type",
      schema: "public",
      object_name: "financial_event_class",
      prokind: "",
      identity_arguments: "",
    }),
  ]),
  "00120_f3_02_secure_posting_idempotency.sql": Object.freeze([
    frozenObjectProbeDescriptor({
      object_type: "routine",
      schema: "public",
      object_name: "post_financial_command",
      prokind: "f",
      identity_arguments: "p_command jsonb",
    }),
  ]),
  "00121_f3_03_projection_read_proof.sql": Object.freeze([
    frozenObjectProbeDescriptor({
      object_type: "routine",
      schema: "public",
      object_name: "get_financial_projection_bundle",
      prokind: "f",
      identity_arguments:
        "p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_as_of_exclusive timestamp with time zone",
    }),
    frozenObjectProbeDescriptor({
      object_type: "routine",
      schema: "public",
      object_name: "get_financial_cashbook",
      prokind: "f",
      identity_arguments:
        "p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_account_id uuid, p_currency text, p_offset integer, p_limit integer",
    }),
  ]),
  "00122_f3_04_correction_reversal.sql": Object.freeze([
    frozenObjectProbeDescriptor({
      object_type: "routine",
      schema: "public",
      object_name: "correct_financial_event",
      prokind: "f",
      identity_arguments: "p_command jsonb",
    }),
  ]),
  "00123_f3_05_opening_cash_command.sql": Object.freeze([
    frozenObjectProbeDescriptor({
      object_type: "routine",
      schema: "public",
      object_name: "post_financial_opening_cash",
      prokind: "f",
      identity_arguments: "p_command jsonb",
    }),
  ]),
});

export function getFrozenExpectedObjectProbeDescriptors(file) {
  const descriptors = FROZEN_EXPECTED_OBJECT_PROBE_DESCRIPTORS[file];
  if (!Array.isArray(descriptors) || descriptors.length === 0) {
    throw new Error(`HOLD: no frozen object-probe descriptors for ${file}`);
  }
  const expressions = TARGET_OBJECT_PROBES[file] || [];
  if (expressions.length !== descriptors.length) {
    throw new Error(`HOLD: frozen object-probe descriptors do not pair with TARGET_OBJECT_PROBES for ${file}`);
  }
  return structuredClone(descriptors);
}

export function assertExpectedObjectProbeDescriptorsImmutable(file) {
  const live = FROZEN_EXPECTED_OBJECT_PROBE_DESCRIPTORS[file];
  if (!live) {
    throw new Error(`HOLD: no frozen object-probe descriptors for ${file}`);
  }
  const clone = getFrozenExpectedObjectProbeDescriptors(file);
  if (JSON.stringify(live) !== JSON.stringify(clone)) {
    throw new Error(`HOLD: frozen object-probe descriptors mutated for ${file}`);
  }
  return { file, unchanged: true, count: live.length };
}

function classifyObjectProbeExpression(expression) {
  const text = String(expression || "").trim();
  const match = text.match(OBJECT_PROBE_RESOLVER_RE);
  if (!match) return null;
  return { resolver: match[1], lookup: match[2], expression: text };
}

function objectProbeSelectSql(expression) {
  const classified = classifyObjectProbeExpression(expression);
  if (!classified) {
    throw new Error(`HOLD: malformed object-probe expression: ${expression}`);
  }
  const resolver = classified.expression;
  if (classified.resolver === "to_regprocedure") {
    return `(
      SELECT jsonb_build_object(
        'object_type', 'routine'::text,
        'schema', n.nspname,
        'object_name', p.proname,
        'prokind', p.prokind::text,
        'identity_arguments', pg_get_function_identity_arguments(p.oid)
      )
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.oid = ${resolver}
    )`;
  }
  if (classified.resolver === "to_regclass") {
    return `(
      SELECT jsonb_build_object(
        'object_type', 'class'::text,
        'schema', n.nspname,
        'object_name', c.relname,
        'prokind', ''::text,
        'identity_arguments', ''::text
      )
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.oid = ${resolver}
    )`;
  }
  if (classified.resolver === "to_regtype") {
    return `(
      SELECT jsonb_build_object(
        'object_type', 'type'::text,
        'schema', n.nspname,
        'object_name', t.typname,
        'prokind', ''::text,
        'identity_arguments', ''::text
      )
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.oid = ${resolver}
    )`;
  }
  return `(
    SELECT jsonb_build_object(
      'object_type', 'namespace'::text,
      'schema', n.nspname,
      'object_name', n.nspname,
      'prokind', ''::text,
      'identity_arguments', ''::text
    )
    FROM pg_namespace n
    WHERE n.oid = ${resolver}
  )`;
}

/**
 * Catalog-boundary object probe. to_regprocedure / to_regclass /
 * to_regtype / to_regnamespace resolve the intended object (must be
 * non-null). The OID is used only to join pg_proc+pg_namespace (or the
 * matching catalog). Output is structured identity fields — never
 * to_regprocedure(...)::text compared with lookup spelling, never OID
 * columns, never JS-rebuilt argument lists.
 */
export function objectProbeSql(expressions) {
  if (!Array.isArray(expressions) || expressions.length === 0) {
    throw new Error("HOLD: object probe expressions missing");
  }
  const selects = expressions.map((expr, i) => `${objectProbeSelectSql(expr)} AS p${i}`);
  return `SELECT\n  ${selects.join(",\n  ")};`;
}

function structuredObjectProbeIdentityExact(observed, expected) {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    return { ok: false, reason: "expected probe descriptor missing" };
  }
  if (!observed || typeof observed !== "object" || Array.isArray(observed)) {
    return { ok: false, reason: "observed probe identity is not a structured object" };
  }
  const observedKeys = Object.keys(observed).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (
    observedKeys.length !== OBJECT_PROBE_IDENTITY_KEYSET.length
    || observedKeys.some((key, i) => key !== OBJECT_PROBE_IDENTITY_KEYSET[i])
  ) {
    return { ok: false, reason: "observed probe identity keys are not the exact catalog field set" };
  }
  if (
    expectedKeys.length !== OBJECT_PROBE_IDENTITY_KEYSET.length
    || expectedKeys.some((key, i) => key !== OBJECT_PROBE_IDENTITY_KEYSET[i])
  ) {
    return { ok: false, reason: "expected probe descriptor keys are not the exact catalog field set" };
  }
  for (const key of OBJECT_PROBE_OID_KEYS) {
    if (Object.prototype.hasOwnProperty.call(observed, key)
      || Object.prototype.hasOwnProperty.call(expected, key)) {
      return { ok: false, reason: "probe identity must not include OID or catalog-number fields" };
    }
  }
  for (const field of OBJECT_PROBE_IDENTITY_FIELDS) {
    if (typeof observed[field] !== "string" || typeof expected[field] !== "string") {
      return { ok: false, reason: `probe identity field ${field} is not a string` };
    }
    if (observed[field] !== expected[field]) {
      return { ok: false, reason: `structured identity mismatch on ${field}` };
    }
  }
  return { ok: true };
}

function objectProbeIdentityFingerprint(identity) {
  return JSON.stringify(OBJECT_PROBE_IDENTITY_FIELDS.map((field) => identity[field]));
}

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
  if (key === "acl" || key === "acls") return parseLegacyAcl(value);
  if (key === "policy" || key === "policies") return parseLegacyPolicy(value);
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
    // Nested identity fields reuse names like `schema` / `name`. Those
    // scalars are not collections. Only canonicalize actual collections.
    if (typeof value === "string" && key === "schema" && !value.includes(":")) {
      // Nested identity fields reuse the name `schema` (e.g. "public").
      // Those scalars are not collections. Top-level schema inventory
      // always uses schema:owner and therefore contains ":".
      return value;
    }
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

export const EVIDENCE_INDEX_FILENAME = "evidence-index.json";
export const EVIDENCE_INDEX_CHECKSUM_FILENAME = "evidence-index.sha256";
export const EVIDENCE_INDEX_EXCLUSIONS = Object.freeze([
  EVIDENCE_INDEX_FILENAME,
  EVIDENCE_INDEX_CHECKSUM_FILENAME,
]);
export const YAML_ERROR_MARKER = "error: |-";

function sha256Utf8(text) {
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sanitizeEvidenceOutBytes(raw, extraSecrets = []) {
  const secrets = extraSecrets.filter(Boolean).map(String);
  const input = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw ?? ""), "utf8");
  let text = input.toString("utf8");
  for (const secret of secrets) {
    if (!secret) continue;
    text = text.split(secret).join("[REDACTED]");
  }
  text = text.replace(
    /postgres(?:\.[A-Za-z0-9]+)?:[^@\s]+@/g,
    "postgres:[REDACTED]@",
  );
  return Buffer.from(text, "utf8");
}

export function extractExactPostgresError(text) {
  const blob = String(text || "");
  const lines = blob.split(/\r?\n/);
  const pgLines = lines
    .map((line) => line.trim())
    .filter((line) => /(?:^|[\s:])(?:ERROR|FATAL|PANIC):\s+\S/.test(line));
  if (pgLines.length > 0) {
    const chosen = pgLines[0].replace(/^\s*-\s*/, "").trim();
    if (chosen && chosen !== YAML_ERROR_MARKER && !/^error:\s*\|-?\s*$/.test(chosen)) {
      return chosen;
    }
  }
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^error:\s*\|-?\s*$/.test(lines[i].trim())) continue;
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j].replace(/^\s+/, "").trim();
      if (!next || next === YAML_ERROR_MARKER || /^error:\s*\|-?\s*$/.test(next)) continue;
      if (/^(code|name|stack|expected|actual|operator):\s*/.test(next)) break;
      if (/^(ERROR|FATAL|PANIC):/.test(next) || next.length > 0) {
        return next;
      }
    }
  }
  return null;
}

export function buildSuiteMetaFromSanitizedOut({ sanitizedOut, tests = [] } = {}) {
  const bytes = Buffer.isBuffer(sanitizedOut)
    ? sanitizedOut
    : Buffer.from(String(sanitizedOut ?? ""), "utf8");
  const text = bytes.toString("utf8");
  const listed = Array.isArray(tests) ? tests : [];
  return {
    sha256: sha256Bytes(bytes),
    bytes: bytes.byteLength,
    encoding: "utf8",
    sanitized_before_hash: true,
    tests: listed.map((test) => {
      const rawError = test?.exact_error ?? test?.error ?? test?.output ?? "";
      const exact = extractExactPostgresError(
        `${rawError}\n${test?.output || ""}\n${test?.stderr || ""}\n${text}`,
      );
      return {
        name: test?.name ?? null,
        ok: test?.ok ?? null,
        exact_error: exact,
      };
    }),
  };
}

export function writeSuiteMetaForOutFile(outPath, { tests = [], extraSecrets = [] } = {}) {
  const raw = fs.readFileSync(outPath);
  const sanitized = sanitizeEvidenceOutBytes(raw, extraSecrets);
  if (Buffer.compare(raw, sanitized) !== 0) {
    fs.writeFileSync(outPath, sanitized);
  }
  const meta = buildSuiteMetaFromSanitizedOut({ sanitizedOut: sanitized, tests });
  const metaPath = outPath.endsWith(".out")
    ? `${outPath.slice(0, -4)}.meta.json`
    : `${outPath}.meta.json`;
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  return { metaPath, meta, sanitizedBytes: sanitized.byteLength };
}

export function buildEvidenceIndex({ artifacts = [], exclusions = EVIDENCE_INDEX_EXCLUSIONS } = {}) {
  const excluded = new Set(exclusions);
  const listed = [...artifacts]
    .map((item) => (typeof item === "string" ? { path: item } : item))
    .filter((item) => item && item.path && !excluded.has(path.basename(item.path)))
    .sort((a, b) => String(a.path).localeCompare(String(b.path)));
  return {
    version: 1,
    exclusions: [...excluded].sort(),
    self_hash: false,
    detached_checksum: EVIDENCE_INDEX_CHECKSUM_FILENAME,
    artifacts: listed,
  };
}

export function writeEvidenceIndexAndChecksum(dir, artifacts = []) {
  const index = buildEvidenceIndex({ artifacts });
  const indexPath = path.join(dir, EVIDENCE_INDEX_FILENAME);
  const checksumPath = path.join(dir, EVIDENCE_INDEX_CHECKSUM_FILENAME);
  const body = `${JSON.stringify(index, null, 2)}\n`;
  fs.writeFileSync(indexPath, body);
  fs.writeFileSync(checksumPath, `${sha256Utf8(body)}\n`);
  return { indexPath, checksumPath, index, sha256: sha256Utf8(body) };
}

export function verifyEvidenceIndex(dir) {
  const indexPath = path.join(dir, EVIDENCE_INDEX_FILENAME);
  const checksumPath = path.join(dir, EVIDENCE_INDEX_CHECKSUM_FILENAME);
  if (!fs.existsSync(indexPath)) {
    return { ok: false, reason: "evidence-index.json missing" };
  }
  if (!fs.existsSync(checksumPath)) {
    return { ok: false, reason: "detached evidence-index.sha256 missing" };
  }
  const body = fs.readFileSync(indexPath, "utf8");
  const expected = fs.readFileSync(checksumPath, "utf8").trim();
  const actual = sha256Utf8(body);
  if (actual !== expected) {
    return { ok: false, reason: "evidence-index.sha256 does not match evidence-index.json" };
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, reason: "evidence-index.json is not JSON" };
  }
  if (parsed.self_hash === true) {
    return { ok: false, reason: "evidence-index.json must not self-hash" };
  }
  const names = (parsed.artifacts || []).map((item) => path.basename(item.path || item));
  if (names.includes(EVIDENCE_INDEX_FILENAME) || names.includes(EVIDENCE_INDEX_CHECKSUM_FILENAME)) {
    return { ok: false, reason: "evidence-index lists itself or its detached checksum" };
  }
  return { ok: true, sha256: actual, index: parsed };
}

export function writeQualifyEvidenceArtifacts({ dest, sanitizedJson, extraSecrets = [] } = {}) {
  const abs = path.resolve(dest);
  const sanitized = sanitizeEvidenceOutBytes(sanitizedJson, extraSecrets);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, sanitized);
  const meta = writeSuiteMetaForOutFile(abs, {
    tests: [{
      name: "qualify-f3-db-push-disposable",
      ok: null,
      output: sanitized.toString("utf8"),
    }],
    extraSecrets,
  });
  const dir = path.dirname(abs);
  const index = writeEvidenceIndexAndChecksum(dir, [
    { path: path.basename(abs), sha256: sha256Bytes(sanitized), bytes: sanitized.byteLength },
    { path: path.basename(meta.metaPath), sha256: sha256Utf8(fs.readFileSync(meta.metaPath, "utf8")) },
  ]);
  return { outPath: abs, ...meta, ...index };
}

function sourceLabelForFile(file) {
  const match = String(file).match(/^(0011[89]|0012[0-3])/);
  return match ? match[1] : String(file).replace(/\.sql$/i, "");
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function emptyGrantList() {
  return [];
}

function reconstructFunctiondef(routine) {
  const lines = [
    `CREATE FUNCTION ${routine.schema}.${routine.name}(${routine.identity_arguments})`,
    ` RETURNS ${routine.result_type}`,
    ` LANGUAGE ${routine.language}`,
  ];
  if (routine.volatility && routine.volatility !== "volatile") {
    lines.push(` ${String(routine.volatility).toUpperCase()}`);
  }
  if (routine.strict) lines.push(" STRICT");
  if (routine.leakproof) lines.push(" LEAKPROOF");
  if (routine.security_definer) lines.push(" SECURITY DEFINER");
  if (routine.parallel && routine.parallel !== "unsafe") {
    lines.push(` PARALLEL ${String(routine.parallel).toUpperCase()}`);
  }
  if (Array.isArray(routine.proconfig) && routine.proconfig.includes('search_path=""')) {
    lines.push(" SET search_path TO ''");
  }
  lines.push(`AS $function$${routine.definition || ""}$function$`);
  return lines.join("\n");
}

function stripSqlLineComments(sql) {
  const out = [];
  let i = 0;
  let dollar = null;
  while (i < sql.length) {
    if (dollar) {
      const end = sql.indexOf(dollar, i);
      if (end < 0) {
        out.push(sql.slice(i));
        break;
      }
      out.push(sql.slice(i, end + dollar.length));
      i = end + dollar.length;
      dollar = null;
      continue;
    }
    if (sql[i] === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i += 1;
      out.push("\n");
      continue;
    }
    if (sql[i] === "$") {
      const m = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (m) {
        dollar = m[0];
        out.push(m[0]);
        i += m[0].length;
        continue;
      }
    }
    out.push(sql[i]);
    i += 1;
  }
  return out.join("");
}

function splitQualifiedName(name, fallbackSchema = "public") {
  const text = String(name).replace(/"/g, "");
  const idx = text.indexOf(".");
  if (idx > 0) return { schema: text.slice(0, idx), name: text.slice(idx + 1) };
  return { schema: fallbackSchema, name: text };
}

function canonicalSqlType(raw) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\btimestamptz\b/gi, "timestamp with time zone")
    .replace(/\bint4\b/gi, "integer")
    .replace(/\bint8\b/gi, "bigint")
    .replace(/\bint2\b/gi, "smallint")
    .replace(/\bbool\b/gi, "boolean")
    .replace(/\bvarchar\b/gi, "character varying");
}

function stripDefaultClauses(identityArgs) {
  return canonicalSqlType(String(identityArgs || "").replace(/\s+DEFAULT\s+(?:NULL|'[^']*'|[^\s,]+)/gi, ""));
}

function splitTopLevelSql(text, sep = ",") {
  const parts = [];
  let start = 0;
  let depth = 0;
  let dollar = null;
  for (let i = 0; i < text.length; i += 1) {
    if (dollar) {
      if (text.startsWith(dollar, i)) {
        i += dollar.length - 1;
        dollar = null;
      }
      continue;
    }
    if (text[i] === "$") {
      const m = text.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (m) {
        dollar = m[0];
        i += m[0].length - 1;
        continue;
      }
    }
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") depth = Math.max(0, depth - 1);
    else if (text[i] === sep && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

function parseEnumLabels(body) {
  const labels = [];
  const re = /'((?:\\'|[^'])*)'/g;
  let match;
  while ((match = re.exec(String(body)))) labels.push(match[1].replace(/\\'/g, "'"));
  return labels;
}

function parseCreateFunction(sql, start) {
  const headerEnd = sql.slice(start).search(/\bAS\s+\$/i);
  if (headerEnd < 0) return null;
  const header = sql.slice(start, start + headerEnd);
  const named = header.match(/^CREATE\s+FUNCTION\s+([A-Za-z0-9_.]+)\s*\(/i);
  if (!named) return null;
  const q = splitQualifiedName(named[1]);
  const argsOpen = header.indexOf("(");
  let depth = 0;
  let argsClose = -1;
  for (let i = argsOpen; i < header.length; i += 1) {
    if (header[i] === "(") depth += 1;
    else if (header[i] === ")") {
      depth -= 1;
      if (depth === 0) {
        argsClose = i;
        break;
      }
    }
  }
  if (argsClose < 0) return null;
  const identityArguments = stripDefaultClauses(header.slice(argsOpen + 1, argsClose));
  const after = header.slice(argsClose + 1);
  const ret = after.match(/RETURNS\s+((?:TABLE\s*\([\s\S]+?\)|[A-Za-z0-9_.]+(?:\s+with\s+time\s+zone)?))/i);
  const lang = after.match(/LANGUAGE\s+([A-Za-z0-9_]+)/i);
  const asMatch = sql.slice(start + headerEnd).match(/^AS\s+(\$[A-Za-z0-9_]*\$)/i);
  if (!asMatch) return null;
  const delim = asMatch[1];
  const rel = sql.slice(start + headerEnd);
  const bodyStart = start + headerEnd + rel.indexOf(delim) + delim.length;
  const bodyEnd = sql.indexOf(delim, bodyStart);
  if (bodyEnd < 0) return null;
  const definition = sql.slice(bodyStart, bodyEnd);
  const searchPath = /\bSET\s+search_path\s*=\s*''/i.test(after);
  const routine = {
    schema: q.schema,
    name: q.name,
    identity_arguments: identityArguments,
    result_type: canonicalSqlType(ret ? ret[1].replace(/\s+/g, " ").trim() : ""),
    language: lang ? lang[1].toLowerCase() : "plpgsql",
    owner: "postgres",
    definition,
    volatility: /\bIMMUTABLE\b/i.test(after) ? "immutable" : /\bSTABLE\b/i.test(after) ? "stable" : "volatile",
    parallel: /\bPARALLEL\s+SAFE\b/i.test(after) ? "safe" : /\bPARALLEL\s+RESTRICTED\b/i.test(after) ? "restricted" : "unsafe",
    strict: /\bSTRICT\b|\bRETURNS\s+NULL\s+ON\s+NULL\s+INPUT\b/i.test(after),
    leakproof: /\bLEAKPROOF\b/i.test(after),
    security_definer: /\bSECURITY\s+DEFINER\b/i.test(after),
    proconfig: searchPath ? ['search_path=""'] : [],
    search_path: searchPath ? "{\"search_path=\\\"\\\"\"}" : "",
    acl: emptyGrantList(),
  };
  routine.functiondef = reconstructFunctiondef(routine);
  return routine;
}

function parseCreateTable(sql, match, lastIndex) {
  const q = splitQualifiedName(match[1]);
  let depth = 1;
  let i = lastIndex;
  const start = i;
  for (; i < sql.length; i += 1) {
    if (sql[i] === "(") depth += 1;
    else if (sql[i] === ")") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const body = sql.slice(start, i);
  const items = splitTopLevelSql(body);
  const columns = [];
  const constraints = [];
  let ordinal = 0;
  for (const item of items) {
    if (/^(CONSTRAINT|PRIMARY KEY|UNIQUE|CHECK|EXCLUDE|FOREIGN KEY)\b/i.test(item)) {
      const named = item.match(/^CONSTRAINT\s+([A-Za-z0-9_]+)\s+([\s\S]+)$/i);
      constraints.push({
        schema: q.schema,
        relation: q.name,
        name: named ? named[1] : "",
        contype: /PRIMARY KEY/i.test(item) ? "p"
          : /UNIQUE/i.test(item) ? "u"
            : /EXCLUDE/i.test(item) ? "x"
              : /FOREIGN KEY|REFERENCES/i.test(item) ? "f"
                : "c",
        definition: named ? named[2].trim() : item,
      });
      continue;
    }
    const col = item.match(/^([A-Za-z0-9_]+)\s+([\s\S]+)$/);
    if (!col) continue;
    ordinal += 1;
    const rest = col[2];
    const typeMatch = rest.match(/^((?:[A-Za-z0-9_.]+(?:\s+with\s+time\s+zone)?(?:\s*\([^)]*\))?(?:\s*\[\])*)+)/i);
    const typeRaw = typeMatch ? typeMatch[1] : rest.split(/\s+/)[0];
    const typmodMatch = typeRaw.match(/\(([^)]*)\)$/);
    columns.push({
      schema: q.schema,
      relation: q.name,
      ordinal,
      name: col[1],
      type: canonicalSqlType(typeRaw.replace(/\s*\([^)]*\)$/, "")),
      typmod: typmodMatch ? typmodMatch[1] : null,
      nullable: !/\bNOT NULL\b/i.test(rest) && !/\bPRIMARY KEY\b/i.test(rest),
      default: (() => {
        const found = rest.match(/\bDEFAULT\s+((?:(?!\bCONSTRAINT\b|\bNOT NULL\b|\bNULL\b|\bPRIMARY KEY\b|\bUNIQUE\b|\bCHECK\b|\bREFERENCES\b|\bCOLLATE\b|\bGENERATED\b).)+)/i);
        return found ? found[1].trim() : null;
      })(),
      identity: /\bGENERATED\s+ALWAYS\s+AS\s+IDENTITY\b/i.test(rest)
        ? "always"
        : /\bGENERATED\s+BY DEFAULT\s+AS\s+IDENTITY\b/i.test(rest)
          ? "by_default"
          : null,
      generated: /\bGENERATED\s+ALWAYS\s+AS\b/i.test(rest) && !/\bIDENTITY\b/i.test(rest) ? "stored" : null,
      collation: (() => {
        const found = rest.match(/\bCOLLATE\s+([A-Za-z0-9_."]+)/i);
        return found ? found[1] : null;
      })(),
    });
    if (/\bPRIMARY KEY\b/i.test(rest)) {
      constraints.push({
        schema: q.schema,
        relation: q.name,
        name: `${q.name}_pkey`,
        contype: "p",
        definition: `PRIMARY KEY (${col[1]})`,
      });
    }
  }
  return {
    relation: {
      schema: q.schema,
      name: q.name,
      relkind: "r",
      persistence: "permanent",
      owner: "postgres",
      replica_identity: "default",
      rls_enabled: false,
      rls_force: false,
      acl: emptyGrantList(),
    },
    columns,
    constraints,
  };
}

function readAuthorizedMigrationSql(file) {
  const abs = path.join(repoRoot, "supabase", "migrations", file);
  if (!fs.existsSync(abs)) {
    throw new Error(`HOLD: authorized migration missing for offline fingerprint: ${file}`);
  }
  const bytes = fs.readFileSync(abs);
  const digest = sha256Buffer(bytes);
  if (digest !== FROZEN_DIGESTS[file]) {
    throw new Error(`HOLD: offline fingerprint builder saw digest drift for ${file}`);
  }
  return stripSqlLineComments(bytes.toString("utf8"));
}

function emptyCatalogState() {
  return {
    schemas: [],
    relations: [],
    columns: [],
    types: [],
    views: [],
    routines: [],
    rls: [],
    constraints: [],
    indexes: [],
    triggers: [],
    schemaAcl: {},
  };
}

function applyMigrationSqlToCatalog(state, sql) {
  const schemaRe = /CREATE\s+SCHEMA(?:\s+IF\s+NOT\s+EXISTS)?\s+([A-Za-z0-9_]+)/gi;
  let match;
  while ((match = schemaRe.exec(sql))) {
    if (!state.schemas.some((row) => row.name === match[1])) {
      state.schemas.push({ name: match[1], owner: "postgres", acl: emptyGrantList() });
    }
  }
  const usageGrant = /GRANT\s+USAGE\s+ON\s+SCHEMA\s+([A-Za-z0-9_]+)\s+TO\s+([A-Za-z0-9_,\s]+)/gi;
  while ((match = usageGrant.exec(sql))) {
    const schema = state.schemas.find((row) => row.name === match[1]);
    if (!schema) continue;
    for (const role of match[2].split(",").map((part) => part.trim()).filter(Boolean)) {
      schema.acl.push({
        grantee: role,
        grantor: "postgres",
        privilege: "USAGE",
        grantable: false,
      });
    }
  }
  const typeRe = /CREATE\s+TYPE\s+([A-Za-z0-9_.]+)\s+AS\s+ENUM\s*(\([\s\S]*?\))/gi;
  while ((match = typeRe.exec(sql))) {
    const q = splitQualifiedName(match[1]);
    state.types.push({
      schema: q.schema,
      name: q.name,
      kind: "enum",
      labels: parseEnumLabels(match[2]),
      owner: "postgres",
      acl: emptyGrantList(),
    });
  }
  const tableRe = /CREATE\s+TABLE\s+([A-Za-z0-9_.]+)\s*\(/gi;
  while ((match = tableRe.exec(sql))) {
    const parsed = parseCreateTable(sql, match, tableRe.lastIndex);
    state.relations.push(parsed.relation);
    state.columns.push(...parsed.columns);
    state.constraints.push(...parsed.constraints);
  }
  const fnRe = /CREATE\s+FUNCTION\s+/gi;
  while ((match = fnRe.exec(sql))) {
    const routine = parseCreateFunction(sql, match.index);
    if (routine) state.routines.push(routine);
  }
  const rlsEnable = /ALTER\s+TABLE\s+([A-Za-z0-9_.]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
  const rlsForce = /ALTER\s+TABLE\s+([A-Za-z0-9_.]+)\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/gi;
  const enabled = new Set();
  const forced = new Set();
  while ((match = rlsEnable.exec(sql))) enabled.add(match[1].replace(/"/g, ""));
  while ((match = rlsForce.exec(sql))) forced.add(match[1].replace(/"/g, ""));
  for (const rel of state.relations) {
    const key = `${rel.schema}.${rel.name}`;
    const alt = rel.schema === "public" ? rel.name : key;
    if (enabled.has(key) || enabled.has(alt)) rel.rls_enabled = true;
    if (forced.has(key) || forced.has(alt)) rel.rls_force = true;
  }
  const idxRe = /CREATE\s+(UNIQUE\s+)?INDEX\s+([A-Za-z0-9_]+)\s+ON\s+([A-Za-z0-9_.]+)\s*([\s\S]*?);/gi;
  while ((match = idxRe.exec(sql))) {
    const q = splitQualifiedName(match[3]);
    state.indexes.push({
      schema: q.schema,
      relation: q.name,
      name: match[2],
      unique: Boolean(match[1]),
      definition: `CREATE ${match[1] ? "UNIQUE " : ""}INDEX ${match[2]} ON ${match[3]} ${match[4].trim()}`,
    });
  }
  const trgRe = /CREATE\s+(CONSTRAINT\s+)?TRIGGER\s+([A-Za-z0-9_]+)\s+([\s\S]*?)\s+ON\s+([A-Za-z0-9_.]+)\s+([\s\S]*?)EXECUTE\s+FUNCTION\s+([A-Za-z0-9_.]+)\s*\(([\s\S]*?)\);/gi;
  while ((match = trgRe.exec(sql))) {
    const q = splitQualifiedName(match[4]);
    state.triggers.push({
      schema: q.schema,
      relation: q.name,
      name: match[2],
      constraint_trigger: Boolean(match[1]),
      timing_events: match[3].replace(/\s+/g, " ").trim(),
      for_each: /FOR EACH ROW/i.test(match[5]) ? "row" : /FOR EACH STATEMENT/i.test(match[5]) ? "statement" : "",
      function_identity: `${match[6]}(${stripDefaultClauses(match[7])})`,
    });
  }
  return state;
}

function explicitRlsRecords(relations) {
  return relations.map((rel) => ({
    schema: rel.schema,
    relation: rel.name,
    rls_enabled: rel.rls_enabled === true,
    rls_force: rel.rls_force === true,
  }));
}

function attachRoutineAclFromFunctionOwnerAndAcl(routines, functionOwner, aclRows) {
  for (const routine of routines) {
    const ownerRow = (functionOwner || []).find((row) => (
      row.schema === routine.schema
      && row.function === routine.name
      && row.identity_arguments === routine.identity_arguments
    ));
    if (ownerRow) {
      routine.owner = ownerRow.owner;
      routine.security_definer = ownerRow.security_definer;
      if (ownerRow.search_path) routine.search_path = ownerRow.search_path;
    }
    routine.acl = (aclRows || []).filter((row) => (
      row.object_type === "routine"
      && row.schema === routine.schema
      && row.object_name === routine.name
      && row.identity_arguments === routine.identity_arguments
    )).map((row) => ({
      grantee: row.grantee,
      grantor: row.grantor,
      privilege: row.privilege,
      grantable: row.grantable,
    }));
  }
  return routines;
}

function attachRelationAcl(relations, aclRows) {
  for (const rel of relations) {
    rel.acl = (aclRows || []).filter((row) => (
      row.object_type === "table"
      && row.schema === rel.schema
      && row.object_name === rel.name
    )).map((row) => ({
      grantee: row.grantee,
      grantor: row.grantor,
      privilege: row.privilege,
      grantable: row.grantable,
    }));
  }
  return relations;
}

/**
 * Offline expected fingerprint for one cumulative stage.
 * Built from frozen SQL bytes + the sealed security-contract seed.
 * Never assigned from a live catalog / observed inventory.
 */
export function buildExpandedExpectedFingerprint(file, structuredSeed) {
  if (!F3_FORWARD_FILES.includes(file)) {
    throw new Error(`HOLD: unknown file ${file}`);
  }
  const idx = F3_FORWARD_FILES.indexOf(file);
  const state = emptyCatalogState();
  for (const prior of F3_FORWARD_FILES.slice(0, idx + 1)) {
    applyMigrationSqlToCatalog(state, readAuthorizedMigrationSql(prior));
  }
  const seed = structuredSeed && typeof structuredSeed === "object" ? structuredSeed : {};
  const functionOwner = Array.isArray(seed.function_owner) ? seed.function_owner : [];
  const aclRows = Array.isArray(seed.acl) ? seed.acl : [];
  const policyRows = Array.isArray(seed.policy) ? seed.policy : [];
  attachRoutineAclFromFunctionOwnerAndAcl(state.routines, functionOwner, aclRows);
  attachRelationAcl(state.relations, aclRows);
  const fingerprint = {
    schema_version: F3_FULL_FINGERPRINT_SCHEMA_VERSION,
    schema: Array.isArray(seed.schema) ? cloneJson(seed.schema) : seed.schema,
    schemas: state.schemas.map((row) => ({
      name: row.name,
      owner: row.owner,
      acl: cloneJson(row.acl),
    })),
    function_owner: cloneJson(functionOwner),
    acl: cloneJson(aclRows),
    acls: cloneJson(aclRows),
    policy: cloneJson(policyRows),
    policies: cloneJson(policyRows),
    relations: cloneJson(state.relations),
    columns: cloneJson(state.columns),
    types: cloneJson(state.types),
    views: cloneJson(state.views),
    routines: cloneJson(state.routines.map((row) => {
      const { definition, ...rest } = row;
      return rest;
    })),
    rls: explicitRlsRecords(state.relations),
    constraints: cloneJson(state.constraints),
    indexes: cloneJson(state.indexes),
    triggers: cloneJson(state.triggers),
    hgp: { ...F3_HGP_PIN },
    enqueue: { ...F3_ENQUEUE_PIN },
    f3_objects_absent: seed.f3_objects_absent === true,
    migration_file: file,
    migration_source_label: sourceLabelForFile(file),
    migration_version: PREASSIGNED_VERSIONS[file],
    migration_name: String(file).replace(/\.sql$/i, ""),
    migration_digest: FROZEN_DIGESTS[file],
    recognition: [...RECOGNITION_ALLOWLIST],
  };
  return fingerprint;
}

function fingerprintContainsOid(value) {
  if (value == null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => fingerprintContainsOid(item));
  for (const key of Object.keys(value)) {
    if (/^(oid|pronamespace|regprocedure|regproc|regclass|regtype|regnamespace|tableoid)$/i.test(key)) {
      return true;
    }
    if (fingerprintContainsOid(value[key])) return true;
  }
  return false;
}

function nestedKeyContractErrors(fingerprint) {
  const errors = [];
  for (const [key, required] of Object.entries(F3_FULL_FINGERPRINT_NESTED_KEYS)) {
    if (!Object.prototype.hasOwnProperty.call(fingerprint, key)) continue;
    const value = fingerprint[key];
    if (key === "hgp" || key === "enqueue") {
      if (value == null || typeof value !== "object" || Array.isArray(value)) {
        errors.push(`${key} must be a structured object`);
        continue;
      }
      const keys = Object.keys(value).sort();
      const expected = [...required].sort();
      if (keys.length !== expected.length || keys.some((item, i) => item !== expected[i])) {
        errors.push(`${key} nested keys are not the exact contract`);
      }
      continue;
    }
    if (!Array.isArray(value)) {
      errors.push(`${key} must be an array`);
      continue;
    }
    const seen = new Set();
    for (const record of value) {
      if (record == null || typeof record !== "object" || Array.isArray(record)) {
        errors.push(`${key} record is not an object`);
        continue;
      }
      for (const field of required) {
        if (!Object.prototype.hasOwnProperty.call(record, field)) {
          errors.push(`${key} missing nested key ${field}`);
        }
      }
      for (const extra of Object.keys(record)) {
        if (!required.includes(extra)) {
          errors.push(`${key} unexpected nested key ${extra}`);
        }
      }
      const fingerprintKey = JSON.stringify(canonicalize(record));
      if (seen.has(fingerprintKey)) errors.push(`${key} duplicate records`);
      seen.add(fingerprintKey);
    }
  }
  return errors;
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
  ten_field_schema: Object.freeze({
    reason: TEN_FIELD_SCHEMA_SUPERSEDED_REASON,
    schema_version: TEN_FIELD_FINGERPRINT_SCHEMA_VERSION,
    "00118_f3_bounded_financial_epoch_foundation.sql": "0a403e8d3848e07769fcb453b78deebb1ad29217f4ed1d9c684dc64ca1b27a02",
    "00119_f3_01_core_ledger_foundation.sql": "ca61697371861b6a8b59b6be2505bacdc1491446410941ca4f4e3f89a5b1bbdf",
    "00120_f3_02_secure_posting_idempotency.sql": "9c10de93a78f837d84d9b9232c94e0bdb731c9e748763ca53f80349ad0b37161",
    "00121_f3_03_projection_read_proof.sql": "17ebfe3eb6a503056940b58965a86f88b2cad91bea4720c12ac4b9797e7f25af",
    "00122_f3_04_correction_reversal.sql": "07675b49e6321dff9bebfcd5c245e8fb56a97937b823d896032b008427439f16",
    "00123_f3_05_opening_cash_command.sql": "5017ff96ad59c6ca42c93719dfc92f3137ccb591f00bf1acf6bfbefcdf7ba965",
  }),
});

export const FROZEN_EXPECTED_FINGERPRINT_SHA256 = Object.freeze({
  "00118_f3_bounded_financial_epoch_foundation.sql": "ee5ece5603bee8e3afcb20888b87cd3e3bb9e334c7f56df0235181b49c91a309",
  "00119_f3_01_core_ledger_foundation.sql": "7ec7ba2f5e05f244939cc123266fda1efb330eb68ca389fc571f1b4df93aa419",
  "00120_f3_02_secure_posting_idempotency.sql": "6ee99d881bcf972f86a4a5e9c8932d491fc6b6e02daf34c99947fe1dca8b9e41",
  "00121_f3_03_projection_read_proof.sql": "22ec40e5979ae30947e139c77983ba793b914d5f5df9a2009234b0caf1172599",
  "00122_f3_04_correction_reversal.sql": "f66af826fb10ad4d5e2c3a8d3c6ba282d8e29fdd316fee6b6d4e9434faa62e92",
  "00123_f3_05_opening_cash_command.sql": "96696f7105843e1288e71d218d55607da47ec240516aa32f9d5b725bca665d3f",
});


function assertSealedExpectedHashesAtLoad() {
  const frozen = {};
  for (const file of Object.keys(FROZEN_EXPECTED_FINGERPRINTS_RAW)) {
    const structured = upgradeFingerprintToStructured(FROZEN_EXPECTED_FINGERPRINTS_RAW[file]);
    frozen[file] = deepFreeze(buildExpandedExpectedFingerprint(file, structured));
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
      schema_version: F3_FULL_FINGERPRINT_SCHEMA_VERSION,
      migration_file: file,
      migration_source_label: sourceLabelForFile(file),
      migration_version: PREASSIGNED_VERSIONS[file],
      migration_name: frozenMigrationName(file),
      migration_digest: FROZEN_DIGESTS[file],
      recognition: [...RECOGNITION_ALLOWLIST],
    };
  }
  const observed = {};
  const catalogKeyAllow = new Set([...FINGERPRINT_REQUIRED_KEYS, ...FINGERPRINT_OPTIONAL_CATALOG_KEYS]);
  for (const key of Object.keys(catalogInventory)) {
    if (catalogKeyAllow.has(key) && key !== "schema_version" && key !== "recognition") {
      observed[key] = catalogInventory[key];
    }
  }
  observed.schema_version = F3_FULL_FINGERPRINT_SCHEMA_VERSION;
  observed.migration_file = file;
  observed.migration_source_label = sourceLabelForFile(file);
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
 * One canonical full-fingerprint collector used at every qualify phase.
 * Catalog fields come ONLY from the live CATALOG_FINGERPRINT_SQL inventory
 * via buildIndependentObservedFingerprint. Meta fields come ONLY from
 * frozen pins. Never substitutes inventoryFromQuery as the fingerprint.
 * Never copies pre-repair meta onto a partial catalog snapshot.
 */
export const FULL_FINGERPRINT_COLLECTOR_ID = "canonical_full_fingerprint_collector";

export const FULL_FINGERPRINT_PHASES = Object.freeze({
  FROZEN_EXPECTED_BEFORE_DB: "frozen_expected_before_db",
  AFTER_COMMIT_FAILED_HISTORY: "after_commit_failed_history_before_repair",
  AFTER_POISON_CLEANUP: "after_poison_cleanup_verified_absent_before_repair",
  AFTER_SUCCESSFUL_REPAIR: "after_successful_repair",
  AFTER_RETRY_NO_PENDING: "after_retry_no_pending",
  AFTER_CLEAN_CONTINUATION: "after_clean_continuation",
});

export const POST_POISON_FULL_FINGERPRINT_HOLD =
  "HOLD: post-poison-cleanup full fingerprint capture missing, partial, malformed, or unequal; repair not spawned; no continuation";

export const POST_REPAIR_FULL_FINGERPRINT_HOLD =
  "HOLD: post-repair full fingerprint capture missing, partial, malformed, or unequal; retry not spawned; no continuation";

export const POST_RETRY_FULL_FINGERPRINT_HOLD =
  "HOLD: post-retry full fingerprint capture missing, partial, malformed, or unequal; no continuation";

export const POST_CONTINUATION_FULL_FINGERPRINT_HOLD =
  "HOLD: post-continuation full fingerprint capture missing, partial, malformed, or unequal; no continuation";

export function catalogInventoryFromFingerprint(fingerprint) {
  if (fingerprint == null || typeof fingerprint !== "object" || Array.isArray(fingerprint)) {
    return null;
  }
  const catalog = {};
  const metaOnly = new Set([
    "migration_file",
    "migration_source_label",
    "migration_version",
    "migration_name",
    "migration_digest",
    "recognition",
  ]);
  const allow = new Set([...FINGERPRINT_REQUIRED_KEYS, ...FINGERPRINT_OPTIONAL_CATALOG_KEYS]);
  for (const key of Object.keys(fingerprint)) {
    if (allow.has(key) && !metaOnly.has(key)) catalog[key] = fingerprint[key];
  }
  return catalog;
}

function catalogAndSecuritySlice(fingerprint) {
  return catalogInventoryFromFingerprint(fingerprint);
}

export function fingerprintKeyDiffs(left, right) {
  if (
    left == null ||
    right == null ||
    typeof left !== "object" ||
    typeof right !== "object" ||
    Array.isArray(left) ||
    Array.isArray(right)
  ) {
    return {
      comparable: false,
      equal: false,
      changedKeys: [],
      missingKeys: [],
      extraKeys: [],
    };
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  const missingKeys = leftKeys.filter((key) => !Object.prototype.hasOwnProperty.call(right, key)).sort();
  const extraKeys = rightKeys.filter((key) => !Object.prototype.hasOwnProperty.call(left, key)).sort();
  const changedKeys = [];
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) continue;
    const leftCanon = canonicalizeFingerprintForCompare(left[key], key);
    const rightCanon = canonicalizeFingerprintForCompare(right[key], key);
    if (isFingerprintCanonicalizationRejected(leftCanon) || isFingerprintCanonicalizationRejected(rightCanon)) {
      changedKeys.push(key);
      continue;
    }
    if (JSON.stringify(canonicalize(leftCanon)) !== JSON.stringify(canonicalize(rightCanon))) {
      changedKeys.push(key);
    }
  }
  changedKeys.sort();
  return {
    comparable: true,
    equal: missingKeys.length === 0 && extraKeys.length === 0 && changedKeys.length === 0,
    changedKeys,
    missingKeys,
    extraKeys,
  };
}

export function catalogAndSecurityEqual(a, b) {
  const left = catalogAndSecuritySlice(a);
  const right = catalogAndSecuritySlice(b);
  if (!left || !right) return false;
  const diffs = fingerprintKeyDiffs(left, right);
  return diffs.comparable === true && diffs.equal === true;
}

export function isPartialCatalogInventory(catalogInventory, file) {
  if (catalogInventory == null || typeof catalogInventory !== "object" || Array.isArray(catalogInventory)) {
    return true;
  }
  if (!F3_FORWARD_FILES.includes(file)) return true;
  const expected = getFrozenExpectedFingerprint(file);
  for (const key of FINGERPRINT_REQUIRED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(catalogInventory, key) || catalogInventory[key] == null) {
      return true;
    }
  }
  for (const key of FINGERPRINT_OPTIONAL_CATALOG_KEYS) {
    if (
      Object.prototype.hasOwnProperty.call(expected, key) &&
      !Object.prototype.hasOwnProperty.call(catalogInventory, key)
    ) {
      return true;
    }
  }
  return false;
}

function fingerprintHasCompleteKeyset(fingerprint, expected) {
  if (
    fingerprint == null ||
    expected == null ||
    typeof fingerprint !== "object" ||
    typeof expected !== "object" ||
    Array.isArray(fingerprint) ||
    Array.isArray(expected)
  ) {
    return false;
  }
  for (const key of FINGERPRINT_REQUIRED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(fingerprint, key) || fingerprint[key] == null) return false;
  }
  for (const key of FINGERPRINT_META_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(fingerprint, key) || fingerprint[key] == null) return false;
  }
  for (const key of FINGERPRINT_OPTIONAL_CATALOG_KEYS) {
    if (
      Object.prototype.hasOwnProperty.call(expected, key) &&
      !Object.prototype.hasOwnProperty.call(fingerprint, key)
    ) {
      return false;
    }
  }
  return sameKeySet(expected, fingerprint);
}

function collectorProvenance(phase, extra = {}) {
  return {
    collector: FULL_FINGERPRINT_COLLECTOR_ID,
    builder: "buildIndependentObservedFingerprint",
    catalogSource: "live_CATALOG_FINGERPRINT_SQL_inventory",
    metaSource: "frozen_pins_PREASSIGNED_VERSIONS_FROZEN_DIGESTS_RECOGNITION_ALLOWLIST",
    copiedFromPreRepair: false,
    assembledFromPartialInventory: false,
    independentOfObserved: false,
    constructedOffline: false,
    populatedFromObserved: false,
    phase: phase || null,
    ...extra,
  };
}

function failedFullFingerprintCapture(reason, extra = {}) {
  return {
    ok: false,
    captureOk: false,
    reason,
    phase: extra.phase ?? null,
    file: extra.file ?? null,
    fingerprint: extra.fingerprint ?? null,
    sha256: extra.sha256 ?? null,
    keyset: extra.keyset ?? [],
    provenance: extra.provenance ?? collectorProvenance(extra.phase),
    canonicalJson: extra.canonicalJson ?? null,
    diffsVsExpected: extra.diffsVsExpected ?? null,
    diffsVsPreRepair: extra.diffsVsPreRepair ?? null,
    diffsVsPostRepair: extra.diffsVsPostRepair ?? null,
  };
}

export function collectCanonicalFullFingerprint(input = {}) {
  const { file, catalogInventory, phase, queryStatus } = input;
  const provenance = collectorProvenance(phase, { queryStatus: queryStatus ?? null });
  if (!F3_FORWARD_FILES.includes(file)) {
    return failedFullFingerprintCapture(`unknown file ${file}`, { file, phase, provenance });
  }
  if (queryStatus != null && queryStatus !== 0) {
    return failedFullFingerprintCapture(`catalog query status ${queryStatus}`, { file, phase, provenance });
  }
  if (catalogInventory == null || typeof catalogInventory !== "object" || Array.isArray(catalogInventory)) {
    return failedFullFingerprintCapture("catalog inventory missing or not an object", { file, phase, provenance });
  }
  if (isPartialCatalogInventory(catalogInventory, file)) {
    provenance.assembledFromPartialInventory = true;
    let partial = null;
    try {
      partial = buildIndependentObservedFingerprint(file, catalogInventory);
    } catch {
      partial = null;
    }
    return failedFullFingerprintCapture(
      "partial catalog inventory cannot substitute for a full fingerprint",
      {
        file,
        phase,
        provenance,
        fingerprint: partial,
        keyset: partial && typeof partial === "object" ? Object.keys(partial).sort() : [],
      },
    );
  }

  let fingerprint;
  try {
    fingerprint = buildIndependentObservedFingerprint(file, catalogInventory);
  } catch (err) {
    return failedFullFingerprintCapture(err instanceof Error ? err.message : "builder failed", {
      file,
      phase,
      provenance,
    });
  }

  const expected = getFrozenExpectedFingerprint(file);
  const keyset = Object.keys(fingerprint).sort();
  let sha256 = null;
  let canonicalJson = null;
  try {
    const canonical = canonicalizeFingerprintForCompare(fingerprint);
    if (!isFingerprintCanonicalizationRejected(canonical)) {
      sha256 = fingerprintCanonicalSha256(fingerprint);
      canonicalJson = canonicalize(canonical);
    }
  } catch {
    sha256 = null;
    canonicalJson = null;
  }

  if (!fingerprintHasCompleteKeyset(fingerprint, expected)) {
    return failedFullFingerprintCapture("assembled fingerprint is missing required or expected keys", {
      file,
      phase,
      provenance,
      fingerprint,
      sha256,
      keyset,
      canonicalJson,
    });
  }

  return {
    ok: true,
    captureOk: true,
    reason: null,
    phase: phase || null,
    file,
    fingerprint,
    sha256,
    keyset,
    provenance,
    canonicalJson,
    diffsVsExpected: null,
    diffsVsPreRepair: null,
    diffsVsPostRepair: null,
  };
}

export function finalizeFingerprintCapture(capture, comparisons = {}) {
  const record = capture && typeof capture === "object" ? { ...capture } : failedFullFingerprintCapture("capture missing");
  const observed = record.fingerprint;
  if (comparisons.expected !== undefined) {
    record.diffsVsExpected = fingerprintKeyDiffs(comparisons.expected, observed);
  }
  if (comparisons.preRepairObserved !== undefined) {
    record.diffsVsPreRepair = fingerprintKeyDiffs(comparisons.preRepairObserved, observed);
  }
  if (comparisons.postRepairObserved !== undefined) {
    record.diffsVsPostRepair = fingerprintKeyDiffs(comparisons.postRepairObserved, observed);
  }
  return record;
}

export function captureFrozenExpectedFingerprint(file) {
  assertExpectedFingerprintImmutable(file);
  const fingerprint = getFrozenExpectedFingerprint(file);
  const sha256 = expectedFingerprintSha256(file);
  const canonical = canonicalizeFingerprintForCompare(fingerprint);
  return {
    ok: true,
    captureOk: true,
    reason: null,
    phase: FULL_FINGERPRINT_PHASES.FROZEN_EXPECTED_BEFORE_DB,
    file,
    fingerprint,
    sha256,
    keyset: Object.keys(fingerprint).sort(),
    provenance: {
      collector: FULL_FINGERPRINT_COLLECTOR_ID,
      builder: "getFrozenExpectedFingerprint",
      catalogSource: "FROZEN_EXPECTED_FINGERPRINTS",
      metaSource: "frozen_pins_independent",
      copiedFromPreRepair: false,
      assembledFromPartialInventory: false,
      independentOfObserved: true,
      constructedOffline: true,
      populatedFromObserved: false,
      phase: FULL_FINGERPRINT_PHASES.FROZEN_EXPECTED_BEFORE_DB,
    },
    canonicalJson: isFingerprintCanonicalizationRejected(canonical) ? null : canonicalize(canonical),
    diffsVsExpected: fingerprintKeyDiffs(fingerprint, fingerprint),
    diffsVsPreRepair: null,
    diffsVsPostRepair: null,
  };
}

export function recordFrozenExpectedFingerprintCaptures() {
  const captures = {};
  for (const file of F3_FORWARD_FILES) {
    captures[file] = Object.freeze(captureFrozenExpectedFingerprint(file));
  }
  return Object.freeze({
    recordedBeforeDbAccess: true,
    independentOfObserved: true,
    constructedOffline: true,
    populatedFromObserved: false,
    captures: Object.freeze(captures),
  });
}

function evaluateCanonicalPhaseCapture({
  file,
  capture,
  expected,
  preRepairObserved,
  postRepairObserved,
  hold,
  requireCollector = true,
} = {}) {
  if (!capture || typeof capture !== "object" || Array.isArray(capture)) {
    return { ok: false, hold, reason: "full fingerprint capture missing", allowRetry: false, allowContinuation: false };
  }
  if (capture.ok !== true || capture.captureOk !== true) {
    return {
      ok: false,
      hold,
      reason: capture.reason || "full fingerprint capture failed",
      allowRetry: false,
      allowContinuation: false,
    };
  }
  if (requireCollector && capture.provenance?.collector !== FULL_FINGERPRINT_COLLECTOR_ID) {
    return {
      ok: false,
      hold,
      reason: "fingerprint not assembled by the canonical full-fingerprint collector",
      allowRetry: false,
      allowContinuation: false,
    };
  }
  if (capture.provenance?.copiedFromPreRepair === true) {
    return {
      ok: false,
      hold,
      reason: "copying pre-repair metadata onto a post-phase inventory is prohibited",
      allowRetry: false,
      allowContinuation: false,
    };
  }
  if (capture.provenance?.assembledFromPartialInventory === true) {
    return {
      ok: false,
      hold,
      reason: "partial inventory cannot substitute for a full fingerprint",
      allowRetry: false,
      allowContinuation: false,
    };
  }
  const observed = capture.fingerprint;
  if (observed == null || typeof observed !== "object" || Array.isArray(observed)) {
    return { ok: false, hold, reason: "captured fingerprint missing or malformed", allowRetry: false, allowContinuation: false };
  }
  const complete = fingerprintCompleteAndExact({ expected, observed }, file);
  if (!complete.ok) {
    return { ok: false, hold, reason: complete.reason, allowRetry: false, allowContinuation: false };
  }
  if (preRepairObserved != null && !catalogAndSecurityEqual(observed, preRepairObserved)) {
    return {
      ok: false,
      hold,
      reason: "security/catalog differs from authorized pre-repair committed state",
      allowRetry: false,
      allowContinuation: false,
    };
  }
  if (postRepairObserved != null && !catalogAndSecurityEqual(observed, postRepairObserved)) {
    return {
      ok: false,
      hold,
      reason: "security/catalog differs from authorized post-repair state",
      allowRetry: false,
      allowContinuation: false,
    };
  }
  return {
    ok: true,
    hold: null,
    reason: null,
    allowRetry: hold === POST_REPAIR_FULL_FINGERPRINT_HOLD,
    allowContinuation: hold === POST_RETRY_FULL_FINGERPRINT_HOLD || hold === POST_CONTINUATION_FULL_FINGERPRINT_HOLD,
    historyReconciliationSeparate: true,
    diffsVsExpected: fingerprintKeyDiffs(expected, observed),
    diffsVsPreRepair: preRepairObserved != null ? fingerprintKeyDiffs(preRepairObserved, observed) : null,
    diffsVsPostRepair: postRepairObserved != null ? fingerprintKeyDiffs(postRepairObserved, observed) : null,
  };
}

export function evaluatePostPoisonFullFingerprint(input = {}) {
  const result = evaluateCanonicalPhaseCapture({
    ...input,
    hold: POST_POISON_FULL_FINGERPRINT_HOLD,
  });
  return { ...result, allowRepair: result.ok === true, allowRetry: false, allowContinuation: false };
}

export function evaluatePostRepairFullFingerprint(input = {}) {
  const result = evaluateCanonicalPhaseCapture({
    ...input,
    hold: POST_REPAIR_FULL_FINGERPRINT_HOLD,
  });
  return { ...result, allowRetry: result.ok === true, allowContinuation: false };
}

export function evaluatePostRetryFullFingerprint(input = {}) {
  const result = evaluateCanonicalPhaseCapture({
    ...input,
    hold: POST_RETRY_FULL_FINGERPRINT_HOLD,
  });
  return { ...result, allowRetry: false, allowContinuation: result.ok === true };
}

export function evaluatePostContinuationFullFingerprint(input = {}) {
  const result = evaluateCanonicalPhaseCapture({
    ...input,
    hold: POST_CONTINUATION_FULL_FINGERPRINT_HOLD,
  });
  return { ...result, allowRetry: false, allowContinuation: result.ok === true };
}

/**
 * Qualifier-path fingerprint sequence used by hosted qualify and local harness.
 * Pre-repair rejects never spawn repair. Post-repair / post-retry misses HOLD
 * the sequence and block retry / continuation.
 */
export function runQualifyFingerprintHoldSequence(input = {}) {
  const file = input.file;
  const expected = getFrozenExpectedFingerprint(file);
  const phases = {
    frozenExpected: captureFrozenExpectedFingerprint(file),
  };

  const afterCommit = finalizeFingerprintCapture(
    collectCanonicalFullFingerprint({
      file,
      catalogInventory: input.afterCommitCatalog,
      phase: FULL_FINGERPRINT_PHASES.AFTER_COMMIT_FAILED_HISTORY,
      queryStatus: input.afterCommitQueryStatus ?? 0,
    }),
    { expected },
  );
  phases.afterCommitFailedHistory = afterCommit;
  const preRepairExact = afterCommit.ok
    ? fingerprintCompleteAndExact({ expected, observed: afterCommit.fingerprint }, file)
    : { ok: false, reason: afterCommit.reason || "pre-repair full fingerprint capture failed" };
  if (!preRepairExact.ok) {
    return {
      ok: false,
      hold: REPAIR_SAFETY_HOLD,
      reason: preRepairExact.reason,
      allowRepair: false,
      allowRetry: false,
      allowContinuation: false,
      repairCalls: 0,
      retryCalls: 0,
      continuationCalls: 0,
      phases,
      preRepairExact,
    };
  }

  const afterPoison = finalizeFingerprintCapture(
    collectCanonicalFullFingerprint({
      file,
      catalogInventory: input.afterPoisonCatalog === undefined ? input.afterCommitCatalog : input.afterPoisonCatalog,
      phase: FULL_FINGERPRINT_PHASES.AFTER_POISON_CLEANUP,
      queryStatus: input.afterPoisonQueryStatus ?? 0,
    }),
    { expected, preRepairObserved: afterCommit.fingerprint },
  );
  phases.afterPoisonCleanup = afterPoison;
  const poisonEval = evaluatePostPoisonFullFingerprint({
    file,
    capture: afterPoison,
    expected,
    preRepairObserved: afterCommit.fingerprint,
  });
  if (!poisonEval.ok) {
    return {
      ok: false,
      hold: poisonEval.hold,
      reason: poisonEval.reason,
      allowRepair: false,
      allowRetry: false,
      allowContinuation: false,
      repairCalls: 0,
      retryCalls: 0,
      continuationCalls: 0,
      phases,
      preRepairExact,
      poisonEval,
    };
  }

  const afterRepair = finalizeFingerprintCapture(
    collectCanonicalFullFingerprint({
      file,
      catalogInventory: input.afterRepairCatalog,
      phase: FULL_FINGERPRINT_PHASES.AFTER_SUCCESSFUL_REPAIR,
      queryStatus: input.afterRepairQueryStatus ?? 0,
    }),
    { expected, preRepairObserved: afterCommit.fingerprint },
  );
  phases.afterSuccessfulRepair = afterRepair;
  const postRepairEval = evaluatePostRepairFullFingerprint({
    file,
    capture: afterRepair,
    expected,
    preRepairObserved: afterCommit.fingerprint,
  });
  if (!postRepairEval.ok) {
    return {
      ok: false,
      hold: postRepairEval.hold,
      reason: postRepairEval.reason,
      allowRepair: true,
      allowRetry: false,
      allowContinuation: false,
      repairCalls: 1,
      retryCalls: 0,
      continuationCalls: 0,
      phases,
      preRepairExact,
      poisonEval,
      postRepairEval,
    };
  }

  const pending = Array.isArray(input.retryPending) ? input.retryPending : [];
  if (pending.length > 0) {
    return {
      ok: false,
      hold: POST_RETRY_FULL_FINGERPRINT_HOLD,
      reason: "retry still reports a pending target",
      allowRepair: true,
      allowRetry: true,
      allowContinuation: false,
      repairCalls: 1,
      retryCalls: 1,
      continuationCalls: 0,
      phases,
      preRepairExact,
      poisonEval,
      postRepairEval,
    };
  }

  const afterRetry = finalizeFingerprintCapture(
    collectCanonicalFullFingerprint({
      file,
      catalogInventory: input.afterRetryCatalog === undefined ? input.afterRepairCatalog : input.afterRetryCatalog,
      phase: FULL_FINGERPRINT_PHASES.AFTER_RETRY_NO_PENDING,
      queryStatus: input.afterRetryQueryStatus ?? 0,
    }),
    {
      expected,
      preRepairObserved: afterCommit.fingerprint,
      postRepairObserved: afterRepair.fingerprint,
    },
  );
  phases.afterRetryNoPending = afterRetry;
  const postRetryEval = evaluatePostRetryFullFingerprint({
    file,
    capture: afterRetry,
    expected,
    preRepairObserved: afterCommit.fingerprint,
    postRepairObserved: afterRepair.fingerprint,
  });
  if (!postRetryEval.ok) {
    return {
      ok: false,
      hold: postRetryEval.hold,
      reason: postRetryEval.reason,
      allowRepair: true,
      allowRetry: true,
      allowContinuation: false,
      repairCalls: 1,
      retryCalls: 1,
      continuationCalls: 0,
      phases,
      preRepairExact,
      poisonEval,
      postRepairEval,
      postRetryEval,
    };
  }

  let continuationEval = { ok: true, hold: null };
  if (input.continueToNext === true) {
    const afterContinuation = finalizeFingerprintCapture(
      collectCanonicalFullFingerprint({
        file,
        catalogInventory:
          input.afterContinuationCatalog === undefined ? input.afterRetryCatalog ?? input.afterRepairCatalog : input.afterContinuationCatalog,
        phase: FULL_FINGERPRINT_PHASES.AFTER_CLEAN_CONTINUATION,
        queryStatus: input.afterContinuationQueryStatus ?? 0,
      }),
      {
        expected,
        preRepairObserved: afterCommit.fingerprint,
        postRepairObserved: afterRepair.fingerprint,
      },
    );
    phases.afterCleanContinuation = afterContinuation;
    continuationEval = evaluatePostContinuationFullFingerprint({
      file,
      capture: afterContinuation,
      expected,
      preRepairObserved: afterCommit.fingerprint,
      postRepairObserved: afterRepair.fingerprint,
    });
    if (!continuationEval.ok) {
      return {
        ok: false,
        hold: continuationEval.hold,
        reason: continuationEval.reason,
        allowRepair: true,
        allowRetry: true,
        allowContinuation: false,
        repairCalls: 1,
        retryCalls: 1,
        continuationCalls: 0,
        phases,
        preRepairExact,
        poisonEval,
        postRepairEval,
        postRetryEval,
        continuationEval,
      };
    }
  }

  return {
    ok: true,
    hold: null,
    reason: null,
    allowRepair: true,
    allowRetry: true,
    allowContinuation: true,
    repairCalls: 1,
    retryCalls: 1,
    continuationCalls: input.continueToNext === true ? 1 : 0,
    phases,
    preRepairExact,
    poisonEval,
    postRepairEval,
    postRetryEval,
    continuationEval,
  };
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
  const classified = classifyObjectProbeExpression(expression);
  if (!classified) return Object.freeze([]);
  return Object.freeze([classified.lookup]);
}

export function expectedRowForFile(file) {
  const descriptors = getFrozenExpectedObjectProbeDescriptors(file);
  const row = {};
  descriptors.forEach((descriptor, i) => {
    row[`p${i}`] = descriptor;
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

/**
 * Strict object-probe parse at the catalog boundary.
 * Presence is accepted ONLY when every listed condition holds:
 * resolved OID → structured catalog identity exactly equals the
 * independently frozen expected descriptor. Lookup spelling is never
 * compared to to_regprocedure(...)::text. Name-only, partial, reordered,
 * aliased, OID-bearing, duplicated, or unexpected identities fail closed.
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
  for (const expr of exprs) {
    if (!classifyObjectProbeExpression(expr)) {
      return { present: false, reason: "malformed object-probe expression" };
    }
  }
  let expectedDescriptors;
  try {
    expectedDescriptors = getFrozenExpectedObjectProbeDescriptors(targetFile);
  } catch (err) {
    return { present: false, reason: err instanceof Error ? err.message : "expected probe descriptor missing" };
  }
  if (expectedDescriptors.length !== exprs.length) {
    return { present: false, reason: "frozen expected descriptors do not pair 1:1 with probe expressions" };
  }

  const expectedKeys = exprs.map((_, i) => `p${i}`);
  const observedKeys = Object.keys(shaped.row).sort();
  const expectedKeySet = [...expectedKeys].sort();
  if (!sameKeySet(Object.fromEntries(expectedKeySet.map((k) => [k, true])), Object.fromEntries(observedKeys.map((k) => [k, true])))) {
    return { present: false, reason: "probe row keys are not the complete expected pN set" };
  }

  const missing = [];
  const seenFingerprints = new Set();
  for (let i = 0; i < exprs.length; i += 1) {
    const key = `p${i}`;
    const observed = shaped.row[key];
    const expected = expectedDescriptors[i];
    if (observed == null || observed === false || observed === "f" || observed === "") {
      missing.push(key);
      continue;
    }
    const compared = structuredObjectProbeIdentityExact(observed, expected);
    if (!compared.ok) {
      return { present: false, reason: `p${i} ${compared.reason}` };
    }
    const fingerprint = objectProbeIdentityFingerprint(observed);
    if (seenFingerprints.has(fingerprint)) {
      return { present: false, reason: "duplicate structured probe records" };
    }
    seenFingerprints.add(fingerprint);
  }
  if (missing.length > 0) {
    return { present: false, reason: `required object missing: ${missing.join(",")}` };
  }
  assertExpectedObjectProbeDescriptorsImmutable(targetFile);
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
  if (fingerprintContainsOid(expected) || fingerprintContainsOid(observed)) {
    return { ok: false, reason: "fingerprint must not contain OID fields" };
  }
  if (
    expected.schema_version !== F3_FULL_FINGERPRINT_SCHEMA_VERSION
    || observed.schema_version !== F3_FULL_FINGERPRINT_SCHEMA_VERSION
    || expected.schema_version !== observed.schema_version
  ) {
    return { ok: false, reason: "fingerprint schema_version mismatch" };
  }
  let expectedHashBefore;
  try {
    expectedHashBefore = fingerprintCanonicalSha256(expected);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "expected fingerprint cannot be hashed" };
  }
  const allowed = new Set(FINGERPRINT_ALLOWED_KEYS);
  for (const key of new Set([...Object.keys(expected), ...Object.keys(observed)])) {
    if (!allowed.has(key)) {
      return { ok: false, reason: `unexpected fingerprint key ${key}` };
    }
  }
  for (const key of FINGERPRINT_REQUIRED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(expected, key)) {
      return { ok: false, reason: `expected missing key ${key}` };
    }
    if (!Object.prototype.hasOwnProperty.call(observed, key)) {
      return { ok: false, reason: `observed missing key ${key}` };
    }
    if (expected[key] === undefined) {
      return { ok: false, reason: `expected missing key ${key}` };
    }
    if (observed[key] === undefined) {
      return { ok: false, reason: `observed missing key ${key}` };
    }
  }
  const expectedCanon = canonicalizeFingerprintForCompare(expected);
  const observedCanon = canonicalizeFingerprintForCompare(observed);
  if (isFingerprintCanonicalizationRejected(expectedCanon)) {
    return { ok: false, reason: `expected canonicalization rejected: ${expectedCanon.reason}` };
  }
  if (isFingerprintCanonicalizationRejected(observedCanon)) {
    return { ok: false, reason: `observed canonicalization rejected: ${observedCanon.reason}` };
  }
  const nestedErrors = [
    ...nestedKeyContractErrors(expectedCanon),
    ...nestedKeyContractErrors(observedCanon),
  ];
  if (nestedErrors.length > 0) {
    return { ok: false, reason: nestedErrors[0] };
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
  let expectedHashAfter;
  try {
    expectedHashAfter = fingerprintCanonicalSha256(expected);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "expected fingerprint cannot be hashed after compare" };
  }
  if (expectedHashBefore !== expectedHashAfter) {
    return { ok: false, reason: "expected fingerprint mutated during compare" };
  }
  if (file && FROZEN_EXPECTED_FINGERPRINT_SHA256[file]) {
    if (expectedHashAfter !== FROZEN_EXPECTED_FINGERPRINT_SHA256[file]) {
      return { ok: false, reason: "expected fingerprint is not the sealed frozen constant" };
    }
    assertExpectedFingerprintImmutable(file);
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
