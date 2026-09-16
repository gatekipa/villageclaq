/**
 * Independent PostgreSQL catalog/security reference collector.
 *
 * Reference-only. Must NOT import or invoke the production catalog
 * collector, production canonicalizer, expected-fingerprint builder,
 * fingerprintCompleteAndExact, or any function that generates the
 * primary expected fingerprint.
 *
 * Own SQL. Own serialization. Own normalize/sort of semantically
 * unordered sets only. Database driver is injected by the caller.
 */
import { createHash } from "node:crypto";

export const INDEPENDENT_REFERENCE_SCHEMA_VERSION = "f3-full-catalog-v2";
export const INDEPENDENT_REFERENCE_MODULE_RELPATH =
  "scripts/lib/f3-full-catalog-independent-reference.mjs";
export const INDEPENDENT_RECOGNITION = Object.freeze(["manual_income"]);

const TGENABLED_STATES = Object.freeze(["O", "D", "R", "A"]);
const COLUMN_ACL_TUPLE_KEYS = Object.freeze(["grantor", "grantee", "privilege", "is_grantable"]);

/**
 * Independent catalog SQL. CTE assembly — not the production
 * CATALOG_FINGERPRINT_SQL jsonb_build_object nest. Same in-scope
 * filters; different query text and serialization path.
 */
export const INDEPENDENT_FULL_CATALOG_SQL = `
WITH
scope_ns AS (
  SELECT oid, nspname, nspowner, nspacl
  FROM pg_namespace
  WHERE nspname IN ('public', 'financial_core', 'financial_private')
),
rel_scope AS (
  SELECT c.oid, n.nspname, c.relname, c.relkind, c.relpersistence, c.relowner,
         c.relreplident, c.relrowsecurity, c.relforcerowsecurity, c.relacl, c.reloptions
  FROM pg_class c
  JOIN scope_ns n ON n.oid = c.relnamespace
  WHERE (
    n.nspname IN ('financial_core', 'financial_private')
    OR (n.nspname = 'public' AND c.relname LIKE 'financial_%')
  )
),
proc_scope AS (
  SELECT p.oid, n.nspname, p.proname, p.prokind, p.proowner, p.proacl, p.prosecdef,
         p.proconfig, p.prolang, p.prosrc, p.provolatile, p.proparallel, p.proisstrict,
         p.proleakproof
  FROM pg_proc p
  JOIN scope_ns n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'financial_core', 'financial_private')
    AND (n.nspname LIKE 'financial_%' OR p.proname ~ 'financial|f3_|guard_ledger')
),
schema_rows AS (
  SELECT jsonb_build_object('schema', nspname, 'owner', pg_get_userbyid(nspowner)) AS rec
  FROM scope_ns
  WHERE nspname IN ('financial_core', 'financial_private')
),
function_owner_rows AS (
  SELECT jsonb_build_object(
    'schema', nspname,
    'function', proname,
    'identity_arguments', pg_get_function_identity_arguments(oid),
    'owner', pg_get_userbyid(proowner),
    'security_definer', prosecdef,
    'search_path', coalesce(proconfig::text, '')
  ) AS rec
  FROM proc_scope
),
table_acl_rows AS (
  SELECT jsonb_build_object(
    'object_type', 'table',
    'schema', r.nspname,
    'object_name', r.relname,
    'prokind', '',
    'identity_arguments', '',
    'grantee', CASE WHEN r.relacl IS NULL THEN '' WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
    'grantor', CASE WHEN r.relacl IS NULL THEN '' ELSE pg_get_userbyid(a.grantor) END,
    'privilege', CASE WHEN r.relacl IS NULL THEN '' ELSE a.privilege_type END,
    'grantable', CASE WHEN r.relacl IS NULL THEN false ELSE a.is_grantable END
  ) AS rec
  FROM rel_scope r
  LEFT JOIN LATERAL aclexplode(r.relacl) a ON r.relacl IS NOT NULL
  WHERE r.relkind = 'r'
),
routine_acl_rows AS (
  SELECT jsonb_build_object(
    'object_type', 'routine',
    'schema', p.nspname,
    'object_name', p.proname,
    'prokind', p.prokind::text,
    'identity_arguments', pg_get_function_identity_arguments(p.oid),
    'grantee', CASE WHEN p.proacl IS NULL THEN '' WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
    'grantor', CASE WHEN p.proacl IS NULL THEN '' ELSE pg_get_userbyid(a.grantor) END,
    'privilege', CASE WHEN p.proacl IS NULL THEN '' ELSE a.privilege_type END,
    'grantable', CASE WHEN p.proacl IS NULL THEN false ELSE a.is_grantable END
  ) AS rec
  FROM proc_scope p
  LEFT JOIN LATERAL aclexplode(p.proacl) a ON p.proacl IS NOT NULL
),
acl_rows AS (
  SELECT rec FROM table_acl_rows
  UNION ALL
  SELECT rec FROM routine_acl_rows
),
policy_rows AS (
  SELECT jsonb_build_object(
    'schema', schemaname,
    'table', tablename,
    'policy_name', policyname,
    'command', cmd,
    'permissive', (upper(permissive) IN ('PERMISSIVE', 'YES', 'T', 'TRUE')),
    'roles', to_jsonb(roles),
    'using', coalesce(qual, ''),
    'with_check', coalesce(with_check, '')
  ) AS rec
  FROM pg_policies
  WHERE schemaname IN ('public', 'financial_core', 'financial_private')
    AND (tablename LIKE 'financial_%' OR schemaname LIKE 'financial_%')
),
schema_full_rows AS (
  SELECT jsonb_build_object(
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
      )
      FROM aclexplode(n.nspacl) a
      WHERE n.nspacl IS NOT NULL
    ), '[]'::jsonb)
  ) AS rec
  FROM scope_ns n
  WHERE n.nspname IN ('financial_core', 'financial_private')
),
relation_rows AS (
  SELECT jsonb_build_object(
    'schema', r.nspname,
    'name', r.relname,
    'relkind', r.relkind::text,
    'persistence', CASE r.relpersistence WHEN 'p' THEN 'permanent' WHEN 'u' THEN 'unlogged' ELSE 'temporary' END,
    'owner', pg_get_userbyid(r.relowner),
    'replica_identity', CASE r.relreplident WHEN 'd' THEN 'default' WHEN 'n' THEN 'nothing' WHEN 'f' THEN 'full' ELSE 'index' END,
    'rls_enabled', r.relrowsecurity,
    'rls_force', r.relforcerowsecurity,
    'acl', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
          'grantor', pg_get_userbyid(a.grantor),
          'privilege', a.privilege_type,
          'grantable', a.is_grantable
        )
      )
      FROM aclexplode(r.relacl) a
      WHERE r.relacl IS NOT NULL
    ), '[]'::jsonb)
  ) AS rec
  FROM rel_scope r
  WHERE r.relkind IN ('r', 'p')
),
column_rows AS (
  SELECT jsonb_build_object(
    'schema', r.nspname,
    'relation', r.relname,
    'ordinal', att.attnum,
    'name', att.attname,
    'type', format_type(att.atttypid, NULL),
    'typmod', CASE WHEN att.atttypmod >= 0 THEN att.atttypmod ELSE NULL END,
    'nullable', NOT att.attnotnull,
    'default', pg_get_expr(ad.adbin, ad.adrelid),
    'identity', CASE att.attidentity WHEN 'a' THEN 'always' WHEN 'd' THEN 'by_default' ELSE NULL END,
    'generated', CASE att.attgenerated WHEN 's' THEN 'stored' ELSE NULL END,
    'collation', NULLIF(coll.collname, ''),
    'attacl_is_null', att.attacl IS NULL,
    'attacl', CASE
      WHEN att.attacl IS NULL THEN '[]'::jsonb
      ELSE coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'grantor', pg_get_userbyid(acl.grantor),
            'grantee', CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END,
            'privilege', acl.privilege_type,
            'is_grantable', acl.is_grantable
          )
        )
        FROM aclexplode(att.attacl) acl
      ), '[]'::jsonb)
    END
  ) AS rec
  FROM pg_attribute att
  JOIN rel_scope r ON r.oid = att.attrelid
  LEFT JOIN pg_attrdef ad ON ad.adrelid = att.attrelid AND ad.adnum = att.attnum
  LEFT JOIN pg_collation coll ON coll.oid = att.attcollation AND att.attcollation <> 0
  WHERE att.attnum > 0 AND NOT att.attisdropped
    AND r.relkind IN ('r', 'p')
),
type_rows AS (
  SELECT jsonb_build_object(
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
      )
      FROM aclexplode(t.typacl) a
      WHERE t.typacl IS NOT NULL
    ), '[]'::jsonb)
  ) AS rec
  FROM pg_type t
  JOIN scope_ns n ON n.oid = t.typnamespace
  WHERE t.typtype IN ('e', 'd', 'c')
    AND (n.nspname LIKE 'financial_%' OR t.typname LIKE 'financial_%')
),
view_rows AS (
  SELECT jsonb_build_object(
    'schema', r.nspname,
    'name', r.relname,
    'kind', CASE r.relkind WHEN 'm' THEN 'matview' ELSE 'view' END,
    'definition', pg_get_viewdef(r.oid, true),
    'security_invoker', coalesce((r.reloptions::text LIKE '%security_invoker=true%'), false),
    'security_barrier', coalesce((r.reloptions::text LIKE '%security_barrier=true%'), false),
    'owner', pg_get_userbyid(r.relowner),
    'acl', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
          'grantor', pg_get_userbyid(a.grantor),
          'privilege', a.privilege_type,
          'grantable', a.is_grantable
        )
      )
      FROM aclexplode(r.relacl) a
      WHERE r.relacl IS NOT NULL
    ), '[]'::jsonb)
  ) AS rec
  FROM rel_scope r
  WHERE r.relkind IN ('v', 'm')
),
routine_rows AS (
  SELECT jsonb_build_object(
    'schema', p.nspname,
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
      )
      FROM aclexplode(p.proacl) a
      WHERE p.proacl IS NOT NULL
    ), '[]'::jsonb)
  ) AS rec
  FROM proc_scope p
  JOIN pg_language l ON l.oid = p.prolang
),
rls_rows AS (
  SELECT jsonb_build_object(
    'schema', r.nspname,
    'relation', r.relname,
    'rls_enabled', r.relrowsecurity,
    'rls_force', r.relforcerowsecurity
  ) AS rec
  FROM rel_scope r
  WHERE r.relkind IN ('r', 'p')
),
constraint_rows AS (
  SELECT jsonb_build_object(
    'schema', r.nspname,
    'relation', r.relname,
    'name', con.conname,
    'contype', con.contype::text,
    'definition', pg_get_constraintdef(con.oid)
  ) AS rec
  FROM pg_constraint con
  JOIN rel_scope r ON r.oid = con.conrelid
),
index_rows AS (
  SELECT jsonb_build_object(
    'schema', r.nspname,
    'relation', r.relname,
    'name', ic.relname,
    'unique', i.indisunique,
    'definition', pg_get_indexdef(i.indexrelid)
  ) AS rec
  FROM pg_index i
  JOIN pg_class ic ON ic.oid = i.indexrelid
  JOIN rel_scope r ON r.oid = i.indrelid
  WHERE NOT i.indisprimary
),
trigger_rows AS (
  SELECT jsonb_build_object(
    'schema', r.nspname,
    'relation', r.relname,
    'name', t.tgname,
    'constraint_trigger', t.tgconstraint <> 0,
    'timing_events', pg_get_triggerdef(t.oid),
    'for_each', CASE WHEN (t.tgtype & 1) = 1 THEN 'row' ELSE 'statement' END,
    'function_identity', format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid)),
    'definition', pg_get_triggerdef(t.oid),
    'tgisinternal', t.tgisinternal,
    'tgenabled', t.tgenabled::text
  ) AS rec
  FROM pg_trigger t
  JOIN rel_scope r ON r.oid = t.tgrelid
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE NOT t.tgisinternal
),
hgp_row AS (
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
  ) AS rec
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission'
  LIMIT 1
),
enqueue_row AS (
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
  ) AS rec
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public' AND p.proname = 'enqueue_outbound_notification'
  LIMIT 1
)
SELECT jsonb_build_object(
  'schema', coalesce((SELECT jsonb_agg(rec) FROM schema_rows), '[]'::jsonb),
  'function_owner', coalesce((SELECT jsonb_agg(rec) FROM function_owner_rows), '[]'::jsonb),
  'acl', coalesce((SELECT jsonb_agg(rec) FROM acl_rows), '[]'::jsonb),
  'policy', coalesce((SELECT jsonb_agg(rec) FROM policy_rows), '[]'::jsonb),
  'f3_objects_absent', (
    to_regnamespace('financial_private') IS NULL
    AND to_regnamespace('financial_core') IS NULL
    AND to_regclass('public.financial_ledger_epochs') IS NULL
    AND to_regclass('public.financial_accounts') IS NULL
    AND to_regprocedure('public.post_financial_command(jsonb)') IS NULL
    AND to_regprocedure('public.correct_financial_event(jsonb)') IS NULL
    AND to_regprocedure('public.post_financial_opening_cash(jsonb)') IS NULL
  ),
  'schema_version', '${INDEPENDENT_REFERENCE_SCHEMA_VERSION}'::text,
  'schemas', coalesce((SELECT jsonb_agg(rec) FROM schema_full_rows), '[]'::jsonb),
  'relations', coalesce((SELECT jsonb_agg(rec) FROM relation_rows), '[]'::jsonb),
  'columns', coalesce((SELECT jsonb_agg(rec) FROM column_rows), '[]'::jsonb),
  'types', coalesce((SELECT jsonb_agg(rec) FROM type_rows), '[]'::jsonb),
  'views', coalesce((SELECT jsonb_agg(rec) FROM view_rows), '[]'::jsonb),
  'routines', coalesce((SELECT jsonb_agg(rec) FROM routine_rows), '[]'::jsonb),
  'rls', coalesce((SELECT jsonb_agg(rec) FROM rls_rows), '[]'::jsonb),
  'policies', coalesce((SELECT jsonb_agg(rec) FROM policy_rows), '[]'::jsonb),
  'acls', coalesce((SELECT jsonb_agg(rec) FROM acl_rows), '[]'::jsonb),
  'constraints', coalesce((SELECT jsonb_agg(rec) FROM constraint_rows), '[]'::jsonb),
  'indexes', coalesce((SELECT jsonb_agg(rec) FROM index_rows), '[]'::jsonb),
  'triggers', coalesce((SELECT jsonb_agg(rec) FROM trigger_rows), '[]'::jsonb),
  'hgp', (SELECT rec FROM hgp_row),
  'enqueue', (SELECT rec FROM enqueue_row)
)::text
`;

function compareScalars(a, b) {
  const left = a == null ? "" : String(a);
  const right = b == null ? "" : String(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareByFields(a, b, fields) {
  for (const field of fields) {
    const cmp = compareScalars(a?.[field], b?.[field]);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

function sortRecordSet(records, fields) {
  if (!Array.isArray(records)) return records;
  return [...records].sort((a, b) => compareByFields(a, b, fields));
}

function sortGrantTuples(tuples, grantableKey) {
  if (!Array.isArray(tuples)) return [];
  return [...tuples].sort((a, b) => compareByFields(a, b, [
    "grantee",
    "grantor",
    "privilege",
    grantableKey,
  ]));
}

function sortColumnAttacl(tuples) {
  if (!Array.isArray(tuples)) return [];
  return [...tuples].sort((a, b) => compareByFields(a, b, [...COLUMN_ACL_TUPLE_KEYS]));
}

function sortRoles(roles) {
  if (!Array.isArray(roles)) return roles;
  return [...roles].map((role) => String(role)).sort(compareScalars);
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map((item) => sortKeysDeep(item));
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeysDeep(value[key]);
    return out;
  }
  return value;
}

function withSortedNestedGrants(record, grantableKey = "grantable") {
  if (!record || typeof record !== "object" || Array.isArray(record)) return record;
  if (!Object.prototype.hasOwnProperty.call(record, "acl")) return record;
  return { ...record, acl: sortGrantTuples(record.acl, grantableKey) };
}

/**
 * Independently normalize only semantically unordered sets.
 * Does not import the production canonicalizer. Enum labels, identity
 * arguments, SQL bodies, and column ordinals are not reordered.
 */
export function independentlyNormalizeCatalog(catalog) {
  if (catalog == null || typeof catalog !== "object" || Array.isArray(catalog)) {
    return catalog;
  }
  const out = { ...catalog };
  out.schema = sortRecordSet(out.schema, ["schema", "owner"]);
  out.function_owner = sortRecordSet(out.function_owner, [
    "schema",
    "function",
    "identity_arguments",
    "owner",
  ]);
  out.acl = sortRecordSet(out.acl, [
    "object_type",
    "schema",
    "object_name",
    "identity_arguments",
    "grantee",
    "grantor",
    "privilege",
    "grantable",
  ]);
  out.acls = sortRecordSet(out.acls, [
    "object_type",
    "schema",
    "object_name",
    "identity_arguments",
    "grantee",
    "grantor",
    "privilege",
    "grantable",
  ]);
  out.policy = Array.isArray(out.policy)
    ? sortRecordSet(out.policy.map((row) => ({ ...row, roles: sortRoles(row.roles) })), [
      "schema",
      "table",
      "policy_name",
      "command",
    ])
    : out.policy;
  out.policies = Array.isArray(out.policies)
    ? sortRecordSet(out.policies.map((row) => ({ ...row, roles: sortRoles(row.roles) })), [
      "schema",
      "table",
      "policy_name",
      "command",
    ])
    : out.policies;
  out.schemas = Array.isArray(out.schemas)
    ? sortRecordSet(out.schemas.map((row) => withSortedNestedGrants(row)), ["name", "owner"])
    : out.schemas;
  out.relations = Array.isArray(out.relations)
    ? sortRecordSet(out.relations.map((row) => withSortedNestedGrants(row)), ["schema", "name", "relkind"])
    : out.relations;
  out.columns = Array.isArray(out.columns)
    ? sortRecordSet(
      out.columns.map((row) => ({
        ...row,
        attacl: sortColumnAttacl(row.attacl),
      })),
      ["schema", "relation", "ordinal", "name"],
    )
    : out.columns;
  out.types = Array.isArray(out.types)
    ? sortRecordSet(out.types.map((row) => withSortedNestedGrants(row)), ["schema", "name", "kind"])
    : out.types;
  out.views = Array.isArray(out.views)
    ? sortRecordSet(out.views.map((row) => withSortedNestedGrants(row)), ["schema", "name", "kind"])
    : out.views;
  out.routines = Array.isArray(out.routines)
    ? sortRecordSet(out.routines.map((row) => withSortedNestedGrants(row)), [
      "schema",
      "name",
      "identity_arguments",
      "owner",
    ])
    : out.routines;
  out.rls = sortRecordSet(out.rls, ["schema", "relation"]);
  out.constraints = sortRecordSet(out.constraints, ["schema", "relation", "name", "contype"]);
  out.indexes = sortRecordSet(out.indexes, ["schema", "relation", "name"]);
  out.triggers = sortRecordSet(out.triggers, ["schema", "relation", "name"]);
  if (Array.isArray(out.recognition)) {
    out.recognition = [...out.recognition].sort(compareScalars);
  }
  return out;
}

export function independentStructuredSha256(value) {
  return createHash("sha256")
    .update(JSON.stringify(sortKeysDeep(independentlyNormalizeCatalog(value))), "utf8")
    .digest("hex");
}

export function assertIndependentTriggerCoverage(triggers) {
  if (!Array.isArray(triggers)) {
    return { ok: false, reason: "independent triggers must be an array" };
  }
  for (const row of triggers) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, reason: "independent trigger record is not an object" };
    }
    for (const field of ["schema", "relation", "name", "definition", "function_identity", "tgisinternal", "tgenabled"]) {
      if (!Object.prototype.hasOwnProperty.call(row, field)) {
        return { ok: false, reason: `independent trigger missing ${field}` };
      }
    }
    if (!TGENABLED_STATES.includes(row.tgenabled)) {
      return { ok: false, reason: `independent tgenabled is not O/D/R/A: ${row.tgenabled}` };
    }
  }
  return { ok: true };
}

export function assertIndependentColumnAclCoverage(columns) {
  if (!Array.isArray(columns)) {
    return { ok: false, reason: "independent columns must be an array" };
  }
  for (const row of columns) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, reason: "independent column record is not an object" };
    }
    if (!Object.prototype.hasOwnProperty.call(row, "attacl_is_null")
      || !Object.prototype.hasOwnProperty.call(row, "attacl")) {
      return { ok: false, reason: "independent column missing attacl coverage" };
    }
    if (typeof row.attacl_is_null !== "boolean") {
      return { ok: false, reason: "independent attacl_is_null must be boolean" };
    }
    if (!Array.isArray(row.attacl)) {
      return { ok: false, reason: "independent attacl must be an array of tuples" };
    }
    if (row.attacl_is_null && row.attacl.length > 0) {
      return { ok: false, reason: "NULL attacl cannot carry grant tuples" };
    }
    for (const tuple of row.attacl) {
      if (!tuple || typeof tuple !== "object" || Array.isArray(tuple)) {
        return { ok: false, reason: "independent attacl tuple is not an object" };
      }
      const keys = Object.keys(tuple).sort();
      const expected = [...COLUMN_ACL_TUPLE_KEYS].sort();
      if (keys.length !== expected.length || keys.some((key, i) => key !== expected[i])) {
        return { ok: false, reason: "independent attacl tuple keyset mismatch" };
      }
    }
  }
  return { ok: true };
}

/**
 * Collect the complete independent catalog/security contract.
 * queryText(sql) must return the raw query text (jsonb as text).
 * Does not call the primary builder or collector.
 */
export function collectIndependentFullCatalogReference({
  queryText,
  file,
  migration = {},
} = {}) {
  if (typeof queryText !== "function") {
    throw new Error("HOLD: independent reference requires a database query function");
  }
  const raw = queryText(INDEPENDENT_FULL_CATALOG_SQL);
  let catalog;
  try {
    catalog = JSON.parse(String(raw || "").trim());
  } catch (err) {
    throw new Error(`HOLD: independent collector returned non-JSON: ${err instanceof Error ? err.message : err}`);
  }
  if (catalog == null || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error("HOLD: independent collector returned a non-object catalog");
  }
  const triggerCheck = assertIndependentTriggerCoverage(catalog.triggers);
  if (!triggerCheck.ok) throw new Error(`HOLD: ${triggerCheck.reason}`);
  const columnCheck = assertIndependentColumnAclCoverage(catalog.columns);
  if (!columnCheck.ok) throw new Error(`HOLD: ${columnCheck.reason}`);

  const assembled = independentlyNormalizeCatalog({
    ...catalog,
    schema_version: INDEPENDENT_REFERENCE_SCHEMA_VERSION,
    migration_file: file || migration.file,
    migration_source_label: migration.source_label,
    migration_version: migration.version,
    migration_name: migration.name,
    migration_digest: migration.digest,
    recognition: Array.isArray(migration.recognition)
      ? [...migration.recognition]
      : [...INDEPENDENT_RECOGNITION],
  });
  return {
    ok: true,
    collector: "independent_full_catalog_reference",
    schema_version: INDEPENDENT_REFERENCE_SCHEMA_VERSION,
    fingerprint: assembled,
    catalog,
    sha256: independentStructuredSha256(assembled),
  };
}

export function compareIndependentStructuredOutputs(left, right) {
  if (left == null || right == null || typeof left !== "object" || typeof right !== "object"
    || Array.isArray(left) || Array.isArray(right)) {
    return {
      ok: false,
      equal: false,
      missingKeys: [],
      extraKeys: [],
      unequalKeys: ["<root>"],
      leftHash: null,
      rightHash: null,
    };
  }
  const a = independentlyNormalizeCatalog(left);
  const b = independentlyNormalizeCatalog(right);
  const leftKeys = Object.keys(a).sort();
  const rightKeys = Object.keys(b).sort();
  const missingKeys = leftKeys.filter((key) => !Object.prototype.hasOwnProperty.call(b, key));
  const extraKeys = rightKeys.filter((key) => !Object.prototype.hasOwnProperty.call(a, key));
  const unequalKeys = [];
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) continue;
    if (JSON.stringify(sortKeysDeep(a[key])) !== JSON.stringify(sortKeysDeep(b[key]))) {
      unequalKeys.push(key);
    }
  }
  const leftHash = independentStructuredSha256(a);
  const rightHash = independentStructuredSha256(b);
  return {
    ok: missingKeys.length === 0 && extraKeys.length === 0 && unequalKeys.length === 0 && leftHash === rightHash,
    equal: missingKeys.length === 0 && extraKeys.length === 0 && unequalKeys.length === 0 && leftHash === rightHash,
    missingKeys,
    extraKeys,
    unequalKeys,
    leftHash,
    rightHash,
  };
}
