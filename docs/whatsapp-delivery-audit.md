# WhatsApp Delivery Audit

**Date:** 2026-06-07  
**Scope:** Static code audit plus local dry-run/build verification. No live WhatsApp message was sent.

## 1. Executive Summary

WhatsApp is **partially implemented** as its own channel, not as an SMS replacement. The app has Meta Cloud API template sending, type-to-template routing, EN/FR template payload builders, notification preferences, HTTP API dispatch, cron dispatch, and queue retry support.

The launch blocker was in the cron phone-resolution path:

- Migration `00081_dispatch_phone_rpcs.sql` intentionally changed `get_member_phones(p_group_id)` to require `is_group_admin()`.
- The same migration notes service-role cron callers should use raw server-side lookup instead.
- Four cron routes still called the now admin-gated RPC, so service-role cron runs could not resolve phone recipients for SMS/WhatsApp blasts.
- Payment and event reminder crons also fired `dispatchWhatsApp(...).catch(() => {})` without awaiting the provider call, so serverless execution could return before WhatsApp delivery finished and failures were invisible.

Applied fix: cron routes now use a server-only contact resolver, payment/event crons await WhatsApp work and report counts, WhatsApp logs mask phone numbers, queued WhatsApp sends persist provider message IDs when Meta accepts a retry, and the env example now documents the actual runtime variable names.

## 2. Current Architecture Map

### Channel Model

WhatsApp is a separate channel:

```
trigger
  -> getEnabledChannels()
  -> recipient email/phone lookup
  -> email / SMS / WhatsApp / in-app dispatch
  -> provider result or notification queue status
```

SMS remains Africa-only through `isAfricanPhoneNumber()` and `sendSmsNotification()`. WhatsApp remains global for any valid phone number through `formatPhoneForWhatsApp()`.

### Core WhatsApp Path

- Template definitions: `src/lib/whatsapp-templates.ts`
- Type routing: `src/lib/whatsapp-dispatcher.ts`
- Meta API client: `src/lib/send-whatsapp.ts`
- Authenticated HTTP route: `src/app/api/whatsapp/send/route.ts`
- Queue retry worker: `src/app/api/cron/drain-notification-queue/route.ts`
- Safe cron phone lookup: `src/lib/cron-member-contacts.ts`

### Trigger Inventory

| Trigger | Start file/function | Recipients | Channel choice | WhatsApp path | Status/error handling |
|---|---|---|---|---|---|
| Payment reminders | `src/app/api/cron/payment-reminders/route.ts` `GET` | overdue real members grouped by user | `getEnabledChannels(..., "payment_reminders")` | `dispatchWhatsAppWithResult("payment_reminder", ...)` | awaited; JSON includes `whatsappSent` / `whatsappFailed`; masked logs |
| Event reminders | `src/app/api/cron/event-reminders/route.ts` `GET` | event group members with email/phone | `getEnabledChannels(..., "event_reminders")` | `dispatchWhatsAppWithResult("event_reminder", ...)` | awaited; JSON includes WhatsApp counts |
| Hosting reminders | `src/app/api/cron/hosting-reminders/route.ts` `GET` | upcoming hosting assignments | `getEnabledChannels(..., "hosting_reminders")` | `dispatchWhatsApp("hosting_reminder", ...)` | awaited; best-effort route-level errors |
| Subscription reminders | `src/app/api/cron/subscription-reminders/route.ts` `GET` | group owner/admin billing contacts | `getEnabledChannels(..., "subscription_updates")` | `dispatchWhatsApp("subscription_expiring", ...)` | awaited; safe warning on failure |
| Scheduled announcements | `src/app/api/cron/send-scheduled-announcements/route.ts` | announcement audience | saved `channels` AND member prefs | `dispatchWhatsApp("announcement", ...)` | awaited; safe warning on failure |
| Queue drain | `src/app/api/cron/drain-notification-queue/route.ts` | queued `notifications_queue` rows | queue channel | `dispatchWhatsAppWithResult()` or `sendWhatsAppMessage()` | status updated; provider message ID stored in `data.providerMessageId` on success |
| Client-triggered notifications | `src/lib/notify-client.ts` | caller-supplied user/phone | caller channels AND member prefs | `fetch("/api/whatsapp/send")` | HTTP route queues failures when possible |
| Proxy claim | `src/app/api/proxy-claim/send/route.ts` | proxy claim phone | requested channels | `dispatchWhatsApp("proxy_claim", ...)` | awaited boolean result |

## 3. Root Cause Table

| Failure point | Evidence | Files/functions involved | Impact | Fix applied or recommended |
|---|---|---|---|---|
| Cron phone lookup used admin-gated RPC | `00081_dispatch_phone_rpcs.sql` gates `get_member_phones()` on `is_group_admin()` and says service-role cron should use raw lookup; four cron routes still called the RPC | `supabase/migrations/00081_dispatch_phone_rpcs.sql`, `payment-reminders`, `event-reminders`, `hosting-reminders`, `send-scheduled-announcements` | Phone maps were empty or errored, so WhatsApp/SMS recipient delivery was skipped from cron paths | Added `fetchMemberDispatchContacts()` and replaced cron `get_member_phones` calls |
| Payment/event WhatsApp sends not awaited | Both routes used `dispatchWhatsApp(...).catch(() => {})` | `src/app/api/cron/payment-reminders/route.ts`, `src/app/api/cron/event-reminders/route.ts` | Serverless handlers could finish before Meta API calls completed; failures were swallowed | Switched to `dispatchWhatsAppWithResult()`, collected promises, awaited results, returned counts |
| Full phone numbers in WhatsApp logs | Sender/route logged formatted or raw phone values | `src/lib/send-whatsapp.ts`, `src/app/api/whatsapp/send/route.ts`, `src/lib/whatsapp-dispatcher.ts` | Violated safe observability rules | Added `maskPhoneNumber()` and used it in WhatsApp logs/errors |
| Provider response lost for typed dispatch | Dispatcher returned only boolean | `src/lib/whatsapp-dispatcher.ts`, queue drain | Meta message ID could not be surfaced or stored | Added `dispatchWhatsAppWithResult()` while preserving existing boolean API |
| Queued WhatsApp success did not persist provider ID | Queue worker updated status only | `src/app/api/cron/drain-notification-queue/route.ts` | Retry success lacked provider message ID | Queue worker now writes `data.providerMessageId` and `data.providerStatus` |
| Env example had stale/missing config names | `.env.local.example` used `AT_*`, omitted `CRON_SECRET` and `NEXT_PUBLIC_APP_URL` | `.env.local.example`, `src/lib/notifications/sms-sender.ts`, cron routes | Deployment setup could miss required runtime config | Updated `.env.local.example` to match code |
| Meta delivered/read callbacks missing | No WhatsApp webhook/status callback route found | repo-wide search for webhook/status callback | User-visible delivered/read state cannot update from Meta | Recommended follow-up: add signed Meta webhook and delivery table/status updates |

## 4. Environment/Config Checklist

| Env var | Required for | Used in | `.env.local.example` |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase client/server | API and cron routes | Present |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client auth/API route fallback | Supabase clients | Present |
| `SUPABASE_SERVICE_ROLE_KEY` | cron recipient lookup, UUID phone resolution, queue updates | cron routes, `/api/whatsapp/send` | Present as server-only optional |
| `CRON_SECRET` | Vercel cron auth | all `/api/cron/*` routes | Added |
| `NEXT_PUBLIC_APP_URL` | links in notification payloads | cron/link builders | Added |
| `WHATSAPP_API_TOKEN` | Meta Cloud API auth | `src/lib/send-whatsapp.ts` | Present |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta sender phone number | `src/lib/send-whatsapp.ts` | Present |
| `WHATSAPP_PHONE_ID` | fallback sender phone number alias | `src/lib/send-whatsapp.ts` | Not documented; use `WHATSAPP_PHONE_NUMBER_ID` |
| `WHATSAPP_API_VERSION` | Meta Graph API version | `src/lib/send-whatsapp.ts` | Present; defaults to `v21.0` |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | provider/admin reference | docs only | Present |
| `RESEND_API_KEY` | email channel | `src/lib/send-email.ts` | Present |
| `AFRICASTALKING_API_KEY` | SMS channel | `src/lib/notifications/sms-sender.ts` | Added |
| `AFRICASTALKING_USERNAME` | SMS channel | `src/lib/notifications/sms-sender.ts` | Added |
| `AFRICASTALKING_SENDER_ID` | optional approved SMS sender | SMS sender and queue drain | Added |

Local `.env.local` was inspected by key name only. It currently does not expose WhatsApp provider keys to this shell, so live provider validation was not attempted.

## 5. Patch Summary

| File | Change | Why low risk |
|---|---|---|
| `src/lib/cron-member-contacts.ts` | New server-only contact resolver using service-role table reads and auth phone fallback | Replaces broken cron-only RPC usage without weakening the admin-gated RPC |
| `src/lib/mask-phone.ts` | New phone masking helper | No business logic change |
| `src/lib/send-whatsapp.ts` | Masked logs; exported result type with `errorCode` | Same Meta payload; safer observability |
| `src/lib/whatsapp-dispatcher.ts` | Added detailed result API; preserved existing boolean `dispatchWhatsApp()` | Existing callers keep working |
| `src/app/api/whatsapp/send/route.ts` | Masked route logs; typed dispatch returns `messageId`/error and still queues failures | Same auth and recipient guard |
| `src/app/api/cron/payment-reminders/route.ts` | Direct contact lookup; awaited WhatsApp dispatch; added WhatsApp counters | Preserves email/SMS/in-app logic |
| `src/app/api/cron/event-reminders/route.ts` | Direct contact lookup; awaited WhatsApp dispatch; added WhatsApp counters | Preserves event reminder dedup flow |
| `src/app/api/cron/hosting-reminders/route.ts` | Direct contact lookup for real-member phones | Existing proxy lookup remains unchanged |
| `src/app/api/cron/send-scheduled-announcements/route.ts` | Direct contact lookup for announcement phone recipients | Keeps saved announcement channels and prefs |
| `src/app/api/cron/drain-notification-queue/route.ts` | Stores provider message ID/status for queued WhatsApp sends | Only enriches queue data on success |
| `.env.local.example` | Documents actual cron/SMS/WhatsApp config names | No runtime behavior change |
| `scripts/audit-whatsapp.mjs`, `package.json` | Adds `npm run audit:whatsapp` dry-run | No live sends; catches this regression class |

## 6. Tests/Checks Run

| Command | Result | Notes |
|---|---|---|
| `npm run audit:whatsapp` before patch | Failed | 12 failures: admin-gated phone RPC usage, unawaited WhatsApp, unmasked logs, missing config docs |
| `npm run audit:whatsapp` after patch | Passed | Warned only that local shell lacks WhatsApp provider envs; no live sends |
| `npx tsc --noEmit` | Passed | TypeScript clean |
| `npx eslint <touched files>` | Passed | Touched files clean |
| `npm run build` | Passed | Next.js production build completed |
| `npm run lint` | Failed on unrelated existing issues | Full lint includes `.claude/worktrees` and pre-existing app hook/link errors; not introduced by this patch |

## 7. Manual Launch Verification Steps

1. In Vercel staging/production, confirm these env vars are set: `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`, and `NEXT_PUBLIC_APP_URL`.
2. In Meta WhatsApp Manager, confirm the relevant templates from `docs/WHATSAPP_TEMPLATES.md` are approved in both `en` and `fr`.
3. Use only an allowlisted opted-in test recipient. Do not test against real members first.
4. Run `npm run audit:whatsapp` locally or in CI. In an environment shell with secrets available, run `npm run audit:whatsapp -- --strict-env`.
5. In staging, create a test group/member with a masked-format phone target like `+237******456` or a verified diaspora test number. Enable WhatsApp in notification preferences.
6. Trigger one safe path, preferably a single overdue payment reminder or a single scheduled announcement, by calling the cron endpoint with `Authorization: Bearer <CRON_SECRET>`.
7. Confirm the JSON response includes `whatsappSent: 1` and `whatsappFailed: 0` for payment/event reminder paths, or inspect Vercel logs for `[WhatsApp] SUCCESS` with a masked phone and Meta `messageId`.
8. Confirm Meta provider logs show the matching message ID and accepted status.
9. If a queued send is involved, check `notifications_queue`: `status = sent`, `sent_at` populated, and `data.providerMessageId` present.
10. Verify language by repeating with a French-preferring test user and checking the Meta template language code is `fr`.
11. Verify SMS rules separately: African test numbers may receive SMS; US/Europe test numbers should skip SMS but remain WhatsApp-eligible.
12. Rollback if needed by redeploying the previous build or temporarily removing `WHATSAPP_API_TOKEN` to stop live WhatsApp provider sends while preserving email/SMS/in-app behavior.

## Remaining Risks

- No Meta webhook/status callback route exists yet, so delivered/read receipt updates are not available.
- Direct cron successes are logged/returned but do not create a dedicated delivery row; queued successes do store the provider message ID.
- Local shell did not have WhatsApp provider credentials, so provider API validation remains a staging/production launch step.
- Existing full-repo lint failures remain outside this patch and should be handled separately before making lint a release gate.
