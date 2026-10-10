"use server";

import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient as createUserClient } from "@/lib/supabase/server";
import { getEnabledChannels } from "@/lib/notification-prefs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedChannels = new Set(["in_app", "email", "sms", "whatsapp"]);

interface CreateAnnouncementParams {
  groupId: string;
  title: string;
  titleFr?: string | null;
  body: string;
  bodyFr?: string | null;
  audienceType: "all" | "roles" | "specific";
  targetRoles?: string[];
  targetMemberIds?: string[];
  channels: ("in_app" | "email" | "sms" | "whatsapp")[];
  scheduledAt?: string | null;
  createdBy: string;
  asDraft?: boolean;
}

export async function createAnnouncementAction(params: CreateAnnouncementParams) {
  const { groupId, title, titleFr, body, bodyFr, audienceType, targetRoles, targetMemberIds, channels, scheduledAt, createdBy, asDraft } = params;
  if (!uuidPattern.test(groupId) || !title?.trim() || !body?.trim()) throw new Error("INVALID_ANNOUNCEMENT");
  if (!Array.isArray(channels) || channels.length === 0 || channels.some((channel) => !allowedChannels.has(channel))) {
    throw new Error("INVALID_CHANNEL");
  }
  if (audienceType === "specific" && (!targetMemberIds?.length || targetMemberIds.some((id) => !uuidPattern.test(id)))) {
    throw new Error("INVALID_AUDIENCE");
  }
  if (audienceType === "roles" && !targetRoles?.length) throw new Error("INVALID_AUDIENCE");
  if (!(["all", "roles", "specific"] as string[]).includes(audienceType)) throw new Error("INVALID_AUDIENCE");
  if (scheduledAt && !Number.isFinite(Date.parse(scheduledAt))) throw new Error("INVALID_SCHEDULE");

  const actor = await createUserClient();
  const { data: { user }, error: authError } = await actor.auth.getUser();
  if (authError || !user || createdBy !== user.id) throw new Error("UNAUTHORIZED");
  const { data: membership, error: membershipError } = await actor.from("memberships")
    .select("id").eq("group_id", groupId).eq("user_id", user.id)
    .eq("membership_status", "active").maybeSingle();
  if (membershipError || !membership) throw new Error("UNAUTHORIZED");
  const { data: canManage, error: permissionError } = await actor.rpc("has_group_permission", {
    gid: groupId, perm_key: "announcements.manage",
  });
  if (permissionError || canManage !== true) throw new Error("UNAUTHORIZED");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) throw new Error("ANNOUNCEMENT_SERVICE_UNAVAILABLE");
  const service = createServiceClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const audienceData = audienceType === "all"
    ? { type: "all" }
    : audienceType === "roles"
      ? { type: "roles", roles: targetRoles || [] }
      : { type: "members", members: targetMemberIds || [] };
  const isNow = !asDraft && !scheduledAt;
  const actualScheduledAt = !asDraft && scheduledAt ? scheduledAt : null;

  // Resolve the audience before writing the announcement, so a failed recipient
  // lookup cannot leave a newly published row without its intended fanout.
  let activeMembers: Array<Record<string, unknown>> = [];
  if (isNow) {
    let query = service.from("memberships")
      .select("id,user_id,role,standing,is_proxy,membership_status,profiles!memberships_user_id_fkey(preferred_locale,phone)")
      .eq("group_id", groupId).eq("membership_status", "active");
    if (audienceType === "roles") query = query.in("role", targetRoles!);
    if (audienceType === "specific") query = query.in("id", targetMemberIds!);
    const { data, error } = await query;
    if (error) throw new Error("RECIPIENT_LOOKUP_FAILED");
    activeMembers = (data || []).filter((m) => m.user_id && m.user_id !== user.id && !m.is_proxy && m.standing !== "banned") as Array<Record<string, unknown>>;
  }

  const { data: inserted, error: insertError } = await service.from("announcements").insert({
    group_id: groupId,
    title,
    title_fr: titleFr || null,
    content: body,
    content_fr: bodyFr || null,
    channels,
    audience: audienceData,
    sent_at: null,
    scheduled_at: actualScheduledAt,
    created_by: user.id,
  }).select("id").single();
  if (insertError || !inserted) throw new Error(insertError?.message || "ANNOUNCEMENT_INSERT_FAILED");

  if (isNow) {
    const inAppPayloads = [];
    for (const member of activeMembers) {
      const memberId = member.id as string;
      const userId = member.user_id as string;
      const profileRaw = member.profiles as { preferred_locale?: string | null } | { preferred_locale?: string | null }[] | null;
      const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;
      const enabled = await getEnabledChannels(service, userId, "announcements", groupId);
      if (channels.includes("in_app") && enabled.in_app) {
        inAppPayloads.push({
          group_id: groupId,
          user_id: userId,
          type: "announcement",
          title: profile?.preferred_locale === "fr" && titleFr ? titleFr : title,
          body: profile?.preferred_locale === "fr" && bodyFr ? bodyFr : body,
          data: { announcement_id: inserted.id },
        });
      }
      for (const channel of channels.filter((candidate) => candidate !== "in_app")) {
        if (!enabled[channel]) continue;
        const { data, error } = await service.rpc("queue_transactional_notification", { p_command: {
          group_id: groupId,
          membership_id: memberId,
          channel,
          template_key: "announcement",
          payload: { announcement_id: inserted.id, title, body, titleFr, bodyFr },
          idempotency_key: `${inserted.id}_${memberId}_${channel}`,
        } });
        if (error || (!data?.queued && !data?.idempotent_replay)) throw new Error("ANNOUNCEMENT_QUEUE_FAILED");
      }
    }
    if (inAppPayloads.length > 0) {
      const { error } = await service.from("notifications").insert(inAppPayloads);
      if (error) throw new Error("ANNOUNCEMENT_NOTIFICATION_FAILED");
    }
    // Publish only after every requested, consent-enabled queue operation is acknowledged.
    const { error: publishError } = await service.from("announcements")
      .update({ sent_at: new Date().toISOString() }).eq("id", inserted.id);
    if (publishError) throw new Error("ANNOUNCEMENT_PUBLISH_FAILED");
  }

  return { id: inserted.id };
}