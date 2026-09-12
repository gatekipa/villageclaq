import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
import { read } from "./_cut2_test_helpers.mjs";

const routePath = new URL("../src/app/api/email/send/route.ts", import.meta.url);
const require = createRequire(import.meta.url);

const HOSTILE_BODIES = [
  { to: "attacker@evil.test", template: "payment-receipt", data: { amount: "999999", memberName: "X" } },
  { to: "attacker@evil.test", template: "welcome", data: { memberName: "X", groupName: "Y" } },
  { to: ["a@b.test", "c@d.test"], subject: "pwn", html: "<script>alert(1)</script>" },
  { to: "+237600000000", template: "invitation", data: { acceptUrl: "https://evil.test" } },
  { template: "event-reminder", data: { eventTitle: "AGM" } },
  { to: "x", from: "spoof@villageclaq.com", text: "hello" },
  null,
  "",
  { nested: { to: "attacker@evil.test" } },
];

function createSpies() {
  return {
    requires: [],
    nextResponseCalls: [],
    sendEmail: 0,
    sendEmailInvocations: [],
    resendModule: 0,
    resendClient: 0,
    resendSend: 0,
    enqueue: 0,
    enqueueRpc: 0,
    queueWrite: 0,
    fetchCalls: 0,
  };
}

function loadEmailSendRoute(spies) {
  const source = fs.readFileSync(routePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const cjsModule = { exports: {} };
  const localRequire = (id) => {
    spies.requires.push(id);
    if (id === "next/server") {
      return {
        NextResponse: {
          json(body, init) {
            spies.nextResponseCalls.push({ body, status: init?.status ?? 200 });
            return {
              status: init?.status ?? 200,
              body,
              json: async () => body,
            };
          },
        },
      };
    }
    if (id === "@/lib/send-email" || id.endsWith("/send-email") || id.endsWith("/send-email.ts")) {
      spies.sendEmail += 1;
      return {
        sendEmail: async (...args) => {
          spies.sendEmailInvocations.push(args);
          return { success: true };
        },
        sendBulkEmail: async (...args) => {
          spies.sendEmailInvocations.push(args);
          return { success: true };
        },
      };
    }
    if (id === "@/lib/resend" || id.endsWith("/resend") || id === "resend") {
      spies.resendModule += 1;
      return {
        getResendClient() {
          spies.resendClient += 1;
          return {
            emails: {
              send: async () => {
                spies.resendSend += 1;
                return { data: { id: "mock" }, error: null };
              },
            },
          };
        },
        Resend: function Resend() {
          spies.resendClient += 1;
          this.emails = {
            send: async () => {
              spies.resendSend += 1;
              return { data: { id: "mock" }, error: null };
            },
          };
        },
      };
    }
    if (
      id === "@/lib/enqueue-outbound-notification" ||
      id.endsWith("/enqueue-outbound-notification")
    ) {
      spies.enqueue += 1;
      return {
        enqueueCut2ProducerChannels: async () => {
          spies.enqueue += 1;
          return { queued: 1 };
        },
      };
    }
    return require(id);
  };
  vm.runInNewContext(
    compiled,
    {
      console,
      exports: cjsModule.exports,
      module: cjsModule,
      require: localRequire,
      process,
    },
    { filename: routePath.pathname },
  );
  return cjsModule.exports;
}

function fakeRequest(body) {
  return {
    method: "POST",
    json: async () => body,
    text: async () => (body == null ? "" : JSON.stringify(body)),
    headers: new Map(),
  };
}

function assertZeroSideEffects(spies, label) {
  assert.equal(spies.sendEmail, 0, `${label}: sendEmail module must not load`);
  assert.equal(spies.sendEmailInvocations.length, 0, `${label}: sendEmail invocations`);
  assert.equal(spies.resendModule, 0, `${label}: resend module must not load`);
  assert.equal(spies.resendClient, 0, `${label}: Resend client`);
  assert.equal(spies.resendSend, 0, `${label}: Resend send`);
  assert.equal(spies.enqueue, 0, `${label}: enqueue`);
  assert.equal(spies.enqueueRpc, 0, `${label}: enqueue RPC`);
  assert.equal(spies.queueWrite, 0, `${label}: queue write`);
  assert.equal(spies.fetchCalls, 0, `${label}: network fetch`);
  assert.equal(
    spies.requires.some((id) => /send-email|resend|enqueue-outbound|notifications_queue/.test(id)),
    false,
    `${label}: hostile modules required: ${spies.requires.join(", ")}`,
  );
}

test("POST /api/email/send is 410 for every hostile body with zero side effects", async () => {
  const originalFetch = globalThis.fetch;
  const spies = createSpies();
  globalThis.fetch = async (...args) => {
    spies.fetchCalls += 1;
    throw new Error(`network forbidden: ${String(args[0])}`);
  };
  try {
    const { POST } = loadEmailSendRoute(spies);
    assert.equal(typeof POST, "function");
    for (const body of HOSTILE_BODIES) {
      const res = await POST(fakeRequest(body));
      assert.equal(res.status, 410, `POST must be 410 for body ${JSON.stringify(body)}`);
      const json = await res.json();
      assert.equal(json.error, "gone");
    }
    assert.equal(spies.nextResponseCalls.length, HOSTILE_BODIES.length);
    assert.ok(spies.nextResponseCalls.every((c) => c.status === 410));
    assertZeroSideEffects(spies, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GET /api/email/send is 410 with zero side effects", async () => {
  const originalFetch = globalThis.fetch;
  const spies = createSpies();
  globalThis.fetch = async (...args) => {
    spies.fetchCalls += 1;
    throw new Error(`network forbidden: ${String(args[0])}`);
  };
  try {
    const { GET } = loadEmailSendRoute(spies);
    assert.equal(typeof GET, "function");
    const res = await GET({ method: "GET", url: "/api/email/send?to=attacker@evil.test" });
    assert.equal(res.status, 410);
    const json = await res.json();
    assert.equal(json.error, "gone");
    assertZeroSideEffects(spies, "GET");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("email send route source stays 410-only (defense in depth)", () => {
  const src = read("src/app/api/email/send/route.ts");
  assert.match(src, /status:\s*410/);
  assert.match(src, /export async function POST/);
  assert.match(src, /export async function GET/);
  assert.doesNotMatch(src, /sendEmail\(/);
  assert.doesNotMatch(src, /getResendClient/);
  assert.doesNotMatch(src, /resend\.emails/);
  assert.doesNotMatch(src, /notifications_queue/);
  assert.doesNotMatch(src, /enqueue_outbound_notification/);
  assert.doesNotMatch(src, /enqueueCut2ProducerChannels/);
  assert.doesNotMatch(src, /request\.json/);
});
