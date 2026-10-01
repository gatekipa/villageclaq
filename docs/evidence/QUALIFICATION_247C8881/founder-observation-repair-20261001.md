# Founder-observation repair — 2026-10-01

Application: `b7b79522bd21b2382fd3916e5f229d5a219ecd44` on `codex/qualification-repair-247c8881`. Preview: `dpl_DfnWXbzPPHR5dztAGmTnR6j3TZPZ` at `https://villageclaq-lhtp0lsfp-gatekipas.vercel.app`, READY, target Preview. The Vercel CLI deployed a clean checkout at that application commit. Vercel's CLI-deployment metadata does not expose a Git SHA, so checkout cleanliness and the deployment command are the source-to-artifact link.

## Scope and safeguards

The protected Preview's `/api/founder-test/status` returned all `true`: `founderTestMode`, `bindingMatches`, `serviceCredentialVerified`, `externalDeliverySuppressed`, and `scheduledSideEffectsSuppressed`. The binding is isolated Supabase `nisipxbuvndobyxqqglf`. Public `www.villageclaq.com` still resolves to READY production deployment `dpl_A1JBP7jiWQDA9k91evgMj6sWgkyd`; no promotion occurred. Production database, live billing, and external messaging remain untouched. R-012 remains quarantined. The five historical FQ-09 obligations remain for separate reconciliation.

Applied additive isolated migrations in this batch: `20261001040439_founder_dues_receipt_reversal.sql`, `20261001042416_founder_dues_credit_refund_audit.sql`, and `20261001042928_founder_dues_review_repairs.sql`. Prior applied migrations were not rewritten.

## Before and after

Before this batch, member Payment History did not carry an exact membership filter, exports lacked native XLSX/PDF files, standing implied a full score without a breakdown, no-event attendance looked like zero attendance, and a confirmed nonrefundable receipt lacked a governed correction path. The old direct credit refund entrypoint could bypass a reasoned audit. Existing public Riverside receipts and obligations were read only.

After this batch, a member profile links to Payment History with the exact membership and group IDs, displays the member filter, and retrieves all matching pages. The same filtered rows feed CSV, native typed XLSX, and PDF. Payment/receipt UUID is distinct from optional external reference. Net confirmed collections are grouped by currency. EN/FR standing displays honest missing-breakdown and no-event states; posted cash excludes reversed/refunded dues. The nonrefundable correction posts a linked reversing F3 event and updates the obligation and standing; the refundable credit refund keeps its receipt and requires a reason, a durable audit, and a linked refund. Both offer an explicit officer confirmation and retry protection. Existing finance history remains append only.

## Persisted fictional checks

In separate Founder Observation QA Circle (`c6997c91-5d8e-4af5-afc9-478c36e9a7db`), a $3 confirmed nonrefundable receipt `8f95b34f-7fbd-43a6-a7e3-ba4f8d14ff67` was corrected once by linked event `a3f68bdf-011f-42e3-94d2-077bd9885350`: original kept, cash and income net zero, obligation paid 3 to pending 0, Casey standing good to suspended, statement +3/-3 net zero. A separate $2 refundable receipt `4b76acdf-d5c1-4c76-af41-b878f933c5a9` was refunded once by event `8f238447-6609-4a43-b0a5-e57e28d3adce`: original kept, custody and liability net zero, four postings and one audit. Same-request retry returned the original event; changed reason or new request was denied. Transaction rollback probes left no partial posting. Ordinary-member and cross-group calls were denied. The deprecated direct refund route returned `42501 REASONED_REFUND_REQUIRED`; recognition still worked. Historical inactive account/category/fund identifiers were reversible with exact matched original postings.

Riverside Test Association was read back without mutation: Morgan's two distinct confirmed posted receipts remain $4 and $6; Alex's $10 obligation remains unpaid. Morgan's stored obligation remains pending with amount_paid 0 while the two valid receipts are not linked by obligation ID or application rows. The UI's same-member/type allocation displays $10 paid/$0 outstanding. This inherited linkage discrepancy is a named historical reconciliation item; this batch did not silently rewrite it. R-012 and five historical FQ-09 obligations remain separate owner-led holds.

## Preview walkthrough and files

The existing fictional QA officer signed in to the final protected Preview. The French member-scoped route for FQ Member B showed exactly two posted rows, CAD 7.50 and 12.50, total C$20, with a visible filter and clear action. The earlier EN route showed the same two rows. CSV `C:\Users\nanye\Downloads\villageclaq-payments-2026-10-01.csv` contained two exact payment IDs, numeric amounts, blank external references and CAD 20 net. XLSX `C:\Users\nanye\Downloads\villageclaq-payments-2026-10-01.xlsx` contained two rows, typed September 30 dates, numeric 7.5/12.5 amounts and numeric 20 total. The final French PDF `C:\Users\nanye\Downloads\villageclaq-payments-2026-10-01 (2).pdf` was downloaded from `dpl_DfnWXbzPPHR5dztAGmTnR6j3TZPZ`; `pypdf` extracted one page with member scope, both payment IDs, 20 CAD, and proper `é`, `è`, and `ç` glyphs, with zero replacement characters. Its earlier PDF predecessor exposed broken accents, then application `b7b7952` embedded licensed Geist to repair it. Downloads were retained.

At a 390 × 844 phone emulation, the French history page had document width 390 px, no horizontal overflow, and visible Export, member scope/clear link, search, status filters and CAD total. The browser viewport was restored afterward. The prior EN/FR desktop member flow and local responsive checks were reused for unchanged views.

Resume Jude's visual review at FQ Member B's profile, follow Payment History, inspect the two filtered rows and CSV/XLSX/PDF, then inspect member standing and the officer correction dialog. The existing public site stays on `dpl_A1JBP7jiWQDA9k91evgMj6sWgkyd` pending separate acceptance.

## Gates and independent review

TypeScript and optimized build passed after the final font change; product-money tests 30/30, focused export tests 3/3, and FQ repair tests 13/13 passed. `git diff --check` was clean. One actual GPT-6 Sol independent consolidated review initially held for two material findings. One focused repair verification passed after the additive audit and reversal repairs. One final blocker-only check passed the embedded-font PDF delta. No review count was restarted. The reviewer did not inspect the downloaded PDF binary; the separate browser download and extraction above close that runtime check. No new material blocker was found in this scoped batch.

FQ-09 future original-day generation, FQ-10 posting precision/retry, and FQ-11 complete outstanding/overdue retrieval retain their prior scoped dispositions. Historical FQ-09 reconciliation, Riverside linkage, billing/paid access, member standing lifecycle, global onboarding and production providers remain in the existing tracker.
