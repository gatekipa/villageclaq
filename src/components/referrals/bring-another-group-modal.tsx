import React, { useState } from 'react';
import { useGroupReferral } from '@/lib/hooks/use-group-referral';
import { generateWhatsAppMessage } from '@/lib/referral-share';

export function BringAnotherGroupModal({ groupId, isOpen, onClose }: { groupId: string, isOpen: boolean, onClose: () => void }) {
  const { generateReferral } = useGroupReferral(groupId);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [targetOrg, setTargetOrg] = useState<string>('association');

  if (!isOpen) return null;

  const handleGenerate = async () => {
    try {
      const res = await generateReferral.mutateAsync({ groupId, targetOrgType: targetOrg });
      setShareUrl(res.share_url);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg p-6 max-w-sm w-full space-y-4">
        <h2 className="text-lg font-bold">Bring Another Group</h2>
        
        <div>
          <label className="block text-sm font-medium mb-1">Group Type</label>
          <select 
            value={targetOrg} 
            onChange={e => setTargetOrg(e.target.value)}
            className="w-full border rounded p-2 min-h-[44px]"
          >
            <option value="association">Association</option>
            <option value="alumni">Alumni</option>
            <option value="njangi">Njangi / Tontine</option>
            <option value="cultural">Cultural</option>
          </select>
        </div>

        {!shareUrl ? (
          <button 
            onClick={handleGenerate} 
            className="w-full bg-primary text-white p-3 rounded font-medium min-h-[44px]"
          >
            Generate Invite Link
          </button>
        ) : (
          <div className="space-y-3">
            <a 
              href={generateWhatsAppMessage(shareUrl, 'en')} 
              target="_blank" 
              rel="noreferrer"
              className="block w-full bg-green-600 text-white p-3 rounded font-medium text-center min-h-[44px]"
            >
              Share via WhatsApp
            </a>
            <button 
              onClick={() => {
                if (typeof navigator !== 'undefined') navigator.clipboard.writeText(shareUrl);
              }}
              className="w-full bg-secondary text-foreground p-3 rounded font-medium min-h-[44px]"
            >
              Copy Link
            </button>
          </div>
        )}

        <button 
          onClick={onClose} 
          className="w-full text-center text-sm p-3 min-h-[44px]"
        >
          Close
        </button>
      </div>
    </div>
  );
}
