import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// ───────────────────────────────────────────────────────────────────────────
// Build 11 — Africa-First Speed + Low-Bandwidth Performance Pass. Static
// guardrails proving the perf wins shipped AND that the performance work did
// not weaken any locked invariant: multi-tenant cache isolation (group-scoped
// keys + switchGroup removeQueries), Build-4 confirmed-only money basis (money
// queries stay uncapped; the finances payments-sum feed stays at 5000), the P0
// bulk-receipt guard, and Build-8 producer dormancy. No sends introduced.
// ───────────────────────────────────────────────────────────────────────────

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const HOOKS = "src/lib/hooks/use-supabase-query.ts";
const GROUP_CTX = "src/lib/group-context.tsx";
const FINANCES = "src/app/[locale]/(dashboard)/dashboard/finances/page.tsx";
const MATRIX = "src/app/[locale]/(dashboard)/dashboard/contributions/matrix/page.tsx";
const RECORD = "src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx";
const MEMBERSHIP_CARD = "src/app/[locale]/(dashboard)/dashboard/membership-card/page.tsx";
const ADMIN_OVERVIEW = "src/app/[locale]/admin/overview/page.tsx";
const ADMIN_ANALYTICS = "src/app/[locale]/admin/analytics/page.tsx";

const hooks = read(HOOKS);

// Slice a single hook's body out of use-supabase-query.ts (from `function X` to
// the next top-level `export function`) so per-hook assertions don't bleed.
function hookBody(name) {
  const start = hooks.indexOf(`export function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const after = hooks.indexOf("\nexport function ", start + 1);
  return hooks.slice(start, after === -1 ? undefined : after);
}

// ── WS3: staleTime sweep (low-bandwidth tab-switch caching) ─────────────────

test("WS3: explicit staleTime sweep applied across the hook layer (tiered)", () => {
  const count = (hooks.match(/staleTime:/g) || []).length;
  assert.ok(count >= 25, `expected >=25 explicit staleTime entries, found ${count}`);
  // The tiers exist: 30s (notifications), 3/5/10/30 min (config/static).
  assert.ok(/staleTime: 30 \* 1000/.test(hooks), "30s tier (notifications) present");
  assert.ok(/staleTime: 5 \* 60 \* 1000/.test(hooks), "5min tier present");
  assert.ok(/staleTime: 10 \* 60 \* 1000/.test(hooks), "10min tier present");
  assert.ok(/staleTime: 30 \* 60 \* 1000/.test(hooks), "30min tier (badges) present");
  // Notifications stay near-real-time (short stale), NOT a long config stale.
  assert.ok(/staleTime: 30 \* 1000/.test(hookBody("useNotifications")), "notifications staleTime is 30s");
  // Stable config gets a long stale.
  for (const h of ["useMembers", "useEvents", "useGroupSettings", "useGroupPositions"]) {
    assert.ok(/staleTime:/.test(hookBody(h)), `${h} has an explicit staleTime`);
  }
});

// ── staleTime contract: detail-page standing/role writes refresh the list ───

test("WS3 regression guard: member-detail standing/role/recalc invalidate the members list cache", () => {
  // The 5min staleTime on useMembers is only safe because every mutation that
  // changes a member's standing/role invalidates ["members", groupId]. The three
  // member-DETAIL admin actions (standing override, role change, recalculate)
  // must each invalidate it, or the list badge/role goes stale for the window.
  const src = read("src/app/[locale]/(dashboard)/dashboard/members/[id]/page.tsx");
  const count = (src.match(/invalidateQueries\(\{ queryKey: \["members", groupId\] \}\)/g) || []).length;
  assert.ok(count >= 3, `expected >=3 ["members", groupId] invalidations (override/role/recalc), found ${count}`);
});

// ── Multi-tenant cache isolation: group-scoped keys + reset on switch ────────

test("multi-tenant: group-scoped query keys + switchGroup still resets the cache", () => {
  // switchGroup must still clear ALL cached queries on a real group change.
  assert.ok(/queryClient\.removeQueries\(\)/.test(read(GROUP_CTX)), "switchGroup removeQueries() intact");
  // useMember is now group-scoped (B11 tightening) — foolproof isolation.
  assert.ok(/queryKey: \["member", membershipId, groupId\]/.test(hooks), "useMember key includes groupId");
  // Spot-check that core group-scoped hooks still carry groupId in the key.
  for (const [name, key] of [
    ["useMembers", '["members", groupId]'],
    ["useObligations", '["obligations", groupId,'],
    ["usePayments", '["payments", groupId, limit]'],
    ["useEvents", '["events", groupId]'],
  ]) {
    assert.ok(hookBody(name).includes(`queryKey: ${key}`), `${name} key is group-scoped`);
  }
});

// ── Build-4 money basis untouched by the perf pass ──────────────────────────

test("financial correctness: money-basis queries stay UNCAPPED after optimization", () => {
  // The obligation money basis must never be .limit()-capped (would under-count).
  assert.ok(!/\.limit\(/.test(hookBody("useObligations")), "useObligations has no .limit()");
  // dashboard-stats money fetch (obligations + payments) must stay uncapped.
  const stats = hookBody("useDashboardStats");
  assert.ok(!/\.limit\(/.test(stats), "useDashboardStats money fetch uncapped");
  assert.ok(/computeMoneyFigures\(/.test(stats), "dashboard-stats still uses confirmed-only money.ts");
  // The finances page sums the payments feed for its headline totals, so its
  // usePayments call MUST stay at 5000 (capping it would under-report collected).
  assert.ok(/usePayments\(5000\)/.test(read(FINANCES)), "finances usePayments stays at 5000 (no money under-report)");
});

// ── WS3: select-narrowing kept every consumed field ─────────────────────────

test("WS3: narrowed selects keep the columns their consumers render", () => {
  const notif = hookBody("useNotifications");
  for (const col of ["id", "type", "title", "body", "is_read", "created_at", "data"]) {
    assert.ok(new RegExp(`\\b${col}\\b`).test(notif.match(/\.select\("([^"]*)"\)/)?.[1] || ""), `notifications select keeps ${col}`);
  }
  const ann = hookBody("useAnnouncements").match(/\.select\("([^"]*)"\)/)?.[1] || "";
  for (const col of ["title", "content", "channels", "audience", "sent_at", "scheduled_at"]) {
    assert.ok(ann.includes(col), `announcements select keeps ${col}`);
  }
  const fam = hookBody("useFamilyMembers").match(/\.select\("([^"]*)"\)/)?.[1] || "";
  for (const col of ["name", "relationship", "date_of_birth", "notes"]) {
    assert.ok(fam.includes(col), `family-members select keeps ${col}`);
  }
});

// ── WS2: matrix dropped the unused privacy_settings column ───────────────────

test("WS2: dues matrix no longer over-fetches privacy_settings", () => {
  const matrix = read(MATRIX);
  // The memberships select in the matrix loader must not pull privacy_settings.
  const sel = matrix.match(/\.from\("memberships"\)[\s\S]*?\.select\("([^"]*)"\)/)?.[1] || "";
  assert.ok(sel.length > 0, "found matrix memberships select");
  assert.ok(!/privacy_settings/.test(sel), "matrix memberships select drops privacy_settings");
  // ...and the obligation select (money basis for the matrix) is untouched/uncapped.
  assert.ok(!/\.from\("contribution_obligations"\)[\s\S]*?\.limit\(/.test(matrix), "matrix obligations uncapped");
});

// ── WS4: heavy bundles lazy-loaded off the first-paint critical path ────────

test("WS4: recharts is lazy-loaded (next/dynamic), not statically imported, on chart routes", () => {
  for (const f of [FINANCES, ADMIN_OVERVIEW, ADMIN_ANALYTICS]) {
    const src = read(f);
    assert.ok(!/from "recharts"/.test(src), `${f} no longer statically imports recharts`);
    assert.ok(/dynamic\(\(\) => import\("@\/components\/charts\//.test(src), `${f} lazy-loads its chart via next/dynamic`);
  }
  // The extracted chart components DO own the recharts import.
  for (const c of ["monthly-trend-chart", "growth-line-chart", "feature-bar-chart"]) {
    assert.ok(/from "recharts"/.test(read(`src/components/charts/${c}.tsx`)), `${c} imports recharts`);
  }
});

test("WS4: html2canvas is dynamically imported inside the membership-card handlers", () => {
  const src = read(MEMBERSHIP_CARD);
  assert.ok(!/^import html2canvas/m.test(src), "no static top-level html2canvas import");
  assert.ok(/await import\("html2canvas"\)/.test(src), "html2canvas loaded lazily on click");
});

// ── WS4/WS5: record-page autocomplete memoization ───────────────────────────

test("WS4/WS5: record-page member list + filter are memoized", () => {
  const src = read(RECORD);
  assert.ok(/const memberList = useMemo\(/.test(src), "memberList memoized");
  assert.ok(/const filteredMembers = useMemo\(/.test(src), "filteredMembers memoized");
});

// ── P0 bulk-receipt guard intact (perf pass must not regress it) ────────────

test("P0 bulk-record receipt guard remains intact", () => {
  const r = read("src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx");
  assert.ok(/const \[bulkSendReceipts, setBulkSendReceipts\] = useState\(false\)/.test(r), "receipts opt-in default OFF");
  assert.ok(/disabled=\{bulkSubmitting \|\| \(bulkSendReceipts && !bulkReconfirm\)\}/.test(r), "reconfirm gate intact");
});

// ── Build-8 announcement producer remains dormant ──────────────────────────

test("Build-8 announcement producer remains dormant (no live import in src)", () => {
  function walk(dir) {
    const out = [];
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) out.push(...walk(rel));
      else if (/\.tsx?$/.test(e.name)) out.push(rel);
    }
    return out;
  }
  const dormant = ["@/lib/announcement-producer", "@/lib/announcement-delivery-rollup", "@/lib/announcement-delivery-status-mapping"];
  const allowed = new Set(["src/lib/announcement-producer.ts", "src/lib/announcement-delivery-rollup.ts"]);
  const offenders = [];
  for (const f of walk("src")) {
    if (allowed.has(f)) continue;
    const src = read(f);
    for (const m of dormant) if (src.includes(m)) offenders.push(`${f} -> ${m}`);
  }
  assert.deepEqual(offenders, [], `producer must stay dormant:\n${offenders.join("\n")}`);
});

// ── No sends / receipts / reminders introduced by the perf pass ─────────────

test("no send/receipt/reminder dispatch introduced in B11-touched perf files", () => {
  // The purely-presentational perf surfaces must contain NO send dispatch at all.
  const presentational = [FINANCES, MATRIX, MEMBERSHIP_CARD, ADMIN_OVERVIEW, ADMIN_ANALYTICS,
    "src/components/charts/monthly-trend-chart.tsx",
    "src/components/charts/growth-line-chart.tsx",
    "src/components/charts/feature-bar-chart.tsx"];
  const sendIndicators = [
    "/api/whatsapp/send", "/api/sms/send", "/api/email/send",
    "produceAnnouncementDeliveries", "sendWhatsApp(", "sendSms(", "sendEmail(",
  ];
  for (const f of presentational) {
    const src = read(f);
    for (const ind of sendIndicators) {
      assert.ok(!src.includes(ind), `${f} introduces no send indicator (${ind})`);
    }
  }
  // The query-hook layer documents dispatch endpoints in pre-existing privacy
  // comments (phones resolved server-side), so we don't scan it for endpoint
  // strings — but it must NOT gain a real producer/dispatch wiring.
  assert.ok(!hooks.includes("produceAnnouncementDeliveries"), "hooks layer wires no announcement producer");
  assert.ok(!/await fetch\("\/api\/(whatsapp|sms|email)\/send/.test(hooks), "hooks layer makes no send fetch call");
});

// ── No migration shipped in this build ──────────────────────────────────────

test("Build 11 ships NO new migration", () => {
  const migs = fs.readdirSync(path.join(root, "supabase/migrations"));
  // 00105/00106/00107 are prior create-not-apply migrations; B11 adds none.
  // 00108 + 00109 are Build 15's privacy migrations (applied); Build 11 added none.
  assert.ok(!migs.some((f) => /^\d{5}_/.test(f) && Number(f.slice(0, 5)) > 110), "no migration newer than 00110");
});
