# S0 Cut 2 Bounded Remediation — 2026-09-11 / drain-semantics fold 2026-09-12

**Branch:** `security/s0-p0b-cut2-implementation-20260911` (same; PR #78 DRAFT only)  
**Contract SHA (unreopened):** `5c3c1cce458cd13f9525eb21c6366f8877d3c51d`  
**Prior held functional SHA:** `45d9b4d2ea74e387c509d96db493c21ee1d86a59`  
**Prior evidence tip (erroneous 186/186 lived here):** `2a2b58f0599d0a438763873b4a61fe4d7c638c3a`  
**New functional SHA (code+test):** `3fccd4c18b77259f1f5bc3bb2997d353f43a64a5`  
**00115 digest (unchanged):** `d196b89cefaa91d63fabf6f10ffb73e57b6762ef45d3ac1d93a28279e771706c`  
**PR #77:** OPEN DRAFT UNMERGED — not altered.

## Verdict

**PASS** for the bounded trusted-drain semantics remediation (R1–R18 only).  
**PRODUCTION DEPLOY NOT AUTHORIZED.**  
**00115 PRODUCTION APPLY NOT AUTHORIZED.**  
**NO REAL SENDS.**  
**NO MERGE.**

## Evidence count correction

The prior docs-only tip incorrectly wrote **186/186**. That number was wrong.  
**Authoritative previous baseline:** **182 PASS / 0 FAIL** (15 producer files + 4 pre-existing drain-render tests).  
**This fold added 8 behavioral drain-render tests.**  
**New historical suite total:** **190 PASS / 0 FAIL**.  
Do not treat 186 as a baseline or a final total.

## This fold — trusted drain semantics

### R1–R3 Email 410 behavioral proof

`scripts/test-s0-cut2-email-send-410.mjs` now **invokes** exported `POST` and `GET` from `src/app/api/email/send/route.ts` (transpiled handlers, no network).

- Multiple hostile bodies including `{to, template, data}` attacker payloads.
- Every POST → HTTP 410. GET → HTTP 410.
- Spies prove **zero side effects**: `sendEmail=0`, Resend=0, enqueue=0, queue write=0, `fetch=0`.
- Source scan remains defense-in-depth only.
- Route stays 410 GONE. Provider email = trusted drain only.

### R4–R6 One date-rendering authority

`src/lib/cut2-drain-date.ts` is the only trusted-drain date helper.

- Accepts date or date-time + locale `en|fr`.
- Calendar-day from ISO date prefix; formats with `timeZone: "UTC"` (no host local TZ).
- **event_reminder:** localized weekday+long date on SMS/EMAIL/WA. Location TBA / lieu à confirmer preserved.
- **hosting_assignment / hosting_reminder / hosting_swap:** raw `assigned_date` localized at drain (`short` month, matches historical `Jul 15, 2030` / `juil`). Location fallback preserved. Domain date unchanged.

### R7–R9 loan_overdue authority

Drain no longer uses `loans.amount_approved` / `amount_requested` or nonexistent `loans.next_due_date` / `due_date`.

- Loads `loan_schedule` with producer unpaid statuses `pending|partial|overdue`, `due_date < envelope.reminderDate`, earliest due_date, first outstanding balance.
- Amount = installment outstanding; due date = localized installment due date (EN+FR).
- No outstanding installment, missing reminderDate, or blank required fields → **FAIL CLOSED** (`cut2_loan_overdue_*`). No provider call with blank/zero/misleading content.
- SMS remains empty / matrix DENY.

### R10–R12 subscription countdown

`Date.now()` removed from final content.

- `days` = calendar-day difference between `current_period_end` (date-only) and trusted envelope `reminderDate`.
- Same-day later drain, delayed hour, and non-midnight period end keep the same count.
- Missing `reminderDate` or period end → FAIL CLOSED.

### R13–R14 Required nonblank (flagged paths only)

Fail-closed when required authoritative values cannot be derived:

- event: group / name / date (location keeps TBA fallback)
- hosting: group / date (location keeps TBA fallback)
- loan overdue: group / installment amount / due date
- subscription: group / plan / countdown

Existing frozen location fallbacks kept. No unrelated type rewrite.

### R15–R16 New behavioral drain tests (real `renderCut2TrustedRow`)

All in `scripts/test-cut2-drain-render-regression.mjs`:

| Test | Result |
| --- | --- |
| event_reminder drain localizes EN/FR date across SMS/EMAIL/WA and keeps location fallback | PASS |
| event_reminder fail-closed when authoritative date is missing | PASS |
| hosting assignment/reminder/swap drain localizes EN/FR dates and location fallback | PASS |
| hosting fail-closed when assigned_date is missing | PASS |
| loan_overdue drain quotes earliest outstanding installment amount and localized due date | PASS |
| loan_overdue excludes paid/settled rows and fail-closes when none outstanding | PASS |
| subscription_expiring countdown uses trusted reminderDate, not drain wall-clock | PASS |
| subscription_expiring fail-closed without trusted reminderDate | PASS |

Prior four drain tests (invitation, fine/standing, location fallback, proxy email) remain PASS.

## Prior A/B/C remediation (still in force)

- `POST /api/email/send` → **410 GONE**.
- Email ALLOW stays: `payment_receipt`, `payment_reminder`, `welcome`, `event_reminder`, `member_invitation`, `minutes_published`.
- Provider-level email send = **drain only**.
- Historical producer remaps to `_cut2Enqueues`. Prior baseline **182/182**.
- Disposable harness: `CUT2_DISPOSABLE_DATABASE_URL` first; prod-ref reject; no unconditional sudo.

## Gates

- `npm run test:s0-cut2` → **17/17 scripts PASS** (21 node:test cases; email-send-410 is behavioral + zero-side-effect).
- Historical suite → **190/190 PASS, 0 FAIL** (prior 182 + 8 new drain tests).
- `npm run build` → **PASS**.
- Real sends = 0.

## Explicit non-actions

- 00115 not edited. Layer B / RPC / provenance / 17 WA indexes / canonical idempotency / channel allowlist / proxy auth / SMS 410 / WhatsApp 410 / Cut 2 prod rollout not reopened.
- No 23rd notification type.
- `announcement-producer.ts` remains DORMANT.
- `llbnliixczcqfftxpsmb` untouched (migrations remain 29; 00115 absent in prod).

## Next gate

Daybreak BLUE final read-only re-review at functional SHA `3fccd4c18b77259f1f5bc3bb2997d353f43a64a5`. Do not merge, deploy, or apply 00115.
