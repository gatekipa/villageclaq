/**
 * Parse `supabase db query` table/text stdout into JSON.
 *
 * CLI 2.117.0 default output is a box-drawn table wrapping a jsonb/text
 * cell. A naive JSON.parse from the first `{` fails on trailing │ / (1 row)
 * chrome and leaves inventory as a string → leftoverOk false → HOLD.
 *
 * Not a hosted runner. Does not invent SQL or apply migrations.
 */

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

export function unwrapInventory(parsed) {
  if (parsed == null) return {};
  if (typeof parsed === "string") {
    const again = parseJsonish(parsed);
    if (again && typeof again === "object") return unwrapInventory(again);
    return {};
  }
  const fromRows = unwrapCliRowsEnvelope(parsed);
  if (fromRows !== parsed) return unwrapInventory(fromRows);
  if (Array.isArray(parsed)) {
    if (!parsed.length) return {};
    const first = parsed[0];
    if (first && typeof first === "object") {
      if (first.jsonb_build_object != null) return unwrapInventory(first.jsonb_build_object);
      if (first.json_build_object != null) return unwrapInventory(first.json_build_object);
      if (first.json_agg != null) return unwrapInventory(first.json_agg);
      if (first.coalesce != null) return unwrapInventory(first.coalesce);
      if (first.public_tables !== undefined || first.schema_migrations_rows !== undefined) {
        return first;
      }
      if (first.hgp !== undefined || first.enqueue !== undefined) {
        return first;
      }
    }
    return {};
  }
  if (typeof parsed === "object") {
    if (parsed.jsonb_build_object != null) return unwrapInventory(parsed.jsonb_build_object);
    if (parsed.json_build_object != null) return unwrapInventory(parsed.json_build_object);
    return parsed;
  }
  return {};
}

/**
 * Unwrap supabase db query JSON (or mixed text) to the inner inventory /
 * gate-fingerprint object. Handles `{ rows: [ { jsonb_build_object } ] }`.
 * parseJsonish remains defense-in-depth for box-drawn table stdout.
 */
export function inventoryFromQuery(textOrValue) {
  return unwrapInventory(parseJsonish(textOrValue));
}

export function inventoryFromQueryStdout(textOrValue) {
  return inventoryFromQuery(textOrValue);
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
      return unwrapInventory(parsed[0].jsonb_build_object);
    }
    return parsed;
  }
  if (parsed && typeof parsed === "object") {
    if (parsed.json_agg != null) return asQueryRows(parsed.json_agg);
    if (parsed.coalesce != null) return asQueryRows(parsed.coalesce);
    if (parsed.jsonb_build_object != null) return unwrapInventory(parsed.jsonb_build_object);
    return parsed;
  }
  return [];
}
