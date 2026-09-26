"use client";
import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMembershipRequestSubmission } from '@/lib/hooks/use-public-profile';

export function MembershipRequestForm({ slug }: { slug: string }) {
  const t = useTranslations('publicProfile');
  const submitRequest = useMembershipRequestSubmission();
  const [formData, setFormData] = useState({ fullName: '', email: '', phone: '', message: '' });
  const [success, setSuccess] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFailed(false);
    if (!formData.email.includes("@")) return;
    try {
      await submitRequest.mutateAsync({
        slug,
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        message: formData.message
      });
      setSuccess(true);
    } catch {
      setFailed(true);
    }
  };

  if (success) {
    return (
      <div className="p-6 bg-green-50 rounded-lg text-center border border-green-200">
        <h3 className="text-lg font-bold text-green-800 mb-2">{t('requestSubmitted')}</h3>
        <p className="text-sm text-green-700">{t('requestSubmittedDetail')}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md w-full bg-white p-6 rounded-lg shadow-sm border border-gray-100">
      <h2 className="text-lg font-bold text-gray-900">{t('requestTitle')}</h2>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('fullName')}</label>
        <input 
          type="text" 
          value={formData.fullName} 
          onChange={e => setFormData({ ...formData, fullName: e.target.value })}
          className="w-full border border-gray-300 rounded p-3 min-h-[44px] text-gray-900"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('email')}</label>
        <input 
          type="email" 
          value={formData.email} 
          onChange={e => setFormData({ ...formData, email: e.target.value })}
          className="w-full border border-gray-300 rounded p-3 min-h-[44px] text-gray-900"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('messageOptional')}</label>
        <textarea 
          value={formData.message} 
          onChange={e => setFormData({ ...formData, message: e.target.value })}
          className="w-full border border-gray-300 rounded p-3 min-h-[88px] text-gray-900"
          maxLength={2000}
        />
      </div>

      {failed && <p role="alert" className="text-sm text-red-700">{t('requestFailed')}</p>}
      <button 
        type="submit" 
        disabled={submitRequest.isPending}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3 rounded font-medium min-h-[44px] transition-colors"
      >
        {submitRequest.isPending ? t('submitting') : t('submitRequest')}
      </button>
    </form>
  );
}
