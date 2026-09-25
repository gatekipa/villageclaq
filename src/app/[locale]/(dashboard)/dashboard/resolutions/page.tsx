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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Lock, FileText, CheckCircle2, XCircle } from "lucide-react";
import { useTallyResolutionVote } from "@/lib/hooks/use-governance-mutations";

const supabase = createClient();

// Data fetching hooks for this page
function useResolutions(groupId: string | null) {
  return useQuery({
    queryKey: ["resolutions", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("resolutions")
        .select(`
          *,
          assemblies (
            id,
            title,
            status
          )
        `)
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!groupId,
  });
}

function useAssemblies(groupId: string | null) {
  return useQuery({
    queryKey: ["assemblies", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("assemblies")
        .select("*")
        .eq("group_id", groupId)
        .in("status", ["draft", "called_to_order", "in_session"])
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!groupId,
  });
}

export default function ResolutionsPage() {
  const t = useTranslations("governance");
  const { groupId, isAdmin, isOwner } = useGroup();
  const queryClient = useQueryClient();

  const [prevGroupId, setPrevGroupId] = useState(groupId);

  const [draftOpen, setDraftOpen] = useState(false);
  const [tallyResolutionId, setTallyResolutionId] = useState<string | null>(null);

  useEffect(() => {
    if (groupId !== prevGroupId) {
      setPrevGroupId(groupId);
      setDraftOpen(false);
      setTallyResolutionId(null);
    }
  }, [groupId, prevGroupId]);

  const { data: resolutions = [], isLoading } = useResolutions(groupId);
  const { data: openAssemblies = [] } = useAssemblies(groupId);

  // Draft form
  const [draftAssemblyId, setDraftAssemblyId] = useState("");
  const [draftNumber, setDraftNumber] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftProse, setDraftProse] = useState("");
  const [draftRule, setDraftRule] = useState("simple_majority");

  const handleDraftResolution = async () => {
    if (!groupId || !draftAssemblyId || !draftNumber || !draftTitle) return;
    const { error } = await supabase.from("resolutions").insert({
      group_id: groupId,
      assembly_id: draftAssemblyId,
      resolution_number: draftNumber,
      title: draftTitle,
      prose: draftProse,
      threshold_rule: draftRule,
      status: "draft",
    });
    if (!error) {
      setDraftOpen(false);
      queryClient.invalidateQueries({ queryKey: ["resolutions", groupId] });
    }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case "adopted": return <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1"/> {t("statusAdopted")}</Badge>;
      case "rejected": return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1"/> {t("statusRejected")}</Badge>;
      case "withdrawn": return <Badge variant="outline">{t("statusWithdrawn")}</Badge>;
      case "tabled": return <Badge variant="secondary">{t("statusTabled")}</Badge>;
      default: return <Badge variant="outline">{t("statusDraft")}</Badge>;
    }
  };

  const getRuleLabel = (rule: string) => {
    switch(rule) {
      case "simple_majority": return t("ruleSimpleMajority");
      case "two_thirds": return t("ruleTwoThirds");
      case "three_fourths": return t("ruleThreeFourths");
      case "unanimous": return t("ruleUnanimous");
      default: return rule;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("resolutionsTitle")}</h1>
          <p className="text-muted-foreground">{t("resolutionsSubtitle")}</p>
        </div>
        {(isAdmin || isOwner) && openAssemblies.length > 0 && (
          <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
            {/* @ts-expect-error asChild type issue */}
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                {t("newResolution")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>{t("newResolution")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Linked Assembly</Label>
                  <Select value={draftAssemblyId} onValueChange={(v) => setDraftAssemblyId(v as string)}>
                    <SelectTrigger><SelectValue placeholder="Select active assembly" /></SelectTrigger>
                    <SelectContent>
                      {openAssemblies.map((a: { id: string; title: string }) => (
                        <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Resolution Number</Label>
                    <Input value={draftNumber} onChange={e => setDraftNumber(e.target.value)} placeholder="e.g. RES-2026-01" />
                  </div>
                  <div className="space-y-2">
                    <Label>Threshold Rule</Label>
                    <Select value={draftRule} onValueChange={(v) => setDraftRule(v as string)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="simple_majority">{t("ruleSimpleMajority")}</SelectItem>
                        <SelectItem value="two_thirds">{t("ruleTwoThirds")}</SelectItem>
                        <SelectItem value="three_fourths">{t("ruleThreeFourths")}</SelectItem>
                        <SelectItem value="unanimous">{t("ruleUnanimous")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={draftTitle} onChange={e => setDraftTitle(e.target.value)} placeholder="Brief descriptive title" />
                </div>
                <div className="space-y-2">
                  <Label>Prose (Optional)</Label>
                  <Textarea value={draftProse} onChange={e => setDraftProse(e.target.value)} placeholder="Full text of the motion..." rows={4} />
                </div>
                <Button onClick={handleDraftResolution} className="w-full">Draft Resolution</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-4">
          {resolutions.map((res: { id: string; resolution_number: string; title: string; threshold_rule: string; status: string; prose?: string; votes_for: number; votes_against: number; votes_abstain: number; assemblies?: { status: string; title: string } }) => {
            const isSealed = res.assemblies?.status === "adjourned" || res.assemblies?.status === "archived";
            return (
              <Card key={res.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono">{res.resolution_number}</Badge>
                        <CardTitle className="text-xl">{res.title}</CardTitle>
                      </div>
                      <CardDescription className="flex items-center gap-2">
                        <span>{res.assemblies?.title}</span>
                        <span>•</span>
                        <span>{getRuleLabel(res.threshold_rule)}</span>
                      </CardDescription>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {getStatusBadge(res.status)}
                      {isSealed && (
                        <span className="flex items-center text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
                          <Lock className="w-3 h-3 mr-1" />
                          Sealed
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {res.prose && (
                    <div className="text-sm bg-muted/30 p-4 rounded-md mb-4 border border-muted">
                      {res.prose}
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex gap-4 text-sm">
                      {res.status !== "draft" && (
                        <>
                          <span className="font-medium text-green-600">For: {res.votes_for}</span>
                          <span className="font-medium text-red-600">Against: {res.votes_against}</span>
                          <span className="font-medium text-muted-foreground">Abstain: {res.votes_abstain}</span>
                        </>
                      )}
                    </div>
                    {res.status === "draft" && !isSealed && (isAdmin || isOwner) && (
                      <Button size="sm" variant="secondary" onClick={() => setTallyResolutionId(res.id)}>
                        <FileText className="w-4 h-4 mr-2" />
                        {t("tallyVotes")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {resolutions.length === 0 && (
            <div className="text-center py-12 text-muted-foreground border rounded-lg border-dashed">
              No resolutions found.
            </div>
          )}
        </div>
      )}

      {tallyResolutionId && (
        <TallyDialog 
          resolutionId={tallyResolutionId} 
          onClose={() => setTallyResolutionId(null)} 
        />
      )}
    </div>
  );
}

function TallyDialog({ resolutionId, onClose }: { resolutionId: string, onClose: () => void }) {
  const t = useTranslations("governance");
  const { groupId } = useGroup();
  const tally = useTallyResolutionVote();

  const [votesFor, setVotesFor] = useState(0);
  const [votesAgainst, setVotesAgainst] = useState(0);
  const [votesAbstain, setVotesAbstain] = useState(0);

  const handleTally = async () => {
    if (!groupId) return;
    await tally.mutateAsync({
      groupId,
      resolutionId,
      votesFor,
      votesAgainst,
      votesAbstain
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("tallyVotes")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-green-600">Votes For</Label>
              <Input type="number" min="0" value={votesFor} onChange={e => setVotesFor(parseInt(e.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label className="text-red-600">Votes Against</Label>
              <Input type="number" min="0" value={votesAgainst} onChange={e => setVotesAgainst(parseInt(e.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Abstentions</Label>
              <Input type="number" min="0" value={votesAbstain} onChange={e => setVotesAbstain(parseInt(e.target.value) || 0)} />
            </div>
          </div>
          <Button onClick={handleTally} disabled={tally.isPending} className="w-full mt-4">
            {tally.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirm Tally
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
