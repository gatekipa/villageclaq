# WhatsApp Missing Template Copy Guide

Date: 2026-06-10

Scope: copy-preparation guide for VillageClaq WhatsApp templates that were missing or incomplete after the full template coverage audit. This guide is for Meta submission only. It does not change app code, template mappings, notification routing, Meta settings, credentials, deployments, or production data.

## Executive Summary

Submit the following missing or incomplete templates before resuming full WhatsApp manual QA:

| App type/key | Recommended Meta template name | Current gap | Recommendation |
| --- | --- | --- | --- |
| `welcome` | `villageclaq_welcome` | EN approved, FR missing | Add FR language variant to the existing template name if Meta allows it. |
| `hosting_assignment` | `villageclaq_hosting_assignment` | EN/FR missing; current producer does not populate all variables | Submit EN/FR copy, but hold live QA until producer data supplies member name and date. |
| `relief_enrollment` | `villageclaq_relief_enrollment` | EN/FR missing; current producer passes blank `memberName` | Submit EN/FR copy, but hold live QA until producer data supplies member name. |
| `remittance_confirmed` | `villageclaq_remittance_confirmed` | EN/FR missing | Submit EN/FR copy. |
| `remittance_disputed` | `villageclaq_remittance_disputed` | EN/FR missing | Submit EN/FR copy. |
| `subscription_expiring` | `villageclaq_subscription_expiring` | EN/FR missing; no group variable in app builder | Submit EN/FR copy with current two-variable order; add group context only in a later code change. |
| `proxy_claim` | `villageclaq_proxy_claim` | EN/FR missing | Submit EN/FR copy. |

General submission rules:

- Use the exact template names listed here unless Meta forces a new name.
- Use static text before the first variable for approval safety.
- Keep every variable as a body variable. Do not put variables in headers or buttons unless app code is updated to send those components.
- Use no buttons for this round. The current app builders only send body parameters.
- Use the EN footer `VillageClaq.com — Your Community, Organized`.
- Use the FR footer `VillageClaq.com — Votre communauté, organisée`.
- Submit both `en` and `fr` where missing. For `welcome`, add only the missing `fr` variant unless Meta requires a full replacement.
- Sample values below are safe examples for Meta review. They are not production data and do not include phone numbers, tokens, or secrets.

## Variable Source Review

| App type/key | Builder | Current body variable order | Producer path | Payload readiness |
| --- | --- | --- | --- | --- |
| `welcome` | `buildWelcomeParams` | `{{1}} memberName`, `{{2}} groupName` | Dispatcher support; current invitation acceptance sends email/SMS welcome but no confirmed WhatsApp welcome producer found | Template FR missing; producer path should be confirmed before live WhatsApp QA. |
| `hosting_assignment` | `buildHostingAssignmentParams` | `{{1}} memberName`, `{{2}} hostingDate`, `{{3}} groupName` | Hosting page uses `notifyBulkFromClient` with `whatsappType: "hosting_assignment"` | HOLD for live QA: current producer data includes `groupName` but does not populate `memberName` or `hostingDate`. |
| `relief_enrollment` | `buildReliefEnrollmentParams` | `{{1}} memberName`, `{{2}} planName`, `{{3}} groupName` | Relief enrollment page uses `notifyBulkFromClient` | HOLD for live QA: current producer data sets `memberName` to an empty string. |
| `remittance_confirmed` | `buildRemittanceConfirmedParams` | `{{1}} amount`, `{{2}} groupName` | Relief remittances page uses `notifyBulkFromClient` | Ready for submission. |
| `remittance_disputed` | `buildRemittanceDisputedParams` | `{{1}} amount`, `{{2}} groupName` | Relief remittances page uses `notifyBulkFromClient` | Ready for submission. |
| `subscription_expiring` | `buildSubscriptionExpiringParams` | `{{1}} planName`, `{{2}} days` | Subscription reminders cron calls `dispatchWhatsApp` | Ready for submission with no group context; adding group context requires a future app-code change. |
| `proxy_claim` | `buildProxyClaimParams` | `{{1}} memberName`, `{{2}} groupName`, `{{3}} claimUrl` | `/api/proxy-claim/send` calls `dispatchWhatsApp` | Ready for submission. |

## Meta Submission Defaults

- Header type: text
- Header text: `VillageClaq`
- Buttons: none
- Category: use `UTILITY` unless noted otherwise
- URL handling: keep URLs in body placeholders only for templates where the current app already passes a URL body variable
- Sample phone numbers: not needed and not included

## 1. `villageclaq_welcome`

Template purpose: welcome a user after joining or claiming membership in a group.

App type/key: `welcome`

Category recommendation: keep the existing Meta category for the approved EN row. The coverage audit saw the EN row as `MARKETING`; if Meta allows category selection for the new FR language row, use the same category as EN for consistency.

Header:

```text
VillageClaq
```

EN copy status: already approved in Meta. Keep the existing EN language row unless a future v2 alignment project is opened.

EN body reference:

```text
Welcome {{1}}! You are now a member of {{2}} on VillageClaq. Open the app to get started.
```

EN footer recommendation for any future replacement:

```text
VillageClaq.com — Your Community, Organized
```

FR body to submit:

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

Approval notes:

- The FR copy starts with static text before variables.
- If Meta requires strict language-component parity with the existing EN row, submit the FR body without the extra static first line and footer:

```text
Bienvenue {{1}} ! Vous êtes maintenant membre de {{2}} sur VillageClaq. Ouvrez l'application pour commencer.
```

- Live WhatsApp QA should confirm the producer path first because current invitation acceptance clearly sends email/SMS welcome notifications, but a confirmed WhatsApp welcome producer was not found in the current audit.

## 2. `villageclaq_hosting_assignment`

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

Approval notes:

- Static text appears before the first variable.
- HOLD for live QA after approval: the current hosting producer sends `whatsappType: "hosting_assignment"` but only passes `groupName` in `data`. App code should populate `memberName` and `hostingDate` before this template is tested with real recipients.
- Do not reduce the template to one variable. The app builder sends three body parameters for this key.

## 3. `villageclaq_relief_enrollment`

Template purpose: notify a member that they were enrolled in a relief plan.

App type/key: `relief_enrollment`

Category recommendation: `UTILITY`

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

Approval notes:

- Static text appears before the first variable.
- HOLD for live QA after approval: the current relief enrollment producer passes `memberName: ""` while notifying multiple recipients. App code should supply the recipient member name before testing live WhatsApp sends.
- Do not remove `memberName` from the template without a matching app-code change.

## 4. `villageclaq_remittance_confirmed`

Template purpose: notify branch admins or leaders that a remittance was confirmed.

App type/key: `remittance_confirmed`

Category recommendation: `UTILITY`

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

Approval notes:

- Static text appears before the first variable.
- Variable order follows the app builder even though group context appears before amount in the English sentence after the static line.
- The category is transactional and should remain `UTILITY`.

## 5. `villageclaq_remittance_disputed`

Template purpose: notify branch admins or leaders that a remittance was disputed and needs review.

App type/key: `remittance_disputed`

Category recommendation: `UTILITY`

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

Approval notes:

- Static text appears before the first variable.
- Keep tone factual and non-accusatory to reduce approval risk and user alarm.
- The category is transactional and should remain `UTILITY`.

## 6. `villageclaq_subscription_expiring`

Template purpose: notify group billing contacts that their VillageClaq subscription is expiring.

App type/key: `subscription_expiring`

Category recommendation: `UTILITY`

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

Approval notes:

- Static text appears before the first variable.
- This template cannot include `groupName` with the current app builder. The subscription cron has `groupName` available for in-app/email copy, but `buildSubscriptionExpiringParams` only sends `planName` and `days`.
- Submit this two-variable template now if the immediate goal is to unblock QA for current app behavior.
- If group-specific subscription wording is required, hold submission and first update app code to pass `groupName` as a third variable.

## 7. `villageclaq_proxy_claim`

Template purpose: invite a proxy member to claim their membership and create an account.

App type/key: `proxy_claim`

Category recommendation: `UTILITY`

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

Approval notes:

- Static text appears before the first variable.
- The current app passes the claim URL as a body variable, so do not add a URL button without a code change that sends button parameters.
- If Meta flags the body URL placeholder, resubmit with the same placeholder order and shorter copy:

```text
VillageClaq account claim

Hi {{1}}, claim your {{2}} membership on VillageClaq: {{3}}
```

```text
Réclamation de compte VillageClaq

Bonjour {{1}}, réclamez votre adhésion à {{2}} sur VillageClaq : {{3}}
```

## Submission Checklist

Before submitting:

- Confirm template names match `src/lib/whatsapp-templates.ts`.
- Confirm placeholder count and order match the tables above.
- Confirm all variables are body placeholders only.
- Confirm headers are static text.
- Confirm buttons are omitted.
- Confirm sample values do not contain production phone numbers, secrets, or real tokens.
- Confirm `hosting_assignment` and `relief_enrollment` remain held from live QA until their producer payload gaps are fixed.

After Meta approval:

1. Re-run `npm run audit:whatsapp`.
2. Update the template coverage audit with the newly approved status if desired.
3. Fix producer payload gaps for `hosting_assignment` and `relief_enrollment` before live WhatsApp QA.
4. Run controlled manual QA one template and one language at a time, only after explicit send authorization.
