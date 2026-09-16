/**
 * Parse `supabase db query` table/text stdout into JSON.
 *
 * CLI 2.117.0 default output is a box-drawn table wrapping a jsonb/text
 * cell. A naive JSON.parse from the first `{` fails on trailing │ / (1 row)
 * chrome and leaves inventory as a string → leftoverOk false → HOLD.
 *
 * Not a hosted runner. Does not invent SQL or apply migrations.
 *
 * Poison / identity probes MUST NOT use the permissive helpers below
 * (`parseJsonish`, `inventoryFromQuery`, `unwrapInventory`,
 * `coerceJsonValue`). Those exist only for inventory / fingerprint
 * chrome. Poison verification uses the strict original-process-result
 * contract at the bottom of this file.
 */

import { createHash } from "node:crypto";

const BOX_DRAWING = /[\u2500-\u257F]/g;

export function stripQueryTableChrome(text) {
  return String(text ?? "")
    .replace(BOX_DRAWING, " ")
    .replace(/^\s*[+|]\s?/gm, "")
    .replace(/\s*[+|]\s*$/gm, "")
    .replace(/^[-+=]{3,}$/gm, "")
    .replace(/^\s*\(\d+\s+rows?\)\s*$/gim, "");
}

function extractBalancedJson(text) {
  const start = String(text).search(/[\[{]/);
  if (start < 0) return null;
  const stack = [];
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") {
      const last = stack[stack.length - 1];
      if ((ch === "}" && last === "{") || (ch === "]" && last === "[")) {
        stack.pop();
        if (stack.length === 0) return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

function tryParseJson(text) {
  if (text == null) return { ok: false, value: null };
  const raw = String(text).trim();
  if (!raw) return { ok: false, value: null };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    const extracted = extractBalancedJson(raw);
    if (!extracted) return { ok: false, value: raw };
    try {
      return { ok: true, value: JSON.parse(extracted) };
    } catch {
      return { ok: false, value: raw };
    }
  }
}

/**
 * CLI `--output-format json` still leaves `rows[0].jsonb_build_object` as a
 * JSON string (double-encoded). Peel `{...}` / `[...]` strings up to 3 times.
 */
export function coerceJsonValue(value) {
  let current = value;
  for (let i = 0; i < 3; i += 1) {
    if (typeof current !== "string") return current;
    const trimmed = current.trim();
    if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return current;
    try {
      current = JSON.parse(trimmed);
    } catch {
      return current;
    }
  }
  return current;
}

/**
 * Parse jsonb / json / table-wrapped query stdout.
 * Returns an object/array when JSON is recoverable; otherwise the trimmed
 * string (fail-closed callers must not treat that as inventory).
 */
export function parseJsonish(text) {
  if (text == null) return null;
  if (typeof text === "object") return text;
  const stripped = stripQueryTableChrome(text).trim();
  if (!stripped) return "";
  let attempt = tryParseJson(stripped);
  if (!attempt.ok) {
    const start = stripped.search(/[\[{"]/);
    attempt = start >= 0 ? tryParseJson(stripped.slice(start)) : attempt;
  }
  let value = attempt.ok ? attempt.value : attempt.value;
  // Double-encoded JSON string cell: "{\"public_tables\":[]}"
  if (typeof value === "string") {
    const inner = tryParseJson(value);
    if (inner.ok) value = inner.value;
  }
  return value;
}

/**
 * CLI `--output-format json` envelope: `{ rows: [ { jsonb_build_object: <obj> } ] }`.
 */
export function unwrapCliRowsEnvelope(parsed) {
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray(parsed.rows)) {
    return parsed.rows;
  }
  return parsed;
}

function coerceJsonbBuildObject(value) {
  return coerceJsonValue(value);
}

export function unwrapInventory(parsed) {
  if (parsed == null) return {};
  const coercedTop = coerceJsonValue(parsed);
  if (typeof coercedTop === "string") {
    const again = parseJsonish(coercedTop);
    const peeled = coerceJsonValue(again);
    if (peeled && typeof peeled === "object") return unwrapInventory(peeled);
    return {};
  }
  const fromRows = unwrapCliRowsEnvelope(coercedTop);
  if (fromRows !== coercedTop) return unwrapInventory(fromRows);
  if (Array.isArray(coercedTop)) {
    if (!coercedTop.length) return {};
    const first = coercedTop[0];
    if (first && typeof first === "object") {
      if (first.jsonb_build_object != null) return unwrapInventory(coerceJsonbBuildObject(first.jsonb_build_object));
      if (first.json_build_object != null) return unwrapInventory(coerceJsonValue(first.json_build_object));
      if (first.json_agg != null) return unwrapInventory(coerceJsonValue(first.json_agg));
      if (first.coalesce != null) return unwrapInventory(coerceJsonValue(first.coalesce));
      if (first.public_tables !== undefined || first.schema_migrations_rows !== undefined) {
        return first;
      }
      if (first.hgp !== undefined || first.enqueue !== undefined) {
        return first;
      }
    }
    return {};
  }
  if (typeof coercedTop === "object") {
    if (coercedTop.jsonb_build_object != null) {
      return unwrapInventory(coerceJsonbBuildObject(coercedTop.jsonb_build_object));
    }
    if (coercedTop.json_build_object != null) {
      return unwrapInventory(coerceJsonValue(coercedTop.json_build_object));
    }
    return coercedTop;
  }
  return {};
}

/**
 * Unwrap supabase db query JSON (or mixed text) to the inner inventory /
 * gate-fingerprint object. Handles `{ rows: [ { jsonb_build_object } ] }`.
 * parseJsonish remains defense-in-depth for box-drawn table stdout.
 */
export function inventoryFromQuery(textOrValue) {
  const unwrapped = unwrapInventory(parseJsonish(textOrValue));
  const coerced = coerceJsonValue(unwrapped);
  if (coerced && typeof coerced === "object") return coerced;
  return unwrapInventory(coerced);
}

export function inventoryFromQueryStdout(textOrValue) {
  return inventoryFromQuery(textOrValue);
}

export function parseEvidenceOutArg(argv) {
  const list = Array.isArray(argv) ? argv : [];
  const eq = list.find((a) => String(a).startsWith("--evidence-out="));
  if (eq) return String(eq).slice("--evidence-out=".length);
  const idx = list.indexOf("--evidence-out");
  if (idx >= 0 && list[idx + 1] != null && !String(list[idx + 1]).startsWith("-")) {
    return list[idx + 1];
  }
  return null;
}

function asQueryRows(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  const parsed = parseJsonish(value);
  return Array.isArray(parsed) ? parsed : [];
}

export function rowsFromQuery(result) {
  const parsed = unwrapCliRowsEnvelope(parseJsonish(result?.stdout));
  if (Array.isArray(parsed)) {
    if (parsed.length && parsed[0] && typeof parsed[0] === "object" && parsed[0].json_agg) {
      return asQueryRows(parsed[0].json_agg);
    }
    if (parsed.length && parsed[0] && typeof parsed[0] === "object" && parsed[0].coalesce) {
      return asQueryRows(parsed[0].coalesce);
    }
    if (parsed.length && parsed[0] && typeof parsed[0] === "object" && parsed[0].jsonb_build_object) {
      return unwrapInventory(coerceJsonbBuildObject(parsed[0].jsonb_build_object));
    }
    return parsed;
  }
  if (parsed && typeof parsed === "object") {
    if (parsed.json_agg != null) return asQueryRows(coerceJsonValue(parsed.json_agg));
    if (parsed.coalesce != null) return asQueryRows(coerceJsonValue(parsed.coalesce));
    if (parsed.jsonb_build_object != null) return unwrapInventory(coerceJsonbBuildObject(parsed.jsonb_build_object));
    return parsed;
  }
  return [];
}

/**
 * Strict original child-process result + exact-one-JSON-object contract.
 * Used by poison / identity verification only. Never reconstructs a
 * replacement JSON envelope for a later validator.
 */

export const ORIGINAL_PROCESS_RESULT_HOLD =
  "HOLD: original process result failed closed; reconstructed or permissive parse forbidden";

const STDOUT_WARNING_OR_ERROR = /(?:^|[\s])(?:WARNING|NOTICE|ERROR|FATAL|PANIC):/im;

function stdoutToBuffer(stdout) {
  if (Buffer.isBuffer(stdout)) return stdout;
  if (typeof stdout === "string") return Buffer.from(stdout, "utf8");
  return null;
}

function stdoutToText(stdout) {
  if (Buffer.isBuffer(stdout)) return stdout.toString("utf8");
  if (typeof stdout === "string") return stdout;
  return null;
}

function buffersEqual(a, b) {
  if (a == null || b == null) return false;
  const left = stdoutToBuffer(a);
  const right = stdoutToBuffer(b);
  if (!left || !right) return false;
  return left.equals(right);
}

export function hashOriginalStdout(stdout) {
  const buf = stdoutToBuffer(stdout);
  if (!buf) {
    return { ok: false, sha256: null, byteLength: null };
  }
  return {
    ok: true,
    sha256: createHash("sha256").update(buf).digest("hex"),
    byteLength: buf.byteLength,
  };
}

/**
 * Record exact original stdout, SHA-256, and byte length BEFORE any
 * transformation. Never labels reconstructed content as raw.stdout.
 */
export function preserveOriginalProcessStdout(result) {
  if (result == null || typeof result !== "object" || Array.isArray(result)) {
    return { ok: false, reason: "process result missing", preserved: result };
  }
  if (result.reconstructed === true
    || result.assembledFromExtractedFields === true
    || result.stdoutIsReconstructed === true
    || result.__assembled === true) {
    return {
      ok: false,
      reason: "reconstructed rather than original output",
      parser_verdict: "reconstructed_not_original",
      preserved: result,
    };
  }
  const stdout = Object.prototype.hasOwnProperty.call(result, "originalStdout")
    ? result.originalStdout
    : result.stdout;
  if (!(typeof stdout === "string" || Buffer.isBuffer(stdout))) {
    return {
      ok: false,
      reason: "original stdout missing or not string/Buffer",
      parser_verdict: "stdout_missing",
      preserved: result,
    };
  }
  if (Object.prototype.hasOwnProperty.call(result, "originalStdout")
    && result.stdout != null
    && !buffersEqual(result.originalStdout, result.stdout)) {
    return {
      ok: false,
      reason: "stdout mutated after preservation; reconstructed content is not raw.stdout",
      parser_verdict: "reconstructed_not_original",
      preserved: result,
    };
  }
  const hashed = hashOriginalStdout(stdout);
  const preserved = {
    ...result,
    originalStdout: stdout,
    stdout,
    originalStdoutSha256: hashed.sha256,
    originalStdoutByteLength: hashed.byteLength,
    stdoutPreservedBeforeTransform: true,
    stdoutIsReconstructed: false,
  };
  return { ok: true, preserved, sha256: hashed.sha256, byteLength: hashed.byteLength };
}

function skipNestedWs(text, index) {
  let i = index;
  while (i < text.length && (text[i] === " " || text[i] === "\t" || text[i] === "\n" || text[i] === "\r")) {
    i += 1;
  }
  return i;
}

function scanJsonString(text, index) {
  if (text[index] !== "\"") return { ok: false, reason: "non-JSON" };
  let i = index + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      if (i + 1 >= text.length) return { ok: false, reason: "non-JSON" };
      i += 2;
      continue;
    }
    if (ch === "\"") return { ok: true, end: i + 1 };
    i += 1;
  }
  return { ok: false, reason: "non-JSON" };
}

function scanJsonNumber(text, index) {
  let i = index;
  if (text[i] === "-") i += 1;
  if (i >= text.length || (text[i] < "0" || text[i] > "9")) {
    return { ok: false, reason: "non-JSON" };
  }
  if (text[i] === "0") i += 1;
  else {
    while (i < text.length && text[i] >= "0" && text[i] <= "9") i += 1;
  }
  if (text[i] === ".") {
    i += 1;
    if (i >= text.length || text[i] < "0" || text[i] > "9") {
      return { ok: false, reason: "non-JSON" };
    }
    while (i < text.length && text[i] >= "0" && text[i] <= "9") i += 1;
  }
  if (text[i] === "e" || text[i] === "E") {
    i += 1;
    if (text[i] === "+" || text[i] === "-") i += 1;
    if (i >= text.length || text[i] < "0" || text[i] > "9") {
      return { ok: false, reason: "non-JSON" };
    }
    while (i < text.length && text[i] >= "0" && text[i] <= "9") i += 1;
  }
  return { ok: true, end: i, type: "number" };
}

function scanJsonLiteral(text, index, literal, type) {
  if (text.slice(index, index + literal.length) !== literal) {
    return { ok: false, reason: "non-JSON" };
  }
  return { ok: true, end: index + literal.length, type };
}

function scanJsonValue(text, index, { allowLeadingWs = true } = {}) {
  let i = allowLeadingWs ? skipNestedWs(text, index) : index;
  if (i >= text.length) return { ok: false, reason: "empty" };
  const ch = text[i];
  if (ch === "\"") {
    const scanned = scanJsonString(text, i);
    if (!scanned.ok) return scanned;
    return { ok: true, end: scanned.end, type: "string", duplicateKeys: false };
  }
  if (ch === "{") return scanJsonObject(text, i);
  if (ch === "[") return scanJsonArray(text, i);
  if (ch === "t") return scanJsonLiteral(text, i, "true", "boolean");
  if (ch === "f") return scanJsonLiteral(text, i, "false", "boolean");
  if (ch === "n") return scanJsonLiteral(text, i, "null", "null");
  if (ch === "-" || (ch >= "0" && ch <= "9")) return scanJsonNumber(text, i);
  return { ok: false, reason: "non-JSON" };
}

function scanJsonArray(text, index) {
  let i = index + 1;
  i = skipNestedWs(text, i);
  if (text[i] === "]") {
    return { ok: true, end: i + 1, type: "array", duplicateKeys: false };
  }
  let duplicateKeys = false;
  while (i < text.length) {
    const value = scanJsonValue(text, i, { allowLeadingWs: true });
    if (!value.ok) return value;
    duplicateKeys = duplicateKeys || value.duplicateKeys === true;
    i = skipNestedWs(text, value.end);
    if (text[i] === ",") {
      i += 1;
      continue;
    }
    if (text[i] === "]") {
      return { ok: true, end: i + 1, type: "array", duplicateKeys };
    }
    return { ok: false, reason: "non-JSON" };
  }
  return { ok: false, reason: "non-JSON" };
}

function scanJsonObject(text, index) {
  let i = index + 1;
  i = skipNestedWs(text, i);
  if (text[i] === "}") {
    return { ok: true, end: i + 1, type: "object", duplicateKeys: false, keys: [] };
  }
  const keys = [];
  let duplicateKeys = false;
  while (i < text.length) {
    i = skipNestedWs(text, i);
    const keyScan = scanJsonString(text, i);
    if (!keyScan.ok) return { ok: false, reason: "non-JSON" };
    let key;
    try {
      key = JSON.parse(text.slice(i, keyScan.end));
    } catch {
      return { ok: false, reason: "non-JSON" };
    }
    if (keys.includes(key)) duplicateKeys = true;
    keys.push(key);
    i = skipNestedWs(text, keyScan.end);
    if (text[i] !== ":") return { ok: false, reason: "non-JSON" };
    const value = scanJsonValue(text, i + 1, { allowLeadingWs: true });
    if (!value.ok) return value;
    duplicateKeys = duplicateKeys || value.duplicateKeys === true;
    i = skipNestedWs(text, value.end);
    if (text[i] === ",") {
      i += 1;
      continue;
    }
    if (text[i] === "}") {
      return { ok: true, end: i + 1, type: "object", duplicateKeys, keys };
    }
    return { ok: false, reason: "non-JSON" };
  }
  return { ok: false, reason: "non-JSON" };
}

/**
 * Bounded duplicate-key-safe parser. JSON.parse cannot guarantee
 * duplicate-key detection; this scanner does, then JSON.parse is used
 * only on the exact single-value slice.
 */
export function parseDuplicateKeySafeJson(text) {
  if (text == null) return { ok: false, reason: "empty", parser_verdict: "empty" };
  if (typeof text !== "string" && !Buffer.isBuffer(text)) {
    return { ok: false, reason: "stdout not string or Buffer", parser_verdict: "stdout_type" };
  }
  const raw = stdoutToText(text);
  if (raw == null) return { ok: false, reason: "stdout not string or Buffer", parser_verdict: "stdout_type" };
  if (raw.length === 0) return { ok: false, reason: "empty", parser_verdict: "empty" };
  if (STDOUT_WARNING_OR_ERROR.test(raw)) {
    return { ok: false, reason: "warnings or errors in stdout", parser_verdict: "stdout_warning" };
  }
  if (raw[0] === "[") {
    return { ok: false, reason: "arrays when object required", parser_verdict: "array_not_object" };
  }
  if (raw[0] !== "{") {
    return { ok: false, reason: "non-JSON or prefix", parser_verdict: "prefix_or_non_json" };
  }
  const scanned = scanJsonValue(raw, 0, { allowLeadingWs: false });
  if (!scanned.ok) {
    return { ok: false, reason: scanned.reason || "non-JSON", parser_verdict: scanned.reason || "non-JSON" };
  }
  if (scanned.duplicateKeys) {
    return { ok: false, reason: "duplicate keys", parser_verdict: "duplicate_keys" };
  }
  if (scanned.type !== "object") {
    return { ok: false, reason: "arrays when object required", parser_verdict: "array_not_object" };
  }
  const rest = raw.slice(scanned.end);
  if (rest.length > 0) {
    if (rest === "\n" || rest === "\r\n") {
      // single trailing newline from process capture is the only suffix allowed
    } else if (rest.trim() === "") {
      return { ok: false, reason: "trailing whitespace", parser_verdict: "trailing" };
    } else {
      return {
        ok: false,
        reason: "trailing suffix, multi-JSON, or multi-row",
        parser_verdict: "trailing_or_multi",
      };
    }
  }
  let value;
  try {
    value = JSON.parse(raw.slice(0, scanned.end));
  } catch {
    return { ok: false, reason: "non-JSON", parser_verdict: "non-JSON" };
  }
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "arrays when object required", parser_verdict: "array_not_object" };
  }
  return { ok: true, value, end: scanned.end, keys: scanned.keys || Object.keys(value) };
}

export function evaluateOriginalProcessResultContract(result) {
  const fail = (reason, parser_verdict = "rejected") => ({
    ok: false,
    reason,
    parser_verdict,
    hold: ORIGINAL_PROCESS_RESULT_HOLD,
  });
  if (result == null || typeof result !== "object" || Array.isArray(result)) {
    return fail("process result missing", "result_missing");
  }
  if (result.reconstructed === true
    || result.assembledFromExtractedFields === true
    || result.stdoutIsReconstructed === true
    || result.__assembled === true) {
    return fail("strict validator received reconstructed rather than original output", "reconstructed_not_original");
  }
  if (result.usedFallbackParser === true || result.permissiveParse === true) {
    return fail("fallback parser is forbidden", "fallback_parser");
  }
  if (result.signal || result.signalCode) {
    return fail(`signal: ${result.signal || result.signalCode}`, "signal");
  }
  if (result.timeout === true || result.timedOut === true || result.killed === true) {
    return fail("timeout", "timeout");
  }
  if (result.spawnError || result.executionError) {
    return fail("spawn/execution error", "spawn_error");
  }
  if (result.queryError) {
    return fail("query error", "query_error");
  }
  if (result.error && result.error !== true && result.error !== false) {
    return fail("spawn/execution error", "spawn_error");
  }
  if (!Object.prototype.hasOwnProperty.call(result, "status") || result.status !== 0) {
    return fail(`nonzero status ${result.status}`, "nonzero_status");
  }
  const stderr = result.stderr;
  if (stderr != null && String(stderr).trim() !== "") {
    return fail("unexpected stderr", "unexpected_stderr");
  }
  const stdout = Object.prototype.hasOwnProperty.call(result, "originalStdout")
    ? result.originalStdout
    : result.stdout;
  if (!(typeof stdout === "string" || Buffer.isBuffer(stdout))) {
    return fail("original stdout missing or not string/Buffer", "stdout_missing");
  }
  if (Object.prototype.hasOwnProperty.call(result, "originalStdout")
    && result.stdout != null
    && !buffersEqual(result.originalStdout, result.stdout)) {
    return fail(
      "stdout mutated after preservation; reconstructed content is not raw.stdout",
      "reconstructed_not_original",
    );
  }
  return { ok: true, stdout };
}

/**
 * Validate the actual child-process result + original stdout.
 * Records SHA-256 + byte length BEFORE parsing. Accepts exactly one
 * JSON object envelope. Does not extract fields and reconstruct.
 */
export function parseExactOriginalJsonObject(result) {
  const contract = evaluateOriginalProcessResultContract(result);
  if (!contract.ok) {
    return {
      ...contract,
      raw: null,
      parseResult: { ok: false, reason: contract.reason },
    };
  }
  const preserved = preserveOriginalProcessStdout({
    ...result,
    stdout: contract.stdout,
    originalStdout: contract.stdout,
  });
  if (!preserved.ok) {
    return {
      ok: false,
      reason: preserved.reason,
      parser_verdict: preserved.parser_verdict || "rejected",
      hold: ORIGINAL_PROCESS_RESULT_HOLD,
      raw: {
        stdout: contract.stdout,
        stdoutSha256: null,
        stdoutByteLength: null,
        stdoutPreservedBeforeTransform: false,
      },
      parseResult: { ok: false, reason: preserved.reason },
    };
  }
  const raw = {
    stdout: preserved.preserved.originalStdout,
    stdoutSha256: preserved.sha256,
    stdoutByteLength: preserved.byteLength,
    stdoutPreservedBeforeTransform: true,
    status: result.status,
    signal: result.signal ?? result.signalCode ?? null,
    timeout: result.timeout === true || result.timedOut === true,
    stderr: result.stderr ?? "",
  };
  const parsed = parseDuplicateKeySafeJson(preserved.preserved.originalStdout);
  if (!parsed.ok) {
    return {
      ok: false,
      reason: parsed.reason,
      parser_verdict: parsed.parser_verdict || parsed.reason,
      hold: ORIGINAL_PROCESS_RESULT_HOLD,
      raw,
      parseResult: parsed,
      value: null,
    };
  }
  return {
    ok: true,
    value: parsed.value,
    keys: parsed.keys,
    raw,
    parseResult: { ok: true, keys: parsed.keys },
    preserved: preserved.preserved,
  };
}
