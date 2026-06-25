import { createClient } from "@/lib/supabase/client";
import { formatAmount } from "@/lib/currencies";
import { getEnabledChannels } from "@/lib/notification-prefs";
import { getBilingualTranslator } from "@/lib/bilingual-translator";
import {
  resolveStandingRules,
  type StandingFactorKey,
  type StandingRules,
} from "@/lib/standing-rules";
import { computeObligationStates, dateKey, todayKey, addDaysToDateKey, type MoneyObligation, type MoneyPayment } from "@/lib/money";

/**
 * One line item in a member's standing breakdown.
 *
 * `category` is kept for backwards compatibility with existing UI that reads
 * it; `factorKey` is the canonical, type-safe key from standing-rules.ts.
 * `amount`/`count` are machine-readable values for the UI (rendered through
 * formatAmount where money), and `fixHref` points at the page the member can
 * use to resolve the issue.
 */
export interface StandingReason {
  category: string;
  factorKey: StandingFactorKey;
  passed: boolean;
  label_en: string;
  label_fr: string;
  detail_en: string;
  detail_fr: string;
  /** Machine-readable money amount tied to the reason (e.g. dues outstanding). */
  amount?: number;
  /** Machine-readable count tied to the reason (e.g. missed hosting count). */
  count?: number;
  /** In-app route the member can visit to fix this factor. */
  fixHref?: string;
}

export interface StandingResult {
  standing: "good" | "warning" | "suspended";
  reasons: StandingReason[];
  score: number;
}

/** Where a member is sent to resolve each factor. */
const FIX_HREFS: Record<StandingFactorKey, string> = {
  dues: "/dashboard/my-payments",
  meetingAttendance: "/dashboard/attendance",
  eventAttendance: "/dashboard/attendance",
  relief: "/dashboard/relief/my",
  hosting: "/dashboard/hosting",
  fines: "/dashboard/my-fines",
  loans: "/dashboard/my-loans",
  disputes: "/dashboard/disputes",
  customActivity: "/dashboard",
};

function scoreFrom(reasons: StandingReason[]): {
  standing: StandingResult["standing"];
  score: number;
} {
  const total = reasons.length;
  if (total === 0) {
    return { standing: "good", score: 100 };
  }
  const passedCount = reasons.filter((r) => r.passed).length;
  const failedCount = total - passedCount;
  const duesReason = reasons.find((r) => r.factorKey === "dues");
  const duesPassed = duesReason ? duesReason.passed : true;
  const score = Math.round((passedCount / total) * 100);

  let standing: StandingResult["standing"];
  if (failedCount === 0) {
    standing = "good";
  } else if (!duesPassed || failedCount >= 2) {
    standing = "suspended";
  } else {
    standing = "warning";
  }
  return { standing, score };
}

/**
 * Auto-calculate a member's standing from real data, honoring the group's
 * configurable standing rules (groups.settings.standing_rules).
 *
 * Behavior contract:
 *  - Guards exactly like the SQL engine (compute_member_standing): proxy
 *    members and members whose membership_status is not active/pending_approval
 *    keep their stored standing and are never written or notified. The same
 *    holds when the group has turned auto-standing off (rules.enabled=false).
 *  - Only ENABLED factors (rules.factors[key] === true) contribute a reason;
 *    disabled factors push nothing and so never count toward score/fail count.
 *  - Configured thresholds are used: attendance threshold + lookback, missed
 *    hosting threshold, dues overdue grace days, and the per-contribution-type
 *    exclusion list.
 *
 * Side effects (DB write + audit log + notification dispatch) happen ONLY when
 * `options.updateDb === true`. Read paths must call with updateDb:false. The
 * dispatch block is reachable only through an explicit caller (a recalc
 * action), never a passive render.
 */
export async function calculateStanding(
  membershipId: string,
  groupId: string,
  options?: { updateDb?: boolean; currency?: string; rulesOverride?: StandingRules },
): Promise<StandingResult> {
  const supabase = createClient();
  const currency = options?.currency || "XAF";

  // ── (a) Fetch the membership row + the group's resolved rules ONCE ───────────
  const { data: membershipRow } = await supabase
    .from("memberships")
    .select("is_proxy, membership_status, standing")
    .eq("id", membershipId)
    .single();

  const currentStanding =
    (membershipRow?.standing as StandingResult["standing"] | null) || "good";

  // rulesOverride lets the settings "preview" project CANDIDATE (not-yet-saved)
  // rules with the same engine the displays use — so the preview is accurate
  // regardless of whether the SQL engine has been brought to parity yet. When
  // overriding rules we never write, so callers must use updateDb:false.
  let rules: StandingRules;
  if (options?.rulesOverride) {
    rules = options.rulesOverride;
  } else {
    const { data: groupRow } = await supabase
      .from("groups")
      .select("settings")
      .eq("id", groupId)
      .single();
    rules = resolveStandingRules(groupRow?.settings);
  }

  // ── (b) Guard: proxy / inactive status / auto-standing disabled ──────────────
  const isProxy = membershipRow?.is_proxy === true;
  const status = (membershipRow?.membership_status as string | null) || "active";
  const statusEligible = status === "active" || status === "pending_approval";

  if (isProxy || !statusEligible || rules.enabled === false) {
    // Keep the stored standing; never write, never notify. Score mirrors the
    // stored standing so read UIs have something sensible to show.
    const score =
      currentStanding === "good" ? 100 : currentStanding === "warning" ? 75 : 25;
    return { standing: currentStanding, reasons: [], score };
  }

  const now = new Date();
  const reasons: StandingReason[] = [];

  // ── (c) Compute only ENABLED factors ─────────────────────────────────────────

  // Factor: Dues
  if (rules.factors.dues) {
    // Build 12: a member is "behind on dues" based on CONFIRMED payments, NEVER
    // the polluted obligation.amount_paid / status columns (a pending or rejected
    // pay-now over-credits amount_paid and flips status, which would wrongly
    // CLEAR a member who hasn't actually paid, or wrongly SUSPEND one whose
    // payment was rejected). `id` + `membership_id` are selected so the engine
    // allocates each member's confirmed total to the right obligations.
    const { data: obligations } = await supabase
      .from("contribution_obligations")
      .select("id, amount, status, due_date, contribution_type_id, membership_id")
      .eq("membership_id", membershipId)
      .eq("group_id", groupId);

    const { data: duesPayments } = await supabase
      .from("payments")
      .select("id, amount, status, obligation_id, contribution_type_id, membership_id, relief_plan_id, recorded_at")
      .eq("membership_id", membershipId)
      .eq("group_id", groupId)
      .is("relief_plan_id", null);

    const excluded = new Set(rules.excludedContributionTypeIds);
    const relevant = (obligations || []).filter(
      (o) => !excluded.has(o.contribution_type_id as string),
    );

    // Confirmed-only per-obligation state. Payments to excluded/flexible types
    // never cover a relevant obligation (computeObligationStates partitions by
    // type, and `relevant` already drops excluded types), so a flexible
    // contribution cannot mark a member behind.
    const states = computeObligationStates(
      relevant as unknown as MoneyObligation[],
      (duesPayments || []) as unknown as MoneyPayment[],
    );

    // Overdue = confirmed-open (remaining > 0) AND due_date + grace days < today.
    // Compare on DATE-ONLY keys (YYYY-MM-DD), matching the money engine
    // (computeObligation: `dueK < today`). due_date is a DATE at UTC midnight, so
    // a Date-vs-local-`now` comparison marked a same-day obligation overdue a day
    // early for a diaspora admin in a negative-UTC timezone — the date-key
    // comparison is timezone-stable. An obligation with no due_date is never
    // overdue (a flexible/undated obligation can still be open but not behind).
    const today = todayKey();
    const overdueObls = relevant.filter((o) => {
      const c = states.get(o.id as string);
      if (!c || !c.isOpen) return false;
      if (!o.due_date) return false;
      const dueWithGraceKey = addDaysToDateKey(dateKey(o.due_date as string), rules.overdueGraceDays);
      return dueWithGraceKey < today;
    });

    const totalOutstanding = relevant
      .filter((o) => (o.status as string) !== "waived")
      .reduce((sum, o) => {
        const c = states.get(o.id as string);
        return sum + (c ? c.remaining : 0);
      }, 0);

    const duesPassed = overdueObls.length === 0;
    reasons.push({
      category: "dues",
      factorKey: "dues",
      passed: duesPassed,
      label_en: "Dues",
      label_fr: "Cotisations",
      detail_en: duesPassed
        ? "Dues paid in full"
        : `Dues: ${formatAmount(totalOutstanding, currency)} outstanding`,
      detail_fr: duesPassed
        ? "Cotisations payées en totalité"
        : `Cotisations: ${formatAmount(totalOutstanding, currency)} impayées`,
      amount: duesPassed ? undefined : totalOutstanding,
      count: duesPassed ? undefined : overdueObls.length,
      fixHref: FIX_HREFS.dues,
    });
  }

  // Factors: Attendance, split into MEETINGS (formal — event_type
  // meeting/agm) and EVENTS (casual — social/fundraiser/emergency/other).
  // Both share the configured threshold + lookback. A casual event must not
  // damage standing unless eventAttendance is explicitly turned on.
  if (rules.factors.meetingAttendance || rules.factors.eventAttendance) {
    const lookbackStart = new Date();
    lookbackStart.setMonth(
      lookbackStart.getMonth() - rules.attendanceLookbackMonths,
    );

    const { data: attendances } = await supabase
      .from("event_attendances")
      .select("status, event:events!inner(starts_at, group_id, event_type)")
      .eq("membership_id", membershipId);

    const eventOf = (a: Record<string, unknown>): Record<string, unknown> | null => {
      const eventRaw = a.event as unknown;
      return (Array.isArray(eventRaw) ? eventRaw[0] : eventRaw) as
        | Record<string, unknown>
        | null;
    };

    const recent = (attendances || []).filter((a) => {
      const event = eventOf(a);
      if (event?.group_id !== groupId) return false;
      const eventDate = event?.starts_at
        ? new Date(event.starts_at as string)
        : null;
      if (!eventDate || eventDate > now) return false;
      return eventDate >= lookbackStart;
    });

    const MEETING_TYPES = new Set(["meeting", "agm"]);
    const isMeeting = (a: Record<string, unknown>) =>
      MEETING_TYPES.has(((eventOf(a)?.event_type as string) || "meeting"));

    const threshold = rules.attendanceThresholdPercent;
    const pushAttendance = (
      subset: Record<string, unknown>[],
      factorKey: "meetingAttendance" | "eventAttendance",
      labelEn: string,
      labelFr: string,
    ) => {
      // Exclude excused absences from the denominator.
      const nonExcused = subset.filter((a) => a.status !== "excused");
      const total = nonExcused.length;
      const present = nonExcused.filter(
        (a) => a.status === "present" || a.status === "late",
      ).length;
      const rate = total > 0 ? Math.round((present / total) * 100) : 100;
      const passed = total === 0 || rate >= threshold;
      reasons.push({
        category: factorKey,
        factorKey,
        passed,
        label_en: labelEn,
        label_fr: labelFr,
        detail_en:
          total === 0
            ? `No ${labelEn.toLowerCase()} recorded`
            : passed
              ? `${labelEn}: ${rate}% (above ${threshold}% threshold)`
              : `${labelEn}: ${rate}% (below ${threshold}% threshold)`,
        detail_fr:
          total === 0
            ? `Aucune donnée de ${labelFr.toLowerCase()}`
            : passed
              ? `${labelFr}: ${rate}% (au-dessus du seuil de ${threshold}%)`
              : `${labelFr}: ${rate}% (en dessous du seuil de ${threshold}%)`,
        count: total === 0 ? undefined : rate,
        fixHref: FIX_HREFS[factorKey],
      });
    };

    if (rules.factors.meetingAttendance) {
      pushAttendance(
        recent.filter((a) => isMeeting(a)),
        "meetingAttendance",
        "Meeting attendance",
        "Présence aux réunions",
      );
    }
    if (rules.factors.eventAttendance) {
      pushAttendance(
        recent.filter((a) => !isMeeting(a)),
        "eventAttendance",
        "Event attendance",
        "Présence aux événements",
      );
    }
  }

  // Factor: Relief contributions
  if (rules.factors.relief) {
    const { data: enrollments } = await supabase
      .from("relief_enrollments")
      .select("id, contribution_status, relief_plan_id")
      .eq("membership_id", membershipId);

    const behindPlans = (enrollments || []).filter(
      (e) =>
        e.contribution_status === "behind" ||
        e.contribution_status === "overdue",
    );
    const reliefPassed = behindPlans.length === 0;

    reasons.push({
      category: "relief",
      factorKey: "relief",
      passed: reliefPassed,
      label_en: "Relief Contributions",
      label_fr: "Cotisations de secours",
      detail_en: reliefPassed
        ? "Relief contributions: Up to date"
        : `Relief: Behind on ${behindPlans.length} plans`,
      detail_fr: reliefPassed
        ? "Cotisations de secours: À jour"
        : `Secours: En retard sur ${behindPlans.length} plans`,
      count: reliefPassed ? undefined : behindPlans.length,
      fixHref: FIX_HREFS.relief,
    });
  }

  // Factor: Hosting — fails only when missed >= configured threshold
  if (rules.factors.hosting) {
    const { data: hostingAssignments } = await supabase
      .from("hosting_assignments")
      .select("id, status")
      .eq("membership_id", membershipId)
      .in("status", ["completed", "missed"]);

    const hostingCompleted = (hostingAssignments || []).filter(
      (a) => a.status === "completed",
    ).length;
    const hostingMissed = (hostingAssignments || []).filter(
      (a) => a.status === "missed",
    ).length;
    const hostingTotal = hostingCompleted + hostingMissed;
    const hostingPassed = hostingMissed < rules.missedHostingThreshold;

    reasons.push({
      category: "hosting",
      factorKey: "hosting",
      passed: hostingPassed,
      label_en: "Hosting",
      label_fr: "Hébergement",
      detail_en:
        hostingTotal === 0
          ? "No hosting assignments"
          : hostingPassed
            ? `Hosting: ${hostingCompleted}/${hostingTotal} completed`
            : `Hosting: ${hostingMissed} missed assignment(s)`,
      detail_fr:
        hostingTotal === 0
          ? "Aucune mission d'hébergement"
          : hostingPassed
            ? `Hébergement: ${hostingCompleted}/${hostingTotal} terminé(s)`
            : `Hébergement: ${hostingMissed} mission(s) manquée(s)`,
      count: hostingPassed ? undefined : hostingMissed,
      fixHref: FIX_HREFS.hosting,
    });
  }

  // Factor: Loan repayments (default OFF)
  if (rules.factors.loans) {
    let overdueInstCount = 0;
    let defaultedCount = 0;
    try {
      // Scope to THIS member's repaying loans at the query level (inner join)
      // instead of fetching every group's overdue installments and filtering
      // in JS. loan_schedule.loan_id is a FK, so the inner join is safe.
      const { data: loanSchedules } = await supabase
        .from("loan_schedule")
        .select("id, status, loan_id, loans!inner(membership_id, status)")
        .eq("status", "overdue")
        .eq("loans.membership_id", membershipId)
        .eq("loans.status", "repaying");

      overdueInstCount = (loanSchedules || []).length;

      const { data: defaultedLoans } = await supabase
        .from("loans")
        .select("id")
        .eq("membership_id", membershipId)
        .eq("status", "defaulted");

      defaultedCount = (defaultedLoans || []).length;
    } catch (err) {
      // If loan tables don't exist or query fails, pass this factor.
      console.warn(
        "[calculate-standing] loans factor query failed:",
        err instanceof Error ? err.message : err,
      );
      overdueInstCount = 0;
      defaultedCount = 0;
    }
    const loansPassed = overdueInstCount === 0 && defaultedCount === 0;

    reasons.push({
      category: "loans",
      factorKey: "loans",
      passed: loansPassed,
      label_en: "Loan Repayments",
      label_fr: "Remboursements de prêts",
      detail_en: loansPassed
        ? "Loan repayments: Up to date"
        : defaultedCount > 0
          ? `${defaultedCount} defaulted loan(s)`
          : `${overdueInstCount} overdue installment(s)`,
      detail_fr: loansPassed
        ? "Remboursements de prêts: À jour"
        : defaultedCount > 0
          ? `${defaultedCount} prêt(s) en défaut`
          : `${overdueInstCount} échéance(s) en retard`,
      count: loansPassed
        ? undefined
        : defaultedCount > 0
          ? defaultedCount
          : overdueInstCount,
      fixHref: FIX_HREFS.loans,
    });
  }

  // Factor: Unpaid fines (default OFF) — pending only; disputed do NOT count
  if (rules.factors.fines) {
    const { data: pendingFines } = await supabase
      .from("fines")
      .select("id, status, amount")
      .eq("group_id", groupId)
      .eq("membership_id", membershipId)
      .eq("status", "pending");

    const unpaidFineCount = (pendingFines || []).length;
    const unpaidFineTotal = (pendingFines || []).reduce(
      (sum, f) => sum + Number(f.amount),
      0,
    );
    const finesPassed = unpaidFineCount === 0;

    reasons.push({
      category: "fines",
      factorKey: "fines",
      passed: finesPassed,
      label_en: "Fines",
      label_fr: "Amendes",
      detail_en: finesPassed
        ? "No unpaid fines"
        : `${unpaidFineCount} unpaid fine(s) totaling ${formatAmount(unpaidFineTotal, currency)}`,
      detail_fr: finesPassed
        ? "Aucune amende impayée"
        : `${unpaidFineCount} amende(s) impayée(s) totalisant ${formatAmount(unpaidFineTotal, currency)}`,
      amount: finesPassed ? undefined : unpaidFineTotal,
      count: finesPassed ? undefined : unpaidFineCount,
      fixHref: FIX_HREFS.fines,
    });
  }

  // Factor: Disputes (filed BY or AGAINST this member)
  if (rules.factors.disputes) {
    const { data: disputes } = await supabase
      .from("disputes")
      .select("id, status")
      .eq("group_id", groupId)
      .or(
        `filed_by.eq.${membershipId},against_membership_id.eq.${membershipId}`,
      )
      .in("status", ["open", "under_review"]);

    const openDisputes = (disputes || []).length;
    const disputesPassed = openDisputes === 0;

    reasons.push({
      category: "disputes",
      factorKey: "disputes",
      passed: disputesPassed,
      label_en: "Disputes",
      label_fr: "Litiges",
      detail_en: disputesPassed
        ? "No pending disputes"
        : `${openDisputes} open dispute(s)`,
      detail_fr: disputesPassed
        ? "Aucun litige en cours"
        : `${openDisputes} litige(s) en cours`,
      count: disputesPassed ? undefined : openDisputes,
      fixHref: FIX_HREFS.disputes,
    });
  }

  // Factor: Custom activities — a declared slot (see standing-rules.ts).
  // No activity type currently feeds standing, so this branch is intentionally
  // INERT and pushes no reason today. When a future standing-impacting
  // activity type is added, evaluate it HERE so it is gated behind this toggle
  // (and a per-item flag) and can never silently damage standing. The gate is
  // present so the audit guardrail (every factor must be handled) is satisfied.
  if (rules.factors.customActivity) {
    // Intentionally inert until a custom-activity data source exists.
  }

  // ── Scoring (identical rules to before) ──────────────────────────────────────
  const { standing, score } = scoreFrom(reasons);

  // ── (e) updateDb path — explicit callers only; write + log + notify ──────────
  if (options?.updateDb) {
    await persistAndNotify(supabase, {
      membershipId,
      groupId,
      standing,
      reasons,
      score,
      currency,
    });
  }

  return { standing, reasons, score };
}

/**
 * Persist the computed standing and, on an actual transition, write an audit
 * log entry and dispatch notifications (in-app + email/SMS/WhatsApp through the
 * server producers). Extracted out of the compute path so it can NEVER run on a
 * render — only `calculateStanding(..., { updateDb: true })` reaches it.
 *
 * The dispatch logic is unchanged from the prior implementation.
 */
async function persistAndNotify(
  supabase: ReturnType<typeof createClient>,
  args: {
    membershipId: string;
    groupId: string;
    standing: StandingResult["standing"];
    reasons: StandingReason[];
    score: number;
    currency: string;
  },
): Promise<void> {
  const { membershipId, groupId, standing } = args;

  // Fetch old standing to detect change
  const { data: oldMembership } = await supabase
    .from("memberships")
    .select("standing")
    .eq("id", membershipId)
    .single();
  const oldStanding = oldMembership?.standing as string | null;

  await supabase
    .from("memberships")
    .update({ standing, standing_updated_at: new Date().toISOString() })
    .eq("id", membershipId);

  // No change → nothing to record.
  if (oldStanding === standing) {
    return;
  }

  // Audit EVERY change, including the first-ever computation (null → X), to
  // match the SQL engine (which uses IS DISTINCT FROM). Best-effort.
  try {
    const { logActivity } = await import("@/lib/audit-log");
    await logActivity(supabase, {
      groupId,
      action: "member.standing_changed",
      entityType: "membership",
      entityId: membershipId,
      description: `Member standing changed from ${oldStanding ?? "none"} to ${standing}`,
      metadata: { oldStanding, newStanding: standing },
    });
  } catch {
    /* best-effort */
  }

  // Notifications fire only for a genuine transition FROM a prior standing —
  // a member's first-ever computation (null → X) is logged above but must not
  // generate a notification.
  if (!oldStanding) {
    return;
  }

  // Per-recipient localized notification dispatch.
  // ─ Locale: resolved via member_locale RPC (respects profiles.preferred_locale).
  // ─ Copy:  rendered via getBilingualTranslator("standingChange") — title/body
  //         keys indexed by `{oldStanding}To{newStanding}` (e.g. "goodToWarning").
  //         Unknown transition pairs fall back to the generic key.
  // ─ Auth:  every fetch carries `Authorization: Bearer {user JWT}`, required by
  //         /api/email|sms|whatsapp/send. If the session can't be read (SSR /
  //         service-role call path) we log + skip external channels — in-app
  //         still goes through because the supabase client carries its own auth.
  try {
    const { data: membership } = await supabase
      .from("memberships")
      .select("user_id, display_name")
      .eq("id", membershipId)
      .single();

    if (!membership?.user_id) {
      return;
    }

    const { data: group } = await supabase
      .from("groups")
      .select("name")
      .eq("id", groupId)
      .single();
    const memberName = (membership.display_name as string) || "";
    const groupName = (group?.name as string) || "";

    // Resolve recipient locale
    let locale: "en" | "fr" = "en";
    try {
      const { data: localeData } = await supabase.rpc("member_locale", {
        p_user_id: membership.user_id,
      });
      if (localeData === "fr") locale = "fr";
    } catch (err) {
      console.warn(
        "[calculate-standing] member_locale lookup failed:",
        err instanceof Error ? err.message : err,
      );
    }

    // Bilingual translator for title/body. Scoped to the standingChange
    // namespace; lazy-loads both en.json and fr.json on first call.
    const bt = await getBilingualTranslator("standingChange");

    const transitionKey = `${oldStanding}To${standing.charAt(0).toUpperCase()}${standing.slice(1)}`;
    const VALID_KEYS = new Set([
      "goodToWarning",
      "goodToSuspended",
      "warningToGood",
      "warningToSuspended",
      "suspendedToGood",
      "suspendedToWarning",
    ]);
    const titleKey = VALID_KEYS.has(transitionKey)
      ? `title.${transitionKey}`
      : "title.generic";
    const bodyKey = VALID_KEYS.has(transitionKey)
      ? `body.${transitionKey}`
      : "body.generic";
    const title = bt(locale, titleKey, { groupName, memberName });
    const body = bt(locale, bodyKey, { groupName, memberName });

    // In-app notification — localized copy, sent via the supabase client
    // (already authenticated, no Authorization header needed).
    try {
      await supabase.from("notifications").insert({
        user_id: membership.user_id,
        group_id: groupId,
        type: "system" as const,
        title,
        body,
        is_read: false,
        data: { link: "/dashboard/members" },
      });
    } catch (err) {
      console.warn(
        "[calculate-standing] in-app notification insert failed:",
        err instanceof Error ? err.message : err,
      );
    }

    // External channels — check preferences + get session for Bearer auth.
    let sendEmail = true,
      sendSms = true,
      sendWhatsapp = true;
    try {
      const prefs = await getEnabledChannels(
        supabase,
        membership.user_id,
        "standing_changes",
        groupId,
      );
      sendEmail = prefs.email;
      sendSms = prefs.sms;
      sendWhatsapp = prefs.whatsapp;
    } catch (err) {
      console.warn(
        "[calculate-standing] getEnabledChannels failed, fail-open:",
        err instanceof Error ? err.message : err,
      );
    }

    if (!sendEmail && !sendSms && !sendWhatsapp) {
      return;
    }

    // Session token for the /api/* routes. On the client this is present;
    // on the server path (service-role caller) it's absent, and we skip
    // external dispatches rather than hit 401.
    let accessToken: string | null = null;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      accessToken = session?.access_token || null;
    } catch (err) {
      console.warn(
        "[calculate-standing] getSession failed:",
        err instanceof Error ? err.message : err,
      );
    }

    if (!accessToken) {
      console.warn(
        "[calculate-standing] No session token, skipping external channel dispatch for membership",
        membershipId,
      );
      return;
    }

    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL || "https://villageclaq.com";

    async function postJson(path: string, payload: Record<string, unknown>) {
      try {
        const res = await fetch(`${origin}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error(
            `[calculate-standing] ${path} returned ${res.status}:`,
            text.slice(0, 200),
          );
        }
      } catch (err) {
        console.error(
          `[calculate-standing] ${path} fetch error:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Email — localized title/body rendered above; notification template
    // picks locale internally via the `locale` param.
    if (sendEmail) {
      postJson("/api/email/send", {
        to: membership.user_id,
        template: "notification",
        data: { title, body, groupName, memberName },
        locale,
      });
    }

    // SMS — sms-templates.ts handles EN/FR internally via `t(locale, en, fr)`.
    if (sendSms) {
      postJson("/api/sms/send", {
        to: membership.user_id,
        template: "standing-changed",
        data: { groupName, newStatus: standing },
        locale,
      });
    }

    // WhatsApp — server-side, queue-backed producer (exactly-once per
    // membership/standing/day). The producer reads the authoritative
    // standing from the DB and resolves the template variables itself.
    if (sendWhatsapp) {
      postJson("/api/members/standing-notifications", {
        membershipId,
        locale,
      });
    }
  } catch (err) {
    console.error(
      "[calculate-standing] notification block failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
