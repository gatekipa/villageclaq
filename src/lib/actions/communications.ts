"use server";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { groupId, title, titleFr, body, bodyFr, audienceType, targetRoles, targetMemberIds, channels, scheduledAt, createdBy, asDraft } = params;

  if (!title.trim() || !body.trim()) {
    throw new Error("EMPTY_MESSAGE");
  }

  const audienceData =
    audienceType === "all"
      ? { type: "all" }
      : audienceType === "roles"
      ? { type: "roles", roles: targetRoles || [] }
      : { type: "members", members: targetMemberIds || [] };

  const isNow = !asDraft && !scheduledAt;
  const sentAt = isNow ? new Date().toISOString() : null;
  const actualScheduledAt = !asDraft && scheduledAt ? scheduledAt : null;

  // Insert into announcements
  const { data: inserted, error: insertError } = await supabase
    .from("announcements")
    .insert({
      group_id: groupId,
      title,
      title_fr: titleFr || null,
      content: body,
      content_fr: bodyFr || null,
      channels,
      audience: audienceData,
      sent_at: sentAt,
      scheduled_at: actualScheduledAt,
      created_by: createdBy,
    })
    .select("id")
    .single();

  if (insertError) throw new Error(insertError.message);

  // If sending now, fan out via the RPC
  if (isNow) {
    let query = supabase
      .from("memberships")
      .select("id, user_id, role, standing, profiles!memberships_user_id_fkey(preferred_locale, phone)")
      .eq("group_id", groupId);

    if (audienceType === "roles" && targetRoles?.length) {
      query = query.in("role", targetRoles);
    } else if (audienceType === "specific" && targetMemberIds?.length) {
      query = query.in("id", targetMemberIds);
    }

    const { data: memberRows, error: memErr } = await query;
    if (memErr) throw new Error(memErr.message);

    const activeMembers = (memberRows || []).filter((m) => m.standing !== "banned" && m.user_id);

    const inAppPayloads = [];
    
    for (const member of activeMembers) {
      // IN_APP
      if (channels.includes("in_app")) {
        const profiles = member.profiles as any;
        inAppPayloads.push({
          group_id: groupId,
          user_id: member.user_id,
          type: "announcement",
          title: profiles?.preferred_locale === "fr" && titleFr ? titleFr : title,
          body: profiles?.preferred_locale === "fr" && bodyFr ? bodyFr : body,
          data: { announcement_id: inserted.id }
        });
      }

      // External Channels via queue_transactional_notification
      const externalChannels = channels.filter(c => c !== "in_app");
      for (const ch of externalChannels) {
        // Enqueue transactional notification via RPC
        const queuePayload = {
          group_id: groupId,
          membership_id: member.id,
          channel: ch,
          template_key: "announcement",
          payload: { announcement_id: inserted.id, title, body, titleFr, bodyFr },
          idempotency_key: `${inserted.id}_${member.id}_${ch}`
        };
        const { error: rpcErr } = await supabase.rpc("queue_transactional_notification", { p_command: queuePayload });
        if (rpcErr) console.error("Failed to enqueue transactional notification", rpcErr);
      }
    }

    if (inAppPayloads.length > 0) {
      await supabase.from("notifications").insert(inAppPayloads);
    }
  }

  return { id: inserted.id };
}
