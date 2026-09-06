import type { QueryClient } from "@tanstack/react-query";

const groupKeys = new Set([
  "payments", "obligations", "dashboard-stats", "money-overview", "matrix-data",
  "object-report", "contribution-types", "all-contribution-types", "aggregated-feed", "members",
]);
const standingKeys = new Set(["member-standing", "member-standing-detailed", "member-standing-history"]);
const memberKeys = new Set(["member", "member-detail", "member-payments", "member-obligations", "my-payments-full"]);

/** Cache invalidation only, never performs a financial mutation or a send. */
export function isFinancialQuery(key: readonly unknown[], groupId: string, membershipId?: string) {
  const name = String(key[0]);
  if (groupKeys.has(name)) return key[1] === groupId;
  if (standingKeys.has(name)) return key[2] === groupId && (!membershipId || key[1] === membershipId);
  // Legacy member caches predate group-keying. Target the immutable membership
  // ID when available; a group-wide assessment change marks them all stale.
  return memberKeys.has(name) && (!membershipId || key[1] === membershipId);
}

export async function invalidateFinancialQueries(client: QueryClient, groupId: string | null, membershipId?: string) {
  if (!groupId) return;
  await client.invalidateQueries({ predicate: (query) => isFinancialQuery(query.queryKey, groupId, membershipId) });
}
