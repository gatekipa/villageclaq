import { createClient } from "@/lib/supabase/client";
import { formatAmount } from "@/lib/currencies";

export interface StandingReason {
  category: string;
  passed: boolean;
  label_en: string;
  label_fr: string;
  detail_en: string;
  detail_fr: string;
}

export interface StandingResult {
  standing: "good" | "warning" | "suspended";
  reasons: StandingReason[];
  score: number;
}

const ATTENDANCE_THRESHOLD = 60;

/**
 * Auto-calculate member standing from real data.
 * Rules:
 * 1. Dues: any overdue obligation → FAIL
 * 2. Attendance: below 60% in last 12 months → FAIL
 * 3. Relief contributions: behind on any plan → FAIL
 * 4. Disputes: any open dispute → soft FAIL (warning only)
 *
 * Scoring:
 * - All pass → "good"
 * - 1 non-dues fail → "warning"
 * - Dues fail or 2+ fails → "suspended" (not in good standing)
 */
export async function calculateStanding(
  membershipId: string,
  groupId: string,
  options?: { updateDb?: boolean; currency?: string },
): Promise<StandingResult> {
  const supabase = createClient();
  const reasons: StandingReason[] = [];
  const now = new Date();

  // Rule 1: Dues
  const { data: obligations } = await supabase
    .from("contribution_obligations")
    .select("amount, amount_paid, status, due_date")
    .eq("membership_id", membershipId)
    .eq("group_id", groupId);

  const overdueObls = (obligations || []).filter((o) => {
    const dueDate = new Date(o.due_date);
    return (o.status === "pending" || o.status === "partial" || o.status === "overdue") && dueDate < now;
  });
  const totalOutstanding = (obligations || [])
    .filter((o) => o.status !== "paid" && o.status !== "waived")
    .reduce((sum, o) => sum + (Number(o.amount) - Number(o.amount_paid)), 0);

  const duesPassed = overdueObls.length === 0;
  reasons.push({
    category: "dues",
    passed: duesPassed,
    label_en: "Dues",
    label_fr: "Cotisations",
    detail_en: duesPassed ? "Dues paid in full" : `Dues: ${formatAmount(totalOutstanding, options?.currency || "XAF")} outstanding`,
    detail_fr: duesPassed ? "Cotisations payées en totalité" : `Cotisations: ${formatAmount(totalOutstanding, options?.currency || "XAF")} impayées`,
  });

  // Rule 2: Attendance (last 12 months)
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

  const { data: attendances } = await supabase
    .from("event_attendances")
    .select("status, checked_in_at")
    .eq("membership_id", membershipId);

  const recentAttendances = (attendances || []).filter(
    (a) => new Date(a.checked_in_at || now) >= twelveMonthsAgo
  );
  const totalEvents = recentAttendances.length;
  const presentCount = recentAttendances.filter(
    (a) => a.status === "present" || a.status === "late"
  ).length;
  const rate = totalEvents > 0 ? Math.round((presentCount / totalEvents) * 100) : 100;
  const attendancePassed = totalEvents === 0 || rate >= ATTENDANCE_THRESHOLD;

  reasons.push({
    category: "attendance",
    passed: attendancePassed,
    label_en: "Attendance",
    label_fr: "Présence",
    detail_en: totalEvents === 0
      ? "No events recorded"
      : attendancePassed
        ? `Attendance: ${rate}% (above ${ATTENDANCE_THRESHOLD}% threshold)`
        : `Attendance: ${rate}% (below ${ATTENDANCE_THRESHOLD}% threshold)`,
    detail_fr: totalEvents === 0
      ? "Aucun événement enregistré"
      : attendancePassed
        ? `Présence: ${rate}% (au-dessus du seuil de ${ATTENDANCE_THRESHOLD}%)`
        : `Présence: ${rate}% (en dessous du seuil de ${ATTENDANCE_THRESHOLD}%)`,
  });

  // Rule 3: Relief contributions
  const { data: enrollments } = await supabase
    .from("relief_enrollments")
    .select("id, contribution_status, relief_plan_id")
    .eq("membership_id", membershipId);

  const behindPlans = (enrollments || []).filter(
    (e) => e.contribution_status === "behind" || e.contribution_status === "overdue"
  );
  const reliefPassed = behindPlans.length === 0;

  reasons.push({
    category: "relief",
    passed: reliefPassed,
    label_en: "Relief Contributions",
    label_fr: "Cotisations de secours",
    detail_en: reliefPassed
      ? "Relief contributions: Up to date"
      : `Relief: Behind on ${behindPlans.length} plans`,
    detail_fr: reliefPassed
      ? "Cotisations de secours: À jour"
      : `Secours: En retard sur ${behindPlans.length} plans`,
  });

  // Rule 4: Disputes
  const { data: disputes } = await supabase
    .from("disputes")
    .select("id, status")
    .eq("group_id", groupId)
    .eq("filed_by", membershipId)
    .in("status", ["open", "under_review"]);

  const openDisputes = (disputes || []).length;
  const disputesPassed = openDisputes === 0;

  reasons.push({
    category: "disputes",
    passed: disputesPassed,
    label_en: "Disputes",
    label_fr: "Litiges",
    detail_en: disputesPassed ? "No pending disputes" : `${openDisputes} open disputes`,
    detail_fr: disputesPassed ? "Aucun litige en cours" : `${openDisputes} litiges en cours`,
  });

  // Calculate standing
  const failedCount = reasons.filter((r) => !r.passed).length;
  const score = Math.round((reasons.filter((r) => r.passed).length / reasons.length) * 100);

  let standing: "good" | "warning" | "suspended";
  if (failedCount === 0) {
    standing = "good";
  } else if (!duesPassed || failedCount >= 2) {
    standing = "suspended";
  } else {
    standing = "warning";
  }

  // Optionally update DB
  if (options?.updateDb) {
    await supabase
      .from("memberships")
      .update({ standing })
      .eq("id", membershipId);
  }

  return { standing, reasons, score };
}
