/**
 * Fail-closed local disposable target / env / spawn-guard proofs.
 * LOCAL ONLY. Does not contact Management API or production.
 */
import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import {
  APPROVED_UNIX_SOCKET,
  LOCAL_CONNECTION_REJECT,
  __installLocalSpawnInterceptorForTests,
  __localSpawnLedgerForTests,
  __resetLocalSpawnForTests,
  assertLocalAdminConnection,
  assertLocalWorkConnection,
  buildLocalSubprocessEnv,
  isolatedCliHomeDir,
  parseLocalConnectionUrl,
  spawnLocalCliSync,
  spawnLocalPsqlSync,
} from "./lib/f3-local-connection-guard.mjs";
import { adminUrl, createDisposableDatabase, psql, psqlFile } from "./fixtures/disposable-postgres.mjs";
import { applyLocalTwoPhaseHistorySimulation, repairHistoryApplied } from "./lib/f3-local-two-phase-history-simulation.mjs";
import {
  REMOTE_MANAGEMENT_API_STATUS,
  applyRemoteManagementApiMigration,
  assertRemoteManagementApiAuthorized,
  listRemoteManagementApiMigrations,
} from "./lib/f3-management-api-remote-harness.mjs";

const LOCAL_OK = [
  [`postgresql://ubuntu@127.0.0.1:5432/f3_ok`, "work"],
  [`postgresql://ubuntu@localhost:5432/f3_ok`, "work"],
  [`postgresql://ubuntu@[::1]:5432/f3_ok`, "work"],
  [`postgresql://ubuntu@/f3_ok?host=${APPROVED_UNIX_SOCKET}`, "work"],
  [`postgresql://ubuntu@/postgres?host=${APPROVED_UNIX_SOCKET}`, "admin"],
];

const REJECT_CASES = [
  ["remote host", "postgresql://ubuntu@db.llbnliixczcqfftxpsmb.supabase.co:5432/f3_ok"],
  ["supabase pooler hostname", "postgresql://ubuntu@aws-0-us-east-1.pooler.supabase.com:5432/f3_ok"],
  ["pooler port", "postgresql://ubuntu@127.0.0.1:6543/f3_ok"],
  ["public IPv4", "postgresql://ubuntu@8.8.8.8:5432/f3_ok"],
  ["RFC1918 IP", "postgresql://ubuntu@10.1.2.3:5432/f3_ok"],
  ["DNS alias docker", "postgresql://ubuntu@host.docker.internal:5432/f3_ok"],
  ["DNS alias nip.io", "postgresql://ubuntu@127.0.0.1.nip.io:5432/f3_ok"],
  ["localhost subdomain alias", "postgresql://ubuntu@localhost.example.com:5432/f3_ok"],
  ["missing database", "postgresql://ubuntu@127.0.0.1:5432/"],
  ["empty database path", "postgresql://ubuntu@127.0.0.1:5432"],
  ["unsafe db postgres as work", "postgresql://ubuntu@127.0.0.1:5432/postgres"],
  ["unsafe db template1", "postgresql://ubuntu@127.0.0.1:5432/template1"],
  ["unsafe db m2 prefix", "postgresql://ubuntu@127.0.0.1:5432/m2_notification_policy_disposable"],
  ["hyphenated db", "postgresql://ubuntu@127.0.0.1:5432/f3-dash"],
  ["prefix only", "postgresql://ubuntu@127.0.0.1:5432/f3_"],
  ["malformed scheme", "http://127.0.0.1:5432/f3_ok"],
  ["not a url", "not-a-connection-string"],
  ["empty string", ""],
  ["query host remote", `postgresql://ubuntu@/f3_ok?host=db.example.supabase.co`],
  ["ambiguous host", `postgresql://ubuntu@127.0.0.1:5432/f3_ok?host=${APPROVED_UNIX_SOCKET}`],
  ["unsafe options override", "postgresql://ubuntu@127.0.0.1:5432/f3_ok?options=-csearch_path%3Dpg_catalog"],
  ["sslrootcert override", "postgresql://ubuntu@127.0.0.1:5432/f3_ok?sslrootcert=/etc/passwd"],
  ["service override", "postgresql://ubuntu@127.0.0.1:5432/f3_ok?service=prod"],
  ["unapproved socket", "postgresql://ubuntu@/f3_ok?host=/tmp/postgres"],
  ["production ref in url", "postgresql://ubuntu@127.0.0.1:5432/f3_ok?application_name=llbnliixczcqfftxpsmb"],
  ["admin url as work", `postgresql://ubuntu@/postgres?host=${APPROVED_UNIX_SOCKET}`],
];

function installRejectingInterceptor() {
  __installLocalSpawnInterceptorForTests(() => {
    throw new Error("SPAWN_REACHED");
  });
}

function assertRejectedBeforeSpawn(fn) {
  installRejectingInterceptor();
  const before = __localSpawnLedgerForTests().length;
  assert.throws(fn, (err) => {
    assert.notEqual(err.message, "SPAWN_REACHED", "child process must not start");
    return (
      err.code === LOCAL_CONNECTION_REJECT ||
      err.code === "F3_REMOTE_MANAGEMENT_API_BLOCKED" ||
      err.code === "F3_REMOTE_PRODUCTION_REFUSED" ||
      /F3_LOCAL_CONNECTION_REJECT|BLOCKED|REFUSE/.test(err.message)
    );
  });
  assert.equal(__localSpawnLedgerForTests().length, before, "zero processes spawned");
}

beforeEach(() => {
  __resetLocalSpawnForTests();
});

afterEach(() => {
  __resetLocalSpawnForTests();
  delete process.env.F3_DISPOSABLE_ADMIN_URL;
});

for (const [url, role] of LOCAL_OK) {
  test(`allowlist accepts ${role} ${url}`, () => {
    const spec = parseLocalConnectionUrl(url, { role });
    assert.equal(spec.database.startsWith(role === "admin" ? "postgres" : "f3_"), true);
    assert.ok(spec.host === "127.0.0.1" || spec.host === "localhost" || spec.host === "::1" || spec.host === APPROVED_UNIX_SOCKET);
  });
}

for (const [label, url] of REJECT_CASES) {
  test(`reject ${label} before spawn: ${url || "(empty)"}`, () => {
    assertRejectedBeforeSpawn(() => parseLocalConnectionUrl(url, { role: "work" }));
    assertRejectedBeforeSpawn(() => psql(url || "postgresql://ubuntu@evil/f3_x", "SELECT 1"));
  });
}

test("admin role rejects f3_ work database", () => {
  assertRejectedBeforeSpawn(() =>
    assertLocalAdminConnection("postgresql://ubuntu@127.0.0.1:5432/f3_ok"),
  );
});

test("work role rejects maintenance postgres database", () => {
  assertRejectedBeforeSpawn(() =>
    assertLocalWorkConnection("postgresql://ubuntu@127.0.0.1:5432/postgres"),
  );
});

test("F3_DISPOSABLE_ADMIN_URL remote override rejected before spawn", () => {
  process.env.F3_DISPOSABLE_ADMIN_URL =
    "postgresql://ubuntu@db.llbnliixczcqfftxpsmb.supabase.co:5432/postgres";
  assertRejectedBeforeSpawn(() => adminUrl());
  assertRejectedBeforeSpawn(() => createDisposableDatabase("safety"));
});

test("F3_DISPOSABLE_ADMIN_URL pooler override rejected before spawn", () => {
  process.env.F3_DISPOSABLE_ADMIN_URL =
    "postgresql://ubuntu@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";
  assertRejectedBeforeSpawn(() => adminUrl());
});

test("F3_DISPOSABLE_ADMIN_URL missing db rejected before spawn", () => {
  process.env.F3_DISPOSABLE_ADMIN_URL = "postgresql://ubuntu@127.0.0.1:5432/";
  assertRejectedBeforeSpawn(() => adminUrl());
});

test("environment sanitization strips secrets and uses isolated HOME", () => {
  process.env.SUPABASE_ACCESS_TOKEN = "tok_should_never_leak";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role_should_never_leak";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://llbnliixczcqfftxpsmb.supabase.co";
  process.env.DATABASE_URL = "postgresql://ubuntu@db.llbnliixczcqfftxpsmb.supabase.co:5432/postgres";
  process.env.PGHOST = "db.llbnliixczcqfftxpsmb.supabase.co";
  process.env.PGPORT = "6543";
  process.env.PGDATABASE = "postgres";
  process.env.PGUSER = "postgres";
  process.env.PGPASSWORD = "prod-password";
  process.env.PGSERVICE = "prod-service";
  process.env.PGSERVICEFILE = "/tmp/pg_service.conf";
  let captured;
  __installLocalSpawnInterceptorForTests(({ opts }) => {
    captured = opts.env;
    return { status: 0, stdout: "1\n", stderr: "" };
  });
  const url = "postgresql://ubuntu@127.0.0.1:5432/f3_ok";
  const { result } = spawnLocalPsqlSync(url, ["-At", "-c", "SELECT 1"], { role: "work" });
  assert.equal(result.status, 0);
  assert.ok(captured);
  assert.equal(captured.SUPABASE_ACCESS_TOKEN, undefined);
  assert.equal(captured.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(captured.NEXT_PUBLIC_SUPABASE_URL, undefined);
  assert.equal(captured.DATABASE_URL, undefined);
  assert.equal(captured.PGSERVICE, undefined);
  assert.equal(captured.PGSERVICEFILE, undefined);
  assert.equal(captured.PGHOST, "127.0.0.1");
  assert.equal(captured.PGPORT, "5432");
  assert.equal(captured.PGDATABASE, "f3_ok");
  assert.equal(captured.PGUSER, "ubuntu");
  assert.equal(captured.PGPASSWORD, "");
  assert.equal(captured.HOME, isolatedCliHomeDir());
  assert.equal(captured.HOME.includes("f3-local-cli-home-"), true);
  delete process.env.SUPABASE_ACCESS_TOKEN;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.DATABASE_URL;
  delete process.env.PGHOST;
  delete process.env.PGPORT;
  delete process.env.PGDATABASE;
  delete process.env.PGUSER;
  delete process.env.PGPASSWORD;
  delete process.env.PGSERVICE;
  delete process.env.PGSERVICEFILE;
});

test("buildLocalSubprocessEnv never copies inherited PG* or tokens", () => {
  process.env.SUPABASE_ACCESS_TOKEN = "x";
  process.env.PGHOST = "evil.example";
  const env = buildLocalSubprocessEnv({
    host: "127.0.0.1",
    port: 5432,
    database: "f3_ok",
    user: "ubuntu",
    password: "",
  });
  assert.equal(env.SUPABASE_ACCESS_TOKEN, undefined);
  assert.equal(env.PGHOST, "127.0.0.1");
  assert.equal(env.HOME, isolatedCliHomeDir());
  delete process.env.SUPABASE_ACCESS_TOKEN;
  delete process.env.PGHOST;
});

test("psqlFile remote target spawns zero processes", () => {
  assertRejectedBeforeSpawn(() =>
    psqlFile("postgresql://ubuntu@8.8.8.8:5432/f3_ok", "/tmp/x.sql"),
  );
});

test("local two-phase simulation rejects remote url before spawn", () => {
  assertRejectedBeforeSpawn(() =>
    applyLocalTwoPhaseHistorySimulation({
      url: "postgresql://ubuntu@db.example.supabase.co:5432/f3_ok",
      fileAbsPath: "/tmp/x.sql",
      version: "20260913120000",
      name: "f3_probe",
    }),
  );
});

test("CLI repair rejects remote db-url before supabase spawn", () => {
  assertRejectedBeforeSpawn(() =>
    repairHistoryApplied({
      version: "20260913120000",
      dbUrl: "postgresql://ubuntu@aws-0-us-east-1.pooler.supabase.com:6543/f3_ok",
      workdir: "/tmp",
    }),
  );
});

test("CLI help/version uses isolated HOME and stripped env", () => {
  process.env.SUPABASE_ACCESS_TOKEN = "tok_should_never_leak";
  let captured;
  __installLocalSpawnInterceptorForTests(({ cmd, opts }) => {
    captured = { cmd, env: opts.env };
    return { status: 0, stdout: "2.117.0\n", stderr: "" };
  });
  const res = spawnLocalCliSync("supabase", ["--version"]);
  assert.equal(res.status, 0);
  assert.equal(captured.cmd, "supabase");
  assert.equal(captured.env.SUPABASE_ACCESS_TOKEN, undefined);
  assert.equal(captured.env.HOME, isolatedCliHomeDir());
  delete process.env.SUPABASE_ACCESS_TOKEN;
});

test("remote Management API harness is blocked and spawns nothing", () => {
  assertRejectedBeforeSpawn(() => applyRemoteManagementApiMigration());
  assertRejectedBeforeSpawn(() => listRemoteManagementApiMigrations());
  assertRejectedBeforeSpawn(() =>
    assertRemoteManagementApiAuthorized({
      projectRef: "some-disposable",
      sentinel: "nope",
      optIn: true,
    }),
  );
  assert.equal(REMOTE_MANAGEMENT_API_STATUS, "BLOCKED — DISPOSABLE PROJECT AUTHORIZATION REQUIRED");
});

test("remote harness refuses production ref without posting", () => {
  assertRejectedBeforeSpawn(() =>
    assertRemoteManagementApiAuthorized({
      projectRef: "llbnliixczcqfftxpsmb",
      optIn: true,
    }),
  );
});

test("rejected cases across parser, psql, and admin override spawn zero processes", () => {
  const urls = REJECT_CASES.map(([, url]) => url).filter(Boolean);
  for (const url of urls) {
    assertRejectedBeforeSpawn(() => parseLocalConnectionUrl(url, { role: "work" }));
  }
  assert.equal(__localSpawnLedgerForTests().length, 0);
});
