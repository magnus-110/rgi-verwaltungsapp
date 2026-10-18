import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Globe, Home, MapPin, Plus, Search, Smartphone, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LeerHinweis, MaklerGuard, SeitenKopf, Segmente, StatusBadge } from "@/components/broker/MaklerUi";
import { NeuesObjektDialog } from "@/components/broker/MaklerDialoge";
import {
  leadAnzahl,
  titelbildPfad,
  useBrokerAccess,
  useBrokerProperties,
  useBrokerStaff,
  type PropertyListItem,
} from "@/hooks/useMakler";
import { artLabel, fehlendeAngaben, fotoUrl, initialen, personName, preisText } from "@/lib/makler";

type Art = "alle" | "sale" | "rent";
type Stand = "aktiv" | "abgeschlossen" | "alle";
type Wer = "alle" | "ich";

function normal(t: string | null | undefined): string {
  return (t ?? "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

function lesen<T extends string>(key: string, fallback: T): T {
  try { return (localStorage.getItem(key) as T) || fallback; } catch { return fallback; }
}
function merken(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* egal */ }
}

export default function MaklerObjekte() {
  return (
    <MaklerGuard>
      <Inhalt />
    </MaklerGuard>
  );
}

function Inhalt() {
  const { userId } = useBrokerAccess();
  const { data: objekte = [], isLoading } = useBrokerProperties();
  const { nachId } = useBrokerStaff();
  const [art, setArtS] = useState<Art>(() => lesen("makler.art", "alle"));
  const [stand, setStandS] = useState<Stand>(() => lesen("makler.stand", "aktiv"));
  const [wer, setWerS] = useState<Wer>(() => lesen("makler.wer", "alle"));
  const [suche, setSuche] = useState("");
  const [neuOffen, setNeuOffen] = useState(false);
  const setArt = (v: Art) => { setArtS(v); merken("makler.art", v); };
  const setStand = (v: Stand) => { setStandS(v); merken("makler.stand", v); };
  const setWer = (v: Wer) => { setWerS(v); merken("makler.wer", v); };

  const liste = useMemo(() => {
    const s = normal(suche.trim());
    return objekte.filter((o) => {
      if (art !== "alle" && o.listing_type !== art) return false;
      if (stand === "aktiv" && o.status === "abgeschlossen") return false;
      if (stand === "abgeschlossen" && o.status !== "abgeschlossen") return false;
      if (wer === "ich" && o.assigned_to !== userId) return false;
      if (s) {
        const text = normal([o.title, o.city, o.postal_code, o.street].filter(Boolean).join(" "));
        if (!text.includes(s)) return false;
      }
      return true;
    });
  }, [objekte, art, stand, wer, suche, userId]);

  return (
    <div className="max-w-7xl mx-auto">
      <SeitenKopf
        titel="Objekte"
        unter={isLoading ? "Wird geladen…" : `${liste.length} von ${objekte.length} Objekten`}
        rechts={
          <Button className="h-11" onClick={() => setNeuOffen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />Neues Objekt
          </Button>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center mb-5">
        <Segmente
          className="w-full lg:w-auto"
          wert={art}
          onChange={setArt}
          optionen={[{ key: "alle", label: "Alle" }, { key: "sale", label: "Kauf" }, { key: "rent", label: "Miete" }]}
        />
        <div className="grid grid-cols-2 gap-3 lg:flex">
          <Select value={stand} onValueChange={(v) => setStand(v as Stand)}>
            <SelectTrigger className="h-11 lg:w-44" aria-label="Stand"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="aktiv" className="min-h-10">Aktuelle</SelectItem>
              <SelectItem value="abgeschlossen" className="min-h-10">Abgeschlossen</SelectItem>
              <SelectItem value="alle" className="min-h-10">Alle</SelectItem>
            </SelectContent>
          </Select>
          <Select value={wer} onValueChange={(v) => setWer(v as Wer)}>
            <SelectTrigger className="h-11 lg:w-44" aria-label="Zuständig"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle" className="min-h-10">Alle Zuständigen</SelectItem>
              <SelectItem value="ich" className="min-h-10">Nur meine</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="relative lg:ml-auto lg:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="h-11 pl-9 pr-10"
            placeholder="Suchen: Titel, Ort, PLZ, Straße"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
          />
          {suche && (
            <button type="button" aria-label="Suche leeren" onClick={() => setSuche("")} className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-72 rounded-xl" />)}
        </div>
      ) : liste.length === 0 ? (
        <LeerHinweis
          icon={Home}
          titel={objekte.length === 0 ? "Noch keine Objekte" : "Keine Treffer"}
          text={objekte.length === 0 ? "Legen Sie Ihr erstes Objekt an." : "Ändern Sie die Filter oder die Suche."}
          aktion={objekte.length === 0 ? <Button className="h-11" onClick={() => setNeuOffen(true)}><Plus className="h-4 w-4 mr-1.5" />Neues Objekt</Button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {liste.map((o) => <ObjektKarte key={o.id} o={o} zustaendig={o.assigned_to ? nachId.get(o.assigned_to) : undefined} />)}
        </div>
      )}

      <NeuesObjektDialog open={neuOffen} onOpenChange={setNeuOffen} />
    </div>
  );
}

function ObjektKarte({ o, zustaendig }: { o: PropertyListItem; zustaendig?: Parameters<typeof personName>[0] }) {
  const bild = titelbildPfad(o);
  const fehlt = o.status === "entwurf" ? fehlendeAngaben(o, o.broker_property_images?.length ?? 0) : [];
  const leads = leadAnzahl(o);
  return (
    <Link
      to={`/makler/objekte/${o.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card hover:border-primary/40 hover:shadow-sm transition-all"
    >
      <div className="relative aspect-[16/10] bg-muted">
        {bild ? (
          <img src={fotoUrl(bild)} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Home className="h-10 w-10 opacity-40" />
          </div>
        )}
        <div className="absolute left-3 top-3 flex gap-1.5">
          <StatusBadge status={o.status} className="bg-background/95 shadow-sm" />
        </div>
        <span className="absolute right-3 top-3 rounded-full bg-background/95 px-2.5 py-0.5 text-xs font-semibold shadow-sm">
          {artLabel(o.listing_type)}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="font-semibold leading-snug text-foreground line-clamp-2">{o.title}</div>
        <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{[o.postal_code, o.city].filter(Boolean).join(" ") || "Ort fehlt"}</span>
        </div>
        <div className="mt-2 font-display text-lg font-semibold">{preisText(o)}</div>
        {fehlt.length > 0 && (
          <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-xs text-amber-800">
            Es fehlen: {fehlt.join(", ")}
          </div>
        )}
        <div className="mt-auto pt-3 flex items-center gap-1.5 flex-wrap">
          {o.show_on_website && (
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
              <Globe className="h-3 w-3" />Website
            </span>
          )}
          {o.show_in_portal && (
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
              <Smartphone className="h-3 w-3" />Nutzer-App
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground ml-1" title="Interessenten">
            <Users className="h-3.5 w-3.5" />{leads}
          </span>
          {zustaendig && (
            <span
              className="ml-auto flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground"
              title={`Zuständig: ${personName(zustaendig)}`}
            >
              {initialen(zustaendig)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
