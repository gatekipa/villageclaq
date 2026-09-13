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
