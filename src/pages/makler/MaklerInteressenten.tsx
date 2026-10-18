import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { AlertTriangle, CalendarDays, Eye, EyeOff, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { LeadBadge, LeerHinweis, MaklerGuard, QuelleChip, SeitenKopf } from "@/components/broker/MaklerUi";
import { AusgangDialog, NeuerInteressentDialog } from "@/components/broker/MaklerDialoge";
import { useBrokerAccess, useBrokerLeads, useBrokerProperties, useMaklerNeuLaden, useMaklerTermine } from "@/hooks/useMakler";
import {
  LEAD_LABEL,
  LEAD_SPALTEN,
  LEAD_STATUS,
  QUELLEN,
  db,
  fehler,
  istStill,
  kurzDatumZeit,
  leadName,
  leadStandSetzen,
  spalteVon,
  type BrokerLead,
  type LeadSpalte,
  type LeadStatus,
} from "@/lib/makler";
import { cn } from "@/lib/utils";

const KEINE: BrokerLead[] = [];

export default function MaklerInteressenten() {
  return (
    <MaklerGuard>
      <Inhalt />
    </MaklerGuard>
  );
}

function Inhalt() {
  const isMobile = useIsMobile();
  const { userId } = useBrokerAccess();
  const neuLaden = useMaklerNeuLaden();
  const { data: leadsDaten, isLoading } = useBrokerLeads();
  const leads = leadsDaten ?? KEINE;
  const { data: objekte = [] } = useBrokerProperties();
  const { data: termine = [] } = useMaklerTermine(90);
  const [objekt, setObjekt] = useState("alle");
  const [quelle, setQuelle] = useState("alle");
  const [neu, setNeu] = useState(false);
  const [ausgang, setAusgang] = useState<{ lead: BrokerLead; nurAbsage?: boolean } | null>(null);
  const [zeigeAusgeblendete, setZeigeAusgeblendete] = useState(false);
  const [alleFertigen, setAlleFertigen] = useState(false);
  // Sofort umsortieren, bis die Daten neu geladen sind.
  const [lokal, setLokal] = useState<Record<string, LeadStatus>>({});
  useEffect(() => setLokal({}), [leadsDaten]);

  const naechsteBesichtigung = useMemo(() => {
    const m = new Map<string, string>();
    const jetzt = Date.now();
    for (const t of termine) {
      if (!t.broker_lead_id || new Date(t.start_datetime).getTime() < jetzt) continue;
      if (!m.has(t.broker_lead_id)) m.set(t.broker_lead_id, t.start_datetime);
    }
    return m;
  }, [termine]);

  const liste = useMemo(
    () =>
      leads
        .map((l) => (lokal[l.id] ? { ...l, status: lokal[l.id] } : l))
        .filter((l) => (objekt === "alle" || l.property_id === objekt) && (quelle === "alle" || (l.source ?? "manuell") === quelle))
        .filter((l) => zeigeAusgeblendete || !l.archived_at),
    [leads, lokal, objekt, quelle, zeigeAusgeblendete],
  );

  const spalten = useMemo(() => {
    const s: Record<LeadSpalte, BrokerLead[]> = { neu: [], kontaktiert: [], besichtigung: [], angebot: [], abgeschlossen: [] };
    for (const l of liste) s[spalteVon(l.status)].push(l);
    return s;
  }, [liste]);

  const standSetzen = async (lead: BrokerLead, status: LeadStatus, grund?: string) => {
    if (lead.status === status) return;
    setLokal((x) => ({ ...x, [lead.id]: status }));
    try {
      await leadStandSetzen(lead.id, status, userId, grund);
      if (lead.archived_at && status !== "abschluss" && status !== "absage") {
        await db.from("broker_leads").update({ archived_at: null }).eq("id", lead.id);
      }
      toast.success(`${leadName(lead)}: ${LEAD_LABEL[status]}`);
    } catch (e) {
      setLokal((x) => {
        const n = { ...x };
        delete n[lead.id];
        return n;
      });
      fehler("Stand konnte nicht geändert werden", e);
    }
    neuLaden();
  };

  /** Wechsel in „Abgeschlossen" oder auf Absage fragt nach. */
  const wechseln = (lead: BrokerLead, ziel: LeadStatus | "abgeschlossen") => {
    if (ziel === "abgeschlossen") return setAusgang({ lead });
    if (ziel === "absage") return setAusgang({ lead, nurAbsage: true });
    void standSetzen(lead, ziel);
  };

  const onDragEnd = (r: DropResult) => {
    if (!r.destination || r.destination.droppableId === r.source.droppableId) return;
    const lead = liste.find((l) => l.id === r.draggableId);
    if (!lead) return;
    wechseln(lead, r.destination.droppableId as LeadSpalte);
  };

  const anzahlAusgeblendet = leads.filter((l) => l.archived_at).length;

  /** Abgeschlossene ausblenden (bleiben gespeichert) oder wieder einblenden. */
  const ausblenden = async (ids: string[], aus: boolean) => {
    if (ids.length === 0) return;
    const { error } = await db.from("broker_leads").update({ archived_at: aus ? new Date().toISOString() : null }).in("id", ids);
    if (error) return fehler("Konnte nicht geändert werden", error);
    toast.success(aus ? (ids.length === 1 ? "Ausgeblendet" : `${ids.length} Interessenten ausgeblendet`) : "Wieder eingeblendet");
    neuLaden();
  };

  /** In „Abgeschlossen" erst nur die neuesten zeigen, sonst wird die Spalte endlos. */
  const MAX_FERTIG = 5;
  const sichtbar = (key: LeadSpalte, l: BrokerLead[]) => (key === "abgeschlossen" && !alleFertigen ? l.slice(0, MAX_FERTIG) : l);

  const objekteMitLeads = objekte.filter((o) => leads.some((l) => l.property_id === o.id));

  return (
    <div className="max-w-[1500px] mx-auto">
      <SeitenKopf
        titel="Interessenten"
        unter={isLoading ? "Wird geladen…" : `${liste.length} Interessenten`}
        rechts={<Button className="h-11" onClick={() => setNeu(true)}><Plus className="h-4 w-4 mr-1.5" />Interessent</Button>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex gap-3 mb-5">
        <Select value={objekt} onValueChange={setObjekt}>
          <SelectTrigger className="h-11 lg:w-72" aria-label="Objekt"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle" className="min-h-10">Alle Objekte</SelectItem>
            {objekteMitLeads.map((o) => <SelectItem key={o.id} value={o.id} className="min-h-10">{o.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={quelle} onValueChange={setQuelle}>
          <SelectTrigger className="h-11 lg:w-52" aria-label="Herkunft"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle" className="min-h-10">Jede Herkunft</SelectItem>
            {QUELLEN.map((q) => <SelectItem key={q.key} value={q.key} className="min-h-10">{q.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {anzahlAusgeblendet > 0 && (
          <Button variant="ghost" className="h-11 justify-start text-muted-foreground" onClick={() => setZeigeAusgeblendete((x) => !x)}>
            {zeigeAusgeblendete ? <EyeOff className="h-4 w-4 mr-1.5" /> : <Eye className="h-4 w-4 mr-1.5" />}
            {zeigeAusgeblendete ? "Ausgeblendete verbergen" : `Ausgeblendete zeigen (${anzahlAusgeblendet})`}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-64 rounded-xl" />)}</div>
      ) : leads.length === 0 ? (
        <LeerHinweis icon={Users} titel="Noch keine Interessenten" text="Anfragen aus Website, Postfach oder Telefon erscheinen hier." />
      ) : isMobile ? (
        <div className="space-y-6">
          {LEAD_SPALTEN.map((s) => (
            <section key={s.key}>
              <h2 className="flex items-center gap-2 font-display text-base font-semibold mb-2">
                {s.label}<span className="text-sm font-normal text-muted-foreground">{spalten[s.key].length}</span>
              </h2>
              {spalten[s.key].length === 0 ? (
                <p className="text-sm text-muted-foreground px-1">Niemand</p>
              ) : (
                <div className="space-y-2">
                  {s.key === "abgeschlossen" && <AlleAusblenden leads={spalten[s.key]} onAusblenden={ausblenden} />}
                  {sichtbar(s.key, spalten[s.key]).map((l) => (
                    <div key={l.id} className="rounded-xl border bg-card">
                      <LeadKarte lead={l} besichtigung={naechsteBesichtigung.get(l.id)} onAusblenden={ausblenden} />
                      <div className="border-t px-3 py-2">
                        <Select value={l.status} onValueChange={(v) => wechseln(l, v as LeadStatus)}>
                          <SelectTrigger className="h-11" aria-label="Stand ändern"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {LEAD_STATUS.map((st) => <SelectItem key={st} value={st} className="min-h-11">{LEAD_LABEL[st]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                  {s.key === "abgeschlossen" && <MehrZeigen anzahl={spalten[s.key].length} offen={alleFertigen} onUmschalten={() => setAlleFertigen((x) => !x)} />}
                </div>
              )}
            </section>
          ))}
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="overflow-x-auto -mx-3 px-3 lg:mx-0 lg:px-0">
          <div className="grid grid-cols-5 gap-3 items-start min-w-[960px]">
            {LEAD_SPALTEN.map((s) => (
              <Droppable droppableId={s.key} key={s.key}>
                {(prov, snap) => (
                  <section
                    ref={prov.innerRef}
                    {...prov.droppableProps}
                    className={cn("rounded-xl bg-muted/60 p-2 min-h-[240px] transition-colors", snap.isDraggingOver && "bg-primary/10 ring-2 ring-primary/30")}
                  >
                    <h2 className="flex items-center justify-between px-2 py-1.5 text-sm font-semibold">
                      {s.label}
                      <span className="rounded-full bg-background px-2 text-xs font-medium text-muted-foreground">{spalten[s.key].length}</span>
                    </h2>
                    {s.key === "abgeschlossen" && <AlleAusblenden leads={spalten[s.key]} onAusblenden={ausblenden} />}
                    <div className="space-y-2 mt-1">
                      {sichtbar(s.key, spalten[s.key]).map((l, i) => (
                        <Draggable key={l.id} draggableId={l.id} index={i}>
                          {(drag, ds) => (
                            <div
                              ref={drag.innerRef}
                              {...drag.draggableProps}
                              {...drag.dragHandleProps}
                              className={cn("rounded-lg border bg-card", ds.isDragging && "shadow-lg rotate-1")}
                            >
                              <LeadKarte lead={l} besichtigung={naechsteBesichtigung.get(l.id)} onAusblenden={ausblenden} />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {prov.placeholder}
                      {s.key === "abgeschlossen" && <MehrZeigen anzahl={spalten[s.key].length} offen={alleFertigen} onUmschalten={() => setAlleFertigen((x) => !x)} />}
                    </div>
                  </section>
                )}
              </Droppable>
            ))}
          </div>
          </div>
        </DragDropContext>
      )}

      <NeuerInteressentDialog open={neu} onOpenChange={setNeu} />
      <AusgangDialog
        open={!!ausgang}
        nurAbsage={ausgang?.nurAbsage}
        onOpenChange={(o) => !o && setAusgang(null)}
        onWahl={async (status, grund) => {
          const l = ausgang?.lead;
          setAusgang(null);
          if (l) await standSetzen(l, status, grund);
        }}
      />
    </div>
  );
}

function AlleAusblenden({ leads, onAusblenden }: { leads: BrokerLead[]; onAusblenden: (ids: string[], aus: boolean) => void }) {
  const offen = leads.filter((l) => !l.archived_at);
  if (offen.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => onAusblenden(offen.map((l) => l.id), true)}
      className="mx-2 mb-1 inline-flex min-h-9 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
    >
      <EyeOff className="h-3.5 w-3.5" />Alle {offen.length} ausblenden
    </button>
  );
}

function MehrZeigen({ anzahl, offen, onUmschalten }: { anzahl: number; offen: boolean; onUmschalten: () => void }) {
  if (anzahl <= 5) return null;
  return (
    <button type="button" onClick={onUmschalten} className="w-full min-h-10 rounded-lg text-sm text-primary hover:bg-background">
      {offen ? "Weniger anzeigen" : `${anzahl - 5} weitere anzeigen`}
    </button>
  );
}

function LeadKarte({ lead, besichtigung, onAusblenden }: { lead: BrokerLead; besichtigung?: string; onAusblenden?: (ids: string[], aus: boolean) => void }) {
  const still = istStill(lead);
  const fertig = lead.status === "abschluss" || lead.status === "absage";
  return (
    <Link to={`/makler/interessenten/${lead.id}`} className="block p-3 min-h-[44px] hover:bg-muted/40 rounded-lg">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-sm leading-snug break-words">{leadName(lead)}</span>
        <span className="flex shrink-0 items-center gap-1">
          {fertig && <LeadBadge status={lead.status} />}
          {fertig && onAusblenden && (
            <button
              type="button"
              title={lead.archived_at ? "Wieder einblenden" : "Ausblenden"}
              aria-label={lead.archived_at ? "Wieder einblenden" : "Ausblenden"}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAusblenden([lead.id], !lead.archived_at); }}
              className="-m-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {lead.archived_at ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
          )}
        </span>
      </div>
      <div className="text-xs text-muted-foreground truncate mt-0.5">{lead.broker_properties?.title ?? ""}</div>
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <QuelleChip quelle={lead.source} />
        {still != null && (
          <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
            <AlertTriangle className="h-3 w-3" />{still} Tage still
          </span>
        )}
        {besichtigung && (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
            <CalendarDays className="h-3 w-3" />{kurzDatumZeit(besichtigung)}
          </span>
        )}
      </div>
    </Link>
  );
}
