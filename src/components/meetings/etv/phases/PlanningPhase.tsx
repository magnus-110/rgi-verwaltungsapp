import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { berlinDateInputValue, berlinLocalToIso, berlinTimeInputValue } from "@/lib/germanDateTime";
import { invitationDeadline } from "@/lib/etvPhase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AgendaItemEditor } from "../../AgendaItemEditor";
import { MeetingDatePollPanel } from "../../MeetingDatePollPanel";
import { VotingHeadsPanel } from "../../VotingHeadsPanel";
import { Accordion, EtvCard, Segmented } from "../ui";
import { TopicImportButton } from "../TopicImportButton";
import { useWegBuildings } from "../useEtvData";

interface Props {
  meeting: any | null;
  initialBuildingId?: string;
  initialKind?: "ordentlich" | "ausserordentlich";
  onCreated: (id: string) => void;
}

const PRINCIPLES = [
  { key: "headcount", title: "Kopfprinzip", text: "Jeder Eigentümer hat eine Stimme – egal wie viele Einheiten.", tag: "Gesetzlicher Regelfall (§ 25 Abs. 2 WEG)", bars: [30, 30, 30, 30] },
  { key: "mea", title: "Nach Anteilen (MEA)", text: "Stimmgewicht nach Miteigentumsanteilen.", tag: "Nur wenn die Teilungserklärung es regelt", bars: [10, 26, 18, 30] },
  { key: "sqm", title: "Nach Wohnfläche", text: "Stimmgewicht nach Quadratmetern der Einheit.", tag: "Nur wenn die Teilungserklärung es regelt", bars: [16, 22, 12, 30] },
] as const;

const PRINCIPLE_LABEL: Record<string, string> = { headcount: "Kopfprinzip", mea: "Nach Anteilen (MEA)", sqm: "Nach Wohnfläche" };

export const PlanningPhase = ({ meeting, initialBuildingId, initialKind = "ordentlich", onCreated }: Props) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: buildings = [] } = useWegBuildings();
  const isNew = !meeting;

  // Formular
  const [buildingId, setBuildingId] = useState<string>(meeting?.building_id || initialBuildingId || "");
  const [kind, setKind] = useState<"ordentlich" | "ausserordentlich">(
    meeting
      ? (meeting.meeting_kind === "ausserordentlich" || meeting.meeting_kind === "ordentlich" ? meeting.meeting_kind : /außerordentlich/i.test(meeting.title || "") ? "ausserordentlich" : "ordentlich")
      : initialKind,
  );
  const [title, setTitle] = useState<string>(
    meeting?.title || (initialKind === "ausserordentlich" ? "Außerordentliche Eigentümerversammlung" : `Ordentliche Eigentümerversammlung ${new Date().getFullYear()}`),
  );
  const [location, setLocation] = useState<string>(meeting?.location || "");
  const [chair, setChair] = useState<string>(meeting?.meeting_chair || "");
  const [minutes, setMinutes] = useState<string>(meeting?.minutes_taker || "");
  const [notes, setNotes] = useState<string>(meeting?.notes || "");
  const [date, setDate] = useState<string>(meeting?.meeting_date ? berlinDateInputValue(meeting.meeting_date) : "");
  const [time, setTime] = useState<string>(meeting?.meeting_date ? berlinTimeInputValue(meeting.meeting_date) : "17:00");
  const [principle, setPrinciple] = useState<string>(meeting?.default_voting_principle || "headcount");
  const [basis, setBasis] = useState<string>(meeting?.voting_basis_note || "");
  const [saving, setSaving] = useState(false);

  // Abschnitte: neue Versammlung → offen; bestehende → eingeklappt (Tagesordnung bekommt Platz)
  const [open, setOpen] = useState(() => {
    let poll = false;
    try { poll = !!sessionStorage.getItem("etv-open-poll"); } catch { /* egal */ }
    return { g: isNew, t: isNew || poll, a: false };
  });
  const allClosed = !open.g && !open.t && !open.a;

  const { data: hasPoll } = useQuery({
    queryKey: ["etv-date-poll-exists", meeting?.id],
    enabled: !!meeting?.id,
    queryFn: async () => {
      const { count } = await supabase.from("etv_date_polls").select("id", { count: "exact", head: true }).eq("meeting_id", meeting.id);
      return (count || 0) > 0;
    },
  });
  const [dateMode, setDateMode] = useState<"fest" | "umfrage">(() => {
    try {
      if (sessionStorage.getItem("etv-open-poll")) { sessionStorage.removeItem("etv-open-poll"); return "umfrage"; }
    } catch { /* egal */ }
    return "fest";
  });
  useEffect(() => { if (hasPoll) setDateMode("umfrage"); }, [hasPoll]);

  const { data: agendaCount = 0 } = useQuery({
    queryKey: ["etv-agenda-items", meeting?.id, "count"],
    enabled: !!meeting?.id,
    queryFn: async () => {
      const { count } = await supabase.from("etv_agenda_items").select("id", { count: "exact", head: true }).eq("meeting_id", meeting.id);
      return count || 0;
    },
  });

  const { data: heads } = useQuery({
    queryKey: ["etv-heads-summary", meeting?.id],
    enabled: !!meeting?.id,
    queryFn: async () => {
      const { data } = await supabase.from("etv_attendees").select("head_weight").eq("meeting_id", meeting.id);
      const rows = data || [];
      return { units: rows.length, heads: rows.reduce((s: number, r: any) => s + (r.head_weight === null ? 1 : Number(r.head_weight)), 0) };
    },
  });

  // Ort aus der Gebäudeübersicht übernehmen
  const building = buildings.find((b) => b.id === buildingId);
  useEffect(() => {
    if (!meeting && building && !location) setLocation(building.etv_default_location || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building?.id]);

  // Titel folgt der Art, solange er nicht frei geändert wurde
  const setKindAndTitle = (k: "ordentlich" | "ausserordentlich") => {
    setKind(k);
    const y = date ? date.slice(0, 4) : String(new Date().getFullYear());
    if (/^(Ordentliche|Außerordentliche) Eigentümerversammlung/.test(title) || !title) {
      setTitle(`${k === "ordentlich" ? "Ordentliche" : "Außerordentliche"} Eigentümerversammlung${k === "ordentlich" ? ` ${y}` : ""}`);
    }
  };

  const save = async (patch: Record<string, any> = {}, quiet = false) => {
    if (!buildingId) { toast({ title: "Bitte eine Liegenschaft wählen", variant: "destructive" }); return null; }
    setSaving(true);
    try {
      const payload: any = {
        title: title.trim() || "Eigentümerversammlung",
        building_id: buildingId,
        meeting_date: date ? berlinLocalToIso(date, time || "00:00") : null,
        location: location.trim() || null,
        meeting_chair: chair.trim() || null,
        minutes_taker: minutes.trim() || null,
        notes: notes.trim() || null,
        default_voting_principle: principle,
        voting_basis_note: basis.trim() || null,
        meeting_kind: kind,
        ...patch,
      };
      if (meeting?.id) {
        const { error } = await (supabase as any).from("etv_meetings").update(payload).eq("id", meeting.id);
        if (error) throw error;
        if (!quiet) toast({ title: "Gespeichert" });
        qc.invalidateQueries({ queryKey: ["etv-meeting", meeting.id] });
        qc.invalidateQueries({ queryKey: ["etv-meetings"] });
        return meeting.id as string;
      }
      const { data, error } = await (supabase as any)
        .from("etv_meetings")
        .insert({ ...payload, created_by: profile?.user_id, status: "draft" })
        .select("id")
        .single();
      if (error) throw error;
      toast({ title: "Versammlung angelegt" });
      qc.invalidateQueries({ queryKey: ["etv-meetings"] });
      onCreated(data.id);
      return data.id as string;
    } catch (e: any) {
      toast({ title: "Fehler beim Speichern", description: e?.message, variant: "destructive" });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const applyPrincipleToAll = async () => {
    if (!meeting?.id) return;
    const { error } = await supabase
      .from("etv_agenda_items")
      .update({ voting_principle: principle })
      .eq("meeting_id", meeting.id)
      .neq("requires_resolution", false)
      .neq("category", "geschaeftsbeschluss");
    if (error) { toast({ title: "Fehler", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["etv-agenda-items", meeting.id] });
    toast({ title: `${PRINCIPLE_LABEL[principle]} für alle Punkte übernommen` });
  };

  const deadline = date ? invitationDeadline(`${date}T12:00:00`) : null;

  const summaryG = [kind === "ordentlich" ? "Ordentlich" : "Außerordentlich", location || "Ort offen", chair ? `Leitung: ${chair}` : null].filter(Boolean).join(" · ");
  const summaryT = date
    ? `${new Date(`${date}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}, ${time} Uhr${hasPoll ? " · aus Terminumfrage" : ""}`
    : hasPoll ? "Terminumfrage läuft – Termin noch nicht übernommen" : "Termin offen";
  const summaryA = `${PRINCIPLE_LABEL[principle] || principle}${principle === "headcount" && heads?.units ? ` · ${heads.heads} Köpfe aus ${heads.units} Einheiten` : ""} · einfache Mehrheit`;

  const toggleAll = () => setOpen(allClosed ? { g: true, t: true, a: true } : { g: false, t: false, a: false });

  const settings = (
    <div className={cn("grid items-start gap-4", allClosed ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1")}>
      {/* Grunddaten */}
      <Accordion title="Grunddaten" summary={summaryG} open={open.g} onToggle={() => setOpen((o) => ({ ...o, g: !o.g }))}>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Liegenschaft</Label>
            <Select value={buildingId} onValueChange={setBuildingId} disabled={!isNew}>
              <SelectTrigger className="h-[42px]"><SelectValue placeholder="Liegenschaft wählen …" /></SelectTrigger>
              <SelectContent>
                {buildings.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Art</Label>
            <Segmented
              className="flex h-[42px] w-full"
              value={kind}
              onChange={setKindAndTitle}
              options={[{ value: "ordentlich", label: "Ordentlich" }, { value: "ausserordentlich", label: "Außerordentlich" }]}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="etv-title">Bezeichnung</Label>
            <Input id="etv-title" className="h-[42px]" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="etv-ort">Ort</Label>
            <Input id="etv-ort" className="h-[42px]" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="z. B. Gasthof, Nebenzimmer" />
            {building?.etv_default_location ? (
              <p className="text-xs text-muted-foreground">
                Vorschlag aus der Gebäudeübersicht: „{building.etv_default_location}“
                {location !== building.etv_default_location && (
                  <button type="button" className="ml-1.5 font-semibold text-primary" onClick={() => setLocation(building.etv_default_location || "")}>übernehmen</button>
                )}
              </p>
            ) : buildingId ? (
              <p className="text-xs text-muted-foreground">Tipp: Den üblichen Ort kannst du in der Gebäudeübersicht unter „Allgemeine Infos“ hinterlegen.</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="etv-chair">Versammlungsleitung</Label>
            <Input id="etv-chair" className="h-[42px]" value={chair} onChange={(e) => setChair(e.target.value)} placeholder="Name eintragen" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="etv-minutes">Protokoll</Label>
            <Input id="etv-minutes" className="h-[42px]" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Name eintragen" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="etv-notes">Interne Notizen</Label>
            <Textarea id="etv-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => save()} disabled={saving || !buildingId} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isNew ? "Versammlung anlegen" : "Speichern"}
          </Button>
        </div>
      </Accordion>

      {/* Termin */}
      <Accordion title="Termin" summary={summaryT} open={open.t} onToggle={() => setOpen((o) => ({ ...o, t: !o.t }))}>
        <div className="space-y-3.5">
          <Segmented
            value={dateMode}
            onChange={async (v) => {
              setDateMode(v);
              if (v === "umfrage" && isNew) {
                try { sessionStorage.setItem("etv-open-poll", "1"); } catch { /* egal */ }
                await save({}, true);
              }
            }}
            options={[{ value: "fest", label: "Fester Termin" }, { value: "umfrage", label: "Terminumfrage" }]}
          />
          {dateMode === "umfrage" && (
            meeting?.id && buildingId ? (
              <MeetingDatePollPanel
                meetingId={meeting.id}
                buildingId={buildingId}
                appliedDate={date || undefined}
                onApplyDate={async (d, t) => {
                  setDate(d);
                  setTime(t);
                  await save({ meeting_date: berlinLocalToIso(d, t) }, true);
                  toast({ title: "Termin übernommen", description: `${new Date(`${d}T12:00:00`).toLocaleDateString("de-DE")}, ${t} Uhr` });
                }}
              />
            ) : (
              <p className="rounded-xl bg-muted/40 px-3.5 py-3 text-sm text-muted-foreground">Bitte zuerst eine Liegenschaft wählen – die Versammlung wird dann automatisch angelegt.</p>
            )
          )}
          <div className="grid grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="etv-date">Datum</Label>
              <Input id="etv-date" type="date" className="h-[42px]" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="etv-time">Uhrzeit</Label>
              <Input id="etv-time" type="time" className="h-[42px]" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          {deadline && (
            <p className="text-[13px] text-muted-foreground">
              Die Einladung muss spätestens am <strong className="text-foreground">{deadline.toLocaleDateString("de-DE")}</strong> zugehen (3 Wochen, § 24 Abs. 4 WEG).
            </p>
          )}
          <div className="flex justify-end">
            <Button onClick={() => save()} disabled={saving || !buildingId} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Speichern
            </Button>
          </div>
        </div>
      </Accordion>

      {/* Abstimmung */}
      <Accordion title="Wie wird abgestimmt?" summary={summaryA} open={open.a} onToggle={() => setOpen((o) => ({ ...o, a: !o.a }))}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {PRINCIPLES.map((p) => {
              const on = principle === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={on}
                  onClick={async () => { setPrinciple(p.key); if (meeting?.id) await save({ default_voting_principle: p.key }, true); }}
                  className={cn("flex flex-col gap-2.5 rounded-2xl border p-3.5 text-left transition-colors", on ? "border-2 border-primary bg-primary/5" : "hover:bg-muted/40")}
                >
                  <span className="flex h-[30px] items-end gap-1">
                    {p.bars.map((h, i) => <span key={i} className={cn("block w-3 rounded-[3px]", on ? "bg-primary" : "bg-muted-foreground/25")} style={{ height: h }} />)}
                  </span>
                  <span className="text-[15px] font-semibold">{p.title}</span>
                  <span className="text-xs leading-snug text-muted-foreground">{p.text}</span>
                  <span className={cn("text-[11px] font-semibold", p.key === "headcount" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>{p.tag}</span>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="etv-basis">Grundlage</Label>
              <Input id="etv-basis" className="h-[42px]" value={basis} onChange={(e) => setBasis(e.target.value)} onBlur={() => meeting?.id && save({}, true)} placeholder="z. B. Teilungserklärung § …" />
            </div>
            <div className="space-y-1.5">
              <Label>Mehrheit (Standard)</Label>
              <div className="flex h-[42px] items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">Einfache Mehrheit der abgegebenen Stimmen</div>
            </div>
          </div>
          {meeting?.id && agendaCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 px-3.5 py-2.5 text-[13px]">
              <span className="text-muted-foreground">Bereits angelegte Punkte behalten ihre eigene Einstellung.</span>
              <Button size="sm" variant="outline" onClick={applyPrincipleToAll}>Auf alle Punkte anwenden</Button>
            </div>
          )}
          {principle === "headcount" && meeting?.id && buildingId && (
            <div className="rounded-2xl border p-4">
              <VotingHeadsPanel meetingId={meeting.id} buildingId={buildingId} />
            </div>
          )}
        </div>
      </Accordion>
    </div>
  );

  return (
    <div className="space-y-3">
      {!isNew && (
        <div className="flex justify-end">
          <button type="button" onClick={toggleAll} className="text-[13px] font-semibold text-primary">
            {allClosed ? "Einstellungen ausklappen" : "Einstellungen einklappen – Tagesordnung groß"}
          </button>
        </div>
      )}
      <div className={cn("grid items-start gap-5", allClosed || isNew ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-2")}>
        {settings}
        {meeting?.id ? (
          <EtvCard className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
              <div>
                <h2 className="text-[17px] font-semibold">Tagesordnung</h2>
                <p className="text-[13px] text-muted-foreground">{agendaCount} {agendaCount === 1 ? "Punkt" : "Punkte"} · Punkt anklicken zum Bearbeiten · Reihenfolge per Ziehen</p>
              </div>
              <TopicImportButton meetingId={meeting.id} buildingId={meeting.building_id} votingPrinciple={principle} />
            </div>
            <div className="p-4">
              <AgendaItemEditor meetingId={meeting.id} buildingId={meeting.building_id} defaultPrinciple={principle} />
            </div>
          </EtvCard>
        ) : (
          <EtvCard className="px-5 py-8 text-center text-sm text-muted-foreground">
            Nach dem Anlegen erstellst du hier die Tagesordnung – auch direkt aus dem Themenspeicher.
          </EtvCard>
        )}
      </div>
    </div>
  );
};
