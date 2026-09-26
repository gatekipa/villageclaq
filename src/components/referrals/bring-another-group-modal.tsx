"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useGroupReferral } from "@/lib/hooks/use-group-referral";
import { generateWhatsAppMessage } from "@/lib/referral-share";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function BringAnotherGroupModal({
  groupId, isOpen, onClose,
}: { groupId: string; isOpen: boolean; onClose: () => void }) {
  const t = useTranslations("referral");
  const locale = useLocale();
  const { generateReferral, ownReferrals, revokeReferral } = useGroupReferral(groupId);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [referralId, setReferralId] = useState<string | null>(null);
  const [targetOrg, setTargetOrg] = useState("association");
  const [error, setError] = useState<string | null>(null);
  const groupIdRef = useRef(groupId);
  groupIdRef.current = groupId;

  useEffect(() => {
    setShareUrl(null);
    setReferralId(null);
    setError(null);
  }, [groupId]);

  async function generate() {
    setError(null);
    try {
      const result = await generateReferral.mutateAsync({
        groupId, targetOrgType: targetOrg,
      });
      if (groupIdRef.current !== groupId) return;
      const token = result?.token;
      if (typeof token !== "string" || !/^[0-9a-f]{48}$/.test(token)) throw new Error("invalid token");
      setReferralId(result.id);
      setShareUrl(`${window.location.origin}/${locale}/onboard?ref=${encodeURIComponent(token)}`);
    } catch {
      setError(t("generationFailed"));
    }
  }

  async function revoke(id: string) {
    setError(null);
    try {
      await revokeReferral.mutateAsync({ groupId, referralId: id });
      if (groupIdRef.current !== groupId) return;
      if (id === referralId) {
        setShareUrl(null);
        setReferralId(null);
      }
    } catch {
      setError(t("revokeFailed"));
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t("title")}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        {!shareUrl ? (
          <>
            <label className="text-sm" htmlFor="referral-type">{t("groupType")}</label>
            <select id="referral-type" value={targetOrg}
              onChange={(event) => setTargetOrg(event.target.value)}
              className="w-full rounded border p-2 min-h-11">
              <option value="association">{t("association")}</option>
              <option value="alumni">{t("alumni")}</option>
              <option value="njangi">{t("njangi")}</option>
              <option value="cultural">{t("cultural")}</option>
            </select>
            <Button className="min-h-11" onClick={generate}
              disabled={generateReferral.isPending}>{t("generate")}</Button>
          </>
        ) : (
          <div className="space-y-2">
            <Button variant="outline" className="w-full min-h-11"
              onClick={() => navigator.clipboard.writeText(shareUrl)}>{t("copy")}</Button>
            <a className="block rounded border p-3 text-center min-h-11"
              href={generateWhatsAppMessage(shareUrl, locale === "fr" ? "fr" : "en")}
              target="_blank" rel="noopener noreferrer">{t("openComposer")}</a>
            <p className="text-xs text-muted-foreground">{t("expires")}</p>
          </div>
        )}
        {ownReferrals.data && ownReferrals.data.length > 0 && (
          <div className="max-h-48 space-y-2 overflow-y-auto border-t pt-3">
            <h3 className="text-sm font-semibold">{t("activeLinks")}</h3>
            {ownReferrals.data.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
                <span>{item.created_at.slice(0, 10)} · {t(item.status === "claimed" ? "claimed" : "issued")}</span>
                <Button type="button" variant="outline" size="sm"
                  disabled={revokeReferral.isPending}
                  onClick={() => revoke(item.id)}>{t("revoke")}</Button>
              </div>
            ))}
          </div>
        )}
        {ownReferrals.isError && <p role="alert" className="text-sm text-destructive">{t("listFailed")}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
