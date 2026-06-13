import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Static guardrails for the admin dashboard "launch cockpit" sprint:
// LaunchChecklist wiring, the needs-attention card, honest stats, friendly
// error handling, locale-aware event titles, and sidebar tier-badge i18n.
// Style follows scripts/test-membership-status.mjs — read files as text and
// pin clause presence/absence (no DOM, no network, no DB).

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const PAGE = "src/app/[locale]/(dashboard)/dashboard/page.tsx";
const SIDEBAR = "src/components/layout/sidebar.tsx";

const page = read(PAGE);
const sidebar = read(SIDEBAR);
const en = JSON.parse(read("messages/en.json"));
const fr = JSON.parse(read("messages/fr.json"));

const dig = (obj, dotted) => dotted.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);

// ─── 1. Launch readiness card ───────────────────────────────────────────────

test("dashboard renders LaunchChecklist fed by computeLaunchReadiness, admin-gated", () => {
  assert.match(page, /import \{ LaunchChecklist \} from "@\/components\/launch-checklist"/);
  assert.match(page, /import \{ computeLaunchReadiness \} from "@\/lib\/launch-readiness"/);
  assert.match(page, /\{isAdmin && launchReadiness && \(\s*<LaunchChecklist readiness=\{launchReadiness\} centerHref="\/dashboard\/launch" \/>/);
  // Non-admins never compute (and therefore never render) the checklist.
  assert.match(page, /if \(!isAdmin\) return null;\s*\n\s*return computeLaunchReadiness\(/);
});

test("launch readiness inputs are wired truthfully", () => {
  assert.match(page, /groupProfileComplete = !!\(currentGroup\?\.name && currentGroup\?\.currency\)/);
  // Contact readiness is a boolean presence check on the caller's profile
  // phone — the value itself must never be rendered or logged.
  assert.match(page, /adminContactReady = !!user\?\.phone/);
  assert.doesNotMatch(page, /\{user\?\.phone\}/, "raw phone must never be rendered");
  assert.doesNotMatch(page, /console\.\w+\([^)]*user\?\.phone/, "raw phone must never be logged");
  // Owner excluded from accepted-member count, floored at zero.
  assert.match(page, /acceptedMemberCount: Math\.max\(0, activeCount - 1\)/);
  assert.match(page, /contributionTypeCount = contributionTypes\?\.length \?\? 0/);
});

test("inline count queries use primitive query keys, head counts, and enabled guards", () => {
  assert.match(page, /queryKey: \["dashboard-member-counts", groupId\]/);
  assert.match(page, /queryKey: \["dashboard-launch-counts", groupId\]/);
  // All inline counts are head-only exact counts (cheap — no row payloads).
  const headCounts = page.match(/\{ count: "exact", head: true \}/g) || [];
  assert.ok(headCounts.length >= 6, `expected >= 6 head-count selects in the page, saw ${headCounts.length}`);
  // Member counts run for everyone; launch counts only for admins.
  assert.match(page, /enabled: !!groupId,\s*staleTime: 60_000,\s*\}\);\s*\/\/ ─── Launch-readiness counts/);
  assert.match(page, /enabled: !!groupId && isAdmin/);
  // Count query failures are logged with context, never swallowed silently.
  assert.match(page, /console\.warn\("\[Dashboard\] member count query failed:", res\.error\.message\)/);
  assert.match(page, /console\.warn\("\[Dashboard\] launch count query failed:", res\.error\.message\)/);
});

test("membership_status filters in the new counts stay within the official vocabulary", () => {
  for (const m of page.matchAll(/\.(?:eq|neq)\(\s*"membership_status"\s*,\s*"([a-z_]+)"/g)) {
    assert.ok(
      ["active", "pending_approval", "exited", "suspended", "archived"].includes(m[1]),
      `unofficial membership_status literal in dashboard page: "${m[1]}"`,
    );
  }
  assert.match(page, /\.neq\("membership_status", "pending_approval"\)/);
  assert.match(page, /\.eq\("membership_status", "active"\)/);
});

// ─── 2. Old Getting Started checklist replaced ─────────────────────────────

test("the old inline Getting Started checklist is fully removed", () => {
  assert.doesNotMatch(page, /onboardingTasks/);
  assert.doesNotMatch(page, /onboarding\.gettingStarted/);
  assert.doesNotMatch(page, /onboarding\.task/);
});

// ─── 3. Needs-attention card ───────────────────────────────────────────────

test("needs-attention card renders only when something is actually pending, with CTAs", () => {
  assert.match(page, /\{isAdmin && \(pendingApprovals > 0 \|\| pendingInvitations > 0\) && \(/);
  assert.match(page, /t\("dashboard\.needsAttention"\)/);
  assert.match(page, /t\("dashboard\.pendingApprovalsCount", \{ count: pendingApprovals \}\)/);
  assert.match(page, /t\("dashboard\.pendingInvitationsCount", \{ count: pendingInvitations \}\)/);
  assert.match(page, /t\("dashboard\.reviewApprovals"\)/);
  assert.match(page, /t\("dashboard\.viewInvitations"\)/);
  // CTAs land on the pages where the work happens.
  assert.match(page, /<Link href="\/dashboard\/members">/);
  assert.match(page, /<Link href="\/dashboard\/invitations">/);
  // Pending invitations are counted with the canonical status filter.
  assert.match(page, /\.eq\("status", "pending"\)/);
});

// ─── 4. Stat honesty ───────────────────────────────────────────────────────

test("totalMembers stat is roster-aligned (excludes pending approvals)", () => {
  assert.match(page, /\{rosterCount \?\? stats\?\.totalMembers \?\? 0\}/);
});

test("misleading stat sublabels are replaced with honest ones", () => {
  assert.doesNotMatch(page, /dashboard\.paidThisMonth/);
  assert.doesNotMatch(page, /dashboard\.eventsThisMonth/);
  assert.match(page, /t\("dashboard\.collectionRateLabel"\)/);
  assert.match(page, /t\("dashboard\.upcomingEventsLabel"\)/);
});

test("outstanding balance card goes neutral + positive when nothing is owed", () => {
  assert.match(page, /outstanding > 0 && "border border-destructive\/30/);
  assert.match(page, /outstanding > 0 \? "text-destructive" : "text-foreground"/);
  assert.match(page, /outstanding > 0 \? t\("dashboard\.overdue"\) : t\("dashboard\.allCaughtUp"\)/);
  // The alert icon only shows when there is something to alert about.
  assert.match(page, /\{outstanding > 0 \? \(\s*<AlertCircle/);
});

// ─── 5. Friendly errors ────────────────────────────────────────────────────

test("raw stats error text never reaches the UI; it is warned to console instead", () => {
  assert.doesNotMatch(page, /statsError as Error\)\.message/);
  assert.doesNotMatch(page, /<ErrorState message=/);
  assert.match(page, /console\.warn\("\[Dashboard\] stats query failed:", statsError\)/);
  assert.match(page, /<ErrorState onRetry=\{\(\) => refetchStats\(\)\} \/>/);
});

// ─── 6. Locale-aware next-event title ──────────────────────────────────────

test("next-event title prefers title_fr for French readers and title otherwise", () => {
  assert.match(
    page,
    /locale === "fr"\s*\n?\s*\? \(\(nextEvent\.title_fr as string\) \|\| \(nextEvent\.title as string\)\)\s*\n?\s*: \(nextEvent\.title as string\)/,
  );
  assert.doesNotMatch(page, /\{\(nextEvent\.title as string\) \|\| \(nextEvent\.title_fr as string\)\}/);
});

// ─── 7. Quick actions polish ───────────────────────────────────────────────

test("Add Member dropdown trigger composes the Button via render (no nested buttons)", () => {
  // This codebase's dropdown is Base UI, whose asChild-equivalent is the
  // render prop (see events/contributions pages for the same pattern).
  assert.match(page, /<DropdownMenuTrigger render=\{<Button variant="outline"/);
  assert.doesNotMatch(page, /<DropdownMenuTrigger className="w-full">/);
  assert.doesNotMatch(page, /<DropdownMenuTrigger asChild>/);
  assert.doesNotMatch(page, /<DropdownMenuTrigger>\s*<Button/);
});

test("all four quick-action labels share the same size", () => {
  const labels = page.match(/<span className="text-sm">\{t\("dashboard\.(addMember|recordPayment|scheduleEvent|sendAnnouncement)"\)\}<\/span>/g) || [];
  assert.equal(labels.length, 4, "all quick-action labels must be text-sm");
  assert.doesNotMatch(page, /<span className="text-xs">\{t\("dashboard\./);
});

// ─── 8. Milestone storage hardening ────────────────────────────────────────

test("milestone localStorage reads are guarded against corrupted JSON", () => {
  assert.match(page, /function readShownMilestones\(storageKey: string\): string\[\] \{\s*\n\s*try \{/);
  assert.match(page, /Array\.isArray\(parsed\) \? parsed : \[\]/);
  assert.match(page, /console\.warn\("\[Dashboard\] milestone storage parse failed:", err\)/);
  // The only JSON.parse-over-localStorage in the page lives inside the guard.
  const parses = page.match(/JSON\.parse\(localStorage\.getItem/g) || [];
  assert.equal(parses.length, 1, "exactly one guarded JSON.parse(localStorage.getItem...) allowed");
  assert.equal((page.match(/readShownMilestones\(/g) || []).length, 3, "helper defined once and called from both milestone sites");
});

// ─── 9. Per-section empty-state CTAs ───────────────────────────────────────

test("empty sections offer an admin-gated next action", () => {
  // No upcoming events -> schedule one.
  assert.match(page, /t\("dashboard\.noUpcomingEvents"\)\}<\/p>\s*\n\s*\{isAdmin && \(\s*\n\s*<Link href="\/dashboard\/events">/);
  // No minutes -> write minutes.
  assert.match(page, /t\("dashboard\.noRecentMinutes"\)\}<\/p>\s*\n\s*\{isAdmin && \(\s*\n\s*<Link href="\/dashboard\/minutes">/);
  assert.match(page, /t\("dashboard\.writeMinutes"\)/);
  // No payments -> record one.
  assert.match(page, /t\("dashboard\.noRecentPayments"\)\}<\/p>\s*\n\s*\{isAdmin && \(\s*\n\s*<Link href="\/dashboard\/contributions\/record">/);
});

// ─── 10. Sidebar tier badges via i18n ──────────────────────────────────────

test("sidebar tier badges go through t() — no hardcoded Starter/Pro literals", () => {
  assert.doesNotMatch(sidebar, /tierBadge: "Starter"/);
  assert.doesNotMatch(sidebar, /\|\| "Pro"\}/);
  assert.match(sidebar, /tierBadgeKey: "badgeStarter"/);
  assert.match(sidebar, /\{t\(item\.tierBadgeKey \|\| "badgePro"\)\}/);
  // Old prop name is gone everywhere (declaration + usages).
  assert.doesNotMatch(sidebar, /tierBadge\?:/);
  assert.doesNotMatch(sidebar, /item\.tierBadge\b/);
});

// ─── 11. i18n contract ─────────────────────────────────────────────────────

test("existing keys the page relies on are present in BOTH bundles", () => {
  const existing = [
    "dashboard.launch.title",
    "dashboard.launch.readyBadge",
    "dashboard.launch.items.groupProfile",
    "dashboard.launch.items.remindersReady",
    "dashboard.recordPayment",
    "dashboard.scheduleEvent",
    "dashboard.noUpcomingEvents",
    "dashboard.noRecentMinutes",
    "dashboard.noRecentPayments",
    "dashboard.outstandingBalance",
    "dashboard.overdue",
    "dashboard.totalMembers",
    "common.errorTitle",
    "common.errorDesc",
    "common.retry",
  ];
  for (const key of existing) {
    assert.ok(dig(en, key) !== undefined, `en.json missing ${key}`);
    assert.ok(dig(fr, key) !== undefined, `fr.json missing ${key}`);
  }
});

test("every NEW key this sprint requests is actually referenced in code", () => {
  // These keys are requested via i18nKeysNeeded (bundles owned elsewhere);
  // until they land, the t() references below are the contract.
  const pageRefs = [
    "dashboard.needsAttention",
    "dashboard.pendingApprovalsCount",
    "dashboard.pendingInvitationsCount",
    "dashboard.reviewApprovals",
    "dashboard.viewInvitations",
    "dashboard.collectionRateLabel",
    "dashboard.upcomingEventsLabel",
    "dashboard.allCaughtUp",
    "dashboard.writeMinutes",
  ];
  for (const key of pageRefs) {
    assert.ok(page.includes(`t("${key}"`), `page must reference t("${key}")`);
  }
  for (const key of ["badgeStarter", "badgePro"]) {
    assert.ok(sidebar.includes(key), `sidebar must reference nav key ${key}`);
  }
});

test("no new hardcoded user-facing strings snuck into the touched JSX", () => {
  // The needs-attention + empty-state blocks must not contain bare English
  // text nodes — everything flows through t(). Heuristic: no JSX text node
  // starting with an uppercase word inside the sections we added.
  const sections = page.split(/\/\* Needs attention \(admins\)/)[1] || "";
  assert.ok(sections.length > 0, "needs-attention section must exist");
  const card = sections.split("</Card>")[0];
  assert.doesNotMatch(card, />\s*[A-Z][a-z]+ [a-z]/, "needs-attention card must not contain literal copy");
});
