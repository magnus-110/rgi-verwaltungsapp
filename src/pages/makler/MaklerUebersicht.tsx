import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronRight, Home, ImageOff, PhoneCall, Plus, Sparkles, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { MaklerGuard, SeitenKopf, StatusBadge, LeerHinweis } from "@/components/broker/MaklerUi";
import { NeuesObjektDialog } from "@/components/broker/MaklerDialoge";
import {
  leadAnzahl,
  titelbildPfad,
  useBrokerAccess,
  useBrokerLeads,
  useBrokerProperties,
  useMaklerTermine,
} from "@/hooks/useMakler";
import { energieFehlt, fotoUrl, istStill, leadName, preisText, artLabel } from "@/lib/makler";
import { cn } from "@/lib/utils";

function begruessung(): string {
  const h = new Date().getHours();
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  return "Guten Abend";
}

function istHeute(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

interface Aufgabe {
  key: string;
  icon: typeof Home;
  farbe: string;
  text: string;
  unter: string;
  link: string;
  aktion: string;
}

export default function MaklerUebersicht() {
  return (
    <MaklerGuard>
      <Inhalt />
    </MaklerGuard>
  );
}

function Inhalt() {
  const { userId, profile } = useBrokerAccess();
  const [nurMeine, setNurMeineState] = useState<boolean>(() => {
    try { return localStorage.getItem("makler.nurMeine") === "1"; } catch { return false; }
  });
  const setNurMeine = (v: boolean) => {
    setNurMeineState(v);
    try { localStorage.setItem("makler.nurMeine", v ? "1" : "0"); } catch { /* egal */ }
  };
  const [neuOffen, setNeuOffen] = useState(false);

  const { data: alleObjekte = [], isLoading: lo } = useBrokerProperties();
  const { data: alleLeads = [], isLoading: ll } = useBrokerLeads();
  const { data: alleTermine = [] } = useMaklerTermine(14);

  const objekte = useMemo(
    () => (nurMeine ? alleObjekte.filter((o) => o.assigned_to === userId) : alleObjekte),
    [alleObjekte, nurMeine, userId],
  );
  const objektIds = useMemo(() => new Set(objekte.map((o) => o.id)), [objekte]);
  const leads = useMemo(() => alleLeads.filter((l) => objektIds.has(l.property_id)), [alleLeads, objektIds]);
  const termine = useMemo(
    () => alleTermine.filter((t) => t.broker_property_id && objektIds.has(t.broker_property_id)),
    [alleTermine, objektIds],
  );
  const titelVon = useMemo(() => new Map(alleObjekte.map((o) => [o.id, o.title])), [alleObjekte]);

  const inWoche = Date.now() + 7 * 86_400_000;
  const kpis = [
    { label: "In Vermarktung", wert: objekte.filter((o) => o.status === "vermarktung").length, icon: Home, link: "/makler/objekte" },
    { label: "Neue Interessenten", wert: leads.filter((l) => l.status === "neu").length, icon: UserPlus, link: "/makler/interessenten" },
    { label: "Besichtigungen diese Woche", wert: termine.filter((t) => new Date(t.start_datetime).getTime() < inWoche).length, icon: CalendarDays, link: "/calendar" },
    { label: "Reserviert", wert: objekte.filter((o) => o.status === "reserviert").length, icon: Sparkles, link: "/makler/objekte" },
  ];

  const aufgaben: Aufgabe[] = useMemo(() => {
    const a: Aufgabe[] = [];
    for (const t of termine.filter((t) => istHeute(t.start_datetime))) {
      a.push({
        key: `t-${t.id}`,
        icon: CalendarDays,
        farbe: "bg-amber-100 text-amber-800",
        text: t.title,
        unter: `Heute um ${new Date(t.start_datetime).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`,
        link: t.broker_lead_id ? `/makler/interessenten/${t.broker_lead_id}` : `/makler/objekte/${t.broker_property_id}`,
        aktion: "Öffnen",
      });
    }
    for (const l of leads.filter((l) => l.status === "neu")) {
      a.push({
        key: `n-${l.id}`,
        icon: UserPlus,
        farbe: "bg-blue-100 text-blue-800",
        text: `Neue Anfrage: ${leadName(l)}`,
        unter: titelVon.get(l.property_id) ?? "",
        link: `/makler/interessenten/${l.id}`,
        aktion: "Melden",
      });
    }
    for (const l of leads) {
      const still = istStill(l);
      if (still == null) continue;
      a.push({
        key: `s-${l.id}`,
        icon: PhoneCall,
        farbe: "bg-red-100 text-red-800",
        text: `${leadName(l)} – nachfassen?`,
        unter: `Seit ${still} Tagen nichts gehört · ${titelVon.get(l.property_id) ?? ""}`,
        link: `/makler/interessenten/${l.id}`,
        aktion: "Ansehen",
      });
    }
    for (const o of objekte.filter((o) => o.status === "vermarktung")) {
      const fehlt: string[] = [];
      if ((o.broker_property_images ?? []).length === 0) fehlt.push("Fotos");
      if (energieFehlt(o)) fehlt.push("Energieausweis");
      if (fehlt.length === 0) continue;
      a.push({
        key: `o-${o.id}`,
        icon: ImageOff,
        farbe: "bg-muted text-muted-foreground",
        text: `${o.title} – ergänzen`,
        unter: `Es fehlen: ${fehlt.join(", ")}`,
        link: `/makler/objekte/${o.id}`,
        aktion: "Ergänzen",
      });
    }
    return a;
  }, [termine, leads, objekte, titelVon]);

  const meine = alleObjekte.filter((o) => o.assigned_to === userId && o.status !== "abgeschlossen");
  const laden = lo || ll;

  return (
    <div className="max-w-6xl mx-auto">
      <SeitenKopf
        titel={`${begruessung()}${profile?.first_name ? `, ${profile.first_name}` : ""}`}
        unter="Das steht im Makler-Bereich an."
        rechts={
          <>
            <div className="flex items-center gap-2 rounded-lg border bg-card px-3 min-h-11">
              <Switch id="nur-meine" checked={nurMeine} onCheckedChange={setNurMeine} />
              <Label htmlFor="nur-meine" className="cursor-pointer">Nur meine Objekte</Label>
            </div>
            <Button className="h-11" onClick={() => setNeuOffen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />Neues Objekt
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {kpis.map((k) => (
          <Link key={k.label} to={k.link} className="rounded-xl border bg-card p-4 hover:border-primary/40 transition-colors min-h-[96px]">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs sm:text-sm font-medium leading-tight">{k.label}</span>
              <k.icon className="h-4 w-4 shrink-0" />
            </div>
            <div className="font-display text-3xl font-semibold mt-2 text-foreground">{laden ? "–" : k.wert}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        <section>
          <h2 className="font-display text-lg font-semibold mb-3">Heute zu tun</h2>
          {laden ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : aufgaben.length === 0 ? (
            <LeerHinweis icon={Sparkles} titel="Alles erledigt" text="Gerade gibt es nichts, das auf Sie wartet." />
          ) : (
            <ul className="rounded-xl border bg-card divide-y">
              {aufgaben.map((a) => (
                <li key={a.key}>
                  <Link to={a.link} className="flex items-center gap-3 px-4 py-3 min-h-[60px] hover:bg-muted/50 transition-colors">
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", a.farbe)}>
                      <a.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">{a.text}</span>
                      {a.unter && <span className="block text-xs text-muted-foreground truncate">{a.unter}</span>}
                    </span>
                    <span className="hidden sm:inline text-sm font-medium text-primary">{a.aktion}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold">Meine Objekte</h2>
            <Link to="/makler/objekte" className="text-sm text-primary font-medium min-h-11 flex items-center">Alle ansehen</Link>
          </div>
          {laden ? (
            <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          ) : meine.length === 0 ? (
            <LeerHinweis icon={Home} titel="Keine eigenen Objekte" text="Objekte, für die Sie zuständig sind, erscheinen hier." />
          ) : (
            <ul className="space-y-2">
              {meine.slice(0, 8).map((o) => {
                const bild = titelbildPfad(o);
                return (
                  <li key={o.id}>
                    <Link to={`/makler/objekte/${o.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-2 pr-3 hover:border-primary/40 transition-colors">
                      <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-muted flex items-center justify-center">
                        {bild ? <img src={fotoUrl(bild)} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Home className="h-5 w-5 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{o.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {artLabel(o.listing_type)} · {o.city || "Ort fehlt"} · {preisText(o)}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <StatusBadge status={o.status} className="text-[11px] py-0" />
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="h-3 w-3" />{leadAnzahl(o)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <NeuesObjektDialog open={neuOffen} onOpenChange={setNeuOffen} />
    </div>
  );
}
