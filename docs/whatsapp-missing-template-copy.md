# WhatsApp Template Approval Follow-up Guide

Date: 2026-06-10

Scope: post-approval follow-up for VillageClaq WhatsApp templates that were missing or incomplete after the full template coverage audit. This guide records the approved copy and the remaining app-side readiness holds. It does not change app code, template mappings, notification routing, Meta settings, credentials, deployments, or production data.

## Executive Summary

Final read-only Meta re-check found 48 approved language rows across 24 approved template names. All previously missing submission-batch templates are now approved in EN/FR and their variable counts match the app builders.

`hosting_assignment` remains excluded from manual Meta creation because Meta already has the similar approved `villageclaq_hosting_reminder` template in EN/FR, and the app uses both `hosting_assignment` and `hosting_reminder` keys.

| App type/key | Meta template name | Meta status | Recommendation |
| --- | --- | --- | --- |
| `welcome` | `villageclaq_member_joined` (UTILITY; replaced MARKETING `villageclaq_welcome` after Meta error 131049 blocked US delivery) | EN/FR approved | Mapped in app. Ready for controlled template QA: server-side queue-backed producer implemented (`src/lib/welcome-producer.ts` via `/api/members/welcome-notifications`). See `docs/whatsapp-welcome-utility-template.md`. |
| `relief_enrollment` | `villageclaq_relief_enrollment` | EN/FR approved | Producer-backed (2026-06-11): `src/lib/relief-enrollment-producer.ts` resolves `memberName` server-side. Ready for controlled QA after migration 00089 is applied. |
| `remittance_confirmed` | `villageclaq_remittance_confirmed` | EN/FR approved | Ready for controlled template QA after explicit send authorization. |
| `remittance_disputed` | `villageclaq_remittance_disputed` | EN/FR approved | Ready for controlled template QA after explicit send authorization. |
| `subscription_expiring` | `villageclaq_subscription_expiring` | EN/FR approved | Ready for current app behavior; adding group context requires a later code change. |
| `proxy_claim` | `villageclaq_proxy_claim` | EN/FR approved | Ready for controlled template QA after explicit send authorization. |

Do not manually create `villageclaq_hosting_assignment` in this batch. The current app mapping points `hosting_assignment` to that absent name, but the existing approved `villageclaq_hosting_reminder` has the same three-placeholder shape (`memberName`, `hostingDate`, `groupName`). Treat `hosting_assignment` as a later app mapping/producer cleanup decision: either map it to `villageclaq_hosting_reminder` if the reminder copy is acceptable for assignment notices, or create a distinct assignment template only after the producer supplies all three variables.

Approval and QA rules:

- Do not submit additional templates unless a later app/product decision requires a new template name.
- Keep all current app variables as body variables. Do not add headers or buttons that require new app components unless app code is updated.
- Sample values below are safe examples for review and QA planning. They are not production data and do not include phone numbers, tokens, or secrets.

## Variable Source Review

| App type/key | Builder | Current body variable order | Producer path | Payload readiness |
| --- | --- | --- | --- | --- |
| `welcome` | `buildWelcomeParams` | `{{1}} memberName`, `{{2}} groupName` | `src/lib/welcome-producer.ts` enqueues `notifications_queue` rows via `/api/members/welcome-notifications`; triggered on invitation acceptance, proxy claim (invitation and token), and join-code success | EN/FR approved; producer queues `memberName`, `groupName` for the joining member only, gated by `new_member` preferences. |
| `hosting_assignment` | `buildHostingAssignmentParams` | `{{1}} memberName`, `{{2}} hostingDate`, `{{3}} groupName` | `src/lib/hosting-assignment-producer.ts` via `/api/hosting/assignment-notifications` (2026-06-11); mapped to approved `villageclaq_hosting_reminder` (identical variable shape) | Producer resolves all three variables server-side per recipient; ready for controlled QA after migration 00089 is applied. |
| `relief_enrollment` | `buildReliefEnrollmentParams` | `{{1}} memberName`, `{{2}} planName`, `{{3}} groupName` | `src/lib/relief-enrollment-producer.ts` via `/api/relief/enrollment-notifications` (2026-06-11); covers enrollment page, plan auto-enroll, and bulk-enroll paths | Producer resolves all three variables server-side per recipient (never blank); ready for controlled QA after migration 00089 is applied. |
| `remittance_confirmed` | `buildRemittanceConfirmedParams` | `{{1}} amount`, `{{2}} groupName` | Relief remittances page uses `notifyBulkFromClient` | EN/FR approved and variable-compatible. |
| `remittance_disputed` | `buildRemittanceDisputedParams` | `{{1}} amount`, `{{2}} groupName` | Relief remittances page uses `notifyBulkFromClient` | EN/FR approved and variable-compatible. |
| `subscription_expiring` | `buildSubscriptionExpiringParams` | `{{1}} planName`, `{{2}} days` | Subscription reminders cron calls `dispatchWhatsApp` | EN/FR approved and variable-compatible for current app behavior; adding group context requires a future app-code change. |
| `proxy_claim` | `buildProxyClaimParams` | `{{1}} memberName`, `{{2}} groupName`, `{{3}} claimUrl` | `/api/proxy-claim/send` calls `dispatchWhatsApp` | EN/FR approved and variable-compatible. |

## Meta Component Defaults

- Header type: text
- Header text: `VillageClaq`
- Buttons: none
- Category: use `UTILITY` unless noted otherwise
- URL handling: keep URLs in body placeholders only for templates where the current app already passes a URL body variable
- Sample phone numbers: not needed and not included

## 1. `villageclaq_welcome`

> **Superseded (2026-06-11):** this MARKETING template failed US delivery with Meta
> error `131049` during controlled QA. The app's `welcome` type now maps to the
> approved UTILITY template `villageclaq_member_joined` — copy and submission notes
> in `docs/whatsapp-welcome-utility-template.md`. The section below is retained as
> the historical record of the original template.

Template purpose: welcome a user after joining or claiming membership in a group.

App type/key: `welcome`

Meta status: EN/FR approved. Category: `MARKETING`.

Header:

```text
VillageClaq
```

EN copy status: approved in Meta.

EN body reference:

```text
Welcome {{1}}! You are now a member of {{2}} on VillageClaq. Open the app to get started.
```

EN footer recommendation for any future replacement:

```text
VillageClaq.com — Your Community, Organized
```

FR body status: approved in Meta.

```text
Bienvenue sur VillageClaq

Bonjour {{1}}, vous êtes maintenant membre de {{2}} sur VillageClaq. Ouvrez l'application pour commencer.
```

FR footer:

```text
VillageClaq.com — Votre communauté, organisée
```

Variable order:

| Placeholder | App field | Sample value |
| --- | --- | --- |
| `{{1}}` | `memberName` | `Marie Ngono` |
| `{{2}}` | `groupName` | `MBACUDA` |

Readiness notes:

- Variable count matches the app builder in EN and FR.
- Producer path implemented: `src/lib/welcome-producer.ts` (server-side, queue-backed via `notifications_queue`, drained by the notification queue cron, provider IDs tracked by the WhatsApp webhook). Triggered fire-and-forget from invitation acceptance, proxy claim (invitation and token link), and join-code success. Recipient is the joining member only; admin-created (unclaimed) proxy members are excluded.
- Welcome respects the member's `new_member` notification preferences. Note: the default `new_member` matrix has WhatsApp OFF (`src/lib/notification-prefs.ts`), so manual QA must enable the WhatsApp channel for `new_member` on the test account before expecting a queued welcome.
- Idempotency is strict exactly-once per membership: check-before-insert plus the partial unique index in `supabase/migrations/00088_welcome_notification_idempotency.sql` (apply manually in the SQL Editor before live QA).

## Deferred App Mapping: `villageclaq_hosting_assignment`

Current recommendation: do not submit this template in the immediate manual Meta batch.

Why: the app already has a distinct `hosting_reminder` key mapped to the approved EN/FR `villageclaq_hosting_reminder` template. The app also has a separate `hosting_assignment` key mapped to absent `villageclaq_hosting_assignment`, but both keys use the same body variable order: `memberName`, `hostingDate`, `groupName`.

Product decision needed later: decide whether first-time assignment notices can reuse the approved reminder copy. If yes, update the app mapping and audit script to map `hosting_assignment` to `villageclaq_hosting_reminder` after fixing the producer payload. If no, submit a distinct assignment template later using the fallback copy below.

Template purpose: notify a member that they have been assigned to host.

App type/key: `hosting_assignment`

Category recommendation: `UTILITY`

Header:

```text
VillageClaq
```

EN body:

```text
VillageClaq hosting update

Hi {{1}}, you have been assigned to host for {{3}} on {{2}}. Open VillageClaq for details.
```

EN footer:

```text
VillageClaq.com — Your Community, Organized
```

FR body:

```text
Mise à jour d'accueil VillageClaq

Bonjour {{1}}, vous êtes désigné(e) pour accueillir {{3}} le {{2}}. Ouvrez VillageClaq pour les détails.
```

FR footer:

```text
VillageClaq.com — Votre communauté, organisée
```

Variable order:

| Placeholder | App field | Sample value |
| --- | --- | --- |
| `{{1}}` | `memberName` | `Jude Anyere` |
| `{{2}}` | `hostingDate` | `2026-07-15` |
| `{{3}}` | `groupName` | `MBACUDA` |

Readiness notes:

- Deferred fallback only; not part of the current create-now list.
- Static text appears before the first variable.
- HOLD for live QA after approval: the current hosting producer sends `whatsappType: "hosting_assignment"` but only passes `groupName` in `data`. App code should populate `memberName` and `hostingDate` before this template is tested with real recipients.
- Do not reduce the template to one variable. The app builder sends three body parameters for this key.

## 2. `villageclaq_relief_enrollment`

Template purpose: notify a member that they were enrolled in a relief plan.

App type/key: `relief_enrollment`

Meta status: EN/FR approved. Category: `UTILITY`.

Header:

```text
VillageClaq
```

EN body:

```text
VillageClaq relief update

Hi {{1}}, you have been enrolled in {{2}} for {{3}}. Open VillageClaq for details.
```

EN footer:

```text
VillageClaq.com — Your Community, Organized
```

FR body:

```text
Mise à jour de secours VillageClaq

Bonjour {{1}}, vous avez été inscrit(e) à {{2}} pour {{3}}. Ouvrez VillageClaq pour les détails.
```

FR footer:

```text
VillageClaq.com — Votre communauté, organisée
```

Variable order:

| Placeholder | App field | Sample value |
| --- | --- | --- |
| `{{1}}` | `memberName` | `Marie Ngono` |
| `{{2}}` | `planName` | `Emergency Relief Fund` |
| `{{3}}` | `groupName` | `Njimafor Diaspora` |

Readiness notes:

- Variable count matches the app builder in EN and FR.
- HOLD for live QA: the current relief enrollment producer passes `memberName: ""` while notifying multiple recipients. App code should supply the recipient member name before testing live WhatsApp sends.
- Do not remove `memberName` from the template without a matching app-code change.

## 3. `villageclaq_remittance_confirmed`

Template purpose: notify branch admins or leaders that a remittance was confirmed.

App type/key: `remittance_confirmed`

Meta status: EN/FR approved. Category: `UTILITY`.

Header:

```text
VillageClaq
```

EN body:

```text
VillageClaq remittance update

{{2}} has a confirmed remittance of {{1}}. Open VillageClaq for details.
```

EN footer:

```text
VillageClaq.com — Your Community, Organized
```

FR body:

```text
Mise à jour de versement VillageClaq

Un versement de {{1}} pour {{2}} a été confirmé. Ouvrez VillageClaq pour les détails.
```

FR footer:

```text
VillageClaq.com — Votre communauté, organisée
```

Variable order:

| Placeholder | App field | Sample value |
| --- | --- | --- |
| `{{1}}` | `amount` | `$250.00` |
| `{{2}}` | `groupName` | `MBACUDA Branch A` |

Readiness notes:

- Variable count matches the app builder in EN and FR.
- Variable order follows the app builder even though group context appears before amount in the English sentence after the static line.
- The category is transactional and should remain `UTILITY`.

## 4. `villageclaq_remittance_disputed`

Template purpose: notify branch admins or leaders that a remittance was disputed and needs review.

App type/key: `remittance_disputed`

Meta status: EN/FR approved. Category: `UTILITY`.

Header:

```text
VillageClaq
```

EN body:

```text
VillageClaq remittance review

{{2}} has a disputed remittance of {{1}}. Please open VillageClaq and review it with leadership.
```

EN footer:

```text
VillageClaq.com — Your Community, Organized
```

FR body:

```text
Révision de versement VillageClaq

Un versement de {{1}} pour {{2}} est contesté. Veuillez ouvrir VillageClaq et le vérifier avec la direction.
```

FR footer:

```text
VillageClaq.com — Votre communauté, organisée
```

Variable order:

| Placeholder | App field | Sample value |
| --- | --- | --- |
| `{{1}}` | `amount` | `$250.00` |
| `{{2}}` | `groupName` | `MBACUDA Branch A` |

Readiness notes:

- Variable count matches the app builder in EN and FR.
- Keep tone factual and non-accusatory to reduce approval risk and user alarm.
- The category is transactional and should remain `UTILITY`.

## 5. `villageclaq_subscription_expiring`

Template purpose: notify group billing contacts that their VillageClaq subscription is expiring.

App type/key: `subscription_expiring`

Meta status: EN/FR approved. Category: `UTILITY`.

Header:

```text
VillageClaq
```

EN body:

```text
VillageClaq subscription update

Your {{1}} subscription expires in {{2}} days. Renew in VillageClaq to keep your group's features active.
```

EN footer:

```text
VillageClaq.com — Your Community, Organized
```

FR body:

```text
Mise à jour d'abonnement VillageClaq

Votre abonnement {{1}} expire dans {{2}} jours. Renouvelez-le dans VillageClaq pour garder les fonctionnalités de votre groupe actives.
```

FR footer:

```text
VillageClaq.com — Votre communauté, organisée
```

Variable order:

| Placeholder | App field | Sample value |
| --- | --- | --- |
| `{{1}}` | `planName` | `Premium` |
| `{{2}}` | `days` | `7` |

Readiness notes:

- Variable count matches the app builder in EN and FR.
- This template cannot include `groupName` with the current app builder. The subscription cron has `groupName` available for in-app/email copy, but `buildSubscriptionExpiringParams` only sends `planName` and `days`.
- If group-specific subscription wording is required, first update app code to pass `groupName` as a third variable and submit a new/updated template after that app change.

## 6. `villageclaq_proxy_claim`

Template purpose: invite a proxy member to claim their membership and create an account.

App type/key: `proxy_claim`

Meta status: EN/FR approved. Category: `UTILITY`.

Header:

```text
VillageClaq
```

EN body:

```text
VillageClaq account claim

Hi {{1}}, you can claim your membership in {{2}} on VillageClaq here: {{3}}
```

EN footer:

```text
VillageClaq.com — Your Community, Organized
```

FR body:

```text
Réclamation de compte VillageClaq

Bonjour {{1}}, vous pouvez réclamer votre adhésion à {{2}} sur VillageClaq ici : {{3}}
```

FR footer:

```text
VillageClaq.com — Votre communauté, organisée
```

Variable order:

| Placeholder | App field | Sample value |
| --- | --- | --- |
| `{{1}}` | `memberName` | `Marie Ngono` |
| `{{2}}` | `groupName` | `MBACUDA` |
| `{{3}}` | `claimUrl` | `https://villageclaq.com/claim/sample-token` |

Readiness notes:

- Variable count matches the app builder in EN and FR.
- The current app passes the claim URL as a body variable, so do not add a URL button without a code change that sends button parameters.
- If a future template version moves the URL into a button, update app code to send button parameters. The approved current shape uses body variables.

## Post-Approval Checklist

Before controlled live QA:

- Confirm template names match `src/lib/whatsapp-templates.ts`.
- Confirm placeholder count and order match the tables above.
- Confirm all variables are body placeholders only.
- Confirm `hosting_assignment` remains held for mapping/producer cleanup.
- Confirm `relief_enrollment` remains held from live QA until its producer payload gap is fixed.
- Confirm `welcome` producer readiness: migration 00088 applied, and the QA account has the `new_member` WhatsApp preference enabled (default is OFF).

After this approval pass:

1. Re-run `npm run audit:whatsapp`.
2. Resolve `hosting_assignment` separately: either map it to the approved `villageclaq_hosting_reminder` template after producer cleanup, or submit a distinct assignment template later if product wants separate copy.
3. Fix the `relief_enrollment` producer payload gap before live WhatsApp QA.
4. Run controlled manual QA one template and one language at a time, only after explicit send authorization.
