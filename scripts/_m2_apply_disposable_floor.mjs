/**
 * Apply disposable 00116-era floor so unmodified 00117 sees live pins.
 * NOT production. Functions come from Cut 3 live hex + 00115 extract.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

export const LIVE_HGP_DEF_MD5 = "695368464e97297fbf0f90ce7345162f";
export const LIVE_HGP_SRC_MD5 = "96a296dfd541c7fc75ec68c4da1d92ff";
export const LIVE_ENQ_DEF_MD5 = "dbdb16cdced6cae9cbdbfb6a6a9f421f";
export const LIVE_ENQ_SRC_MD5 = "3fa76af51e431ccbd31eb033dcff0b80";

/** Chief-confirmed production notifications_queue TABLE ACL (aclexplode). */
export const LIVE_QUEUE_TABLE_ACL = [
  "authenticated|SELECT|postgres|false",
  "postgres|DELETE|postgres|false",
  "postgres|INSERT|postgres|false",
  "postgres|MAINTAIN|postgres|false",
  "postgres|REFERENCES|postgres|false",
  "postgres|SELECT|postgres|false",
  "postgres|TRIGGER|postgres|false",
  "postgres|TRUNCATE|postgres|false",
  "postgres|UPDATE|postgres|false",
  "service_role|SELECT|postgres|false",
].sort();

/** Chief-confirmed production notifications_queue COLUMN attacl (exactly five). */
export const LIVE_QUEUE_COL_ACL = [
  "attempts|service_role|UPDATE|postgres|false",
  "data|service_role|UPDATE|postgres|false",
  "error_message|service_role|UPDATE|postgres|false",
  "sent_at|service_role|UPDATE|postgres|false",
  "status|service_role|UPDATE|postgres|false",
].sort();

function pinPg17Port(url) {
  // Live queue TABLE ACL includes MAINTAIN (PG 17). A URL without an
  // explicit port follows libpq default 5432 (PG 16 in this environment).
  if (/[?&]port=/.test(url) || /:5433(?:\/|\?|$)/.test(url)) return url;
  return url + (url.includes("?") ? "&" : "?") + "port=5433";
}

export function defaultDisposableUrl() {
  return pinPg17Port(
    process.env.M2_DISPOSABLE_DATABASE_URL ||
      "postgresql://ubuntu@/m2_notification_policy_disposable?host=/var/run/postgresql&port=5433",
  );
}

export function assertNotProduction(url) {
  if (/llbnliixczcqfftxpsmb/i.test(url)) {
    throw new Error("REFUSE: disposable URL must not target production.");
  }
}

export function psqlUrl(url, sql, opts = {}) {
  const args = ["-d", url, "-X", "-q", "-t", "-A"];
  if (opts.verbosity) args.push("-v", `VERBOSITY=${opts.verbosity}`);
  if (opts.onErrorStop !== false) args.push("-v", "ON_ERROR_STOP=1");
  args.push("-c", sql);
  const res = spawnSync("psql", args, {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "" },
  });
  return {
    ok: res.status === 0,
    out: (res.stdout || "").trim(),
    err: (res.stderr || "").trim(),
    status: res.status,
  };
}

export function psqlFile(url, rel) {
  const abs = path.join(root, rel);
  const res = spawnSync("psql", ["-d", url, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-f", abs], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "" },
  });
  if (res.status !== 0) {
    throw new Error(`${rel} failed:\n${res.stderr || res.stdout}`);
  }
  return (res.stdout || "").trim();
}

export function extractEnqueueCreateSql() {
  const src = fs.readFileSync(
    path.join(root, "supabase/migrations/00115_s0_p0b_cut2_notification_queue.sql"),
    "utf8",
  );
  const start = src.indexOf("CREATE OR REPLACE FUNCTION public.enqueue_outbound_notification(");
  const end = src.indexOf("\nREVOKE ALL ON FUNCTION public.enqueue_outbound_notification");
  if (start < 0 || end < 0) throw new Error("cannot extract enqueue from 00115");
  return src.slice(start, end).trimEnd() + ";\n";
}

export function extractHasGroupPermissionCreateSql() {
  const hexdoc = JSON.parse(
    fs.readFileSync(path.join(root, "scripts/_cut3_live_functiondef_hex.json"), "utf8"),
  );
  const raw = Buffer.from(hexdoc.functions["public.has_group_permission"].hex, "hex").toString("utf8");
  return raw.replace(/\s+$/, "") + ";\n";
}

export function applyFloorFunctions(url) {
  const tmp = path.join("/tmp", `m2_floor_fns_${process.pid}.sql`);
  fs.writeFileSync(
    tmp,
    extractHasGroupPermissionCreateSql() + "\n" + extractEnqueueCreateSql(),
  );
  const res = spawnSync("psql", ["-d", url, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-f", tmp], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "" },
  });
  fs.unlinkSync(tmp);
  if (res.status !== 0) {
    throw new Error(`floor functions failed:\n${res.stderr || res.stdout}`);
  }
}

export function applyFloorOwnershipAndAcl(url) {
  // Queue grants as postgres so grantor=postgres. After REVOKE ALL + GRANT
  // SELECT, PG17 owner defaults include MAINTAIN — matching live TABLE ACL.
  const sql = `
ALTER FUNCTION public.has_group_permission(uuid, text, uuid) OWNER TO postgres;
ALTER FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text) OWNER TO postgres;
ALTER TABLE public.notifications_queue OWNER TO postgres;
SET ROLE postgres;
REVOKE ALL ON FUNCTION public.has_group_permission(uuid, text, uuid) FROM PUBLIC, anon, ubuntu;
GRANT EXECUTE ON FUNCTION public.has_group_permission(uuid, text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text)
  FROM PUBLIC, anon, authenticated, ubuntu;
GRANT EXECUTE ON FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text)
  TO service_role;
REVOKE ALL ON TABLE public.notifications_queue FROM PUBLIC;
REVOKE ALL ON TABLE public.notifications_queue FROM anon;
REVOKE ALL ON TABLE public.notifications_queue FROM authenticated;
REVOKE ALL ON TABLE public.notifications_queue FROM service_role;
REVOKE ALL ON TABLE public.notifications_queue FROM ubuntu;
GRANT SELECT ON TABLE public.notifications_queue TO authenticated;
GRANT SELECT ON TABLE public.notifications_queue TO service_role;
GRANT UPDATE (status, error_message, attempts, sent_at, data)
  ON TABLE public.notifications_queue TO service_role;
RESET ROLE;
`;
  const r = psqlUrl(url, sql);
  if (!r.ok) throw new Error(`floor ACL failed: ${r.err || r.out}`);
}

export function readQueueTableAcl(url) {
  const r = psqlUrl(
    url,
    `SELECT concat_ws('|',
         CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname END,
         a.privilege_type, go.rolname,
         CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END)
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
       LEFT JOIN pg_roles gr ON gr.oid = a.grantee
       LEFT JOIN pg_roles go ON go.oid = a.grantor
       WHERE n.nspname = 'public' AND c.relname = 'notifications_queue'
       ORDER BY 1`,
  );
  if (!r.ok) throw new Error(`queue table ACL read failed: ${r.err}`);
  return r.out.split("\n").filter(Boolean).sort();
}

export function readQueueColumnAcl(url) {
  const r = psqlUrl(
    url,
    `SELECT concat_ws('|', att.attname,
         CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname END,
         a.privilege_type, go.rolname,
         CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END)
       FROM pg_attribute att
       JOIN pg_class c ON c.oid = att.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN LATERAL aclexplode(att.attacl) a ON att.attacl IS NOT NULL
       LEFT JOIN pg_roles gr ON gr.oid = a.grantee
       LEFT JOIN pg_roles go ON go.oid = a.grantor
       WHERE n.nspname = 'public' AND c.relname = 'notifications_queue'
         AND att.attnum > 0 AND NOT att.attisdropped AND att.attacl IS NOT NULL
       ORDER BY 1`,
  );
  if (!r.ok) throw new Error(`queue column ACL read failed: ${r.err}`);
  return r.out.split("\n").filter(Boolean).sort();
}

export function assertLiveQueueAcl(url) {
  const table = readQueueTableAcl(url);
  const cols = readQueueColumnAcl(url);
  const tableOk = JSON.stringify(table) === JSON.stringify(LIVE_QUEUE_TABLE_ACL);
  const colOk = JSON.stringify(cols) === JSON.stringify(LIVE_QUEUE_COL_ACL);
  if (!tableOk || !colOk) {
    throw new Error(
      `disposable queue ACL does not match Chief production pin\nTABLE actual:\n${table.join("\n")}\nTABLE expected:\n${LIVE_QUEUE_TABLE_ACL.join("\n")}\nCOL actual:\n${cols.join("\n")}\nCOL expected:\n${LIVE_QUEUE_COL_ACL.join("\n")}`,
    );
  }
  return { table, cols };
}

export function applyDisposableFloor(url) {
  assertNotProduction(url);
  psqlFile(url, "scripts/_m2_disposable_fixture.sql");
  applyFloorFunctions(url);
  applyFloorOwnershipAndAcl(url);
  assertLiveQueueAcl(url);
}

export function recreateDisposableDatabase({
  adminUrl = "postgresql://ubuntu@/postgres?host=/var/run/postgresql&port=5433",
  dbName = "m2_notification_policy_disposable",
} = {}) {
  assertNotProduction(adminUrl);
  const drop = psqlUrl(adminUrl, `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`);
  if (!drop.ok) throw new Error(`DROP DATABASE failed: ${drop.err}`);
  const create = psqlUrl(adminUrl, `CREATE DATABASE ${dbName} OWNER ubuntu;`);
  if (!create.ok) throw new Error(`CREATE DATABASE failed: ${create.err}`);
}
