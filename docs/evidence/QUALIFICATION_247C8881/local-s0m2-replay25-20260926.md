# Candidate local S0/M2 upgrade and behavior — replay25

Owner: Daybreak Blue. Source branch: `codex/qualification-repair-247c8881`, previous published tip `78cac463168f3eff8c185659e442771be1ddd7ec`. The source and probes in this evidence are included in the accompanying repair commit. Production `llbnliixczcqfftxpsmb` was read only; no hosted write, merge or deployment was performed for this result.

## Environment and exact floor

Local PostgreSQL 17 at `localhost:55432`, isolated database `villageclaq_upgrade_replay25`. The input is the previously preserved **production S0/M2 schema-only** dump, SHA-256 `3b539557f807efca02b92fde9307228c45a6b398abc60a96e000150b1d1bdd4a`, filtered import SHA-256 `63983281e445e84aa14f0086b1696168144967bcbcc283b0c8afd137e5d1af9e`, plus synthetic local platform fixture SHA-256 `016170b2147631a4ca391a140ad6ff4ea96db12297668d6c54a65e4306e9151f` and the ignored import postlude. The filtered import omits only `supabase_admin`-owned default-privilege statements that the temporary login cannot alter; the existing [baseline record](production-s0m2-upgrade-20260926.md) gives the exact difference. No production rows, auth records, credentials or secrets are part of this fixture.

Created a fresh local database; applied those three inputs, then **32 repository SQL files** sorted by filename from `001170_s0_m2_uuid_v5_compat.sql` through `00142_relief_receipt_boundary.sql`, each with `psql -X -v ON_ERROR_STOP=1 -f`. All 32 returned exit code 0. This is a direct-SQL **diagnostic**: `supabase_migrations.schema_migrations` was not populated, so it is not a `supabase db push` rehearsal or a production-equivalent restore. The unchanged F24 six-file result remains valid only on its documented fixture.

## Behavioral probes on the replay25 catalog

Each listed script uses fictional actors and rolls back its data. `psql -X -v ON_ERROR_STOP=1 -f` exited 0 for each:

| Probe | Demonstrated result |
|---|---|
| `scripts/test-hierarchy-2-0.sql` | Root/closure/history, five-level shape, depth-32 bound, move/archive, cycle/cross-org denial, unit-grant revocation, branch-owner non-escalation. |
| `scripts/test-dues-security-revision-2.sql` | Non-refundable income versus refundable/conditional liability, later allocation without second receipt, identity conflict/explicit second, pending denial, revoked/cross-tenant denial, audit forgery denial and fault rollback/retry. |
| `scripts/test-elections-2-0.sql` | Frozen/deduplicated electorate, ambiguous identity denial, active membership, cross-tenant scope, raw-ballot denial, atomic finalization/publication and direct-finalization denial. |
| `scripts/test-events-ticket-occurrence.sql` | Server tier creation, paid ticket event/postings/audit once, legitimate second purchase, capacity and audit-fault retry. |
| `scripts/test-growth-referral-activation.sql` | Opaque token claim/replay/revoke, real activation by qualified core activity, operator aggregate. Token mutation now always changes a character; the former test could leave a token unchanged when it began with `0`. |
| `scripts/test-growth-publication.sql` | Card consent/minimal projection/revocation; profile private default, unlisted versus public directory, safe request, abuse report and unpublish. |
| `scripts/test-relief-receipt-boundary.sql` | Direct Relief confirmation denied; owner-collected non-refundable receipt is one event, two postings, one private audit link, idempotent retry; refundable receipt is custody plus liability with no income; dues adapter rejects Relief tag; cross-tenant/revoked replay and audit-link read denied; injected audit failure rolls back and retry succeeds once. |

**Before/after Relief reproduction:** on replay22 before the guard change, an authenticated fictional admin inserted a `confirmed` Relief-tagged payment and the query returned `financial_event_id = NULL`, `event_count = 0`. On replay25 the same direct confirmation is denied; a `pending_confirmation` record remains inert until `post_owner_relief_receipt` commits it with F3 and server audit. Two concurrent separate `psql` sessions then retried the same fictional pending payment: one returned `POSTED`, the other `IDEMPOTENT_RETURN_EXISTING`; final counts were **1 event / 2 postings / 1 private audit link**. The owner receipt UI is mounted and reads audit verification through a server RPC; its live browser state remains untested.

`npx tsc --noEmit` exited 0, targeted `eslint --quiet` on the changed Relief UI/hook exited 0, and `npm run build` exited 0 with network access for the four declared Google Fonts. The build used a temporary output directory to avoid a Windows OneDrive lock; `next.config.ts` was restored and build-generated `tsconfig.json` content was restored exactly. The initial sandbox build failed only on font fetching, not source compilation.

## Acceptance still open

The existing paid Supabase branch `nisipxbuvndobyxqqglf` is active but has zero migration-history rows and no candidate hierarchy. A specific additional-reset approval is pending. Until an authorized reset and supported history-accurate upgrade run, this local result cannot close VC-03. The production-bound Vercel Preview is not a test-write target. Candidate-bound browser, role-effective hosted grants, two-tab/stale-state, EN/FR mobile, full FCG-1 and R-001–R-011 (especially branch-agent receipt/remittance/projection) remain under VC-04. Actual GPT-6 Sol independent review has not started. VC-01/02 retain their earlier closed tested scope; this local integration does not replace their hosted evidence.
