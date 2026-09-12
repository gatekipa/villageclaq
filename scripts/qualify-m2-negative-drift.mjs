/**
 * R15: 00117 must M2_ABORT on each live-floor drift category.
 * Disposable only. Never production.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyDisposableFloor,
  assertNotProduction,
  psqlUrl,
  recreateDisposableDatabase,
} from "./_m2_apply_disposable_floor.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const MIG = path.join(root, "supabase/migrations/00117_m2_notification_policy_foundation.sql");

function apply00117(url) {
  return spawnSync("psql", ["-d", url, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-f", MIG], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "" },
  });
}

function aborted(res) {
  const blob = `${res.stderr || ""}\n${res.stdout || ""}`;
  return res.status !== 0 && /M2_ABORT/.test(blob);
}

export function runNegativeDriftSuite({
  adminUrl = "postgresql://ubuntu@/postgres?host=/var/run/postgresql&port=5433",
} = {}) {
  assertNotProduction(adminUrl);
  const results = [];
  const cases = [
    {
      id: "NEG_HGP_BODY",
      sql: `
        CREATE OR REPLACE FUNCTION public.has_group_permission(gid uuid, perm_key text, uid uuid DEFAULT auth.uid())
        RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
        AS $f$ BEGIN RETURN false; END; $f$;
        ALTER FUNCTION public.has_group_permission(uuid, text, uuid) OWNER TO postgres;
        SET ROLE postgres;
        REVOKE ALL ON FUNCTION public.has_group_permission(uuid, text, uuid) FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION public.has_group_permission(uuid, text, uuid) TO authenticated, service_role;
        RESET ROLE;
      `,
    },
    {
      id: "NEG_HGP_OWNER",
      sql: `ALTER FUNCTION public.has_group_permission(uuid, text, uuid) OWNER TO ubuntu;`,
    },
    {
      id: "NEG_HGP_PROSECDEF",
      sql: `ALTER FUNCTION public.has_group_permission(uuid, text, uuid) SECURITY INVOKER;`,
    },
    {
      id: "NEG_HGP_SEARCH_PATH",
      sql: `ALTER FUNCTION public.has_group_permission(uuid, text, uuid) SET search_path TO public;`,
    },
    {
      id: "NEG_HGP_EXTRA_EXECUTE",
      sql: `SET ROLE postgres; GRANT EXECUTE ON FUNCTION public.has_group_permission(uuid, text, uuid) TO anon; RESET ROLE;`,
    },
    {
      id: "NEG_HGP_GRANT_OPTION",
      sql: `SET ROLE postgres; GRANT EXECUTE ON FUNCTION public.has_group_permission(uuid, text, uuid) TO authenticated WITH GRANT OPTION; RESET ROLE;`,
    },
    {
      id: "NEG_HGP_OVERLOAD",
      sql: `
        CREATE FUNCTION public.has_group_permission(gid uuid)
        RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$ SELECT false $$;
        ALTER FUNCTION public.has_group_permission(uuid) OWNER TO postgres;
      `,
    },
    {
      id: "NEG_ENQ_BODY",
      sql: `
        CREATE OR REPLACE FUNCTION public.enqueue_outbound_notification(
          p_notification_type text, p_domain_object_id uuid, p_channel public.notification_channel,
          p_recipient_membership_id uuid DEFAULT NULL, p_locale text DEFAULT NULL)
        RETURNS TABLE (queue_id uuid, result text)
        LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
        AS $f$ BEGIN queue_id := NULL; result := 'drift'; RETURN NEXT; END; $f$;
        ALTER FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text) OWNER TO postgres;
        SET ROLE postgres;
        REVOKE ALL ON FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text)
          FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text)
          TO service_role;
        RESET ROLE;
      `,
    },
    {
      id: "NEG_ENQ_RETURN",
      sql: `
        DROP FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text);
        CREATE FUNCTION public.enqueue_outbound_notification(
          p_notification_type text, p_domain_object_id uuid, p_channel public.notification_channel,
          p_recipient_membership_id uuid DEFAULT NULL, p_locale text DEFAULT NULL)
        RETURNS uuid
        LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
        AS $f$ BEGIN RETURN NULL; END; $f$;
        ALTER FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text) OWNER TO postgres;
        SET ROLE postgres;
        REVOKE ALL ON FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text)
          FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text)
          TO service_role;
        RESET ROLE;
      `,
    },
    {
      id: "NEG_ENQ_OWNER",
      sql: `ALTER FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text) OWNER TO ubuntu;`,
    },
    {
      id: "NEG_ENQ_PROSECDEF",
      sql: `ALTER FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text) SECURITY INVOKER;`,
    },
    {
      id: "NEG_ENQ_SEARCH_PATH",
      sql: `ALTER FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text) SET search_path TO public;`,
    },
    {
      id: "NEG_ENQ_AUTHENTICATED_EXECUTE",
      sql: `SET ROLE postgres; GRANT EXECUTE ON FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text) TO authenticated; RESET ROLE;`,
    },
    {
      id: "NEG_ENQ_PUBLIC_EXECUTE",
      sql: `SET ROLE postgres; GRANT EXECUTE ON FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text) TO PUBLIC; RESET ROLE;`,
    },
    {
      id: "NEG_ENQ_GRANT_OPTION",
      sql: `SET ROLE postgres; GRANT EXECUTE ON FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text) TO service_role WITH GRANT OPTION; RESET ROLE;`,
    },
    {
      id: "NEG_ENQ_OVERLOAD",
      sql: `
        CREATE FUNCTION public.enqueue_outbound_notification(p_notification_type text)
        RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$ SELECT 'x' $$;
        ALTER FUNCTION public.enqueue_outbound_notification(text) OWNER TO postgres;
      `,
    },
    {
      id: "NEG_QUEUE_TABLE_UNEXPECTED_DML",
      sql: `SET ROLE postgres; GRANT INSERT ON TABLE public.notifications_queue TO authenticated; RESET ROLE;`,
    },
    {
      id: "NEG_QUEUE_COL_SIXTH_UPDATE",
      sql: `SET ROLE postgres; GRANT UPDATE (id) ON TABLE public.notifications_queue TO service_role; RESET ROLE;`,
    },
    {
      id: "NEG_QUEUE_COL_MISSING_ONE",
      sql: `SET ROLE postgres; REVOKE UPDATE (data) ON TABLE public.notifications_queue FROM service_role; RESET ROLE;`,
    },
    {
      id: "NEG_QUEUE_COL_WRONG_GRANTOR",
      sql: `
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'm2_acl_grantor') THEN
            CREATE ROLE m2_acl_grantor NOLOGIN NOSUPERUSER;
          END IF;
        END$$;
        SET ROLE postgres;
        REVOKE UPDATE (status) ON TABLE public.notifications_queue FROM service_role;
        GRANT UPDATE (status) ON TABLE public.notifications_queue TO m2_acl_grantor WITH GRANT OPTION;
        SET ROLE m2_acl_grantor;
        GRANT UPDATE (status) ON TABLE public.notifications_queue TO service_role;
        RESET ROLE;
      `,
    },
    {
      id: "NEG_QUEUE_COL_GRANT_OPTION",
      sql: `SET ROLE postgres; GRANT UPDATE (status) ON TABLE public.notifications_queue TO service_role WITH GRANT OPTION; RESET ROLE;`,
    },
  ];

  const template = "m2_floor_template";
  recreateDisposableDatabase({ adminUrl, dbName: template });
  const templateUrl = adminUrl.replace(/\/postgres(\?|$)/, `/${template}$1`);
  applyDisposableFloor(templateUrl);

  for (const c of cases) {
    const db = `m2_drift_${c.id.toLowerCase()}`;
    recreateDisposableDatabase({ adminUrl, dbName: db });
    // clone via template
    psqlUrl(adminUrl, `DROP DATABASE IF EXISTS ${db} WITH (FORCE);`);
    const created = psqlUrl(adminUrl, `CREATE DATABASE ${db} TEMPLATE ${template} OWNER ubuntu;`);
    if (!created.ok) {
      results.push({ id: c.id, pass: false, detail: `clone failed: ${created.err}` });
      continue;
    }
    const dbUrl = adminUrl.replace(/\/postgres(\?|$)/, `/${db}$1`);
    const mut = psqlUrl(dbUrl, c.sql);
    if (!mut.ok) {
      results.push({ id: c.id, pass: false, detail: `mutation failed: ${mut.err}` });
      continue;
    }
    const res = apply00117(dbUrl);
    const ok = aborted(res);
    results.push({
      id: c.id,
      pass: ok,
      detail: ok ? "M2_ABORT" : (res.stderr || res.stdout || `exit ${res.status}`).slice(0, 240),
    });
    psqlUrl(adminUrl, `DROP DATABASE IF EXISTS ${db} WITH (FORCE);`);
  }

  return {
    artifact: "M2_NEGATIVE_DRIFT_RESULTS",
    production_mutation: "ZERO",
    pass: results.every((r) => r.pass),
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
    results,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = runNegativeDriftSuite();
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.pass ? 0 : 1);
}
