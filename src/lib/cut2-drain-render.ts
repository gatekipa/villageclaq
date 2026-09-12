/**
 * Cut 2 drain TypeScript renderer.
 * SQL does not render. Trusted rows (cut2_provenance_version=1) only.
 * B-reloads domain display fields and contact. Envelope is not send authority
 * for phone/email/message/template/components.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatAmount } from "@/lib/currencies";
import { getMemberName } from "@/lib/get-member-name";
import {
  CUT2_EMAIL_TEMPLATE,
  CUT2_WA_DISPATCH_TYPE,
  type Cut2NotificationType,
  type Cut2QueueChannel,
} from "@/lib/cut2-channel-matrix";

export type DrainRender =
  | { ok: true; channel: "sms"; to: string; message: string }
  | { ok: true; channel: "email"; to: string; template: string; data: Record<string, string> }
  | { ok: true; channel: "whatsapp"; to: string; type: string; data: Record<string, string> }
  | { ok: false; error: string };

type Locale = "en" | "fr";

function asLocale(v: string | null | undefined): Locale {
  return v === "fr" ? "fr" : "en";
}

function standingLabel(standing: string, locale: Locale): string {
  const key = standing.toLowerCase();
  const en: Record<string, string> = {
    good: "good standing",
    warning: "warning",
    suspended: "suspended",
    banned: "banned",
  };
  const fr: Record<string, string> = {
    good: "en règle",
    warning: "avertissement",
    suspended: "suspendu",
    banned: "banni",
  };
  const table = locale === "fr" ? fr : en;
  return table[key] || standing || (locale === "fr" ? "inconnu" : "unknown");
}

async function loadMembership(supabase: SupabaseClient, membershipId: string | null) {
  if (!membershipId) return null;
  const { data } = await supabase
    .from("memberships")
    .select("id,group_id,user_id,display_name,is_proxy,phone,privacy_settings,membership_status,standing,role")
    .eq("id", membershipId)
    .maybeSingle();
  return data;
}

async function loadProfile(supabase: SupabaseClient, userId: string | null) {
  if (!userId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id,full_name,phone,preferred_locale,display_name")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

async function reloadPhone(
  supabase: SupabaseClient,
  membership: Record<string, unknown> | null,
  invitationPhone?: string | null,
): Promise<string | null> {
  if (invitationPhone) return invitationPhone;
  if (!membership) return null;
  const proxyPhone = ((membership.privacy_settings as Record<string, unknown> | null)?.proxy_phone as string) || null;
  if (membership.is_proxy) return proxyPhone || (membership.phone as string) || null;
  const profile = await loadProfile(supabase, (membership.user_id as string) || null);
  if (profile?.phone) return profile.phone;
  if (membership.phone) return membership.phone as string;
  if (proxyPhone) return proxyPhone;
  const userId = membership.user_id as string | null;
  if (!userId) return null;
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    return data.user?.phone || null;
  } catch (err) {
    console.warn("[Cut2Drain] auth phone lookup failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function reloadEmail(
  supabase: SupabaseClient,
  membership: Record<string, unknown> | null,
  invitationEmail?: string | null,
): Promise<string | null> {
  if (invitationEmail) return invitationEmail;
  const userId = membership?.user_id as string | null;
  if (!userId) return null;
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    return data.user?.email || null;
  } catch (err) {
    console.warn("[Cut2Drain] auth email lookup failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function groupName(supabase: SupabaseClient, groupId: string | null): Promise<string> {
  if (!groupId) return "";
  const { data } = await supabase.from("groups").select("name").eq("id", groupId).maybeSingle();
  return (data?.name as string) || "";
}

function memberDisplay(membership: Record<string, unknown> | null, profile: Record<string, unknown> | null): string {
  if (!membership) return "Member";
  return getMemberName({ ...membership, profile });
}

export async function renderCut2TrustedRow(
  supabase: SupabaseClient,
  item: {
    channel: string;
    template: string;
    data: Record<string, unknown>;
    cut2_provenance_version?: number | null;
  },
): Promise<DrainRender> {
  if (item.cut2_provenance_version !== 1) {
    return { ok: false, error: "cut2_untrusted_provenance" };
  }
  const type = item.template as Cut2NotificationType;
  const channel = item.channel as Cut2QueueChannel;
  const envelope = item.data || {};
  const domainId = String(envelope.domain_object_id || "");
  const recipientMembershipId = (envelope.recipient_membership_id as string) || null;

  let locale: Locale = asLocale(typeof envelope.locale === "string" ? envelope.locale : null);
  const membership = await loadMembership(supabase, recipientMembershipId);
  const profile = membership?.user_id ? await loadProfile(supabase, membership.user_id as string) : null;
  if (!envelope.locale && profile?.preferred_locale) {
    locale = asLocale(profile.preferred_locale);
  }

  const fields = await loadTypeFields(supabase, type, domainId, membership, profile, locale);
  if (!fields.ok) return fields;
  fields.emailData = { ...fields.emailData, locale };
  fields.waData = { ...fields.waData, locale };

  if (channel === "sms") {
    const to = await reloadPhone(supabase, membership, fields.invitationPhone);
    if (!to) return { ok: false, error: "cut2_contact_reload_empty" };
    const message = fields.smsMessage;
    if (!message) return { ok: false, error: "cut2_sms_render_empty" };
    return { ok: true, channel: "sms", to, message };
  }

  if (channel === "email") {
    const to = await reloadEmail(supabase, membership, fields.invitationEmail);
    if (!to) return { ok: false, error: "cut2_contact_reload_empty" };
    const template = CUT2_EMAIL_TEMPLATE[type];
    if (!template) return { ok: false, error: "cut2_email_renderer_denied" };
    return { ok: true, channel: "email", to, template, data: fields.emailData };
  }

  if (channel === "whatsapp") {
    const to = await reloadPhone(supabase, membership, fields.invitationPhone);
    if (!to) return { ok: false, error: "cut2_contact_reload_empty" };
    const waType = CUT2_WA_DISPATCH_TYPE[type];
    if (!waType) return { ok: false, error: "cut2_wa_renderer_denied" };
    return { ok: true, channel: "whatsapp", to, type: waType, data: fields.waData };
  }

  return { ok: false, error: `Unknown channel: ${channel}` };
}

type TypeFields =
  | {
      ok: true;
      smsMessage: string;
      smsData: Record<string, unknown>;
      emailData: Record<string, string>;
      waData: Record<string, string>;
      invitationPhone?: string | null;
      invitationEmail?: string | null;
    }
  | { ok: false; error: string };

async function loadTypeFields(
  supabase: SupabaseClient,
  type: Cut2NotificationType,
  domainId: string,
  membership: Record<string, unknown> | null,
  profile: Record<string, unknown> | null,
  locale: Locale,
): Promise<TypeFields> {
  const sms = await import("@/lib/notifications/sms-templates");
  const name = memberDisplay(membership, profile);

  if (type === "payment_receipt") {
    const { data: payment } = await supabase.from("payments").select("*").eq("id", domainId).maybeSingle();
    if (!payment) return { ok: false, error: "domain_not_found" };
    const g = await groupName(supabase, payment.group_id);
    const { data: ct } = payment.contribution_type_id
      ? await supabase.from("contribution_types").select("name,name_fr").eq("id", payment.contribution_type_id).maybeSingle()
      : { data: null };
    const typeName = locale === "fr" && ct?.name_fr ? ct.name_fr : (ct?.name || "");
    const amount = formatAmount(payment.amount, payment.currency || "XAF");
    const date = payment.payment_date || String(payment.recorded_at || "").slice(0, 10);
    return {
      ok: true,
      smsMessage: sms.paymentReceiptSms({ groupName: g, amount, type: typeName, locale }),
      smsData: { groupName: g, amount, contributionType: typeName },
      emailData: { memberName: name, amount, contributionType: typeName, groupName: g, date },
      waData: { memberName: name, amount, contributionType: typeName, groupName: g, date },
    };
  }

  if (type === "payment_reminder") {
    const { data: obl } = await supabase.from("contribution_obligations").select("*").eq("id", domainId).maybeSingle();
    if (!obl) return { ok: false, error: "domain_not_found" };
    const g = await groupName(supabase, obl.group_id);
    const { data: ct } = obl.contribution_type_id
      ? await supabase.from("contribution_types").select("name,name_fr").eq("id", obl.contribution_type_id).maybeSingle()
      : { data: null };
    const typeName = locale === "fr" && ct?.name_fr ? ct.name_fr : (ct?.name || "");
    const amount = formatAmount(obl.amount_due ?? obl.amount, obl.currency || "XAF");
    const dueDate = String(obl.due_date || "").slice(0, 10);
    return {
      ok: true,
      smsMessage: sms.paymentReminderSms({ groupName: g, amount, type: typeName, locale }),
      smsData: { groupName: g, amount, contributionType: typeName },
      emailData: { memberName: name, amount, contributionType: typeName, dueDate, groupName: g },
      waData: { memberName: name, amount, contributionType: typeName, dueDate, groupName: g },
    };
  }

  if (type === "welcome") {
    const { data: mem } = await supabase.from("memberships").select("*").eq("id", domainId).maybeSingle();
    if (!mem) return { ok: false, error: "domain_not_found" };
    const g = await groupName(supabase, mem.group_id);
    const mName = memberDisplay(mem, profile);
    return {
      ok: true,
      smsMessage: sms.welcomeSms({ groupName: g, memberName: mName, locale }),
      smsData: { groupName: g, memberName: mName },
      emailData: { memberName: mName, groupName: g },
      waData: { memberName: mName, groupName: g },
    };
  }

  if (type === "standing_changed") {
    const { data: mem } = await supabase.from("memberships").select("*").eq("id", domainId).maybeSingle();
    if (!mem) return { ok: false, error: "domain_not_found" };
    const g = await groupName(supabase, mem.group_id);
    const standingRaw = String(mem.standing || "");
    const standing = standingLabel(standingRaw, locale);
    return {
      ok: true,
      smsMessage: sms.standingChangedSms({ groupName: g, newStatus: standing, locale }),
      smsData: { groupName: g, newStatus: standing },
      emailData: { memberName: name, newStanding: standing, groupName: g },
      waData: { memberName: name, newStanding: standing, groupName: g },
    };
  }

  if (type === "relief_enrollment") {
    const { data: enr } = await supabase.from("relief_enrollments").select("*").eq("id", domainId).maybeSingle();
    if (!enr) return { ok: false, error: "domain_not_found" };
    const { data: plan } = await supabase.from("relief_plans").select("name,group_id").eq("id", enr.plan_id).maybeSingle();
    const g = await groupName(supabase, plan?.group_id || null);
    const planName = (plan?.name as string) || "";
    return {
      ok: true,
      smsMessage: sms.reliefEnrollmentSms({ groupName: g, planName, locale }),
      smsData: { groupName: g, planName },
      emailData: { memberName: name, planName, groupName: g },
      waData: { memberName: name, planName, groupName: g },
    };
  }

  if (type === "relief_claim_approved" || type === "relief_claim_denied") {
    const { data: claim } = await supabase.from("relief_claims").select("*").eq("id", domainId).maybeSingle();
    if (!claim) return { ok: false, error: "domain_not_found" };
    const { data: plan } = await supabase.from("relief_plans").select("name,group_id").eq("id", claim.plan_id).maybeSingle();
    const g = await groupName(supabase, plan?.group_id || null);
    const amount = formatAmount(claim.amount_approved ?? claim.amount_requested ?? 0, claim.currency || "XAF");
    const claimType = String(claim.claim_type || claim.type || "");
    const reason = String(claim.decision_reason || claim.reason || "").trim()
      || (locale === "fr" ? "motif non précisé" : "reason not specified");
    if (type === "relief_claim_approved") {
      return {
        ok: true,
        smsMessage: sms.reliefClaimApprovedSms({ groupName: g, amount, locale }),
        smsData: { groupName: g, amount },
        emailData: { memberName: name, claimType, amount, groupName: g },
        waData: { memberName: name, claimType, amount, groupName: g },
      };
    }
    return {
      ok: true,
      smsMessage: sms.reliefClaimDeniedSms({ groupName: g, reason, locale }),
      smsData: { groupName: g, reason },
      emailData: { memberName: name, claimType, reason, groupName: g },
      waData: { memberName: name, claimType, reason, groupName: g },
    };
  }

  if (type === "remittance_confirmed" || type === "remittance_disputed") {
    const { data: rem } = await supabase.from("relief_remittances").select("*").eq("id", domainId).maybeSingle();
    if (!rem) return { ok: false, error: "domain_not_found" };
    const g = await groupName(supabase, rem.branch_group_id);
    const amount = formatAmount(rem.amount, rem.currency || "XAF");
    const status = type === "remittance_confirmed" ? "confirmed" : "disputed";
    return {
      ok: true,
      smsMessage: sms.remittanceStatusSms({ groupName: g, amount, status, locale }),
      smsData: { groupName: g, amount, status },
      emailData: { amount, groupName: g },
      waData: { amount, groupName: g },
    };
  }

  if (type === "hosting_assignment" || type === "hosting_reminder" || type === "hosting_swap") {
    if (type === "hosting_swap") {
      const { data: swap } = await supabase.from("hosting_swap_requests").select("*").eq("id", domainId).maybeSingle();
      if (!swap) return { ok: false, error: "domain_not_found" };
      const { data: assignment } = await supabase.from("hosting_assignments").select("*").eq("id", swap.from_assignment_id).maybeSingle();
      const { data: roster } = assignment
        ? await supabase.from("hosting_rosters").select("group_id").eq("id", assignment.roster_id).maybeSingle()
        : { data: null };
      const g = await groupName(supabase, roster?.group_id || null);
      const date = String(assignment?.assigned_date || "");
      return {
        ok: true,
        smsMessage: sms.hostingReminderSms({ groupName: g, date, location: "", locale }),
        smsData: { groupName: g, date, hostingDate: date },
        emailData: { memberName: name, hostingDate: date, groupName: g },
        waData: { memberName: name, hostingDate: date, groupName: g },
      };
    }
    const { data: assignment } = await supabase.from("hosting_assignments").select("*").eq("id", domainId).maybeSingle();
    if (!assignment) return { ok: false, error: "domain_not_found" };
    const { data: roster } = await supabase.from("hosting_rosters").select("group_id").eq("id", assignment.roster_id).maybeSingle();
    const g = await groupName(supabase, roster?.group_id || null);
    const date = String(assignment.assigned_date || "");
    const location = String(assignment.location || assignment.venue || "").trim()
      || (locale === "fr" ? "lieu à confirmer" : "location TBA");
    if (type === "hosting_assignment") {
      return {
        ok: true,
        smsMessage: sms.hostingAssignmentSms({ groupName: g, date, locale }),
        smsData: { groupName: g, date, hostingDate: date },
        emailData: { memberName: name, hostingDate: date, groupName: g },
        waData: { memberName: name, hostingDate: date, groupName: g },
      };
    }
    return {
      ok: true,
      smsMessage: sms.hostingReminderSms({ groupName: g, date, location, locale }),
      smsData: { groupName: g, date, hostingDate: date, location },
      emailData: { memberName: name, hostingDate: date, groupName: g, location },
      waData: { memberName: name, hostingDate: date, groupName: g, location },
    };
  }

  if (type === "event_reminder") {
    const { data: ev } = await supabase.from("events").select("*").eq("id", domainId).maybeSingle();
    if (!ev) return { ok: false, error: "domain_not_found" };
    const g = await groupName(supabase, ev.group_id);
    const eventName = ev.title || ev.name || "";
    const date = String(ev.starts_at || ev.start_at || ev.event_date || "").slice(0, 10);
    const location = String(ev.location || ev.venue || "").trim()
      || (locale === "fr" ? "lieu à confirmer" : "location TBA");
    return {
      ok: true,
      smsMessage: sms.eventReminderSms({ groupName: g, eventName, date, location, locale }),
      smsData: { groupName: g, eventName, eventDate: date, eventLocation: location },
      emailData: { memberName: name, eventTitle: eventName, eventDate: date, eventLocation: location, groupName: g },
      waData: { memberName: name, eventTitle: eventName, eventDate: date, eventLocation: location, groupName: g },
    };
  }

  if (type === "loan_approved" || type === "loan_overdue") {
    const { data: loan } = await supabase.from("loans").select("*").eq("id", domainId).maybeSingle();
    if (!loan) return { ok: false, error: "domain_not_found" };
    const g = await groupName(supabase, loan.group_id);
    const amount = formatAmount(loan.amount_approved ?? loan.amount_requested ?? 0, loan.currency || "XAF");
    const dueDate = String(loan.next_due_date || loan.due_date || "").slice(0, 10);
    if (type === "loan_approved") {
      return {
        ok: true,
        smsMessage: sms.loanApprovedSms({ groupName: g, amount, locale }),
        smsData: { groupName: g, amount },
        emailData: { memberName: name, amount, groupName: g },
        waData: { memberName: name, amount, groupName: g },
      };
    }
    return {
      ok: true,
      smsMessage: "",
      smsData: {},
      emailData: { memberName: name, amount, dueDate, groupName: g },
      waData: { memberName: name, amount, dueDate, groupName: g },
    };
  }

  if (type === "fine_issued") {
    const { data: fine } = await supabase.from("fines").select("*").eq("id", domainId).maybeSingle();
    if (!fine) return { ok: false, error: "domain_not_found" };
    const g = await groupName(supabase, fine.group_id);
    const amount = formatAmount(fine.amount, fine.currency || "XAF");
    const reason = String(fine.reason || "").trim() || (locale === "fr" ? "amende" : "fine");
    const fineType = String(fine.fine_type || fine.type || (locale === "fr" ? "amende" : "fine"));
    return {
      ok: true,
      smsMessage: sms.fineIssuedSms({ groupName: g, amount, reason, locale }),
      smsData: { groupName: g, amount, reason },
      emailData: { memberName: name, fineType, amount, reason, groupName: g },
      waData: { memberName: name, fineType, amount, reason, groupName: g },
    };
  }

  if (type === "member_invitation") {
    const { data: inv } = await supabase.from("invitations").select("*").eq("id", domainId).maybeSingle();
    if (!inv) return { ok: false, error: "domain_not_found" };
    const { data: group } = await supabase.from("groups").select("name,group_type").eq("id", inv.group_id).maybeSingle();
    const g = (group?.name as string) || "";
    const groupType = (group?.group_type as string) || "";
    let inviteeName = locale === "fr" ? "Membre" : "Member";
    if (inv.claim_membership_id) {
      const claim = await loadMembership(supabase, inv.claim_membership_id as string);
      const claimName = claim ? getMemberName(claim as Record<string, unknown>) : "";
      if (claimName && claimName !== "Member") inviteeName = claimName;
    }
    let inviterName = "";
    if (inv.invited_by) {
      const inviter = await loadProfile(supabase, inv.invited_by as string);
      inviterName = String(inviter?.full_name || inviter?.display_name || "");
    }
    const base = (process.env.NEXT_PUBLIC_APP_URL || "https://villageclaq.com").replace(/\/$/, "");
    const acceptUrl = `${base}/${locale}/login?redirectTo=/dashboard/my-invitations`;
    return {
      ok: true,
      smsMessage: "",
      smsData: {},
      emailData: { inviteeName, groupName: g, groupType, inviterName, acceptUrl, invitationLink: acceptUrl },
      waData: { inviteeName, groupName: g, invitationLink: acceptUrl },
      invitationPhone: inv.phone || null,
      invitationEmail: inv.email || null,
    };
  }

  if (type === "subscription_expiring") {
    const { data: sub } = await supabase.from("group_subscriptions").select("*").eq("id", domainId).maybeSingle();
    if (!sub) return { ok: false, error: "domain_not_found" };
    const g = await groupName(supabase, sub.group_id);
    const end = sub.current_period_end ? new Date(sub.current_period_end) : new Date();
    const days = String(Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000)));
    return {
      ok: true,
      smsMessage: sms.subscriptionExpiringSms({ planName: g, days, locale }),
      smsData: { planName: g, days },
      emailData: { groupName: g, days },
      waData: { groupName: g, days },
    };
  }

  if (type === "minutes_published") {
    const { data: minutes } = await supabase.from("meeting_minutes").select("*").eq("id", domainId).maybeSingle();
    if (!minutes) return { ok: false, error: "domain_not_found" };
    const g = await groupName(supabase, minutes.group_id);
    const meetingTitle = locale === "fr" && minutes.title_fr ? minutes.title_fr : (minutes.title || "");
    const meetingDate = String(minutes.meeting_date || minutes.created_at || "").slice(0, 10);
    return {
      ok: true,
      smsMessage: sms.minutesPublishedSms({ groupName: g, meetingTitle, locale }),
      smsData: { groupName: g, meetingTitle },
      emailData: { groupName: g, meetingTitle, meetingDate },
      waData: { groupName: g, meetingTitle, meetingDate },
    };
  }

  if (type === "election_opened") {
    const { data: el } = await supabase.from("elections").select("*").eq("id", domainId).maybeSingle();
    if (!el) return { ok: false, error: "domain_not_found" };
    const g = await groupName(supabase, el.group_id);
    return {
      ok: true,
      smsMessage: "",
      smsData: {},
      emailData: { groupName: g, electionTitle: el.title || "", positions: "" },
      waData: { groupName: g, electionTitle: el.title || "", positions: "" },
    };
  }

  if (type === "announcement") {
    const { data: ann } = await supabase.from("announcements").select("*").eq("id", domainId).maybeSingle();
    if (!ann) return { ok: false, error: "domain_not_found" };
    const g = await groupName(supabase, ann.group_id);
    const title = locale === "fr" && ann.title_fr ? ann.title_fr : ann.title;
    const body = locale === "fr" && ann.content_fr ? ann.content_fr : ann.content;
    return {
      ok: true,
      smsMessage: sms.announcementSms({ groupName: g, title, locale }),
      smsData: { groupName: g, title },
      emailData: { groupName: g, title, body: String(body || "").slice(0, 100) },
      waData: { groupName: g, title, body: String(body || "").slice(0, 100) },
    };
  }

  if (type === "proxy_claim") {
    const { data: mem } = await supabase.from("memberships").select("*").eq("id", domainId).maybeSingle();
    if (!mem) return { ok: false, error: "domain_not_found" };
    const g = await groupName(supabase, mem.group_id);
    const { data: tokenRow } = await supabase
      .from("proxy_claim_tokens")
      .select("token")
      .eq("membership_id", mem.id)
      .is("claimed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const base = process.env.NEXT_PUBLIC_APP_URL || "https://villageclaq.com";
    const claimUrl = tokenRow?.token ? `${base}/claim/${tokenRow.token}` : "";
    if (!claimUrl) return { ok: false, error: "cut2_claim_token_missing" };
    const mName = mem.display_name || "Member";
    return {
      ok: true,
      smsMessage: sms.proxyClaimSms({ groupName: g, claimUrl, locale }),
      smsData: { groupName: g, claimUrl, memberName: mName },
      emailData: { memberName: mName, groupName: g, claimUrl },
      waData: { memberName: mName, groupName: g, claimUrl },
    };
  }

  return { ok: false, error: `unknown_type:${type}` };
}
