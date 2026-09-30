# Landing redesign candidate — 2026-09-29 (preview only)

**Status:** PREVIEW ONLY — awaiting Jude's visual acceptance. Not promoted; `villageclaq.com` and `www` still serve `dpl_2ERLa6H8yywAZCEDNXdhWc2EM3Kh`.
**Owner and model:** Claude Code running **Claude Opus 5.5** (`claude-opus-5-5`) designed, wrote and implemented this candidate. Daybreak Blue owns integration, functional verification and deployment; Jude owns visual acceptance.
**Review:** one consolidated read-only review by a Claude Opus 5.5 subagent (same model family as the author, so not independent), followed by one focused correction pass by the author. No other agent reviewed or approved this candidate.
**Implementation commit:** `5cf7789253b8e830ed14a2a0fa78d7f9841cbec7` on `codex/qualification-repair-247c8881` (parent `f8c21b4`, published application `06d6b4a`).
**Protected preview:** `dpl_CEXr1Q1r7zE6Sa5MGYUQx4KfmSdy` — `https://villageclaq-o2539w4o3-gatekipas.vercel.app` (READY, target Preview, Git source `5cf7789`; Vercel sign-in required; branch alias `villageclaq-git-codex-qualification-repair-247c8881-gatekipas.vercel.app` follows later pushes)

## What changed

- New landing (`src/app/[locale]/page.tsx`) and `/pricing` built from scoped components in `src/components/landing/` (header with language switch and mobile menu, hero, audience, four roles, four feature chapters, also-included grid, three getting-started paths with join-code entry, pricing with monthly/yearly toggle and comparison table, FAQ, closing CTA, footer). Typography: Newsreader (display) and Hanken Grotesk (text) via `next/font`; scoped palette in `landing.css`; scroll reveal only under `prefers-reduced-motion: no-preference`.
- All copy lives in the new `home` namespace of `messages/en.json` and `messages/fr.json` (key parity). French uses a non-breaking space before `? : ; !`.
- Pricing is derived from `TIERS` in `src/lib/subscription-tiers.ts`; no price or limit is hand-typed in the page.
- Conversion-path truthfulness: removed the fabricated testimonial card from `/login` and `/signup`, removed the fabricated statistics block (500+, 10,000+, $2M+, 11) from `/about`, pointed `/about` and `/contact` footers at the new footer strings, hardened `safeRedirect()` on `/login` and `/signup` (rejects `//`, backslashes and locale-prefixed protocol-relative paths).
- App-wide font fix: `<body>` now carries `font-sans`, so the app renders Geist instead of the browser serif fallback (Tailwind's `--font-sans` was defined on `body` but `font-sans` applied to `html`). This affects every page and needs Daybreak Blue's integration check.
- The founder banner gained `data-founder-banner` so the landing header can sit directly under it.
- `formatAmount()` accepts an optional number locale (default `en-US`, so app output is unchanged); only the landing pricing passes `fr-FR`.
- `/contact` no longer promises a reply "within 48 hours" (EN/FR), because nobody has confirmed that commitment.

## Screens: real application, fictional data

All 24 WebP assets in `public/images/product/v2/` (2.0 MB) are crops of actual browser screenshots of the signed-in founder admin on the isolated `nisipxbuvndobyxqqglf` backend, captured between about 02:00 and 02:45 UTC on 2026-09-30 with headless Chrome at 2× (desktop/tablet) and 3× (390 px phone). Nothing was drawn, edited or composited. Crops exclude the test-environment banner, credentials, contact details, internal URLs and debug overlays; the running page keeps its founder notice.

Source group: **Green Valley Hometown Association**, created for this purpose through the normal UI on the isolated backend (Free plan). Existing QA groups were not modified.

| Asset (EN/FR) | Screen | Notes |
|---|---|---|
| `hero-*` / `hero-mobile-*` | Members, grid view, role filter "Member", scrolled to the cards | Owner row filtered out so only fictional members show |
| `contrib-mobile-*` | Contributions on a phone (types only) | Also the hero phone accent (desktop only); not payment evidence |
| `import-*` / `import-mobile-*` | Bulk import, step 2 of 3, 13 valid rows (before import) | Cropped exactly to the dialog |
| `contrib-*` | Contribution types: Monthly dues 5,000 FCFA; Community hall levy 25,000 FCFA one-time, due 15/12/2026 | Shows configured types only — not evidence that payment posting works (FQ-10). The Free-plan upsell banner above the title is outside the crop |
| `hosting-*` / `hosting-mobile-*` | Hosting roster KPIs (next host, missed 0, fairness, compliance), 720 px tablet layout / phone | Cropped above the tab bar (see follow-ups) |
| `minutes-*` / `minutes-mobile-*` | Published standalone minutes: EN "September general meeting", FR "Réunion du bureau exécutif" / phone list view | Desktop crop ends mid-document with a CSS fade |
| `roles-*` / `roles-mobile-*` | Roles & Permissions: six default positions with enabled-permission counts | Full app chrome on desktop |

Visible genuine app quirks (not edited out of the product; logged as follow-ups): the import role column shows the raw value `member`, including on the French screen; some French screens show English group data (role names, contribution descriptions) because the demo group entered them in English; the phone contributions header clips its "2/2 contribution types" chip.

### Demo data created on the isolated backend (normal UI only)

- Group "Green Valley Hometown Association" (`f3d65556-110e-4d01-b507-2a741bdc5dec`), founder admin as owner, Free plan.
- 13 offline members imported from a CSV with names only (no email, phone or consent): Amina Mensah, Joseph Nkeng, Grace Achu, Emmanuel Tabi, Esther Nchang, Paul Fonkeng, Mary Ngwa, Daniel Etta, Beatrice Ayuk, Samuel Ndi, Rose Mbah, Peter Tanyi, Florence Nkem. Import sends nothing.
- Contribution types: Monthly dues (5,000 FCFA, monthly, no due day — see FQ-09) and Community hall levy (25,000 FCFA, one-time, due 15/12/2026).
- One upcoming event, "October general meeting" (4 October 2026, 15:00).
- Finance configuration required by payment recording: one custody account, the default fund and one income category.
- Hosting roster "2026–2027 Monthly Hosting" (sequential, 14 assignments); the two 01/09/2026 turns show as completed.
- Two standalone minutes, published, with agenda, decisions and action items (no assignee).
- **No payment was posted** (FQ-10). Two prepared, unposted payment intents remain from the failed attempts (voucher ids `98e22475-72a2-48a8-9573-0f4fb85b4f91`, `3164d638-603b-44d6-b0db-8cb58fe89060`).
- No permission, position assignment, plan or entitlement was changed. External delivery and schedulers stayed suppressed.

## Defects found while entering demo data (handed to Daybreak Blue; not fixed here)

Recorded with reproduction steps, observed errors, affected paths and source lines in `docs/BUILD_STATUS.md` under "FQ-09…FQ-11 reproduction record":

- **FQ-09** — a monthly contribution with a due day cannot be saved: `42883 function pg_catalog.least(integer, integer) does not exist` (`20260927210445_active_contribution_obligations.sql:27`).
- **FQ-10** — XAF/XOF payments cannot be posted: `post_dues_record_intent` fails with `AMOUNT_PRECISION` because `post_module_pair` passes `NUMERIC(12,2)` text such as `5000.00` to `f3_amount`, which rejects fractional digits for scale-0 currencies (`00173_relief_cash_state_pairs.sql:222`, `00120_f3_02_secure_posting_idempotency.sql:108`); the dialog shows no error.
- **FQ-11** — the admin dashboard labels the whole outstanding total "overdue" (420,000 FCFA here) although nothing is past due (`src/app/[locale]/(dashboard)/dashboard/page.tsx:481-501`).

No landing screenshot shows a posted payment, a collection figure, the dashboard or an overdue label. The money chapter's claim that payments are recorded depends on FQ-10; see the promotion condition in `docs/BUILD_STATUS.md`.

## Review and correction pass

One read-only review by a Claude Opus 5.5 subagent (same model family, so not independent) reported 2 P1, 5 P2 and 9 P3 items. The single correction pass fixed:
- **Plan wording:** "Committees" instead of "committees and sub-groups" (`subGroups` is Enterprise-only); Starter's savings allowance shown as 1 (table "Up to 1"); the footnote no longer implies every configured limit is listed; "One login for many groups" removed from the every-plan list because `maxGroupsPerUser` caps it per plan.
- **Evidence screenshots:** retaken from a production build, because the earlier dev-server captures showed the Next.js dev-tools badge.
- **French and wording:** French number formatting on pricing; a shorter French join-code placeholder; plain "test environment / test phase" wording instead of "founder test"; "hébergement" to match the app; non-breaking hyphens; "aren't on sale yet" in the FAQ; footer language labels moved to messages.
- **Contact page:** no longer promises a reply within 48 hours.
- **Layout and accessibility:** comparison icons and text centred on one axis; `/pricing` heading outline h1 → h2; alt text that holds for both desktop and phone crops; balanced caption wrapping.

Left as genuine app states and logged in the backlog: the import table scrolls horizontally inside its dialog, tab bars clip their last tab, and the minutes shot shows admin buttons. No second review round was run.

## Verification (after the correction pass; local production build of `5cf7789`, founder flags on)

- `npx tsc --noEmit` pass; ESLint on edited files 0 errors (4 pre-existing `<img>` warnings in `/login` and `/signup`); `next build` with the Preview variables: compiled, 47/47 static pages. The checks below ran against `next start` of that build.
- Existing guard suites: clean-start navigation, adversarial audit, agentic action intents (messages), event reminder producer (messages), storage buckets, founder delivery suppression — 70/70 pass. `test:m2-*` need Node ≥ 22 (`--experimental-strip-types`) and were not run on local Node 20.
- Pages: `/`, `/pricing`, `/about`, `/contact` × EN/FR × 1440 px/390 px — 16/16 HTTP 200, 0 raw translation keys, 0 horizontal overflow (also 0 at 320 px), 0 control characters, no fabricated statistics or testimonials; `/pricing` titles "Pricing | VillageClaq" / "Tarifs | VillageClaq".
- Links: 27/27 unique landing links return 200 or resolve to an existing anchor, including `https://gracetechnologie.com`.
- Pricing after the correction pass: EN `$5.00 / month | 2,500 FCFA / month`, FR `$5,00 / mois | 2 500 FCFA / mois`; Starter lists "1 savings circle" and "Committees"; the comparison's icon and text centres match on desktop and phone.
- Local status probe: `founderTestMode`, `bindingMatches`, `externalDeliverySuppressed` and `scheduledSideEffectsSuppressed` true; `serviceCredentialVerified` false locally because the pulled environment file carries no service key (checked on the Preview below).
- Images: every rendered product image loads, and its alt text fits both the desktop and phone crops. Decorative logos use empty alt inside labelled links. The desktop-only phone accent is not fetched on phones.
- Interactions: header top equals banner bottom (EN 38.3 px; FR phone 59.5 px); nav anchors land below the header; mobile menu opens, Escape closes it and returns focus, links close it; tab order skip link → brand → Features → How it works → Pricing → FAQ → language → Sign in → CTA, each with a visible outline; pricing toggle shows TIERS prices (monthly $0/$5/$15/$40 and 0/2,500/7,500/20,000 FCFA; yearly $0/$49/$149/$399 and 0/25,000/75,000/200,000 FCFA); join code "  zz test1 " routes to `/en/join/ZZTEST1`; reduced motion disables reveal animations and smooth scroll; dark color scheme keeps the scoped light palette.
- Found and fixed during verification: 23 French strings had lost `? : ;` (a prior text pass wrote U+0001 instead of the punctuation). All 23 were restored from the source copy; the FR landing now renders 16 `?` with non-breaking spaces and no control characters.
- Not measured: Lighthouse, Core Web Vitals or any performance score.

## Protected Preview verification

- Vercel built `5cf7789` from the Git push to `codex/qualification-repair-247c8881` as Preview `dpl_CEXr1Q1r7zE6Sa5MGYUQx4KfmSdy` (READY, target Preview). `villageclaq.com`, `www.villageclaq.com` and `villageclaq.vercel.app` still resolve to production `dpl_2ERLa6H8yywAZCEDNXdhWc2EM3Kh`; nothing was promoted and `main` did not move.
- Access used the authorized Vercel MCP share flow; the share token was not recorded.
- `/api/founder-test/status` on the Preview returned `founderTestMode`, `bindingMatches`, `serviceCredentialVerified`, `externalDeliverySuppressed` and `scheduledSideEffectsSuppressed` all `true`.
- `/en`, `/fr`, `/en/pricing`, `/fr/pricing`, `/en/contact` and `/fr/about` returned 200. The landing references its 12 locale-specific v2 screens per language, and they are served. French pricing renders `2 500 FCFA`, "1 tontine d’épargne", "Commissions" and "Jusqu’à 1".
- Chrome (EN/FR, 1440 px and 390 px): 0 horizontal overflow, all product screens loaded, 0 broken images, 0 console errors, 0 failed requests, no development overlay, and the localized founder banner present. Preview hero captures: [EN desktop](landing-redesign/preview-en-desktop-hero.jpg), [EN phone](landing-redesign/preview-en-mobile-hero.jpg), [FR desktop](landing-redesign/preview-fr-desktop-hero.jpg), [FR phone](landing-redesign/preview-fr-mobile-hero.jpg).
- **Disposition:** preview candidate ready for Jude's visual acceptance. It is not accepted merely because it builds and its links return 200. Promotion is subject to the FQ-09/FQ-10 condition in `docs/BUILD_STATUS.md` and to Daybreak Blue's integration.

## Screenshots

Captured from a local **production build** of `5cf7789` (`next start`, founder flags on, same isolated backend), not the dev server, so no development overlay appears. Desktop is 1440 px, phone is 390 px; full pages are stitched from slices because Chromium limits one capture to 16,384 px. JPEG copies are compressed for the repository.

| View | Full page | Hero | Pricing | Footer |
|---|---|---|---|---|
| EN desktop | [full](landing-redesign/en-desktop-full.jpg) | [hero](landing-redesign/en-desktop-hero.jpg) | [pricing](landing-redesign/en-desktop-pricing.jpg) | [footer](landing-redesign/en-desktop-footer.jpg) |
| EN phone | [full](landing-redesign/en-mobile-full.jpg) | [hero](landing-redesign/en-mobile-hero.jpg) | [pricing](landing-redesign/en-mobile-pricing.jpg) | [footer](landing-redesign/en-mobile-footer.jpg) |
| FR desktop | [full](landing-redesign/fr-desktop-full.jpg) | [hero](landing-redesign/fr-desktop-hero.jpg) | [pricing](landing-redesign/fr-desktop-pricing.jpg) | [footer](landing-redesign/fr-desktop-footer.jpg) |
| FR phone | [full](landing-redesign/fr-mobile-full.jpg) | [hero](landing-redesign/fr-mobile-hero.jpg) | [pricing](landing-redesign/fr-mobile-pricing.jpg) | [footer](landing-redesign/fr-mobile-footer.jpg) |
