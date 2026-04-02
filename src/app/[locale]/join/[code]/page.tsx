import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import JoinClient from "./join-client";

interface PageProps {
  params: Promise<{ code: string; locale: string }>;
}

/**
 * Dynamic OG metadata for join pages so WhatsApp/iMessage previews show:
 * "Join [Group Name] on VillageClaq" + group description + member count
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code, locale } = await params;

  try {
    const supabase = await createClient();

    // Look up the join code → group (uses service-level access for metadata, no RLS issue)
    const { data: joinCode } = await supabase
      .from("join_codes")
      .select("group_id")
      .ilike("code", code)
      .eq("is_active", true)
      .maybeSingle();

    if (!joinCode) {
      return {
        title: locale === "fr" ? "Rejoindre un groupe | VillageClaq" : "Join a Group | VillageClaq",
      };
    }

    const { data: group } = await supabase
      .from("groups")
      .select("name, description, group_type")
      .eq("id", joinCode.group_id)
      .single();

    if (!group) {
      return {
        title: locale === "fr" ? "Rejoindre un groupe | VillageClaq" : "Join a Group | VillageClaq",
      };
    }

    const { count } = await supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("group_id", joinCode.group_id);

    const memberCount = count || 0;
    const title = locale === "fr"
      ? `Rejoindre ${group.name} sur VillageClaq`
      : `Join ${group.name} on VillageClaq`;
    const description = locale === "fr"
      ? `${group.group_type || "Groupe"} avec ${memberCount} membres. ${group.description || "Rejoignez-nous sur VillageClaq."}`
      : `${group.group_type || "Group"} with ${memberCount} members. ${group.description || "Join us on VillageClaq."}`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        url: `https://villageclaq.com/${locale}/join/${code}`,
        siteName: "VillageClaq",
        images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: title }],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: ["/opengraph-image"],
      },
    };
  } catch {
    return {
      title: locale === "fr" ? "Rejoindre un groupe | VillageClaq" : "Join a Group | VillageClaq",
    };
  }
}

export default function JoinPage() {
  return <JoinClient />;
}
