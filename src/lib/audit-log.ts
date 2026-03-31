import type { SupabaseClient } from "@supabase/supabase-js";

interface LogActivityParams {
  groupId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Best-effort audit log insert.
 * Wraps in try/catch so a failed log never breaks the calling mutation.
 * actor_id is auto-resolved from the current Supabase session.
 */
export async function logActivity(
  supabase: SupabaseClient,
  params: LogActivityParams,
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("group_audit_logs").insert({
      group_id: params.groupId,
      actor_id: user?.id ?? null,
      action: params.action,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      description: params.description ?? null,
      details: params.metadata ?? {},
    });
  } catch {
    // Best-effort — never break the calling mutation
  }
}
