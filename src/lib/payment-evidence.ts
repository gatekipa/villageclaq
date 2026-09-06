import type { SupabaseClient } from "@supabase/supabase-js";

/** Content-addressed within one request; retries reuse evidence, never overwrite it. */
export async function uploadPaymentEvidence(
  client: SupabaseClient, groupId: string, requestId: string, file: File,
): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const name = hash + (file.type === "application/pdf" ? ".pdf" : ".image");
  const folder = `${groupId}/${requestId}`;
  const path = `${folder}/${name}`;
  const storage = client.storage.from("receipts");
  const { error } = await storage.upload(path, file);
  if (error) {
    // A lost upload response may leave the same immutable file already stored.
    // Reuse only an object visible under storage RLS at the exact content hash.
    if (String(error.statusCode) !== "409") throw new Error("RECEIPT_UPLOAD_FAILED");
    const { data, error: lookupError } = await storage.list(folder, { search: name, limit: 2 });
    if (lookupError || !data?.some((row) => row.name === name)) throw new Error("RECEIPT_UPLOAD_FAILED");
  }
  return path;
}
