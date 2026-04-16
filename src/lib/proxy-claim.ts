import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

export interface ClaimTokenResult {
  token: string;
  claimUrl: string;
  expiresAt: Date;
}

/**
 * Generate a secure claim token for a proxy membership.
 * The token is stored in proxy_claim_tokens and used to build a claim URL.
 */
export async function generateClaimToken(
  membershipId: string,
  email: string | null,
  phone: string | null,
  createdBy: string
): Promise<ClaimTokenResult> {
  const supabase = await createClient();

  // Generate cryptographically secure token
  const token = crypto.randomBytes(32).toString("hex");

  // Expires in 7 days
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  // Invalidate any previous unclaimed tokens for this membership
  await supabase
    .from("proxy_claim_tokens")
    .update({ expires_at: new Date().toISOString() })
    .eq("membership_id", membershipId)
    .is("claimed_at", null);

  // Insert new token
  const { error } = await supabase.from("proxy_claim_tokens").insert({
    membership_id: membershipId,
    token,
    email,
    phone,
    expires_at: expiresAt.toISOString(),
    created_by: createdBy,
  });

  if (error) throw error;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://villageclaq.com";
  const claimUrl = `${baseUrl}/claim/${token}`;

  return { token, claimUrl, expiresAt };
}
