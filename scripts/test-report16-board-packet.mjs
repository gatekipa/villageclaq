import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Phase 0C — Report 16 (Board Packet) regression guards.
//
// Two production defects are pinned here:
//   1. `reports.healthScore` was missing from both message catalogs — the
//      Board Packet CSV/PDF metric list calls t("reports.healthScore").
//   2. fetchAiInsights (useCallback) + its auto-fetch useEffect were declared
//      AFTER the `if (isLoading) return <ListSkeleton/>` early return, so the
//      skeleton→content flip crashed with "Rendered more hooks than during
//      previous render" on Reports 16/17/20.
// Static checks only — no DB, no renderer.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const PAGE = "src/app/[locale]/(dashboard)/dashboard/reports/[reportId]/page.tsx";
const page = read(PAGE);
const en = JSON.parse(read("messages/en.json"));
const fr = JSON.parse(read("messages/fr.json"));

// ── i18n: reports.healthScore present + full parity ─────────────────────────

test("reports.healthScore exists in both locales", () => {
  assert.equal(typeof en.reports?.healthScore, "string", "en reports.healthScore");
  assert.equal(typeof fr.reports?.healthScore, "string", "fr reports.healthScore");
  assert.ok(en.reports.healthScore.length > 0 && fr.reports.healthScore.length > 0);
});

test("en/fr message catalogs have full key parity", () => {
  const keys = (o, p = "") =>
    Object.entries(o).flatMap(([k, v]) =>
      v && typeof v === "object" ? keys(v, p ? `${p}.${k}` : k) : [p ? `${p}.${k}` : k],
    );
  const ek = new Set(keys(en));
  const fk = new Set(keys(fr));
  const onlyEn = [...ek].filter((k) => !fk.has(k));
  const onlyFr = [...fk].filter((k) => !ek.has(k));
  assert.deepEqual(onlyEn, [], "keys missing from fr.json");
  assert.deepEqual(onlyFr, [], "keys missing from en.json");
});

test("every reports.* key referenced by the report page exists in both catalogs", () => {
  const referenced = [...page.matchAll(/t\("reports\.([A-Za-z0-9_.]+)"/g)].map((m) => m[1]);
  assert.ok(referenced.length > 50, "sanity: page references many report keys");
  const lookup = (obj, dotted) => dotted.split(".").reduce((o, k) => (o == null ? o : o[k]), obj.reports);
  for (const key of referenced) {
    assert.notEqual(lookup(en, key), undefined, `en missing reports.${key}`);
    assert.notEqual(lookup(fr, key), undefined, `fr missing reports.${key}`);
  }
});

// ── Hook-order safety: no hooks after the loading/error early returns ───────

test("no React hooks are declared after the isLoading early return", () => {
  const earlyReturnIdx = page.indexOf("if (isLoading) return");
  assert.ok(earlyReturnIdx > 0, "early return present");
  const after = page.slice(earlyReturnIdx);
  const hookRe = /\buse(State|Effect|Callback|Memo|Ref|Query|Translations|Locale|Params|Group|Members|Payments|Obligations|Events|AllEventAttendances|ReliefPlans|ReliefClaims|HostingRosters|MeetingMinutes|SavingsCycles|Elections|GroupDuesPayments)\s*\(/g;
  const offenders = [];
  for (const m of after.matchAll(hookRe)) {
    // Ignore occurrences inside line comments.
    const lineStart = after.lastIndexOf("\n", m.index) + 1;
    const line = after.slice(lineStart, after.indexOf("\n", m.index));
    if (!line.trimStart().startsWith("//") && !line.trimStart().startsWith("*")) offenders.push(line.trim());
  }
  assert.deepEqual(offenders, [], "hooks after the early return re-introduce the 'Rendered more hooks' crash");
});

test("fetchAiInsights keeps [] deps and reads figures through the ctx ref", () => {
  assert.match(page, /const fetchAiInsights = useCallback\(/, "fetchAiInsights is a useCallback");
  const start = page.indexOf("const fetchAiInsights = useCallback(");
  const block = page.slice(start, page.indexOf("}, []);", start) + "}, []);".length);
  assert.ok(block.endsWith("}, []);"), "fetchAiInsights has empty deps (ref pattern)");
  assert.match(block, /aiFetchCtxRef\.current/, "reads dynamic values through the ref");
  // The auto-fetch effect must gate on !isLoading so the ctx ref is populated.
  assert.match(page, /useEffect\(\(\) => \{\s*if \(!isLoading && !aiAutoFetched\.current/, "auto-fetch gated on load completion");
});

test("the ctx ref is assigned from the computed money figures each content render", () => {
  assert.match(page, /aiFetchCtxRef\.current = \{[\s\S]{0,400}?collectionRate,\s*\};/, "ctx ref assignment present");
});

// ── Board Packet still renders its metrics ──────────────────────────────────

test("Report 16/20 board packet metric list uses reports.healthScore", () => {
  assert.match(page, /csvKey: "HealthScore",\s*label: t\("reports\.healthScore"\)/);
  assert.match(page, /reports\.healthScoreValue/, "on-screen health score line intact");
  assert.match(page, /reportId === "16" \|\| reportId === "20"/, "board packet export branch intact");
});

// ── Neighbouring reports unaffected ─────────────────────────────────────────

test("Report 15 branch still present", () => {
  assert.match(page, /reportId === "15"/);
  assert.equal(typeof en.reports?.report15?.name, "string", "report15 name key");
  assert.equal(typeof fr.reports?.report15?.name, "string", "report15 name key (fr)");
});

test("Report 24 (federated relief) still queries relief_branch_summary", () => {
  assert.match(page, /\.from\("relief_branch_summary"\)/);
});
