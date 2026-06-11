# WhatsApp Template Coverage Audit

Date: 2026-06-10

Scope: read-only audit of VillageClaq WhatsApp template mappings, Meta approval status, language coverage, variable order, routing, queue/webhook observability, and launch/manual-QA readiness.

No WhatsApp, email, or SMS messages were sent for this audit. No Meta configuration, Vercel deployment, migration, domain, queue retry, or production data mutation was performed.

## Executive Summary

The app currently defines 21 WhatsApp notification types in `src/lib/whatsapp-dispatcher.ts` and maps them through `src/lib/whatsapp-templates.ts`.

Meta Graph read-only inventory found 38 approved language rows across 20 template names. Of the 21 app template types:

- 14 are ready for controlled manual QA in both English and French.
- 1 is approved for English only and must be held for French users.
- 6 are referenced by app code but do not currently exist as approved Meta templates.
- 0 approved app templates have a variable-count mismatch.
- 0 approved app templates have an app builder order mismatch by Meta placeholder number.

The four launch-critical v2 templates are approved, mapped, and variable-compatible:

- `villageclaq_payment_reminder_v2`
- `villageclaq_payment_receipt_v2`
- `villageclaq_announcement_v2`
- `villageclaq_event_reminder_v2`

The payment receipt v2 path is the strongest operational path because it is queue-backed, idempotent, stores the Meta provider message ID, and receives webhook status updates back into `notifications_queue.data.latestProviderStatus`.

Several other WhatsApp paths still route through direct or client-initiated sends. Those can send if Meta approves the template, but they do not all persist provider message IDs to queue rows, so callback status cannot always be correlated to a durable queue row.

## Method

Inputs used:

- Code inventory from `src/lib/whatsapp-templates.ts`
- Dispatcher inventory from `src/lib/whatsapp-dispatcher.ts`
- Producer and route search for `whatsappType`, `dispatchWhatsApp`, `dispatchWhatsAppWithResult`, and `sendWhatsAppMessage`
- Meta Graph API read-only `/{WABA_ID}/message_templates`
- Static safety checks in `scripts/audit-whatsapp.mjs`

Meta data captured:

- Template name
- Category
- Status
- Language
- Component types
- Body placeholder count and placeholder numbers
- Footer presence
- Button count

Secrets, tokens, provider payloads, and full phone numbers were not captured in this document.

## Current App Template Inventory

| App type | Constant | Meta template | Category | EN | FR | App variable order | Meta variable count | Producer path | Send path | Webhook tracking | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `payment_receipt` | `PAYMENT_RECEIPT` | `villageclaq_payment_receipt_v2` | UTILITY | yes | yes | `memberName`, `amount`, `contributionType`, `groupName`, `date` | 5 | `src/lib/payment-receipt-producer.ts` | queue drain via `notifications_queue` | yes, queue row updated by `providerMessageId` | Ready |
| `payment_reminder` | `PAYMENT_REMINDER` | `villageclaq_payment_reminder_v2` | UTILITY | yes | yes | `memberName`, `amount`, `contributionType`, `dueDate`, `groupName` | 5 | `src/app/api/cron/payment-reminders/route.ts` | awaited direct dispatch with result | webhook row can persist, but no queue row for direct sends | Ready for template QA; observability gap |
| `event_reminder` | `EVENT_REMINDER` | `villageclaq_event_reminder_v2` | MARKETING | yes | yes | `memberName`, `eventTitle`, `eventDate`, `eventLocation`, `groupName` | 5 | `src/app/api/cron/event-reminders/route.ts` | awaited direct dispatch with result | webhook row can persist, but no queue row for direct sends | Ready for template QA; observability gap |
| `hosting_reminder` | `HOSTING_REMINDER` | `villageclaq_hosting_reminder` | UTILITY | yes | yes | `memberName`, `hostingDate`, `groupName` | 3 | hosting cron and hosting UI | direct dispatch or client route | limited for direct/client sends | Ready for template QA; routing hardening later |
| `minutes_published` | `MINUTES_PUBLISHED` | `villageclaq_minutes_published` | MARKETING | yes | yes | `groupName`, `meetingTitle`, `meetingDate` | 3 | minutes page via `notifyFromClient` | client route `/api/whatsapp/send` | no durable queue correlation unless queued on retry | Ready for template QA; routing hardening later |
| `relief_claim_approved` | `RELIEF_CLAIM_APPROVED` | `villageclaq_relief_claim_approved` | UTILITY | yes | yes | `memberName`, `claimType`, `amount`, `groupName` | 4 | relief claims page via `notifyFromClient` | client route `/api/whatsapp/send` | no durable queue correlation unless queued on retry | Ready for template QA; routing hardening later |
| `relief_claim_denied` | `RELIEF_CLAIM_DENIED` | `villageclaq_relief_claim_denied` | UTILITY | yes | yes | `memberName`, `claimType`, `reason`, `groupName` | 4 | relief claims page via `notifyFromClient` | client route `/api/whatsapp/send` | no durable queue correlation unless queued on retry | Ready for template QA; routing hardening later |
| `announcement` | `ANNOUNCEMENT` | `villageclaq_announcement_v2` | MARKETING | yes | yes | `groupName`, `title`, `body` | 3 | announcements page, scheduled announcement cron, enterprise transfers | client route or direct cron dispatch | limited for direct/client sends | Ready for template QA; routing hardening later |
| `election_opened` | `ELECTION_OPENED` | `villageclaq_election_opened` | MARKETING | yes | yes | `groupName`, `electionTitle`, `positions` | 3 | elections page via `notifyFromClient` | client route `/api/whatsapp/send` | no durable queue correlation unless queued on retry | Ready for template QA; routing hardening later |
| `invitation` | `INVITATION` | `villageclaq_invitation` | MARKETING | yes | yes | `inviterName`, `groupName`, `acceptUrl` | 3 | generic dispatcher support | direct/client if invoked | no durable queue correlation unless queued | Ready for template QA only after producer path is confirmed |
| `loan_approved` | `LOAN_APPROVED` | `villageclaq_loan_approved` | UTILITY | yes | yes | `memberName`, `amount`, `groupName` | 3 | loans page via `notifyFromClient` | client route `/api/whatsapp/send` | no durable queue correlation unless queued on retry | Ready for template QA; routing hardening later |
| `loan_overdue` | `LOAN_OVERDUE` | `villageclaq_loan_overdue` | UTILITY | yes | yes | `memberName`, `amount`, `dueDate`, `groupName` | 4 | generic dispatcher support | direct/client if invoked | no durable queue correlation unless queued | Ready for template QA only after producer path is confirmed |
| `fine_issued` | `FINE_ISSUED` | `villageclaq_fine_issued` | UTILITY | yes | yes | `memberName`, `fineType`, `amount`, `reason`, `groupName` | 5 | fines page via `notifyFromClient` | client route `/api/whatsapp/send` | no durable queue correlation unless queued on retry | Ready for template QA; routing hardening later |
| `standing_changed` | `STANDING_CHANGED` | `villageclaq_standing_changed` | UTILITY | yes | yes | `memberName`, `newStanding`, `groupName` | 3 | generic dispatcher support | direct/client if invoked | no durable queue correlation unless queued | Ready for template QA only after producer path is confirmed |
| `welcome` | `WELCOME` | `villageclaq_welcome` | MARKETING | yes | yes (see addendum) | `memberName`, `groupName` | 2 | `src/lib/welcome-producer.ts` via `/api/members/welcome-notifications` | queue-backed (`notifications_queue`) | provider ID + webhook status correlated via queue row | Default `new_member` prefs keep WhatsApp off; enable for QA |
| `hosting_assignment` | `HOSTING_ASSIGNMENT` | `villageclaq_hosting_assignment` | missing | no | no | `memberName`, `hostingDate`, `groupName` | missing | hosting UI via `notifyFromClient` | client route `/api/whatsapp/send` | no durable queue correlation unless queued | Hold: missing Meta approval |
| `relief_enrollment` | `RELIEF_ENROLLMENT` | `villageclaq_relief_enrollment` | missing | no | no | `memberName`, `planName`, `groupName` | missing | relief enrollment page via `notifyFromClient` | client route `/api/whatsapp/send` | no durable queue correlation unless queued | Hold: missing Meta approval |
| `remittance_confirmed` | `REMITTANCE_CONFIRMED` | `villageclaq_remittance_confirmed` | missing | no | no | `amount`, `groupName` | missing | relief remittances page via `notifyFromClient` | client route `/api/whatsapp/send` | no durable queue correlation unless queued | Hold: missing Meta approval |
| `remittance_disputed` | `REMITTANCE_DISPUTED` | `villageclaq_remittance_disputed` | missing | no | no | `amount`, `groupName` | missing | relief remittances page via `notifyFromClient` | client route `/api/whatsapp/send` | no durable queue correlation unless queued | Hold: missing Meta approval |
| `subscription_expiring` | `SUBSCRIPTION_EXPIRING` | `villageclaq_subscription_expiring` | missing | no | no | `planName`, `days` | missing | subscription reminders cron | direct dispatch | no durable queue correlation | Hold: missing Meta approval |
| `proxy_claim` | `PROXY_CLAIM` | `villageclaq_proxy_claim` | missing | no | no | `memberName`, `groupName`, `claimUrl` | missing | `src/app/api/proxy-claim/send/route.ts` | direct dispatch | no durable queue correlation | Hold: missing Meta approval |

## Meta Approval Status

Ready in EN and FR:

- `villageclaq_payment_receipt_v2`
- `villageclaq_payment_reminder_v2`
- `villageclaq_event_reminder_v2`
- `villageclaq_hosting_reminder`
- `villageclaq_minutes_published`
- `villageclaq_relief_claim_approved`
- `villageclaq_relief_claim_denied`
- `villageclaq_announcement_v2`
- `villageclaq_election_opened`
- `villageclaq_invitation`
- `villageclaq_loan_approved`
- `villageclaq_loan_overdue`
- `villageclaq_fine_issued`
- `villageclaq_standing_changed`

Approved in EN only:

- `villageclaq_welcome`

Referenced by app code but not approved/present in Meta:

- `villageclaq_hosting_assignment`
- `villageclaq_relief_enrollment`
- `villageclaq_remittance_confirmed`
- `villageclaq_remittance_disputed`
- `villageclaq_subscription_expiring`
- `villageclaq_proxy_claim`

Approved in Meta but not used by the app:

- `villageclaq_payment_receipt`
- `villageclaq_payment_reminder`
- `villageclaq_event_reminder`
- `villageclaq_announcement`
- `villageclaq_welcome_`

The unused first four are expected legacy names after the v2 migration. `villageclaq_welcome_` appears to be an extra Meta-side name and is not referenced by code.

## Variable Order Review

App builders pass variables in the same numeric order Meta expects. For example:

- Payment receipt app order: `{{1}} memberName`, `{{2}} amount`, `{{3}} contributionType`, `{{4}} groupName`, `{{5}} date`
- Payment reminder app order: `{{1}} memberName`, `{{2}} amount`, `{{3}} contributionType`, `{{4}} dueDate`, `{{5}} groupName`
- Announcement app order: `{{1}} groupName`, `{{2}} title`, `{{3}} body`
- Event reminder app order: `{{1}} memberName`, `{{2}} eventTitle`, `{{3}} eventDate`, `{{4}} eventLocation`, `{{5}} groupName`

The v2 template body text intentionally displays the group placeholder first in some templates, such as `{{4}}` or `{{5}}` near the top. This is safe because Meta binds values by placeholder number, not by the visual order of placeholders in the message body.

No approved current app template has a variable-count mismatch.

## Language Handling

The dispatcher sends `fr` only when the selected locale is exactly `fr`; all other values fall back to `en`.

Safe behavior:

- Missing or unknown locale falls back to English.
- The four v2 launch-critical templates have both EN and FR approved.
- Most approved non-v2 templates also have both EN and FR approved.

Risk:

- `welcome` has no FR template row. A French recipient would request `fr` and Meta would reject the send.
- The six missing template names have no EN or FR row and should not be tested live until approved.

## Producer And Routing Coverage

Queue-backed and webhook-correlatable:

- `payment_receipt` from `src/lib/payment-receipt-producer.ts`
- Any message already in `notifications_queue` and sent by `src/app/api/cron/drain-notification-queue/route.ts`

Awaited direct dispatch with provider result but no durable queue row:

- `payment_reminder`
- `event_reminder`

Awaited direct dispatch without durable provider ID persistence:

- `hosting_reminder`
- `announcement` from scheduled-announcement cron
- `subscription_expiring`
- `proxy_claim`

Client-initiated route sends through `/api/whatsapp/send`:

- `announcement`
- `hosting_assignment`
- `hosting_reminder`
- `minutes_published`
- `relief_claim_approved`
- `relief_claim_denied`
- `relief_enrollment`
- `remittance_confirmed`
- `remittance_disputed`
- `loan_approved`
- `fine_issued`
- `election_opened`
- legacy client payment receipt call sites

Those client paths call a server API route, so Meta credentials stay server-side. However, the browser helper is fire-and-forget and does not persist the returned provider message ID to a queue row. If Meta sends a status webhook for those direct sends, the webhook table can store the event, but `notifications_queue.data.latestProviderStatus` cannot be updated without a queue row containing that provider ID.

## Safety And Observability Review

Confirmed:

- `src/lib/send-whatsapp.ts` masks phone numbers in server logs.
- `src/app/api/whatsapp/send/route.ts` masks phone numbers and shortens UUIDs in server logs.
- Webhook signature validation uses the raw request body and `X-Hub-Signature-256`.
- Webhook persistence sanitizes phone-bearing fields before storing raw events.
- Queue drain stores `providerMessageId` and `providerStatus` for successful queue sends.
- Payment receipt idempotency is strict exactly-once by `payment_receipt:<paymentId>`.
- Queue retry behavior does not retry old rows during this audit.

Updated in this PR:

- `src/lib/notify-client.ts` now masks `recipientPhone` in client diagnostics.
- `scripts/audit-whatsapp.mjs` now statically audits all 21 current app template mappings and variable-builder orders.

Remaining risks:

- Direct/client sends do not have durable provider ID correlation.
- Several direct paths use boolean dispatch, so failures are not as observable as queue-backed sends.
- Six app-referenced template names are missing from Meta.
- `welcome` is missing FR.

## Manual QA Readiness

Ready for controlled manual QA:

- EN/FR payment receipt
- EN/FR payment reminder
- EN/FR announcement
- EN/FR event reminder
- EN/FR hosting reminder
- EN/FR minutes published
- EN/FR relief claim approved
- EN/FR relief claim denied
- EN/FR election opened
- EN/FR invitation
- EN/FR loan approved
- EN/FR loan overdue
- EN/FR fine issued
- EN/FR standing changed

Hold back from live WhatsApp QA:

- FR welcome, until `villageclaq_welcome` is approved in FR or code falls back to EN for that template.
- Hosting assignment, until `villageclaq_hosting_assignment` is approved in EN/FR.
- Relief enrollment, until `villageclaq_relief_enrollment` is approved in EN/FR.
- Remittance confirmed, until `villageclaq_remittance_confirmed` is approved in EN/FR.
- Remittance disputed, until `villageclaq_remittance_disputed` is approved in EN/FR.
- Subscription expiring, until `villageclaq_subscription_expiring` is approved in EN/FR.
- Proxy claim, until `villageclaq_proxy_claim` is approved in EN/FR.

## Recommended Manual Test Cases

Run only after explicit send authorization, one template/language at a time, with a controlled recipient. Verify phone receipt, Meta `wamid...`, webhook status row, and log masking.

| Template | EN test | FR test | Notes |
| --- | --- | --- | --- |
| `payment_receipt` | Confirm one controlled payment | Confirm one controlled payment with FR locale | Use the queue-backed producer path first |
| `payment_reminder` | One controlled overdue obligation | Same with FR locale | Direct cron path; provider ID is not durably queued |
| `announcement` | One controlled announcement | Same with FR localized title/body | Client/scheduled paths differ; test both later |
| `event_reminder` | One controlled event reminder | Same with FR locale | Direct cron path |
| `hosting_reminder` | One controlled hosting reminder | Same with FR locale | Direct dispatch boolean path |
| `minutes_published` | Publish one controlled minutes notice | Same with FR locale | Client route path |
| `relief_claim_approved` | Controlled claim approval | Same with FR locale | Client route path |
| `relief_claim_denied` | Controlled claim denial | Same with FR locale | Client route path |
| `election_opened` | Controlled election opening | Same with FR locale | Client route path |
| `invitation` | Controlled invitation | Same with FR locale | Confirm producer path before live send |
| `loan_approved` | Controlled loan approval | Same with FR locale | Client route path |
| `loan_overdue` | Controlled overdue loan | Same with FR locale | Confirm producer path before live send |
| `fine_issued` | Controlled fine issue | Same with FR locale | Client route path |
| `standing_changed` | Controlled standing update | Same with FR locale | Confirm producer path before live send |

Do not live-test the hold-back templates until Meta approval gaps are closed.

## Recommended Next Steps

1. Submit or approve the missing Meta templates in EN and FR:
   - `villageclaq_hosting_assignment`
   - `villageclaq_relief_enrollment`
   - `villageclaq_remittance_confirmed`
   - `villageclaq_remittance_disputed`
   - `villageclaq_subscription_expiring`
   - `villageclaq_proxy_claim`
2. Add FR for `villageclaq_welcome`, or add a documented EN fallback for this one template.
3. Move high-value client/direct WhatsApp flows toward queue-backed producers so provider IDs and webhook statuses are durably correlated.
4. Prefer `dispatchWhatsAppWithResult` over boolean `dispatchWhatsApp` in server paths that must produce audit counts.
5. Begin manual QA with the 14 EN/FR-ready templates, starting with the four v2 launch-critical templates.

## Addendum (2026-06-10, post-approval follow-up)

This audit was a point-in-time snapshot. Two welcome findings are superseded:

- FR approval: `villageclaq_welcome` is now approved in EN and FR (see
  `docs/whatsapp-missing-template-copy.md`). The "Hold for FR users" notes at
  lines above no longer apply.
- Producer path: a server-side, queue-backed welcome producer now exists —
  `src/lib/welcome-producer.ts`, triggered via `/api/members/welcome-notifications`
  from invitation acceptance, proxy claim (invitation and token link), and
  join-code success. Recipient is the joining member only; `new_member`
  preferences gate the send (default WhatsApp OFF); idempotency is one welcome
  per membership (check-before-insert plus migration 00088 unique index).
  Tested by `npm run test:welcome-producer` and audited by `npm run audit:whatsapp`.
