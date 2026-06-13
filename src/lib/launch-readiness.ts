/**
 * Launch-readiness computation for a group: a pure function over counts the
 * dashboard already has (or can fetch with cheap head-count queries). Powers
 * the LaunchChecklist card — the answer to "what is left before I launch
 * this group?".
 *
 * Pure and side-effect free by design: no queries, no dates, no i18n — the
 * caller supplies inputs and the component translates labels from the item
 * keys (dashboard.launch.* namespace).
 */

export type LaunchReadinessInputs = {
  /** Group has its basics (name + currency are set during the wizard). */
  groupProfileComplete: boolean;
  /** The owner/admin profile has a contact phone on file. */
  adminContactReady: boolean;
  /** Any invitation has been created (any status — sent or staged). */
  invitationCount: number;
  /** Active real members beyond the owner. */
  acceptedMemberCount: number;
  /** Contribution types configured. */
  contributionTypeCount: number;
  /** Events created (any). */
  eventCount: number;
};

export type LaunchChecklistItem = {
  /** i18n leaf key under dashboard.launch.items — also the React key. */
  key:
    | "groupProfile"
    | "adminContact"
    | "inviteMembers"
    | "firstMemberAccepted"
    | "duesConfigured"
    | "firstEvent"
    | "remindersReady";
  done: boolean;
  /** Dashboard-relative href for the item's CTA when not done (null = no CTA). */
  href: string | null;
};

export type LaunchReadiness = {
  items: LaunchChecklistItem[];
  doneCount: number;
  totalCount: number;
  /** Every item done — the group is ready to launch. */
  ready: boolean;
};

// ─── Launch Command Center (Sprint B) ───────────────────────────────────
// Richer model than the dashboard checklist: four-state statuses, activation
// stages, and send-capability flags so the UI can pair send-adjacent CTAs
// with review language. Same pure-function contract: no queries, no dates,
// no i18n — labels come from launchCenter.* keys keyed by item/stage key.

export type LaunchItemStatus = "ready" | "attention" | "optional" | "blocked";

export type LaunchCenterItemKey =
  | "groupProfile"
  | "adminContact"
  | "inviteMembers"
  | "firstMemberAccepted"
  | "duesConfigured"
  | "firstEvent"
  | "remindersReady"
  | "announcements";

export type LaunchCenterItem = {
  /** i18n leaf key under launchCenter.items — also the React key. */
  key: LaunchCenterItemKey;
  status: LaunchItemStatus;
  /** Dashboard-relative href for the item's CTA (null = informational, no CTA). */
  href: string | null;
  /**
   * The CTA leads to an area that can ultimately message members
   * (invitations, reminders, announcements). The UI pairs these with the
   * pre-send review note. Nothing on the launch center itself sends.
   */
  sendCapable: boolean;
};

export type ActivationStageKey =
  | "basics"
  | "invite"
  | "dues"
  | "event"
  | "reminders"
  | "summary"
  | "golive";

export type ActivationStage = {
  key: ActivationStageKey;
  state: "complete" | "current" | "upcoming";
};

export type LaunchCenter = {
  items: LaunchCenterItem[];
  stages: ActivationStage[];
  /** Items whose status is "ready" (includes optional items that became ready). */
  readyCount: number;
  /** Required items that are ready — the progress numerator. Never counts
   *  optional items, so it can't show "6 of 6" while ready is false. */
  requiredReadyCount: number;
  /** Items that must become ready before launch (excludes optional-only items). */
  requiredCount: number;
  /** All required items ready — the group can operate. */
  ready: boolean;
};

/** Item keys that gate launch. "announcements" never gates; "remindersReady"
 *  follows automatically from dues/events so it is counted via its ready
 *  transition rather than blocking launch on its own. */
const REQUIRED_ITEM_KEYS: LaunchCenterItemKey[] = [
  "groupProfile",
  "adminContact",
  "inviteMembers",
  "firstMemberAccepted",
  "duesConfigured",
  "firstEvent",
];

export function computeLaunchCenter(inputs: LaunchReadinessInputs): LaunchCenter {
  const duesConfigured = inputs.contributionTypeCount > 0;
  const firstEvent = inputs.eventCount > 0;
  const invited = inputs.invitationCount > 0 || inputs.acceptedMemberCount > 0;
  const joined = inputs.acceptedMemberCount > 0;

  const items: LaunchCenterItem[] = [
    {
      key: "groupProfile",
      status: inputs.groupProfileComplete ? "ready" : "attention",
      href: "/dashboard/settings",
      sendCapable: false,
    },
    {
      key: "adminContact",
      status: inputs.adminContactReady ? "ready" : "attention",
      href: "/dashboard/my-profile",
      sendCapable: false,
    },
    {
      key: "inviteMembers",
      status: invited ? "ready" : "attention",
      href: "/dashboard/invitations",
      sendCapable: true,
    },
    {
      // Can't have a first member before anyone is invited: blocked until
      // invitations exist, then "attention" (waiting on members), then ready.
      key: "firstMemberAccepted",
      status: joined ? "ready" : invited ? "attention" : "blocked",
      href: "/dashboard/invitations",
      sendCapable: false,
    },
    {
      key: "duesConfigured",
      status: duesConfigured ? "ready" : "attention",
      href: "/dashboard/contributions",
      sendCapable: false,
    },
    {
      key: "firstEvent",
      status: firstEvent ? "ready" : "attention",
      href: "/dashboard/events",
      sendCapable: false,
    },
    {
      // Reminders switch on automatically once dues or an event exist —
      // optional (informational) before that, ready after. Never a blocker.
      key: "remindersReady",
      status: duesConfigured || firstEvent ? "ready" : "optional",
      href: null,
      sendCapable: true,
    },
    {
      // Announcements are always available but never gate launch.
      key: "announcements",
      status: "optional",
      href: "/dashboard/announcements",
      sendCapable: true,
    },
  ];

  const byKey = new Map(items.map((i) => [i.key, i]));
  const requiredReadyCount = REQUIRED_ITEM_KEYS.filter((k) => byKey.get(k)?.status === "ready").length;
  const requiredReady = requiredReadyCount === REQUIRED_ITEM_KEYS.length;

  const basicsComplete = inputs.groupProfileComplete && inputs.adminContactReady;
  const remindersComplete = duesConfigured || firstEvent;
  const summaryComplete = basicsComplete && invited && duesConfigured && firstEvent && remindersComplete;
  const stageComplete: Record<ActivationStageKey, boolean> = {
    basics: basicsComplete,
    invite: invited,
    dues: duesConfigured,
    event: firstEvent,
    reminders: remindersComplete,
    summary: summaryComplete,
    // Going live needs a real member, not just invitations out the door.
    golive: summaryComplete && joined,
  };

  const order: ActivationStageKey[] = ["basics", "invite", "dues", "event", "reminders", "summary", "golive"];
  const currentIdx = order.findIndex((k) => !stageComplete[k]);
  const stages: ActivationStage[] = order.map((key, idx) => ({
    key,
    state: stageComplete[key] ? "complete" : idx === currentIdx ? "current" : "upcoming",
  }));

  return {
    items,
    stages,
    readyCount: items.filter((i) => i.status === "ready").length,
    requiredReadyCount,
    requiredCount: REQUIRED_ITEM_KEYS.length,
    ready: requiredReady,
  };
}

export function computeLaunchReadiness(inputs: LaunchReadinessInputs): LaunchReadiness {
  const duesConfigured = inputs.contributionTypeCount > 0;
  const firstEvent = inputs.eventCount > 0;

  const items: LaunchChecklistItem[] = [
    {
      key: "groupProfile",
      done: inputs.groupProfileComplete,
      href: "/dashboard/settings",
    },
    {
      key: "adminContact",
      done: inputs.adminContactReady,
      href: "/dashboard/my-profile",
    },
    {
      key: "inviteMembers",
      done: inputs.invitationCount > 0 || inputs.acceptedMemberCount > 0,
      href: "/dashboard/invitations",
    },
    {
      key: "firstMemberAccepted",
      done: inputs.acceptedMemberCount > 0,
      href: "/dashboard/invitations",
    },
    {
      key: "duesConfigured",
      done: duesConfigured,
      href: "/dashboard/contributions",
    },
    {
      key: "firstEvent",
      done: firstEvent,
      href: "/dashboard/events",
    },
    {
      // Reminders are automatic (daily crons + the notification queue): once
      // dues or an event exist there is nothing to configure. Informational
      // item so owners know reminders are covered — no CTA needed when done.
      key: "remindersReady",
      done: duesConfigured || firstEvent,
      href: null,
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  return {
    items,
    doneCount,
    totalCount: items.length,
    ready: doneCount === items.length,
  };
}
