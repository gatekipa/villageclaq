const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../../../../../src/app/[locale]/(dashboard)/dashboard/attendance/page.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Imports
content = content.replace(
  `import { useEvents, useMembers } from "@/lib/hooks/use-supabase-query";`,
  `import { useEvents, useMembers } from "@/lib/hooks/use-supabase-query";\nimport { useRecordAttendance, parseEventRpcError } from "@/lib/hooks/use-events-mutations";`
);

// 2. Hook and Tenant Reset
content = content.replace(
  `const { data: members, isLoading: membersLoading } = useMembers();`,
  `const { data: members, isLoading: membersLoading } = useMembers();\n  const recordAttendance = useRecordAttendance(groupId);\n  \n  // Tenant Reset\n  const prevGroupId = useRef(groupId);\n  useEffect(() => {\n    if (groupId !== prevGroupId.current) {\n      prevGroupId.current = groupId;\n      setShowDialog(false);\n      setDialogEventId("");\n      setMemberStatuses({});\n      setRollCallSearch("");\n    }\n  }, [groupId]);`
);

// 3. handleSingleCheckIn (Proxy Check-in / Note)
const handleSingleCheckInRegex = /async function handleSingleCheckIn[^]*?\}\n\n  async function handleBatchSave/m;
const newSingleCheckIn = `async function handleSingleCheckIn(membershipId: string, status: AttendanceStatus) {
    setMemberStatuses((prev) => ({ ...prev, [membershipId]: status }));
    try {
      await recordAttendance.mutateAsync({
        groupId,
        eventId: dialogEventId,
        membershipId,
        status,
        checkinMethod: "manual",
      });
      
      setCheckedInCount((prev) => prev + 1);
      queryClient.invalidateQueries({ queryKey: ["event_attendances"] });
      
      const member = (members as Record<string, unknown>[])?.find((m) => m.id === membershipId);
      const name = member ? getMemberName(member) : tc("member");
      setSuccessMessage(t("checkedInSuccess", { name }));
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      console.warn("[Attendance] Single update failed:", err);
      setDialogError(parseEventRpcError(err));
    }
  }

  async function handleBatchSave`;

content = content.replace(handleSingleCheckInRegex, newSingleCheckIn);

// 4. handleBatchSave
const handleBatchSaveRegex = /async function handleBatchSave[^]*?\}\n\n  \/\/ QR Code/m;
const newBatchSave = `async function handleBatchSave() {
    setSaving(true);
    setDialogError("");
    setSuccessMessage("");
    try {
      const records = Object.entries(memberStatuses).map(([membershipId, status]) => ({
        groupId,
        eventId: dialogEventId,
        membershipId,
        status,
        checkinMethod: "manual" as const,
      }));
      
      if (records.length === 0) {
        setShowDialog(false);
        return;
      }
      
      for (const record of records) {
        await recordAttendance.mutateAsync(record);
      }
      
      queryClient.invalidateQueries({ queryKey: ["event_attendances"] });
      setSuccessMessage(t("batchSaveSuccess"));
      setTimeout(() => {
        setSuccessMessage("");
        setShowDialog(false);
      }, 2000);
    } catch (err) {
      console.warn("[Attendance] Batch save failed:", err);
      setDialogError(parseEventRpcError(err));
    } finally {
      setSaving(false);
    }
  }

  // QR Code`;

content = content.replace(handleBatchSaveRegex, newBatchSave);

// 5. checkInFromQR
const checkInFromQRRegex = /async function checkInFromQR[^]*?const qrValue =/m;
const newCheckInFromQR = `async function checkInFromQR(qrData: string) {
    if (!dialogEventId) return;
    try {
      const payload = JSON.parse(qrData);
      if (payload.group_id !== groupId) {
        setDialogError(t("qrWrongGroup"));
        return;
      }
      await recordAttendance.mutateAsync({
        groupId,
        eventId: dialogEventId,
        membershipId: payload.membership_id,
        status: "present",
        checkinMethod: "qr",
      });
      
      setCheckedInCount((prev) => prev + 1);
      queryClient.invalidateQueries({ queryKey: ["event_attendances"] });
      setSuccessMessage(t("qrCheckInSuccess"));
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      console.warn("[Attendance] QR Check-in failed:", err);
      setDialogError(parseEventRpcError(err));
    }
  }

  const qrValue =`;

content = content.replace(checkInFromQRRegex, newCheckInFromQR);

fs.writeFileSync(file, content);
console.log('Attendance Refactor Complete');
