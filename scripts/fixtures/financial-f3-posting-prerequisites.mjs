// Disposable PostgreSQL prerequisite bootstrap. No remote/database URL accepted.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
export const migrationChain = [
  "20260906140228_financial_ledger_epochs_expand.sql",
  "20260906140229_financial_payment_integrity.sql",
  "20260908043912_standing_confirmed_basis_parity.sql",
  "20260908154824_f3_core_ledger_foundation.sql",
  "20260908215831_f3_secure_posting_idempotency.sql",
];
export function installPrerequisites(sql) {
  sql(read("scripts/fixtures/financial-p1.sql"));
  const money = read("supabase/migrations/00002_money_tables.sql");
  sql(money.slice(money.indexOf("CREATE TYPE contribution_frequency"), money.indexOf("CREATE TRIGGER update_contribution_types")));
  sql("ALTER TYPE payment_method ADD VALUE 'other'; ALTER TABLE groups ADD COLUMN updated_at timestamptz DEFAULT now(); ALTER TABLE payments ADD COLUMN status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','pending_confirmation','rejected')), ADD COLUMN payment_date date DEFAULT CURRENT_DATE, ADD COLUMN relief_plan_id uuid; CREATE TABLE payment_obligation_applications(payment_id uuid REFERENCES payments(id) ON DELETE CASCADE,obligation_id uuid REFERENCES contribution_obligations(id) ON DELETE CASCADE,amount_applied numeric,applied_at timestamptz DEFAULT now(),PRIMARY KEY(payment_id,obligation_id)); CREATE TABLE public.projects(id uuid PRIMARY KEY,group_id uuid NOT NULL REFERENCES public.groups(id),name text NOT NULL);");
  for (const [path, name] of [
    ["00072_meeting_minutes_rls_fixes.sql","has_group_permission"],
    ["00102_tenant_isolation_hardening.sql","is_group_admin_or_owner"],
    ["00108_member_privacy_hardening.sql","can_view_member_financial"],
    ["00098_membership_status_lifecycle.sql","prevent_membership_self_escalation"],
    ["00101_standing_factors_and_history.sql","compute_member_standing"],
    ["00101_standing_factors_and_history.sql","recalculate_membership_standing"],
    ["00101_standing_factors_and_history.sql","apply_standing_rules"],
    ["00079_standing_recalc_triggers.sql","trg_recalc_standing_from_hosting"],
  ]) {
    const source = read("supabase/migrations/" + path);
    const start = source.indexOf("CREATE OR REPLACE FUNCTION public." + name + "(");
    assert.ok(start >= 0);
    sql(source.slice(start, source.indexOf("$$;", start) + 3));
  }
  const source = read("supabase/migrations/00061_batch3_fixes.sql");
  const start = source.indexOf("CREATE OR REPLACE FUNCTION public.is_group_admin(");
  const end = source.indexOf("$$ LANGUAGE sql SECURITY DEFINER STABLE;", start);
  sql(source.slice(start, end + "$$ LANGUAGE sql SECURITY DEFINER STABLE;".length));
  // Actual Phase A -> Phase B -> standing -> F3-01 -> F3-02 migrations, with no
  // legacy financial rows. No linked Supabase calls and no production data.
  for (const migration of migrationChain) sql(read("supabase/migrations/" + migration));
}
