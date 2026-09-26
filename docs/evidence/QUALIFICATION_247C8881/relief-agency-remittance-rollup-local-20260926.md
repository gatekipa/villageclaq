# Relief agency, remittance, and rollup local qualification

Owner: Daybreak Blue. Candidate code: the accompanying focused repair commit on `codex/qualification-repair-247c8881` (full SHA recorded in `BUILD_STATUS.md` after commit). Production `llbnliixczcqfftxpsmb` was read only. No hosted migration, production write, merge, or deployment occurred.

## Exact diagnostic floor

Fresh isolated local PostgreSQL **17.11 UTF-8** database `villageclaq_upgrade_replay31` at `localhost:55432`. Inputs: production S0/M2 **schema-only** dump SHA-256 `3b539557f807efca02b92fde9307228c45a6b398abc60a96e000150b1d1bdd4a`; filtered local import `63983281e445e84aa14f0086b1696168144967bcbcc283b0c8afd137e5d1af9e`; synthetic platform fixture `016170b2147631a4ca391a140ad6ff4ea96db12297668d6c54a65e4306e9151f`; ignored local postlude. The filter only omits `supabase_admin` default-privilege statements the temporary login cannot alter. The 32 repository files from `001170` through `00145` applied in filename order with `psql -X -v ON_ERROR_STOP=1 -f` and exit 0. The local database has **no `supabase_migrations.schema_migrations` relation**. This is direct-SQL behavior evidence, **not** a history-accurate `supabase db push` rehearsal or production-equivalent restore. The prior F24 result retains its documented fixture limit.

## Material before and after

- Before `00143`/`00144`, the branch-agent Relief path had no owner receivable recognition or reciprocal F3 remittance. Authenticated roles had direct `INSERT/UPDATE` on `relief_remittances`; a branch admin could change status without a distinct owner decision. S0/M2 also granted `TRUNCATE` on affected Relief, payment, and membership tables, which RLS cannot constrain. After the repair, submission and decision are server commands with current branch/owner finance authorization, frozen owner/branch lineage, request identity, a maker/checker split, and two separately audited F3 occurrences. Direct remittance writes and affected `TRUNCATE` grants are denied to ordinary roles. Historical direct rows are not silently qualified or backfilled.
- The old Relief summary joined enrollment × payment × remittance rows before aggregation. The fictional counterexample has **1 enrollment, 2 confirmed receipts (70 + 20), and 2 remittances (70 confirmed, 20 pending)**. The legacy join produces **4 joined rows, collected 180, remitted 140**. The replacement pre-aggregates each source at plan/branch grain and returns **1 enrollment, 1 paid member, collected 90, remitted 70**. Cross-organization summary access is denied.
- A shared F3 helper edit initially rejected the existing dues condition-satisfied adapter because it retains the receipt account as lineage on a noncash effect. The affected probe failed at `MODULE_PAIR_ACCOUNT_CONTRACT`; the validation was narrowed to require an account for custody legs. The dues, ticket, owner Relief, agency Relief/remittance, and loan probes then passed on the final replay. The earlier failure is retained as regression-sensitivity evidence, not counted as a passing candidate.

## Executed behavior on replay31

All calls below used fictional users and transactional rollback; no external messaging was sent. Each script exited 0 under `psql -X -v ON_ERROR_STOP=1`:

| Probe | Verified behavior |
|---|---|
| `scripts/test-relief-agency-receipts.sql` | Branch receipt posts custody + liability once; owner recognition posts receivable + restricted income once; both have separate private audit links. Remittance submission posts branch liability/custody and owner confirmation posts custody/receivable without second income. Retries produce zero new postings. Direct decision, changed payload, branch self-confirmation, cross-tenant and revoked replay are denied. Injected audit failure leaves no remittance/event; retry posts once. No ordinary `TRUNCATE` on affected payment/remittance/membership chain. Correct-grain rollup and cross-org denial pass. |
| `scripts/test-dues-security-revision-2.sql` | Changed identity conflict, deliberate second payment, revoked/cross-tenant denial, audit-forgery denial and audit-fault rollback/retry pass after the helper repair. |
| `scripts/test-events-ticket-occurrence.sql` | Authorized tier command, direct-write denial, once-only purchase, legitimate second purchase, cap and audit-fault retry pass. |
| `scripts/test-relief-receipt-boundary.sql` | Direct Relief confirmation denied; owner receipt income/liability classification, one event/audit, retry, cross-tenant/revoked denial and audit-fault rollback/retry pass. |
| Ignored `.vercel/local-loan-probe.sql` | Loan principal, principal/interest repayment and idempotent retries pass against the changed shared helper; the probe rolls back. |

`npx tsc --noEmit`, targeted `eslint --quiet` for changed Relief UI, and `npm run build` passed. The build used a temporary output directory to avoid the known OneDrive `.next` lock, fetched declared Google Fonts, and restored `next.config.ts` and `tsconfig.json` exactly afterward. The remittance page now calls the server commands, requires custody account and restricted fund, shows the pending/recovery and audited-result states, and pins actions to the route group. This is source/build evidence; candidate-bound browser behavior remains untested.

## Open release acceptance

The billed isolated Supabase branch `nisipxbuvndobyxqqglf` has not received this upgrade. Its additional reset needs the pending specific authorization; accurate migration history, effective hosted grants, browser EN/FR/mobile/two-tab journeys, and independent GPT-6 Sol review remain open. R-002–R-006 and R-010–R-012 still require the exact plan/coverage/claim/projection/cutover contracts. R-007–R-009 are **verified locally for the new non-refundable agency path only**, not full Relief milestone closure. VC-01/02 retain their previously closed tested scope; this integration probe does not replace their hosted evidence. Production remains HOLD.
