import type { Metadata } from 'next';

type PublicProfileData = {
  slug: string;
  display_name: string;
  description?: string;
  logo_url?: string;
};

export function generatePublicOrganizationMetadata(profile: PublicProfileData | null, locale: string = 'en'): Metadata {
  if (!profile) {
    return {
      title: locale === 'fr' ? 'Organisation introuvable' : 'Organization Not Found',
      description: locale === 'fr' ? 'Cette page est introuvable ou privée.' : 'This page could not be found or is private.',
      robots: 'noindex, nofollow'
    };
  }

  const baseTitle = `${profile.display_name} | VillageClaq`;
  const cleanDescription = (profile.description || 'Community Organization on VillageClaq')
    .replace(/<[^>]*>?/gm, '') 
    .substring(0, 160);

  return {
    title: baseTitle,
    description: cleanDescription,
    openGraph: {
      title: baseTitle,
      description: cleanDescription,
      url: `https://villageclaq.com/org/${profile.slug}`,
      siteName: 'VillageClaq',
      images: profile.logo_url ? [{ url: profile.logo_url }] : [],
      locale: locale,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: baseTitle,
      description: cleanDescription,
      images: profile.logo_url ? [profile.logo_url] : []
    }
  };
}
