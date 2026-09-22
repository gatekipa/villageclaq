# VillageClaq Financial Operating System PRD

**Status:** Draft v1.0 — roadmap baseline  
**Purpose:** Freeze the product doctrine and development sequence for VillageClaq financial health, reporting, cutover, multi-currency, and organization-wide money operations so future work does not drift into disconnected features or reporting rabbit holes.  
**Current implementation anchor:** PR #54 (`codex/financial-reporting-consistency`)  
**Latest Daybreak migration SHA at time of this draft:** `df10229d6b21adfa61c9fad26f9943cb623f6248`

---

## 1. Product mission

VillageClaq Financials will become the authoritative financial operating system for community organizations.

An authorized officer records a legitimate financial event once. VillageClaq then automatically maintains the affected balances, member positions, reports, exports, standing dependencies, audit evidence, and financial-health views.

The target customer experience is:

> **Run the money in VillageClaq. The reports are already done.**

A treasurer should not have to reconstruct monthly or annual reports from WhatsApp, spreadsheets, bank statements, notebooks, or individual memory.

---

## 2. Non-negotiable principles

### 2.1 Record once, report everywhere
A financial event is recorded once. Reports are projections of authoritative financial truth, not separately maintained copies.

### 2.2 Contributions are a subledger, not the financial system
Member dues and assessments remain critical, but VillageClaq must also understand donations, grants, sponsorships, operating expenses, reimbursements, project expenses, relief payouts, fees, refunds, transfers, opening balances, and other legitimate activity.

No officer should create a fake contribution just to account for an expense or unrelated income.

### 2.3 Native currency is immutable
A parent organization may contain many group/branch ledgers using different currencies. Monetary values in incompatible currencies are never silently summed or netted.

### 2.4 Ledger currency epochs
Each group owns its own financial ledger. A group has one active currency per dated ledger epoch. Historical currency remains immutable. A legitimate later currency change closes the prior epoch and opens a new one; old money is not converted or rewritten.

### 2.5 Financial Cutover is a first-class capability
VillageClaq must support organizations that existed for years before adopting the platform. The system must explicitly represent what came before VillageClaq, what opening position was inherited, and the date VillageClaq became authoritative.

### 2.6 Financial reports must reconcile
Every material report requires an explicit reconciliation invariant and drill-down to the records that produced the headline number.

### 2.7 Authorization belongs at the authoritative boundary
Inactive officers, ordinary members, and cross-group actors must not mutate financial truth merely because a UI button is hidden or an old role remains on a membership row.

### 2.8 Audit history is append-only in meaning
Posted financial history is corrected through explicit correction/reversal semantics, not destructive rewriting.

---

## 3. Canonical financial scope

### 3.1 Organization hierarchy
A parent organization may contain multiple branch/group ledgers.

Example only:

- Parent organization
  - Branch A → USD
  - Branch B → EUR
  - Branch C → XAF
  - Branch D → NGN

The implementation must remain geography-agnostic.

### 3.2 Group ledger ownership
The `group` is the authoritative financial ledger scope in the current VillageClaq model.

Each authoritative financial row must be scoped to the correct combination of:

- group
- member where applicable
- ledger epoch
- native currency
- source module
- effective date

### 3.3 Parent reporting
Parent-level reporting must use currency buckets, e.g.:

- USD: 18,500
- EUR: 9,200
- XAF: 4,500,000
- NGN: 2,100,000

Do not build automatic FX conversion in the core roadmap. Any future converted reporting must preserve native amount, rate, rate date, source, and reporting currency.

---

## 4. Target financial architecture

VillageClaq Financials should evolve into five connected layers.

### Layer A — Organization financial ledger
Answers: **What happened to the organization's money?**

Examples:

- contribution receipt
- donation
- grant
- sponsorship
- fundraising proceeds
- operating expense
- reimbursement
- relief payout
- project expense
- loan disbursement
- loan repayment
- refund
- fee
- internal transfer
- opening financial position
- correction/reversal

### Layer B — Financial accounts
Answers: **Where is the organization's money?**

Initial account types may include:

- bank
- savings
- cash
- petty cash
- mobile money / wallet
- PayPal / digital wallet
- clearing account
- other manual account

Each account belongs to the correct group/ledger epoch and currency.

### Layer C — Financial dimensions
Answers: **Why did this transaction happen and what is it for?**

Dimensions may include:

- category
- fund
- project
- program
- payee/payer
- source module

A `fund` is not the same as an account. One physical bank account may contain money reserved conceptually for a General Fund, Relief Fund, Convention Fund, Scholarship Fund, etc.

### Layer D — Specialized subledgers
Existing domain logic remains specialized and must not be flattened into generic bookkeeping:

- contributions / dues
- relief
- projects
- loans
- Njangi / savings circles
- fines

These modules should feed organization-wide financial reporting while retaining their own business rules.

### Layer E — Reporting projections
Reports read authoritative financial events and subledger state. Reports never become a second source of financial truth.

---

## 5. Canonical event taxonomy

### Money In
- contribution payment
- donation
- sponsorship
- grant
- fundraising proceeds
- project income
- fine collected
- loan repayment
- refund received
- interest
- other income

### Money Out
- operating expense
- reimbursement
- project expense
- relief payout
- loan disbursement
- refund paid
- bank/mobile-money fee
- approved purchase
- other expense

### Transfer
Internal movement between organization-owned accounts. A transfer is neither revenue nor expense.

Example:

`Bank -500 → Cash +500`

Net operating result = 0.

### Non-cash / opening / adjustment
- opening cash/account balance
- opening arrears
- opening member credit
- correction
- reversal
- waiver
- write-off where explicitly authorized
- ledger-epoch transition metadata

---

## 6. Posting engine direction

VillageClaq should evaluate a lightweight balanced-journal backend without exposing accounting jargon to normal users.

Examples:

### $50 fuel expense
UI: `Record Expense → Fuel → $50 → Operating Bank`

Backend intent:
- Transportation/Fuel expense +50
- Operating Bank -50

### $100 member contribution
- Bank +100
- contribution receipt/income effect +100
- contribution obligation application remains governed by the contributions subledger

### $500 internal transfer
- Bank -500
- Cash +500
- no revenue or expense

The ledger must source-link postings back to the original domain record (`source_module`, `source_record_id`) so a user can drill from organization-wide finance to the original contribution, project expense, relief payout, etc.

Before implementing this layer, the architecture review must prove that it can coexist with existing `payments`, obligations, project finance, loans, relief, fines, and Njangi without creating two competing financial truths.

---

## 7. Core user experience

### 7.1 Record Transaction
One obvious finance action:

- Income
- Expense
- Transfer

### 7.2 Expense fields
Minimum:

- effective date
- amount
- financial account
- category
- description

Optional/contextual:

- payee
- fund
- project
- payment method
- reference
- receipt/evidence
- notes

Currency is inherited from ledger scope/epoch and cannot conflict with it.

### 7.3 Income fields
Minimum:

- effective date
- amount
- account
- income source/category

Optional:

- payer/donor
- project/fund
- reference
- evidence
- notes

### 7.4 Transfer
Minimum:

- source account
- destination account
- amount
- effective date

Initial scope should support same-currency internal transfer. Cross-currency transfer requires explicit dual-native-amount and exchange-rate semantics and is outside the first core implementation.

---

## 8. Transaction lifecycle and approvals

Target lifecycle:

`Draft → Pending Approval → Posted → Corrected/Reversed`

Small organizations may configure authorized treasurers to post directly. Larger organizations may require approval.

Future architecture should allow amount/category approval thresholds without making them a prerequisite for the first ledger release.

Posted transactions are not physically deleted as a normal workflow.

---

## 9. Financial Cutover

Financial Cutover is a required part of the Financial Operating System, not a later import convenience.

### Mode A — Clean Start
VillageClaq becomes authoritative on an explicit cutover date. No fake historical payments are created.

### Mode B — Opening Position
The organization brings current financial position into VillageClaq without pretending the platform recorded the historical activity.

Opening position should ultimately support:

- bank/cash/wallet opening balances
- member arrears / receivables
- member credits
- fund opening positions
- loan receivables where supported
- liabilities if included in approved scope

Opening records must retain source, approver, cutover date, group, epoch, currency, and provenance.

### Mode C — Full Historical Migration
Actual legacy transactions are imported with immutable provenance and remain distinguishable from VillageClaq-native activity.

### Cutover pipeline

`upload → parse → map → validate → staging → reconciliation preview → approval → immutable import batch → posting → final reconciliation → activation`

Structured CSV/Excel data is preferred. PDF/Word extraction is staging input only. WhatsApp is supporting evidence, not automatic accounting truth.

---

## 10. Cutover reconciliation rules

Activation must block on material unresolved conditions such as:

- unresolved member mappings
- group/branch mismatch
- currency/epoch mismatch
- invalid amounts
- invalid dates/statuses
- unresolved duplicates
- payment/type mismatches
- non-reconciling totals

Warnings may be allowed for optional notes or missing non-critical evidence according to policy.

Opening balances must not appear as if they became due in the first VillageClaq reporting period.

Opening standing should be derived from approved opening obligations/credits/exemptions where possible. Any inherited non-financial standing component must be explicitly labeled and audited.

---

## 11. Existing legacy-currency conflict doctrine

The current production preflight identified ambiguous same-group USD/XAF history.

Current rule:

- do not auto-convert
- do not auto-relabel
- do not auto-reassign
- do not delete
- do not silently infer a branch

Daybreak's staged epoch migration correctly leaves ambiguous records unresolved and requires explicit human resolution before enforcement.

The two identified payment/type currency mismatches must be resolved from authoritative evidence before Phase B enforcement.

---

## 12. Required report catalog

### A. Organization-wide reports

#### Financial Health Dashboard
For selected group/branch/currency/period:

- opening cash
- inflows
- outflows
- net movement
- closing cash
- outstanding receivables
- overdue receivables
- member credits
- active account balances
- top expense categories
- financial trend

#### Statement of Activity
Association-friendly income/expense view:

Income:
- contributions
- grants
- donations
- fundraising
- project income
- other income

Expenses:
- operations
- relief
- projects
- reimbursements
- fees
- other

Net operating result.

#### Cash Movement Statement
`Opening cash + cash received - cash paid = closing cash`

#### Transaction Register / Cashbook
Every posted movement with filters for period, account, category, fund, project, type, source module, status, and counterparty.

#### Account Balance Report
Balance by organization financial account.

#### Expense Report
By category, period, project, fund, account; drilldown to supporting evidence.

#### Income Report
Same dimensional model as expense reporting.

#### Fund Report
Opening fund position + inflows - spending = available fund position.

#### Budget vs Actual
Later mature-control phase.

### B. Contribution reports
Preserve and harden:

- Who Hasn't Paid
- Annual Financial / contribution summary
- Contribution Ledger
- AR Aging
- contribution performance
- member financial statement
- collections
- arrears / credits
- standing impact

### C. Program/subledger reports
- Relief financial report
- Project financial report
- Loan reports
- Njangi reports
- Fine report

Every subledger report must reconcile to organization-wide financial postings where cash movement exists.

### D. Parent/HQ consolidated report
Parent views must present separate currency buckets and drill down to the branch/group ledger.

---

## 13. Required engineering artifacts

### 13.1 Report Coverage Matrix
Every financial report must document:

| Report | Business question | Source events | Authoritative source | Currency scope | Reconciliation invariant | Export | Owner |
|---|---|---|---|---|---|---|---|

No new financial report ships without this row.

### 13.2 Financial Event / Projection Matrix
Every financial event must declare which projections it affects and which it must not affect.

Example:

**Contribution payment** affects account balance, cash movement, contribution ledger, member statement, receivables, AR aging, standing, financial health.

**Expense** affects account balance, expense report, cash movement, fund/project reporting, budget actuals, financial health; it does not create member contribution obligations.

**Internal transfer** affects source account, destination account, and transaction register; it does not affect income, expense, contribution status, or standing.

---

## 14. Shared period semantics

All financial reporting must share one period contract supporting:

- this month
- last month
- quarter
- year
- custom range
- optional organization fiscal year later

Where relevant, distinguish:

- effective/transaction date
- recorded date
- approval/posting date

Reports must not place the same transaction in inconsistent periods.

---

## 15. Funds, budgets, and reconciliation

### Funds
A fund represents purpose/restriction, not physical custody. Multiple funds may exist inside one bank account.

### Budgets
After authoritative posting is stable, support budget-vs-actual by annual period, project, fund, or event where appropriate.

### Account reconciliation
Mature roadmap should allow an officer to compare an external statement ending balance with VillageClaq's account balance and identify a difference without requiring automatic bank feeds.

---

## 16. Period closing

Future mature-control capability:

`Close financial period`

After close, ordinary edits affecting the period are blocked. Exceptional reopen/correction requires explicit authorization and audit history.

Architecture should not preclude this.

---

## 17. Financial intelligence / agentic layer

Only after the underlying financial truth is independently proven.

AI may:

- detect anomalies
- explain trends
- identify deteriorating collections
- identify low fund balances
- flag unusual expense growth
- identify unreconciled records
- recommend follow-up
- draft reports

AI does not silently move money, rewrite financial history, issue consequential financial corrections, or bypass approval controls.

---

## 18. Permissions baseline

At minimum distinguish:

- member: view own financial statement
- authorized officer: view group financials
- financial operator: record transactions
- approver: approve transactions where configured
- high-trust finance role: correct/reverse posted transactions
- exporter: export financial reports
- finance admin: configure accounts/funds/categories
- cutover authority: approve activation of opening financial position

Inactive memberships fail financial mutation authorization even if a historical role remains.

---

## 19. Non-goals / anti-rabbit-hole guardrails

Do not turn VillageClaq into a general ERP.

Not part of the core financial roadmap unless separately approved:

- payroll
- tax filing
- inventory
- purchase-order ERP
- automated FX conversion
- live bank feeds
- automatic bank reconciliation
- complex accrual accounting
- enterprise chart-of-accounts builder
- investment accounting
- broad AP automation

The goal is association financial operations, not a QuickBooks clone.

---

## 20. Development gates — follow in order

### F0 — Close current Financial P1 / PR #54 safely
Finish:

- ledger epoch migration
- legacy currency conflict workflow
- multi-currency correctness
- current contribution/payment P1 integrity
- current parent cross-currency reporting defects required for correctness

Do not mix the full Financial Operating System into PR #54.

### F1 — Financial System Audit
Inventory current:

- tables
- services/domain logic
- finance screens
- reports 1–24
- project finance
- relief
- Njangi
- loans
- fines
- exports
- dashboards

Deliver:

1. source-of-truth map
2. report coverage matrix
3. financial event/projection matrix
4. duplication/island map
5. missing-capability list

**No implementation in F1.**

### F2 — Canonical Financial Domain Design
Freeze:

- ledger transaction
- postings
- financial accounts
- categories
- funds
- source-module links
- epoch relationships
- lifecycle states
- correction/reversal model
- permissions
- audit contract

Security/database design receives Daybreak review before implementation.

### F3 — Core Ledger Foundation
Implement in isolated environment:

- financial accounts
- income
- expenses
- transfers
- balanced postings
- evidence
- corrections/reversals
- currency enforcement
- audit trail

Prove invariants before UI expansion.

### F4 — Contributions Integration
Contribution payments feed the organization ledger while the contribution subledger remains authoritative for obligation allocation, arrears, credits, and standing.

Reconcile both layers.

### F5 — Specialized Subledger Integration
Integrate one module at a time:

1. Projects
2. Relief
3. Fines
4. Loans
5. Njangi

No module advances without reconciliation tests.

### F6 — Organization Financial Reporting
Build:

- Financial Health
- Statement of Activity
- Cash Movement
- Transaction Register
- Income
- Expenses
- Account Balances
- Funds

Every report requires drilldown, export parity, currency safety, and an invariant.

### F7 — Financial Cutover Foundation
Implement:

- cutover date
- import batches
- opening positions
- staging
- provenance
- reconciliation
- approval
- activation lock

### F8 — Cutover Importers
In order:

1. CSV
2. Excel
3. PDF/Word candidate extraction
4. supporting-evidence workflows

WhatsApp remains evidence, not automatic financial truth.

### F9 — Mature Controls
- budgets
- account reconciliation
- period closing
- approval thresholds
- correction/history browser

### F10 — Agentic Financial Intelligence
Only after F0–F9 financial truth and authorization boundaries are independently validated.

---

## 21. Release model for every financial gate

Every gate follows:

`Design → implementation → specialist review → independent QA → security → release preflight → controlled release`

Routing:

- **Astra:** difficult financial/domain/UI implementation and architecture analysis
- **Daybreak Blue:** RLS, authorization, security-sensitive database work, migrations, security remediation
- **GrokBot Chief:** orchestration, independent QA, security evidence, release gates

Every handoff must name the exact SHA under review.

---

## 22. Definition of Done

VillageClaq Financials is not complete because pages exist.

A real treasurer must be able to perform a normal month of activity:

- collect dues
- receive a donation
- record operating expenses
- reimburse an officer
- make a relief payout
- incur a project expense
- transfer bank → cash
- correct a mistaken transaction
- review overdue members
- reconcile account balances
- inspect fund balances

and then immediately obtain accurate:

- financial health
- contribution reports
- income
- expenses
- cash movement
- account balances
- fund positions
- project results
- relief results
- member statements
- audit history

without rebuilding the report in Excel.

Every headline number must drill down to the records that produced it.

---

## 23. North-star acceptance scenario

A parent organization has:

- US branch → USD
- European branch → EUR
- African branch → XAF

US branch begins the month with:

- Bank: $20,000
- Cash: $500
- Outstanding dues: $3,000

During the month it:

- collects $2,000 dues
- receives $1,000 donation
- spends $500 on a venue
- reimburses an officer $100
- transfers $300 Bank → Cash
- pays a $400 relief benefit

Acceptance conditions:

- cash position reconciles
- income/expense reports reconcile
- contribution standing changes only from valid contribution activity
- internal transfer creates no revenue/expense
- relief payout appears in both relief and organization-wide finance
- venue/reimbursement appear as expenses
- donation is income but not member contribution
- EUR/XAF branches remain financially isolated
- parent shows separate currency buckets
- exports match the on-screen totals
- audit history explains every posted event
- no spreadsheet reconstruction is needed

---

## 24. Product doctrine

Keep this sentence visible during every future financial design review:

> **A report is a view of financial truth. A report is not financial truth.**

And this operating promise:

> **Record the financial event once. VillageClaq maintains the truth everywhere else.**
