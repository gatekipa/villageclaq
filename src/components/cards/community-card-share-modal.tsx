"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useCommunityCard } from "@/lib/hooks/use-community-card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGroup } from "@/lib/group-context";

export function CommunityCardShareModal({
  groupId, isOpen, onClose,
}: { groupId: string; isOpen: boolean; onClose: () => void }) {
  const t = useTranslations("communityCard");
  const locale = useLocale();
  const { issueCard, revokeCard, useMemberActiveCards } = useCommunityCard(groupId);
  const { currentMembership, currentGroup } = useGroup();
  const { data: activeCards, refetch } = useMemberActiveCards();
  const [includeName, setIncludeName] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState<string | null>(null);
  const card = activeCards?.[0];
  const previewName = card
    ? card.display_data?.member_display_name
    : includeName && currentMembership?.group_id === groupId
      ? (currentMembership.display_name || "Member") : null;
  const previewOrganization = card?.display_data?.organization_name ||
    (currentGroup?.id === groupId ? currentGroup.name : t("organization"));
  const shareUrl = newUrl || (card ? `/${locale}/verify-card/${card.share_token}` : null);

  async function publish() {
    setError(null);
    try {
      const result = await issueCard.mutateAsync({
        groupId, cardType: "membership_card", includeName, consent,
      });
      setNewUrl(`/${locale}/verify-card/${result.token}`);
      await refetch();
    } catch {
      setError(t("publishFailed"));
    }
  }

  async function revoke() {
    if (!card) return;
    setError(null);
    try {
      await revokeCard.mutateAsync({ groupId, cardId: card.id });
      setNewUrl(null);
      await refetch();
    } catch {
      setError(t("revokeFailed"));
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t("title")}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        <div className="rounded-lg border p-4 space-y-2" aria-label={t("preview")}>
          <p className="text-xs uppercase text-muted-foreground">{t("preview")}</p>
          <p className="font-semibold">{previewOrganization}</p>
          <p className="text-sm">{previewName || t("member")}</p>
          <p className="text-xs text-muted-foreground">{t("attribution")}</p>
        </div>
        {!card && (
          <>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={includeName}
                onChange={(event) => setIncludeName(event.target.checked)} />
              <span>{t("includeName")}</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={consent}
                onChange={(event) => setConsent(event.target.checked)} />
              <span>{t("consent")}</span>
            </label>
            <Button onClick={publish} disabled={!consent || issueCard.isPending}
              className="min-h-11">{t("publish")}</Button>
          </>
        )}
        {shareUrl && (
          <div className="space-y-2">
            <Button variant="outline" className="w-full min-h-11"
              onClick={() => navigator.clipboard.writeText(new URL(shareUrl, window.location.origin).href)}>
              {t("copyLink")}
            </Button>
            <Button variant="outline" className="w-full min-h-11" onClick={() => {
              const absoluteUrl = new URL(shareUrl, window.location.origin).href;
              window.open(`https://wa.me/?text=${encodeURIComponent(absoluteUrl)}`, "_blank", "noopener,noreferrer");
            }}>{t("openComposer")}</Button>
            <Button variant="destructive" className="w-full min-h-11"
              onClick={revoke} disabled={revokeCard.isPending}>{t("revoke")}</Button>
            <p className="text-xs text-muted-foreground">{t("downloadLimit")}</p>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
