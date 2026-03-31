import { createClient } from "@/lib/supabase/client";

const OVERDUE_CHECK_KEY = "villageclaq_overdue_check_ts";
const OVERDUE_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

/**
 * Lazy evaluation: mark pending loan_schedule installments as 'overdue'
 * when their due_date has passed. Also sends notifications to borrower + guarantor.
 * Guarded by a 1-hour localStorage check so it doesn't run on every page load.
 */
export async function markOverdueInstallments(groupId: string): Promise<number> {
  // Guard: check localStorage for last run
  if (typeof window !== "undefined") {
    const lastCheck = localStorage.getItem(OVERDUE_CHECK_KEY);
    if (lastCheck) {
      const elapsed = Date.now() - Number(lastCheck);
      if (elapsed < OVERDUE_CHECK_INTERVAL) return 0;
    }
  }

  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];

  // Find all pending/partial installments past due for this group's loans
  const { data: overdueInstallments, error } = await supabase
    .from("loan_schedule")
    .select("id, loan_id, due_date, loans!inner(id, group_id, membership_id, guarantor_membership_id, status, membership:memberships!loans_membership_id_fkey(user_id), guarantor:memberships!loans_guarantor_membership_id_fkey(user_id))")
    .in("status", ["pending", "partial"])
    .lt("due_date", today)
    .eq("loans.group_id", groupId)
    .in("loans.status", ["repaying"]);

  if (error || !overdueInstallments || overdueInstallments.length === 0) {
    // Update timestamp even on empty — no work needed
    if (typeof window !== "undefined") {
      localStorage.setItem(OVERDUE_CHECK_KEY, String(Date.now()));
    }
    return 0;
  }

  // Batch update all to 'overdue'
  const ids = overdueInstallments.map((i) => i.id);
  await supabase
    .from("loan_schedule")
    .update({ status: "overdue" })
    .in("id", ids);

  // Collect unique loan IDs for notifications (deduplicate)
  const notifiedLoans = new Set<string>();
  const notifications: Array<{
    user_id: string;
    group_id: string;
    type: string;
    title: string;
    body: string;
    is_read: boolean;
  }> = [];

  for (const inst of overdueInstallments) {
    const loan = inst.loans as unknown as Record<string, unknown>;
    const loanId = loan.id as string;
    if (notifiedLoans.has(loanId)) continue;
    notifiedLoans.add(loanId);

    // Borrower notification
    const membership = loan.membership as Record<string, unknown> | null;
    const borrowerUserId = (membership?.user_id as string) || null;
    if (borrowerUserId) {
      notifications.push({
        user_id: borrowerUserId,
        group_id: groupId,
        type: "system",
        title: "Loan Installment Overdue",
        body: "One or more of your loan installments are past due. Please make a payment as soon as possible.",
        is_read: false,
      });
    }

    // Guarantor notification
    const guarantor = loan.guarantor as Record<string, unknown> | null;
    const guarantorUserId = (guarantor?.user_id as string) || null;
    if (guarantorUserId) {
      notifications.push({
        user_id: guarantorUserId,
        group_id: groupId,
        type: "system",
        title: "Guaranteed Loan Overdue",
        body: "A loan you guaranteed has overdue installments. Please follow up with the borrower.",
        is_read: false,
      });
    }
  }

  // Send notifications (best-effort)
  if (notifications.length > 0) {
    try {
      await supabase.from("notifications").insert(notifications);
    } catch {
      /* best-effort */
    }
  }

  // Update timestamp
  if (typeof window !== "undefined") {
    localStorage.setItem(OVERDUE_CHECK_KEY, String(Date.now()));
  }

  return ids.length;
}
