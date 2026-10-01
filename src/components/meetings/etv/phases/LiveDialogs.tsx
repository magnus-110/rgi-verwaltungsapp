import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const PRINCIPLES: Record<string, string> = { headcount: "Kopfprinzip", mea: "Nach Anteilen (MEA)", sqm: "Nach Wohnfläche" };

/** Weiteren Tagesordnungspunkt während der Versammlung einfügen. */
export const AddTopDialog = ({ open, onOpenChange, meetingId, items, defaultPrinciple }: {
  open: boolean; onOpenChange: (o: boolean) => void; meetingId: string; items: any[]; defaultPrinciple: string;
}) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [resolution, setResolution] = useState("");
  const [principle, setPrinciple] = useState(defaultPrinciple);
  const [requiresResolution, setRequiresResolution] = useState(true);
  const [position, setPosition] = useState("end");

  const add = useMutation({
    mutationFn: async () => {
      let pos = items.length + 1;
      if (position !== "end") {
        const after = items.find((i) => i.id === position);
        if (after) pos = after.sort_order + 1;
      }
      const toShift = items.filter((i) => i.sort_order >= pos).sort((a, b) => b.sort_order - a.sort_order);
      for (const item of toShift) {
        const { error } = await supabase.from("etv_agenda_items").update({ sort_order: item.sort_order + 1 }).eq("id", item.id);
        if (error) throw error;
      }
      const { error } = await supabase.from("etv_agenda_items").insert({
        meeting_id: meetingId, sort_order: pos, title, description: description || null,
        resolution_text: requiresResolution ? resolution || null : null,
        voting_principle: requiresResolution ? principle : "headcount",
        category: "sonstiges", status: "pending", requires_resolution: requiresResolution,
        requires_double_qualified: false, double_qualified_relevant: false, include_description_in_invitation: false,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["etv-agenda-items-live", meetingId] });
      toast({ title: "Punkt eingefügt" });
      setTitle(""); setDescription(""); setResolution(""); setPosition("end"); setRequiresResolution(true);
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Punkt einfügen</DialogTitle>
          <DialogDescription>
            Über einen Punkt, der nicht in der Einladung stand, kann nur beschlossen werden, wenn er von der Tagesordnung gedeckt ist (§ 23 Abs. 2 WEG). Sonst bleibt er zur Besprechung ohne Beschluss.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          <div className="space-y-1.5"><Label>Titel</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Beschreibung</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Position</Label>
            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="end">Am Ende</SelectItem>
                {items.map((it, i) => <SelectItem key={it.id} value={it.id}>Nach TOP {i + 1}: {it.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between"><Label>Mit Beschluss</Label><Switch checked={requiresResolution} onCheckedChange={setRequiresResolution} /></div>
          {requiresResolution && (
            <>
              <div className="space-y-1.5"><Label>Beschlussantrag</Label><Textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Abstimmung</Label>
                <Select value={principle} onValueChange={setPrinciple}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PRINCIPLES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={() => add.mutate()} disabled={!title.trim() || add.isPending} className="gap-1"><Plus className="h-4 w-4" /> Einfügen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Geschäftsordnungsbeschluss (z. B. Wahl der Versammlungsleitung). */
export const ProceduralDialog = ({ open, onOpenChange, meetingId, count }: {
  open: boolean; onOpenChange: (o: boolean) => void; meetingId: string; count: number;
}) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [resolution, setResolution] = useState("");
  const [principle, setPrinciple] = useState("headcount");
  const [autoAccept, setAutoAccept] = useState(true);

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("etv_agenda_items").insert({
        meeting_id: meetingId, sort_order: count + 1, title, resolution_text: resolution || null,
        voting_principle: principle, category: "geschaeftsbeschluss",
        status: autoAccept ? "voted" : "open", result: autoAccept ? "passed" : null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["etv-agenda-items-live", meetingId] });
      toast({ title: "Geschäftsordnungsbeschluss eingefügt" });
      setTitle(""); setResolution(""); setAutoAccept(true);
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Geschäftsordnungsbeschluss</DialogTitle>
          <DialogDescription>Zum Beispiel Wahl der Versammlungsleitung oder Änderung der Reihenfolge.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          <div className="space-y-1.5"><Label>Titel</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Beschlusstext</Label><Textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Abstimmung</Label>
            <Select value={principle} onValueChange={setPrinciple}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PRINCIPLES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2.5 text-sm"><Switch checked={autoAccept} onCheckedChange={setAutoAccept} /> Direkt als angenommen eintragen</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={() => add.mutate()} disabled={!title.trim() || add.isPending}>Einfügen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
