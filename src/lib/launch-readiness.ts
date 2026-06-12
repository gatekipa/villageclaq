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
