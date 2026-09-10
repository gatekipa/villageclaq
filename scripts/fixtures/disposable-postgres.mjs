import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

const outputOptions = {
  encoding: "utf8",
  stdio: ["pipe", "pipe", "pipe"],
  maxBuffer: 16 * 1024 * 1024,
};

export function createDisposablePostgres({ name, label }) {
  const nativeBin = process.env.VILLAGECLAQ_PG17_BIN || null;
  const container = `villageclaq-${name}-${process.pid}-${Date.now()}`;
  const image = "postgres:17-alpine";
  const port = 47000 + (process.pid % 1000);
  let dataDir = null;

  const docker = (args, options = {}) => execFileSync("docker", args, {
    ...outputOptions,
    ...options,
  }).trim();

  const native = (program, args, options = {}) => {
    const result = execFileSync(join(nativeBin, `${program}.exe`), args, {
      ...outputOptions,
      ...options,
    });
    return typeof result === "string" ? result.trim() : "";
  };

  const psqlArgs = () => nativeBin
    ? ["-X", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"]
    : ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];

  const sql = (query) => nativeBin
    ? native("psql", psqlArgs(), { input: query })
    : docker(psqlArgs(), { input: query });

  const asyncSql = (query) => new Promise((resolvePromise, rejectPromise) => {
    const executable = nativeBin ? join(nativeBin, "psql.exe") : "docker";
    const child = execFile(executable, psqlArgs(), { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) rejectPromise(new Error(stderr || error.message));
      else resolvePromise(stdout.trim());
    });
    child.stdin.end(query);
  });

  const openSql = () => {
    const executable = nativeBin ? join(nativeBin, "psql.exe") : "docker";
    const child = execFile(executable, psqlArgs(), { encoding: "utf8" });
    return child;
  };

  async function start() {
    if (nativeBin) {
      assert.match(native("postgres", ["--version"]), /^postgres \(PostgreSQL\) 17\./);
      dataDir = mkdtempSync(join(tmpdir(), `villageclaq-${name}-`));
      native("initdb", ["-D", dataDir, "-U", "postgres", "--auth=trust", "--no-sync", "--encoding=UTF8"]);
      native("pg_ctl", ["-D", dataDir, "-l", join(dataDir, "server.log"),
        "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], { stdio: "ignore" });
      assert.equal(sql("SHOW server_version_num;").slice(0, 2), "17");
      assert.equal(sql("SHOW listen_addresses;"), "127.0.0.1");
      assert.equal(sql("SELECT pg_catalog.host(pg_catalog.inet_server_addr());"), "127.0.0.1");
      return;
    }

    docker(["run", "--rm", "-d", "--name", container, "--network", "none",
      "--label", `villageclaq.test=${label}`, "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
      "-e", "POSTGRES_INITDB_ARGS=--no-sync", image]);
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        docker(["exec", container, "pg_isready", "-U", "postgres"]);
        ready = true;
        break;
      } catch {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
      }
    }
    assert.equal(ready, true, "disposable PostgreSQL did not become ready");
    const info = JSON.parse(docker(["inspect", container]))[0];
    assert.equal(info.Config.Labels["villageclaq.test"], label);
    assert.equal(info.HostConfig.NetworkMode, "none");
    assert.deepEqual(info.HostConfig.PortBindings, {});
    assert.equal(info.Mounts.some((mount) => mount.Type === "bind"), false);
  }

  function stop() {
    if (nativeBin) {
      if (!dataDir) return;
      const resolvedData = realpathSync(dataDir);
      const resolvedTemp = realpathSync(tmpdir());
      assert.ok(resolvedData.startsWith(`${resolvedTemp}${sep}`));
      try {
        native("pg_ctl", ["-D", resolvedData, "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
      } finally {
        rmSync(resolve(resolvedData), { recursive: true, force: true });
        dataDir = null;
      }
      return;
    }
    const info = JSON.parse(docker(["inspect", container]))[0];
    assert.equal(info.Config.Labels["villageclaq.test"], label);
    docker(["rm", "-f", container]);
  }

  return { sql, asyncSql, openSql, start, stop, native: Boolean(nativeBin) };
}
