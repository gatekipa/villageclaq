# Founder landing-page publication — 2026-09-29

**Application source:** `06d6b4a7eef3d1e04d9fae6ba6530990d1edcdd3` on `codex/qualification-repair-247c8881`.
**Final protected preview:** `dpl_8dG8dRdkrQji68b73fXgAoKUCZkR`, `https://villageclaq-r4bp1x9co-gatekipas.vercel.app` (READY; Vercel sign-in/share access required).
**Promoted production deployment:** `dpl_2ERLa6H8yywAZCEDNXdhWc2EM3Kh`, READY on `https://villageclaq.com` and `https://www.villageclaq.com`. Promotion was from that exact preview; there was no main merge or database migration.
**Rollback deployment:** `dpl_5GexELUQtB4GZSkzApWJaC19LLnU`, observed READY on both aliases immediately before promotion. The isolated database was not reset. The two new fictional official minutes and one offline fictional member used for screenshots remain test records; a Vercel rollback does not remove them.

## Genuine source screens and asset handling

All ten WebP assets in `public/images/product/` were cropped/compressed from actual browser screenshots of the authenticated founder application on the isolated `nisipxbuvndobyxqqglf` branch. Combined source asset size is 155,868 bytes. The group and records are fictional. Crops remove account identifiers, the group selector, internal URLs, browser chrome and the test-environment banner; the running site retains its conspicuous founder-test notice. No customer quote, usage statistic or adoption claim is presented.

| EN / FR assets | Actual application source | Presentation |
|---|---|---|
| `minutes.webp`, `minutes-fr.webp` | Official published standalone meeting minutes, one neutral fictional record per language | Desktop hero, full application content; illustrative-data caption |
| `minutes-mobile-en.webp`, `minutes-mobile-fr.webp` | Focused discussion area of the same published minutes | Mobile hero, complete decision and action text visible without horizontal scroll |
| `import.webp`, `import-fr.webp` | Native member CSV/XLSX import dialog, step 1 | Membership story; no contact or imported row shown |
| `summary.webp`, `summary-fr.webp` | Permitted read-only member financial summary with fictional XAF totals | Financial-visibility story; no private ledger/member detail |
| `hosting.webp`, `hosting-fr.webp` | Active community hosting roster and Amina Mensah's fictional assignment | Hosting story; no QA roster shown |

## Bounded review and repair

Astra delegation failed with the previously known 403 before execution; no Astra review is claimed. The approved `gpt-6-sol` delegation executed one read-only visual/product review of `eaf275369df9a94dd4fc2bf7ce5c338e1ad151a3` and recommended HOLD for English-only product screenshots on the French page and offscreen mobile screenshot content. The reviewer runtime did not independently expose its model identifier; the orchestration explicitly selected `gpt-6-sol`. Daybreak Blue repaired those two specific findings at `2d74d6cc8559752e87857f46e699eb847dbc7df0` and `06d6b4a7eef3d1e04d9fae6ba6530990d1edcdd3`, then performed the focused verification below. No second independent round or broader product review was started.

## Verification

- `npx tsc --noEmit`, focused ESLint for edited TSX, `git diff --check`, local optimized build and the final Vercel clean-cache optimized build passed. A prior cached preview attempt hit a Turbopack Google-font resolution error; the exact candidate's `--force` build succeeded and became the promoted preview.
- Final preview and canonical live `www` status probes returned `founderTestMode`, `bindingMatches`, `serviceCredentialVerified`, `externalDeliverySuppressed` and `scheduledSideEffectsSuppressed` all `true`. Preview environment values were inspected without printing credentials: actual and expected project references were both `nisipxbuvndobyxqqglf`.
- Protected-preview browser checked EN and FR desktop and 375px mobile views. Locale-specific image sources loaded; the mobile hero showed the full decision sentence; document scroll width equaled client width. Primary exploration CTA reached `#product`; founder sign-in reached the FR login route and, with an existing fictional session, the correct scoped dashboard. The footer routes exist in the optimized build.
- Public browser after promotion displayed EN and FR hero images, the localized founder banner, and a mobile FR layout without horizontal page overflow. The public FR sign-in CTA led an already authenticated fictional session to its scoped dashboard. [EN desktop](landing-page/live-en-desktop.jpg), [FR desktop](landing-page/live-fr-desktop.jpg), [FR mobile](landing-page/live-fr-mobile.jpg).
- Performance scope: the 10 cropped WebP sources total about 156 KB, served through responsive `next/image` sizes. No Lighthouse/Core Web Vitals score is claimed. A browser performance probe stalled and yielded no reliable lab score; it did not alter the page.

**Disposition:** Landing-page outcome published for founder testing. Whole-product client-release qualification remains under the existing HOLD and R-012 quarantine; this page publication does not change them.
