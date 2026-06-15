import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/send-email";
import { sendSmsNotification } from "@/lib/send-sms-notification";
import { producePaymentReminderNotification } from "@/lib/payment-reminder-producer";
import type { PaymentReminderProducerResult } from "@/lib/payment-reminder-producer";
import { formatAmount } from "@/lib/currencies";
import { computeReminderDecisions, type MoneyObligation, type MoneyPayment, type ReminderDecision } from "@/lib/money";
import { getEnabledChannels } from "@/lib/notification-prefs";
import type { EnabledChannels } from "@/lib/notification-prefs";
import { fetchMemberDispatchContacts } from "@/lib/cron-member-contacts";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Candidate-query row ceiling. PostgREST silently caps un-limited selects at
// its max-rows default (1000) with zero signal that rows were dropped — this
// explicit ceiling replaces that silent truncation with a deterministic,
// AUDITED cut (oldest due_date first; warn + ceilingHit response flag).
// HONESTY NOTE: overdue obligations leave candidacy only when paid or
// waived, so under a sustained backlog above the ceiling the same oldest
// rows are re-selected every day and obligations beyond the ceiling receive
// NO reminders until older ones resolve. ceilingHit is the operator cue to
// raise the ceiling or move to keyset pagination over (due_date, id); a
// reminded-today candidacy filter is the other upgrade path at scale.
// (The ceiling also counts proxy obligations, which are filtered out below —
// so the effective real-member pool per run can be smaller than the limit.)
const CANDIDATE_CEILING = 500;

/**
 * GET /api/cron/payment-reminders
 * Vercel Cron — runs daily at 08:00 UTC.
 * Sends payment reminder emails for overdue/pending obligations.
 */
export async function GET(request: Request) {
  // ── Auth: verify CRON_SECRET ──
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const now = new Date();
  let sent = 0;
  let failed = 0;
  let smsSent = 0;
  let smsSkipped = 0;
  let whatsappQueued = 0;
  let wouldWhatsapp = 0; // dry-run: previews that WOULD queue (nothing inserted)
  let whatsappSkipped = 0;
  let whatsappFailed = 0;
  let ceilingHit = false;
  const errors: string[] = [];

  // Build 14: confirmed-only reminder basis + dry-run preview. Default OFF — this
  // code changes NOTHING about who/what gets reminded until an operator sets the
  // env flag AFTER reviewing a ?dryRun=true preview. dryRun always previews the
  // confirmed basis (the proposed behavior) and SENDS/QUEUES nothing.
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "true";
  const useConfirmed = process.env.PAYMENT_REMINDER_CONFIRMED_BASIS === "true" || dryRun;
  let wouldEmail = 0;
  let wouldSms = 0;
  let confirmedSuppressed = 0; // candidates the engine deems NOT eligible (vs legacy)
  let confirmedNewlyEligible = 0; // candidates eligible under confirmed but not legacy

  try {
    // ── Query overdue obligations with member + group + type data ──
    // Two distinct queries so the LEGACY default path is byte-for-byte
    // unchanged (status filter + select), while the CONFIRMED basis selects
    // ALL past-due non-waived obligations plus the membership/type ids and
    // is_flexible the money engine needs to decide remindability from
    // CONFIRMED payments. Ordering + ceiling are identical on both.
    const candidateQuery = useConfirmed
      ? supabase
          .from("contribution_obligations")
          .select(`
        id,
        amount,
        amount_paid,
        currency,
        due_date,
        status,
        membership_id,
        contribution_type_id,
        membership:memberships!inner(
          id,
          user_id,
          display_name,
          is_proxy,
          group_id,
          profiles!memberships_user_id_fkey(
            full_name,
            preferred_locale
          )
        ),
        contribution_type:contribution_types!inner(
          name,
          name_fr,
          is_flexible
        ),
        group:groups!inner(
          name
        )
      `)
          .neq("status", "waived")
          .lt("due_date", now.toISOString().split("T")[0])
          .order("due_date", { ascending: true })
          .order("id", { ascending: true })
          .limit(CANDIDATE_CEILING)
      : supabase
          .from("contribution_obligations")
          .select(`
        id,
        amount,
        amount_paid,
        currency,
        due_date,
        status,
        membership:memberships!inner(
          id,
          user_id,
          display_name,
          is_proxy,
          group_id,
          profiles!memberships_user_id_fkey(
            full_name,
            preferred_locale
          )
        ),
        contribution_type:contribution_types!inner(
          name,
          name_fr
        ),
        group:groups!inner(
          name
        )
      `)
          .in("status", ["pending", "partial", "overdue"])
          .lt("due_date", now.toISOString().split("T")[0])
          .order("due_date", { ascending: true })
          .order("id", { ascending: true })
          .limit(CANDIDATE_CEILING);
    const { data: obligations, error: queryErr } = await candidateQuery;

    if (queryErr) {
      return NextResponse.json(
        { success: false, error: queryErr.message },
        { status: 500 }
      );
    }

    if (!obligations || obligations.length === 0) {
      return NextResponse.json({ success: true, sent: 0, failed: 0, message: "No overdue obligations" });
    }

    if (obligations.length >= CANDIDATE_CEILING) {
      ceilingHit = true;
      console.warn(`[Cron:PaymentReminders] candidate ceiling reached (${CANDIDATE_CEILING}) — obligations beyond the ceiling are NOT processed this run and will starve under a sustained backlog (see ceilingHit)`);
    }

    // ── Filter out proxy members (user_id IS NULL) ──
    const realObligations = obligations.filter((o: Record<string, unknown>) => {
      const raw = o.membership;
      const m = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null;
      return m && m.user_id && !m.is_proxy;
    });

    if (realObligations.length === 0) {
      return NextResponse.json({ success: true, sent: 0, failed: 0, ceilingHit, message: "No overdue obligations for real members" });
    }

    // ── Build 14: confirmed-only decisions (when on the confirmed basis) ──
    // Decide remindability + amount from CONFIRMED payments via the money engine —
    // never amount_paid / status. Fetch every candidate member's confirmed dues
    // payments + each group's standing-excluded set once; track the eligibility
    // delta vs the legacy (polluted) selection for the dry-run preview.
    let reminderDecisions: Map<string, ReminderDecision> | null = null;
    let eligibleObligationIds: Set<string> | null = null;
    if (useConfirmed) {
      const membershipIds = Array.from(new Set(realObligations.map((o: Record<string, unknown>) => o.membership_id as string).filter(Boolean)));
      const candidateGroupIds = Array.from(new Set(realObligations.map((o: Record<string, unknown>) => {
        const m = (Array.isArray(o.membership) ? (o.membership as Record<string, unknown>[])[0] : o.membership) as Record<string, unknown> | null;
        return m?.group_id as string | undefined;
      }).filter(Boolean))) as string[];

      const [paysRes, groupsRes] = await Promise.all([
        supabase
          .from("payments")
          .select("id, amount, status, obligation_id, contribution_type_id, membership_id, relief_plan_id")
          .in("membership_id", membershipIds)
          // membership_id already implies one group; group_id is defense-in-depth.
          .in("group_id", candidateGroupIds)
          .is("relief_plan_id", null),
        supabase.from("groups").select("id, settings").in("id", candidateGroupIds),
      ]);
      // Fail loud, not silent: an empty confirmed dataset would make every member
      // look fully-owing and over-remind (or skew the dry-run delta). Surface the
      // error instead of proceeding on partial data (CLAUDE.md rule 11).
      if (paysRes.error || groupsRes.error) {
        console.warn(
          "[Cron:PaymentReminders] confirmed-basis data fetch failed — aborting run (no sends):",
          paysRes.error?.message || groupsRes.error?.message,
        );
        return NextResponse.json(
          { success: false, error: "confirmed-basis data fetch failed", confirmedBasis: useConfirmed, dryRun },
          { status: 500 },
        );
      }
      const payments = (paysRes.data || []) as unknown as MoneyPayment[];

      const flexibleTypeIds = new Set<string>();
      for (const o of realObligations as Record<string, unknown>[]) {
        const ct = (Array.isArray(o.contribution_type) ? (o.contribution_type as Record<string, unknown>[])[0] : o.contribution_type) as Record<string, unknown> | null;
        if (ct?.is_flexible && o.contribution_type_id) flexibleTypeIds.add(o.contribution_type_id as string);
      }
      const excludedTypeIds = new Set<string>();
      for (const g of ((groupsRes.data || []) as Array<{ settings?: Record<string, unknown> }>)) {
        const rules = g.settings?.standing_rules as Record<string, unknown> | undefined;
        for (const id of ((rules?.excluded_contribution_type_ids as string[] | undefined) || [])) excludedTypeIds.add(id);
      }

      reminderDecisions = computeReminderDecisions(
        realObligations as unknown as MoneyObligation[],
        payments,
        { flexibleTypeIds, excludedTypeIds },
      );
      eligibleObligationIds = new Set<string>();
      for (const o of realObligations as Record<string, unknown>[]) {
        const oid = o.id as string;
        const confirmedEligible = !!reminderDecisions.get(oid)?.eligible;
        // Legacy eligibility (polluted) — only for the dry-run delta counters.
        const legacyEligible = ["pending", "partial", "overdue"].includes((o.status as string) || "")
          && (Number(o.amount) - Number(o.amount_paid || 0)) > 0;
        if (confirmedEligible) eligibleObligationIds.add(oid);
        if (legacyEligible && !confirmedEligible) confirmedSuppressed++;
        if (confirmedEligible && !legacyEligible) confirmedNewlyEligible++;
      }
    }

    // ── Group by user_id → one email per member with all their overdue items ──
    const byUser = new Map<string, {
      userId: string;
      memberName: string;
      locale: "en" | "fr";
      items: Array<{
        contributionType: string;
        amount: string;
        dueDate: string;
        daysOverdue: number;
        groupName: string;
      }>;
    }>();

    for (const o of realObligations) {
      // Build 14: on the confirmed basis, only email/SMS members with a confirmed
      // OPEN, non-flexible obligation (waived/paid/pending-masked/flexible dropped).
      if (useConfirmed && eligibleObligationIds && !eligibleObligationIds.has(o.id as string)) continue;
      const membership = (Array.isArray(o.membership) ? o.membership[0] : o.membership) as Record<string, unknown>;
      const userId = membership.user_id as string;
      const profiles = membership.profiles as Record<string, unknown> | Array<Record<string, unknown>> | null;
      const profile = Array.isArray(profiles) ? profiles[0] : profiles;
      const memberName = (membership.display_name as string)
        || (profile?.full_name as string)
        || "Member";
      const preferredLocale = ((profile?.preferred_locale as string) || "en") as "en" | "fr";

      const ct = (Array.isArray(o.contribution_type) ? o.contribution_type[0] : o.contribution_type) as Record<string, unknown>;
      const group = (Array.isArray(o.group) ? o.group[0] : o.group) as Record<string, unknown>;
      const typeName = (preferredLocale === "fr" ? (ct.name_fr as string) : null) || (ct.name as string);
      const currency = (o.currency as string) || "XAF";
      // Build 14: confirmed remaining when on the confirmed basis; else legacy.
      const amountDue = useConfirmed && reminderDecisions
        ? (reminderDecisions.get(o.id as string)?.remaining ?? 0)
        : (Number(o.amount) - Number(o.amount_paid || 0));
      const dueDate = o.due_date as string;
      const daysOverdue = Math.max(0, Math.floor((now.getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24)));

      if (!byUser.has(userId)) {
        byUser.set(userId, {
          userId,
          memberName,
          locale: preferredLocale,
          items: [],
        });
      }

      byUser.get(userId)!.items.push({
        contributionType: typeName,
        amount: formatAmount(amountDue, currency),
        dueDate,
        daysOverdue,
        groupName: (group.name as string) || "",
      });
    }

    // ── Resolve emails + phones via RPC — one call per group ──
    // Collect unique group_ids from obligations
    const groupIds = new Set<string>();
    for (const o of realObligations) {
      const membership = (Array.isArray(o.membership) ? o.membership[0] : o.membership) as Record<string, unknown>;
      const gid = membership.group_id as string;
      if (gid) groupIds.add(gid);
    }

    const emailMap = new Map<string, string>();
    const phoneMap = new Map<string, { phone: string; locale: string }>();

    // Batch resolve — one RPC call per group for emails and phones
    for (const gid of groupIds) {
      // Emails
      const { data: members, error: rpcErr } = await supabase
        .rpc("get_member_emails", { p_group_id: gid });
      if (rpcErr) {
        console.warn(`[Cron:PaymentReminders] get_member_emails failed for group ${gid}:`, rpcErr.message);
      } else if (members && Array.isArray(members)) {
        for (const m of members) {
          const row = m as { user_id: string; email: string };
          if (row.user_id && row.email) {
            emailMap.set(row.user_id, row.email);
          }
        }
      }

      // Phones: cron runs under service role, so resolve contacts directly.
      try {
        const phoneMembers = await fetchMemberDispatchContacts(supabase, gid);
        for (const row of phoneMembers) {
          if (row.userId && row.phone && !row.isProxy) {
            phoneMap.set(row.userId, { phone: row.phone, locale: row.locale });
          }
        }
      } catch (err) {
        console.warn(`[Cron:PaymentReminders] member phone lookup failed for group ${gid}:`, err instanceof Error ? err.message : err);
      }
    }

    // ── Batch-fetch notification preferences for all affected users ──
    const prefsMap = new Map<string, EnabledChannels>();
    for (const [userId] of byUser) {
      try {
        // Use the first obligation's group_id for preference check
        const firstObligation = realObligations.find((o: Record<string, unknown>) => {
          const m = (Array.isArray(o.membership) ? (o.membership as Record<string, unknown>[])[0] : o.membership) as Record<string, unknown>;
          return m?.user_id === userId;
        });
        const membershipRaw = firstObligation
          ? (Array.isArray(firstObligation.membership) ? (firstObligation.membership as Record<string, unknown>[])[0] : firstObligation.membership) as Record<string, unknown>
          : null;
        const gid = membershipRaw?.group_id as string | undefined;
        const channels = await getEnabledChannels(supabase, userId, "payment_reminders", gid);
        prefsMap.set(userId, channels);
      } catch {
        // Fail-open: if preference check errors, allow all defaults
        prefsMap.set(userId, { in_app: true, email: true, sms: true, whatsapp: true, push: false });
      }
    }

    // ── WhatsApp: queue-backed producer per overdue obligation ──
    // The producer re-validates eligibility, preferences, and phone, then
    // enqueues into notifications_queue (drained by the queue cron, with
    // providerMessageId/webhook tracking). Idempotency is one reminder per
    // obligation per UTC day, so same-day reruns of this cron are safe.
    const reminderDate = now.toISOString().split("T")[0];
    // Bounded concurrency: each producer call performs several DB reads, so
    // large overdue sets are processed in batches instead of one burst.
    const WHATSAPP_BATCH_SIZE = 25;
    const whatsappResults: PromiseSettledResult<PaymentReminderProducerResult>[] = [];
    for (let i = 0; i < realObligations.length; i += WHATSAPP_BATCH_SIZE) {
      const batch = realObligations
        .slice(i, i + WHATSAPP_BATCH_SIZE)
        .map((o) => producePaymentReminderNotification(supabase, o.id as string, { reminderDate, confirmedBasis: useConfirmed, dryRun }));
      whatsappResults.push(...(await Promise.allSettled(batch)));
    }

    // ── Send emails + SMS per member per overdue obligation ──
    const emailPromises: Promise<{ userId: string; success: boolean; error?: string }>[] = [];
    const smsPromises: Promise<{ sent: boolean; skipped: boolean }>[] = [];

    for (const [userId, memberData] of byUser) {
      const email = emailMap.get(userId);
      const phoneInfo = phoneMap.get(userId);
      const channels = prefsMap.get(userId) || { in_app: true, email: true, sms: true, whatsapp: true, push: false };

      if (!email && !phoneInfo) {
        errors.push(`No email or phone found for user ${userId}`);
        failed++;
        continue;
      }

      // Send one email + one SMS per overdue obligation
      for (const item of memberData.items) {
        const templateData = {
          memberName: memberData.memberName,
          groupName: item.groupName,
          amount: item.amount,
          contributionType: item.contributionType,
          dueDate: item.dueDate,
          daysOverdue: item.daysOverdue,
          paymentsUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://villageclaq.com"}/dashboard/my-payments`,
        };

        // Email (only if channel enabled). Build 14: dry-run counts, never sends.
        if (email && channels.email) {
          if (dryRun) {
            wouldEmail++;
          } else {
            emailPromises.push(
              sendEmail({
                to: email,
                template: "payment-reminder",
                data: templateData,
                locale: memberData.locale,
              }).then((result) => ({
                userId,
                success: result.success,
                error: result.error,
              }))
            );
          }
        }

        // SMS (only if channel enabled). Build 14: dry-run counts, never sends.
        if (phoneInfo && channels.sms) {
          if (dryRun) {
            wouldSms++;
          } else {
            smsPromises.push(
              sendSmsNotification({
                to: phoneInfo.phone,
                template: "payment-reminder",
                data: templateData,
                locale: (phoneInfo.locale || memberData.locale) as "en" | "fr",
              })
            );
          }
        }

        // WhatsApp is handled by the queue-backed producer above — no
        // direct provider sends from this cron.
      }
    }

    // Wait for emails (primary channel)
    const results = await Promise.allSettled(emailPromises);
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.success) {
        sent++;
      } else {
        failed++;
        const errMsg = r.status === "fulfilled"
          ? r.value.error || "Unknown"
          : (r.reason as Error)?.message || "Unknown";
        errors.push(errMsg);
      }
    }

    // Wait for SMS (secondary channel — failures don't affect response)
    const smsResults = await Promise.allSettled(smsPromises);
    for (const r of smsResults) {
      if (r.status === "fulfilled" && r.value.sent) smsSent++;
      else if (r.status === "fulfilled" && r.value.skipped) smsSkipped++;
    }

    for (const r of whatsappResults) {
      if (r.status === "fulfilled" && r.value.status === "queued" && r.value.dryRun) {
        // Dry-run preview: the producer returned before the insert (whatsappQueued
        // false) — count it as "would queue", never as an actual queued row.
        wouldWhatsapp++;
      } else if (r.status === "fulfilled" && r.value.status === "queued") {
        whatsappQueued++;
      } else if (r.status === "fulfilled" && r.value.status === "skipped") {
        whatsappSkipped++;
      } else {
        whatsappFailed++;
        const errMsg = r.status === "fulfilled"
          ? r.value.reason || "Unknown WhatsApp failure"
          : (r.reason as Error)?.message || "Unknown WhatsApp failure";
        errors.push(`WhatsApp: ${errMsg}`);
      }
    }

    if (errors.length > 0) {
      console.warn(`[Cron:PaymentReminders] ${sent} emails sent, ${failed} failed, ${smsSent} SMS sent, ${whatsappQueued} WhatsApp queued, ${whatsappSkipped} skipped, ${whatsappFailed} failed:`, errors.slice(0, 10));
    }

    return NextResponse.json({
      success: true,
      // Build 14: when dryRun, NOTHING was sent or queued — sent/smsSent and
      // whatsappQueued stay 0; wouldEmail/wouldSms/wouldWhatsapp report the
      // confirmed-only reminder set, and the delta quantifies how the confirmed
      // basis differs from legacy so an operator can sign off before flipping
      // PAYMENT_REMINDER_CONFIRMED_BASIS on.
      dryRun,
      confirmedBasis: useConfirmed,
      wouldEmail,
      wouldSms,
      wouldWhatsapp,
      eligibilityDelta: useConfirmed
        ? { nowSuppressed: confirmedSuppressed, newlyEligible: confirmedNewlyEligible }
        : undefined,
      sent,
      failed,
      smsSent,
      smsSkipped,
      whatsappQueued,
      whatsappSkipped,
      whatsappFailed,
      ceilingHit,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.warn("[Cron:PaymentReminders] Fatal error:", msg);
    return NextResponse.json({ success: false, error: msg, sent, failed, smsSent, smsSkipped, whatsappQueued, whatsappSkipped, whatsappFailed, ceilingHit }, { status: 500 });
  }
}
