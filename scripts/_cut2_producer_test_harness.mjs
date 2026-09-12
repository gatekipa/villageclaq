/**
 * Shared Cut 2 producer-test adapter.
 * Records semantic enqueue calls. Does not restore old queue payloads.
 */
export function createCut2EnqueueMock(options = {}) {
  const calls = options.calls || [];
  const modeFor = options.modeFor || (() => options.mode || "inserted");
  const stableId = options.queueId || "cut2-qid";

  return {
    calls,
    enqueueCut2ProducerChannels: async (args) => {
      const mode = modeFor(args);
      calls.push({ ...args, mode });
      if (mode === "duplicate") {
        return {
          anyInserted: false,
          anyDuplicate: true,
          anyDenied: false,
          failClosed: false,
          whatsappInserted: false,
          results: [{ queueId: stableId, result: "duplicate" }],
        };
      }
      if (mode === "mismatch") {
        return {
          anyInserted: false,
          anyDuplicate: false,
          anyDenied: false,
          failClosed: false,
          whatsappInserted: false,
          results: [{ queueId: null, result: "trusted_idempotency_conflict_mismatch" }],
        };
      }
      if (mode === "denied") {
        return {
          anyInserted: false,
          anyDuplicate: false,
          anyDenied: true,
          failClosed: false,
          whatsappInserted: false,
          results: [{ queueId: null, result: "denied" }],
        };
      }
      if (mode === "fail_closed") {
        return {
          anyInserted: false,
          anyDuplicate: false,
          anyDenied: false,
          failClosed: true,
          whatsappInserted: false,
          results: [{ queueId: null, result: "fail_closed", error: "cut2_rpc_unavailable" }],
        };
      }
      return {
        anyInserted: true,
        anyDuplicate: false,
        anyDenied: false,
        failClosed: false,
        whatsappInserted: true,
        results: [{ queueId: stableId, result: "inserted" }],
      };
    },
  };
}

export function assertSemanticEnqueue(assert, calls, expected) {
  assert.ok(calls.length > 0, "expected semantic enqueue");
  const last = calls[calls.length - 1];
  if (expected.notificationType) assert.equal(last.notificationType, expected.notificationType);
  if (expected.domainObjectId) assert.equal(last.domainObjectId, expected.domainObjectId);
  if (expected.recipientMembershipId) assert.equal(last.recipientMembershipId, expected.recipientMembershipId);
  if (expected.locale) assert.equal(last.locale, expected.locale);
  return last;
}
