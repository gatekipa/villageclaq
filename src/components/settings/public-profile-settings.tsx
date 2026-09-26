"use client";
import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { Link } from '@/i18n/routing';
import { useOrganizationPublicProfile } from '@/lib/hooks/use-public-profile';
import { useGroup } from '@/lib/group-context';

export function PublicProfileSettings({ groupId }: { groupId: string }) {
  const t = useTranslations("publicProfile");
  const { fetchProfile, updateProfile } = useOrganizationPublicProfile(groupId);
  const { currentGroup } = useGroup();
  const queryClient = useQueryClient();
  const requests = useQuery({
    queryKey: ['public_membership_requests', groupId],
    queryFn: async () => {
      const { data, error } = await createClient().from('organization_membership_requests')
        .select('id, full_name, email, message, status, created_at')
        .eq('group_id', groupId).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
  const review = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'approved' | 'rejected' }) => {
      const { error } = await createClient().rpc('review_public_membership_request', {
        p_request_id: id, p_status: status,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['public_membership_requests', groupId] }),
  });
  const [formData, setFormData] = useState({
    slug: '', visibility: 'private', displayName: '', description: '',
    allowRequests: false, website: '', facebook: '', instagram: '', linkedin: ''
  });
  const [formTenant, setFormTenant] = useState(groupId);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setFormTenant(groupId);
    setFormData({ slug: '', visibility: 'private', displayName: '', description: '',
      allowRequests: false, website: '', facebook: '', instagram: '', linkedin: '' });
  }, [groupId]);

  useEffect(() => {
    if (fetchProfile.data) {
      setFormTenant(groupId);
      setFormData({
        slug: fetchProfile.data.slug || '',
        visibility: fetchProfile.data.visibility || 'private',
        displayName: fetchProfile.data.display_name || '',
        description: fetchProfile.data.description || '',
        allowRequests: fetchProfile.data.allow_membership_requests === true,
        website: fetchProfile.data.social_links?.website || '',
        facebook: fetchProfile.data.social_links?.facebook || '',
        instagram: fetchProfile.data.social_links?.instagram || '',
        linkedin: fetchProfile.data.social_links?.linkedin || '',
      });
    }
  }, [fetchProfile.data, groupId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      if (formTenant !== groupId) throw new Error('staleTenantAborted');
      await updateProfile.mutateAsync({
        groupId,
        slug: formData.slug,
        visibility: formData.visibility,
        displayName: formData.displayName,
        description: formData.description,
        allowRequests: formData.allowRequests,
        socialLinks: Object.fromEntries(
          (['website', 'facebook', 'instagram', 'linkedin'] as const)
            .map((key) => [key, formData[key].trim()])
            .filter(([, value]) => Boolean(value)),
        )
      });
      setSaved(true);
    } catch {
      setError(t("saveFailed"));
    }
  };

  if (fetchProfile.isLoading) return <div>{t("loading")}</div>;
  if (fetchProfile.isError) return <p role="alert">{t("loadFailed")}</p>;

  return (
    <div className="space-y-8 max-w-lg">
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl font-bold">{t("title")}</h2>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      
      <div>
        <label className="block text-sm font-medium mb-1">{t("displayName")}</label>
        <input 
          type="text" 
          value={formData.displayName} 
          onChange={e => setFormData({ ...formData, displayName: e.target.value })}
          className="w-full border rounded p-2 min-h-[44px]"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("slug")}</label>
        <input 
          type="text" 
          value={formData.slug} 
          onChange={e => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
          className="w-full border rounded p-2 min-h-[44px]"
          required
          placeholder="e.g. my-organization"
        />
        <p className="text-xs text-gray-500 mt-1">
          {formData.visibility !== 'private' && formData.slug
            ? t("publicLink", { slug: formData.slug }) : t("privateState")}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="public-profile-description">
          {t("missionDescription")}
        </label>
        <textarea id="public-profile-description" value={formData.description}
          onChange={e => setFormData({ ...formData, description: e.target.value })}
          maxLength={1000} className="w-full min-h-24 rounded border p-2" />
      </div>

      {(['website', 'facebook', 'instagram', 'linkedin'] as const).map((key) => (
        <div key={key}>
          <label className="block text-sm font-medium mb-1" htmlFor={`public-profile-${key}`}>
            {t(key)}
          </label>
          <input id={`public-profile-${key}`} type="url" value={formData[key]}
            onChange={e => setFormData({ ...formData, [key]: e.target.value })}
            placeholder="https://" className="w-full min-h-11 rounded border p-2" />
        </div>
      ))}

      <div>
        <label className="block text-sm font-medium mb-1">{t("visibility")}</label>
        <select 
          value={formData.visibility} 
          onChange={e => setFormData({ ...formData, visibility: e.target.value })}
          className="w-full border rounded p-2 min-h-[44px]"
        >
          <option value="private">{t("private")}</option>
          <option value="unlisted">{t("unlisted")}</option>
          <option value="public">{t("public")}</option>
        </select>
        {formData.visibility === "unlisted" && <p className="text-xs text-muted-foreground">{t("unlistedNote")}</p>}
        <p className="mt-1 text-xs text-muted-foreground">{t("cacheNote")}</p>
      </div>

      <div>
        <label className="flex items-center space-x-2 min-h-[44px]">
          <input 
            type="checkbox" 
            checked={formData.allowRequests} 
            onChange={e => setFormData({ ...formData, allowRequests: e.target.checked })}
            className="w-4 h-4"
          />
          <span className="text-sm font-medium">{t("allowRequests")}</span>
        </label>
      </div>

      <section aria-label={t("previewTitle")} className="space-y-2 rounded border p-4">
        <h3 className="text-sm font-semibold">{t("previewTitle")}</h3>
        {currentGroup?.id === groupId && currentGroup.logo_url &&
          /^https:\/\/\S+$/.test(currentGroup.logo_url) &&
          <img src={currentGroup.logo_url} alt="" className="h-14 w-14 rounded-full object-cover" />}
        <p className="font-semibold">{formData.displayName || t("displayName")}</p>
        {formData.description && <p className="whitespace-pre-wrap text-sm">{formData.description}</p>}
        {(['website', 'facebook', 'instagram', 'linkedin'] as const)
          .filter((key) => formData[key].trim())
          .map((key) => <p key={key} className="break-all text-xs">{key}: {formData[key].trim()}</p>)}
        {formData.allowRequests && <p className="text-xs">{t("allowRequests")}</p>}
      </section>

      <button 
        type="submit" 
        disabled={updateProfile.isPending || formTenant !== groupId}
        className="bg-primary text-white p-3 rounded font-medium min-h-[44px] w-full"
      >
        {updateProfile.isPending ? t("saving") : t("save")}
      </button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {saved && <p role="status" className="text-sm text-emerald-700">{t("saved")}</p>}
    </form>
    <section aria-label={t('requestsTitle')} className="space-y-3">
      <h3 className="text-lg font-semibold">{t('requestsTitle')}</h3>
      <p className="text-sm text-muted-foreground">{t('requestsNote')}</p>
      {requests.isError && <p role="alert">{t('requestsFailed')}</p>}
      {requests.data?.length === 0 && <p>{t('noRequests')}</p>}
      {requests.data?.map((request) => (
        <div key={request.id} className="rounded border p-3 space-y-2 break-words">
          <p className="font-medium">{request.full_name}</p>
          <p className="text-sm">{request.email}</p>
          {request.message && <p className="text-sm whitespace-pre-wrap">{request.message}</p>}
          <p className="text-xs text-muted-foreground">{request.status}</p>
          {request.status === 'pending' && (
            <div className="flex gap-2">
              <button type="button" disabled={review.isPending} onClick={() => review.mutate({ id: request.id, status: 'approved' })} className="rounded border px-3 py-2 min-h-11">{t('markReviewed')}</button>
              <button type="button" disabled={review.isPending} onClick={() => review.mutate({ id: request.id, status: 'rejected' })} className="rounded border px-3 py-2 min-h-11">{t('reject')}</button>
            </div>
          )}
        </div>
      ))}
      {review.isError && <p role="alert">{t('reviewFailed')}</p>}
      <Link href="/dashboard/invitations" className="inline-block underline min-h-11 py-2">{t('openInvitations')}</Link>
    </section>
    </div>
  );
}
