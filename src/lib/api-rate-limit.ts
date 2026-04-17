/**
 * In-memory sliding-window rate limiter for /api/* routes.
 *
 * Vercel serverless functions reset in-memory state on cold start, so a
 * dedicated attacker can reset the window by forcing new function
 * instances — accepted trade-off vs. no limit at all. For stricter
 * guarantees, migrate to upstash/redis-backed limiting.
 */

type Bucket = { timestamps: number[] };
const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  // Drop timestamps outside the window
  const cutoff = now - windowMs;
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
  if (bucket.timestamps.length >= maxRequests) {
    const oldest = bucket.timestamps[0];
    const retryAfterMs = Math.max(0, oldest + windowMs - now);
    return { allowed: false, retryAfterMs };
  }
  bucket.timestamps.push(now);
  return { allowed: true, retryAfterMs: 0 };
}

const ONE_HOUR_MS = 60 * 60 * 1000;

/** 50 email sends per user per hour. */
export const emailRateLimit = (userId: string) =>
  checkRateLimit(`email:${userId}`, 50, ONE_HOUR_MS);

/** 30 SMS sends per user per hour. */
export const smsRateLimit = (userId: string) =>
  checkRateLimit(`sms:${userId}`, 30, ONE_HOUR_MS);

/** 50 WhatsApp sends per user per hour. */
export const whatsappRateLimit = (userId: string) =>
  checkRateLimit(`whatsapp:${userId}`, 50, ONE_HOUR_MS);
