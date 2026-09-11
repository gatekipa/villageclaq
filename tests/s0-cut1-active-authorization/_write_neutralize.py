#!/usr/bin/env python3
"""Emit neutralize_live.json — exact live §24.7 predicates (2026-09-10 catalog)."""
import json
from pathlib import Path

Q = {
"activity_feed|Admin update feed": (
"UPDATE", "{public}",
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = activity_feed.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"activity_feed|Members insert feed": (
"INSERT", "{public}",
None,
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = activity_feed.group_id) AND (memberships.user_id = auth.uid()))))"),
"constitution_amendments|Admins can manage amendments": (
"ALL", "{public}",
"(group_id IN ( SELECT memberships.group_id\n   FROM memberships\n  WHERE ((memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"contribution_obligations|Group admins can manage obligations": (
"INSERT", "{authenticated}",
None,
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = contribution_obligations.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))"),
"contribution_obligations|Group admins can update obligations": (
"UPDATE", "{authenticated}",
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = contribution_obligations.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"contribution_types|Group admins can delete contribution types": (
"DELETE", "{authenticated}",
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = contribution_types.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"contribution_types|Group admins can manage contribution types": (
"INSERT", "{authenticated}",
None,
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = contribution_types.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))"),
"contribution_types|Group admins can update contribution types": (
"UPDATE", "{authenticated}",
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = contribution_types.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"disputes|disputes_admin": (
"ALL", "{public}",
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = disputes.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"documents|Admins can manage documents": (
"ALL", "{public}",
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = documents.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role])))))",
None),
"election_options|Admins can manage options": (
"ALL", "{public}",
"(EXISTS ( SELECT 1\n   FROM (elections e\n     JOIN memberships m ON ((m.group_id = e.group_id)))\n  WHERE ((e.id = election_options.election_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role])))))",
None),
"elections|Admins can manage elections": (
"ALL", "{public}",
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = elections.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role])))))",
None),
"event_attendances|Group admins can manage attendance": (
"ALL", "{public}",
"(EXISTS ( SELECT 1\n   FROM (events\n     JOIN memberships ON ((memberships.group_id = events.group_id)))\n  WHERE ((events.id = event_attendances.event_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"event_photos|Members upload photos": (
"INSERT", "{public}",
None,
"(EXISTS ( SELECT 1\n   FROM (events e\n     JOIN memberships m ON ((m.group_id = e.group_id)))\n  WHERE ((e.id = event_photos.event_id) AND (m.user_id = auth.uid()))))"),
"events|Group admins can create events": (
"INSERT", "{public}",
None,
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = events.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))"),
"events|Group admins can delete events": (
"DELETE", "{public}",
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = events.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"events|Group admins can update events": (
"UPDATE", "{public}",
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = events.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"family_members|rls_fm_delete": (
"DELETE", "{authenticated}",
"((EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.id = family_members.membership_id) AND (m.user_id = auth.uid())))) OR (EXISTS ( SELECT 1\n   FROM (memberships m\n     JOIN memberships target ON (((target.id = family_members.membership_id) AND (target.group_id = m.group_id))))\n  WHERE ((m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))))",
None),
"family_members|rls_fm_insert": (
"INSERT", "{authenticated}",
None,
"((EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.id = family_members.membership_id) AND (m.user_id = auth.uid())))) OR (EXISTS ( SELECT 1\n   FROM (memberships m\n     JOIN memberships target ON (((target.id = family_members.membership_id) AND (target.group_id = m.group_id))))\n  WHERE ((m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))))"),
"family_members|rls_fm_update": (
"UPDATE", "{authenticated}",
"((EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.id = family_members.membership_id) AND (m.user_id = auth.uid())))) OR (EXISTS ( SELECT 1\n   FROM (memberships m\n     JOIN memberships target ON (((target.id = family_members.membership_id) AND (target.group_id = m.group_id))))\n  WHERE ((m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))))",
None),
"feed_reactions|Members react": (
"ALL", "{public}",
"(EXISTS ( SELECT 1\n   FROM (activity_feed af\n     JOIN memberships m ON ((m.group_id = af.group_id)))\n  WHERE ((af.id = feed_reactions.feed_item_id) AND (m.user_id = auth.uid()))))",
None),
# P1-B OR-bypass: own-membership UPDATE/DELETE without active (live 2026-09-10).
"feed_reactions|rls_fr_delete": (
"DELETE", "{authenticated}",
"(EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.id = feed_reactions.membership_id) AND (m.user_id = auth.uid()))))",
None),
"feed_reactions|rls_fr_update": (
"UPDATE", "{authenticated}",
"(EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.id = feed_reactions.membership_id) AND (m.user_id = auth.uid()))))",
None),
"fine_types|fine_types_admin": (
"ALL", "{public}",
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = fine_types.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"fines|Admin manage fines": (
"ALL", "{public}",
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = fines.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"group_constitutions|Admins can manage constitutions": (
"ALL", "{public}",
"(group_id IN ( SELECT memberships.group_id\n   FROM memberships\n  WHERE ((memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"group_subscriptions|Admins can manage subscription": (
"ALL", "{public}",
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = group_subscriptions.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"hosting_assignments|Group admins can manage hosting assignments": (
"ALL", "{public}",
"(EXISTS ( SELECT 1\n   FROM (hosting_rosters\n     JOIN memberships ON ((memberships.group_id = hosting_rosters.group_id)))\n  WHERE ((hosting_rosters.id = hosting_assignments.roster_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"hosting_rosters|Group admins can manage hosting rosters": (
"ALL", "{public}",
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = hosting_rosters.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
# P1-B OR-bypass: requested_by=auth.uid() INSERT without active (live 2026-09-10).
"hosting_swap_requests|Members can create swap requests": (
"INSERT", "{public}",
None,
"(requested_by = auth.uid())"),
"invitations|Group admins can create invitations": (
"INSERT", "{authenticated}",
None,
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = invitations.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'moderator'::membership_role])))))"),
"invitations|Group admins can delete invitations": (
"DELETE", "{authenticated}",
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = invitations.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'moderator'::membership_role])))))",
None),
"invitations|Group admins can update invitations": (
"UPDATE", "{authenticated}",
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = invitations.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'moderator'::membership_role])))))",
None),
"loan_configs|loan_configs_delete": (
"DELETE", "{authenticated}",
"(EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.group_id = loan_configs.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))",
None),
"loan_configs|loan_configs_insert": (
"INSERT", "{authenticated}",
None,
"(EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.group_id = loan_configs.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))"),
"loan_configs|loan_configs_update": (
"UPDATE", "{authenticated}",
"(EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.group_id = loan_configs.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))",
None),
"loan_repayments|loan_repayments_delete": (
"DELETE", "{authenticated}",
"(EXISTS ( SELECT 1\n   FROM (loans l\n     JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))\n  WHERE (l.id = loan_repayments.loan_id)))",
None),
"loan_repayments|loan_repayments_insert": (
"INSERT", "{authenticated}",
None,
"(EXISTS ( SELECT 1\n   FROM (loans l\n     JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))\n  WHERE (l.id = loan_repayments.loan_id)))"),
"loan_repayments|loan_repayments_update": (
"UPDATE", "{authenticated}",
"(EXISTS ( SELECT 1\n   FROM (loans l\n     JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))\n  WHERE (l.id = loan_repayments.loan_id)))",
None),
"loan_requests_v1|Admin manage loans": (
"UPDATE", "{public}",
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = loan_requests_v1.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"loan_requests_v1|Members request loans": (
"INSERT", "{public}",
None,
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = loan_requests_v1.group_id) AND (memberships.user_id = auth.uid()))))"),
"loan_schedule|loan_schedule_delete": (
"DELETE", "{authenticated}",
"(EXISTS ( SELECT 1\n   FROM (loans l\n     JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))\n  WHERE (l.id = loan_schedule.loan_id)))",
None),
"loan_schedule|loan_schedule_insert": (
"INSERT", "{authenticated}",
None,
"(EXISTS ( SELECT 1\n   FROM (loans l\n     JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))\n  WHERE (l.id = loan_schedule.loan_id)))"),
"loan_schedule|loan_schedule_update": (
"UPDATE", "{authenticated}",
"(EXISTS ( SELECT 1\n   FROM (loans l\n     JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))\n  WHERE (l.id = loan_schedule.loan_id)))",
None),
"loans|loans_delete": (
"DELETE", "{authenticated}",
"(EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.group_id = loans.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))",
None),
"loans|loans_insert": (
"INSERT", "{authenticated}",
None,
"(EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.group_id = loans.group_id) AND (m.user_id = auth.uid()))))"),
"loans|loans_update": (
"UPDATE", "{authenticated}",
"(EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.group_id = loans.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))",
None),
"member_transfers|transfers_delete": (
"DELETE", "{authenticated}",
"((status = ANY (ARRAY['requested'::transfer_status, 'rejected'::transfer_status, 'cancelled'::transfer_status])) AND (EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])) AND (m.group_id = member_transfers.source_group_id)))))",
None),
"payment_reminder_rules|Admin manage reminder rules": (
"ALL", "{public}",
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = payment_reminder_rules.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"payments|Group admins and treasurers can record payments": (
"INSERT", "{authenticated}",
None,
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = payments.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))"),
"position_assignments|Group owners/admins can manage assignments": (
"ALL", "{authenticated}",
"(EXISTS ( SELECT 1\n   FROM (group_positions gp\n     JOIN memberships m ON ((m.group_id = gp.group_id)))\n  WHERE ((gp.id = position_assignments.position_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"project_contributions|Members contribute to projects": (
"INSERT", "{public}",
None,
"(EXISTS ( SELECT 1\n   FROM (projects p\n     JOIN memberships m ON ((m.group_id = p.group_id)))\n  WHERE ((p.id = project_contributions.project_id) AND (m.user_id = auth.uid()))))"),
"project_expenses|Admin manage expenses": (
"ALL", "{public}",
"(EXISTS ( SELECT 1\n   FROM (projects p\n     JOIN memberships m ON ((m.group_id = p.group_id)))\n  WHERE ((p.id = project_expenses.project_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"project_milestones|Admin manage milestones": (
"ALL", "{public}",
"(EXISTS ( SELECT 1\n   FROM (projects p\n     JOIN memberships m ON ((m.group_id = p.group_id)))\n  WHERE ((p.id = project_milestones.project_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"projects|Admin manage projects": (
"ALL", "{public}",
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = projects.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"relief_claims|Admins can manage claims": (
"ALL", "{public}",
"(EXISTS ( SELECT 1\n   FROM (relief_plans\n     JOIN memberships ON ((memberships.group_id = relief_plans.group_id)))\n  WHERE ((relief_plans.id = relief_claims.plan_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"relief_claims|Members can submit claims": (
"INSERT", "{public}",
None,
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.id = relief_claims.membership_id) AND (memberships.user_id = auth.uid()))))"),
"relief_claims|relief_claims_delete": (
"DELETE", "{authenticated}",
"(EXISTS ( SELECT 1\n   FROM (relief_plans rp\n     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))\n  WHERE (rp.id = relief_claims.plan_id)))",
None),
"relief_claims|relief_claims_insert": (
"INSERT", "{authenticated}",
None,
"(EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.id = relief_claims.membership_id) AND (m.user_id = auth.uid()))))"),
"relief_claims|relief_claims_update": (
"UPDATE", "{authenticated}",
"(EXISTS ( SELECT 1\n   FROM (relief_plans rp\n     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))\n  WHERE (rp.id = relief_claims.plan_id)))",
None),
"relief_enrollments|Admins can manage enrollments": (
"ALL", "{public}",
"(EXISTS ( SELECT 1\n   FROM (relief_plans\n     JOIN memberships ON ((memberships.group_id = relief_plans.group_id)))\n  WHERE ((relief_plans.id = relief_enrollments.plan_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"relief_enrollments|relief_enrollments_delete": (
"DELETE", "{authenticated}",
"(EXISTS ( SELECT 1\n   FROM (relief_plans rp\n     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))\n  WHERE (rp.id = relief_enrollments.plan_id)))",
None),
"relief_enrollments|relief_enrollments_insert": (
"INSERT", "{authenticated}",
None,
"(EXISTS ( SELECT 1\n   FROM (relief_plans rp\n     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))\n  WHERE (rp.id = relief_enrollments.plan_id)))"),
"relief_enrollments|relief_enrollments_update": (
"UPDATE", "{authenticated}",
"(EXISTS ( SELECT 1\n   FROM (relief_plans rp\n     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))\n  WHERE (rp.id = relief_enrollments.plan_id)))",
None),
"relief_payouts|Admins can manage payouts": (
"ALL", "{public}",
"(EXISTS ( SELECT 1\n   FROM ((relief_claims\n     JOIN relief_plans ON ((relief_plans.id = relief_claims.plan_id)))\n     JOIN memberships ON ((memberships.group_id = relief_plans.group_id)))\n  WHERE ((relief_claims.id = relief_payouts.claim_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"relief_payouts|relief_payouts_delete": (
"DELETE", "{authenticated}",
"(EXISTS ( SELECT 1\n   FROM ((relief_claims rc\n     JOIN relief_plans rp ON ((rp.id = rc.plan_id)))\n     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))\n  WHERE (rc.id = relief_payouts.claim_id)))",
None),
"relief_payouts|relief_payouts_insert": (
"INSERT", "{authenticated}",
None,
"(EXISTS ( SELECT 1\n   FROM ((relief_claims rc\n     JOIN relief_plans rp ON ((rp.id = rc.plan_id)))\n     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))\n  WHERE (rc.id = relief_payouts.claim_id)))"),
"relief_payouts|relief_payouts_update": (
"UPDATE", "{authenticated}",
"(EXISTS ( SELECT 1\n   FROM ((relief_claims rc\n     JOIN relief_plans rp ON ((rp.id = rc.plan_id)))\n     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))\n  WHERE (rc.id = relief_payouts.claim_id)))",
None),
"relief_plans|Group admins can manage relief plans": (
"ALL", "{public}",
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = relief_plans.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))",
None),
"relief_remittances|relief_remittances_insert": (
"INSERT", "{public}",
None,
"(EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.user_id = auth.uid()) AND (m.group_id = relief_remittances.branch_group_id) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))"),
"relief_remittances|relief_remittances_update": (
"UPDATE", "{public}",
"((EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.user_id = auth.uid()) AND (m.group_id = relief_remittances.branch_group_id) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))) OR (EXISTS ( SELECT 1\n   FROM ((memberships m\n     JOIN groups g_hq ON (((g_hq.id = m.group_id) AND (g_hq.group_level = 'hq'::text))))\n     JOIN groups g_branch ON (((g_branch.organization_id = g_hq.organization_id) AND (g_branch.organization_id IS NOT NULL))))\n  WHERE ((m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])) AND (g_branch.id = relief_remittances.branch_group_id)))))",
None),
"savings_contributions|Admins can manage contributions": (
"ALL", "{public}",
"(EXISTS ( SELECT 1\n   FROM (savings_cycles sc\n     JOIN memberships m ON ((m.group_id = sc.group_id)))\n  WHERE ((sc.id = savings_contributions.cycle_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role])))))",
None),
"savings_cycles|Admins can manage savings cycles": (
"ALL", "{public}",
"(EXISTS ( SELECT 1\n   FROM memberships\n  WHERE ((memberships.group_id = savings_cycles.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role])))))",
None),
"savings_participants|Admins can manage participants": (
"ALL", "{public}",
"(EXISTS ( SELECT 1\n   FROM (savings_cycles sc\n     JOIN memberships m ON ((m.group_id = sc.group_id)))\n  WHERE ((sc.id = savings_participants.cycle_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role])))))",
None),
# §24.7 names "Group admins can manage payment config" — live is three writes
"group_payment_config|Admins can delete payment config": (
"DELETE", "{public}",
"(group_id IN ( SELECT memberships.group_id\n   FROM memberships\n  WHERE ((memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))",
None),
"group_payment_config|Admins can insert payment config": (
"INSERT", "{public}",
None,
"(group_id IN ( SELECT memberships.group_id\n   FROM memberships\n  WHERE ((memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))"),
"group_payment_config|Admins can update payment config": (
"UPDATE", "{public}",
"(group_id IN ( SELECT memberships.group_id\n   FROM memberships\n  WHERE ((memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))",
None),
}

OR_BYPASS_KEYS = {
    "feed_reactions|rls_fr_delete",
    "feed_reactions|rls_fr_update",
    "hosting_swap_requests|Members can create swap requests",
}

rows = []
for key, (cmd, roles, qual, wcheck) in Q.items():
    table, name = key.split("|", 1)
    rows.append({
        "tablename": table,
        "policyname": name,
        "cmd": cmd,
        "roles": roles,
        "qual": qual,
        "with_check": wcheck,
        "kind": "or_bypass" if key in OR_BYPASS_KEYS else "neutralize",
        "s24_7_note": (
            "live name for §24.7 Group admins can manage payment config"
            if table == "group_payment_config" else None
        ),
    })

out = Path(__file__).with_name("neutralize_live.json")
out.write_text(json.dumps(rows, indent=2) + "\n")
print(f"wrote {out} count={len(rows)}")
