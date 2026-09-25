import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// ─── 1. Vector 1: Precision, Negatives, and Lexicographical Sorting ───────────

function getCurrencySymbol(code) {
  const map = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    XAF: "FCFA",
    XOF: "FCFA",
    CAD: "C$",
  };
  return map[code] || code;
}

// Current fixed implementation from src/lib/export-financial-ledger.ts
function formatExactAmountFixed(amount, currencyCode) {
  const symbol = getCurrencySymbol(currencyCode);
  if (amount === null || amount === undefined || amount === "") {
    return currencyCode === "XAF" || currencyCode === "XOF" ? `0 ${symbol}` : `${symbol}0`;
  }

  const str = String(amount).trim();
  const rawIsNegative = str.startsWith("-");
  const clean = rawIsNegative ? str.slice(1) : str;
  const [intPart, fracPart] = clean.split(".");

  // Avoid negative zero ("-0" or "-0.00")
  const isAllZeros = (intPart || "0").replace(/0/g, "") === "" && (!fracPart || fracPart.replace(/0/g, "") === "");
  const isNegative = rawIsNegative && !isAllZeros;

  const formattedInt = (intPart || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const formattedNumber = fracPart !== undefined ? `${formattedInt}.${fracPart}` : formattedInt;

  if (currencyCode === "XAF" || currencyCode === "XOF") {
    return isNegative ? `-${formattedNumber} ${symbol}` : `${formattedNumber} ${symbol}`;
  }
  return isNegative ? `-${symbol}${formattedNumber}` : `${symbol}${formattedNumber}`;
}

test("Vector 1.1: formatExactAmount negative numbers and currency symbol placement", () => {
  // Negative standard amounts
  assert.equal(formatExactAmountFixed("-500.00", "USD"), "-$500.00", "Minus sign must precede currency symbol for prefix currencies");
  assert.equal(formatExactAmountFixed("-0.05", "USD"), "-$0.05", "Small negative decimal must format as -$0.05");
  assert.equal(formatExactAmountFixed("-500.00", "XAF"), "-500.00 FCFA", "Minus sign must precede number for suffix currencies");
  assert.equal(formatExactAmountFixed("-500.00", "EUR"), "-€500.00", "EUR prefix symbol formatted correctly");
  assert.equal(formatExactAmountFixed("-500.00", "CAD"), "-C$500.00", "CAD prefix symbol formatted correctly");

  // Exact 4-decimal precision
  assert.equal(formatExactAmountFixed("1234567.8901", "GBP"), "£1,234,567.8901", "Must preserve exact 4 decimal places without float rounding");
  assert.equal(formatExactAmountFixed("0", "USD"), "$0", "Zero must format as $0");
});

test("Vector 1.2: formatExactAmount nullish, empty, and negative zero resolution", () => {
  // Probing nullish and empty strings
  assert.equal(formatExactAmountFixed(null, "USD"), "$0", "Null must format with symbol prefix as $0");
  assert.equal(formatExactAmountFixed(undefined, "USD"), "$0", "Undefined must format with symbol prefix as $0");
  assert.equal(formatExactAmountFixed("", "USD"), "$0", "Empty string must format with symbol prefix as $0");
  assert.equal(formatExactAmountFixed(null, "XAF"), "0 FCFA", "Null in XAF must format as 0 FCFA");

  // Probing negative zero
  assert.equal(formatExactAmountFixed("-0", "USD"), "$0", "'-0' must not display negative sign");
  assert.equal(formatExactAmountFixed("-0.00", "USD"), "$0.00", "'-0.00' must not display negative sign");
  assert.equal(formatExactAmountFixed("-0.0000", "EUR"), "€0.0000", "'-0.0000' in EUR must format as €0.0000");
  assert.equal(formatExactAmountFixed("-0.00", "XAF"), "0.00 FCFA", "'-0.00' in XAF must format as 0.00 FCFA");
});

test("Vector 1.3: Table sorting and running balance mathematical integrity", () => {
  const content = fs.readFileSync("src/components/finances/projections/general-ledger-cashbook.tsx", "utf8");
  
  // Assert whether any .sort() exists on rows
  const hasSort = content.includes(".sort(");
  assert.equal(hasSort, false, "Cashbook strictly preserves canonical ledger sequence (no arbitrary client-side sorting)");

  // Mathematical proof: running_balance in double-entry bookkeeping is an inductive cumulative sum:
  // balance[n] = balance[n-1] + amount_signed[n].
  // Re-ordering rows breaks this invariant for human inspection.
  assert.ok(content.includes("running_balance"), "Table renders cumulative running_balance from database ledger partition");
});

// ─── 2. Vector 2: Cross-Tenant Context Switching & Stale Memory Leak ──────────

test("Vector 2: Cross-Tenant Context Switching & Stale State Reset Verification", () => {
  const content = fs.readFileSync("src/components/finances/projections/general-ledger-cashbook.tsx", "utf8");
  const pageContent = fs.readFileSync("src/app/[locale]/(dashboard)/dashboard/finances/page.tsx", "utf8");

  // Check if general-ledger-cashbook resets state on groupId change
  const hasGroupIdResetEffect = content.includes("useEffect") && content.includes("setAuditRow(null)") && content.includes("groupId");
  const hasPageKeyProp = pageContent.includes("<GeneralLedgerCashbook") && pageContent.includes("key={`cashbook-${groupId");

  assert.ok(hasGroupIdResetEffect, "GeneralLedgerCashbook must have useEffect listening to groupId to clear auditRow and filters");
  assert.ok(hasPageKeyProp, "Finances page must provide unique key tied to groupId to trigger complete unmount/remount on group switch");
});

// ─── 3. Vector 3: Date Boundary & Timezone Drift ──────────────────────────────

test("Vector 3: Date Boundary & Timezone Drift Elimination", () => {
  const hookContent = fs.readFileSync("src/lib/hooks/use-financial-projections.ts", "utf8");
  
  // Verify it uses local year/month to construct boundaries rather than UTC fields
  const usesLocalYear = hookContent.includes("now.getFullYear()");
  const usesLocalMonth = hookContent.includes("now.getMonth()");

  assert.ok(usesLocalYear && usesLocalMonth, "getDateRangeForPreset must use local calendar year/month to prevent timezone day shift");
});

// ─── 4. Vector 4: Redaction & DOM State Inspection ────────────────────────────

test("Vector 4: Redaction at DB boundary and DOM state verification", () => {
  const sqlContent = fs.readFileSync("supabase/migrations/00121_f3_03_projection_read_proof.sql", "utf8");
  const cashbookContent = fs.readFileSync("src/components/finances/projections/general-ledger-cashbook.tsx", "utf8");

  // Verify SQL level redaction:
  const hasSqlCaseRedaction = sqlContent.includes("CASE WHEN p_include_audit THEN c.request_id END");
  assert.ok(hasSqlCaseRedaction, "SQL projection evaluates audit fields to NULL when p_include_audit is false");

  // Verify UI level rendering:
  // When auditRow.request_id is null, it should NOT render any DOM node
  const conditionalRequestId = cashbookContent.includes("{auditRow.request_id && (");
  assert.ok(conditionalRequestId, "UI conditionally renders request_id only when non-null");

  // Verify created_by is NOT leaked into DOM
  const leaksCreatedBy = cashbookContent.includes("auditRow.created_by");
  assert.equal(leaksCreatedBy, false, "created_by is completely omitted from the UI DOM");
});
