# Federated Relief Plan — Technical Design Document

## Overview

The Federated Relief Plan feature extends the existing relief/welfare system to support **multi-branch organizations**. An HQ group can create a shared relief plan that branches adopt. Branches collect contributions from their local members (including non-members enrolled specifically for the plan) and remit funds to HQ. HQ monitors enrollment, collection progress, and remittances across all branches from a single rollup dashboard.

## Problem Solved

African community organizations (njangis, alumni unions, village associations) often have a central headquarters and multiple local branches. Before this feature, each branch managed its own independent relief plans. This caused:

- **Fragmented coverage** — members moving between branches lost relief eligibility.
- **No central visibility** — HQ couldn't see aggregate enrollment or collection rates.
- **Manual remittance tracking** — branch treasurers sent funds to HQ with no audit trail.
- **Exclusion of non-members** — community members who wanted relief coverage but didn't want full group membership had no enrollment path.

The federated model solves all four by introducing shared plans, enrollment types, collection modes, and a remittance ledger.

## Collection Modes

Each shared relief plan specifies a `collection_mode` that determines who collects member contributions:

| Mode | Column Value | Behavior |
|------|-------------|----------|
| **Branch Collect** | `branch_collect` | The branch where the member is enrolled collects payments locally. Branch treasurer records payments and periodically remits to HQ. |
| **HQ Collect** | `hq_collect` | HQ collects directly from all members. Branches have no collection responsibility. |
| **Either** | `either` | Both HQ and branches can collect. The `collecting_group_id` on each enrollment record indicates which group is responsible. |

Collection mode is set when the plan is created at HQ and applies to all branches that adopt it.

## Enrollment Types

Each `relief_enrollments` record has an `enrollment_type` that classifies the enrollee:

| Type | Column Value | Description |
|------|-------------|-------------|
| **Full Member** | `full_member` | A regular group member (has a membership in the branch). Standard enrollment — pays contributions and can file claims. |
| **Relief Only** | `relief_only` | Someone who joins the group specifically for relief coverage. They pay relief contributions but may not participate in other group activities. Subject to `relief_only_rules` JSONB on the plan (e.g., waiting period, reduced claim limits). |
| **External** | `external` | A person outside the organization who is allowed to enroll in the relief plan. Subject to `external_rules` JSONB (e.g., higher contribution rate, claim cap). Cannot file claims through the standard UI — claims must be submitted by an admin on their behalf. |

The enrollment type is selected during the enrollment flow and is stored on `relief_enrollments.enrollment_type`.

## Claim Processing

The `claim_processing` field on `relief_plans` determines how claims are handled:

| Mode | Column Value | Behavior |
|------|-------------|----------|
| **Branch Process** | `branch_process` | The branch where the member is enrolled reviews and approves/denies the claim. |
| **HQ Process** | `hq_process` | All claims are forwarded to HQ for centralized review. |
| **Hybrid** | `hybrid` | Branch does initial review, HQ does final approval. |

## Data Model

### Modified Tables

#### `relief_plans` (new columns)

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `shared_from_org` | `BOOLEAN` | `false` | Whether this plan is shared from HQ to branches |
| `collection_mode` | `TEXT` | `'branch_collect'` | One of: `branch_collect`, `hq_collect`, `either` |
| `claim_processing` | `TEXT` | `'branch_process'` | One of: `branch_process`, `hq_process`, `hybrid` |
| `relief_only_rules` | `JSONB` | `NULL` | Rules for `relief_only` enrollees (waiting_period_days, max_claim_amount, etc.) |
| `external_rules` | `JSONB` | `NULL` | Rules for `external` enrollees (contribution_multiplier, claim_cap, etc.) |

#### `relief_enrollments` (new columns)

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `enrollment_type` | `TEXT` | `'full_member'` | One of: `full_member`, `relief_only`, `external` |
| `collecting_group_id` | `UUID` | `NULL` | FK to `groups.id` — the branch responsible for collecting this enrollee's payments |

#### `payments` (new column)

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `relief_plan_id` | `UUID` | `NULL` | FK to `relief_plans.id` — tags a payment as being for a specific relief plan |

### New Tables

#### `relief_remittances`

Tracks fund transfers from branches to HQ.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID` | Primary key |
| `relief_plan_id` | `UUID` | FK to `relief_plans.id` |
| `branch_group_id` | `UUID` | FK to `groups.id` — the branch sending funds |
| `hq_group_id` | `UUID` | FK to `groups.id` — the HQ receiving funds |
| `amount` | `NUMERIC` | Amount remitted |
| `currency` | `TEXT` | Currency of the remittance |
| `period_start` | `DATE` | Start of the collection period |
| `period_end` | `DATE` | End of the collection period |
| `status` | `TEXT` | One of: `submitted`, `confirmed`, `disputed` |
| `submitted_by` | `UUID` | FK to `profiles.id` — branch treasurer who submitted |
| `confirmed_by` | `UUID` | FK to `profiles.id` — HQ admin who confirmed |
| `reference` | `TEXT` | Payment reference / receipt number |
| `notes` | `TEXT` | Optional notes |
| `created_at` | `TIMESTAMPTZ` | Auto-set |
| `updated_at` | `TIMESTAMPTZ` | Auto-set |

### New Views

#### `relief_branch_summary`

A PostgreSQL view that aggregates enrollment and collection data per plan per branch. Used by the HQ Relief Rollup dashboard and Report #24.

```sql
SELECT
  rp.id AS relief_plan_id,
  rp.name AS plan_name,
  re.collecting_group_id,
  g.name AS branch_name,
  g.currency AS branch_currency,
  COUNT(re.id) AS enrolled_count,
  COUNT(re.id) FILTER (WHERE re.enrollment_type = 'full_member') AS full_member_count,
  COUNT(re.id) FILTER (WHERE re.enrollment_type = 'relief_only') AS relief_only_count,
  COUNT(re.id) FILTER (WHERE re.enrollment_type = 'external') AS external_count,
  COUNT(DISTINCT p.membership_id) FILTER (WHERE p.created_at >= date_trunc('month', CURRENT_DATE)) AS paid_this_month,
  COALESCE(SUM(p.amount) FILTER (WHERE p.created_at >= date_trunc('month', CURRENT_DATE) AND p.status = 'confirmed'), 0) AS collected_this_month,
  COALESCE(SUM(rr.amount) FILTER (WHERE rr.status = 'confirmed'), 0) AS total_remitted
FROM relief_plans rp
JOIN relief_enrollments re ON re.plan_id = rp.id
LEFT JOIN groups g ON g.id = re.collecting_group_id
LEFT JOIN payments p ON p.relief_plan_id = rp.id AND p.membership_id = re.membership_id AND p.status = 'confirmed'
LEFT JOIN relief_remittances rr ON rr.relief_plan_id = rp.id AND rr.branch_group_id = re.collecting_group_id
WHERE rp.shared_from_org = true
GROUP BY rp.id, rp.name, re.collecting_group_id, g.name, g.currency;
```

### Indexes

| Index | Table | Columns | Notes |
|-------|-------|---------|-------|
| `idx_relief_enrollments_collecting_group` | `relief_enrollments` | `collecting_group_id` | Speeds up branch-level queries |
| `idx_relief_enrollments_enrollment_type` | `relief_enrollments` | `enrollment_type` | Speeds up type-based filtering |
| `idx_payments_relief_plan_id` | `payments` | `relief_plan_id` | Partial index (WHERE relief_plan_id IS NOT NULL) |

## Remittance Flow

1. **Branch treasurer** navigates to Relief > Remittances.
2. Selects a shared relief plan and enters the amount collected, period dates, and optional reference.
3. Submits the remittance — creates a `relief_remittances` row with `status = 'submitted'`.
4. **HQ admin** sees the pending remittance in the same Remittances page (filtered to their HQ group).
5. HQ admin can **confirm** (sets `status = 'confirmed'`, records `confirmed_by`) or **dispute** (sets `status = 'disputed'`).
6. Confirmed remittances appear in the `relief_branch_summary` view's `total_remitted` column.
7. Both branch and HQ see the full remittance history in a table sorted by date.

## Report #24: Federated Relief Enrollment

### Location

- **Reports Hub**: Report card #24 in the `operations` category.
- **Visibility**: HQ groups only (`currentGroup.group_level === "hq"`). Hidden from standalone and branch groups.
- **Subscription Tier**: Pro and Enterprise (not available on Free or Starter).

### Data Source

Queries the `relief_branch_summary` view filtered to plans owned by the current HQ group (`shared_from_org = true`).

### Content

1. **AI Insight Banner** — Auto-fetched on load via `POST /api/ai-insights` with `reportType: "report24"` and aggregate stats.
2. **4 Stat Cards**:
   - Enrolled Members (total across all branches)
   - Branches Collecting (distinct collecting_group_id count)
   - Collected This Month (sum of collected_this_month)
   - Total Remitted (sum of confirmed remittances)
3. **8-Column Enrollment Table**:
   - Plan | Branch | Enrolled | Full Members | Relief Only | External | Paid This Month | Collected
   - Visual row differentiation: purple tint for rows with external enrollees, blue tint for relief_only
   - Badge rendering for non-zero relief_only and external counts
   - Totals footer row
4. **Exports**: CSV, PDF, WhatsApp summary, Print — all following existing report patterns.

### i18n

All strings use `t("reports.fed*")` keys. Both `messages/en.json` and `messages/fr.json` contain matching key sets.

## RLS Security

- `relief_plans`: Existing RLS policies apply. Users can only read plans for groups they belong to (via `get_user_group_ids()`).
- `relief_enrollments`: Existing RLS policies apply. Scoped to group membership.
- `relief_remittances`: RLS enabled. Users can read/write remittances where `branch_group_id` or `hq_group_id` is in their group set.
- `relief_branch_summary`: View inherits RLS from underlying tables. Only returns rows where the user has access to the relief plan's group.
- `payments.relief_plan_id`: The payment itself is already RLS-gated to the user's group. The new column is just a nullable FK.

## i18n Notes

- All UI strings go through `useTranslations()` / `t()` from `next-intl`.
- Relief plan names are bilingual: `name` (English) and `name_fr` (French). Display uses `locale === "fr" ? name_fr || name : name`.
- Enrollment type labels use dedicated i18n keys (e.g., `reports.fedFullMember`, `reports.fedReliefOnlyType`, `reports.fedExternalType`).
- Date formatting uses `getDateLocale(locale)` for locale-appropriate display.
- Currency formatting uses `formatAmount(amount, currency)` which handles XAF/XOF (no decimals, "FCFA" suffix) correctly.

## Migration Reference

All schema changes are in `supabase/migrations/00045_federated_relief_plan_schema.sql`. Run manually in Supabase SQL Editor.

## UI Pages

| Page | Path | Purpose |
|------|------|---------|
| Relief Plans | `/dashboard/relief/plans` | Create/edit plans with federation fields (HQ) |
| Enrollment | `/dashboard/relief/enrollment` | Enroll members with enrollment_type selector |
| My Relief | `/dashboard/relief/my` | Member view with federation badges |
| HQ Relief Rollup | `/dashboard/enterprise/relief-rollup` | HQ dashboard with branch summary |
| Remittances | `/dashboard/relief/remittances` | Branch submit / HQ confirm remittances |
| Record Payment | `/dashboard/contributions/record` | Relief plan dropdown for tagging payments |
| Report #24 | `/dashboard/reports/24` | Federated Relief Enrollment report (HQ only) |
