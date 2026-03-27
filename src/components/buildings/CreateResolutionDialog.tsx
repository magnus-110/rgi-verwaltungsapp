import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";

interface CreateResolutionDialogProps {
  buildingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateResolutionDialog = ({ buildingId, open, onOpenChange }: CreateResolutionDialogProps) => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [resolutionNumber, setResolutionNumber] = useState("");
  const [resolutionText, setResolutionText] = useState("");
  const [result, setResult] = useState("passed");
  const [yesCount, setYesCount] = useState("");
  const [noCount, setNoCount] = useState("");
  const [abstainCount, setAbstainCount] = useState("");
  const [resolvedAt, setResolvedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [meetingId, setMeetingId] = useState<string>("none");

  const { data: meetings = [] } = useQuery({
    queryKey: ["building-meetings-for-resolution", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_meetings")
        .select("id, title, meeting_date")
        .eq("building_id", buildingId)
        .order("meeting_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("etv_resolutions").insert({
        building_id: buildingId,
        meeting_id: meetingId !== "none" ? meetingId : null,
        agenda_item_id: null,
        resolution_number: resolutionNumber || null,
        resolution_text: resolutionText,
        result,
        yes_count: parseFloat(yesCount) || 0,
        no_count: parseFloat(noCount) || 0,
        abstain_count: parseFloat(abstainCount) || 0,
        resolved_at: resolvedAt || new Date().toISOString(),
        published: true,
        source: "manual",
        created_by: profile?.user_id,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["building-resolutions", buildingId] });
      toast({ title: "Beschluss eingetragen" });
      resetForm();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setResolutionNumber("");
    setResolutionText("");
    setResult("passed");
    setYesCount("");
    setNoCount("");
    setAbstainCount("");
    setResolvedAt("");
    setNotes("");
    setMeetingId("none");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Beschluss manuell eintragen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Beschlussnummer</Label>
              <Input
                placeholder="z.B. B-2026-001"
                value={resolutionNumber}
                onChange={(e) => setResolutionNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Datum</Label>
              <Input
                type="date"
                value={resolvedAt}
                onChange={(e) => setResolvedAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Versammlung (optional)</Label>
            <Select value={meetingId} onValueChange={setMeetingId}>
              <SelectTrigger>
                <SelectValue placeholder="Ohne Versammlung" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ohne Versammlung</SelectItem>
                {meetings.map((m: any) => (
                  <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Beschlusstext *</Label>
            <Textarea
              placeholder="Die Eigentümer beschließen..."
              value={resolutionText}
              onChange={(e) => setResolutionText(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Ergebnis</Label>
            <Select value={result} onValueChange={setResult}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="passed">Angenommen</SelectItem>
                <SelectItem value="rejected">Abgelehnt</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Ja-Stimmen</Label>
              <Input type="number" value={yesCount} onChange={(e) => setYesCount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nein-Stimmen</Label>
              <Input type="number" value={noCount} onChange={(e) => setNoCount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Enthaltungen</Label>
              <Input type="number" value={abstainCount} onChange={(e) => setAbstainCount(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Anmerkungen</Label>
            <Textarea
              placeholder="Interne Notizen..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button onClick={() => mutation.mutate()} disabled={!resolutionText || mutation.isPending}>
              Beschluss eintragen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
