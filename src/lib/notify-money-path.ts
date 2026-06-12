/**
 * Client-side triggers for the server-side money-path WhatsApp producers
 * (fine issued, loan approved, relief claim decided, remittance decided).
 * Fire-and-forget: admin flows must never block on notification delivery.
 *
 * Each route authorizes the caller (affected member / active group
 * owner-admin / platform staff — plus the HQ-admin leg for remittances),
 * re-reads the entity from the DB, and enqueues at most one WhatsApp
 * notice per entity per decision (per recipient for the multi-recipient
 * remittance producer) — so repeated calls are safe.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

async function postProducer(
  supabase: SupabaseClient,
  path: string,
  payload: Record<string, unknown>,
  label: string,
): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
      keepalive: true,
    })
      .then((res) => {
        if (!res.ok) {
          console.warn(`[WhatsApp] ${label} notification returned`, res.status);
        }
      })
      .catch((err) => {
        console.warn(`[WhatsApp] ${label} notification request failed:`, err);
      });
  } catch (err) {
    console.warn(`[WhatsApp] ${label} notification request failed:`, err);
  }
}

export async function requestFineIssuedWhatsApp(
  supabase: SupabaseClient,
  fineId: string | null | undefined,
  locale?: string,
): Promise<void> {
  if (!fineId) return;
  await postProducer(
    supabase,
    "/api/fines/issued-notifications",
    { fineId, ...(locale ? { locale } : {}) },
    "fine issued",
  );
}

export async function requestLoanApprovedWhatsApp(
  supabase: SupabaseClient,
  loanId: string | null | undefined,
  locale?: string,
): Promise<void> {
  if (!loanId) return;
  await postProducer(
    supabase,
    "/api/loans/approval-notifications",
    { loanId, ...(locale ? { locale } : {}) },
    "loan approved",
  );
}

export async function requestReliefClaimDecisionWhatsApp(
  supabase: SupabaseClient,
  claimId: string | null | undefined,
  locale?: string,
): Promise<void> {
  if (!claimId) return;
  await postProducer(
    supabase,
    "/api/relief/claim-notifications",
    { claimId, ...(locale ? { locale } : {}) },
    "relief claim decision",
  );
}

export async function requestRemittanceDecisionWhatsApp(
  supabase: SupabaseClient,
  remittanceId: string | null | undefined,
  locale?: string,
): Promise<void> {
  if (!remittanceId) return;
  await postProducer(
    supabase,
    "/api/relief/remittance-notifications",
    { remittanceId, ...(locale ? { locale } : {}) },
    "remittance decision",
  );
}
