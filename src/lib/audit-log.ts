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
 * Best-effort client activity report. The server fixes actor and marks these
 * reports unverified; consequential audit rows are written by authoritative
 * database commands and cannot be supplied by this client helper.
 */
export async function logActivity(
  supabase: SupabaseClient,
  params: LogActivityParams,
): Promise<void> {
  try {
    await supabase.rpc("record_client_activity", {
      p_group_id: params.groupId,
      p_reported_action: params.action,
      p_entity_type: params.entityType ?? null,
      p_entity_id: params.entityId ?? null,
      p_description: params.description ?? null,
      p_metadata: params.metadata ?? {},
    });
  } catch {
    // Best-effort — never break the calling mutation
  }
}
