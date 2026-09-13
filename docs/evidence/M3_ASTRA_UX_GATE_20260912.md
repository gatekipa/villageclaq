# M3 ASTRA UX GATE — 2026-09-12 (READ-ONLY)

**Status: ASTRA GATE NOW DUE**

| Marker | State |
|---|---|
| ACTIVE | Yes — this gate is the live UX constraint for M3 |
| S0 COMPLETE | Yes — Cuts 1–3 on current main `d83d13d4…` |
| ASTRA GATE NOW DUE | **Yes** — must constrain F3-06 / F3-07 / F3-08 before those tickets start |
| F3-06 / F3-07 / F3-08 product UI | **NOT IMPLEMENTED** — this document does not ship those tickets |
| §10 measurable acceptance | **DOCUMENTED CONSTRAINT ONLY** — binds future F3-06/07/08; none of the IDs below are claimed PASS |

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
9. Future F3-06/07/08 implementations must meet **§10 measurable acceptance** (keyboard, focus, AT, contrast, touch, desktop/responsive tables, FR expansion, translated states, journey coverage, dual-viewport evidence). §10 is a **constraint catalog**, not a claim that any of those tickets exist.

---

## 9. Gate result

| Question | Answer |
|---|---|
| Can F3-06 start without this gate? | **No** — IA/naming collisions would ship the wrong mental model |
| Does current UI already satisfy F2 Record Transaction? | **No** |
| Does current reports hub satisfy F3-08? | **No** |
| Is F3-06 implemented in this package? | **No** — planning/evidence only |
| Can F3-06/07/08 ship without §10 PASS? | **No** — each ticket’s implementation PR must attach AX-EVID evidence for the IDs that apply to it |
| Status | **ASTRA GATE NOW DUE** — Founder/Astra accept these constraints (IA + §10) before F3-06 implementation |

---

## 10. Measurable acceptance criteria (future F3-06 / F3-07 / F3-08)

**This section does not implement F3-06, F3-07, or F3-08.** It is the testable UX contract those tickets must satisfy later. Every ID is `NOT RUN` until a future implementation PR attaches evidence. Vague “accessible / responsive / bilingual” claims are **not** sufficient.

Cross-link: `docs/M3_F3_REQUALIFICATION_20260912.md` §R17.

### 10.0 How to score

| Term | Meaning |
|---|---|
| **PASS** | Every numbered check in the ID is observed on the listed viewports, locales, and themes; artifacts exist in the implementation PR |
| **FAIL** | Any numbered check fails, or evidence is missing for a required viewport/locale/theme |
| **NOT RUN** | Current state of every ID in this package (no F3-06/07/08 UI) |
| **Applies** | Ticket that must close the ID. Shared IDs must PASS on each listed ticket’s surfaces |

**Required evidence matrix (AX-EVID) — collected on the future implementation PR, not this run:**

| Artifact | Required? | Pass rule |
|---|---|---|
| Desktop screenshot set | Yes | **1280×800** light + dark, `en` + `fr` |
| Mobile screenshot set | Yes | **375×812** light + dark, `en` + `fr` |
| Edge-width smoke | Yes | **320×568** and **1440×900** — no clipped primary CTA, no app-chrome horizontal scroll |
| Keyboard-only log or recording | Yes | Completes the ticket’s critical path with Tab / Shift-Tab / Enter / Space / Escape only |
| Contrast table | Yes | Tool + computed pair + ratio for body text, muted text, primary button, destructive text, focus ring vs adjacent background (light and dark) |
| AT log | Yes for F3-07; recommended F3-06/08 | NVDA **or** VoiceOver **or** TalkBack: name, role, error, and status spoken for the critical path |
| String-key audit | Yes | Every user-visible string on the surface exists in `messages/en.json` **and** `messages/fr.json`; zero hardcoded English |

If desktop evidence exists and mobile does not (or the reverse), the ID is **FAIL**.

---

### AX-KBD — Keyboard-only operation and logical focus order

**Applies:** F3-06, F3-07, F3-08  
**Standard:** WCAG 2.2 Success Criteria 2.1.1 Keyboard, 2.1.2 No Keyboard Trap, 2.4.3 Focus Order

| # | Measurable check | Fail if |
|---|---|---|
| K1 | Every interactive control on the ticket surface is reachable with **Tab** / **Shift-Tab**. Count of mouse-only controls = **0**. | Any create/archive/post/filter/export control is unreachable from the keyboard |
| K2 | **Enter** or **Space** activates the focused button / submit control. Select/combobox opens with Enter/Space and closes with Escape. | Activation requires a pointer |
| K3 | **Escape** closes the open dialog/sheet and does not navigate away from the page. | Escape is a no-op or unloads the route |
| K4 | Focus order matches visual reading order: top→bottom, then start→end within a row (LTR). Documented exception only for a skip-to-main link that is first in DOM. | Tab jumps backwards, skips a visible field, or lands on a visually hidden control before its label |
| K5 | No accidental keyboard trap on the page. The only allowed trap is an **intentional** modal trap (see AX-FOCUS). | Tab cannot leave a non-modal widget |
| K6 | Critical path completes keyboard-only: **F3-06** create + archive one account/fund/category; **F3-07** Money In confirm+post (or blocked validation); **F3-08** set scope/period and read one report including first money cell. | Path requires hover, drag, or a pointer-only icon |

---

### AX-FOCUS — Focus placement, restoration, and modal containment

**Applies:** F3-06 (create/archive dialogs), F3-07 (confirm step + recovery dialogs), F3-08 (filter/export dialogs if present)  
**Standard:** WCAG 2.2 2.4.3, 2.4.7, 2.4.11; APG dialog pattern

| # | Measurable check | Fail if |
|---|---|---|
| F1 | On dialog/sheet open, `document.activeElement` is inside the dialog within **1** animation frame after open (first focusable control **or** the element labelled by `aria-labelledby`). | Focus remains on the trigger or moves to `<body>` |
| F2 | While the dialog is open, Tab / Shift-Tab cycle **only** among focusable nodes inside `[role="dialog"][aria-modal="true"]` (or equivalent Base UI popup). Query: after 2× Tab-from-last and 2× Shift-Tab-from-first, `activeElement` is still inside the dialog. | Focus escapes to the page or sidebar |
| F3 | On dismiss (Escape, Cancel, overlay if overlay-dismiss is enabled), focus returns to the **same** trigger node that opened the dialog. | Focus is lost or jumps to the document start |
| F4 | After a validation failure on submit, focus moves to the **first** control with `aria-invalid="true"`. | Focus stays on Submit or jumps to a toast only |
| F5 | After F3-06 archive/create success, focus lands on the updated list (new row, or next remaining row if archived). After F3-07 **uncertain-result** recovery UI opens, focus is inside that UI (F1). | Focus lost after mutation |
| F6 | Background page content is `inert` or `aria-hidden="true"` while the modal is open (no extra Tab stops behind the overlay). | Sidebar / page fields remain tabbable |

---

### AX-SR — Screen-reader names, instructions, validation, status

**Applies:** F3-06, F3-07, F3-08  
**Standard:** WCAG 2.2 1.3.1, 3.3.1, 3.3.2, 4.1.2, 4.1.3

| # | Measurable check | Fail if |
|---|---|---|
| S1 | Every input/select/button has an accessible name: visible `<label for>` / `htmlFor`, or `aria-label` / `aria-labelledby`. axe/accessible-name query returns non-empty for 100% of those nodes. | Icon-only control without `sr-only` / `aria-label` (including dialog close) |
| S2 | Helper/instruction text that is required to complete the field is referenced by `aria-describedby` on that field (F3-07 amount, currency, custody account, fund; F3-06 currency-immutable note). | Instruction is visual-only |
| S3 | On validation fail, the invalid control has `aria-invalid="true"` and its error node id is in `aria-describedby`. Error text is the `t()` string, not a raw RPC dump. | Error exists only as a toast / color change |
| S4 | Loading / success use `aria-live="polite"` (or `role="status"`). Commit **failure** and **uncertain-result** use `aria-live="assertive"` (or `role="alert"`). Announcement includes the `t()` sentence, not an empty live region. | Status is visual-only; or success is announced before the RPC returns (violates UX-002) |
| S5 | Dialogs expose `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing at the visible title. Confirm-account+fund (F3-07) speaks **both** account name and fund name before the commit control. | Title-less dialog; confirm step is visual-only |
| S6 | F3-08 report chrome announces scope, period/as-of, native currency, and source/observation state as text (not color alone). Money cells have a text name that includes `formatAmount()` output. | Totals conveyed only by chart color |

---

### AX-CONTRAST — Contrast and visible focus

**Applies:** F3-06, F3-07, F3-08 (light **and** dark)  
**Standard:** WCAG 2.2 1.4.3 AA, 1.4.11 AA, 2.4.7, 2.4.11, 2.4.13

| # | Measurable check | Fail if |
|---|---|---|
| C1 | Body / label / table-cell text vs its immediate background ≥ **4.5:1**. Large text (≥18pt or ≥14pt bold) ≥ **3:1**. Measure computed pixels, not token names. | Any muted-on-card pair used as essential text < 4.5:1 |
| C2 | Primary button label vs primary fill ≥ **4.5:1**. Destructive text vs its background ≥ **4.5:1**. | White-on-emerald or error-on-card fails the ratio |
| C3 | Non-text UI (input border vs field, checked switch, selected tab) ≥ **3:1** against adjacent background. | Selected state distinguishable only by a <3:1 tint |
| C4 | Keyboard focus indicator is visible in **light and dark**. Minimum: 2 CSS px ring (platform already uses `focus-visible:ring-3`) **and** ≥ **3:1** vs adjacent background. `outline-none` without a replacement ring is forbidden on F3 controls. | `:focus-visible` is clipped, `ring/50` disappears on the surface, or mouse-only outline |
| C5 | Focus is not entirely hidden (`2.4.11`): the focused control’s focus box is not covered by the sticky F3-07 CTA, sidebar, or header. | Sticky action covers the focused field |

---

### AX-TOUCH — Touch-target sizing

**Applies:** F3-06, F3-07, F3-08 at **375×812** and **320×568**  
**Standard:** WCAG 2.2 2.5.8 Target Size (Minimum); platform mobile-first law

| # | Measurable check | Fail if |
|---|---|---|
| T1 | Primary / destructive / confirm / retry / submit controls have a CSS hit box ≥ **44×44 px** (padding counts). F3-07 sticky post CTA is ≥ **44 px** tall and full content-width at 375px. | `h-7` / `h-8` / `size-6` used as the only hit box for a money command |
| T2 | Row actions on F3-06 lists (archive, overflow, edit) are each ≥ **44×44** **or** ≥ **24×24** with ≥ **8 px** spacing to the next target (2.5.8). Icon-sm (`size-7` = 28px) is allowed only if the extra hit padding meets 44px **or** the 24+8 exception. | Adjacent 28px icons with 0–4px gap |
| T3 | At 375px, no two distinct money actions overlap in the hit-test rectangle. | Overlapping tap targets |
| T4 | Checkbox / switch / radio used on these surfaces include the extended hit area already used by platform switch/radio (`after:-inset-*`) **or** an explicit 44px wrapper. | 16px radio as the only tap target |

---

### AX-DESKTOP — Desktop layouts

**Applies:** F3-06, F3-07, F3-08 at **1280×800** and **1440×900**

| # | Measurable check | Fail if |
|---|---|---|
| D1 | F3-06 Account / Fund / Category lists: names ≥ 12 characters remain on one line **or** wrap inside the card without overlapping the archive control. No horizontal page scroll. | Name collides with the action column |
| D2 | F3-07 form may use two columns at `md:` (≥768px). The **confirm account+fund** block stays one column and remains fully visible without hover (same rule as §4). | Confirm details hidden in a tooltip |
| D3 | F3-08 report header (scope, period/as-of, native currency, currency-bucket, source/observation, correction treatment, opening treatment) is visible **above the first data row** at 1280×800 without scrolling the page. | Labels only in a collapsed “more” that is closed by default |
| D4 | Sidebar remains the existing hamburger-at-mobile / desktop-sidebar pattern. F3 adds **no** second finance hamburger. | Nested finance nav drawer |
| D5 | Dark mode: every new F3 control has an explicit `dark:` treatment or uses tokens that already flip. Spot-check 10 controls; 10/10 must not be light-on-light. | Unstyled white card on `--background` dark |

---

### AX-TABLE — Responsive report / table behavior (F3-08 primary; F3-06 lists if tabular)

**Applies:** F3-08 required; F3-06 if it ships an HTML table; F3-07 N/A except receipt/history snippets

| # | Measurable check | Fail if |
|---|---|---|
| R1 | At 375px the **app chrome** does not horizontally scroll (`document.documentElement.scrollWidth === innerWidth` ± 1px). Tables live in `overflow-x-auto` with a visible fade/scrollbar affordance. | Whole page pans sideways |
| R2 | At 375px, either (a) card layout repeats identity + `formatAmount()` per row, or (b) the identity column is `position: sticky` and the first money column is reachable by in-table scroll. | Money values off-canvas with no identity context |
| R3 | `formatAmount()` strings are never truncated mid-digit (`text-overflow: ellipsis` forbidden on money cells). Full string visible at 375 and 1280. | `12 345… FCFA` |
| R4 | At 1280px, all **required** F3-08 columns for that report are visible without page-level horizontal scroll. In-table scroll is allowed only for optional columns, and those columns are listed in the ticket’s column spec. | Required cash/fund/SoA column missing until horizontal page pan |
| R5 | Header row stays visible (`sticky` thead) **or** is repeated at least every 20 body rows. | 50+ rows with no repeating header |
| R6 | Empty numeric cells render a locale-aware empty token (`t()`), not a raw `0` that could be read as “zero cash” unless the projection actually returned zero. Uncertain/loading cells do not show a forged `0`. | Skeleton replaced by `0 FCFA` before the RPC returns |

---

### AX-FR — French text expansion

**Applies:** F3-06, F3-07, F3-08 at **375×812** and **1280×800**, `locale=fr`

| # | Measurable check | Fail if |
|---|---|---|
| X1 | Layout is designed for **≥ 40%** width vs the English string (FR expansion budget). Buttons wrap to **≤ 2** lines; they never clip with `overflow: hidden` + nowrap. | FR label overflow, ellipsis mid-word, or overlapping neighbor |
| X2 | Longest expected FR strings must be used in the evidence set, including at least: account/fund/category settings titles; F3-07 “Enregistrer la transaction” (or the actual `t()` key); F3-08 “État des activités” / “Position nette du fonds” / “Livre de caisse”. | Evidence uses only short EN strings |
| X3 | Sticky F3-07 CTA and F3-06 primary actions remain fully tappable (AX-TOUCH) after FR wrap. | Wrapped FR pushes the hit box below 44px or off-screen |
| X4 | No hardcoded English remnant in FR locale (`html[lang="fr"]` walk of the surface: 0 English-only sentences in validation/confirm/failure/recovery). | Mixed EN error under FR UI |

---

### AX-I18N — Translated validation, confirmation, failure, recovery

**Applies:** F3-06, F3-07, F3-08  
**Platform law:** every string through `t()`; keys in **both** `messages/en.json` and `messages/fr.json` before use.

| State | Must exist as `t()` keys (EN+FR) | Measurable check |
|---|---|---|
| Validation | Required field, invalid amount, currency mismatch, archived account not selectable (test **N**), permission denied | Trigger each; screenshot + accessible error (S3) in **en** and **fr** |
| Confirmation | F3-07 account+fund confirm copy; F3-06 archive confirm | Visible names of account **and** fund; no debit/credit wording (F2 §6.3) |
| Failure | RPC reject, network fail, permission fail, idempotent replay conflict | Message is `t()`; no raw Postgres / stack string |
| Recovery | F3-07 lost-response / uncertain-result (UX-002); retry; dismiss | Recovery CTA labelled in both locales; does not say “success” |

| # | Extra check | Fail if |
|---|---|---|
| I1 | String-key audit: every state above has matching `en` and `fr` values; `fr` is real French, not a copy of `en`. | Missing key or `fr === en` for a sentence longer than 2 words (except proper nouns / `FCFA`) |
| I2 | SoA / cash-basis labels exist in both languages (D-002). | FR SoA labelled as accrual or “débets/crédits” |
| I3 | Locale switch on the same session updates the four states without a leftover English toast. | Cached EN toast after `locale=fr` |

---

### AX-JOURNEY — Loading, empty, failure, retry, uncertain-result

**Applies:** F3-06 (list/create), F3-07 (post path — **required**), F3-08 (each of the five foundational reports)

| Journey | Measurable pass | Fail if |
|---|---|---|
| **Loading** | Distinct loading UI (skeleton or labelled spinner) with accessible name (S4 polite). Primary submit **disabled**. No money figure rendered as authoritative. Duration of the state is observable in evidence (screenshot or filmstrip). | Blank page, or numbers shown from a stale cache without a “stale” label |
| **Empty** | Titled empty state via `t()` plus **one** next action (F3-06: create first account/fund/category; F3-08: change period / “no movements”). Not a raw empty `<table>`. | Empty white card; or a table header with zero explanation |
| **Failure** | Visible `t()` error; form values preserved; submit re-enabled; no ledger mutation claimed. | Form wiped; or success toast on error |
| **Retry** | Exactly one primary retry control. F3-07 retry **reuses the durable request id** (does not mint a second post). Clicking retry twice in 500ms results in **one** `post_financial_command` (or a visible idempotent replay, not a second Money In). | Double-post; retry hidden in a toast that expires < 5s |
| **Uncertain-result** | On timeout / offline / lost RPC response: UI must **not** show success. Must show the UX-002 uncertain copy + recover-by-request-id action. Offline: P-014 — no blind queue of a money command. | Optimistic “Posted” before RPC result; queued-offline post |

Each journey is a **named test case** on the future ticket (`AX-JOURNEY-06-empty`, `AX-JOURNEY-07-uncertain`, `AX-JOURNEY-08-fail`, …). A ticket that ships only the happy path is **FAIL** for this ID.

---

### AX-EVID — Desktop and mobile acceptance evidence

**Applies:** every F3-06 / F3-07 / F3-08 implementation PR  
**This requalification PR attaches zero of these artifacts** (no UI to photograph).

| # | Evidence pack | Minimum contents |
|---|---|---|
| E1 | Viewport pack | 320, 375, 1280, 1440 — each of light/dark × en/fr for the ticket’s critical path (**16** frames minimum per ticket if all combinations are required; 375 and 1280 are **mandatory**, 320 and 1440 may be smoke-only if called out) |
| E2 | Keyboard pack | Step log (focus target after each Tab) **or** a recording covering AX-KBD K6 |
| E3 | Contrast pack | Table of ≥ 8 measured pairs (C1–C4) in light and dark |
| E4 | AT pack | F3-07 required: confirm step speaks account+fund; validation error spoken; uncertain-result spoken. F3-06/08: at least one dialog + one status |
| E5 | Journey pack | One artifact each for loading / empty / failure / retry / uncertain-result (F3-07); loading / empty / failure / retry (F3-06, F3-08). Uncertain-result may be N/A on F3-06/08 **only** if that surface never calls `post_financial_command` |
| E6 | Explicit non-claim | Implementation PR states which AX IDs are PASS with links to artifacts. **Do not** treat this §10 catalog as PASS |

**Hold rule:** missing E1 desktop **or** missing E1 mobile ⇒ ticket cannot close, even if code review looks complete.

---

### 10.1 Ticket coverage map (constraint, not completion)

| ID | F3-06 | F3-07 | F3-08 | Status in this package |
|---|---|---|---|---|
| AX-KBD | Required | Required | Required | **NOT RUN — F3-06/07/08 not implemented** |
| AX-FOCUS | Required (dialogs) | Required (confirm + recovery) | Required if dialogs exist | **NOT RUN** |
| AX-SR | Required | Required | Required | **NOT RUN** |
| AX-CONTRAST | Required | Required | Required | **NOT RUN** |
| AX-TOUCH | Required | Required | Required | **NOT RUN** |
| AX-DESKTOP | Required | Required | Required | **NOT RUN** |
| AX-TABLE | If tabular | N/A (unless history table) | Required | **NOT RUN** |
| AX-FR | Required | Required | Required | **NOT RUN** |
| AX-I18N | Required | Required | Required | **NOT RUN** |
| AX-JOURNEY | Required | Required (incl. uncertain-result) | Required | **NOT RUN** |
| AX-EVID | Required to close ticket | Required to close ticket | Required to close ticket | **NOT ATTACHED** |

These IDs constrain future implementation. They are **not** evidence that F3-06 has started or shipped.
