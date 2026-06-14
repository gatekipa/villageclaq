import assert from "node:assert/strict";
import test from "node:test";
import {
  mapWhatsAppStatusToDeliveryStatus,
  deliveryStatusIsTerminal,
  deliveryStatusRequiresProviderEvidence,
  deliveryStatusIsDelivered,
  WHATSAPP_US_MARKETING_BLOCK_CODE,
} from "../src/lib/announcement-delivery-status-mapping.ts";

// Build-8 unit tests for the announcement delivery-status mapper (Node 22 strips
// TS types on import — real logic under test). Core honesty rule: a status is
// only set from evidence; "sent" (acceptance) is NEVER "delivered", and the US
// MARKETING block (131049) maps to a SPECIFIC blocked_by_policy, never a generic
// "failed" or a false "delivered".

test("131049 always maps to blocked_by_policy (US MARKETING block), regardless of status", () => {
  assert.equal(WHATSAPP_US_MARKETING_BLOCK_CODE, "131049");
  assert.equal(mapWhatsAppStatusToDeliveryStatus("failed", "131049"), "blocked_by_policy");
  assert.equal(mapWhatsAppStatusToDeliveryStatus("sent", "131049"), "blocked_by_policy");
  assert.equal(mapWhatsAppStatusToDeliveryStatus("failed", 131049), "blocked_by_policy");
});

test("provider 'sent' maps to sent_to_provider, NOT delivered", () => {
  assert.equal(mapWhatsAppStatusToDeliveryStatus("sent"), "sent_to_provider");
  assert.notEqual(mapWhatsAppStatusToDeliveryStatus("sent"), "delivered");
});

test("delivered/read/failed map straight through", () => {
  assert.equal(mapWhatsAppStatusToDeliveryStatus("delivered"), "delivered");
  assert.equal(mapWhatsAppStatusToDeliveryStatus("read"), "read");
  assert.equal(mapWhatsAppStatusToDeliveryStatus("failed"), "failed");
});

test("unknown/empty provider status maps to unavailable, never a positive state", () => {
  assert.equal(mapWhatsAppStatusToDeliveryStatus("something-weird"), "unavailable");
  assert.equal(mapWhatsAppStatusToDeliveryStatus(""), "unavailable");
  assert.equal(mapWhatsAppStatusToDeliveryStatus(null), "unavailable");
  assert.equal(mapWhatsAppStatusToDeliveryStatus(undefined), "unavailable");
});

test("a non-131049 error with status 'failed' is a plain failed (not blocked)", () => {
  assert.equal(mapWhatsAppStatusToDeliveryStatus("failed", "131000"), "failed");
});

test("delivered/read are the only evidence-backed 'delivered' counts", () => {
  assert.equal(deliveryStatusIsDelivered("delivered"), true);
  assert.equal(deliveryStatusIsDelivered("read"), true);
  for (const s of ["queued", "sent_to_provider", "in_app_published", "failed", "blocked_by_policy", "unavailable"]) {
    assert.equal(deliveryStatusIsDelivered(s), false, `${s} must not count as delivered`);
  }
});

test("provider-evidence statuses require provider proof", () => {
  for (const s of ["delivered", "read", "failed", "blocked_by_policy"]) {
    assert.equal(deliveryStatusRequiresProviderEvidence(s), true, `${s} needs provider evidence`);
  }
  for (const s of ["queued", "sent_to_provider", "in_app_published", "unavailable", "skipped_no_recipient", "skipped_channel_disabled"]) {
    assert.equal(deliveryStatusRequiresProviderEvidence(s), false, `${s} is producer-time, no provider needed`);
  }
});

test("terminal vs non-terminal classification", () => {
  for (const s of ["delivered", "read", "failed", "blocked_by_policy", "unavailable", "skipped_no_recipient", "skipped_channel_disabled", "in_app_published"]) {
    assert.equal(deliveryStatusIsTerminal(s), true, `${s} is terminal`);
  }
  for (const s of ["pending", "queued", "sent_to_provider", "sent"]) {
    assert.equal(deliveryStatusIsTerminal(s), false, `${s} is not terminal`);
  }
});
