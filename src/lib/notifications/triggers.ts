import { createClient } from '@/lib/supabase/server';
import {
  sendNotification,
  sendBulkNotification,
  NotificationType,
  NotificationChannel,
} from '@/lib/notifications';

// ─── Payment Recorded ───────────────────────────────────────────────────────

interface OnPaymentRecordedParams {
  paymentId: string;
  membershipId: string;
  groupId: string;
}

export async function onPaymentRecorded(params: OnPaymentRecordedParams): Promise<void> {
  const { paymentId, membershipId, groupId } = params;
  const supabase = await createClient();

  // Fetch payment details
  const { data: payment } = await supabase
    .from('contributions')
    .select('amount, currency, payment_method, payment_type, created_at')
    .eq('id', paymentId)
    .single();

  // Fetch membership with user and group info
  const { data: membership } = await supabase
    .from('memberships')
    .select('user_id, display_name, groups(name)')
    .eq('id', membershipId)
    .single();

  if (!payment || !membership) return;

  const groupName = (membership.groups as unknown as { name: string })?.name ?? 'Group';
  const memberName = membership.display_name ?? 'Member';
  const amount = `${payment.currency} ${payment.amount}`;

  // Notify the payer with receipt
  await sendNotification({
    userId: membership.user_id,
    groupId,
    type: NotificationType.PAYMENT_REMINDERS,
    title: `Payment of ${amount} recorded`,
    titleFr: `Paiement de ${amount} enregistr\u00e9`,
    body: `Your ${payment.payment_type} payment to ${groupName} has been recorded. Method: ${payment.payment_method}.`,
    bodyFr: `Votre paiement ${payment.payment_type} \u00e0 ${groupName} a \u00e9t\u00e9 enregistr\u00e9. M\u00e9thode: ${payment.payment_method}.`,
    data: { paymentId, amount: payment.amount, currency: payment.currency },
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
  });

  // Notify group admins
  const { data: admins } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('group_id', groupId)
    .in('role', ['admin', 'president', 'treasurer']);

  if (admins && admins.length > 0) {
    const adminIds = admins.map((a) => a.user_id).filter((id) => id !== membership.user_id);
    if (adminIds.length > 0) {
      await sendBulkNotification(adminIds, {
        groupId,
        type: NotificationType.PAYMENT_REMINDERS,
        title: `${memberName} made a payment of ${amount}`,
        titleFr: `${memberName} a effectu\u00e9 un paiement de ${amount}`,
        body: `${memberName} paid ${amount} (${payment.payment_type}) to ${groupName}.`,
        bodyFr: `${memberName} a pay\u00e9 ${amount} (${payment.payment_type}) \u00e0 ${groupName}.`,
        data: { paymentId, membershipId, memberName },
        channels: [NotificationChannel.IN_APP],
      });
    }
  }
}

// ─── Payment Overdue ────────────────────────────────────────────────────────

interface OnPaymentOverdueParams {
  membershipId: string;
  groupId: string;
  amount: number;
  currency: string;
  dueDate: string;
  daysOverdue: number;
}

export async function onPaymentOverdue(params: OnPaymentOverdueParams): Promise<void> {
  const { membershipId, groupId, amount, currency, dueDate, daysOverdue } = params;
  const supabase = await createClient();

  const { data: membership } = await supabase
    .from('memberships')
    .select('user_id, display_name, groups(name)')
    .eq('id', membershipId)
    .single();

  if (!membership) return;

  const groupName = (membership.groups as unknown as { name: string })?.name ?? 'Group';
  const formattedAmount = `${currency} ${amount}`;

  // Escalate channels based on how overdue
  const channels = [NotificationChannel.IN_APP, NotificationChannel.EMAIL];
  if (daysOverdue > 7) {
    channels.push(NotificationChannel.SMS);
  }
  if (daysOverdue > 14) {
    channels.push(NotificationChannel.WHATSAPP);
  }

  await sendNotification({
    userId: membership.user_id,
    groupId,
    type: NotificationType.PAYMENT_REMINDERS,
    title: `Payment of ${formattedAmount} is overdue`,
    titleFr: `Paiement de ${formattedAmount} en retard`,
    body: `Your payment of ${formattedAmount} to ${groupName} was due on ${dueDate}. ${daysOverdue} day(s) overdue.`,
    bodyFr: `Votre paiement de ${formattedAmount} \u00e0 ${groupName} \u00e9tait d\u00fb le ${dueDate}. ${daysOverdue} jour(s) de retard.`,
    data: { membershipId, amount, currency, dueDate, daysOverdue },
    channels,
  });
}

// ─── Event Soon ─────────────────────────────────────────────────────────────

interface OnEventSoonParams {
  eventId: string;
  groupId: string;
  hoursUntil: number;
}

export async function onEventSoon(params: OnEventSoonParams): Promise<void> {
  const { eventId, groupId, hoursUntil } = params;
  const supabase = await createClient();

  // Fetch event details
  const { data: event } = await supabase
    .from('events')
    .select('title, start_date, location, groups(name)')
    .eq('id', eventId)
    .single();

  if (!event) return;

  const groupName = (event.groups as unknown as { name: string })?.name ?? 'Group';

  // Fetch all members who RSVPd or all members if no RSVP system
  const { data: rsvps } = await supabase
    .from('event_rsvps')
    .select('membership_id, memberships(user_id)')
    .eq('event_id', eventId)
    .eq('status', 'attending');

  const userIds =
    rsvps
      ?.map((r) => (r.memberships as unknown as { user_id: string })?.user_id)
      .filter((id): id is string => !!id) ?? [];

  if (userIds.length === 0) return;

  const timeLabel = hoursUntil <= 1 ? '1 hour' : `${hoursUntil} hours`;
  const timeLabelFr = hoursUntil <= 1 ? '1 heure' : `${hoursUntil} heures`;

  await sendBulkNotification(userIds, {
    groupId,
    type: NotificationType.EVENT_REMINDERS,
    title: `${event.title} starts in ${timeLabel}`,
    titleFr: `${event.title} commence dans ${timeLabelFr}`,
    body: `Your event "${event.title}" with ${groupName} starts in ${timeLabel} at ${event.location ?? 'TBD'}.`,
    bodyFr: `Votre \u00e9v\u00e9nement "${event.title}" avec ${groupName} commence dans ${timeLabelFr} \u00e0 ${event.location ?? '\u00c0 d\u00e9terminer'}.`,
    data: { eventId, hoursUntil },
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.PUSH],
  });
}

// ─── Hosting Reminder ───────────────────────────────────────────────────────

interface OnHostingReminderParams {
  assignmentId: string;
  membershipId: string;
  groupId: string;
  daysUntil: number;
}

export async function onHostingReminder(params: OnHostingReminderParams): Promise<void> {
  const { assignmentId, membershipId, groupId, daysUntil } = params;
  const supabase = await createClient();

  const { data: membership } = await supabase
    .from('memberships')
    .select('user_id, display_name, groups(name)')
    .eq('id', membershipId)
    .single();

  const { data: assignment } = await supabase
    .from('hosting_assignments')
    .select('event_date, location')
    .eq('id', assignmentId)
    .single();

  if (!membership || !assignment) return;

  const groupName = (membership.groups as unknown as { name: string })?.name ?? 'Group';

  await sendNotification({
    userId: membership.user_id,
    groupId,
    type: NotificationType.HOSTING_REMINDERS,
    title: `You are hosting ${groupName} in ${daysUntil} day(s)`,
    titleFr: `Vous accueillez ${groupName} dans ${daysUntil} jour(s)`,
    body: `Reminder: You are hosting the next ${groupName} meeting on ${assignment.event_date} at ${assignment.location ?? 'your location'}. Please make preparations.`,
    bodyFr: `Rappel : Vous accueillez la prochaine r\u00e9union de ${groupName} le ${assignment.event_date} \u00e0 ${assignment.location ?? 'votre lieu'}. Veuillez faire les pr\u00e9paratifs.`,
    data: { assignmentId, daysUntil },
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.SMS],
  });
}

// ─── Minutes Published ──────────────────────────────────────────────────────

interface OnMinutesPublishedParams {
  minutesId: string;
  eventId: string;
  groupId: string;
}

export async function onMinutesPublished(params: OnMinutesPublishedParams): Promise<void> {
  const { minutesId, eventId, groupId } = params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from('events')
    .select('title, start_date, groups(name)')
    .eq('id', eventId)
    .single();

  if (!event) return;

  const groupName = (event.groups as unknown as { name: string })?.name ?? 'Group';

  // Notify all group members
  const { data: members } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('group_id', groupId)
    .eq('standing', 'active');

  const userIds = members?.map((m) => m.user_id) ?? [];

  if (userIds.length === 0) return;

  await sendBulkNotification(userIds, {
    groupId,
    type: NotificationType.MINUTES_PUBLISHED,
    title: `Minutes published: ${event.title}`,
    titleFr: `Compte rendu publi\u00e9 : ${event.title}`,
    body: `The minutes for "${event.title}" (${event.start_date}) in ${groupName} have been published. Review the summary and action items.`,
    bodyFr: `Le compte rendu de "${event.title}" (${event.start_date}) dans ${groupName} a \u00e9t\u00e9 publi\u00e9. Consultez le r\u00e9sum\u00e9 et les points d'action.`,
    data: { minutesId, eventId },
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
  });
}

// ─── Relief Status Change ───────────────────────────────────────────────────

interface OnReliefStatusChangeParams {
  claimId: string;
  membershipId: string;
  groupId: string;
  newStatus: string;
}

export async function onReliefStatusChange(params: OnReliefStatusChangeParams): Promise<void> {
  const { claimId, membershipId, groupId, newStatus } = params;
  const supabase = await createClient();

  const { data: membership } = await supabase
    .from('memberships')
    .select('user_id, display_name, groups(name)')
    .eq('id', membershipId)
    .single();

  const { data: claim } = await supabase
    .from('relief_claims')
    .select('amount, currency, notes')
    .eq('id', claimId)
    .single();

  if (!membership || !claim) return;

  const groupName = (membership.groups as unknown as { name: string })?.name ?? 'Group';
  const formattedAmount = `${claim.currency} ${claim.amount}`;

  await sendNotification({
    userId: membership.user_id,
    groupId,
    type: NotificationType.RELIEF_UPDATES,
    title: `Relief claim ${newStatus}: ${formattedAmount}`,
    titleFr: `Demande de secours ${newStatus} : ${formattedAmount}`,
    body: `Your relief claim of ${formattedAmount} with ${groupName} has been updated to: ${newStatus}.${claim.notes ? ` Notes: ${claim.notes}` : ''}`,
    bodyFr: `Votre demande de secours de ${formattedAmount} aupr\u00e8s de ${groupName} a \u00e9t\u00e9 mise \u00e0 jour : ${newStatus}.${claim.notes ? ` Notes : ${claim.notes}` : ''}`,
    data: { claimId, newStatus, amount: claim.amount, currency: claim.currency },
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
  });
}

// ─── Standing Changed ───────────────────────────────────────────────────────

interface OnStandingChangedParams {
  membershipId: string;
  groupId: string;
  oldStanding: string;
  newStanding: string;
}

export async function onStandingChanged(params: OnStandingChangedParams): Promise<void> {
  const { membershipId, groupId, oldStanding, newStanding } = params;
  const supabase = await createClient();

  const { data: membership } = await supabase
    .from('memberships')
    .select('user_id, display_name, groups(name)')
    .eq('id', membershipId)
    .single();

  if (!membership) return;

  const groupName = (membership.groups as unknown as { name: string })?.name ?? 'Group';

  await sendNotification({
    userId: membership.user_id,
    groupId,
    type: NotificationType.STANDING_CHANGES,
    title: `Standing changed to ${newStanding} in ${groupName}`,
    titleFr: `Statut chang\u00e9 en ${newStanding} dans ${groupName}`,
    body: `Your membership standing in ${groupName} has changed from ${oldStanding} to ${newStanding}. Please check your dashboard for any required actions.`,
    bodyFr: `Votre statut de membre dans ${groupName} est pass\u00e9 de ${oldStanding} \u00e0 ${newStanding}. Veuillez v\u00e9rifier votre tableau de bord pour les actions requises.`,
    data: { membershipId, oldStanding, newStanding },
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.SMS],
  });
}

// ─── New Member Joined ──────────────────────────────────────────────────────

interface OnNewMemberJoinedParams {
  membershipId: string;
  groupId: string;
  memberName: string;
}

export async function onNewMemberJoined(params: OnNewMemberJoinedParams): Promise<void> {
  const { membershipId, groupId, memberName } = params;
  const supabase = await createClient();

  const { data: group } = await supabase
    .from('groups')
    .select('name')
    .eq('id', groupId)
    .single();

  if (!group) return;

  // Notify admins
  const { data: admins } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('group_id', groupId)
    .in('role', ['admin', 'president']);

  const adminIds = admins?.map((a) => a.user_id) ?? [];

  if (adminIds.length === 0) return;

  await sendBulkNotification(adminIds, {
    groupId,
    type: NotificationType.NEW_MEMBER,
    title: `${memberName} joined ${group.name}`,
    titleFr: `${memberName} a rejoint ${group.name}`,
    body: `${memberName} has been added as a new member of ${group.name}.`,
    bodyFr: `${memberName} a \u00e9t\u00e9 ajout\u00e9(e) comme nouveau membre de ${group.name}.`,
    data: { membershipId, memberName },
    channels: [NotificationChannel.IN_APP],
  });
}
