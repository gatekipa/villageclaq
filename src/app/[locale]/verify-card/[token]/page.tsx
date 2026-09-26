"use client";
import React from 'react';
import { usePublicCardVerification } from '@/lib/hooks/use-community-card';
import { sanitizePublicCardPayload } from '@/lib/community-card-payload';
import { useLocale, useTranslations } from 'next-intl';

export default function VerifyCardPage({ params }: { params: { token: string } }) {
  const locale = useLocale();
  const t = useTranslations('communityCard');
  const { data, isLoading, error } = usePublicCardVerification(params.token);

  if (isLoading) return <div className="p-8 text-center">{t('verificationLoading')}</div>;
  if (error || !data || !data.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-6 rounded-lg shadow max-w-sm w-full text-center space-y-4">
          <h1 className="text-xl font-bold text-gray-800">{t('verificationUnavailable')}</h1>
          <p className="text-sm text-gray-500">{t('verificationUnavailableDesc')}</p>
        </div>
      </div>
    );
  }

  const sanitized = sanitizePublicCardPayload(data, locale === 'fr' ? 'fr' : 'en');
  if (!sanitized) {
    return <div className="p-8 text-center text-red-500">{t('verificationError')}</div>;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full space-y-4 border-t-4 border-primary">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold">✓</div>
          <h1 className="text-xl font-bold text-gray-900">{t('verifiedMember')}</h1>
        </div>
        
        <div className="space-y-1">
          <p className="text-sm text-gray-500 uppercase tracking-wide">{t('organizationLabel')}</p>
          <p className="font-medium text-gray-900">{sanitized.organizationName}</p>
        </div>
        
        <div className="space-y-1">
          <p className="text-sm text-gray-500 uppercase tracking-wide">{t('member')}</p>
          <p className="font-medium text-gray-900">{sanitized.memberDisplayName}</p>
        </div>

        <div className="space-y-1">
          <p className="text-sm text-gray-500 uppercase tracking-wide">{t('issuedOn')}</p>
          <p className="text-sm text-gray-900">{new Date(sanitized.issuedAt).toLocaleDateString(locale)}</p>
        </div>

        <div className="pt-4 border-t mt-4 text-center">
          <a href="/" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
            {t('attribution')}
          </a>
        </div>
      </div>
    </div>
  );
}
