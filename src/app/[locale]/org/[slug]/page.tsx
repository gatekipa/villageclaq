"use client";
import React from 'react';
import { usePublicOrganizationView } from '@/lib/hooks/use-public-profile';
import { MembershipRequestForm } from '@/components/public/membership-request-form';

export default function PublicOrganizationPage({ params }: { params: { slug: string, locale: string } }) {
  const { data: profile, isLoading, error } = usePublicOrganizationView(params.slug);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center p-8 text-gray-500">Loading...</div>;
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-6 rounded-lg shadow-sm max-w-sm w-full text-center space-y-4 border border-gray-100">
          <h1 className="text-xl font-bold text-gray-800">Organization Not Found</h1>
          <p className="text-sm text-gray-500">This organization does not exist or is currently private.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <main className="flex-grow max-w-3xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8 overflow-hidden">
        
        <header className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6">
          {profile.logo_url ? (
            <img src={profile.logo_url} alt={`${profile.display_name} logo`} className="w-24 h-24 rounded-full object-cover border bg-gray-50 shrink-0" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-2xl shrink-0">
              {profile.display_name.charAt(0).toUpperCase()}
            </div>
          )}
          
          <div className="text-center sm:text-left flex-grow w-full">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 break-words">{profile.display_name}</h1>
            {profile.description && (
              <p className="mt-2 text-gray-600 leading-relaxed max-w-prose whitespace-pre-wrap break-words">
                {profile.description}
              </p>
            )}
            
            {profile.social_links && Object.keys(profile.social_links).length > 0 && (
              <div className="flex flex-wrap justify-center sm:justify-start gap-4 mt-4">
                {Object.entries(profile.social_links).map(([platform, url]) => (
                  <a key={platform} href={url as string} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline capitalize p-2 min-h-[44px] inline-flex items-center">
                    {platform}
                  </a>
                ))}
              </div>
            )}
          </div>
        </header>

        {profile.allow_membership_requests && (
          <section className="flex justify-center w-full">
            <MembershipRequestForm slug={profile.slug} />
          </section>
        )}

      </main>

      <footer className="p-6 text-center border-t bg-white mt-auto">
        <a 
          href="/" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="inline-flex items-center justify-center space-x-2 text-sm text-gray-500 hover:text-gray-900 transition-colors min-h-[44px] p-2"
        >
          <span>Powered by</span>
          <span className="font-bold">VillageClaq</span>
        </a>
      </footer>
    </div>
  );
}
