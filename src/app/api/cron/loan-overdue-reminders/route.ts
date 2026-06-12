import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  produceLoanOverdueNotification,
  type LoanOverdueProducerResult,
} from "@/lib/loan-overdue-producer";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const cronSecret = process.env.CRON_SECRET;

// Candidate-query row ceiling. PostgREST silently caps un-limited selects at
// its max-rows default (1000) with zero signal that rows were dropped — this
// explicit ceiling replaces that silent truncation with a deterministic,
// AUDITED cut (oldest due_date first; warn + ceilingHit response flag).
// HONESTY NOTES:
// - Unpaid past-due installments leave candidacy only when paid, so under a
//   sustained backlog above the ceiling the same oldest rows are re-selected
//   daily and loans beyond the ceiling receive NO reminders until older
//   installments resolve.
// - The ceiling counts INSTALLMENT rows while dispatch dedupes to one
//   reminder per loan, so a few long-delinquent loans (many unpaid
//   installments each) can consume most of the slots.
// ceilingHit is the operator cue to raise the ceiling, dedupe candidates
// per loan, or move to keyset pagination over (due_date, id) at scale.
const CANDIDATE_CEILING = 500;

/**
 * Daily WhatsApp reminders for overdue loan installments (10:00 UTC,
 * staggered after the 08:00 payment-reminders burst so the shared queue
 * drain is not head-of-line blocked by two bursts at once).
 *
 * WhatsApp-only: no loan-overdue email/SMS path exists, and the in-app
 * notice stays with the client-side markOverdueInstallments path. The
 * cron only discovers candidate loan ids — every eligibility fact is
 * re-read inside the producer at produce time. Eligibility deliberately
 * accepts pending/partial/overdue installments: nothing server-side ever
 * sets the `overdue` flag (the client marks it lazily on page visits),
 * so requiring it would silently skip groups nobody has visited.
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseServiceKey) {
      return NextResponse.json({ error: "Service role key not configured" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date();
    const reminderDate = now.toISOString().split("T")[0];

    // Candidate discovery only: unpaid installments past due on repaying
    // loans, deduped to unique loan ids. The producer re-validates each.
    const { data: overdueRows, error: overdueError } = await supabase
      .from("loan_schedule")
      .select("loan_id, loans!inner(id, status)")
      .in("status", ["pending", "partial", "overdue"])
      .lt("due_date", reminderDate)
      .eq("loans.status", "repaying")
      .order("due_date", { ascending: true })
      .order("id", { ascending: true })
      .limit(CANDIDATE_CEILING);

    if (overdueError) {
      console.warn("[LoanOverdueCron] candidate query failed:", overdueError.message);
      return NextResponse.json({ error: "Candidate query failed" }, { status: 500 });
    }

    const candidateRows = overdueRows || [];
    let ceilingHit = false;
    if (candidateRows.length >= CANDIDATE_CEILING) {
      ceilingHit = true;
      console.warn(`[LoanOverdueCron] candidate ceiling reached (${CANDIDATE_CEILING}) — installments beyond the ceiling are NOT processed this run and will starve under a sustained backlog (see ceilingHit)`);
    }

    const loanIds = [...new Set(candidateRows.map((row) => row.loan_id as string))];

    // Bounded concurrency, mirroring the payment-reminders cron.
    const WHATSAPP_BATCH_SIZE = 25;
    const results: PromiseSettledResult<LoanOverdueProducerResult>[] = [];
    for (let i = 0; i < loanIds.length; i += WHATSAPP_BATCH_SIZE) {
      const batch = loanIds
        .slice(i, i + WHATSAPP_BATCH_SIZE)
        .map((loanId) => produceLoanOverdueNotification(supabase, loanId, { reminderDate }));
      results.push(...(await Promise.allSettled(batch)));
    }

    let whatsappQueued = 0;
    let whatsappSkipped = 0;
    let whatsappFailed = 0;
    const errors: string[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        if (result.value.status === "queued") whatsappQueued += 1;
        else if (result.value.status === "skipped") whatsappSkipped += 1;
        else {
          whatsappFailed += 1;
          if (result.value.reason) errors.push(result.value.reason);
        }
      } else {
        whatsappFailed += 1;
        errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      }
    }

    return NextResponse.json({
      ok: true,
      reminderDate,
      overdueLoans: loanIds.length,
      whatsappQueued,
      whatsappSkipped,
      whatsappFailed,
      ceilingHit,
      errors: errors.slice(0, 10),
    });
  } catch (err) {
    console.warn("[LoanOverdueCron] Internal error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
