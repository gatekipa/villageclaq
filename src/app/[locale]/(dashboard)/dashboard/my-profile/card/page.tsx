import { redirect } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Keep old private-card bookmarks useful without issuing a deterministic
// membership-ID verification link. The current card owns the M14 share flow.
export default async function LegacyMembershipCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ group?: string | string[] }>;
}) {
  const [{ locale }, { group }] = await Promise.all([params, searchParams]);
  const groupQuery = typeof group === "string" && UUID.test(group)
    ? `?group=${encodeURIComponent(group)}`
    : "";
  redirect(`/${locale}/dashboard/membership-card${groupQuery}`);
}
