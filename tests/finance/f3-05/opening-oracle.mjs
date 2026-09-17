// TEST / CONTRACT ONLY. Pure trusted-snapshot adapter; never a runtime money writer.
import { evaluateCommand, normalizeTimestamp, uuid } from "../f3-02/oracle.mjs";
export const ACCOUNT_KINDS = Object.freeze(["bank", "cash"]);
const fail = code => { throw new Error(code); };
function keys(x, allowed) {
  if (!x || Object.getPrototypeOf(x) !== Object.prototype) fail("INVALID_INPUT");
  if (Object.keys(x).some(k => !allowed.includes(k))) fail("UNSUPPORTED_FIELD");
  if (Object.values(x).some(v => v === undefined)) fail("INVALID_INPUT");
}
function text(x, max) {
  if (typeof x !== "string" || !x.trim() || [...x].length > max ||
      /[\u0000-\u001f\u007f-\u009f]/u.test(x) ||
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(x)) fail("INVALID_PROVENANCE");
  return x; // Preserve exact narrative; no second canonicalization/fingerprint.
}
export function provenanceDetails(value) {
  keys(value, ["source_description", "source_at", "reference_metadata"]);
  const out = { source_description: text(value.source_description, 1000),
    source_at: value.source_at == null ? null : normalizeTimestamp(value.source_at),
    reference_metadata: {} };
  if (value.reference_metadata != null) {
    keys(value.reference_metadata, ["reference", "evidence_ids"]);
    const m = value.reference_metadata;
    if (m.reference != null) out.reference_metadata.reference = text(m.reference, 500);
    if (m.evidence_ids != null) {
      if (!Array.isArray(m.evidence_ids) || m.evidence_ids.length > 20) fail("INVALID_PROVENANCE");
      out.reference_metadata.evidence_ids = m.evidence_ids.map(uuid);
    }
  }
  return out;
}
export function evaluateOpening(input, context) {
  // These booleans are trusted TEST fixtures, not browser claims or implemented auth.
  if (context.authorized !== true || context.authorized_after_locks !== true || !context.actor_id) fail("DENY");
  const actor = uuid(context.actor_id);
  keys(input, ["group_id", "opening_occurrence_id", "opening_provenance_id", "provenance",
    "account_id", "fund_id", "amount", "occurred_at", "currency"]);
  const group = uuid(input.group_id), occurrence = uuid(input.opening_occurrence_id);
  const provenanceId = uuid(input.opening_provenance_id);
  const proposed = provenanceDetails(input.provenance);
  const accountId = uuid(input.account_id), fundId = uuid(input.fund_id);
  if (Object.hasOwn(input, "currency") && input.currency === null) fail("UNSUPPORTED_CURRENCY");
  const existing = context.existing ?? [];
  if (existing.some(e => e.payload.group_id === group && e.payload.request_id === occurrence))
    fail("REQUEST_ID_REUSED");
  const rows = (context.provenances ?? []).filter(p => p.id === provenanceId);
  if (rows.length > 1) fail("PROVENANCE_INTEGRITY");
  const saved = rows[0];
  if (saved && saved.group_id !== group) fail("CROSS_GROUP_PROVENANCE");
  if (saved) {
    provenanceDetails(saved.details); uuid(saved.recorded_by); normalizeTimestamp(saved.recorded_at);
  }
  const command = { action:"opening", group_id:group, account_id:accountId, fund_id:fundId,
    amount:input.amount, occurred_at:input.occurred_at };
  if (Object.hasOwn(input, "currency")) command.currency = input.currency;
  // All math, epoch resolution, economic fingerprinting and replay comparison are F3-02.
  const result = evaluateCommand(command, { ...context, channel:"opening_internal",
    opening_occurrence:{ group_id:group, occurrence_id:occurrence,
      provenance:{ id:provenanceId, group_id:group } } });
  if (result.decision === "IDEMPOTENT_RETURN_EXISTING") {
    if (!saved) fail("PROVENANCE_INTEGRITY");
    return { ...result, provenance:structuredClone(saved), new_provenance_count:0 };
  }
  const account = context.accounts.find(a => a.id === accountId && a.group_id === group);
  if (!ACCOUNT_KINDS.includes(account.kind)) fail("ACCOUNT_KIND_NOT_ALLOWED");
  if (account.closed_at != null) fail("ACCOUNT_CLOSED");
  const provenance = saved ?? { id:provenanceId, group_id:group, details:proposed,
    recorded_by:actor, recorded_at:normalizeTimestamp(context.recorded_at) };
  return { ...result, provenance:structuredClone(provenance), new_provenance_count:saved ? 0 : 1 };
}
