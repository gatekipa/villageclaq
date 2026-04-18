/**
 * Storage URL helpers.
 *
 * Buckets `receipts` and `group-documents` are private (migration 00083
 * DASHBOARD-ONLY block flips `storage.buckets.public = false`). Client
 * code must therefore use signed URLs — plain public URLs return 403
 * after the flip.
 *
 * The `avatars` bucket remains public by design (profile photos +
 * group logos are intentional branding). Callers reading avatars
 * continue to use `.getPublicUrl()`.
 *
 * This module centralises the signing pattern so call sites don't
 * re-implement expiry windows. Display code should call
 * `signedUrlFor(bucket, path)` every render rather than caching the
 * returned URL long-term — each URL expires after the given window.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Default expiry for inline rendering (receipt viewer, doc preview). */
const DEFAULT_EXPIRY_SECONDS = 3600; // 1 hour

/** Expiry for download links in CSV / PDF exports. */
export const EXPORT_EXPIRY_SECONDS = 86400; // 24 hours

/**
 * Generate a signed URL for a private-bucket object. Returns null on
 * failure so callers can degrade gracefully (e.g., render a broken-
 * link placeholder instead of throwing).
 */
export async function signedUrlFor(
  supabase: SupabaseClient,
  bucket: "receipts" | "group-documents",
  path: string,
  expiresInSeconds: number = DEFAULT_EXPIRY_SECONDS,
): Promise<string | null> {
  if (!path) return null;
  // Legacy rows sometimes store the full public URL. Strip the bucket
  // prefix so we pass a bare object key to createSignedUrl.
  const normalised = normaliseObjectPath(bucket, path);
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(normalised, expiresInSeconds);
    if (error) {
      console.warn(`[storage] createSignedUrl(${bucket}, ${normalised}) failed:`, error.message);
      return null;
    }
    return data?.signedUrl || null;
  } catch (err) {
    console.warn(
      `[storage] createSignedUrl(${bucket}, ${normalised}) threw:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Given either a bare object key ("groupId/file.pdf") or a legacy
 * full public URL ("https://.../storage/v1/object/public/receipts/…"),
 * return the bare object key suitable for createSignedUrl.
 */
export function normaliseObjectPath(bucket: string, input: string): string {
  if (!input) return input;
  const marker = `/object/public/${bucket}/`;
  const idx = input.indexOf(marker);
  if (idx >= 0) return input.slice(idx + marker.length);
  const signedMarker = `/object/sign/${bucket}/`;
  const signedIdx = input.indexOf(signedMarker);
  if (signedIdx >= 0) {
    // Signed URL pattern — strip bucket prefix and any ?token= query string.
    const rest = input.slice(signedIdx + signedMarker.length);
    return rest.split("?")[0];
  }
  return input;
}
