# VillageClaq F3 Core Ledger Foundation — Ticket Freeze

**Status:** F3 TICKET FREEZE ONLY — no implementation  
**Gate:** F3 Core Ledger Foundation (tickets frozen; execution not authorized)  
**Date:** 2026-09-08  
**Audience:** Astra, Daybreak Blue, GrokBot Builder, GrokBot Chief  
**This artifact does not authorize F3 implementation.**

---

## F3 IMPLEMENTATION STATUS

> **F3 IMPLEMENTATION STATUS: HOLD — FOUNDER AUTHORIZATION REQUIRED TO START F3-01**

No product branch is created by this freeze. The planned later integration branch name is documented only. Do not start F3-01 until the founder explicitly authorizes that ticket.

---

## 0. Artifact metadata

| Field | Value |
|---|---|
| Artifact | `docs/VILLAGECLAQ_F3_CORE_LEDGER_TICKET_FREEZE.md` |
| Artifact kind | Ticket freeze (docs only) |
| This branch | `docs/f3-core-ledger-ticket-freeze-20260908` |
| Base branch | `docs/f2-financial-domain-design-20260908` |
| **F2 design SHA (exact base)** | `a13b5e6c482e5e68ba2c92c41ae14b411668ae88` |
| **PRODUCT SHA (implementation anchor)** | `99e17e2b4f4dc16753843f1e115312e70a8ae8ca` |
| **PRD SHA** | `aa470c920737ce293c59b58bdd03010c39fe35e1` |
| F2 artifact path | `docs/VILLAGECLAQ_F2_CANONICAL_FINANCIAL_DOMAIN_DESIGN.md` |
| PRD path | `docs/VILLAGECLAQ_FINANCIAL_OPERATING_SYSTEM_PRD.md` |
| Security pins | **P1-A through P1-H unchanged** — copy F2 §21.1 at SHA `a13b5e6c…` |
| Planned F3 integration branch | `codex/f3-core-ledger-foundation` — **NOT created in this action; planned only** |
| Not based on | F0 product branch `codex/financial-reporting-consistency` |
| Not merge-to | `main` |
| Not F0 / not F2 rewrite | This freeze does not amend F2, the PRD, or any product code |

**What this freeze authorizes.** A restructured, owner-split F3 ticket catalog (F3-01 … F3-09), delivery slices 1–9, collision rules, acceptance matrix A–O, and a prompt-ready F3-01 scope summary for later founder authorization.

**What this freeze does not authorize.** Application code, SQL migrations, product changes, F0 work, F3 implementation, creation of `codex/f3-core-ledger-foundation`, merge to `main`, or any production financial cutover.

**F2 is not modified.** Implementers encode F2 at SHA `a13b5e6c482e5e68ba2c92c41ae14b411668ae88`. They do not reopen ledger model B, cash-basis A, object model, taxonomy, classifications, posting invariants, idempotency, accounts/funds/categories, multi-currency, dates, status, correction inclusion, opening modes, report invariants, standing consumption, permissions MVP, or Security P1-A–H.

---

## 1. Implementation branch rule

| Rule | Freeze |
|---|---|
| **Product work base** | Every F3 product commit bases from **PRODUCT SHA `99e17e2b4f4dc16753843f1e115312e70a8ae8ca`** or an **authorized successor** of that SHA. |
| **Docs authority** | Branch `docs/f2-financial-domain-design-20260908` (tip `a13b5e6c…`) is **docs authority only**. It is not a product merge base. |
| **PRD authority** | `docs/VILLAGECLAQ_FINANCIAL_OPERATING_SYSTEM_PRD.md` at SHA `aa470c920737ce293c59b58bdd03010c39fe35e1`. Do not edit the PRD in F3 tickets. |
| **F0 isolation** | Do not base F3 product work on `codex/financial-reporting-consistency` unless the founder names a later authorized successor that already contains F0. |
| **Planned integration branch** | `codex/f3-core-ledger-foundation` — created only after founder authorization of F3-01. **Not created by this freeze.** |
| **Handoff SHA** | Every ticket handoff names the exact commit SHA under review. Later QA pins that SHA. Memory is not a SHA. |

Do not mix docs-branch commits into product history. Do not merge this ticket-freeze branch to `main`.

---

## 2. Immutable F3 principles 1–23 (founder brief)

These are the Chief-frozen F2 decisions (founder brief + Astra contract close, encoded at F2 SHA `a13b5e6c…` §§1–23). **F3 implementers encode them. They do not reopen them.**

| # | Principle | F2 locus | Frozen statement |
|---|---|---|---|
| **1** | Purpose / record once | §1 | An authorized officer records a legitimate **Financial Event** once. VillageClaq maintains balances, positions, reports, exports, standing inputs, and audit evidence from that single write. A report is a view of financial truth, not financial truth. |
| **2** | PRD layers A–E | §2 | Layer A = Financial Event + Postings. Layer B = Account (custody). Layer C = Fund / Category / optional project / member / contribution type. Layer D = specialized subledgers. Layer E = reporting projections from **all committed postings**. No layer becomes a second money truth. |
| **3** | Object model | §3 | **Financial Event** is the user-understood write unit. **Posting** is backend-only. Do **not** add a separate user-facing Transaction object. |
| **4** | Ledger model B | §4 | Lightweight balanced posting journal behind simple UX. Users see Money In / Money Out / Transfer / Opening-Adjustment. Users never see debit, credit, journal, chart of accounts, or trial-balance jargon. Internal convention is **debit-positive**. A `POSTED` event has a complete non-empty posting set that balances to **exactly zero** in one native currency. No partial survival. |
| **5** | Cash-basis A | §5 | Cash-basis Statement of Activity + separate receivable/dues subledger. Obligation creation is not income and is not journal AR. Confirmed collection is income **once** for confirmed cash. Dues advance = already-recognized income + allocation credit. Refundable / Njangi = liability, never silently converted. |
| **6** | Sparse UX taxonomy | §6 | Top-level classes stay **MONEY IN / MONEY OUT / TRANSFER / OPENING-ADJUSTMENT**. Subtypes are category / fund / project dimensions. Record Transaction UX always shows action, amount+currency, effective date, custody account, category for ordinary in/out, description for expense. Confirm account + fund before post. |
| **7** | Subledger classifications | §7 | Loan principal is never income or expense. Njangi / member savings is never association unrestricted income. Transfers are never SoA. Fine assessment is not income. Contribution collection is recognized once. Accounting-error correction retains original + exact reversal + optional replacement. |
| **8** | One effect → one event | §8 | **ONE** subledger business effect → **AT MOST ONE** canonical Financial Event → deterministic Postings → all org reports derive from those postings. Prefer A: the subledger generates canonical events. |
| **9** | Idempotency | §9 / P1-B | Unique natural key **`(group_id, source_module, source_record_id, effect_kind, ledger_epoch)`** plus pre-insert advisory or claim-row lock **and** the unique constraint. Identical key + identical payload → return original **after authorization revalidation**. Identical key + different payload → **CONFLICT**. Never ship a non-idempotent posting path. |
| **10** | Accounts | §10 | Account = custody. Kinds: bank, cash, mobile money, wallet, other. Single-currency. **ACCOUNT BALANCE** derived from custody postings. No manually editable authoritative totals. Currency immutable after open. Lifecycle `active → inactive → closed`. |
| **11** | Funds | §11 | Account = where. Fund = purpose. Independent dimensions. Measures are **ACCOUNT BALANCE**, **FUND CASH**, **FUND NET POSITION** — never sum-of-all-signed-postings. F3 ordinary manual events: **one fund per event**. No interfund AR/AP. No fund-reallocation UI unless acceptance truly requires it. |
| **12** | Categories | §12 | Flat list first. System defaults + org-custom. Archiveable. Separate from accounts, funds, projects, and contribution types. No chart-of-accounts builder. No arbitrary posting-line builder. |
| **13** | Multi-currency | §13 | Native ledger epoch. Historical currency immutable. No silent FX. No incompatible netting. Parent / HQ = currency **buckets** only. One event = one currency. F3 ordinary transfer is **same-currency only**. Cross-currency transfer is **denied**. |
| **14** | Dates | §14 | `occurred_at` drives SoA, cashbook, cash movement, period reports. `posted_at` / `created_at` / `corrected_at` are audit or system. `due_date` is subledger only. Reversal may keep original `occurred_at`; replacement uses the intended corrected date. |
| **15** | Status / lifecycle | §15 | `DRAFT? → POSTED → CORRECTED / REVERSED`. Posted meaning is append-only. F3 posts directly (draft optional). No `finances.approve` prerequisite. `CORRECTED` / `REVERSED` are presentation/history, **not** arithmetic exclusion. |
| **16** | Correction / reversal | §16 | Correction = **ORIGINAL + EXACT REVERSAL + OPTIONAL REPLACEMENT**. All committed postings remain in projections. Example: **+500 − 500 + 450 = 450**, not −50. At most one reversal per target. Further corrections target the replacement. Real later refund is a new economic event. |
| **17** | Opening Position | §17 | F3 = manual opening **custody + fund + provenance** only. Opening cash is **not** period income. Restricted-fund attribution on the same custody **must not double cash**. Opening arrears / dues credits / loans / Njangi / cutover upload are **not** F3 UI. |
| **18** | Reports | §18 | Org reports project from **all committed postings** (+ dimensions). Reconciliation = compatible derivation from the same economic truth — not every report showing the same number. Distinguish **CASH HELD** vs **MONEY AVAILABLE FOR ASSOCIATION USE**. |
| **19** | Standing | §19 | **Do not redesign standing in F3.** Standing consumes **one** canonical confirmed-dues projection. Opening arrears are not confirmed collections (P1-E). |
| **20** | Permissions MVP | §20 | Reuse `finances.view` + `finances.manage`. Hidden UI is not security. Inactive membership cannot mutate. Ordinary members cannot mutate the group ledger. Member self-read of **own** statement does **not** require `finances.view` (P1-F). Members cannot read peers. |
| **21** | Security P1-A–H | §21.1 | Pins **P1-A through P1-H are unchanged**. See §3 of this freeze. Encode them. Do not weaken them. |
| **22** | Module migration style | §22 | Prefer A: subledger generates canonical events. Full dues integration is **F4**. Fines / loans / projects / relief / Njangi product work is **F5**. F3 may ship journal **capability** fixtures only. |
| **23** | Legacy disposition | §23 | `amount_paid` as money truth, stale loan v1, JSON fines duplication, admin MRR from association payments, duplicate summaries, and ad-hoc currency totals are **not F3 replacements**. F3 must not add another competing total. |

**Keep / simplify / defer** remains F2 §24.1. F3 exclusions remain F2 §25. This freeze does not reopen either list.

---

## 3. Security pins P1-A through P1-H (unchanged)

Copied from F2 §21.1 at SHA `a13b5e6c482e5e68ba2c92c41ae14b411668ae88`. **Do not amend.** Future Security requals cite F2 P1-H: the named F2 file at that exact SHA.

| Pin | Title | Frozen security contract |
|---|---|---|
| **P1-A** | Posting authority | `financial_events`, `postings`, and `account_balances` (or any derived balance materialization) are **not client-writable**. Only **SECURITY DEFINER** RPCs with `search_path = ''` may create or reverse posted financial truth. RLS is **deny-by-default** for `authenticated` writes on those objects. Direct `INSERT`/`UPDATE`/`DELETE` from the browser client, anon key, or ordinary authenticated role is forbidden. |
| **P1-B** | Idempotency key | Unique natural key **`(group_id, source_module, source_record_id, effect_kind, ledger_epoch)`** plus a **pre-insert** advisory or claim-row lock **and** the unique constraint. `source_record_id` is an immutable occurrence. `effect_kind` is server-enumerated. Epoch is bound to the occurrence. Identical key + identical payload → return original **after authorization revalidation**. Identical key + different payload → **CONFLICT**. `request_id` covers client-retry of a manual command. |
| **P1-C** | Recognition gate | The **server** enumerates which payment statuses / effect kinds may emit **cash-basis SoA income**. `pending`, `rejected`, `voided`, and **relief-misapplied** **never** post SoA income. Obligation creation, opening arrears, refundable deposits, Njangi contributions, and non-confirmed collection states never post SoA income. The allow-list lives in the posting RPC, not in the UI. |
| **P1-D** | Correction privilege | **MVP freeze:** `finances.manage` may correct/reverse **with mandatory linked audit** (actor, reason, timestamps, linkage). **No silent rewrite** of posted rows. A distinct **high-trust cutover/opening** privilege may be introduced later (F7 activation). It is **not** F3 and is **not** granted by `finances.manage` today. Optional `finances.reverse` remains later-only. |
| **P1-E** | Opening vs standing / SoA / credits | Opening arrears **may** create dues-subledger AR **position** only — **never** journal dues AR in F3, never confirmed-collection income, never standing payments. Opening **recognized dues credit** is allocation-credit (no current-period income). Opening **refundable** credit is liability. Unapplied confirmed dues advance is already-recognized income + allocation credit. Standing consumes **one canonical confirmed-dues projection** only. |
| **P1-F** | Member self-read | `finances.view` means **group finance**. Members may read **their own** statement **without** `finances.view`. Members **cannot** read peers. Group cashbook / SoA / all-member registers require `finances.view` (or owner/admin bypass as already productized). |
| **P1-G** | Draft → Posted | If F3 implements `DRAFT`, **who may post is server-gated** (manage RPC). There is **no client `UPDATE` of posted rows**. Status transitions that create or reverse posted meaning go through the same P1-A RPCs. |
| **P1-H** | Named artifact SHA | F2 file `docs/VILLAGECLAQ_F2_CANONICAL_FINANCIAL_DOMAIN_DESIGN.md` on the docs branch at signed SHA **`a13b5e6c482e5e68ba2c92c41ae14b411668ae88`** is the Security requal target. Do not requalify from a rename, a copy, or an unsigned amendment. |

Detail tables in F2 §21.1 (P1-A objects, P1-B lock sequence, P1-C allow-list, P1-D privilege split, P1-E opening/credit matrix, P1-F read matrix) remain the encoding contract. This freeze does not replace them.

---

## 4. Delivery slices 1–9 (founder brief; frozen order)

Numeric ticket IDs are labels. **Build in this order.** Old F2 IDs `F3-T01`–`F3-T12` are superseded as the execution catalog by `F3-01`–`F3-09` below. The old IDs remain a crosswalk only (§6).

| Slice | Name | Exact founder-brief content | Ships | Primary | Support |
|---|---|---|---|---|---|
| **1** | Foundation | **Daybreak primary.** Defs, constraints, custody schema, fund/control semantics, currency/epoch columns, server authz inside the future RPC boundary. | F3-01 | **DAYBREAK BLUE** | Astra reviews conceptual field/invariant match to F2 §§3–4, §8–9, §14–16 |
| **2** | Secure posting + idempotency | **T04+T05 as ONE unit.** Never a non-idempotent posting command. **Astra semantics + Daybreak RPC/RLS.** | F3-02 | **ASTRA + DAYBREAK BLUE** (split files, §5.2) | — |
| **3** | Projection / read proof | **Before Record Transaction UI.** Engine proves balances, SoA-lite, inclusion of original+reversal+replacement. **Astra + Daybreak RLS review.** | F3-03 | **ASTRA** | Daybreak RLS / `security_invoker` review |
| **4** | Correction / reversal | Linked reversal + replacement; `+500 −500 +450 = 450`. **Astra + Daybreak concurrency.** | F3-04 | **ASTRA** | Daybreak security / concurrency review |
| **5** | Opening cash only | Manual custody + fund + provenance; no doubled restricted cash; not period income. **Astra + Daybreak authz.** | F3-05 | **ASTRA** | Daybreak authz review |
| **6** | Account / fund configuration UI | Settings lists only. **Builder + Astra semantics + Daybreak RLS.** | F3-06 | **GROKBOT BUILDER** | Astra semantics; Daybreak RLS |
| **7** | Record Transaction UX | §6.3 after the engine is proven. **Astra primary.** | F3-07 | **ASTRA** | Builder only if later delegated by Chief |
| **8** | Core reporting UI | Balances, register, SoA-lite. **Astra; Builder if delegated.** | F3-08 | **ASTRA** | Builder if Chief delegates |
| **9** | Full acceptance matrix | §8 of this freeze (USD story + tests A–O) + currency buckets. | F3-09 | **GROKBOT BUILDER** (fixtures under Astra) | Chief QA later; Daybreak security spot-check |

**Hard sequence gates**

- Slice 2 cannot start until F3-01 handoff SHA is accepted.
- Slice 3 cannot start until F3-02 posting+idempotency is one shippable unit.
- Slice 7 **cannot** start until slice 3 projection/read proof has passed.
- Slice 6 may proceed after slice 5; it must not invent balance-edit UX.
- Slice 9 is the only ticket that claims full A–O + north-star arithmetic.

---

## 5. Tickets F3-01 … F3-09

Format for every ticket: **ID | SLICE | TITLE | PRIMARY OWNER | SUPPORT OWNER | EXACT OBJECTIVE | EXPECTED FILE/DOMAIN SCOPE | SCHEMA IMPACT | SECURITY IMPACT | USER/UX IMPACT | DEPENDENCIES | MUST-PASS TESTS | OUT-OF-SCOPE | HANDOFF SHA REQUIREMENT | REVIEW GATE**

Conceptual table/RPC names below are the F2 design contract, **not DDL**. Actual identifiers are chosen in F3-01 and then reused. Latest product-base migration at PRODUCT SHA is `00113_*`; F3 migrations, when later authorized, continue that sequence on the product branch.

### 5.1 F3-01 — Foundation / security schema

| Field | Freeze |
|---|---|
| **ID** | **F3-01** |
| **SLICE** | **1 — Foundation** |
| **TITLE** | Foundation / security schema (defs, constraints, custody, funds/controls, epoch, server authz boundary) |
| **PRIMARY OWNER** | **DAYBREAK BLUE** |
| **SUPPORT OWNER** | Astra (invariant / conceptual-field review only; no migration authorship) |
| **EXACT OBJECTIVE** | Persist the F2 conceptual schema so posted financial truth **cannot** be client-written: Financial Event + Posting tables, custody Account table, Fund + Category primitives, fixed control accounts (income, expense, opening-position, receivable, liability), epoch/currency columns, P1-B unique key **shape**, deny-by-default RLS writes (P1-A), and the **authz checks that the future posting RPC must call** (active membership, group scope, `finances.manage`, P1-F read rules). No product UI. No posting command body. No idempotent ship yet — but the unique-key constraint and lock **hook** must exist so F3-02 cannot invent a second key. |
| **EXPECTED FILE/DOMAIN SCOPE** | **Daybreak only:** next sequential `supabase/migrations/0011x_f3_core_ledger_foundation.sql` (or split `0011x`/`0011y` **owned entirely by Daybreak**); RLS on `financial_events`, `postings`, custody accounts, funds, categories, and any balance materialization; `SECURITY DEFINER` **stubs or helper functions** with `search_path = ''` for group-scope / permission / lock claim (not the full posting template yet); `security_invoker` on any preview view. **Astra may add:** `src/lib/finance/` TypeScript types that **mirror** the conceptual fields — no writes. **Do not** edit `package.json`, PRD, F2 artifact, standing code, or `src/lib/calculate-standing.ts`. |
| **SCHEMA IMPACT** | **High.** New group-scoped tables, FKs, check constraints for §4.3 invariants (non-empty set, exact balance, shared group/epoch/currency/`occurred_at`, custody currency match, exact minor-unit precision), unique `(group_id, source_module, source_record_id, effect_kind, ledger_epoch)`, account currency immutable after open, one-currency-per-account, one-event-one-currency columns. |
| **SECURITY IMPACT** | **High.** Tenant isolation. P1-A deny-by-default writes. Append-only posted meaning (no authenticated `UPDATE`/`DELETE` of posted economic dimensions). F0 test-tenant classification remains a **migration gate only** — not a runtime integrity skip. |
| **USER/UX IMPACT** | **None.** No user-facing jargon. No Record Transaction. No settings lists. |
| **DEPENDENCIES** | F2 freeze SHA `a13b5e6c…`. Product base `99e17e2b…` (or authorized successor). Founder authorization of **this ticket** (not granted by this document). |
| **MUST-PASS TESTS** | Schema matches F2 §§3–4, §8–9, §10–16, §21.1. RLS deny-by-default writes on events/postings/balances. Constraints reject unbalanced / empty / mixed-currency sets. Account currency cannot change in place. Cross-group FK use fails. Ordinary `authenticated` INSERT fails. Helper authz denies inactive / cross-group / member mutate (tests E–H shapes, even before the full posting command). |
| **OUT-OF-SCOPE** | Posting template generation; idempotent RPC ship (that is F3-02 as **one** unit); projection engine; correction RPC; opening UX; any UI; dues AR journal; loan/Njangi product; standing changes; F0; merge to `main`. |
| **HANDOFF SHA REQUIREMENT** | Daybreak names the exact product-branch SHA that contains **only** F3-01 migrations + helpers. Astra and Security review **that SHA**. F3-02 must not start on a different unsigned tip. |
| **REVIEW GATE** | Daybreak self-review + Astra contract match + Security spot-check of P1-A/P1-B **shape**. Chief does not treat F3-01 as F3 PASS. |
| **EXECUTION** | **FIRST implementation ticket. NOT authorized to execute by this freeze.** |

### 5.2 F3-02 — Secure posting command + idempotency (combined)

| Field | Freeze |
|---|---|
| **ID** | **F3-02** |
| **SLICE** | **2 — Secure posting + idempotency** |
| **TITLE** | Secure posting command **and** idempotency as **ONE** shippable unit (old T04+T05) |
| **PRIMARY OWNER** | **ASTRA** (semantics) **and DAYBREAK BLUE** (RPC / RLS / lock) — see file split below |
| **SUPPORT OWNER** | — (both are primary on disjoint files) |
| **EXACT OBJECTIVE** | Ship the **only** write path for posted financial truth: `SECURITY DEFINER` RPC (`search_path = ''`); P1-C recognition allow-list; one event = one currency; P1-B tuple + advisory/claim-row lock **before** insert + unique constraint; identical payload returns original after authz revalidation; different payload CONFLICTS; concurrent retries = one event; deterministic balanced posting sets for Money In / Money Out / Transfer / Opening-Adjustment; failure leaves **zero** posted rows. **Never ship a non-idempotent posting command.** |
| **EXPECTED FILE/DOMAIN SCOPE** | **Chief-frozen file ownership — who may edit which files:** |
| | **DAYBREAK BLUE may edit:** the F3-02 migration that **creates/replaces** the posting RPC **shell** (signature, `SECURITY DEFINER`, `search_path = ''`, authz calls from F3-01, advisory/claim-row lock, unique-constraint race guard, transaction abort); RLS remaining deny-by-default; grant/revoke on the RPC; lock-claim table if used. **ASTRA may edit:** posting **templates** / economic classification module (planned `src/lib/finance/posting-templates.ts` or equivalent **and** any SQL body Daybreak exposes as an Astra-owned `posting_template_*` include — if SQL templates live in the same migration as the RPC shell, **Astra writes the template fragment in review comments or a sibling `*.semantics.sql` file that Daybreak applies in a follow-up Daybreak-owned migration; Astra does not push to the Daybreak migration file**); payload-compare rules; P1-C allow-list specification; domain tests under `src/lib/finance/` or `tests/finance/` for balance, replay, conflict, concurrency. **NEVER simultaneous edit of the same migration or the same DEFINER function.** If a conflict appears, stop and Chief-serialize. |
| **SCHEMA IMPACT** | **Medium.** RPC + unique indexes (if not finished in F3-01) + lock object. No UI tables. |
| **SECURITY IMPACT** | **High.** This is the **only** write path (P1-A). Double-post is a money incident. Replay must revalidate authz (P1-B rule 9). Pending/voided/rejected/relief-misapplied never emit SoA income (P1-C). |
| **USER/UX IMPACT** | **None in this ticket.** No Record Transaction UI. |
| **DEPENDENCIES** | F3-01 handoff SHA accepted. F3-01 unique-key + deny-by-default + authz helpers present. |
| **MUST-PASS TESTS** | Tests **A, B, D, E, F, G, H** (shapes that do not require correction/opening UI). Deterministic balanced postings. UI/`authenticated` cannot INSERT. Concurrent identical retries = one event. |
| **OUT-OF-SCOPE** | Projection UI; Record Transaction; correction RPC (F3-04); opening UX (F3-05); settings UI; reporting UI; shipping posting **without** the lock+unique+conflict rules. |
| **HANDOFF SHA REQUIREMENT** | Joint SHA: Daybreak RPC/lock commit(s) + Astra template/test commit(s) on `codex/f3-core-ledger-foundation` (created only after F3-01 is authorized). Reviewers cite **one** tip SHA that contains both. |
| **REVIEW GATE** | Astra semantics + Daybreak RPC/RLS + Security P1-A/B/C. Cannot split-merge “RPC now, idempotency later.” |

### 5.3 F3-03 — Projection / read proof

| Field | Freeze |
|---|---|
| **ID** | **F3-03** |
| **SLICE** | **3 — Projection / read proof** |
| **TITLE** | Projection / read proof **before** Record Transaction UI |
| **PRIMARY OWNER** | **ASTRA** |
| **SUPPORT OWNER** | Daybreak Blue — RLS / `security_invoker` review |
| **EXACT OBJECTIVE** | Prove derived **ACCOUNT BALANCE**, **FUND CASH**, SoA-lite, and cashbook / register from **all committed postings** + `occurred_at`. Correction inclusion R1 must hold on the engine **before** any Record Transaction UI. Balances are not client-writable. Member own-statement read without `finances.view` (P1-F) is specified at the query layer even if UI waits for F3-08. |
| **EXPECTED FILE/DOMAIN SCOPE** | **Astra:** `src/lib/finance/projections.ts` (or equivalent), invoker-safe SQL views named in an Astra-authored spec; Daybreak **applies** view SQL in a Daybreak-owned migration if views are used. **Daybreak:** RLS on views (`security_invoker` or equivalent); no bypass. **Do not** add reporting pages in this ticket. |
| **SCHEMA IMPACT** | **Low.** Views or query layer only. No new money-truth tables. If a materialization exists, only the rebuild-from-postings path may write it (P1-A). |
| **SECURITY IMPACT** | **Medium.** Views must not bypass RLS. P1-F: own-statement vs group finance. |
| **USER/UX IMPACT** | **None required.** Engine/tests only. |
| **DEPENDENCIES** | F3-02 combined unit. F3-01 schema. |
| **MUST-PASS TESTS** | F2 §18.1 invariants on fixtures. Reversed original is **not** excluded. No `amount_paid` as organization income. Transfers excluded from SoA-lite. Opening cash excluded from period income. Daybreak signs RLS review on the handoff SHA. |
| **OUT-OF-SCOPE** | Record Transaction UI (F3-07). Reporting pages (F3-08). Correction command (F3-04) — engine must still **be ready** to include original+reversal+replacement once F3-04 exists; F3-03 may use fixture-inserted committed sets via the F3-02 RPC only. |
| **HANDOFF SHA REQUIREMENT** | Astra names the engine SHA. Daybreak attaches RLS review to **that** SHA. |
| **REVIEW GATE** | Astra + Daybreak RLS. Slice 7 is blocked until this gate passes. |

### 5.4 F3-04 — Correction / reversal

| Field | Freeze |
|---|---|
| **ID** | **F3-04** |
| **SLICE** | **4 — Correction / reversal** |
| **TITLE** | Correction / reversal foundation (P1-D / P1-G) |
| **PRIMARY OWNER** | **ASTRA** |
| **SUPPORT OWNER** | Daybreak Blue — security / concurrency review |
| **EXACT OBJECTIVE** | `finances.manage` + mandatory linked audit; no silent rewrite; no client `UPDATE` of posted rows. Original + exact reversal + optional replacement **all remain in projections**. Own stable correction identity. **At most one reversal per target.** Concurrent second reversal of the same target fails. Arithmetic **`+500 − 500 + 450 = 450`**, not −50. |
| **EXPECTED FILE/DOMAIN SCOPE** | **Astra:** correction/reversal command semantics, linkage fields usage, domain tests (test **C**, **K**, **M**). **Daybreak:** DEFINER reverse/replace RPC **shell** (same collision rule as F3-02 — Daybreak owns the function file/migration; Astra owns exact-negate template). Linkage columns if not already in F3-01 (`reversal_of_event_id`, `replacement_event_id`, `corrected_at`). |
| **SCHEMA IMPACT** | **Medium** if linkage columns were reserved in F3-01 (preferred) vs added here. |
| **SECURITY IMPACT** | **High.** History tampering class. P1-D / P1-G. Concurrent double-reverse is a money incident. |
| **USER/UX IMPACT** | Dialog **may wait** until after F3-07. This ticket is engine + RPC. |
| **DEPENDENCIES** | F3-02; F3-03 engine (so inclusion is measurable). |
| **MUST-PASS TESTS** | **C, K, M.** Audit fields present. RPC-only. Exact negation of original posting set. |
| **OUT-OF-SCOPE** | Real later refund product UX; `finances.reverse` as a new permission; silent rewrite; excluding originals from arithmetic. |
| **HANDOFF SHA REQUIREMENT** | Astra + Daybreak joint tip SHA. |
| **REVIEW GATE** | Astra + Daybreak concurrency/security. |

### 5.5 F3-05 — Opening cash only

| Field | Freeze |
|---|---|
| **ID** | **F3-05** |
| **SLICE** | **5 — Opening cash only** |
| **TITLE** | Manual opening custody + fund + provenance |
| **PRIMARY OWNER** | **ASTRA** |
| **SUPPORT OWNER** | Daybreak Blue — authz review |
| **EXACT OBJECTIVE** | Manual opening **custody** (bank/cash) + fund + provenance through the F3-02 command. Opening cash is **not** period income (custody vs opening-position control). Restricted fund attribution on the same custody **must not double cash**. |
| **EXPECTED FILE/DOMAIN SCOPE** | **Astra:** opening `effect_kind` / template (`opening_custody`), provenance fields, tests for SoA exclusion and restricted-cash non-doubling. **Daybreak:** authz — `finances.manage` via P1-A RPC; no distinct F7 cutover privilege. |
| **SCHEMA IMPACT** | **Low–medium.** Provenance columns if not in F3-01. |
| **SECURITY IMPACT** | **Medium.** Fake-payment risk (P1-E). Opening must not look like a confirmed collection. |
| **USER/UX IMPACT** | Opening-custody entry, clearly labeled — may be a narrow command/fixture in this ticket; polished UI can wait for F3-07 if Chief prefers, but the **command** must exist here. |
| **DEPENDENCIES** | F3-02, F3-03, F3-04 (correction path available; opening itself is not a correction). |
| **MUST-PASS TESTS** | Opening cash excluded from SoA period income. Restricted attribution does not double ACCOUNT BALANCE. No dues AR journal. Test **O** opening legs. |
| **OUT-OF-SCOPE** | Opening arrears UI; dues credits UI; loans; Njangi; cutover upload; F7 high-trust privilege. |
| **HANDOFF SHA REQUIREMENT** | Astra SHA + Daybreak authz note on that SHA. |
| **REVIEW GATE** | Astra + Daybreak authz. |

### 5.6 F3-06 — Account / fund / category settings UI

| Field | Freeze |
|---|---|
| **ID** | **F3-06** |
| **SLICE** | **6 — Account / fund configuration UI** |
| **TITLE** | Account / fund / category settings UI |
| **PRIMARY OWNER** | **GROKBOT BUILDER** |
| **SUPPORT OWNER** | Astra (semantics) + Daybreak Blue (RLS) |
| **EXACT OBJECTIVE** | Settings lists: account list / create / archive; default unrestricted/general fund; flat categories; system defaults + org-custom; archiveable. **No balance editing.** Cannot change account currency in place. Inactive/archived accounts are not offered as **new-post** custody targets (see test **N**). |
| **EXPECTED FILE/DOMAIN SCOPE** | **Builder:** settings routes/components under `src/app/[locale]/(dashboard)/dashboard/` (new finance-settings surface or extension of existing settings — **do not** overload contribution-record as the account editor); `messages/en.json` + `messages/fr.json` via `t()` only. **Astra:** reviews ACCOUNT vs FUND vs CATEGORY copy and measures. **Daybreak:** RLS on config tables; group scope. |
| **SCHEMA IMPACT** | **None** if F3-01 already has tables. Builder does not author migrations. |
| **SECURITY IMPACT** | **Medium.** Cross-group account/fund use forbidden. Balances remain not client-writable. |
| **USER/UX IMPACT** | Settings lists only. Mobile-first. Dark mode. No debit/credit jargon. |
| **DEPENDENCIES** | F3-01 constraints. **After** F3-05 opening-cash proof (slice order). Projection proof F3-03 so the UI cannot pretend a typed total is truth. |
| **MUST-PASS TESTS** | Cannot edit authoritative totals. Cannot change currency in place. Category ≠ account ≠ fund ≠ project. Test **N** (inactive account not selectable for new posts; historical rows remain visible). i18n keys in EN+FR. |
| **OUT-OF-SCOPE** | Chart-of-accounts builder; arbitrary posting builder; fund-reallocation UI; Record Transaction (F3-07). |
| **HANDOFF SHA REQUIREMENT** | Builder SHA. Astra semantics ACK + Daybreak RLS ACK on that SHA. |
| **REVIEW GATE** | Builder + Astra + Daybreak. |

### 5.7 F3-07 — Record Transaction UX

| Field | Freeze |
|---|---|
| **ID** | **F3-07** |
| **SLICE** | **7 — Record Transaction UX** |
| **TITLE** | Record Transaction UX (manual Money In / Money Out / Transfer) |
| **PRIMARY OWNER** | **ASTRA** |
| **SUPPORT OWNER** | GrokBot Builder only if Chief later delegates a bounded UI slice |
| **EXACT OBJECTIVE** | Treasurer UX per F2 §6.3 **after** F3-03 proof. Same-currency transfer only. No debit/credit copy. Confirm account + fund before post. Calls **only** the F3-02 server command. Always-shown and conditional fields as frozen. Auto-defaults: group, epoch, account currency, today, General Fund, last valid account. |
| **EXPECTED FILE/DOMAIN SCOPE** | **Astra:** new record-event surface (do **not** silently reuse `src/app/.../contributions/record/page.tsx` as the org ledger writer — that page remains the dues subledger recorder until F4). Planned `src/app/[locale]/(dashboard)/dashboard/finances/record/` (or equivalent) + client that invokes the RPC. i18n EN/FR. `PermissionGate` / `RequirePermission` on `finances.manage`. `formatAmount()` for all money. |
| **SCHEMA IMPACT** | **Low.** Uses posting command. |
| **SECURITY IMPACT** | **Medium.** Must call server command only. Hidden button ≠ allowed write. |
| **USER/UX IMPACT** | **High.** Mobile-first record flow. No user-facing Transaction object distinct from Financial Event. |
| **DEPENDENCIES** | F3-02, F3-03 **passed**, F3-04, F3-05, F3-06 (accounts/funds exist to pick). |
| **MUST-PASS TESTS** | Transfer excluded from SoA-lite. Cross-currency transfer rejected (test **J**). Always-shown fields present. Strings through `next-intl`. Inactive account not offered (test **N**). |
| **OUT-OF-SCOPE** | Debit/credit UX; posting-line builder; dues payment recorder rewrite; loan/Njangi product UI. |
| **HANDOFF SHA REQUIREMENT** | Astra SHA. |
| **REVIEW GATE** | Astra. Chief UX spot-check optional. |

### 5.8 F3-08 — Core reporting UI

| Field | Freeze |
|---|---|
| **ID** | **F3-08** |
| **SLICE** | **8 — Core reporting UI** |
| **TITLE** | Core reporting UI (balances, register, SoA-lite) |
| **PRIMARY OWNER** | **ASTRA** |
| **SUPPORT OWNER** | GrokBot Builder **if delegated** by Chief |
| **EXACT OBJECTIVE** | Officer UI for ACCOUNT BALANCE, FUND CASH, cashbook/register, SoA-lite from the F3-03 engine. Member own-statement without `finances.view` (P1-F). PermissionGate on record/reverse wiring (`finances.manage`). Exports match the same projection (`formatAmount()`). |
| **EXPECTED FILE/DOMAIN SCOPE** | **Astra (or delegated Builder):** finance report/register pages under dashboard finances; reuse existing reports permission pattern (`finances.view` / `finances.manage`). **Do not** treat `payments.amount` / `amount_paid` as org income. EN/FR i18n. |
| **SCHEMA IMPACT** | **None** beyond F3-03. |
| **SECURITY IMPACT** | **Medium.** P1-F read matrix. Group SoA requires `finances.view`. Own statement does not. |
| **USER/UX IMPACT** | Foundational reporting only — not the F6 catalog. |
| **DEPENDENCIES** | F3-07 (record path exists so officers can produce data) + F3-03 engine + F3-09 not required to **start** UI, but A–O must still pass at F3-09. |
| **MUST-PASS TESTS** | UI totals = engine totals for the same projection. Transfers absent from SoA-lite. Correction inclusion visible. Member without view sees only self. |
| **OUT-OF-SCOPE** | Full report catalog (F6). Financial Health complete catalog. Parent FX. Budgets. Period close. |
| **HANDOFF SHA REQUIREMENT** | Astra (or Builder) SHA. |
| **REVIEW GATE** | Astra; Daybreak read-RLS spot-check. |

### 5.9 F3-09 — Full acceptance matrix

| Field | Freeze |
|---|---|
| **ID** | **F3-09** |
| **SLICE** | **9 — Full acceptance matrix** |
| **TITLE** | Isolated-environment invariant proof (USD story + tests A–O + currency buckets) |
| **PRIMARY OWNER** | **GROKBOT BUILDER** (fixtures **under Astra**) |
| **SUPPORT OWNER** | Chief QA later; Daybreak security spot-check |
| **EXACT OBJECTIVE** | Prove F2 §27.4 USD foundation **and** this freeze’s tests **A–O** (which subsume F2 §27.5 tests 1–12) plus Branch B XAF isolation. Tiny validation bridge OK. No wholesale F4/F5. |
| **EXPECTED FILE/DOMAIN SCOPE** | **Builder under Astra fixtures:** `tests/finance/f3-acceptance/` (or equivalent) + seed fixtures for General + Restricted funds, Bank + Cash USD, Branch B XAF. **No production data.** Daybreak reviews that fixtures cannot leak across tenants. |
| **SCHEMA IMPACT** | **None** beyond test fixtures. |
| **SECURITY IMPACT** | **Medium** if fixtures leak. Isolated environment only. |
| **USER/UX IMPACT** | None required. |
| **DEPENDENCIES** | F3-07–F3-08 UI + F3-05 opening + F3-04 correction + F3-02 command + currency foundation from F3-01. |
| **MUST-PASS TESTS** | **All of A–O.** North-star arithmetic in §8.2 is the **design proof** F3–F6 must remain able to satisfy; F3-09 **must** pass §8.1 USD foundation numbers. F4/F5 complete contribution/loan/relief/project **product** legs later. |
| **OUT-OF-SCOPE** | F4 dues integration; F5 module rewrites; F6 catalog; merge to `main`; production cutover. |
| **HANDOFF SHA REQUIREMENT** | Builder names fixture SHA. **Chief QA later pins that exact SHA.** Daybreak security spot-check on the same SHA. |
| **REVIEW GATE** | Astra fixture review + Chief QA + Daybreak spot-check. This is F3 **candidate PASS**, not a founder-bypass of HOLD on F3-01. |

---

## 6. Old T01–T12 → F3-01–F3-09 crosswalk

F2 §26 catalog IDs remain historical. **Execution uses F3-01–F3-09.**

| Old ID | Disposition | New ticket |
|---|---|---|
| F3-T01 foundation defs/constraints | **Absorbed** | **F3-01** |
| F3-T02 schema half | **Absorbed** | **F3-01** |
| F3-T02 settings UI half | **Absorbed** | **F3-06** |
| F3-T03 semantics half | **Absorbed** | **F3-01** |
| F3-T03 CRUD UI half | **Absorbed** | **F3-06** |
| F3-T04 + F3-T05 combined | **Remains one unit** | **F3-02** |
| F3-T06 correction | **Renumbered** | **F3-04** |
| F3-T07 Record Transaction | **Renumbered** | **F3-07** |
| F3-T08 engine half | **Renumbered** | **F3-03** |
| F3-T08 UI half | **Absorbed** | **F3-08** |
| F3-T09 server auth half | **Absorbed** | **F3-01** |
| F3-T09 UI wiring half | **Absorbed** | **F3-08** |
| F3-T10 currency/epoch foundation | **Absorbed** | **F3-01** |
| F3-T10 full matrix | **Absorbed** | **F3-09** |
| F3-T11 opening cash F3 half | **Renumbered** | **F3-05** |
| F3-T11 F4/F7 half | **Remains later** | Not F3 |
| F3-T12 integrated proof | **Absorbed** | **F3-09** |

---

## 7. Dependency graph and owner map

### 7.1 Dependency graph

```
                    [FOUNDER AUTH]
                          |
                          v
                       F3-01  Daybreak Blue     SLICE 1
                          |
                          v
                       F3-02  Astra + Daybreak  SLICE 2  (one unit)
                          |
                          v
                       F3-03  Astra             SLICE 3  (blocks F3-07)
                         / \
                        v   v
                   F3-04     F3-05              SLICES 4–5
                   Astra     Astra
                        \   /
                         v v
                       F3-06  Builder           SLICE 6
                          |
                          v
                       F3-07  Astra             SLICE 7
                          |
                          v
                       F3-08  Astra (+Builder?) SLICE 8
                          |
                          v
                       F3-09  Builder / Astra   SLICE 9
                              Chief QA pins SHA
```

### 7.2 Owner map

| Owner | Owns | Does not own |
|---|---|---|
| **DAYBREAK BLUE** | Foundation migrations; RLS; `SECURITY DEFINER` + `search_path = ''` RPC **shells**; locks; unique constraints; deny-by-default writes; authz helpers; view invoker mode | Posting economic templates; Record Transaction UX; settings UI copy; acceptance fixture authorship |
| **ASTRA** | Posting templates / classifications; projection engine; correction semantics; opening-cash semantics; Record Transaction UX; core reporting UI (unless delegated) | Applying DEFINER migrations; simultaneous edit of Daybreak migration files |
| **GROKBOT BUILDER** | Account/fund/category settings UI (F3-06); F3-09 fixtures under Astra | Foundation migrations; DEFINER functions; inventing new ledger semantics |
| **GROKBOT CHIEF** | Orchestration; later independent QA; SHA pinning; release gates | Implementing F3 tickets in this freeze |
| **Founder** | Authorization to start F3-01; authorization of product base successor | — |

### 7.3 Collision prevention (Chief freeze)

1. **Daybreak owns** foundation migrations and DEFINER function **files**.
2. **Astra owns** posting templates, projections, and UX **files**.
3. **Never simultaneous edit** of the same migration or the same DEFINER function.
4. If a template must live in SQL next to a DEFINER function, Astra delivers the fragment; Daybreak is the only pusher of that migration.
5. Builder does not author F3 migrations.
6. Later QA **pins the exact handoff SHA**. Reviews of “the branch” without a SHA are invalid.
7. One agent, one file set, one SHA per handoff.

---

## 8. Acceptance matrix

### 8.1 F3 USD foundation story (founder brief — exact numbers)

F3 must prove this isolated USD walk **before** F4/F5. Use **General Fund** and one **Restricted Fund** fixture. Venue is posted to the **Restricted** fund so restricted-cash is 250 without a fund-reallocation UI.

| Step | Action | Fund | Notes |
|---|---|---|---|
| F3-0 | Open Bank **10,000** | General | Custody vs opening-position control. **Not income.** |
| F3-1 | Donation **+500** to Bank | Restricted | Income 500 at this instant |
| F3-2 | Venue **−200** from Bank | Restricted | Expense 200 |
| F3-3 | Transfer **1,000** Bank → Cash | General | Account transfer; fund preserved; **not SoA** |
| F3-4 | Correct donation **500 → 450** | Restricted | Original +500, reversal −500, replacement +450 |

**Final (all committed postings, including the reversed original):**

| Measure | Expected |
|---|---|
| Bank | **9,250** |
| Cash | **1,000** |
| Total cash held | **10,250** |
| SoA income | **450** (`500 − 500 + 450`) |
| SoA expense | **200** |
| General Fund cash | **10,000** (Bank General 9,000 + Cash General 1,000) |
| Restricted Fund cash | **250** (Bank Restricted `500 − 200 − 500 + 450`) |

Bank arithmetic: `10000 + 500 − 200 − 1000 − 500 + 450 = 9250`.

Excluding the original donation yields the **wrong** Restricted cash and the **wrong** income.

### 8.2 North-star USD design proof (F3–F6 must remain able to satisfy)

F3-09 **need not** productize loan/relief/project/dues modules. It **must** keep the journal capable of the F3-12/F2 §4.4 fixtures. These figures are the longer design proof (F2 §27.3). The previous 20,550 Bank figure is **withdrawn**.

| Check | Expected (USD Branch A after A0–A10) |
|---|---|
| Bank | **20,750** |
| Cash | **700** |
| Total cash held | **21,450** |
| SoA income | **3,000** (contribution 2,000 + donation 1,000) |
| SoA expense | **1,250** (venue 500 + reimbursement 100 + relief 400 + project 250) |
| Operating result | **1,750** |
| Outstanding loan principal | **800** (1,000 disbursed − 200 repaid) |
| Remaining opening dues AR | **1,000** (3,000 − 2,000 collected) — **subledger only** |

Cash identity:

- Bank: `20000 + 2000 + 1000 − 500 − 300 − 1000 + 200 − 400 − 250 = 20750`
- Cash: `500 − 100 + 300 = 700`
- Total cash: `20750 + 700 = 21450`

Compatible derivation: `20,500 opening cash + 1,750 operating result − 800 net lending = 21,450 cash`.

Parent / HQ shows **separate currency buckets**. There is no USD+XAF net.

### 8.3 Tests A–O (mandatory at F3-09; shapes reused earlier)

F2 §27.5 tests 1–12 are **subsumed**. Letters are the execution IDs.

| ID | Test | Must prove | Earliest ticket |
|---|---|---|---|
| **A** | Idempotency | Identical key + identical payload returns the original event; one posting set. Authz revalidated on replay. | F3-02 |
| **B** | Conflict | Identical key + different payload **CONFLICTS / FAILS**. | F3-02 |
| **C** | Concurrent correction | Two concurrent reversals of the same target: one succeeds; the second fails. At most one reversal per target. | F3-04 |
| **D** | Atomic fail | Forced mid-command failure leaves **zero** posted events/postings. | F3-02 |
| **E** | Member deny | Ordinary member cannot mutate the group ledger. | F3-01 helpers / F3-02 |
| **F** | Inactive membership deny | Inactive membership cannot post even with a historical role. | F3-01 / F3-02 |
| **G** | Cross-group deny | Caller cannot post into another group's accounts, funds, or events. | F3-01 / F3-02 |
| **H** | Manager ok | Active `finances.manage` posts successfully **through the RPC**. | F3-02 |
| **I** | XAF bucket | Branch B XAF totals never net into the USD bucket. Parent shows buckets only. | F3-09 (foundation columns in F3-01) |
| **J** | Cross-currency deny | Ordinary transfer across currencies is **rejected**. | F3-02 / F3-07 |
| **K** | Historical correction dates | Reversal may keep original `occurred_at`; replacement uses the intended corrected date; `corrected_at` is audit only. | F3-04 |
| **L** | Loan / liability fixtures | Loan-disburse / principal-repay / interest and Njangi contribute / payout post **without** turning principal or Njangi into operating income/expense (F2 §4.4). **Not** a loan/Njangi product. | F3-02 templates + F3-09 |
| **M** | Reversal inclusion | Donation corrected 500 → 450: projections keep **+500 − 500 + 450 = 450**, not −50. Matches §8.1 SoA income **450**. | F3-03 / F3-04 |
| **N** | Inactive account visibility | Inactive/archived custody accounts are **not selectable** for new Money In / Out / Transfer / Opening posts. Historical events that used that account **remain visible** on register / drilldown. Officers cannot “hide history” by inactivating an account. Inactive ≠ deleted. | F3-06 / F3-07 / F3-08 |
| **O** | USD foundation numbers | Isolated walk in §8.1 yields Bank **9,250**, Cash **1,000**, total cash **10,250**, SoA income **450**, SoA expense **200**, General Fund cash **10,000**, Restricted Fund cash **250**. Opening cash is not period income. Transfer is not SoA. Restricted attribution does not double cash. | F3-09 (legs from F3-02–F3-05) |

---

## 9. First implementation ticket — F3-01 (not authorized)

**F3-01 is the only next founder-authorization target.** Daybreak Blue is the primary owner. This section is **prompt-ready scope** for a later authorized product agent. **It does not authorize execution.**

### 9.1 Prompt-ready scope summary (copy after founder says GO)

```
AUTHORIZED LATER — DO NOT RUN FROM THE TICKET FREEZE ALONE.

Repo: https://github.com/gatekipa/villageclaq
Create product branch: codex/f3-core-ledger-foundation
Base EXACTLY from PRODUCT SHA 99e17e2b4f4dc16753843f1e115312e70a8ae8ca
  (or a founder-named authorized successor).
Do NOT base on docs/f2-financial-domain-design-20260908.
Do NOT base on this ticket-freeze branch.
Do NOT amend F2 or the PRD.

Implement ONLY ticket F3-01 from
docs/VILLAGECLAQ_F3_CORE_LEDGER_TICKET_FREEZE.md
Owner: DAYBREAK BLUE.
Support: Astra review of conceptual fields — Astra does not author migrations.

In scope:
- Conceptual tables: financial_events, postings, custody accounts, funds,
  categories, fixed control accounts (income, expense, opening-position,
  receivable, liability).
- §4.3 check constraints; debit-positive signed amounts; append-only posted
  meaning; P1-B unique key shape
  (group_id, source_module, source_record_id, effect_kind, ledger_epoch).
- Account: single currency, immutable after open, group scope, lifecycle.
- Fund vs account independence; default unrestricted/general.
- Epoch/currency columns; one-event-one-currency; same-currency transfer
  constraint hooks.
- RLS deny-by-default authenticated writes on events/postings/balances (P1-A).
- SECURITY DEFINER helpers with search_path='' for group scope, active
  membership, finances.manage, P1-F read helpers — NOT the full posting
  template / idempotent ship (that is F3-02).
- F0 test-tenant classification = migration gate only; not a runtime skip.

Out of scope:
- Posting command body + idempotent ship (F3-02, one unit).
- Projection engine (F3-03), correction RPC (F3-04), opening UX (F3-05),
  settings UI (F3-06), Record Transaction (F3-07), reporting UI (F3-08),
  acceptance matrix (F3-09).
- Dues AR journal, loan/Njangi product, standing changes, FX, importers.

Handoff: name the exact SHA. Do not start F3-02 until that SHA is accepted.
```

### 9.2 Authorization checkbox (founder only)

- [ ] Founder authorizes F3-01 execution  
- [ ] Product base confirmed as `99e17e2b…` or named successor ________  
- [ ] Branch `codex/f3-core-ledger-foundation` may be created  
- [ ] Daybreak Blue is the only migration author for F3-01  

Until these are checked **outside this document**, status remains HOLD.

---

## 10. What this freeze explicitly does not do

| Forbidden in this action | Status |
|---|---|
| Modify F2 design artifact | **Not done** |
| Modify PRD | **Not done** |
| Modify product code / migrations / `package.json` / tests | **Not done** |
| Modify F0 branch | **Not done** |
| Create `codex/f3-core-ledger-foundation` | **Not done — planned name only** |
| Implement F3-01 … F3-09 | **Not done** |
| Merge to `main` | **Not done** |
| Authorize Daybreak to start | **Not done** |

---

## 11. Freeze close

| This document freezes | This document does not do |
|---|---|
| F3-01 … F3-09 ticket catalog, slices 1–9, owner map, collision rules, tests A–O, USD numbers, F3-01 prompt-ready scope | Application code |
| Pointers to F2 SHA `a13b5e6c…`, PRODUCT SHA `99e17e2b…`, PRD SHA `aa470c9…` | SQL migrations |
| P1-A–H **unchanged** | Security pin edits |
| Planned product branch name | Creating that branch |
| HOLD status | Founder authorization |

**Next authorized action (founder):** authorize F3-01 for Daybreak Blue on product base `99e17e2b…` (or named successor), creating `codex/f3-core-ledger-foundation` at that time.

*End of F3 ticket freeze. Implementers wait. They do not start.*
