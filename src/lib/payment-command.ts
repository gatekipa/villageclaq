import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentAction = "record" | "submit" | "confirm" | "reject" | "correct" | "void";
export interface PaymentCommandResult {
  payment: Record<string, unknown>;
  appliedTo: { obligationId: string; typeName: string; amountApplied: number }[];
  creditRemaining: number;
  replayed: boolean;
}

const memory = new Map<string, string>();
/** Retain an uncertain request across remount/reload. Only acknowledged success ends it.
 * The database, not this browser cache, enforces uniqueness and rejects changed input.
 */
export function paymentRequestId(scope: string): string {
  const key = "villageclaq:payment-request:" + scope;
  const existing = typeof window === "undefined" ? memory.get(key) : window.sessionStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  memory.set(key, id);
  if (typeof window !== "undefined") window.sessionStorage.setItem(key, id);
  return id;
}

export function acknowledgePaymentRequest(scope: string): void {
  const key = "villageclaq:payment-request:" + scope;
  memory.delete(key);
  if (typeof window !== "undefined") window.sessionStorage.removeItem(key);
}

export async function applyPaymentCommand(
  client: SupabaseClient,
  input: { groupId: string; requestId: string; action: PaymentAction; values?: Record<string, unknown>;
    paymentId?: string; expectedVersion?: number; reason?: string },
): Promise<PaymentCommandResult> {
  let response;
  try {
    response = await client.rpc("apply_payment_command", {
      p_group_id: input.groupId, p_request_id: input.requestId, p_action: input.action,
      p_values: input.values || {}, p_payment_id: input.paymentId || null,
      p_expected_version: input.expectedVersion ?? null, p_reason: input.reason || null,
    });
  } catch {
    throw new Error("PAYMENT_COMMAND_FAILED");
  }
  const { data, error } = response;
  if (error) {
    // Do not log database details, receipt paths or request payloads.
    throw new Error(["PAYMENT_VERSION_CONFLICT", "IDEMPOTENCY_KEY_CONFLICT", "PAYMENT_COMMAND_REQUIRED"]
      .find((code) => error.message?.includes(code)) || "PAYMENT_COMMAND_FAILED");
  }
  if (!data?.payment?.id) throw new Error("PAYMENT_COMMAND_RESULT_MISSING");
  return data as PaymentCommandResult;
}
