# FQ-09/FQ-10/FQ-11 repairs and contact path — 2026-09-30

**Executor:** Claude Code running Claude Opus 5.5 (`claude-opus-5-5`) on Daybreak Blue's focused repair brief. **Branch:** `codex/qualification-repair-247c8881`. **Code:** `42d01285e79663e2d2988c4a83223d81cb264dd8`, plus review fix `ee935b3d7b61eb878d7f22f13d66c332fe13d092` (parent evidence tip `a5ac2188abac89614dea3be6767418291ba97139`; Claude's landing implementation `5cf7789253b8e830ed14a2a0fa78d7f9841cbec7` is unchanged). **Backend:** isolated `nisipxbuvndobyxqqglf` only; production `llbnliixczcqfftxpsmb` was not read or changed. Founder mode, external-delivery suppression and scheduler suppression were unchanged. All data is fictional. QA fixtures, Claude's demo group, the R-012 archive and earlier evidence were preserved; the demo group received only the two payments its prepared attempts were created for.

## Migrations — additive, isolated backend only

| Repository file | Applied version / recorded name | sha256 | Only change versus the previous definition |
|---|---|---|---|
| `supabase/migrations/20260930035205_fq09_contribution_due_day_clamp.sql` | `20260930035205` / `20260930035100_fq09_contribution_due_day_clamp` | `852a78874ca0c79e1340d92f5e4ba3e0f8d31e922b8e9f2d5ee7895fc16e2604` | `public.generate_obligations_for_type()`: `pg_catalog.least(NEW.due_day, 28)` → `LEAST(NEW.due_day, 28)` |
| `supabase/migrations/20260930035312_fq10_module_pair_amount_scale.sql` | `20260930035312` / `20260930035200_fq10_module_pair_amount_scale` | `299f1847591306eb6c1ddd1656a6061c815cd0f0d42ad9fd68a18de8cd8dfc49` | `financial_core.post_module_pair(...)`: `p_amount::text` → `pg_catalog.trim_scale(p_amount)::text` |

- Files carry the applied version (as the 2026-09-28 files do); the recorded name keeps the authoring timestamp.
- Live `prosrc` md5 equals the repository body: `632bc3cb…` for the trigger and `e7022cd1…` for `post_module_pair`.
- Both functions keep `SECURITY DEFINER` and `search_path=''`. `post_module_pair` executes only as its owner; the trigger function has postgres and service_role only. Neither `anon` nor `authenticated` can execute either.
- Replay safety: `financial_core.f3_amount` returns the whole part plus the fraction right-padded to the currency scale. Every input that posted before the repair therefore yields the same canonical amount and fingerprint (for example `20.00` and `20` both become `20.00` for CAD). Pre-repair events replay unchanged.
- Production is not migrated; both files join the production cutover outcome.

## FQ-09 — recurring due day: **REPAIRED, VERIFIED on isolated**

- **Cause** (reproduced 2026-09-29): the trigger called `pg_catalog.least`, but `LEAST` is SQL syntax, so every due day failed with `42883`.
- **Approved rule:** Build-10 `clampDueDay`: `LEAST(day, 28)` in the base month, with no forward rollover.
- **Rolled-back trigger probe** ([SQL](fq-repairs/probes/fq09-due-day-schedule.sql), [result](fq-repairs/probes/fq09-due-day-schedule.result.json)). One obligation per case:

  | Case | Due date |
  |---|---|
  | Ordinary day 15 | 2026-10-15 |
  | Day 31 in November | 11-28 |
  | Day 30 in non-leap February | 2027-02-28 |
  | Days 29 and 28 in leap February | 2028-02-28 |
  | Quarterly day 31 | 2026-10-28 |
  | Annual day 5 | 2027-01-05 |
  | One-time day 20 | 2026-12-20 |
  | No start date, day 10 | 2026-09-10 (base month) |

  - An invalid due day failed with check `23514` and left 0 types.
  - A retry created 1 type and 1 obligation.
  - A duplicate submit failed with `23505`.
- **Browser** (new fictional "Riverbend Social Club (Fictional FQ Verification)" `593d08d2-3d28-4dda-b1f8-8ad1510f2627`, CAD, owner plus 5 offline members):
  - Monthly CA$20.00 with due day 31 saved. The dialog states that days 29–31 fall back to the 28th.
  - Exactly 6 obligations were created, all due 2026-09-28.
  - A double click on Create produced one type.
  - Editing the French name left 6 obligations.
  - A one-time levy CA$15.50 due 2026-11-15 created 6 obligations.
  - [Dialog](fq-repairs/fq09-en-create-dialog.jpg), [created](fq-repairs/fq09-en-created.jpg).
- **Automated:** `test:fq-repairs` checks the client schedule engine against the trigger dates above.

## FQ-10 — exact-currency posting: **REPAIRED, VERIFIED on isolated**

- **Cause** (reproduced 2026-09-29): `payments.amount` is `NUMERIC(12,2)`, so XAF `5000` reached `post_module_pair` as `5000.00` and `f3_amount` (scale 0) raised `AMOUNT_PRECISION`. Every caller of the shared function was affected.
- **Rolled-back database probes after the migration** (fictional fixtures, JWT-scoped `authenticated` role). SQL and raw results are in [probes/](fq-repairs/probes/).
  - **Catalogue:** all 18 offered currencies match `src/lib/currencies.ts`. The 13 two-decimal currencies accept `1234.00` and `1234.50`. The five zero-decimal currencies (XAF, XOF, TZS, UGX, RWF) accept `1234.00` as `1234` and reject `1234.50` with `AMOUNT_PRECISION`.
  - **Dues:**
    - USD 0.10 and 12.30, and XOF 2,500 and 3,000, each posted with 2 postings, a zero sum and 1 audit link.
    - Replays returned `IDEMPOTENT_RETURN_EXISTING` with 0 new postings.
    - A bad amount returned `INVALID_DUES_INTENT`.
  - **Loans (XAF):**
    - A disbursement of 50,000 posted with 12 schedule rows.
    - A repayment of 5,000 principal plus 5,000 interest posted.
    - Both replays returned the existing result.
    - Fractional disbursement and repayment were rejected with `AMOUNT_PRECISION`.
  - **Tickets (XAF):**
    - A 1,500 ticket posted; its replay returned `ALREADY_POSTED`.
    - A fractional tier was rejected.
    - An outsider got `42501 UNAUTHORIZED`.
  - **Relief (XAF):**
    - A 5,000 owner receipt posted custody/income with a zero sum and 1 audit link; its replay returned the existing result.
    - An outsider got `42501 ACTIVE_FINANCES_MANAGE_REQUIRED`.
    - A fractional retry on the same receipt was refused as a dimension conflict.
- **Browser, persisted — XAF demo group** `f3d65556…`:
  - The two attempts that failed on 2026-09-29 (vouchers `98e22475…`, `3164d638…`) were recovered from **Review recent recording attempts**, one in EN and one in FR.
  - Each now has one confirmed 5,000.00 payment, one posted event (+5,000 custody / −5,000 income) and one audit link.
  - Replaying a posted attempt reported "no duplicate", and the counts stayed at 2 payments, 2 events and 2 audit rows.
  - Entering 5000.5 is refused before any request in EN and FR, with no new attempt. [EN](fq-repairs/fq10-en-precision.jpg), [FR](fq-repairs/fq10-fr-precision.jpg), [recovery](fq-repairs/fq10-en-recovery-before.jpg) → [FR after](fq-repairs/fq10-fr-recovery-after.jpg).
- **Browser, persisted — CAD verification group:**
  1. 12.345 is refused client-side ([screenshot](fq-repairs/fq10-en-cad-precision.jpg)).
  2. The first post failed with `INCOME_CATEGORY_REQUIRED`. This showed a pre-existing retry-identity defect: the form rebuilt `recorded_at` on every submit, so pressing Record Payment again was rejected as `CONFLICT`. The repair keeps the first timestamp per voucher. Afterwards, two submits per voucher in EN and FR left exactly one attempt each.
  3. The missing-category and missing-default-fund failures now show actionable EN/FR text with a Financial Configuration link, in both the form and the recovery panel. [EN](fq-repairs/fq10-en-income-category-required.jpg), [FR](fq-repairs/fq10-fr-income-category-required.jpg), [fund](fq-repairs/fq10-en-recovery-fund-required.jpg).
  4. After the category and default fund were created through that screen, the three attempts posted once each: 20.00, 12.50 and 5.00 CAD. Each has 1 event, a zero posting sum, 1 audit link and the canonical amount preserved. A replay produced no duplicate ([after](fq-repairs/fq10-en-cad-recovery-after.jpg)).
  5. After the review fix, the setup link opens a new tab (`target="_blank"`, `rel="noopener noreferrer"`). The copy says to retry this same payment and never record it as a new receipt.
     - **EN run:** the group's only income category was deactivated through the UI, then E's 15.50 levy payment was attempted. It failed with the new message ([EN](fq-repairs/fq10-en-newtab-setup-message.jpg)). A new category was created in the new tab, the tab was closed, and the original form still held the same voucher and amount. Pressing Record Payment posted it ([posted](fq-repairs/fq10-en-newtab-retry-posted.jpg)).
     - **FR run:** the same flow posted B's remaining 7.50 ([FR](fq-repairs/fq10-fr-newtab-setup-message.jpg)).
     - Each voucher has exactly one attempt, one payment, one balanced event and one audit link.
     - The group ends with 5 payments, 5 attempts, 0 unposted attempts and a zero ledger sum.
     - Earlier screenshots of this message show superseded wording.
- **Authorization:** unchanged; no grants were added and no private function was exposed.

## FQ-11 — due-date-aware overdue: **REPAIRED, VERIFIED on isolated**

- **Change:** the dashboard card and `/dashboard/contributions/unpaid` share `computeDuesStatusTotals` over the confirmed-only per-obligation engine (Build 12). "Today" comes from the group's reminder timezone (FQ-08 rule, default UTC). The card is red only when something is past due, and the caption shows the overdue amount, "Nothing overdue yet" or "All caught up".
- **Automated** (`test:fq-repairs`, anchored to FQ-08, Build 12 and the ledger scale table): future, due-today, past-due, partial, paid and waived; Douala versus UTC at 23:30 UTC; the 14-member demo shape.
- **CAD group in the browser** (UTC calendar, 2026-09-30 ~05:15–06:10 UTC). At each checkpoint the dashboard and the drill-down show the same result in EN and FR:

  | Checkpoint | Outstanding | Overdue |
  |---|---|---|
  | C waived | C$155.50 | C$62.50 |
  | Owner waived, then back to the dashboard by client-side navigation (no reload) | C$135.50 | C$42.50 |
  | E's levy paid | C$120.00 | C$42.50 |
  | B's remaining 7.50 paid | **C$112.50** | **C$35.00** |

  Final state:

  | Obligation | Members | Amount outstanding |
  |---|---|---|
  | September dues, due 2026-09-28 — paid | A; B (12.50 + 7.50) | 0 |
  | September dues — waived | C, owner | Excluded |
  | September dues — partial | D (5.00 paid) | 15.00, overdue |
  | September dues — unpaid, past due | E | 20.00, overdue |
  | Levy, due 2026-11-15 — paid | E (15.50) | 0 |
  | Levy — future, not overdue | Other five | 15.50 each (77.50) |

  - Only past-due items carry the Overdue badge.
  - Screenshots, first checkpoint: [EN card](fq-repairs/fq11-en-dashboard-cad.jpg), [EN list](fq-repairs/fq11-en-unpaid-cad.jpg), [FR card](fq-repairs/fq11-fr-dashboard-cad.jpg), [FR list](fq-repairs/fq11-fr-unpaid-cad.jpg).
  - Screenshots, final: [EN card](fq-repairs/fq11-en-dashboard-cad-final.jpg), [EN list](fq-repairs/fq11-en-unpaid-cad-final.jpg), [FR card](fq-repairs/fq11-fr-dashboard-cad-final.jpg), [FR list](fq-repairs/fq11-fr-unpaid-cad-final.jpg).
- **Refresh and completeness** (after the review):
  - A waive, or a recovered attempt, also refreshes the dashboard card.
  - Both screens page their obligation and payment reads past the PostgREST row cap with one shared count-driven helper (`src/lib/fetch-all-rows.ts`, 3 tests). A group above 1,000 rows no longer gets different truncated totals on each screen.
- **XAF demo group:**
  - 60,000 is due today (12 of the 14 monthly obligations) and 350,000 is a future levy.
  - Both screens show **410,000 FCFA** and "Nothing overdue yet" / "Rien en retard pour l'instant". Screenshots: [EN card](fq-repairs/fq11-en-dashboard-xaf.jpg), [FR card](fq-repairs/fq11-fr-dashboard-xaf.jpg), [lists](fq-repairs/fq11-en-unpaid-xaf.jpg).
- **Limit:** the browser run used UTC group calendars. The non-UTC midnight boundary is covered by the automated test only.

## Contact path: **form stores enquiries; no reader or mailbox — owner action required**

- **DNS** (Google resolver, 2026-09-30): `villageclaq.com` has no MX (SOA `ns21.domaincontrol.com`, GoDaddy), so support@, legal@ and privacy@ cannot receive mail.
  - `send.villageclaq.com` has an MX to Amazon SES feedback; that is Resend sending only.
  - DMARC is `p=reject`.
- **Changes:** `/contact` no longer offers support@ in EN or FR. An insert failure shows the localized error instead of raw database text.
- **Workflow:**
  - A fictional anonymous enquiry was stored in `contact_enquiries` (`25800065-0309-45bc-99b9-aa4a5ed97b9c`, status `new`).
  - Only platform staff can read enquiries, and this backend has **0** `platform_staff` rows.
  - No notification fires on insert, and the admin "reply" field is stored, not emailed.
  - The success message is therefore not evidence that anyone will read the enquiry here. [EN submitted](fq-repairs/contact-en-submitted.jpg), [FR page](fq-repairs/contact-fr.jpg).
- **Unverified details, left unchanged:** the phone `+1 301-433-5857`, the address "LawTekno LLC, Washington DC" and the hours are owner-provided (in the repo since `d21f4ac5`, 2026-03-23) and were not independently verified. The Terms and Privacy pages still name legal@ and privacy@; that legal copy is left for Jude.
- **Owner action (Jude)** — either or both:
  - **(A) Mailbox:** at GoDaddy DNS, add MX records (and the provider's SPF include) for a mailbox service and create monitored support@ (plus legal@/privacy@, or remove them from Terms/Privacy). Then send a test from an outside account and confirm receipt.
  - **(B) Enquiry reader:** approve a named platform-staff reader (account and role) on the backend serving the site. That lets `/admin/enquiries` be verified with the stored fictional enquiry, and production needs an active reader before promotion.

## Gates

| Gate | Result |
|---|---|
| TypeScript | `tsc --noEmit` passes |
| Lint (changed files) | One pre-existing error: `Date.now` in the dashboard activity feed, identical on base. Two pre-existing warnings. |
| Production build | Passes with the preview environment |
| `test:fq-repairs` | 12/12 on Node 22.23.2 |
| Full non-database Node 22 sweep | 48 of 69 scripts pass. 14 fail with the same 27 assertions as unmodified base `a5ac2188`. 7 `s0-cut2` suites call `psql` and time out without a local database. The rerun after the review fixes has the same failing set by name and counts, with 786 passing assertions. |
| Re-run after review fixes | TypeScript and lint (0 errors) pass; production build passes |

- This batch had introduced three regressions, all fixed before commit:
  - `money.ts` gained an import, breaking the reminder-producer harness that loads it standalone.
  - Two static guards pinned the old FQ-11 behaviour or select string; they are re-anchored to the FQ-11 requirement.

## Review participation

- **Independent review: not performed. Precise gap:**
  - This repository's independent reviewer is actual GPT-6 Sol; Astra's earlier delegation returned 403.
  - This Claude Code session has no tool to delegate to Sol or Astra, so none was attempted or retried, and no independent verdict is claimed.
  - No earlier Sol verdict is extended to this batch.
  - The one independent round for these repairs remains open for Jude or Daybreak Blue to delegate.
- **Executor self-review, not independent:** one read-only Claude Opus 5.5 subagent (same model family) statically reviewed `42d01285`. It found no P0 or P1, and confirmed the SQL deltas, grants, i18n keys, dependency arrays and the retry cache. Its three P2 findings were repaired in `ee935b3d`:
  1. The dashboard stayed stale after a waive. It is now refreshed after a waive and after a recovered attempt.
  2. The pre-existing PostgREST row cap could give each screen different truncated totals. Both screens now use a shared count-driven pager, with 3 tests.
  3. The setup link navigated away from the form, losing the voucher its copy promised. It now opens a new tab, and the copy says to retry the same payment and never re-record it.
  - The review's scope question was also resolved: the recovery panel now explains permission loss, an inactive account and a voucher conflict.
- **Focused repair verification** (one round, by the executor):
  - Client-side waive and navigation back to the dashboard updated the card without a reload (marker preserved).
  - New-tab setup retry in EN and FR: one attempt and one payment per voucher.
  - Same failing test set; build and type checks as listed above.

## Preview

**Verified integrated preview:** code `ee935b3d7b61eb878d7f22f13d66c332fe13d092` → `dpl_9eqguxQKZWDj4pZac64B6YtQDv7J` — https://villageclaq-k9u1judvp-gatekipas.vercel.app (READY, target Preview, Git source `ee935b3d`; Vercel sign-in required).

- **Status probe** (HTTP 200) — all true:
  - `founderTestMode`
  - `bindingMatches` (isolated `nisipxbuvndobyxqqglf`)
  - `serviceCredentialVerified`
  - `externalDeliverySuppressed`
  - `scheduledSideEffectsSuppressed`
- **Public pages:** `/en`, `/fr`, `/en/pricing`, `/fr/pricing`, `/en/contact`, `/fr/contact` and `/en/login` return 200 with the founder banner.
  - No page contains `support@villageclaq.com` or any `mailto:` link.
  - `/contact` keeps only the owner-provided `tel:` link.
- **Landing preserved:** the landing components, `/pricing`, the product screenshots and the `home` copy are byte-identical to `5cf7789`.
- **Signed-in flows** above ran on localhost against the same isolated backend and code. The executor did not sign in to the preview.
- **Production unchanged:** `villageclaq.com` and `www` still serve `dpl_2ERLa6H8yywAZCEDNXdhWc2EM3Kh`. Nothing was promoted, merged or pushed to `main`, and the temporary share cookie was deleted.
- The branch alias `villageclaq-git-codex-qualification-repair-247c8881-gatekipas.vercel.app` follows the later docs-only commit.
- Public promotion awaits Jude's visual acceptance of the redesign. It is founder-site promotion, not whole-product client-release qualification, which remains HOLD.

## Observations logged, not fixed here

- A fresh group needs a custody account, an active unrestricted default fund and an active income category before its first dues posting. The errors are now actionable. Bootstrapping defaults is a product decision.
- A monthly type created after its due day makes the current period immediately overdue (approved no-rollover rule); confirm this is the intended officer experience.
- Period labels use `to_char('Month YYYY')` and are space-padded ("October   2026"), since `00002`.
- Stored member standing still says "Good standing" beside overdue dues until it is recalculated.
- The French app formats money with English grouping ("410,000 FCFA", "C$155.50").
- Minor EN/FR copy:
  - "1 outstanding items"
  - Missing French non-breaking spaces in "Trier par:" and "Identifiant partagé du reçu:"
  - Untranslated "All (n)" and dialog "Close"
  - Select triggers showing raw values (`bank`, `income`)
- Plan-usage counters ("1/15 members", "0/2 contribution types") stay stale after adds until reload.
- Creating a contribution type or using "Enroll all" does not refresh the cached dashboard stats. Both screens can show pre-creation totals for up to 5 minutes; they still agree with each other.
- A deactivated financial category cannot be reactivated from the UI; officers create a new one.
- The Categories filter "All (n)" and the row "Actions" label stay in English on French screens.
- The contact form's optional phone is not stored (no column).
- The dashboard support widget reports success without checking the insert result.
- `manage_event` keeps a PUBLIC EXECUTE grant (it checks permissions internally).
