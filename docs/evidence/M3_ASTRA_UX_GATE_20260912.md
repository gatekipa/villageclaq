# M3 ASTRA UX GATE — 2026-09-12 (READ-ONLY)

**Status: ASTRA GATE NOW DUE**

| Marker | State |
|---|---|
| ACTIVE | Yes — this gate is the live UX constraint for M3 |
| S0 COMPLETE | Yes — Cuts 1–3 on current main `d83d13d4…` |
| ASTRA GATE NOW DUE | **Yes** — must constrain F3-06 / F3-07 / F3-08 before those tickets start |

This review is **read-only**. No UI was implemented. Sources: current main finance IA, `globals.css` / shadcn theme, F2 §6 / §10–12 / §18 at `a13b5e6c…`, Master PRD UX-002 / UX-005 / P-011 / P-012 / D-007.

---

## 1. Design system (current main)

- Tailwind CSS v4 + shadcn/ui.
- Light: slate field + **emerald** primary (`oklch` tokens in `src/app/globals.css`).
- Dark: deep slate + emerald accents; `.dark` variant required on every new control.
- Radius `--radius: 0.625rem`; sidebar tokens already exist.
- Mobile-first platform law: 375px first; sidebar collapses to hamburger (`src/components/layout/sidebar.tsx`).
- i18n: every string through `next-intl` `t()`; add EN **and** FR before ship.
- Money: `formatAmount()` only — XAF/XOF no decimals + `FCFA`.
- Names: `getMemberName()` (proxy-safe).
- Permissions: `PermissionGate` / `RequirePermission` + `usePermissions()`.
- Charts: Recharts already lazy-loaded on finances (do not put Recharts on F3-06 first paint).

**Constraint:** F3-06/07/08 must look like VillageClaq, not a new “accounting product.” Same cards, buttons, dialogs, emerald/slate, dark mode.

---

## 2. Finance information architecture / nav (current)

Admin `sectionMoney` today (`sidebar.tsx`):

| Key | Route | Mental model today |
|---|---|---|
| Contributions | `/dashboard/contributions` | Dues types + record + history + matrix + unpaid |
| Finances | `/dashboard/finances` | Dues/fines/loans **overview** from `money.ts` — **not** account balances |
| Loans | `/dashboard/loans` | Module ops (Pro badge) |

Nearby, **not** under Money:

- Savings circle (Njangi) — group features
- Relief — group features
- Fines — group features
- Reports — analytics (24-report hub)
- Settings — billing + notification prefs only (no Accounts/Funds/Categories)

Member: My Payments / My Loans / My Fines / My Relief.

**Problem for F3:** the word “Finances” already means “dues dashboard.” Shipping F3-08 Account Balance onto that same item without relabeling will teach the wrong truth.

**Recommendations (constrain F3-06/07/08):**

1. Keep **Contributions** as the dues subledger. Do not hide it.
2. Relabel or subtitle today’s Finances page as **Dues overview** / **Collections** (copy via `t()`), **or** add a distinct **Ledger** / **Accounts** nav item for F3.
3. Do **not** put F3-07 under Contributions Record. New route, e.g. `/dashboard/ledger/record` or `/dashboard/finances/record-transaction` — name decided at F3-07, not this run.
4. F3-06 settings: Accounts, Funds, Categories as a dedicated settings group (Money settings or Ledger settings). Not a deep chart-of-accounts tree.
5. Loans / Relief / Njangi / Fines stay module nav. F3-07 must not become a back door that posts those economics as generic Money In.

---

## 3. Accounts / Funds / Categories mental model

**On current main and production: ABSENT** as product objects (Chief live: `financial_accounts/funds/categories` NULL). Officers have contribution *types*, payment *methods* (`group_payment_config`), `project_contributions`, and report *categories* (UI taxonomy). None of these are F2 Accounts/Funds/Categories.

F2 freeze (must teach in F3-06 copy):

| Concept | Meaning | Not |
|---|---|---|
| **Account** | Custody — where money is held (bank/cash/MoMo/wallet/other). Single currency. Balance derived. | Not a category, fund, or contribution type |
| **Fund** | Purpose — general vs restricted. Independent of account. | Not a second cash pile; not a CoA |
| **Category** | Sparse classification for Money In/Out (donation, grant, venue, relief payout, …) | Not a contribution type; not an account |

**F3-06 UX rules:**

- Flat lists. Archive, don’t delete referenced rows.
- No balance field that officers can type over.
- Cannot change account currency in place (close + open new).
- Default General/unrestricted fund exists for every group.
- System category defaults cover the sparse taxonomy; orgs may add custom.
- Inactive/archived accounts are not selectable on new posts (test **N**).
- EN/FR names for system defaults; `formatAmount` only if any sample numbers shown (settings should show **no** live balances as editable).

---

## 4. Mobile

- Design F3-06 lists and F3-07 form at **375px** first; confirm 320–430px (PRD P-012).
- Single-column form; sticky primary action; no horizontal journal grid.
- Confirm-account+fund step must be visible without hover.
- Sidebar already hamburger — do not add a second finance hamburger.
- Offline: P-014 — money commands require online; never blind-queue a post.

---

## 5. EN / FR

- No hardcoded English in F3 UI.
- Add keys to `messages/en.json` **and** `messages/fr.json` before use.
- SoA must be labeled cash-basis in both languages (D-002).
- Do not invent “debit/crédit” officer copy (F2 §6.3 ban).

---

## 6. Record Transaction journey (today vs F3-07)

**Today** (`/dashboard/contributions/record`):

- Permission `finances.record` | `finances.manage`.
- Select member + contribution type + amount + method.
- Insert `payments` (often confirmed) and allocate to obligations; `creditRemaining` is unapplied dues credit.
- Optional receipt → private `receipts` bucket.
- Optional `POST /api/payments/receipt-notifications` (Cut 2 producer).
- Member Pay Now creates `pending_confirmation`.

This journey is **F4/dues**, not F3 Record Transaction.

**F3-07 (frozen F2 §6.3 + PRD):**

Always: Action (Money In / Out / Transfer) · amount+currency · effective date · custody account · category (In/Out) · description (expense).  
Conditional: destination account · fund · project · member/payer · receipt · reference.  
Defaults: current group · epoch bound to occurrence · account currency · today · General fund · last valid custody account.  
Confirm: account + fund visible.  
**Do not offer Opening-Adjustment** until D-007 closes.

**Hard ban:** do not point F3-07 at `useRecordPayment()` / `payments` insert. Call only `post_financial_command`. Success only after RPC result (UX-002). No notification send inside the commit path.

---

## 7. Financial reports hierarchy (today vs F3-08)

**Today** (`/dashboard/reports`) financial bucket:

| ID | Name | Source | Is F3 SoA? |
|---|---|---|---|
| 1 | Who Hasn't Paid | Dues outstanding | No — C&D subledger |
| 2 | Annual Contributions Summary | Confirmed collections vs expected | No — contribution ops |
| 3 | Contribution Ledger | Payment register | No — may later *join* source links |
| 4 | Contribution Arrears Aging | Obligation aging | No — AR-position, not journal AR |
| 5 | Njangi Cycle Report | savings_* | No — module ops |
| 21–23 | Loan portfolio / schedule / overdue | loans_* | No — principal ≠ income |

**F3-08 must add** (not silently overwrite 1–5):

1. Account Balance  
2. Fund Cash / Fund Net Position  
3. Cashbook / Transaction Register (original + reversal + replacement)  
4. Statement of Activity (cash-basis, `occurred_at`)  
5. Cash Movement  

Every F3-08 report must show: scope, period/as-of, native currency, currency-bucket behavior, source/observation state, correction treatment, opening-position treatment.

**Hierarchy rule:** CASH HELD ≠ MONEY AVAILABLE FOR ASSOCIATION USE (restricted fund cash, member liabilities, loan receivables are not spendable unrestricted cash).

Dashboard / AI insights (`/api/ai-insights`) must not treat reports 1–2 totals as organization-wide income after F3-08 exists.

---

## 8. Constraints that bind F3-06 / 07 / 08

1. New surfaces; do not hijack Contributions Record or reports 1–5.  
2. Teach Account ≠ Fund ≠ Category ≠ contribution type.  
3. No debit/credit, no CoA builder, no balance typing.  
4. Opening hidden in F3-07 (D-007).  
5. Mobile 375px, EN/FR, dark, `formatAmount`, `getMemberName`, permission gates.  
6. Financial commit ≠ notification.  
7. F3-08 is additive foundational projections; F6 still owns the full catalog.  
8. After F3-08, “Finances” in nav must not mean “sum of payments.”

---

## 9. Gate result

| Question | Answer |
|---|---|
| Can F3-06 start without this gate? | **No** — IA/naming collisions would ship the wrong mental model |
| Does current UI already satisfy F2 Record Transaction? | **No** |
| Does current reports hub satisfy F3-08? | **No** |
| Status | **ASTRA GATE NOW DUE** — Founder/Astra accept these constraints before F3-06 implementation |
