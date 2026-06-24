import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  confirmedPaidByMember,
  allocateConfirmedToObligations,
  computeObligation,
  computeObligationStates,
} from "../src/lib/money.ts";

// ───────────────────────────────────────────────────────────────────────────
// Build 13 — Payment-Action Amount Accuracy. The PayNowDialog amountDue becomes
// the RECORDED payments.amount, so it must equal the confirmed-only remaining
// (the same basis the unpaid list / matrix / per-object report use), never the
// polluted amount_paid column. Executable amount-math + static wiring guards.
// ───────────────────────────────────────────────────────────────────────────

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const DIALOG = "src/components/payments/pay-now-dialog.tsx";
const MY_PAY = "src/app/[locale]/(dashboard)/dashboard/my-payments/page.tsx";
const TRANSFERS = "src/app/[locale]/(dashboard)/dashboard/enterprise/transfers/page.tsx";
const FINANCES = "src/app/[locale]/(dashboard)/dashboard/finances/page.tsx";
const RECORD = "src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx";

const TODAY = "2026-06-15";

// The exact basis the PayNowDialog records (caller computes this):
// computeObligation(o, allocateConfirmedToObligations(obls, confirmedPaidByMember(pays)), today).remaining
function payNowAmount(obligation, allObligations, payments) {
  const allocated = allocateConfirmedToObligations(allObligations, confirmedPaidByMember(payments));
  return computeObligation(obligation, allocated, TODAY).remaining;
}

// ── Pay-now amount math (executable, via the money engine) ──────────────────

test("pay-now amount: a CONFIRMED payment reduces the amount due", () => {
  const o = { id: "o1", amount: 1000, status: "pending", due_date: "2026-01-01", membership_id: "m1", contribution_type_id: "t1" };
  const pays = [{ id: "p1", amount: 400, status: "confirmed", membership_id: "m1", contribution_type_id: "t1" }];
  assert.equal(payNowAmount(o, [o], pays), 600);
});

test("pay-now amount: a PENDING payment does NOT reduce the amount due", () => {
  const o = { id: "o1", amount: 1000, status: "partial", due_date: "2026-01-01", membership_id: "m1", contribution_type_id: "t1" };
  const pays = [{ id: "p1", amount: 400, status: "pending_confirmation", membership_id: "m1", contribution_type_id: "t1" }];
  assert.equal(payNowAmount(o, [o], pays), 1000);
});

test("pay-now amount: a REJECTED payment does NOT reduce the amount due", () => {
  const o = { id: "o1", amount: 1000, status: "paid", due_date: "2026-01-01", membership_id: "m1", contribution_type_id: "t1" };
  const pays = [{ id: "p1", amount: 1000, status: "rejected", membership_id: "m1", contribution_type_id: "t1" }];
  assert.equal(payNowAmount(o, [o], pays), 1000);
});

test("pay-now amount: a fully-confirmed obligation is 0 (nothing to pay)", () => {
  const o = { id: "o1", amount: 1000, status: "pending", due_date: "2026-01-01", membership_id: "m1", contribution_type_id: "t1" };
  const pays = [{ id: "p1", amount: 1000, status: "confirmed", membership_id: "m1", contribution_type_id: "t1" }];
  assert.equal(payNowAmount(o, [o], pays), 0);
});

test("pay-now amount: a WAIVED obligation is not payable (isOpen=false)", () => {
  const o = { id: "o1", amount: 1000, status: "waived", due_date: "2026-01-01", membership_id: "m1", contribution_type_id: "t1" };
  const s = computeObligationStates([o], [], { today: TODAY });
  assert.equal(s.get("o1").isOpen, false, "waived is not open -> caller never opens pay-now for it");
});

test("pay-now amount reconciles with the unpaid-list/matrix basis (computeObligationStates)", () => {
  const obls = [
    { id: "o1", amount: 1000, status: "pending", due_date: "2026-01-01", membership_id: "m1", contribution_type_id: "t1" },
    { id: "o2", amount: 1000, status: "pending", due_date: "2026-06-01", membership_id: "m1", contribution_type_id: "t1" },
  ];
  const pays = [{ id: "p1", amount: 1500, status: "confirmed", membership_id: "m1", contribution_type_id: "t1" }];
  // oldest-due first: o1 fully covered, o2 has 500 remaining
  assert.equal(payNowAmount(obls[0], obls, pays), 0);
  assert.equal(payNowAmount(obls[1], obls, pays), 500);
  // ...and that matches the engine map the unpaid list / matrix use
  const s = computeObligationStates(obls, pays, { today: TODAY });
  assert.equal(s.get("o1").remaining, 0);
  assert.equal(s.get("o2").remaining, 500);
});

// ── PayNowDialog wiring: confirmed amountDue prop, by construction ───────────

test("PayNowDialog takes a confirmed amountDue prop and never reads amount_paid", () => {
  const d = read(DIALOG);
  assert.ok(/amountDue: number;/.test(d), "Obligation prop carries amountDue (not amount_paid)");
  assert.ok(!/amount_paid: number;/.test(d), "the amount_paid prop trap is gone");
  assert.ok(!/obligation\.amount - \(obligation\.amount_paid/.test(d), "no amount - amount_paid prefill remains");
  assert.ok(/const amountDue = Math\.max\(0, Math\.min\(obligation\.amountDue/.test(d), "amountDue is the clamped confirmed prop");
  assert.ok(/amount: amountDue,/.test(d), "the RECORDED payments.amount is the confirmed amountDue");
  assert.ok(/if \(!\(amountDue > 0\)\)/.test(d), "submit guard blocks a zero/negative (waived/paid) payment");
});

test("my-payments passes the confirmed computeObligation().remaining as amountDue", () => {
  const m = read(MY_PAY);
  assert.ok(/amountDue: computeObligation\(/.test(m), "caller passes computeObligation().remaining");
  assert.ok(/\.remaining,/.test(m), "the remaining (confirmed) basis is used");
  // The old polluted prop must be gone from the PayNowDialog call.
  const block = m.slice(m.indexOf("<PayNowDialog"), m.indexOf("<PayNowDialog") + 700);
  assert.ok(!/amount_paid:/.test(block), "no amount_paid passed to PayNowDialog");
});

// ── Transfers pre-transfer warning on the confirmed basis ───────────────────

test("transfers: pre-transfer outstanding warning is confirmed-only (no amount-amount_paid sum)", () => {
  const t = read(TRANSFERS);
  assert.ok(/computeObligationStates\(/.test(t), "routes through the engine");
  assert.ok(!/Number\(o\.amount\) - Number\(o\.amount_paid/.test(t), "no polluted amount - amount_paid sum remains");
  assert.ok(/c && c\.isOpen \? c\.remaining : 0/.test(t), "sums confirmed-open remaining");
});

// ── Record page prefill stays honest (contribution_type.amount, not amount_paid) ──

test("record page still prefills the contribution type's nominal amount (no polluted prefill)", () => {
  const r = read(RECORD);
  assert.ok(/setAmount\(String\(selectedType\.amount\)\)/.test(r), "single-record prefill = contribution_type.amount");
  assert.ok(!/setAmount\([^)]*amount_paid/.test(r), "record prefill never reads amount_paid");
});

// ── Finances sync: dropped the unused polluted amount_paid read ─────────────

test("finances sync no longer reads amount_paid (newStatus derives from confirmed totalPaid)", () => {
  const f = read(FINANCES);
  assert.ok(!/\.select\("id, amount, amount_paid"\)/.test(f), "the obligation select dropped amount_paid");
  assert.ok(/\.select\("id, amount"\)/.test(f), "selects only id, amount");
  assert.ok(/update\(\{ amount_paid: totalPaid, status: newStatus \}\)/.test(f), "the confirmed-only writeback is unchanged");
});

// ── P0 bulk-receipt guard intact ─────────────────────────────────────────────

test("P0 bulk-record receipt guard remains intact", () => {
  const r = read(RECORD);
  assert.ok(/const \[bulkSendReceipts, setBulkSendReceipts\] = useState\(false\)/.test(r), "receipts opt-in default OFF");
  assert.ok(/disabled=\{bulkSubmitting \|\| \(bulkSendReceipts && !bulkReconfirm\)\}/.test(r), "reconfirm gate intact");
});

// ── Build-8 producer dormant ─────────────────────────────────────────────────

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
    for (const m of dormant) if (read(f).includes(m)) offenders.push(`${f} -> ${m}`);
  }
  assert.deepEqual(offenders, [], `producer must stay dormant:\n${offenders.join("\n")}`);
});

// ── No NEW send dispatch in the display/cleanup reroutes ─────────────────────

test("no NEW send dispatch added in transfers/finances reroutes", () => {
  for (const f of [TRANSFERS, FINANCES]) {
    const src = read(f);
    for (const ind of ["/api/whatsapp/send", "/api/sms/send", "/api/email/send", "produceAnnouncementDeliveries"]) {
      assert.ok(!src.includes(ind), `${f} introduces no send dispatch (${ind})`);
    }
  }
});

// ── No new migration ─────────────────────────────────────────────────────────

test("Build 13 ships NO new migration", () => {
  const migs = fs.readdirSync(path.join(root, "supabase/migrations"));
  // 00108 is Build 15's create-not-apply privacy migration; Build 13 added none.
  assert.ok(!migs.some((f) => /^0010[9]/.test(f) || /^001[1-9]\d/.test(f)), "no migration newer than 00108");
});
