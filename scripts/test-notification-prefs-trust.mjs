import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = new URL("../src/lib/notification-prefs.ts", import.meta.url);
const require = createRequire(import.meta.url);

function loadPrefs() {
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const cjsModule = { exports: {} };
  vm.runInNewContext(
    compiled,
    {
      console,
      exports: cjsModule.exports,
      module: cjsModule,
      require: (id) => require(id),
    },
    { filename: sourcePath.pathname },
  );
  return cjsModule.exports;
}

function mockSupabase({ error = null, data = {} } = {}) {
  return {
    rpc(name, _args) {
      assert.equal(name, "get_notification_preferences");
      return Promise.resolve({ data, error });
    },
  };
}

const { getEnabledChannels } = loadPrefs();

test("real user + preference RPC error → external ALL false, in_app true", async () => {
  const channels = await getEnabledChannels(
    mockSupabase({ error: { message: "boom" } }),
    "user-1",
    "payment_reminders",
    "group-1",
  );
  assert.deepEqual(channels, {
    in_app: true,
    email: false,
    sms: false,
    whatsapp: false,
    push: false,
  });
});

test("real user + saved opt-outs respected", async () => {
  const channels = await getEnabledChannels(
    mockSupabase({
      data: {
        channels: { email: false, sms: false, whatsapp: true, push: false },
        types: {
          payment_reminders: { email: true, sms: true, whatsapp: false, push: false },
        },
      },
    }),
    "user-1",
    "payment_reminders",
  );
  // global email false → email false; type whatsapp false → whatsapp false; sms global false
  assert.equal(channels.in_app, true);
  assert.equal(channels.email, false);
  assert.equal(channels.sms, false);
  assert.equal(channels.whatsapp, false);
  assert.equal(channels.push, false);
});

test("real user + normal successful preferences → intended defaults/combine", async () => {
  const channels = await getEnabledChannels(
    mockSupabase({ data: { channels: {}, types: {} } }),
    "user-1",
    "payment_reminders",
  );
  assert.deepEqual(channels, {
    in_app: true,
    email: true,
    sms: true,
    whatsapp: true,
    push: true,
  });
});

test("muted group → in_app only", async () => {
  const channels = await getEnabledChannels(
    mockSupabase({
      data: {
        channels: { email: true, sms: true, whatsapp: true, push: true },
        muted_groups: ["group-muted"],
      },
    }),
    "user-1",
    "event_reminders",
    "group-muted",
  );
  assert.deepEqual(channels, {
    in_app: true,
    email: false,
    sms: false,
    whatsapp: false,
    push: false,
  });
});

test("proxy userId=null → intentional WhatsApp-only", async () => {
  const channels = await getEnabledChannels(
    mockSupabase({ error: { message: "should-not-be-called" } }),
    null,
    "payment_reminders",
    "group-1",
  );
  assert.deepEqual(channels, {
    in_app: false,
    email: false,
    sms: false,
    whatsapp: true,
    push: false,
  });
});

test("error path NEVER throws", async () => {
  await assert.doesNotReject(async () => {
    await getEnabledChannels(
      {
        rpc() {
          return Promise.reject(new Error("network"));
        },
      },
      "user-1",
      "hosting_reminders",
    );
  });
});

// EN/FR key parity for Trust Cut 1 report labels
test("EN/FR reports category + report2/3/4 keys exist with contribution-honest copy", () => {
  const en = JSON.parse(fs.readFileSync(new URL("../messages/en.json", import.meta.url), "utf8"));
  const fr = JSON.parse(fs.readFileSync(new URL("../messages/fr.json", import.meta.url), "utf8"));
  assert.equal(en.reports.categories.financial, "Contributions & Dues");
  assert.equal(en.reports.report2.name, "Annual Contributions Summary");
  assert.equal(en.reports.report3.name, "Contribution Ledger");
  assert.equal(en.reports.report4.name, "Contribution Arrears Aging");
  assert.equal(fr.reports.categories.financial, "Cotisations et contributions");
  assert.equal(fr.reports.report4.name, "Ancienneté des arriérés de cotisations");
  assert.equal(fr.reports.report2.name, "Résumé annuel des cotisations");
  assert.equal(fr.reports.report3.name, "Grand livre des cotisations");
  assert.ok(!/\bdues\b/i.test(fr.reports.categories.financial));
  assert.ok(!/\bdues\b/i.test(fr.reports.report4.name));
  assert.ok(!/\bdues\b/i.test(fr.reports.report4.desc));
});
