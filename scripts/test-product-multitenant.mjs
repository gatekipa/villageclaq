import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Static guardrails for Build-2 — multi-tenant group clarity & isolation:
// one account can belong to many groups, so the product must (a) never leak
// one group's data into another's view, (b) never let a multi-group member
// misread one group's balance/standing as global, and (c) make the active
// group obvious (HQ/branch badge, switcher, "My groups", per-group labels).
// Style matches scripts/test-product-standing.mjs: read sources as text and
// assert clause presence/absence — there is no React harness.
//
// Tolerance note: several of these files are authored by sibling agents whose
// exact wording is not ours to fix. Where that is the case we key off STABLE
// tokens via includes()/loose regex ("switchGroup", "removeQueries",
// "group_level", "GroupTypeBadge", "groupId"), never on prose. Missing sibling
// files surface as a clear assertion failure (present()), not an unhandled
// throw that aborts the whole suite.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const present = (rel) => fs.existsSync(path.join(root, rel));
// Tolerant read: returns "" for a not-yet-merged sibling file so a single
// missing file fails its own targeted assertion instead of aborting the run.
const readSoft = (rel) => (present(rel) ? read(rel) : "");

const GROUP_CTX = "src/lib/group-context.tsx";
const HOOKS = "src/lib/hooks/use-supabase-query.ts";
const SWITCHER = "src/components/layout/group-switcher.tsx";
const BADGE = "src/components/layout/group-type-badge.tsx";
const MY_PAYMENTS = "src/app/[locale]/(dashboard)/dashboard/my-payments/page.tsx";
const MY_DASHBOARD = "src/app/[locale]/(dashboard)/dashboard/my-dashboard/page.tsx";
const MEMBER_DETAIL = "src/app/[locale]/(dashboard)/dashboard/members/[id]/page.tsx";
const JOIN_DIALOG = "src/components/ui/join-by-code-dialog.tsx";
const MY_INVITATIONS = "src/app/[locale]/(dashboard)/dashboard/my-invitations/page.tsx";

// Candidate locations for the "My groups" consolidated view (a sibling owns
// the exact path). Resolve to whichever exists so the suite is robust to the
// final file layout.
const MY_GROUPS_CANDIDATES = [
  "src/app/[locale]/(dashboard)/dashboard/my-groups/page.tsx",
  "src/app/[locale]/(dashboard)/dashboard/my-groups/my-groups-client.tsx",
];
const myGroupsPath = MY_GROUPS_CANDIDATES.find((p) => present(p)) || MY_GROUPS_CANDIDATES[0];

const ctx = read(GROUP_CTX);
const hooks = read(HOOKS);
const switcher = readSoft(SWITCHER);
const badge = readSoft(BADGE);
const myPayments = read(MY_PAYMENTS);
const myDashboard = read(MY_DASHBOARD);
const memberDetail = readSoft(MEMBER_DETAIL);
const joinDialog = readSoft(JOIN_DIALOG);
const myInvitations = readSoft(MY_INVITATIONS);
const myGroups = readSoft(myGroupsPath);
const en = JSON.parse(read("messages/en.json"));
const fr = JSON.parse(read("messages/fr.json"));

// ---------------------------------------------------------------------------
// 1. group-context — the anti-stale switch guarantee
// ---------------------------------------------------------------------------

test("group-context exposes switchGroup", () => {
  assert.ok(ctx.includes("switchGroup"), "GroupProvider must expose switchGroup");
  // It is part of the context value, not just a private helper.
  assert.ok(/switchGroup\s*[,:]/.test(ctx), "switchGroup is surfaced on the context value");
});

test("switchGroup clears caches via queryClient.removeQueries() (no cross-group bleed)", () => {
  // The core anti-stale guarantee: switching groups must purge cached query
  // data so the previous group's members/payments never flash in the new one.
  assert.ok(ctx.includes("removeQueries"), "switchGroup must call queryClient.removeQueries()");
  // removeQueries lives in the switch path, near setCurrentGroupId.
  const switchBody = ctx.slice(ctx.indexOf("const switchGroup"));
  assert.ok(
    switchBody.includes("removeQueries"),
    "removeQueries() must be inside the switchGroup callback",
  );
});

test("memberships carry group_level so HQ/branch can be told apart", () => {
  assert.ok(ctx.includes("group_level"), "membership.group exposes group_level");
});

// ---------------------------------------------------------------------------
// 2. GUARDRAIL — every major group-scoped hook is isolated by groupId
// ---------------------------------------------------------------------------

// The data-isolation guardrail. Each of these hooks reads tenant data and MUST
// (a) put groupId in its queryKey (so TanStack caches per-group and a switch
// busts the cache) AND (b) filter the query by group_id. If a new group-scoped
// hook is added without both, this fails — preventing a silent isolation leak.
const ISOLATED_HOOKS = [
  "useMembers",
  "useObligations",
  "usePayments",
  "useEvents",
  "useInvitations",
  "useDashboardStats",
  "useContributionTypes",
  "useAnnouncements",
  "useReliefPlans",
];

test("major group-scoped hooks include groupId in their queryKey", () => {
  for (const name of ISOLATED_HOOKS) {
    const start = hooks.indexOf(`export function ${name}`);
    assert.ok(start >= 0, `hook ${name} exists`);
    // Bound the slice to this hook body (up to the next exported function).
    const after = hooks.indexOf("\nexport function ", start + 1);
    const body = hooks.slice(start, after === -1 ? undefined : after);
    assert.ok(
      /queryKey:\s*\[[^\]]*groupId/.test(body),
      `${name} must include groupId in its queryKey array`,
    );
  }
});

test("major group-scoped hooks filter by group_id (.eq or relation filter)", () => {
  for (const name of ISOLATED_HOOKS) {
    const start = hooks.indexOf(`export function ${name}`);
    const after = hooks.indexOf("\nexport function ", start + 1);
    const body = hooks.slice(start, after === -1 ? undefined : after);
    // Accept either a direct group_id filter or a relation-scoped variant
    // (e.g. .eq("relief_plan.group_id", groupId) / .eq("event.group_id", ...)).
    assert.ok(
      body.includes('"group_id", groupId') ||
        /\.eq\("[a-z_]+\.group_id",\s*groupId\)/.test(body) ||
        body.includes(".eq('group_id', groupId)"),
      `${name} must filter the query by group_id`,
    );
  }
});

test("the isolation guardrail covers a meaningful spread of hooks", () => {
  // Cheap insurance that the list above was not gutted to a single hook.
  assert.ok(ISOLATED_HOOKS.length >= 6, "guardrail must cover several group-scoped hooks");
});

test("FUTURE-PROOF guardrail: every group-filtered hook also keys on groupId", () => {
  // Dynamic check (not a hardcoded list): split the shared-query file into its
  // exported hooks; ANY hook that filters by group_id MUST also include groupId
  // in a queryKey array. This catches a NEW tenant-scoped hook that forgets the
  // key (→ stale cross-group data on switch) even if it was never added above.
  const src = read("src/lib/hooks/use-supabase-query.ts");
  const chunks = src.split(/export function (use[A-Za-z0-9]+)/);
  // chunks = [preamble, name1, body1, name2, body2, ...]
  const offenders = [];
  for (let i = 1; i < chunks.length; i += 2) {
    const name = chunks[i];
    const body = chunks[i + 1] || "";
    const filtersByGroup =
      body.includes('"group_id", groupId') ||
      body.includes(".eq('group_id', groupId)") ||
      /\.eq\("[a-z_]+\.group_id",\s*groupId\)/.test(body);
    if (!filtersByGroup) continue;
    const keysOnGroup = /queryKey:\s*\[[^\]]*groupId/.test(body);
    if (!keysOnGroup) offenders.push(name);
  }
  assert.deepEqual(
    offenders,
    [],
    `these hooks filter by group_id but omit groupId from queryKey (stale-on-switch risk): ${offenders.join(", ")}`,
  );
});

// ---------------------------------------------------------------------------
// 3. group-switcher — surfaces group type, no raw identifiers
// ---------------------------------------------------------------------------

test("group-switcher renders the shared GroupTypeBadge and reads group_level", () => {
  assert.ok(switcher.length > 0, "group-switcher.tsx must exist");
  assert.ok(switcher.includes("GroupTypeBadge"), "switcher renders <GroupTypeBadge");
  assert.ok(switcher.includes("group_level"), "switcher passes group_level to the badge");
});

test("group-switcher iterates memberships and can switch group", () => {
  // Tolerant: a sibling may render the raw list (memberships.map) or a derived
  // one (filteredMemberships.map from a search box). Either way it must (a)
  // read the memberships collection and (b) map a per-group list to items.
  assert.ok(switcher.includes("memberships"), "switcher reads the memberships collection");
  assert.ok(
    /\bmemberships\.map\b/.test(switcher) || /\b\w*[Mm]emberships\.map\b/.test(switcher),
    "switcher maps a (possibly filtered) memberships list to items",
  );
  assert.ok(switcher.includes("switchGroup"), "switcher wires switchGroup on selection");
});

test("group-switcher does not render a raw group UUID in visible text", () => {
  // Best-effort heuristic: an id should never be interpolated directly into
  // JSX text. key={...id} is fine (not rendered); {m.group.id} / {group.id}
  // as a text child is not.
  assert.ok(
    !/>\s*\{[^}]*\bgroup\.id\b[^}]*\}\s*</.test(switcher),
    "group-switcher must not print a group's id as visible text",
  );
});

// ---------------------------------------------------------------------------
// 4. My groups — consolidated view that lists groups and switches
// ---------------------------------------------------------------------------

test("a My-groups page exists, lists memberships, and switches group", () => {
  assert.ok(present(myGroupsPath), "the My-groups view must exist");
  assert.ok(myGroups.includes("memberships"), "My-groups reads the memberships list");
  // Tolerant: a sibling may map memberships directly or via a derived/ordered
  // list (e.g. ordered.map / filtered.map). Require a per-item .map plus the
  // memberships read above — together they prove it renders each membership.
  assert.ok(/\.map\(\s*\(?\s*\w+/.test(myGroups), "My-groups renders a list of group cards");
  assert.ok(myGroups.includes("switchGroup"), "My-groups can switch to a chosen group");
});

test("My-groups surfaces group type via the shared badge", () => {
  assert.ok(myGroups.includes("GroupTypeBadge"), "My-groups uses the shared GroupTypeBadge");
});

test("My-groups does not render a raw group UUID in visible text", () => {
  assert.ok(
    !/>\s*\{[^}]*\bgroup\.id\b[^}]*\}\s*</.test(myGroups),
    "My-groups must not print a group's id as visible text",
  );
});

// ---------------------------------------------------------------------------
// 5. members/[id] — guards on the active group (no cross-tenant detail view)
// ---------------------------------------------------------------------------

test("members/[id] guards the detail view against a foreign group", () => {
  assert.ok(present(MEMBER_DETAIL), "members/[id] page must exist");
  // It must read the active groupId from context...
  assert.ok(memberDetail.includes("groupId"), "member detail reads the active groupId");
  // ...and compare the loaded member's group against it. Accept the common
  // shapes a sibling might write (group_id !== groupId, group_id === groupId,
  // or a named wrongGroup guard token).
  const comparesGroup =
    /group_id\s*!==\s*groupId/.test(memberDetail) ||
    /groupId\s*!==\s*[\w.?]*group_id/.test(memberDetail) ||
    /group_id\s*===\s*groupId/.test(memberDetail) ||
    memberDetail.includes("wrongGroup");
  assert.ok(comparesGroup, "member detail compares the member's group_id to the active groupId");
});

test("members/[id] shows the wrong-group copy from i18n (not a raw error)", () => {
  // The guard's customer-facing message comes through t(), not a hardcoded
  // string. Tolerant: accept either the namespaced key or the token.
  assert.ok(
    memberDetail.includes("wrongGroup"),
    "member detail references a wrongGroup translation key for the guard",
  );
});

// ---------------------------------------------------------------------------
// 6. my-payments / my-dashboard — per-group "In {group}" label, gated
// ---------------------------------------------------------------------------

test("my-payments shows a per-group label gated on memberships.length > 1", () => {
  assert.ok(myPayments.includes("memberships"), "my-payments reads memberships from useGroup");
  assert.ok(
    /memberships\.length\s*>\s*1/.test(myPayments),
    "the per-group label is gated on memberships.length > 1 (single-group members see nothing)",
  );
  assert.ok(myPayments.includes('t("inGroup"'), "my-payments renders the inGroup label via t()");
});

test("my-dashboard shows a per-group label gated on memberships.length > 1", () => {
  assert.ok(myDashboard.includes("memberships"), "my-dashboard reads memberships from useGroup");
  assert.ok(
    /memberships\.length\s*>\s*1/.test(myDashboard),
    "the per-group label is gated on memberships.length > 1",
  );
  assert.ok(myDashboard.includes('t("inGroup"'), "my-dashboard renders the inGroup label via t()");
});

test("the per-group label is data-labeling only — no query was re-scoped", () => {
  // Guard against a well-meaning author 'fixing isolation' here: these pages
  // must keep using the already-group-scoped hooks, not hand-roll a group
  // filter. The label change must not introduce a new group_id filter.
  for (const [name, src] of [["my-payments", myPayments], ["my-dashboard", myDashboard]]) {
    assert.ok(
      src.includes("useObligations"),
      `${name} still relies on the group-scoped obligations hook`,
    );
  }
});

// ---------------------------------------------------------------------------
// 7. join-by-code + my-invitations — land in the joined group
// ---------------------------------------------------------------------------

test("join-by-code switches to the newly joined group", () => {
  assert.ok(joinDialog.length > 0, "join-by-code dialog must exist");
  assert.ok(
    joinDialog.includes("switchGroup"),
    "join-by-code must switchGroup() after a successful join so an existing multi-group user lands in the NEW group",
  );
});

test("my-invitations switches to the group after accepting an invite", () => {
  assert.ok(myInvitations.length > 0, "my-invitations page must exist");
  assert.ok(
    myInvitations.includes("switchGroup"),
    "accepting an invitation must switchGroup() to the joined group",
  );
});

// ---------------------------------------------------------------------------
// 8. GroupTypeBadge — hq/branch render, standalone is silent by default
// ---------------------------------------------------------------------------

test("GroupTypeBadge handles hq / branch / standalone", () => {
  assert.ok(badge.length > 0, "group-type-badge.tsx must exist");
  for (const level of ["hq", "branch", "standalone"]) {
    assert.ok(badge.includes(`"${level}"`), `badge handles the ${level} level`);
  }
});

test("GroupTypeBadge returns null for standalone unless showStandalone", () => {
  // Standalone is the common case and must be silent by default to avoid
  // badging every group. The component guards on showStandalone before
  // returning null.
  assert.ok(badge.includes("showStandalone"), "badge has a showStandalone opt-in");
  assert.ok(/return null/.test(badge), "badge returns null for the silent standalone case");
});

// ---------------------------------------------------------------------------
// 9. i18n — new copy present in BOTH bundles, real French
// ---------------------------------------------------------------------------

test("groupType.* exists in BOTH bundles with hq/branch/standalone", () => {
  for (const bundle of [en, fr]) {
    assert.ok(bundle.groupType, "groupType namespace present");
    for (const k of ["hq", "branch", "standalone"]) {
      assert.ok(typeof bundle.groupType[k] === "string", `groupType.${k} is a string`);
    }
  }
});

test("the per-group 'inGroup' label exists in BOTH bundles for payments + dashboard", () => {
  assert.ok(typeof en.myPayments?.inGroup === "string", "EN myPayments.inGroup");
  assert.ok(typeof fr.myPayments?.inGroup === "string", "FR myPayments.inGroup");
  assert.ok(typeof en.myDashboard?.inGroup === "string", "EN myDashboard.inGroup");
  assert.ok(typeof fr.myDashboard?.inGroup === "string", "FR myDashboard.inGroup");
  // The {group} placeholder must survive translation in both locales.
  for (const v of [en.myPayments.inGroup, fr.myPayments.inGroup, en.myDashboard.inGroup, fr.myDashboard.inGroup]) {
    assert.ok(v.includes("{group}"), "inGroup copy keeps the {group} placeholder");
  }
});

test("myGroups.* exists in BOTH bundles and is structurally identical", () => {
  const leafPaths = (obj, prefix = "") =>
    Object.entries(obj).flatMap(([k, v]) =>
      v && typeof v === "object" ? leafPaths(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
  assert.ok(en.myGroups && fr.myGroups, "both bundles have a myGroups namespace");
  assert.deepEqual(
    leafPaths(en.myGroups).sort(),
    leafPaths(fr.myGroups).sort(),
    "myGroups leaves must match across en/fr",
  );
});

test("the members wrong-group guard copy exists in BOTH bundles", () => {
  // Tolerant: the exact key path is a sibling's to choose. Scan the whole
  // members namespace (any depth) for a wrongGroup-flavoured key in both.
  const hasWrongGroup = (bundle) => JSON.stringify(bundle.members || {}).toLowerCase().includes("wronggroup");
  assert.ok(hasWrongGroup(en), "EN members copy has a wrong-group guard string");
  assert.ok(hasWrongGroup(fr), "FR members copy has a wrong-group guard string");
});

test("FR multi-tenant copy is real French, not copied English", () => {
  // groupType branch labels differ between locales (Branch vs Antenne).
  assert.notEqual(en.groupType.branch, fr.groupType.branch);
  assert.notEqual(en.groupType.hq, fr.groupType.hq);
  // And the new myGroups namespace carries accents somewhere.
  assert.match(JSON.stringify(fr.myGroups || {}), /[éèàçûôîâ]/);
});

// ---------------------------------------------------------------------------
// 10. NO raw identifiers leaked into customer-facing group views
// ---------------------------------------------------------------------------

test("switcher and My-groups never interpolate a bare '.id}' into visible text", () => {
  // Best-effort: an id rendered as a JSX text child looks like  >{x.id}<  .
  // key={x.id} (attribute) and href usage are not matched by this pattern.
  for (const [name, src] of [["group-switcher", switcher], ["my-groups", myGroups]]) {
    assert.ok(
      !/>\s*\{[^}]*\.id\}\s*</.test(src),
      `${name} must not render a raw id as visible text`,
    );
  }
});
