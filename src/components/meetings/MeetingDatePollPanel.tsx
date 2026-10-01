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
import { Calendar } from "@/components/ui/calendar";
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
  /** Bereits übernommener Termin (YYYY-MM-DD) – wird markiert. */
  appliedDate?: string;
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

const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const MeetingDatePollPanel = ({ meetingId, buildingId, onApplyDate, appliedDate }: Props) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
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
      const clean = selectedDates.map(toIso);
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
      setSelectedDates([]);
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
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed p-4">
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
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5" /> Terminumfrage starten
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-6 md:grid-cols-[auto,1fr]">
              <div className="space-y-2">
                <Label>Tage auswählen</Label>
                <div className="rounded-xl border bg-card p-2 shadow-sm">
                  <Calendar
                    mode="multiple"
                    selected={selectedDates}
                    onSelect={(d) => setSelectedDates((d as Date[]) || [])}
                    disabled={(date) => {
                      const day = date.getDay();
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      return day === 0 || day === 6 || date < today;
                    }}
                    weekStartsOn={1}
                    className="p-0 [&_.rdp-day]:h-11 [&_.rdp-day]:w-11 [&_button]:text-base"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Wochenenden sind nicht auswählbar.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Ausgewählte Tage ({selectedDates.length})</Label>
                  {selectedDates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Noch keine Tage gewählt.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {[...selectedDates]
                        .sort((a, b) => a.getTime() - b.getTime())
                        .map((d) => (
                          <Badge
                            key={d.toISOString()}
                            variant="secondary"
                            className="gap-1 py-1 pl-3 pr-2 text-sm cursor-pointer"
                            onClick={() =>
                              setSelectedDates((prev) =>
                                prev.filter((x) => x.toDateString() !== d.toDateString()),
                              )
                            }
                          >
                            {formatShortDate(toIso(d))}
                            <Trash2 className="h-3.5 w-3.5 opacity-60" />
                          </Badge>
                        ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Abfrage läuft bis</Label>
                  <Input type="date" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Hinweistext (optional)</Label>
                  <Textarea rows={3} value={introText} onChange={(e) => setIntroText(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Abbrechen
              </Button>
              <Button
                onClick={() => createPoll.mutate()}
                disabled={createPoll.isPending || selectedDates.length < 2}
              >
                Starten
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    );
  }

  const isClosed = poll.status === "closed" || new Date(poll.closes_at) < new Date();
  const maxCount = Math.max(1, respondedContacts);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 px-3.5 py-2.5">
        <span className="text-[13px] text-foreground/80">
          <strong className="font-semibold text-foreground">{isClosed ? "Abgeschlossen" : "Läuft"}</strong>
          {isClosed ? " · " : " bis "}{formatShortDate(poll.closes_at)} · {respondedContacts} von {owners.length} Eigentümern haben geantwortet
        </span>
        <div className="flex gap-2">
          {!isClosed && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setStatus.mutate("closed")}>
              <Lock className="h-3.5 w-3.5" /> Umfrage schließen
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-destructive"
            onClick={() => {
              if (confirm("Terminumfrage mit allen Rückmeldungen löschen?")) deletePoll.mutate();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {ranking.map((r, idx) => {
          const applied = appliedDate === r.date;
          return (
            <div
              key={r.optionId}
              className={`space-y-2.5 rounded-xl border px-4 py-3 ${applied ? "border-2 border-primary bg-primary/5" : "bg-card"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <span className="flex items-center gap-2">
                  {idx === 0 && r.yes > 0 && (
                    <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[11px] font-bold text-white">Bester Termin</span>
                  )}
                  <span className="text-[15px] font-semibold">{formatGermanDate(r.date)}</span>
                  <span className="text-[13px] text-muted-foreground">{slotLabel(r.bestSlot)}</span>
                </span>
                {onApplyDate && (
                  <Button
                    size="sm"
                    variant={applied ? "default" : "outline"}
                    className="h-8"
                    onClick={() => onApplyDate(r.date, `${r.bestSlot}:00`)}
                  >
                    {applied ? <><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Übernommen</> : "Diesen Termin übernehmen"}
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <span className="flex h-2 overflow-hidden rounded-full bg-muted">
                  <span className="block bg-emerald-600" style={{ width: `${(r.yes / maxCount) * 100}%` }} />
                  <span className="block bg-amber-400" style={{ width: `${(r.maybe / maxCount) * 100}%` }} />
                  <span className="block bg-red-600" style={{ width: `${(r.no / maxCount) * 100}%` }} />
                </span>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  <strong className="text-emerald-700 dark:text-emerald-400">{r.yes} Ja</strong> · {r.maybe} Vielleicht · {r.no} Nein
                </span>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {TIME_SLOTS.map((s) => (
                  <span key={s}>{slotLabel(s)}: <strong className="text-foreground/80">{r.slotAvailability[s]}</strong></span>
                ))}
              </div>
            </div>
          );
        })}
        {ranking.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Terminvorschläge.</p>}
      </div>

      {owners.length > 0 && (
        <details className="group rounded-xl border px-4 py-2.5">
          <summary className="cursor-pointer select-none text-[13px] font-semibold text-primary">Wer hat wie geantwortet?</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5 pr-3 font-semibold">Eigentümer</th>
                  {(options as any[]).map((o) => (
                    <th key={o.id} className="whitespace-nowrap px-2 py-1.5 font-semibold">
                      {new Date(o.proposed_date + "T00:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                    </th>
                  ))}
                  <th className="py-1.5 pl-2 font-semibold">Anmerkung</th>
                </tr>
              </thead>
              <tbody>
                {owners.map((o) => (
                  <tr key={o.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap py-1.5 pr-3">{o.name}</td>
                    {(options as any[]).map((opt) => {
                      const r = responses.find((x) => x.option_id === opt.id && x.contact_id === o.id);
                      const color = r?.choice === "yes" ? "text-emerald-700 dark:text-emerald-400" : r?.choice === "maybe" ? "text-amber-700 dark:text-amber-400" : r?.choice === "no" ? "text-red-700 dark:text-red-400" : "text-muted-foreground";
                      const label = r?.choice === "yes" ? `Ja${r.earliest_time ? ` (${r.earliest_time}:00)` : ""}` : r?.choice === "maybe" ? `Vlt.${r.earliest_time ? ` (${r.earliest_time}:00)` : ""}` : r?.choice === "no" ? "Nein" : "–";
                      return <td key={opt.id} className={`whitespace-nowrap px-2 py-1.5 ${color}`}>{label}</td>;
                    })}
                    <td className="py-1.5 pl-2 text-muted-foreground">{noteByContact[o.id] || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
};
