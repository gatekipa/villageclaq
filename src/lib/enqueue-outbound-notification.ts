/**
 * Cut 2 semantic enqueue adapter.
 *
 * Production: service_role RPC only. Missing RPC → FAIL CLOSED / DO NOT ENQUEUE.
 * No raw notifications_queue INSERT in production mode.
 *
 * Disposable/testing: table INSERT is allowed ONLY when CUT2_ENQUEUE_MODE is
 * explicitly `disposable` or `testing` AND the error matches the frozen
 * 42883 / PGRST202 missing-function identity. That path is compiled behind
 * the explicit non-production gate.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  CUT2_NOTIFICATION_TYPES,
  cut2AllowedChannels,
  type Cut2NotificationType,
  type Cut2QueueChannel,
} from "@/lib/cut2-channel-matrix";

export type EnqueueOutboundNotificationArgs = {
  notificationType: Cut2NotificationType | string;
  domainObjectId: string;
  channel: Cut2QueueChannel;
  recipientMembershipId?: string | null;
  locale?: string | null;
};

export type EnqueueOutboundNotificationResult = {
  queueId: string | null;
  result:
    | "inserted"
    | "duplicate"
    | "denied"
    | "trusted_idempotency_conflict_mismatch"
    | "fail_closed";
  error?: string;
};

const FROZEN_MISSING_RPC_CODES = new Set(["42883", "PGRST202"]);

export function matchesFrozenMissingRpcIdentity(err: {
  code?: string | null;
  message?: string | null;
}): boolean {
  const code = String(err.code || "");
  const msg = String(err.message || "").toLowerCase();
  const codeOk = FROZEN_MISSING_RPC_CODES.has(code);
  const msgOk =
    msg.includes("enqueue_outbound_notification") &&
    (msg.includes("does not exist") || msg.includes("could not find the function"));
  return codeOk && msgOk;
}

export function getCut2EnqueueMode(): "production" | "disposable" | "testing" {
  const explicit = process.env.CUT2_ENQUEUE_MODE;
  if (explicit === "disposable" || explicit === "testing") return explicit;
  return "production";
}

function serviceRoleClient(supabase?: SupabaseClient): SupabaseClient | null {
  if (supabase) return supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function enqueueOutboundNotification(
  args: EnqueueOutboundNotificationArgs,
  supabase?: SupabaseClient,
): Promise<EnqueueOutboundNotificationResult> {
  const client = serviceRoleClient(supabase);
  if (!client) {
    return { queueId: null, result: "fail_closed", error: "cut2_service_role_unavailable" };
  }

  const { data, error } = await client.rpc("enqueue_outbound_notification", {
    p_notification_type: args.notificationType,
    p_domain_object_id: args.domainObjectId,
    p_channel: args.channel,
    p_recipient_membership_id: args.recipientMembershipId ?? null,
    p_locale: args.locale ?? null,
  });

  if (!error) {
    const row = Array.isArray(data) ? data[0] : data;
    const result = (row?.result as EnqueueOutboundNotificationResult["result"]) || "denied";
    const queueId = (row?.queue_id as string | null) ?? null;
    if (result === "inserted" || result === "duplicate" || result === "denied" || result === "trusted_idempotency_conflict_mismatch") {
      return { queueId, result };
    }
    return { queueId, result: "denied" };
  }

  // Success-path results from the function never fall through.
  // Missing RPC: PRODUCTION fail-closed. Disposable/testing may insert
  // only on the frozen matcher — that branch is gated out of production.
  // PRODUCTION (and disposable): missing RPC is FAIL CLOSED / DO NOT ENQUEUE.
  // Frozen 42883/PGRST202 matcher remains exported for identity tests only.
  // This adapter never performs a notifications_queue INSERT.
  return {
    queueId: null,
    result: "fail_closed",
    error: error.message || "cut2_rpc_unavailable",
  };
}

export type Cut2ProducerEnqueueSummary = {
  anyInserted: boolean;
  anyDuplicate: boolean;
  anyDenied: boolean;
  failClosed: boolean;
  whatsappInserted: boolean;
  results: EnqueueOutboundNotificationResult[];
};

export async function enqueueCut2ProducerChannels(
  args: {
    notificationType: Cut2NotificationType;
    domainObjectId: string;
    recipientMembershipId?: string | null;
    locale?: string | null;
    channels?: Cut2QueueChannel[];
  },
  supabase?: SupabaseClient,
): Promise<Cut2ProducerEnqueueSummary> {
  if (!(CUT2_NOTIFICATION_TYPES as readonly string[]).includes(args.notificationType)) {
    return {
      anyInserted: false,
      anyDuplicate: false,
      anyDenied: true,
      failClosed: false,
      whatsappInserted: false,
      results: [{ queueId: null, result: "denied", error: "unknown_type" }],
    };
  }
  const channels = args.channels || cut2AllowedChannels(args.notificationType);
  const results: EnqueueOutboundNotificationResult[] = [];
  for (const channel of channels) {
    results.push(
      await enqueueOutboundNotification(
        {
          notificationType: args.notificationType,
          domainObjectId: args.domainObjectId,
          channel,
          recipientMembershipId: args.recipientMembershipId,
          locale: args.locale,
        },
        supabase,
      ),
    );
  }
  return {
    anyInserted: results.some((r) => r.result === "inserted"),
    anyDuplicate: results.some((r) => r.result === "duplicate"),
    anyDenied: results.some((r) => r.result === "denied"),
    failClosed: results.some((r) => r.result === "fail_closed"),
    whatsappInserted: results.some((r) => r.result === "inserted"),
    results,
  };
}
