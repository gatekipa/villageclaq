# WhatsApp Welcome — Utility-Category Replacement Template

Date: 2026-06-11

Status: COPY PREPARED — NOT SUBMITTED TO META. No app code changes in this document.

## Why this template exists

The controlled EN welcome QA on 2026-06-11 proved the full app pipeline (queue row →
drain send → `providerMessageId` stored → webhook status correlation → strict
per-membership idempotency), but Meta blocked delivery with error `131049`
("This message was not delivered to maintain healthy ecosystem engagement").

Root cause: `villageclaq_welcome` is approved as **MARKETING**, and Meta has paused
marketing-category template delivery to US numbers (announced for "+1" recipients;
Meta identifies US numbers specifically — Canadian +1 numbers are not officially in
scope). VillageClaq's diaspora members are largely US-based, so the welcome message
must be re-homed in a **UTILITY**-category template to be deliverable to them.

Note: `131049` is also returned for Meta's per-user marketing frequency cap globally.
Here the US pause is the operative cause because the pause blocks all marketing
templates to US numbers unconditionally — but a future `131049` on a non-US number
would point to the frequency cap instead, not the pause.

The app pipeline needs no changes — only the Meta template (and, later, a one-string
app mapping update plus test/docs updates listed at the end).

## Recommended template name

**`villageclaq_member_joined`**

Rationale over `villageclaq_welcome_utility`:

- The name describes the transactional event (a membership record was created), which
  aligns the template with Meta's UTILITY definition.
- Industry guidance widely reports that greeting-style names like "welcome" correlate
  with MARKETING categorization. Meta documents content-based classification, so treat
  the name as a secondary signal — but there is no reason to spend that signal.
- A `_utility` suffix on a greeting-named template can read as category gaming to
  reviewers; an event-named template does not.

## Category

**UTILITY** — the message confirms a specific account/membership state change that the
recipient themselves initiated (accepting an invitation, claiming a profile, or
redeeming a join code). Per Meta guidance, confirmations of a specific transaction,
account, or membership change are UTILITY.

## Variables (unchanged from the current welcome producer)

| Placeholder | App field | Sample value |
| --- | --- | --- |
| `{{1}}` | `memberName` | `Marie Ngono` |
| `{{2}}` | `groupName` | `MBACUDA` |

The variable order MUST remain `memberName`, `groupName` — the app's
`buildWelcomeParams` sends these positionally, and no app code changes accompany this
template. Meta requires template bodies not to begin or end with a placeholder, nor to
place placeholders adjacent to one another; all bodies below comply.

## Primary copy

Header type: text. Buttons: none. URLs: none.

### EN

Header:

```text
Membership Confirmation
```

Body:

```text
Hello {{1}}, your membership in {{2}} has been activated on VillageClaq. This number is now registered for your group's official notices.
```

Footer:

```text
Sent by VillageClaq
```

### FR

Header:

```text
Confirmation d'adhésion
```

Body:

```text
Bonjour {{1}}, votre adhésion au groupe {{2}} est désormais active sur VillageClaq. Ce numéro est enregistré pour les communications officielles de votre groupe.
```

Footer:

```text
Envoyé par VillageClaq
```

### Copy rules applied

- Confirms a completed membership state change ("has been activated" / "est désormais
  active") — transactional, not promotional.
- References the group by variable. The FR body says "au groupe {{2}}" (not "à {{2}}")
  deliberately: group names beginning with a French article ("Le Njangi…", "Les
  Anciens…") would otherwise require an impossible à+le contraction. The appositive
  "au groupe {{2}}" is grammatical with any group name.
- The second sentence states a **present account state** ("is now registered"), not a
  forward-looking promise — first-contact "you will receive…" phrasing is the classic
  pattern that flips onboarding templates to MARKETING during silent classification.
- No marketing language: no "welcome aboard", no "get started", no feature list, no
  call to action, no app-download prompt. The word "welcome" appears nowhere in the
  name, header, body, or footer in either language.
- The footer is deliberately neutral. The brand tagline used elsewhere
  ("VillageClaq.com — Your Community, Organized" / "VillageClaq.com — Votre
  communauté, organisée") reads as a slogan and is intentionally avoided here to
  reduce MARKETING signals.

## Approval risk notes

1. **Categories are auto-assigned silently.** Since April 2025 there is no
   accept/decline dialog at submission: if Meta's classifier disagrees with the
   selected UTILITY category, the template is simply **approved as MARKETING** with
   nothing to refuse. After submission, **check the approved category** of each
   language row in WhatsApp Manager before relying on the template.
2. **If a row lands as MARKETING**: file a category review/appeal (available up to 60
   days from the category decision), or **edit the template body in place** to the
   fallback copy below and resubmit — editing triggers re-review and preserves the
   name. **Do NOT delete the template to retry**: a deleted template's name is locked
   for 30 days, which would burn `villageclaq_member_joined` for a month.
3. The second sentence (account-state registration) is the most contestable element.
   Expectation-setting is sometimes accepted in UTILITY confirmations; if a row still
   classifies as MARKETING, the fallback below drops that sentence entirely and is a
   near-certain UTILITY classification (pure state-change receipt).
4. Even as UTILITY, ordinary quality-rating and per-number messaging limits still
   apply; the US marketing pause does not.
5. Submit EN and FR under the same template name (two language rows), with the sample
   values from the table above. **Each language row is reviewed and statused
   independently** — confirm that BOTH the `en` and `fr` rows show status APPROVED and
   category UTILITY before the post-approval PR. Do not flip the app mapping if only
   one language row is approved. No sample phone numbers are needed or included.
6. **Post-approval recategorization is possible.** Meta continuously re-evaluates
   approved templates and can flip UTILITY → MARKETING with 24 hours' notice (via the
   `message_template_category_update` webhook field / email) or, for accounts flagged
   for category abuse, with no notice. Treat any future `131049` on this template as a
   signal to re-check its current category in WhatsApp Manager.

## Fallback copy (if a language row classifies as MARKETING)

Strictly a state-change receipt — single sentence, no expectation-setting:

EN body:

```text
Hello {{1}}, this confirms that your membership in {{2}} has been created on VillageClaq.
```

FR body:

```text
Bonjour {{1}}, nous vous confirmons la création de votre adhésion au groupe {{2}} sur VillageClaq.
```

Header/footer unchanged from the primary copy. Variable order unchanged. Apply via
**edit-in-place** on the existing template (see risk note 2), not delete-and-recreate.

## After approval (separate PR — not part of this document)

1. Update `WA_TEMPLATES.WELCOME` in `src/lib/whatsapp-templates.ts` from
   `villageclaq_welcome` to `villageclaq_member_joined` (one string).
2. Update `scripts/test-welcome-producer.mjs`, which hardcodes `villageclaq_welcome`
   in its mocked `WA_TEMPLATES` and two assertions, then re-run
   `npm run test:welcome-producer`.
3. Update the `welcome` entry in `scripts/audit-whatsapp.mjs` (`template:` field) and
   re-run `npm run audit:whatsapp`.
4. Update the welcome rows in `docs/whatsapp-template-coverage-audit.md` and
   `docs/whatsapp-missing-template-copy.md`, and record the 2026-06-11 `131049`
   blocked-delivery outcome in the coverage-audit addendum so the welcome row no
   longer reads as delivery-ready under the MARKETING template.
5. Re-run the controlled welcome QA (fresh join event for the QA recipient ending
   `857`) and confirm `latestProviderStatus` reaches `delivered`/`read`.
6. The old `villageclaq_welcome` MARKETING template can be retired in Meta afterward
   (do not delete before the app mapping switch is deployed).

No part of this document changes app behavior. The `welcome` producer continues to use
`villageclaq_welcome` until the post-approval PR lands.
