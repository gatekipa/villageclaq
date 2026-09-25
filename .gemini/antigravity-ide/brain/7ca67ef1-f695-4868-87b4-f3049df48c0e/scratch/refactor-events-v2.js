const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../../../../../src/app/[locale]/(dashboard)/dashboard/events/page.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Imports
content = content.replace(
  `import { useEvents, useCreateEvent } from "@/lib/hooks/use-supabase-query";`,
  `import { useEvents } from "@/lib/hooks/use-supabase-query";\nimport { useManageEvent, useDeleteEvent, useRecordRsvp, usePostTicketPurchase, parseEventRpcError } from "@/lib/hooks/use-events-mutations";\nimport { useFinancialAccounts } from "@/lib/hooks/use-financial-config";\nimport { useRef, useEffect } from "react";`
);

// 2. Add capacity to create form state, AFTER preFilledBanner state
const formStateRegex = /const \[preFilledBanner, setPreFilledBanner\] = useState<string \| null>\(null\);/g;
content = content.replace(
  formStateRegex,
  `const [preFilledBanner, setPreFilledBanner] = useState<string | null>(null);\n  const [formCapacity, setFormCapacity] = useState<string>("");\n  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);\n  const [purchaseEventId, setPurchaseEventId] = useState<string | null>(null);\n  const [purchaseTierId, setPurchaseTierId] = useState<string>("");\n  const [purchaseAccountId, setPurchaseAccountId] = useState<string>("");`
);

// 3. Hooks inside EventsPage
content = content.replace(
  `const createEvent = useCreateEvent();`,
  `const manageEvent = useManageEvent(groupId);\n  const deleteEvent = useDeleteEvent(groupId);\n  const recordRsvp = useRecordRsvp(groupId);\n  const postTicket = usePostTicketPurchase(groupId);\n  const { data: accounts } = useFinancialAccounts(groupId);`
);

// 4. Tenant Reset BEFORE the year definition
content = content.replace(
  `const year = calendarDate.getFullYear();`,
  `// Tenant Reset\n  const prevGroupId = useRef(groupId);\n  useEffect(() => {\n    if (groupId !== prevGroupId.current) {\n      prevGroupId.current = groupId;\n      setShowCreateDialog(false);\n      setEditEventId(null);\n      setShowPurchaseDialog(false);\n      setPurchaseEventId(null);\n      setFormCapacity("");\n      resetForm();\n    }\n  }, [groupId]);\n\n  const year = calendarDate.getFullYear();`
);

// 5. handleRsvp Refactoring
const rsvpRegex = /async function handleRsvp\([^]*?function showError/m;
const newRsvp = `async function handleRsvp(eventId: string, response: "yes" | "no" | "maybe") {
    if (!currentMembership?.id) return;
    setRsvpLoading(eventId);
    try {
      await recordRsvp.mutateAsync({
        groupId,
        eventId,
        membershipId: currentMembership.id,
        response,
      });
    } catch (err) {
      console.warn("[Events] RSVP update failed:", err);
      showError(t("rsvpFailed") || parseEventRpcError(err));
    } finally {
      setRsvpLoading(null);
    }
  }

  const handlePurchaseTicket = async () => {
    if (!purchaseEventId || !purchaseTierId || !purchaseAccountId || !currentMembership?.id) return;
    try {
      await postTicket.mutateAsync({
        groupId,
        eventId: purchaseEventId,
        tierId: purchaseTierId,
        membershipId: currentMembership.id,
        accountId: purchaseAccountId,
      });
      setShowPurchaseDialog(false);
      setPurchaseEventId(null);
    } catch (err) {
      console.warn("[Events] Ticket purchase failed:", err);
      showError(parseEventRpcError(err));
    }
  };

  function showError`;
content = content.replace(rsvpRegex, newRsvp);

// 6. Refactor the handlers directly
const handleCreateEventStr = `const handleCreateEvent = async () => {
    if (!formTitle || !formStartsAt || creating) return;
    // Block past dates
    if (new Date(formStartsAt) < new Date()) {
      showError(t("pastDateError"));
      return;
    }
    setCreating(true);
    try {
      await manageEvent.mutateAsync({
        groupId,
        payload: {
          title: formTitle,
          description: formDescription || undefined,
          event_type: formEventType,
          starts_at: new Date(formStartsAt).toISOString(),
          ends_at: formEndsAt ? new Date(formEndsAt).toISOString() : undefined,
          location: formLocation || undefined,
          capacity: formCapacity ? parseInt(formCapacity, 10) : undefined,
        }
      });
      setShowCreateDialog(false);
      resetForm();
    } catch (err) {
      console.warn("[Events] create failed:", err);
      showError(parseEventRpcError(err));
    } finally {
      setCreating(false);
    }
  };`;
content = content.replace(/const handleCreateEvent = async \(\) => \{[^]*?  \};/m, handleCreateEventStr);

const handleEditEventStr = `async function handleEditEvent() {
    if (!editEventId || !formTitle || !formStartsAt) return;
    const startsAtChanged = formStartsAt !== editOriginalStartsAt;
    if (startsAtChanged && new Date(formStartsAt) < new Date()) {
      showError(t("pastDateError"));
      return;
    }
    setEditSaving(true);
    try {
      await manageEvent.mutateAsync({
        groupId,
        eventId: editEventId,
        payload: {
          title: formTitle,
          description: formDescription || undefined,
          event_type: formEventType,
          starts_at: new Date(formStartsAt).toISOString(),
          ends_at: formEndsAt ? new Date(formEndsAt).toISOString() : undefined,
          location: formLocation || undefined,
          capacity: formCapacity ? parseInt(formCapacity, 10) : undefined,
        }
      });
      setShowCreateDialog(false);
      resetForm();
      setEditEventId(null);
    } catch (err) {
      console.warn("[Events] update failed:", err);
      showError(parseEventRpcError(err));
    } finally {
      setEditSaving(false);
    }
  }`;
content = content.replace(/async function handleEditEvent\(\) \{[^]*?  \}/m, handleEditEventStr);

const handleCancelEventStr = `async function handleCancelEvent(eventId: string) {
    if (cancellingId) return;
    const ok = await confirmDialog({
      title: t("cancelEvent"),
      description: t("cancelEventConfirm"),
      confirmLabel: t("cancelEvent"),
      cancelLabel: tc("cancel"),
      destructive: true,
    });
    if (!ok) return;
    setCancellingId(eventId);
    try {
      const e = (events || []).find((ev: any) => ev.id === eventId);
      if (!e) return;
      await manageEvent.mutateAsync({
        groupId,
        eventId,
        payload: {
          title: e.title || "",
          event_type: e.event_type || "meeting",
          starts_at: e.starts_at || new Date().toISOString(),
          status: "cancelled",
          description: e.description,
          location: e.location,
          ends_at: e.ends_at,
          capacity: e.capacity,
        }
      });
      
      const supabase = createClient();
      try {
        const cancelledEvent = e;
        const eventTitle = (cancelledEvent?.title as string) || "";
        const { data: allMembers } = await supabase
          .from("memberships")
          .select("id, user_id")
          .eq("group_id", groupId)
          .not("user_id", "is", null);

        if (allMembers && allMembers.length > 0) {
          await supabase.from("notifications").insert(
            allMembers.map((m: any) => ({
              group_id: groupId,
              user_id: m.user_id,
              type: "system",
              title: t("eventCancelledNotifTitle"),
              body: t("eventCancelledNotifBody", { title: eventTitle }),
              is_read: false,
              data: { link: "/dashboard/events" },
            }))
          );
        }
      } catch (notifErr) {
        console.warn("[Events] cancellation notification insert failed:", notifErr);
      }

    } catch (err) {
      console.warn("[Events] cancel failed:", err);
      showError(parseEventRpcError(err));
    } finally {
      setCancellingId(null);
    }
  }`;
content = content.replace(/async function handleCancelEvent[^]*?  \}/m, handleCancelEventStr);

const handleDeleteEventStr = `async function handleDeleteEvent(eventId: string) {
    setDeletingId(eventId);
    try {
      await deleteEvent.mutateAsync({ groupId, eventId });
      setShowDeleteConfirm(null);
    } catch (err) {
      console.warn("[Events] delete failed:", err);
      showError(parseEventRpcError(err));
    } finally {
      setDeletingId(null);
    }
  }`;
content = content.replace(/async function handleDeleteEvent[^]*?  \}/m, handleDeleteEventStr);

fs.writeFileSync(file, content);
console.log('Events Refactor V2 Complete');
