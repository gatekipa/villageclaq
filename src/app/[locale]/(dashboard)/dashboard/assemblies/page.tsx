/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Users, Calendar, Gavel, CheckCircle2 } from "lucide-react";
import { useCallAssemblyToOrder, useRecordAssemblyRollCall, useAdjournAssembly } from "@/lib/hooks/use-governance-mutations";
import { useMembers } from "@/lib/hooks/use-supabase-query";

const supabase = createClient();

// Data fetching hooks for this page
function useAssemblies(groupId: string | null) {
  return useQuery({
    queryKey: ["assemblies", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("assemblies")
        .select("*")
        .eq("group_id", groupId)
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!groupId,
  });
}

function useAssemblyQuorumSnapshot(assemblyId: string | null) {
  return useQuery({
    queryKey: ["assembly-quorum-snapshot", assemblyId],
    queryFn: async () => {
      if (!assemblyId) return null;
      const { data, error } = await supabase
        .from("assembly_quorum_snapshots")
        .select("*")
        .eq("assembly_id", assemblyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!assemblyId,
  });
}

function useAssemblyAttendance(assemblyId: string | null) {
  return useQuery({
    queryKey: ["assembly-attendance", assemblyId],
    queryFn: async () => {
      if (!assemblyId) return [];
      const { data, error } = await supabase
        .from("assembly_attendance")
        .select("*")
        .eq("assembly_id", assemblyId);
      if (error) throw error;
      return data;
    },
    enabled: !!assemblyId,
  });
}

export default function AssembliesPage() {
  const t = useTranslations("governance");
  const { groupId, isAdmin, isOwner } = useGroup();
  const queryClient = useQueryClient();

  const [prevGroupId, setPrevGroupId] = useState(groupId);

  // Dialog states
  const [draftAssemblyOpen, setDraftAssemblyOpen] = useState(false);
  const [callToOrderAssemblyId, setCallToOrderAssemblyId] = useState<string | null>(null);
  const [rollCallAssemblyId, setRollCallAssemblyId] = useState<string | null>(null);
  const [adjournAssemblyId, setAdjournAssemblyId] = useState<string | null>(null);

  // Multi-tenant reset
  useEffect(() => {
    if (groupId !== prevGroupId) {
      setPrevGroupId(groupId);
      setDraftAssemblyOpen(false);
      setCallToOrderAssemblyId(null);
      setRollCallAssemblyId(null);
      setAdjournAssemblyId(null);
    }
  }, [groupId, prevGroupId]);

  const { data: assemblies = [], isLoading } = useAssemblies(groupId);
  const { data: members = [] } = useMembers();

  // Draft form
  const [draftTitle, setDraftTitle] = useState("");
  const [draftType, setDraftType] = useState("general_assembly");
  const [draftDate, setDraftDate] = useState("");

  const handleDraftAssembly = async () => {
    if (!groupId || !draftTitle || !draftDate) return;
    const { error } = await supabase.from("assemblies").insert({
      group_id: groupId,
      title: draftTitle,
      assembly_type: draftType,
      scheduled_at: new Date(draftDate).toISOString(),
      status: "draft",
    });
    if (!error) {
      setDraftAssemblyOpen(false);
      queryClient.invalidateQueries({ queryKey: ["assemblies", groupId] });
    }
  };

  const activeAssemblies = assemblies.filter(a => ["called_to_order", "in_session"].includes(a.status));
  const upcomingAssemblies = assemblies.filter(a => a.status === "draft");
  const pastAssemblies = assemblies.filter(a => ["adjourned", "archived"].includes(a.status));

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        {(isAdmin || isOwner) && (
          <Dialog open={draftAssemblyOpen} onOpenChange={setDraftAssemblyOpen}>
            {/* @ts-expect-error asChild type issue */}
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                {t("newAssembly")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("newAssembly")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={draftTitle} onChange={e => setDraftTitle(e.target.value)} placeholder="e.g. 2026 Annual General Meeting" />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={draftType} onValueChange={(v) => setDraftType(v as string)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agm">{t("typeAgm")}</SelectItem>
                      <SelectItem value="general_assembly">{t("typeGeneralAssembly")}</SelectItem>
                      <SelectItem value="extraordinary_assembly">{t("typeExtraordinaryAssembly")}</SelectItem>
                      <SelectItem value="committee">{t("typeCommittee")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Scheduled Date</Label>
                  <Input type="datetime-local" value={draftDate} onChange={e => setDraftDate(e.target.value)} />
                </div>
                <Button onClick={handleDraftAssembly} className="w-full">Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-8">
          {activeAssemblies.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
                Active Sessions
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {activeAssemblies.map(a => (
                  <AssemblyCard 
                    key={a.id} 
                    assembly={a} 
                    members={members}
                    onRollCall={() => setRollCallAssemblyId(a.id)}
                    onAdjourn={() => setAdjournAssemblyId(a.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {upcomingAssemblies.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-muted-foreground">Upcoming</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {upcomingAssemblies.map(a => (
                  <AssemblyCard 
                    key={a.id} 
                    assembly={a} 
                    members={members}
                    onCallToOrder={() => setCallToOrderAssemblyId(a.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {pastAssemblies.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-muted-foreground">Past</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {pastAssemblies.map(a => (
                  <AssemblyCard key={a.id} assembly={a} members={members} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Dialogs */}
      {callToOrderAssemblyId && (
        <CallToOrderDialog 
          assemblyId={callToOrderAssemblyId} 
          onClose={() => setCallToOrderAssemblyId(null)} 
        />
      )}
      
      {rollCallAssemblyId && (
        <RollCallDialog 
          assemblyId={rollCallAssemblyId} 
          members={members}
          onClose={() => setRollCallAssemblyId(null)} 
        />
      )}

      {adjournAssemblyId && (
        <AdjournDialog 
          assemblyId={adjournAssemblyId} 
          onClose={() => setAdjournAssemblyId(null)} 
        />
      )}
    </div>
  );
}

function AssemblyCard({ assembly, members, onCallToOrder, onRollCall, onAdjourn }: { assembly: any, members: any[], onCallToOrder?: () => void, onRollCall?: () => void, onAdjourn?: () => void }) {
  const t = useTranslations("governance");
  const { data: snapshot } = useAssemblyQuorumSnapshot(assembly.id);
  const { data: attendance } = useAssemblyAttendance(assembly.id);
  
  const presentCount = attendance?.filter((a: any) => a.status === "present" || a.status === "proxy").length || 0;
  const quorumAchieved = snapshot && presentCount >= snapshot.required_quorum_count;

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <CardTitle>{assembly.title}</CardTitle>
            <CardDescription className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(assembly.scheduled_at).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" })}
            </CardDescription>
          </div>
          <Badge variant={assembly.status === "in_session" ? "default" : assembly.status === "adjourned" ? "secondary" : "outline"}>
            {t(assembly.status === "draft" ? "statusDraft" : assembly.status === "called_to_order" ? "statusCalledToOrder" : assembly.status === "in_session" ? "statusInSession" : "statusAdjourned")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {snapshot && (
          <div className="space-y-2 bg-muted/50 p-3 rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1"><Users className="w-4 h-4"/> Quorum</span>
              <span className="font-medium">{presentCount} / {snapshot.required_quorum_count}</span>
            </div>
            <Progress value={Math.min(100, (presentCount / snapshot.required_quorum_count) * 100)} className={quorumAchieved ? "[&>div]:bg-green-500" : ""} />
            <p className="text-xs text-right text-muted-foreground">
              {quorumAchieved ? t("quorumAchieved") : t("quorumPending")}
            </p>
          </div>
        )}
        
        <div className="flex flex-wrap gap-2 pt-2 mt-auto">
          {assembly.status === "draft" && onCallToOrder && (
            <Button size="sm" onClick={onCallToOrder} className="w-full">
              <Gavel className="w-4 h-4 mr-2" />
              {t("callToOrder")}
            </Button>
          )}
          {["called_to_order", "in_session"].includes(assembly.status) && (
            <>
              <Button size="sm" variant="outline" onClick={onRollCall} className="flex-1">
                <Users className="w-4 h-4 mr-2" />
                {t("recordRollCall")}
              </Button>
              <Button size="sm" variant="destructive" onClick={onAdjourn} className="flex-1">
                {t("adjournAssembly")}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CallToOrderDialog({ assemblyId, onClose }: { assemblyId: string, onClose: () => void }) {
  const t = useTranslations("governance");
  const { groupId } = useGroup();
  const [threshold, setThreshold] = useState("50.00");
  const callToOrder = useCallAssemblyToOrder();

  const handleCall = async () => {
    if (!groupId) return;
    await callToOrder.mutateAsync({
      groupId,
      assemblyId,
      quorumThresholdPercent: parseFloat(threshold)
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("callToOrder")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Quorum Threshold (%)</Label>
            <Input type="number" step="0.01" min="1" max="100" value={threshold} onChange={e => setThreshold(e.target.value)} />
            <p className="text-xs text-muted-foreground">Percentage of active eligible members required to achieve quorum.</p>
          </div>
          <Button onClick={handleCall} disabled={callToOrder.isPending} className="w-full">
            {callToOrder.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirm Call to Order
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RollCallDialog({ assemblyId, members, onClose }: { assemblyId: string, members: any[], onClose: () => void }) {
  const t = useTranslations("governance");
  const { groupId } = useGroup();
  const { data: attendance = [] } = useAssemblyAttendance(assemblyId);
  const recordRollCall = useRecordAssemblyRollCall();

  const [localAttendance, setLocalAttendance] = useState<Record<string, string>>({});

  useEffect(() => {
    const init: Record<string, string> = {};
    attendance.forEach((a: any) => { init[a.membership_id] = a.status; });
    setLocalAttendance(init);
  }, [attendance]);

  const activeMembers = members.filter(m => m.membership_status === "active");

  const handleSave = async () => {
    if (!groupId) return;
    const records = Object.entries(localAttendance).map(([membershipId, status]) => ({
      membershipId,
      status: status as "present" | "excused" | "absent" | "proxy"
    }));
    if (records.length === 0) return onClose();
    
    await recordRollCall.mutateAsync({
      groupId,
      assemblyId,
      attendanceRecords: records
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("recordRollCall")}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-2">
          {activeMembers.map(m => (
            <div key={m.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
              <div>
                <p className="font-medium">{m.display_name || m.profile?.full_name}</p>
                <p className="text-xs text-muted-foreground capitalize">{m.role}</p>
              </div>
              <Select 
                value={localAttendance[m.id] || "absent"} 
                onValueChange={(v) => setLocalAttendance(p => ({ ...p, [m.id]: v as string }))}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="excused">Excused</SelectItem>
                  <SelectItem value="proxy">Proxy</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={recordRollCall.isPending}>
            {recordRollCall.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Roll Call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjournDialog({ assemblyId, onClose }: { assemblyId: string, onClose: () => void }) {
  const t = useTranslations("governance");
  const { groupId } = useGroup();
  const adjourn = useAdjournAssembly();

  const handleAdjourn = async () => {
    if (!groupId) return;
    await adjourn.mutateAsync({ groupId, assemblyId });
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-destructive">{t("adjournAssembly")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="bg-destructive/10 text-destructive p-4 rounded-lg text-sm flex gap-3 items-start">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
            <p>{t("immutabilityNotice")}</p>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button variant="destructive" onClick={handleAdjourn} disabled={adjourn.isPending}>
              {adjourn.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Seal & Adjourn
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
