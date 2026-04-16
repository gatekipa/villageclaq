# Notification Channel Routing Audit

**Date:** 2026-04-16
**Trigger:** Compliance/cost audit — Africa's Talking charges for failed SMS attempts to non-African numbers
**Method:** Static code inspection (TRACED CODE BEHAVIOR). No runtime verification possible without live API credentials.

## Complete Pipeline Map

```
Notification Trigger
  ├─ Client-side: notifyFromClient() / notifyBulkFromClient()  [src/lib/notify-client.ts]
  │   ├─ getEnabledChannels()  [src/lib/notification-prefs.ts]
  │   │   └─ RPC get_notification_preferences → AND(global, per-type) → channels
  │   ├─ In-App: INSERT INTO notifications  (always, cannot opt out)
  │   ├─ Email:  fetch("/api/email/send")   → sendEmail()  [src/lib/send-email.ts]
  │   ├─ SMS:    fetch("/api/sms/send")     → sendSmsNotification() → isAfricanPhoneNumber() → sendSMS()
  │   └─ WhatsApp: fetch("/api/whatsapp/send") → dispatchWhatsApp() → sendWhatsAppMessage()
  │
  ├─ Server-side crons: Direct function calls (no HTTP hop)
  │   ├─ payment-reminders/route.ts   → sendEmail + sendSmsNotification + dispatchWhatsApp
  │   ├─ event-reminders/route.ts     → sendEmail + sendSmsNotification + dispatchWhatsApp
  │   ├─ hosting-reminders/route.ts   → sendEmail + sendSmsNotification + dispatchWhatsApp
  │   └─ subscription-reminders/route.ts → sendEmail + sendSmsNotification + dispatchWhatsApp
  │
  └─ Queue drain: src/app/api/cron/drain-notification-queue/route.ts
      ├─ processSms()      → isAfricanPhoneNumber() check → Africa's Talking SDK
      ├─ processEmail()    → sendEmail()
      └─ processWhatsApp() → dispatchWhatsApp() or sendWhatsAppMessage()
```

## Channel Decision Points

### 1. Preference Check — getEnabledChannels()
**File:** `src/lib/notification-prefs.ts:79-140`
**Behavior:** Reads `profiles.notification_preferences` JSONB via SECURITY DEFINER RPC. ANDs global channel toggles with per-type toggles. Checks muted_groups. in_app always true.
**Default:** SMS=ON, WhatsApp=ON, Email=ON (opt-OUT model)
**Fail mode:** On error, returns all channels enabled (fail-open, line 138)
**Status:** CORRECT

### 2. SMS Africa-Only Filter — sendSmsNotification()
**File:** `src/lib/send-sms-notification.ts:66-71`
**Behavior:** Calls `isAfricanPhoneNumber(to)`. Returns `{sent: false, skipped: true}` for non-African numbers.
**Status:** CORRECT

### 3. African Phone Detection — isAfricanPhoneNumber()
**File:** `src/lib/is-african-phone.ts:67-81`
**Behavior:** Strips whitespace/dashes/parens. Requires `+` prefix. Checks digits against 55 African country codes.
**Fail-safe:** Returns `false` if no `+` prefix or unknown code → SMS skipped.
**Status:** CORRECT

### 4. WhatsApp Phone Formatting — formatPhoneForWhatsApp()
**File:** `src/lib/format-phone-whatsapp.ts:22-57`
**Behavior:** Strips `+`/`00`, handles local numbers (0-prefix → country code prepend), validates 7-15 digit length.
**Known limitation:** LOCAL_PREFIX_MAP only covers Cameroon (06/07/02/03). Non-Cameroon local numbers get +237 prepended.
**Impact:** LOW — stored numbers are typically E.164 format with country code.
**Status:** ACCEPTABLE — local number handling is edge case

### 5. Queue Drain SMS — processSms()
**File:** `src/app/api/cron/drain-notification-queue/route.ts:128-151`
**Behavior (AFTER FIX):** Calls `isAfricanPhoneNumber()` before Africa's Talking SDK. Non-African numbers return `true` (marked as "sent" to prevent infinite retry).
**Previous behavior:** Called AT SDK directly without country check.
**Status:** FIXED

### 6. Client-side SMS routing — notifyFromClient()
**File:** `src/lib/notify-client.ts:179-192`
**Behavior:** Sends `to` (phone or UUID) to `/api/sms/send`. The API route resolves UUID→phone, then `sendSmsNotification()` applies the African filter.
**Status:** CORRECT — filter is in sendSmsNotification(), not in the client

### 7. Client-side WhatsApp routing — notifyFromClient()
**File:** `src/lib/notify-client.ts:195-208`
**Behavior:** Sends to `/api/whatsapp/send`. Route resolves UUID→phone (3-level: profiles, memberships, auth.users). No country restriction.
**Status:** CORRECT

## Scenario Traces

### Scenario A: User with Cameroonian phone (+237 6XX XXX XXX)
- **Channel selection:** getEnabledChannels() → depends on user prefs, default all ON
- **SMS:** sendSmsNotification() → isAfricanPhoneNumber("+237...") → `true` → sendSMS() called → **YES** (CORRECT)
- **WhatsApp:** dispatchWhatsApp() → formatPhoneForWhatsApp("+237...") → "237..." → Meta API called → **YES** (CORRECT)
- **Email:** sendEmail() → Resend API called → **YES** (CORRECT)
- **In-App:** INSERT INTO notifications → **YES** (CORRECT)
- **Status:** CORRECT BEHAVIOR

### Scenario B: User with US phone (+1 240 555 0123)
- **SMS:** sendSmsNotification() → isAfricanPhoneNumber("+1240...") → `false` → returns `{skipped: true}` → **NO** (CORRECT)
- **WhatsApp:** formatPhoneForWhatsApp("+1240...") → "12405550123" → valid → Meta API called → **YES** (CORRECT)
- **Email:** Sent normally → **YES** (CORRECT)
- **In-App:** Sent normally → **YES** (CORRECT)
- **Status:** CORRECT BEHAVIOR

### Scenario C: User with UK phone (+44 7700 900000)
- **SMS:** isAfricanPhoneNumber("+44...") → `false` → skipped → **NO** (CORRECT)
- **WhatsApp:** formatPhoneForWhatsApp("+44...") → "447700900000" → valid → sent → **YES** (CORRECT)
- **Status:** CORRECT BEHAVIOR

### Scenario D: User with no phone number
- **SMS:** notifyFromClient checks `recipientPhone || recipientUserId`. If UUID, route resolves → `profiles.phone` is null → returns 400. If no phone/UUID, `if` condition fails → fetch not called. → **SKIPPED** (CORRECT)
- **WhatsApp:** Same gating. UUID resolves through 3 fallbacks → if all null, returns 400. → **SKIPPED** (CORRECT)
- **Email:** Still sent if recipientUserId exists (UUID→email resolution) → **YES** (CORRECT)
- **In-App:** Still sent → **YES** (CORRECT)
- **Status:** CORRECT BEHAVIOR

### Scenario E: User with invalid/malformed phone (e.g., "12345")
- **SMS:** isAfricanPhoneNumber("12345") → no `+` prefix → returns `false` → skipped → **SKIPPED** (CORRECT — fail-safe)
- **WhatsApp:** formatPhoneForWhatsApp("12345") → cleaned = "12345" → 5 digits < 7 → returns `null` → invalid → **SKIPPED** (CORRECT)
- **Status:** CORRECT BEHAVIOR

## Fixes Applied

### Fix 1: Drain Queue SMS Country Check (CRITICAL)
**File:** `src/app/api/cron/drain-notification-queue/route.ts:128-137`
**Before:** `processSms()` called Africa's Talking SDK directly without country validation.
**After:** Added `isAfricanPhoneNumber()` check. Non-African numbers are marked as "sent" (true) so they don't retry forever.
**Risk eliminated:** Non-African numbers queued on SDK failure would no longer burn AT API credits on retry.

### Fix 2: Notification Client Error Logging (MODERATE)
**File:** `src/lib/notify-client.ts` — 16 catch blocks updated
**Before:** Empty `catch {}` and `.catch(() => {})` blocks — zero observability on channel failures.
**After:** All catch blocks now log with `console.warn("[Channel] context:", err.message)`.
**Tags:** `[Notify:InApp]`, `[Notify:Email]`, `[Notify:SMS]`, `[Notify:WhatsApp]`, `[NotifyBulk:*]`

### Fix 3: SMS Queue Error Logging
**File:** `src/lib/notifications/sms-sender.ts:73-75`
**Before:** Empty `catch {}` on queue insert failure.
**After:** Logs `console.warn("[SMS:Queue] Failed to queue notification:", err.message)`.

### Fix 4: CLAUDE.md Rule #11
**File:** `CLAUDE.md`
**Added:** Notification Channel Routing rules under Critical Rules section.

## Pipeline Inventory

| File | Role | SMS Filter | WhatsApp Global | Error Logged |
|------|------|-----------|-----------------|-------------|
| `src/lib/notify-client.ts` | Client-side dispatcher | Delegates to API route | Delegates to API route | YES (FIXED) |
| `src/lib/notification-prefs.ts` | Channel preference engine | N/A (decides channels) | N/A (decides channels) | YES (fail-open) |
| `src/lib/is-african-phone.ts` | African country detection | THIS IS THE FILTER | N/A | N/A |
| `src/lib/send-sms-notification.ts` | SMS template sender | YES (line 66) | N/A | YES |
| `src/lib/notifications/sms-sender.ts` | AT SDK wrapper | Upstream filter | N/A | YES (FIXED) |
| `src/lib/send-whatsapp.ts` | Meta Cloud API sender | N/A | YES (global) | YES |
| `src/lib/whatsapp-dispatcher.ts` | Type→template mapper | N/A | YES (global) | YES |
| `src/lib/format-phone-whatsapp.ts` | WhatsApp phone formatter | N/A | YES (7-15 digits) | N/A |
| `src/lib/send-email.ts` | Resend email sender | N/A | N/A | YES (never throws) |
| `src/app/api/sms/send/route.ts` | SMS HTTP API | Via sendSmsNotification | N/A | YES |
| `src/app/api/whatsapp/send/route.ts` | WhatsApp HTTP API | N/A | YES + rate limiter | YES |
| `src/app/api/email/send/route.ts` | Email HTTP API | N/A | N/A | YES |
| `src/app/api/cron/drain-notification-queue/route.ts` | Queue processor | YES (FIXED) | YES (via dispatch) | YES |
| `src/app/api/cron/payment-reminders/route.ts` | Daily cron | Via sendSmsNotification | Via dispatchWhatsApp | PARTIAL |
| `src/app/api/cron/event-reminders/route.ts` | Daily cron | Via sendSmsNotification | Via dispatchWhatsApp | PARTIAL |
| `src/app/api/cron/hosting-reminders/route.ts` | Daily cron | Via sendSmsNotification | Via dispatchWhatsApp | PARTIAL |
| `src/app/api/cron/subscription-reminders/route.ts` | Daily cron | Via sendSmsNotification | Via dispatchWhatsApp | PARTIAL |

## Known Risks / Follow-Up

### Risk 1: Email Failures Not Queued
SMS and WhatsApp failures are queued to `notifications_queue` for retry. Email failures are returned as `{success: false}` and lost. If Resend has a transient outage, emails are silently dropped.
**Severity:** LOW (Resend has high uptime, and email is supplementary to in-app)
**Mitigation:** Could add email queueing in `send-email.ts` on failure.

### Risk 2: Quiet Hours Stored But Not Enforced
The notification preferences UI allows setting quiet hours (start/end time). The data is saved to `profiles.notification_preferences.quiet_hours` but `getEnabledChannels()` never checks it.
**Severity:** LOW (feature incomplete, not a billing/compliance issue)

### Risk 3: formatPhoneForWhatsApp LOCAL_PREFIX_MAP is Cameroon-Only
Local numbers starting with `0` that aren't Cameroon patterns get `237` prepended. This would fail for e.g. Nigerian local numbers starting with `080`.
**Severity:** LOW (stored numbers are typically E.164 with country code)

### Risk 4: SMS Route UUID Resolution is Single-Source
`/api/sms/send` resolves UUID→phone from `profiles.phone` only. `/api/whatsapp/send` has 3-level fallback (profiles, memberships, auth.users). A user with phone only in `auth.users` gets WhatsApp but not SMS.
**Severity:** LOW (most users have phone in profiles)

## Verification Checklist

- [x] `isAfricanPhoneNumber()` exists and covers 55 African country codes
- [x] `sendSmsNotification()` calls `isAfricanPhoneNumber()` before AT SDK
- [x] All 4 cron routes use `sendSmsNotification()` (never call AT SDK directly)
- [x] `/api/sms/send` route delegates to `sendSmsNotification()`
- [x] Queue drain `processSms()` now checks `isAfricanPhoneNumber()` (FIXED)
- [x] WhatsApp sends globally (no country restriction in dispatchWhatsApp or sendWhatsAppMessage)
- [x] Email has no country restriction
- [x] In-app always sent
- [x] Channel selection via getEnabledChannels() happens before API calls
- [x] No remaining empty catch blocks in notify-client.ts
- [x] No remaining empty catch in sms-sender.ts queueNotification
- [x] CLAUDE.md updated with rule #11
- [ ] Runtime verification pending (requires live AT/Meta/Resend API keys)
