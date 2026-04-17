/**
 * Localized CSV column labels for reports.
 *
 * The reports page builds CSV row objects with stable English keys
 * ("Name", "Amount", "Status", …). This helper returns a map from those
 * keys to the user's locale so the CSV that lands on a French admin's
 * desktop has French column headers while the underlying data shape
 * stays predictable.
 *
 * Unknown keys fall through unchanged — the export helper will use the
 * raw key as the column label. That's the safe default for columns we
 * haven't explicitly mapped yet.
 */

type T = (key: string) => string;

export function buildCsvHeaders(t: T): Record<string, string> {
  return {
    // Names / identity
    Name: t("common.member") ?? "Name",
    Member: t("common.member"),
    Borrower: t("reports.loanBorrower"),
    Group: t("common.group"),
    Branch: t("reports.fedBranch"),
    Plan: t("reports.plan"),
    Event: t("events.title"),
    Title: t("common.title"),
    // Money
    Amount: t("common.amount"),
    Collected: t("reports.collected"),
    Expected: t("reports.expected"),
    Outstanding: t("reports.totalOutstandingLoans"),
    Disbursed: t("reports.loanDisbursedDate"),
    // Dates
    Date: t("common.date"),
    Joined: t("members.joined"),
    DueDate: t("common.dueDate"),
    Filed: t("reports.filed"),
    Resolved: t("reports.resolved"),
    Completed: t("common.completed"),
    StartDate: t("reports.startDate"),
    // Status & categorization
    Status: t("common.status"),
    Standing: t("common.standing"),
    Role: t("common.role"),
    Type: t("common.type"),
    Method: t("common.method"),
    Category: t("reports.category"),
    Priority: t("reports.priority"),
    // Aggregates
    Total: t("common.total"),
    Count: t("reports.total"),
    Rate: t("reports.collectionRate"),
    CollectionRate: t("reports.collectionRate"),
    DefaultRate: t("reports.defaultRate"),
    Present: t("common.present"),
    // Hosting
    Missed: t("common.missed"),
    "Last Hosted": t("reports.lastHosted"),
    "Rate %": t("reports.collectionRate"),
    "Fairness %": t("reports.fairness"),
    // Events / attendance
    DaysOverdue: t("reports.daysOverdueShort"),
    DaysSinceJoin: t("reports.daysSinceJoin"),
    Items: t("contributions.outstandingItems"),
    // Engagement
    Payments: t("contributions.title"),
    Attendance: t("events.attendance"),
    Score: t("reports.engagementScore"),
    Level: t("reports.engagementLevel"),
    // Meeting minutes archive
    Decisions: t("minutes.decisions"),
    "Action Items": t("minutes.actionItems"),
    // Election results
    Winner: t("reports.winner"),
    WinnerVotes: t("reports.votes"),
    WinnerPct: t("reports.percentage"),
    TotalVotes: t("reports.totalVoters"),
    // Loans
    Interest: t("reports.loanInterestRate"),
    Guarantor: t("reports.loanGuarantor"),
    Installment: t("reports.installmentNo"),
    AmountDue: t("reports.scheduleAmountDue"),
    AmountPaid: t("reports.scheduleAmountPaid"),
    Overdue: t("reports.overdueAmount"),
    // Basic contact
    Phone: t("members.phone"),
    // Bucket labels are numeric ranges — leave as-is
    Bucket: t("reports.bucket"),
    // Federated relief
    Enrolled: t("reports.fedEnrolled"),
    FullMembers: t("reports.fedFullMembers"),
    ReliefOnly: t("reports.fedReliefOnly"),
    External: t("reports.fedExternal"),
    PaidThisMonth: t("reports.fedPaidThisMonth"),
    // Report 17 pivot — vertical metric/value layout
    Metric: t("reports.metric"),
    Value: t("reports.value"),
    // Report 15 relief fund status
    Contribution: t("reports.contribution"),
    Pending: t("reports.pending"),
    Approved: t("reports.approved"),
    PendingClaims: t("reports.pendingClaims"),
    ApprovedClaims: t("reports.approved"),
    YTDPayouts: t("reports.ytdPayouts"),
    OpenDisputes: t("reports.openDisputes"),
    // Savings cycles report 5
    Participants: t("reports.participants"),
    Round: t("reports.round"),
    Frequency: t("reports.frequency"),
    // Renewal / engagement
    Days: t("reports.days"),
    // Board / meeting pack + group perf — aggregate counts
    Members: t("reports.members"),
    ActiveMembers: t("reports.activeMembersLabel"),
    GoodStandingPct: t("reports.goodStandingPct"),
    Events: t("reports.eventsHeldLabel"),
    AttendanceRate: t("reports.attendanceRate"),
    AvgAttendance: t("reports.avgAttendance"),
    HostingCompliance: t("reports.hostingCompliance"),
    ReliefPlans: t("reports.reliefPlansLabel"),
    SavingsCycles: t("reports.savingsCirclesLabel"),
    HealthScore: t("reports.healthScore"),
    // Election results short column
    Votes: t("reports.votes"),
    Pct: t("reports.pct"),
    // Generic
    Notes: t("common.notes"),
  };
}
