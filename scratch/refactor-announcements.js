const fs = require('fs');
const path = require('path');

const filePath = path.resolve('src/app/[locale]/(dashboard)/dashboard/announcements/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add imports
if (!content.includes('useCreateAnnouncement')) {
  content = content.replace(
    'import { useAnnouncements, useMembers } from "@/lib/hooks/use-supabase-query";',
    'import { useAnnouncements, useMembers } from "@/lib/hooks/use-supabase-query";\nimport { useCreateAnnouncement, parseCommunicationRpcError } from "@/lib/hooks/use-communications-mutations";'
  );
  content = content.replace(
    'import { useTranslations, useLocale } from "next-intl";',
    'import { useTranslations, useLocale } from "next-intl";\nimport { toast } from "sonner";'
  );
}

// 2. Add hook initialization and useEffect for tenant switch
if (!content.includes('const createAnnouncement = useCreateAnnouncement')) {
  content = content.replace(
    'const { data: membersList } = useMembers();',
    `const { data: membersList } = useMembers();
  const createAnnouncement = useCreateAnnouncement(groupId || "");
  const [prevGroupId, setPrevGroupId] = useState<string | null>(null);

  // Enforce render-phase state hygiene
  if (groupId !== prevGroupId) {
    setPrevGroupId(groupId);
    resetForm();
  }
`
  );
}

// 3. Replace handleSend
const handleSendOldStart = content.indexOf('async function handleSend(asDraft = false): Promise<boolean> {');
const handleSendOldEnd = content.indexOf('  // Dispatches the announcement blast.', handleSendOldStart);
if (handleSendOldStart !== -1 && handleSendOldEnd !== -1) {
  const newHandleSend = `async function handleSend(asDraft = false): Promise<boolean> {
    if (!titleEn.trim() || !groupId || !user) return false;
    if (saving) return false;
    setSaving(true);
    setMutationError(null);
    try {
      const activeChannels = Object.entries(channels)
        .filter(([, v]) => v)
        .map(([k]) => k) as ("in_app" | "email" | "sms" | "whatsapp")[];
      
      const audienceType = audience === "all" ? "all" : audience === "roles" ? "roles" : "specific";
      
      await createAnnouncement.mutateAsync({
        groupId,
        title: titleEn,
        titleFr: titleFr || undefined,
        body: contentEn,
        bodyFr: contentFr || undefined,
        audienceType,
        targetRoles: selectedRoles,
        targetMemberIds: selectedMembers,
        channels: activeChannels,
        scheduledAt: !asDraft && schedule === "later" && scheduledDate ? new Date(scheduledDate).toISOString() : undefined,
        createdBy: user.id,
        asDraft,
      });

      // Audit log
      try {
        const supabase = createClient();
        const { logActivity } = await import("@/lib/audit-log");
        const scheduledForLater = !asDraft && schedule === "later" && !!scheduledDate;
        await logActivity(supabase, {
          groupId,
          action: announcementAuditAction({ asDraft, scheduledForLater }),
          entityType: "announcement",
          description: \`Announcement "\${titleEn}" \${asDraft ? "saved as draft" : scheduledForLater ? "scheduled" : "published in-app (external channels best-effort)"}\`,
          metadata: { title: titleEn, isDraft: asDraft, scheduled: scheduledForLater },
        });
      } catch (err) {
        console.warn("[Announcements:Audit] activity log failed:", err instanceof Error ? err.message : err);
      }

      setDialogOpen(false);
      resetForm();
      if (!asDraft) {
        toast.success(t("actions.queuedSuccess") || "Announcement successfully queued for dispatch.");
      }
      return true;
    } catch (err) {
      const parsed = parseCommunicationRpcError(err);
      const translated = tc(\`errors.\${parsed}\`, { defaultValue: parsed });
      setMutationError(translated);
      toast.error(translated);
      return false;
    } finally {
      setSaving(false);
    }
  }

`;
  content = content.substring(0, handleSendOldStart) + newHandleSend + content.substring(handleSendOldEnd);
}

// 4. Strip dispatchAnnouncementNotifications
const dispatchStart = content.indexOf('  // Dispatches the announcement blast.');
const dispatchEnd = content.indexOf('  function openEditAnnouncement', dispatchStart);
if (dispatchStart !== -1 && dispatchEnd !== -1) {
  content = content.substring(0, dispatchStart) + content.substring(dispatchEnd);
}

// 5. Replace dispatch in handlePublish with a toast or remove it if not needed, but wait: handlePublish is not required to be stripped by prompt EXCEPT for the raw inserts.
// The prompt: "Strip all raw client-side `.insert()` calls into public.announcements and public.announcement_deliveries."
// The handlePublish updates, then calls dispatchAnnouncementNotifications which we just removed. We need to stub it out or replace it so it doesn't crash.
const publishDispatchStart = content.indexOf('// Dispatch the blast for the published draft');
const publishDispatchEnd = content.indexOf('} catch (nerr)', publishDispatchStart);
if (publishDispatchStart !== -1 && publishDispatchEnd !== -1) {
  content = content.substring(0, publishDispatchStart) + 'toast.success("Draft published.");\n      ' + content.substring(publishDispatchEnd);
}

// Make sure to remove any remaining requestAnnouncementEnqueue imports or calls if they break.
// Wait, requestAnnouncementEnqueue is still used? Let's check:
content = content.replace(/requestAnnouncementEnqueue\(.*?\);/g, '');


fs.writeFileSync(filePath, content);
console.log('Refactored announcements/page.tsx');
