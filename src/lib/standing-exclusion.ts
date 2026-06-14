/**
 * Per-contribution-type standing exclusion writer (Build 9, WS3).
 *
 * Standing impact for contributions already exists end-to-end: a contribution
 * type counts toward standing when the group's `dues` factor is ON and the
 * type id is NOT in `groups.settings.standing_rules.excluded_contribution_type_ids`
 * (see standing-rules.ts + calculate-standing.ts). The Settings → Standing tab
 * already edits that list. This helper lets the contribution-type FORM toggle
 * the same single setting for one type, using the IDENTICAL read-merge-write +
 * normalization as the tab (resolveStandingRules / serializeStandingRules) so
 * the two surfaces never diverge — there is ONE source of truth and NO new
 * schema.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveStandingRules, serializeStandingRules } from "@/lib/standing-rules";

/** Whether a contribution type is currently excluded from standing impact. */
export function isContributionExcluded(groupSettings: unknown, typeId: string): boolean {
  return resolveStandingRules(groupSettings).excludedContributionTypeIds.includes(typeId);
}

/**
 * Set whether a single contribution type is EXCLUDED from standing impact.
 * `excluded = true`  → does NOT count toward good standing.
 * `excluded = false` → counts toward good standing (the default).
 *
 * Read-merge-write on `groups.settings.standing_rules`, only flipping this one
 * type id's membership in the exclusion list (last-write-wins on the full
 * settings blob, exactly like the tab's handleApply). No-ops when unchanged.
 * Returns the resulting excluded list. The caller is responsible for
 * invalidating standing query keys (see STANDING_EXCLUSION_QUERY_KEYS).
 */
export async function setContributionStandingExclusion(
  supabase: SupabaseClient,
  groupId: string,
  typeId: string,
  excluded: boolean,
): Promise<string[]> {
  const { data: current, error: readErr } = await supabase
    .from("groups")
    .select("settings")
    .eq("id", groupId)
    .single();
  if (readErr) throw readErr;

  const currentSettings = (current?.settings as Record<string, unknown> | null) ?? {};
  const rules = resolveStandingRules(currentSettings);
  const set = new Set(rules.excludedContributionTypeIds);
  const had = set.has(typeId);
  if (excluded) set.add(typeId);
  else set.delete(typeId);

  // No change → no write (avoids a needless settings churn / standing recompute).
  if (set.has(typeId) === had) return [...set];

  rules.excludedContributionTypeIds = [...set];
  const nextSettings = { ...currentSettings, standing_rules: serializeStandingRules(rules) };
  const { error: writeErr } = await supabase
    .from("groups")
    .update({ settings: nextSettings })
    .eq("id", groupId);
  if (writeErr) throw writeErr;
  return rules.excludedContributionTypeIds;
}

/** Query keys to invalidate after a standing-exclusion change (matches the tab). */
export function standingExclusionQueryKeys(groupId: string): Array<readonly unknown[]> {
  return [
    ["group-settings", groupId],
    ["group-settings"],
    ["members", groupId],
    ["member-standing"],
  ];
}
