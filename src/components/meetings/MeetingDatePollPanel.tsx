import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarClock, Plus, Trash2, Lock, CheckCircle2 } from "lucide-react";
import {
  evaluateOptions,
  formatGermanDate,
  formatShortDate,
  slotLabel,
  TIME_SLOTS,
  type PollResponseRow,
} from "@/lib/datePoll";

interface Props {
  meetingId: string;
  buildingId: string;
  onApplyDate?: (date: string, time: string) => void;
}

const addDays = (d: number) => {
  const date = new Date();
  date.setDate(date.getDate() + d);
  return date.toISOString().split("T")[0];
};

const isWeekend = (iso: string) => {
  const day = new Date(iso + "T00:00:00").getDay();
  return day === 0 || day === 6;
};

export const MeetingDatePollPanel = ({ meetingId, buildingId, onApplyDate }: Props) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dates, setDates] = useState<string[]>([""]);
  const [closesAt, setClosesAt] = useState(addDays(14));
  const [introText, setIntroText] = useState("");

  const { data: poll } = useQuery({
    queryKey: ["etv-date-poll", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_date_polls")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const pollId = poll?.id as string | undefined;

  const { data: options = [] } = useQuery({
    queryKey: ["etv-date-poll-options", pollId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_date_poll_options")
        .select("id, proposed_date, sort_order")
        .eq("poll_id", pollId!)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
    enabled: !!pollId,
  });

  const { data: responses = [] } = useQuery({
    queryKey: ["etv-date-poll-responses", pollId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_date_poll_responses")
        .select("option_id, contact_id, choice, earliest_time")
        .eq("poll_id", pollId!);
      if (error) throw error;
      return (data || []) as PollResponseRow[];
    },
    enabled: !!pollId,
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["etv-date-poll-notes", pollId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_date_poll_notes")
        .select("contact_id, note")
        .eq("poll_id", pollId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!pollId,
  });

  const { data: owners = [] } = useQuery({
    queryKey: ["etv-date-poll-owners", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_building_assignments")
        .select("contact_id, contacts(id, first_name, last_name, company_name)")
        .eq("building_id", buildingId)
        .eq("role_in_building", "eigentuemer")
        .eq("is_active", true);
      if (error) throw error;
      const map = new Map<string, string>();
      (data || []).forEach((row: any) => {
        const c = row.contacts;
        if (!c) return;
        const name = c.company_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unbekannt";
        map.set(c.id, name);
      });
      return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    },
    enabled: !!buildingId,
  });

  const ranking = useMemo(() => evaluateOptions(options as any, responses), [options, responses]);
  const respondedContacts = useMemo(
    () => new Set(responses.map((r) => r.contact_id)).size,
    [responses],
  );
  const noteByContact = useMemo(
    () => Object.fromEntries(notes.map((n: any) => [n.contact_id, n.note])),
    [notes],
  );

  const createPoll = useMutation({
    mutationFn: async () => {
      const clean = dates.filter(Boolean);
      if (clean.length < 2) throw new Error("Bitte mindestens 2 Tage vorschlagen.");
      if (clean.some(isWeekend)) throw new Error("Samstag und Sonntag sind nicht möglich.");

      const { data, error } = await supabase
        .from("etv_date_polls")
        .insert({
          meeting_id: meetingId,
          building_id: buildingId,
          closes_at: closesAt,
          intro_text: introText || null,
          created_by: profile?.user_id,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: optErr } = await supabase.from("etv_date_poll_options").insert(
        clean
          .sort()
          .map((d, i) => ({ poll_id: data.id, proposed_date: d, sort_order: i })),
      );
      if (optErr) throw optErr;
      return data.id;
    },
    onSuccess: () => {
      toast({ title: "Terminumfrage gestartet" });
      setDialogOpen(false);
      setDates([""]);
      queryClient.invalidateQueries({ queryKey: ["etv-date-poll", meetingId] });
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const setStatus = useMutation({
    mutationFn: async (status: "open" | "closed") => {
      const { error } = await supabase.from("etv_date_polls").update({ status }).eq("id", pollId!);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["etv-date-poll", meetingId] }),
  });

  const deletePoll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("etv_date_polls").delete().eq("id", pollId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Terminumfrage gelöscht" });
      queryClient.invalidateQueries({ queryKey: ["etv-date-poll", meetingId] });
    },
  });

  if (!poll) {
    return (
      <div className="rounded-lg border border-dashed p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <CalendarClock className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold">Terminfindung</h4>
            <p className="text-xs text-muted-foreground">
              Tage vorschlagen und die Eigentümer abstimmen lassen, wann es passt.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Terminumfrage starten
        </Button>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Terminumfrage starten</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Vorgeschlagene Tage (Mo–Fr)</Label>
                {dates.map((d, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      type="date"
                      value={d}
                      onChange={(e) => {
                        const next = [...dates];
                        next[i] = e.target.value;
                        setDates(next);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDates(dates.filter((_, idx) => idx !== i))}
                      disabled={dates.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {dates.some((d) => d && isWeekend(d)) && (
                  <p className="text-xs text-destructive">Samstag und Sonntag sind nicht möglich.</p>
                )}
                {dates.length < 10 && (
                  <Button variant="outline" size="sm" onClick={() => setDates([...dates, ""])} className="gap-2">
                    <Plus className="h-4 w-4" /> Tag hinzufügen
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <Label>Abfrage läuft bis</Label>
                <Input type="date" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Hinweistext (optional)</Label>
                <Textarea rows={2} value={introText} onChange={(e) => setIntroText(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Abbrechen
              </Button>
              <Button onClick={() => createPoll.mutate()} disabled={createPoll.isPending}>
                Starten
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const isClosed = poll.status === "closed" || new Date(poll.closes_at) < new Date();

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <CalendarClock className="h-5 w-5 text-muted-foreground" />
          <div>
            <h4 className="text-sm font-semibold flex items-center gap-2">
              Terminfindung
              <Badge variant={isClosed ? "secondary" : "default"}>
                {isClosed ? "abgeschlossen" : "läuft"}
              </Badge>
            </h4>
            <p className="text-xs text-muted-foreground">
              Bis {formatShortDate(poll.closes_at)} · {respondedContacts} von {owners.length} Eigentümern haben
              geantwortet
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {!isClosed && (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setStatus.mutate("closed")}>
              <Lock className="h-4 w-4" /> Umfrage schließen
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => {
              if (confirm("Terminumfrage mit allen Rückmeldungen löschen?")) deletePoll.mutate();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Auswertung */}
      <div className="space-y-2">
        {ranking.map((r, idx) => (
          <div key={r.optionId} className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                {idx === 0 && <Badge className="bg-green-600 hover:bg-green-600">Bester Termin</Badge>}
                <span className="text-sm font-medium">{formatGermanDate(r.date)}</span>
                <span className="text-sm text-muted-foreground">{slotLabel(r.bestSlot)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="text-green-600 border-green-600">{r.yes} Ja</Badge>
                <Badge variant="outline" className="text-orange-500 border-orange-500">{r.maybe} Vielleicht</Badge>
                <Badge variant="outline" className="text-destructive border-destructive">{r.no} Nein</Badge>
              </div>
            </div>
            <div className="flex gap-3 text-xs text-muted-foreground">
              {TIME_SLOTS.map((s) => (
                <span key={s}>
                  {slotLabel(s)}: <strong>{r.slotAvailability[s]}</strong>
                </span>
              ))}
            </div>
            {onApplyDate && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => onApplyDate(r.date, `${r.bestSlot}:00`)}
              >
                <CheckCircle2 className="h-4 w-4" /> Diesen Termin übernehmen
              </Button>
            )}
          </div>
        ))}
        {ranking.length === 0 && (
          <p className="text-sm text-muted-foreground">Noch keine Terminvorschläge.</p>
        )}
      </div>

      {/* Wer hat wie geantwortet */}
      {owners.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left">
                <th className="py-1 pr-3 font-medium">Eigentümer</th>
                {(options as any[]).map((o) => (
                  <th key={o.id} className="py-1 px-2 font-medium whitespace-nowrap">
                    {new Date(o.proposed_date + "T00:00:00").toLocaleDateString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </th>
                ))}
                <th className="py-1 pl-2 font-medium">Anmerkung</th>
              </tr>
            </thead>
            <tbody>
              {owners.map((o) => (
                <tr key={o.id} className="border-b last:border-0">
                  <td className="py-1 pr-3 whitespace-nowrap">{o.name}</td>
                  {(options as any[]).map((opt) => {
                    const r = responses.find((x) => x.option_id === opt.id && x.contact_id === o.id);
                    const color =
                      r?.choice === "yes"
                        ? "text-green-600"
                        : r?.choice === "maybe"
                        ? "text-orange-500"
                        : r?.choice === "no"
                        ? "text-destructive"
                        : "text-muted-foreground";
                    const label =
                      r?.choice === "yes"
                        ? `Ja${r.earliest_time ? ` (${r.earliest_time}:00)` : ""}`
                        : r?.choice === "maybe"
                        ? `Vlt.${r.earliest_time ? ` (${r.earliest_time}:00)` : ""}`
                        : r?.choice === "no"
                        ? "Nein"
                        : "–";
                    return (
                      <td key={opt.id} className={`py-1 px-2 whitespace-nowrap ${color}`}>
                        {label}
                      </td>
                    );
                  })}
                  <td className="py-1 pl-2 text-muted-foreground">{noteByContact[o.id] || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
