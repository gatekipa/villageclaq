import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// ───────────────────────────────────────────────────────────────────────────
// Build 6 — Fortune-500 app-wide UX polish. Static guardrails that pin the
// systemic visual primitives shipped in this pass AND re-assert that the polish
// did NOT weaken the P0 bulk-record receipt guard or the Build-4 confirmed-only
// money basis. All read-only string assertions — they send nothing and mutate
// nothing.
// ───────────────────────────────────────────────────────────────────────────

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(root, rel));

const PAGE_CONTAINER = "src/components/ui/page-container.tsx";
const DASH_LAYOUT = "src/app/[locale]/(dashboard)/layout.tsx";
const ADMIN_LAYOUT = "src/app/[locale]/admin/layout.tsx";
const PAGE_SKELETON = "src/components/ui/page-skeleton.tsx";
const CONFIRM_DIALOG = "src/components/ui/confirm-dialog.tsx";
const MY_PAYMENTS = "src/app/[locale]/(dashboard)/dashboard/my-payments/page.tsx";
const RECORD_PAGE = "src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx";
const REPORT_PAGE = "src/app/[locale]/(dashboard)/dashboard/contributions/[typeId]/report/page.tsx";

// ── S1. PageContainer primitive: single source of dashboard content width ───

test("PageContainer primitive exists and caps + centers content", () => {
  assert.ok(exists(PAGE_CONTAINER), "page-container.tsx exists");
  const src = read(PAGE_CONTAINER);
  assert.ok(/export function PageContainer/.test(src), "exports PageContainer");
  assert.ok(/mx-auto w-full/.test(src), "centers + full-width base");
  assert.ok(/max-w-\[1600px\]/.test(src), "caps content width at 1600px");
  assert.ok(/fluid \? "max-w-none"/.test(src), "fluid opt-out for full-bleed");
});

test("PageContainer is adopted in BOTH the dashboard and admin layouts", () => {
  const dash = read(DASH_LAYOUT);
  const admin = read(ADMIN_LAYOUT);
  for (const [name, src] of [["dashboard", dash], ["admin", admin]]) {
    assert.ok(/from "@\/components\/ui\/page-container"/.test(src), `${name} imports PageContainer`);
    assert.ok(/<PageContainer>/.test(src), `${name} wraps content in <PageContainer>`);
  }
  // The dashboard <main> keeps its existing padding + horizontal-clip; the
  // container must live INSIDE it (no second scroll container introduced).
  assert.ok(/overflow-x-hidden p-4 lg:p-6/.test(dash), "dashboard main keeps p-4 lg:p-6 + overflow-x-hidden");
});

// ── S3. Empty/error states: responsive vertical padding ─────────────────────

test("EmptyState/ErrorState use responsive vertical padding (less waste on mobile)", () => {
  const src = read(PAGE_SKELETON);
  assert.ok(/py-10 text-center md:py-14 lg:py-16/.test(src), "responsive py-10/md:14/lg:16");
  assert.ok(!/justify-center py-16 text-center/.test(src), "no bare py-16 left");
});

// ── S6. Destructive confirmations look serious ──────────────────────────────

test("confirm-dialog shows an AlertTriangle for destructive confirms only", () => {
  const src = read(CONFIRM_DIALOG);
  assert.ok(/import \{ AlertTriangle \} from "lucide-react"/.test(src), "imports AlertTriangle");
  assert.ok(/options\?\.destructive &&[\s\S]*AlertTriangle/.test(src), "icon gated on destructive");
  assert.ok(/text-destructive/.test(src), "icon uses destructive color");
  // The destructive boolean's BEHAVIORAL effect (button variant) must be intact.
  assert.ok(/variant=\{options\?\.destructive \? "destructive" : "default"\}/.test(src), "destructive button variant preserved");
});

// ── Financial trust: my-payments obligation cards ───────────────────────────

test("my-payments renders the progress bar for every obligation, money via formatAmount", () => {
  const src = read(MY_PAYMENTS);
  // The bar must NOT be gated solely on isPartial anymore — only the textual
  // "X of Y paid" line is. Assert the bar's role=progressbar is not inside an
  // `{isPartial && (` immediately followed by the bar.
  assert.ok(/Progress bar always renders/.test(src), "documents always-render progress bar");
  assert.ok(/aria-valuenow=\{progressPct\}/.test(src), "progress bar present");
  // Waived section signals a positive (you-don't-owe) state.
  assert.ok(/bg-emerald-50\/50/.test(src) && /CheckCircle2/.test(src), "waived section uses emerald/positive styling");
  // Money still rendered via the canonical helper (Rule 6).
  assert.ok(/formatAmount\(confirmedPaid, currency\)/.test(src), "uses formatAmount for money");
});

// ── Confirmed-only money basis preserved (Build 4) ──────────────────────────

test("per-object report keeps the confirmed-vs-pending distinction (Build-4 basis)", () => {
  const src = read(REPORT_PAGE);
  assert.ok(/totalPending/.test(src), "still tracks pending separately");
  assert.ok(/report\.pendingNote/.test(src), "pending-money clarity note preserved");
});

// ── P0 bulk-record receipt guard: untouched by the UX pass ──────────────────

test("P0 bulk-record receipt guard is fully intact after the UX pass", () => {
  const src = read(RECORD_PAGE);
  assert.ok(/const \[bulkSendReceipts, setBulkSendReceipts\] = useState\(false\)/.test(src), "receipts opt-in default OFF");
  assert.ok(/if \(sendReceipts && paidPayments\.length > 0 && groupId\)/.test(src), "both notification blocks gated on sendReceipts");
  assert.ok(/disabled=\{bulkSubmitting \|\| \(bulkSendReceipts && !bulkReconfirm\)\}/.test(src), "second money-received reconfirm gates the save");
  assert.ok(/onClick=\{\(\) => handleBulkSave\(bulkSendReceipts\)\}/.test(src), "confirm dialog drives the save");
  assert.ok(!/onClick=\{handleBulkSave\}/.test(src), "no direct-save path");
});
