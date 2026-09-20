// TEST / CONTRACT ONLY. Pure proposals over trusted fixtures; no IO, persistence,
// clock, real authorization or locks. Never import this module into production.
import { createHash } from "node:crypto";
import { evaluateCommand, normalizeAmount, normalizeTimestamp, uuid, fingerprint as postingFingerprint } from "../f3-02/oracle.mjs";
import { minorUnits, decimal } from "../f3-03/projection-oracle.mjs";

export const VERSION = "f3-correction-v1";
export const CHILD_VERSION = "f3-correction-child-v1";
export const FIELDS = Object.freeze(["action", "amount", "occurred_at", "currency",
  "account_id", "destination_account_id", "fund_id", "category_id", "member_id", "project_id"]);
export const DIMENSIONS = Object.freeze(["group_id", "ledger_epoch_id", "currency", "occurred_at",
  "account_id", "fund_id", "category_id", "category_class", "member_id", "project_id", "control_class"]);
const fail = code => { throw new Error(code); };
const plain = x => x !== null && typeof x === "object" && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
function keys(x, allowed) {
  if (!plain(x)) fail("INVALID_INPUT");
  if (Object.keys(x).some(k => !allowed.includes(k))) fail("UNSUPPORTED_FIELD");
  if (Object.values(x).some(v => v === undefined)) fail("INVALID_INPUT");
}
const order = x => Array.isArray(x) ? x.map(order) : plain(x) ?
  Object.fromEntries(Object.keys(x).sort().map(k => [k, order(x[k])])) : x;
export const canonicalBytes = x => JSON.stringify(order(x));
export const fingerprint = x => createHash("sha256").update(canonicalBytes(x), "utf8").digest("hex");
const equal = (a, b) => canonicalBytes(a) === canonicalBytes(b);
export function normalizeReason(value) {
  if (typeof value !== "string") fail("REASON_REQUIRED");
  // Fixed Unicode White_Space set, independent of locale; NFC then collapse.
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) fail("INVALID_REASON");
  const reason = value.normalize("NFC").replace(/[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/gu, " ").replace(/^ | $/g, "");
  if (/[\u0000-\u001F\u007F-\u009F\u200B\uFEFF]/u.test(reason)) fail("INVALID_REASON");
  if ([...reason].length < 3 || [...reason].length > 1000) fail("REASON_LENGTH");
  return reason;
}
// RFC 9562 UUIDv5, URL namespace. IDs are deterministic, never client-selected.
export function childId(group, request, role) {
  const namespace = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");
  const name = "villageclaq/" + VERSION + "/" + uuid(group) + "/" + uuid(request) + "/" + role;
  const bytes = createHash("sha1").update(namespace).update(name, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.toString("hex");
  return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);
}
export function economicFromPosting(p) {
  return Object.fromEntries(FIELDS.map(k => [k, k === "action" ? p.event_class : p[k]]));
}
function metadata(input) {
  if (input.description != null && typeof input.description !== "string") fail("INVALID_METADATA");
  if (input.reference_metadata != null) {
    keys(input.reference_metadata, ["reference", "evidence_ids"]);
    const { reference, evidence_ids } = input.reference_metadata;
    if (reference != null && typeof reference !== "string") fail("INVALID_METADATA");
    if (evidence_ids != null) {
      if (!Array.isArray(evidence_ids)) fail("INVALID_METADATA");
      evidence_ids.forEach(uuid);
    }
  }
}
function resolvedDelta(input, target, replay = false) {
  keys(input, [...FIELDS, "description", "reference_metadata"]);
  metadata(input);
  const e = { ...target.economic };
  for (const k of FIELDS) if (Object.hasOwn(input, k)) e[k] = input[k];
  if (!replay && e.action !== target.economic.action) fail("ACTION_CHANGE_PROHIBITED");
  if (typeof e.currency !== "string" || !/^[a-z]{3}$/i.test(e.currency)) fail("UNSUPPORTED_CURRENCY");
  e.currency = e.currency.toUpperCase();
  if (!replay && e.currency !== target.currency) fail("CROSS_CURRENCY_REPLACEMENT");
  e.amount = normalizeAmount(e.amount, e.currency);
  e.occurred_at = normalizeTimestamp(e.occurred_at);
  for (const k of ["account_id", "destination_account_id", "fund_id", "category_id", "member_id", "project_id"]) {
    e[k] = e[k] === null ? null : uuid(e[k]);
  }
  if (!e.account_id) fail("ACCOUNT_REQUIRED");
  if (!e.fund_id) fail("FUND_REQUIRED"); // explicit null never invokes today's default
  return e;
}
export function assertGraph(events) {
  const map = new Map(events.map(e => [e.id, e]));
  if (map.size !== events.length) fail("LINEAGE_INTEGRITY");
  const replacements = new Set(), reversed = new Set();
  for (const e of events) {
    if (e.reversal_of_event_id) {
      const parent = map.get(e.reversal_of_event_id);
      if (!parent || parent.group_id !== e.group_id || parent.reversal_of_event_id ||
          reversed.has(parent.id) || parent.id === e.id || !["corrected","reversed"].includes(parent.status) ||
          e.status !== "posted" || e.replacement_event_id) fail("LINEAGE_INTEGRITY");
      reversed.add(parent.id);
    }
    if (e.replacement_event_id) {
      const next = map.get(e.replacement_event_id);
      if (e.status !== "corrected" || !next || next.group_id !== e.group_id ||
          next.reversal_of_event_id || replacements.has(next.id)) fail("LINEAGE_INTEGRITY");
      replacements.add(next.id);
    }
    if (e.status === "corrected" && !e.replacement_event_id) fail("LINEAGE_INTEGRITY");
    if (e.status === "reversed" && e.replacement_event_id) fail("LINEAGE_INTEGRITY");
    const seen = new Set([e.id]);
    let next = e.replacement_event_id;
    while (next) {
      if (seen.has(next)) fail("LINEAGE_INTEGRITY");
      seen.add(next); next = map.get(next)?.replacement_event_id;
    }
  }
  for (const e of events) if (["corrected","reversed"].includes(e.status) && !reversed.has(e.id)) fail("LINEAGE_INTEGRITY");
}
function eligible(target, context) {
  if (target.reversal_of_event_id || target.effect_kind === "correction_reversal") fail("REVERSAL_TARGET_PROHIBITED");
  if (!["money_in","money_out","transfer"].includes(target.event_class)) fail("TARGET_NOT_MANUAL");
  const original = context.manual_occurrences.find(b => b.event_id === target.id);
  const replacement = context.completed.find(b => b.result.replacement?.id === target.id);
  if (target.source_module === "manual_finance") {
    if (!original || original.payload.contract_version !== "f3-posting-v1" ||
        original.payload.source_module !== "manual_finance" ||
        original.payload.source_record_id !== original.payload.request_id ||
        original.payload.effect_kind !== {money_in:"manual_income",money_out:"manual_expense",transfer:"account_transfer"}[target.event_class] ||
        original.fingerprint !== postingFingerprint(original.payload) ||
        original.fingerprint !== target.economic_payload_fingerprint ||
        !equal(economicFromPosting(original.payload), target.economic) ||
        original.payload.source_record_id !== target.source_record_id ||
        original.payload.request_id !== target.request_id ||
        original.payload.group_id !== target.group_id ||
        original.payload.ledger_epoch_id !== target.ledger_epoch_id ||
        original.payload.currency !== target.currency || original.payload.occurred_at !== target.occurred_at ||
        original.payload.event_class !== target.event_class ||
        original.payload.effect_kind !== target.effect_kind) fail("TARGET_NOT_MANUAL");
  } else if (target.source_module === "manual_finance_correction" && target.effect_kind === "correction_replacement") {
    if (!replacement || fingerprint(target.economic_payload) !== target.economic_payload_fingerprint ||
        replacement.result.replacement.economic_payload_fingerprint !== target.economic_payload_fingerprint ||
        !equal(replacement.result.replacement.economic, target.economic) ||
        Object.entries(replacement.result.replacement.economic_payload.event).some(([k,v]) => target[k] !== v)) fail("TARGET_NOT_MANUAL");
  } else fail("TARGET_NOT_MANUAL");
  if (target.status !== "posted") fail("TARGET_ALREADY_CORRECTED");
}
function replacementTemplate(e, target, context, request, replay = false) {
  const input = { ...e, group_id: target.group_id, request_id: childId(target.group_id, request, "replacement"),
    description: "Correction replacement" };
  if (replay) {
    // Frozen F3-02 replay validation checks shapes without current target/default resolution.
    const payload = { contract_version: "f3-posting-v1", group_id: target.group_id,
      ledger_epoch_id: target.ledger_epoch_id, event_class: e.action,
      effect_kind: {money_in:"manual_income", money_out:"manual_expense", transfer:"account_transfer"}[e.action],
      currency: e.currency, amount: e.amount, occurred_at: e.occurred_at,
      source_module: "manual_finance", source_record_id: input.request_id, request_id: input.request_id,
      account_id:e.account_id, destination_account_id:e.destination_account_id, fund_id:e.fund_id,
      category_id:e.category_id, member_id:e.member_id, project_id:e.project_id, opening_provenance_id:null };
    evaluateCommand(input, {authorized:true,channel:"manual",existing:[{event_id:input.request_id,payload,fingerprint:postingFingerprint(payload)}]});
    return;
  }
  const epochs = context.epochs.filter(ep => ep.group_id === target.group_id &&
    e.occurred_at >= normalizeTimestamp(ep.effective_from) &&
    (!ep.effective_to || e.occurred_at < normalizeTimestamp(ep.effective_to)));
  if (epochs.length !== 1) fail(epochs.length ? "EPOCH_AMBIGUOUS" : "EPOCH_NOT_FOUND");
  if (epochs[0].id !== target.ledger_epoch_id) fail("CROSS_EPOCH_REPLACEMENT");
  const scoped = structuredClone(context);
  // Exception is slot-specific retained ID only. No missing-row or scope/currency exception.
  for (const [table, fields] of [["accounts",["account_id","destination_account_id"]],
    ["funds",["fund_id"]],["categories",["category_id"]]]) {
    for (const field of fields) if (e[field] !== null && e[field] === target.economic[field]) {
      const row = scoped[table].find(r => r.id === e[field]);
      if (row) row.status = "active";
    }
  }
  const source = context.accounts.find(a => a.id === e.account_id);
  const destination = context.accounts.find(a => a.id === e.destination_account_id);
  if ([source,destination].some(a => a && a.group_id === target.group_id && a.currency !== target.currency)) fail("CROSS_CURRENCY_REPLACEMENT");
  return evaluateCommand(input, {...scoped,authorized:true,channel:"manual",existing:[]});
}
function child(target, command, role, postings, economic, context) {
  const id = childId(command.group_id, command.correction_request_id, role);
  const e = { id, group_id:target.group_id, ledger_epoch_id:target.ledger_epoch_id,
    currency:target.currency, occurred_at:role === "reversal" ? target.occurred_at : economic.occurred_at,
    event_class:role === "reversal" ? "opening_adjustment" : economic.action,
    source_module:"manual_finance_correction",
    source_record_id:command.correction_request_id + "/" + role,
    effect_kind:"correction_" + role, request_id:null,
    reversal_of_event_id:role === "reversal" ? target.id : null };
  const rows = postings.map((p,i) => ({
    ...Object.fromEntries(DIMENSIONS.map(k => [k,p[k]])), amount_signed:p.amount_signed, event_id:id,
    id:childId(command.group_id,command.correction_request_id,role+"/posting/"+(role === "reversal" ? p.id : String(i+1))) }));
  const payload = { contract_version:CHILD_VERSION, correction_request_id:command.correction_request_id,
    target_event_id:target.id, target_economic_fingerprint:target.economic_payload_fingerprint,
    role, event:e, economic, postings:rows };
  return { ...e, economic, postings:rows, economic_payload:payload,
    economic_payload_fingerprint:fingerprint(payload), status:"posted", replacement_event_id:null,
    corrected_at:null, correction_reason:null, created_by:uuid(context.actor_id),
    posted_at:normalizeTimestamp(context.corrected_at), created_at:normalizeTimestamp(context.corrected_at),
    description:role === "reversal" ? target.description : context.replacement_description,
    reference_metadata:structuredClone(role === "reversal" ? target.reference_metadata : context.replacement_metadata) };
}
export function evaluateCorrection(input, context) {
  if (context.authorized !== true || context.authorized_after_locks !== true || !context.actor_id) fail("DENY");
  uuid(context.actor_id);
  keys(input, ["group_id","correction_request_id","target_event_id","intent","correction_reason","replacement"]);
  const group = uuid(input.group_id), request = uuid(input.correction_request_id), targetId = uuid(input.target_event_id);
  if (!["CORRECT","REVERSE"].includes(input.intent)) fail("INVALID_INTENT");
  const reason = normalizeReason(input.correction_reason);
  if (input.intent === "REVERSE" && input.replacement != null) fail("REPLACEMENT_PROHIBITED");
  if (input.intent === "CORRECT" && !plain(input.replacement)) fail("REPLACEMENT_REQUIRED");
  const bindings = context.completed.filter(b => b.payload.group_id === group && b.payload.correction_request_id === request);
  if (bindings.length > 1) fail("REPLAY_INTEGRITY");
  const bound = bindings[0];
  if (bound && (bound.payload.target_event_id !== targetId || bound.payload.intent !== input.intent)) fail("CONFLICT");
  const target = bound ? bound.target_snapshot : context.events.find(e => e.id === targetId && e.group_id === group);
  if (!target) fail("TARGET_NOT_FOUND"); // cross-group indistinguishable from missing
  if (!bound) eligible(target, context);
  const economic = input.intent === "CORRECT" ? resolvedDelta(input.replacement, target, !!bound) : null;
  const payload = { contract_version:VERSION, group_id:group, correction_request_id:request,
    target_event_id:targetId, target_economic_fingerprint:target.economic_payload_fingerprint,
    intent:input.intent, correction_reason:reason, replacement:economic ?
      { ...economic, ledger_epoch_id:target.ledger_epoch_id } : null };
  if (bound) {
    if (bound.fingerprint !== fingerprint(bound.payload) || bound.target_snapshot.id !== targetId ||
        bound.target_snapshot.group_id !== group || bound.target_snapshot.economic_payload_fingerprint !== bound.payload.target_economic_fingerprint) fail("REPLAY_INTEGRITY");
    for (const role of ["reversal", "replacement"]) {
      const saved = bound.result[role];
      if (role === "replacement" && bound.payload.intent === "REVERSE") {
        if (saved !== null) fail("REPLAY_INTEGRITY");
      } else if (!saved || saved.id !== childId(group,request,role) ||
          saved.economic_payload_fingerprint !== fingerprint(saved.economic_payload) ||
          !equal(saved.postings,saved.economic_payload.postings) ||
          Object.entries(saved.economic_payload.event).some(([k,v]) => saved[k] !== v)) fail("REPLAY_INTEGRITY");
    }
    if (!equal(payload,bound.payload)) fail("CONFLICT");
    if (economic) replacementTemplate(economic,target,context,request,true);
    return { decision:"IDEMPOTENT_RETURN_EXISTING", result:structuredClone(bound.result),
      fingerprint:bound.fingerprint, new_event_count:0, new_posting_count:0 };
  }
  assertGraph(context.events);
  if (context.manual_occurrences.some(b => b.payload.group_id === group && b.payload.request_id === request)) fail("REQUEST_ID_REUSED");
  const template = economic ? replacementTemplate(economic,target,context,request) : null;
  const description = input.replacement && Object.hasOwn(input.replacement,"description") ?
    input.replacement.description : target.description;
  if (economic?.action === "money_out" && (typeof description !== "string" || !description.trim())) fail("DESCRIPTION_REQUIRED");
  const meta = input.replacement && Object.hasOwn(input.replacement,"reference_metadata") ?
    input.replacement.reference_metadata ?? {} : target.reference_metadata;
  const auditContext = {...context,replacement_description:description,replacement_metadata:meta};
  // Preserve every historical dimension and row multiplicity; no catalog resolution.
  const reversed = [...target.postings].sort((a,b) => a.id < b.id ? -1 : 1).map(p => ({
    ...p, amount_signed:decimal(-minorUnits(p.amount_signed,p.currency),p.currency) }));
  const command = {group_id:group,correction_request_id:request};
  const reversal = child(target,command,"reversal",reversed,null,auditContext);
  const replacement = template ? child(target,command,"replacement",template.postings,economic,auditContext) : null;
  const ids = [reversal.id, ...(replacement ? [replacement.id] : [])];
  const postingIds = [reversal,...(replacement ? [replacement] : [])].flatMap(e => e.postings.map(p => p.id));
  if (ids.some(id => context.events.some(e => e.id === id)) ||
      postingIds.some(id => context.events.some(e => e.postings.some(p => p.id === id)))) fail("CHILD_ID_COLLISION");
  const audit = {group_id:group,correction_request_id:request,correction_actor:uuid(context.actor_id),
    correction_reason:reason,corrected_at:normalizeTimestamp(context.corrected_at),
    target_event_id:targetId,reversal_event_id:reversal.id,replacement_event_id:replacement?.id ?? null};
  const target_update = {status:replacement ? "corrected" : "reversed",
    replacement_event_id:replacement?.id ?? null,corrected_at:audit.corrected_at,correction_reason:reason};
  const result = {target_event_id:targetId,target_update,reversal,replacement,audit};
  return {decision:"READY",payload,fingerprint:fingerprint(payload),canonical_bytes:canonicalBytes(payload),
    result,target_snapshot:structuredClone(target),new_event_count:replacement ? 2 : 1,
    new_posting_count:reversed.length+(replacement?.postings.length ?? 0)};
}
