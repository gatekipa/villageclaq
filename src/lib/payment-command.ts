import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActiveLedgerEpoch {
  id: string;
  group_id: string;
  currency: string;
  effective_from: string;
}

interface LedgerEpochClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        is(column: string, value: null): {
          limit(count: number): PromiseLike<{
            data: ActiveLedgerEpoch[] | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
  };
}

/** Resolve the server-governed active epoch. Missing rollout schema fails closed. */
export async function resolveActiveLedgerEpoch(
  client: unknown,
  groupId: string,
): Promise<ActiveLedgerEpoch> {
  const { data, error } = await (client as LedgerEpochClient)
    .from("financial_ledger_epochs")
    .select("id, group_id, currency, effective_from")
    .eq("group_id", groupId)
    .is("effective_to", null)
    .limit(2);

  if (error) throw new Error("FINANCIAL_LEDGER_EPOCH_UNAVAILABLE");
  if (!data || data.length !== 1) throw new Error("ACTIVE_LEDGER_EPOCH_REQUIRED");

  const epoch = data[0];
  const currency = epoch.currency?.trim().toUpperCase();
  if (!epoch.id || epoch.group_id !== groupId || !currency || !epoch.effective_from) {
    throw new Error("ACTIVE_LEDGER_EPOCH_REQUIRED");
  }
  return { ...epoch, currency };
}

export type PaymentAction = "record" | "submit" | "confirm" | "reject" | "correct" | "void";
export interface PaymentCommandResult {
  payment: Record<string, unknown>;
  appliedTo: { obligationId: string; typeName: string; amountApplied: number }[];
  creditRemaining: number;
  replayed: boolean;
}

const memory = new Map<string, string>();

interface PaymentScopeQuery {
  eq(column: string, value: string): PaymentScopeQuery;
  maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>;
}

interface PaymentScopeClient {
  from(table: string): { select(columns: string): PaymentScopeQuery };
}

async function assertActivePaymentAttribution(
  client: unknown,
  input: { groupId: string; values?: Record<string, unknown> },
  epoch: { id: string; currency: string },
): Promise<void> {
  const values = input.values || {};
  const membershipId = typeof values.membership_id === "string" ? values.membership_id : null;
  const requestedTypeId = typeof values.contribution_type_id === "string" ? values.contribution_type_id : null;
  const obligationId = typeof values.obligation_id === "string" ? values.obligation_id : null;
  const scopeClient = client as PaymentScopeClient;
  let typeId = requestedTypeId;

  if (obligationId) {
    const { data, error } = await scopeClient.from("contribution_obligations")
      .select("id, group_id, membership_id, contribution_type_id, currency, ledger_epoch_id")
      .eq("id", obligationId).eq("group_id", input.groupId).maybeSingle();
    if (error || !data || data.membership_id !== membershipId
      || data.ledger_epoch_id !== epoch.id
      || String(data.currency || "").trim().toUpperCase() !== epoch.currency
      || (requestedTypeId && data.contribution_type_id !== requestedTypeId)) {
      throw new Error("PAYMENT_ATTRIBUTION_INVALID");
    }
    typeId = String(data.contribution_type_id || "") || null;
  }

  if (typeId) {
    const { data, error } = await scopeClient.from("contribution_types")
      .select("id, group_id, currency, ledger_epoch_id")
      .eq("id", typeId).eq("group_id", input.groupId).maybeSingle();
    if (error || !data || data.ledger_epoch_id !== epoch.id
      || String(data.currency || "").trim().toUpperCase() !== epoch.currency) {
      throw new Error("PAYMENT_ATTRIBUTION_INVALID");
    }
  }
}
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
  // Capability probe for staged rollout safety. Old DB + new app cannot fall
  // through to a pre-epoch command implementation.
  const epoch = await resolveActiveLedgerEpoch(client, input.groupId);
  const requestedCurrency = typeof input.values?.currency === "string"
    ? input.values.currency.toUpperCase()
    : null;
  if (requestedCurrency && requestedCurrency !== epoch.currency) {
    throw new Error("CURRENCY_MISMATCH");
  }
  if (input.action === "record" || input.action === "submit") {
    await assertActivePaymentAttribution(client, input, epoch);
  }
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
    throw new Error([
      "PAYMENT_VERSION_CONFLICT",
      "IDEMPOTENCY_KEY_CONFLICT",
      "PAYMENT_COMMAND_REQUIRED",
      "ACTIVE_LEDGER_EPOCH_REQUIRED",
      "FINANCIAL_LEGACY_RESOLUTION_REQUIRED",
      "CURRENCY_MISMATCH",
      "PAYMENT_ATTRIBUTION_INVALID",
    ]
      .find((code) => error.message?.includes(code)) || "PAYMENT_COMMAND_FAILED");
  }
  if (!data?.payment?.id) throw new Error("PAYMENT_COMMAND_RESULT_MISSING");
  return data as PaymentCommandResult;
}
