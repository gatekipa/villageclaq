# S0 Cut 2 Bounded Remediation — 2026-09-11

**Branch:** `security/s0-p0b-cut2-implementation-20260911` (same; PR #78 DRAFT only)  
**Contract SHA (unreopened):** `5c3c1cce458cd13f9525eb21c6366f8877d3c51d`  
**Previous functional SHA under HOLD:** `2e22dfd888c86c6d1c66c206fe5a5b0f35c7ac65`  
**00115 digest (unchanged):** `d196b89cefaa91d63fabf6f10ffb73e57b6762ef45d3ac1d93a28279e771706c`  
**PR #77:** OPEN DRAFT UNMERGED — not altered.

## Verdict

**PASS** for the bounded remediation (A/B/C only).  
**PRODUCTION DEPLOY NOT AUTHORIZED.**  
**00115 PRODUCTION APPLY NOT AUTHORIZED.**  
**NO REAL SENDS.**  
**NO MERGE.**

## A — Direct email provider bypass

- `POST /api/email/send` → **410 GONE**. Does not send, invoke Resend, call `sendEmail`, accept caller recipient/template/data, or enqueue arbitrary payloads.
- Every `/api/email/send` caller inventoried: `unknown_email_callers = 0`.
- Legitimate email maps only to frozen ALLOW types: `payment_receipt`, `payment_reminder`, `welcome`, `event_reminder`, `member_invitation`, `minutes_published`.
- Invitation email now semantic-enqueues `member_invitation` (recipient = `invitations.email`). Email-only invitations no longer skip.
- Standing / notify-client generic emails removed (EMAIL DENY or no honest type).
- Provider-level email send = **drain only**. Helpers: `src/lib/send-email.ts`, `src/lib/resend.ts`.
- New scripts (original 15 untouched): `test-s0-cut2-email-send-410.mjs`, `test-s0-cut2-email-drain-only.mjs`. **17/17 PASS.**

## B — Notification regressions

- Historical suite (15 producer files + drain render): **186 tests, 186 PASS, 0 FAIL**.
- Obsolete queue-shape / raw 23505 / “keep email-SMS direct” asserts replaced with semantic enqueue + trusted drain rendering.
- True fixes: invitation email-only enqueue; drain locale + invitation acceptUrl + FR invitee/standing; reason/location fallbacks; payment-reminder Node 20 `.ts` transpile.
- Duplicate: `result='duplicate'` + same trusted `queue_id`; no legacy NULL; mismatch unchanged.
- Channel matrix not weakened: loan overdue / member invitation / election SMS stay DENY.

## C — Disposable DB portability

- `CUT2_DISPOSABLE_DATABASE_URL` first.
- Else detect local `psql`.
- Else fail with the exact export in `S0_CUT2_DISPOSABLE_REHEARSAL_20260911.md`.
- No unconditional `sudo -u postgres`. Optional `sudo -n` only if already passwordless.
- Production host rejected.

## Explicit non-actions

- 00115 not edited. Layer B / RPC / provenance / 17 WA indexes / canonical idempotency / channel allowlist / proxy auth / SMS 410 / WhatsApp 410 / Cut 2 prod rollout not reopened.
- No 23rd notification type.
- `announcement-producer.ts` remains DORMANT.
- `llbnliixczcqfftxpsmb` untouched (migrations remain 29; 00115 absent in prod).

## Next gate

Daybreak BLUE re-review at the new functional SHA. Do not merge, deploy, or apply 00115.
