import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, ExternalLink, X, Link2, Building2, Inbox } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format as formatDate } from "date-fns";
import { de } from "date-fns/locale";

interface Props {
  buildingFilter?: string;
}

export const EtvRelevantEmailsManager = ({ buildingFilter }: Props) => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [assignEmailId, setAssignEmailId] = useState<string | null>(null);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>("");
  const [selectedAgendaItemId, setSelectedAgendaItemId] = useState<string>("");

  const { data: emails = [], isLoading } = useQuery({
    queryKey: ["etv-relevant-emails-all", buildingFilter || "all"],
    queryFn: async () => {
      let q = supabase
        .from("emails")
        .select("id, subject, from_name, from_address, date, ai_summary, building_id, etv_meeting_id, etv_agenda_item_id, buildings(id,name)")
        .eq("is_etv_relevant", true)
        .order("date", { ascending: false })
        .limit(200);
      if (buildingFilter && buildingFilter !== "all") q = q.eq("building_id", buildingFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const assignEmail = emails.find((e: any) => e.id === assignEmailId);

  const { data: meetings = [] } = useQuery({
    queryKey: ["etv-meetings-for-assign", assignEmail?.building_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_meetings")
        .select("id, title, meeting_date")
        .eq("building_id", assignEmail!.building_id)
        .in("status", ["draft", "published", "live"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!assignEmail?.building_id,
  });

  const { data: agendaItems = [] } = useQuery({
    queryKey: ["etv-agenda-items-for-assign", selectedMeetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_agenda_items")
        .select("id, title, sort_order")
        .eq("meeting_id", selectedMeetingId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedMeetingId,
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!assignEmailId) return;
      const patch: any = {
        etv_meeting_id: selectedMeetingId || null,
        etv_agenda_item_id: selectedAgendaItemId || null,
      };
      const { error } = await supabase.from("emails").update(patch).eq("id", assignEmailId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "E-Mail zugeordnet" });
      setAssignEmailId(null);
      setSelectedMeetingId("");
      setSelectedAgendaItemId("");
      qc.invalidateQueries({ queryKey: ["etv-relevant-emails-all"] });
      qc.invalidateQueries({ queryKey: ["etv-agenda-item-emails"] });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const removeMark = async (id: string) => {
    const { error } = await supabase
      .from("emails")
      .update({ is_etv_relevant: false, etv_meeting_id: null, etv_agenda_item_id: null })
      .eq("id", id);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["etv-relevant-emails-all"] });
    toast({ title: "ETV-Markierung entfernt" });
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Wird geladen…</p>;
  }

  if (emails.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Keine ETV-relevanten E-Mails. Markiere E-Mails im Posteingang über das Stimmzettel-Symbol.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {emails.map((e: any) => (
          <Card key={e.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm truncate">{e.subject || "(Kein Betreff)"}</span>
                    {e.etv_agenda_item_id ? (
                      <Badge variant="default" className="text-[10px]">TOP zugeordnet</Badge>
                    ) : e.etv_meeting_id ? (
                      <Badge variant="secondary" className="text-[10px]">Versammlung</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Nicht zugeordnet</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span>{e.from_name || e.from_address}</span>
                    {e.date && <><span>·</span><span>{formatDate(new Date(e.date), "dd.MM.yyyy HH:mm", { locale: de })}</span></>}
                    {e.buildings?.name && <><span>·</span><span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{e.buildings.name}</span></>}
                  </div>
                  {e.ai_summary && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.ai_summary}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                    onClick={() => { setAssignEmailId(e.id); setSelectedMeetingId(e.etv_meeting_id || ""); setSelectedAgendaItemId(e.etv_agenda_item_id || ""); }}>
                    <Link2 className="h-3.5 w-3.5" />
                    {e.etv_agenda_item_id ? "Ändern" : "TOP zuordnen"}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Im Posteingang öffnen"
                    onClick={() => navigate(`/inbox?email=${e.id}`)}>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" title="Markierung entfernen"
                    onClick={() => removeMark(e.id)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!assignEmailId} onOpenChange={(open) => { if (!open) setAssignEmailId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>E-Mail einem TOP zuordnen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Versammlung</label>
              <Select value={selectedMeetingId} onValueChange={(v) => { setSelectedMeetingId(v); setSelectedAgendaItemId(""); }}>
                <SelectTrigger><SelectValue placeholder="Versammlung wählen…" /></SelectTrigger>
                <SelectContent>
                  {meetings.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.title}{m.meeting_date ? ` — ${formatDate(new Date(m.meeting_date), "dd.MM.yyyy", { locale: de })}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {meetings.length === 0 && <p className="text-xs text-destructive">Keine Versammlungen für diese Liegenschaft vorhanden.</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">TOP (optional)</label>
              <Select value={selectedAgendaItemId} onValueChange={setSelectedAgendaItemId} disabled={!selectedMeetingId}>
                <SelectTrigger><SelectValue placeholder="TOP wählen…" /></SelectTrigger>
                <SelectContent>
                  {agendaItems.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>TOP {a.sort_order}: {a.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Ohne TOP-Zuordnung erscheint die E-Mail in der Versammlung als allgemein.</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setSelectedMeetingId(""); setSelectedAgendaItemId(""); assignMutation.mutate(); }}>Zuordnung entfernen</Button>
            <Button onClick={() => assignMutation.mutate()} disabled={!selectedMeetingId || assignMutation.isPending}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
