import React, { useState } from 'react';
import { useCommunityCard } from '@/lib/hooks/use-community-card';
import { generateWhatsAppMessage } from '@/lib/referral-share';

export function CommunityCardShareModal({ groupId, isOpen, onClose }: { groupId: string, isOpen: boolean, onClose: () => void }) {
  const { issueCard, revokeCard, useMemberActiveCards } = useCommunityCard(groupId);
  const { data: activeCards } = useMemberActiveCards();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  
  if (!isOpen) return null;

  const card = activeCards?.[0];

  const handleGenerate = async () => {
    try {
      const res = await issueCard.mutateAsync({ groupId, cardType: 'membership_card' });
      setShareUrl(res.share_url);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRevoke = async () => {
    if (!card) return;
    if (confirm("Are you sure you want to revoke this card?")) {
      await revokeCard.mutateAsync({ groupId, cardId: card.id });
      setShareUrl(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg p-6 max-w-sm w-full space-y-4">
        <h2 className="text-lg font-bold">Community Card</h2>

        {card ? (
          <div className="border p-4 rounded-lg bg-slate-50 space-y-2">
            <h3 className="font-semibold text-lg">{card.display_data.organization_name}</h3>
            <p className="text-sm">Member: {card.display_data.member_display_name}</p>
            <p className="text-xs text-muted-foreground">Issued: {new Date(card.display_data.issued_at).toLocaleDateString()}</p>
            <div className="pt-2">
              <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded">Verified Badge</span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">No active card. Generate one below.</div>
        )}

        {!card && !shareUrl ? (
          <button 
            onClick={handleGenerate} 
            className="w-full bg-primary text-white p-3 rounded font-medium min-h-[44px]"
          >
            Generate Card
          </button>
        ) : null}

        {card && (
          <div className="space-y-3 mt-4">
            <a 
              href={generateWhatsAppMessage(`https://villageclaq.com/verify-card/${card.share_token}`, 'en')} 
              target="_blank" 
              rel="noopener noreferrer"
              className="block w-full bg-green-600 text-white p-3 rounded font-medium text-center min-h-[44px]"
            >
              Share to WhatsApp
            </a>
            <button 
              onClick={() => {
                if (typeof navigator !== 'undefined') {
                  navigator.clipboard.writeText(`https://villageclaq.com/verify-card/${card.share_token}`);
                }
              }}
              className="w-full bg-secondary text-foreground p-3 rounded font-medium min-h-[44px]"
            >
              Copy Verification Link
            </button>
            <button 
              onClick={handleRevoke}
              className="w-full bg-destructive text-destructive-foreground p-3 rounded font-medium min-h-[44px]"
            >
              Revoke Card
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
