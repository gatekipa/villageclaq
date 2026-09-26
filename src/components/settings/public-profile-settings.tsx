"use client";
import React, { useState, useEffect } from 'react';
import { useOrganizationPublicProfile } from '@/lib/hooks/use-public-profile';

export function PublicProfileSettings({ groupId }: { groupId: string }) {
  const { fetchProfile, updateProfile } = useOrganizationPublicProfile(groupId);
  const [formData, setFormData] = useState({
    slug: '', visibility: 'private', displayName: '', description: '', allowRequests: true
  });

  useEffect(() => {
    if (fetchProfile.data) {
      setFormData({
        slug: fetchProfile.data.slug || '',
        visibility: fetchProfile.data.visibility || 'private',
        displayName: fetchProfile.data.display_name || '',
        description: fetchProfile.data.description || '',
        allowRequests: fetchProfile.data.allow_membership_requests !== false
      });
    }
  }, [fetchProfile.data]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile.mutateAsync({
        groupId,
        slug: formData.slug,
        visibility: formData.visibility,
        displayName: formData.displayName,
        description: formData.description,
        allowRequests: formData.allowRequests,
        socialLinks: {}
      });
    } catch (err) {
      console.error(err);
    }
  };

  if (fetchProfile.isLoading) return <div>Loading...</div>;

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <h2 className="text-xl font-bold">Public Organization Profile</h2>
      
      <div>
        <label className="block text-sm font-medium mb-1">Display Name</label>
        <input 
          type="text" 
          value={formData.displayName} 
          onChange={e => setFormData({ ...formData, displayName: e.target.value })}
          className="w-full border rounded p-2 min-h-[44px]"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">URL Slug</label>
        <input 
          type="text" 
          value={formData.slug} 
          onChange={e => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
          className="w-full border rounded p-2 min-h-[44px]"
          required
          placeholder="e.g. my-organization"
        />
        <p className="text-xs text-gray-500 mt-1">
          {formData.visibility !== 'private' && formData.slug ? `Public link: villageclaq.com/org/${formData.slug}` : 'Profile is currently private.'}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Visibility</label>
        <select 
          value={formData.visibility} 
          onChange={e => setFormData({ ...formData, visibility: e.target.value })}
          className="w-full border rounded p-2 min-h-[44px]"
        >
          <option value="private">Private (Hidden)</option>
          <option value="unlisted">Unlisted (Link Only)</option>
          <option value="public">Public (Directory)</option>
        </select>
      </div>

      <div>
        <label className="flex items-center space-x-2 min-h-[44px]">
          <input 
            type="checkbox" 
            checked={formData.allowRequests} 
            onChange={e => setFormData({ ...formData, allowRequests: e.target.checked })}
            className="w-4 h-4"
          />
          <span className="text-sm font-medium">Allow Membership Requests</span>
        </label>
      </div>

      <button 
        type="submit" 
        disabled={updateProfile.isPending}
        className="bg-primary text-white p-3 rounded font-medium min-h-[44px] w-full"
      >
        {updateProfile.isPending ? 'Saving...' : 'Save Profile'}
      </button>
    </form>
  );
}
