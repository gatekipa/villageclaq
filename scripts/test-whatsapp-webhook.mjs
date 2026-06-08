import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = new URL("../src/lib/whatsapp-webhook-status.ts", import.meta.url);
const require = createRequire(import.meta.url);
const recipientDigits = ["1", "301", "433", "5857"].join("");
const displayPhone = ["+1", "320", "555", "4494"].join(" ");

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadWebhookModule() {
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;

  const cjsModule = { exports: {} };
  vm.runInNewContext(compiled, {
    console,
    exports: cjsModule.exports,
    module: cjsModule,
    require,
  }, { filename: sourcePath.pathname });
  return cjsModule.exports;
}

function makePayload(statuses) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: displayPhone,
                phone_number_id: "phone-id",
              },
              statuses,
            },
          },
        ],
      },
    ],
  };
}

function createMockSupabase(rows) {
  const calls = [];

  class Builder {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.updatePayload = null;
    }

    insert(payload) {
      calls.push({ op: "insert", table: this.table, payload });
      return Promise.resolve({ error: null });
    }

    select(columns) {
      this.columns = columns;
      calls.push({ op: "select", table: this.table, columns, filters: this.filters });
      return this;
    }

    eq(column, value) {
      this.filters.push({ type: "eq", column, value });
      return this;
    }

    contains(column, value) {
      this.filters.push({ type: "contains", column, value });
      return this;
    }

    update(payload) {
      this.updatePayload = payload;
      calls.push({ op: "update", table: this.table, payload, filters: this.filters });
      return this;
    }

    then(resolve) {
      if (this.table === "notifications_queue" && this.updatePayload) {
        return Promise.resolve(resolve({ error: null }));
      }
      if (this.table === "notifications_queue") {
        return Promise.resolve(resolve({ data: rows, error: null }));
      }
      return Promise.resolve(resolve({ error: null }));
    }
  }

  return {
    calls,
    from(table) {
      return new Builder(table);
    },
  };
}

test("verifies Meta GET challenge only when token matches", () => {
  const { verifyWhatsAppWebhookChallenge } = loadWebhookModule();
  const params = new URLSearchParams({
    "hub.mode": "subscribe",
    "hub.verify_token": "expected-token",
    "hub.challenge": "challenge-value",
  });

  assert.deepEqual(plain(verifyWhatsAppWebhookChallenge(params, "expected-token")), {
    ok: true,
    challenge: "challenge-value",
    status: 200,
  });

  assert.deepEqual(plain(verifyWhatsAppWebhookChallenge(params, "wrong-token")), {
    ok: false,
    status: 403,
  });
});

test("extracts sent, delivered, read, and failed statuses with sanitized raw events", () => {
  const { extractWhatsAppStatusEvents } = loadWebhookModule();
  const payload = makePayload([
    { id: "wamid.sent", status: "sent", timestamp: "1780920000", recipient_id: recipientDigits },
    { id: "wamid.delivered", status: "delivered", timestamp: "1780920001", recipient_id: recipientDigits },
    { id: "wamid.read", status: "read", timestamp: "1780920002", recipient_id: recipientDigits },
    {
      id: "wamid.failed",
      status: "failed",
      timestamp: "1780920003",
      recipient_id: recipientDigits,
      errors: [
        {
          code: 131026,
          title: "Message undeliverable",
          message: "Message undeliverable",
          error_data: { details: "Recipient is not available." },
        },
      ],
    },
  ]);

  const events = extractWhatsAppStatusEvents(payload);

  assert.equal(events.length, 4);
  assert.deepEqual(plain(events.map((event) => event.status)), ["sent", "delivered", "read", "failed"]);
  assert.equal(events[0].providerMessageId, "wamid.sent");
  assert.equal(events[0].recipientPhoneMask, "130******857");
  assert.equal(events[3].errorCode, "131026");
  assert.equal(events[3].errorTitle, "Message undeliverable");
  assert.equal(events[3].errorMessage, "Recipient is not available.");
  assert.equal(events[0].rawEvent.recipient_id, "130******857");
  assert.equal(events[0].rawEvent.metadata.display_phone_number, "132******494");
});

test("masks embedded phone substrings in failed status errors and queue updates", async () => {
  const { extractWhatsAppStatusEvents, persistWhatsAppStatusEvent } = loadWebhookModule();
  const providerMessageId = "wamid.HBgM1234567890ABC";
  const payload = makePayload([
    {
      id: providerMessageId,
      status: "failed",
      timestamp: "1780920003",
      recipient_id: recipientDigits,
      errors: [
        {
          code: 131026,
          title: `Message undeliverable for ${recipientDigits}`,
          message: `Could not deliver to +${recipientDigits}.`,
          error_data: {
            details: `Recipient ${recipientDigits} is not reachable; keep reason text.`,
          },
        },
      ],
    },
  ]);

  const [event] = extractWhatsAppStatusEvents(payload);
  assert.equal(event.providerMessageId, providerMessageId);
  assert.equal(event.rawEvent.id, providerMessageId);
  assert.equal(event.recipientPhoneMask, "130******857");
  assert.equal(event.errorTitle, "Message undeliverable for 130******857");
  assert.equal(event.errorMessage, "Recipient 130******857 is not reachable; keep reason text.");
  assert.equal(event.rawEvent.errors[0].title, "Message undeliverable for 130******857");
  assert.equal(event.rawEvent.errors[0].message, "Could not deliver to +130******857.");
  assert.equal(event.rawEvent.errors[0].error_data.details, "Recipient 130******857 is not reachable; keep reason text.");

  const supabase = createMockSupabase([
    {
      id: "queue-1",
      data: {
        providerMessageId,
        providerStatus: "accepted",
      },
    },
  ]);

  await persistWhatsAppStatusEvent(supabase, event);

  const eventInsert = supabase.calls.find((call) => call.op === "insert" && call.table === "whatsapp_message_status_events");
  assert.equal(eventInsert.payload.provider_message_id, providerMessageId);
  assert.equal(eventInsert.payload.error_title, "Message undeliverable for 130******857");
  assert.equal(eventInsert.payload.error_message, "Recipient 130******857 is not reachable; keep reason text.");
  assert.equal(eventInsert.payload.raw_event.errors[0].message, "Could not deliver to +130******857.");

  const queueUpdate = supabase.calls.find((call) => call.op === "update" && call.table === "notifications_queue");
  assert.equal(queueUpdate.payload.data.providerStatus, "accepted");
  assert.equal(queueUpdate.payload.data.latestProviderStatus, "failed");
  assert.equal(queueUpdate.payload.data.providerErrorMessage, "Recipient 130******857 is not reachable; keep reason text.");
});

test("persists status events and updates matching queue rows by provider message ID", async () => {
  const { persistWhatsAppStatusEvent } = loadWebhookModule();
  const supabase = createMockSupabase([
    {
      id: "queue-1",
      data: {
        providerMessageId: "wamid.delivered",
        providerStatus: "accepted",
      },
    },
  ]);

  await persistWhatsAppStatusEvent(supabase, {
    providerMessageId: "wamid.delivered",
    status: "delivered",
    recipientPhoneMask: "130******857",
    metaTimestamp: "2026-06-08T15:04:00.000Z",
    rawEvent: { id: "wamid.delivered", status: "delivered", recipient_id: "130******857" },
  });

  const eventInsert = supabase.calls.find((call) => call.op === "insert" && call.table === "whatsapp_message_status_events");
  assert.equal(eventInsert.payload.provider_message_id, "wamid.delivered");
  assert.equal(eventInsert.payload.status, "delivered");
  assert.equal(eventInsert.payload.recipient_phone_mask, "130******857");

  const queueSelect = supabase.calls.find((call) => call.op === "select" && call.table === "notifications_queue");
  assert.deepEqual(plain(queueSelect.filters), [
    { type: "eq", column: "channel", value: "whatsapp" },
    { type: "contains", column: "data", value: { providerMessageId: "wamid.delivered" } },
  ]);

  const queueUpdate = supabase.calls.find((call) => call.op === "update" && call.table === "notifications_queue");
  assert.equal(queueUpdate.payload.data.providerStatus, "accepted");
  assert.equal(queueUpdate.payload.data.latestProviderStatus, "delivered");
  assert.equal(queueUpdate.payload.data.latestProviderStatusAt, "2026-06-08T15:04:00.000Z");
});
