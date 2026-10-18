/**
 * Nutzer-App › Mehr › Immobilien von RGI
 * Zwei Reiter: Angebote (Kacheln) und Gesuche (RGI sucht, Eigentümer sucht,
 * eigener Suchauftrag). Alles, was Eigentümer hier abschicken, landet bei RGI.
 * Solange der Hauptschalter aus ist, sehen nur RGI-Mitarbeiter diese Seite (Vorschau).
 */
import { useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Building2, Check, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PortalBlatt, PortalGruppe, PortalSeitenkopf, portalFeld } from "@/components/weg-owner/PortalListe";
import {
  PK,
  fotoUrl,
  gesuchEckdatenPortal,
  preisText,
  useMeineWohnungen,
  usePortalAngebote,
  usePortalGesuche,
  usePortalImmobilienStatus,
  zahl,
  type Angebot,
  type PortalGesuch,
} from "@/hooks/usePortalImmobilien";
import { cn } from "@/lib/utils";

const DANKE_ANFRAGE = "Wir prüfen Ihre Anfrage und melden uns.";
const DANKE_SUCHAUFTRAG = "Wir prüfen Ihre Angaben.";
const NEU_TAGE = 14;

export default function WegOwnerImmobilien() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const reiter = params.get("tab") === "gesuche" ? "gesuche" : "angebote";
  const status = usePortalImmobilienStatus();
  const { data: angebote = [], isLoading: l1 } = usePortalAngebote(status.sichtbar);
  const { data: gesuche = [], isLoading: l2 } = usePortalGesuche(status.sichtbar);
  const [angebot, setAngebot] = useState<Angebot | null>(null);
  const [gesuch, setGesuch] = useState<PortalGesuch | null>(null);
  const [suchauftrag, setSuchauftrag] = useState<PortalGesuch | "neu" | null>(null);

  if (!status.isLoading && !status.sichtbar) return <Navigate to="/weg-owner/mehr" replace />;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl md:max-w-3xl mx-auto px-4 py-5 space-y-5">
        <button type="button" onClick={() => navigate("/weg-owner/mehr")} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground -ml-1 px-1">
          <ArrowLeft className="h-4 w-4" /> Mehr
        </button>
        <PortalSeitenkopf titel="Immobilien von RGI" />
        {!status.aktiv && status.vorschau && (
          <div className="rounded-[12px] bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Vorschau – Eigentümer sehen diese Seite noch nicht. Freischalten unter Makler › Makler-Einstellungen.
          </div>
        )}

        <div className="grid grid-cols-2 gap-1 rounded-[12px] bg-muted p-1" role="tablist" aria-label="Immobilien">
          {(["angebote", "gesuche"] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={reiter === r}
              onClick={() => setParams(r === "gesuche" ? { tab: "gesuche" } : {}, { replace: true })}
              className={cn("min-h-11 rounded-[9px] text-[15px]", reiter === r ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}
            >
              {r === "angebote" ? `Angebote · ${angebote.length}` : `Gesuche · ${gesuche.length}`}
            </button>
          ))}
        </div>

        {reiter === "angebote" ? (
          l1 ? <Laden /> : angebote.length === 0 ? (
            <Leer text="Zurzeit gibt es keine Angebote. Schauen Sie gern später wieder vorbei." />
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {angebote.map((a) => <AngebotKachel key={a.id} a={a} onClick={() => setAngebot(a)} />)}
            </div>
          )
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setSuchauftrag("neu")}
              className="flex w-full min-h-[56px] items-center justify-between rounded-[12px] bg-primary px-4 text-left text-primary-foreground"
            >
              <span>
                <span className="block text-[15px] font-semibold">Suchauftrag hinzufügen</span>
                <span className="block text-[13px] opacity-90">Sie suchen selbst etwas?</span>
              </span>
              <Plus className="h-5 w-5" />
            </button>
            {l2 ? <Laden /> : gesuche.length === 0 ? (
              <Leer text="Zurzeit gibt es keine Gesuche." />
            ) : (
              gesuche.map((g) => (
                <GesuchKarte
                  key={g.id}
                  g={g}
                  onOeffnen={() => (g.eigen ? setSuchauftrag(g) : setGesuch(g))}
                />
              ))
            )}
          </div>
        )}
      </div>

      {angebot && <AngebotBlatt angebot={angebot} onClose={() => setAngebot(null)} />}
      {gesuch && <GesuchBlatt gesuch={gesuch} onClose={() => setGesuch(null)} />}
      {suchauftrag && (
        <SuchauftragBlatt
          key={suchauftrag === "neu" ? "neu" : suchauftrag.id}
          vorhanden={suchauftrag === "neu" ? null : suchauftrag}
          onClose={() => setSuchauftrag(null)}
        />
      )}
    </div>
  );
}

function Laden() {
  return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Einen Moment …</div>;
}

function Leer({ text }: { text: string }) {
  return <div className="bg-card rounded-[14px] border border-border/60 shadow-sm p-6 text-center text-sm text-muted-foreground">{text}</div>;
}

function istNeu(datum: string) {
  return Date.now() - new Date(datum).getTime() < NEU_TAGE * 24 * 60 * 60 * 1000;
}

function AngebotKachel({ a, onClick }: { a: Angebot; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-left bg-card rounded-[14px] border border-border/60 shadow-sm overflow-hidden transition-shadow hover:shadow-md">
      <div className="relative aspect-[4/3] bg-muted">
        {a.images?.[0] ? (
          <img src={fotoUrl(a.images[0].path)} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground"><Building2 className="h-8 w-8 opacity-40" /></div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-foreground">
          {a.listing_type === "sale" ? "Kauf" : "Miete"}
        </span>
        {a.website_state === "reserviert" ? (
          <span className="absolute right-2 top-2 rounded-full bg-[#2B2622] px-2 py-0.5 text-[11px] font-semibold text-white">Reserviert</span>
        ) : istNeu(a.created_at) ? (
          <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">Neu</span>
        ) : null}
      </div>
      <div className="p-2.5 space-y-0.5">
        <div className="text-[13.5px] font-semibold leading-snug line-clamp-2">{a.title}</div>
        <div className="text-[12px] text-muted-foreground truncate">
          {[a.city, a.living_space_sqm ? `${zahl(a.living_space_sqm)} m²` : null].filter(Boolean).join(" · ")}
        </div>
        <div className="pt-0.5 text-[14px] font-semibold text-[#B35500]">{preisText(a)}</div>
        {a.gemeldet && <div className="flex items-center gap-1 text-[12px] text-emerald-700"><Check className="h-3.5 w-3.5" />Interesse gemeldet</div>}
      </div>
    </button>
  );
}

const STATUS_EIGEN: Record<PortalGesuch["status"], string> = {
  pruefung: "In Prüfung",
  sichtbar: "Sichtbar",
  abgelehnt: "Nicht freigegeben",
};

function GesuchKarte({ g, onOeffnen }: { g: PortalGesuch; onOeffnen: () => void }) {
  const eck = gesuchEckdatenPortal(g);
  if (g.eigen) {
    return (
      <div className="rounded-[14px] border-2 border-primary bg-primary/5 p-4 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-primary px-2.5 py-0.5 text-[12px] font-semibold text-primary-foreground">Ihr Suchauftrag</span>
          <button type="button" onClick={onOeffnen} className="min-h-11 px-2 text-[14px] font-semibold text-[#8A4100]">Bearbeiten</button>
        </div>
        <div className="text-[16px] font-semibold">{g.titel}</div>
        <div className="text-[13px] text-muted-foreground">{[...eck, STATUS_EIGEN[g.status]].join(" · ")}</div>
      </div>
    );
  }
  const rgi = g.art === "rgi";
  return (
    <div className="rounded-[14px] border border-border/60 bg-card p-4 space-y-2 shadow-sm">
      <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[12px] font-semibold", rgi ? "bg-sky-100 text-sky-900" : "bg-emerald-100 text-emerald-800")}>
        {rgi ? "RGI sucht" : "Eigentümer sucht"}
      </span>
      <div className="text-[16px] font-semibold">{g.titel}</div>
      {eck.length > 0 && <div className="text-[13px] text-muted-foreground">{eck.join(" · ")}</div>}
      {g.beschreibung && <p className="text-[14px] leading-relaxed text-foreground/85 line-clamp-3">{g.beschreibung}</p>}
      {g.gemeldet ? (
        <div className="flex items-center gap-1.5 text-[13px] text-emerald-700"><Check className="h-4 w-4" />Gemeldet</div>
      ) : (
        <Button variant="outline" className="h-11" onClick={onOeffnen}>{rgi ? "Unverbindlich melden" : "Ich habe etwas Passendes"}</Button>
      )}
    </div>
  );
}

function Danke({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-[12px] bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      <Check className="mt-0.5 h-4 w-4 shrink-0" />
      <span><b>Danke!</b> {text}</span>
    </div>
  );
}

/** Anfrage an RGI über die gemeinsame Eingangstür (landet im Postfach › Anfragen). */
function useAnfrageSenden() {
  const { profile, user } = useAuth();
  const qc = useQueryClient();
  return async (formType: "objekt" | "gesuch", daten: Record<string, unknown>) => {
    const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || user?.email || "";
    const { data, error } = await supabase.functions.invoke("website-anfrage", {
      body: {
        formType,
        source: "nutzer_app",
        data: { name, email: profile?.email || user?.email, phone: (profile as { phone?: string } | null)?.phone || "", ...daten },
        page_url: window.location.href,
        elapsed_ms: 60000,
      },
    });
    if (error || !data?.ok) throw new Error(data?.error || "Senden fehlgeschlagen");
    qc.invalidateQueries({ queryKey: [PK] });
  };
}

function AngebotBlatt({ angebot: a, onClose }: { angebot: Angebot; onClose: () => void }) {
  const senden = useAnfrageSenden();
  const [nachricht, setNachricht] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [gesendet, setGesendet] = useState(false);
  const fakten = useMemo(
    () =>
      [
        ["Preis", preisText(a)],
        ["Provision", a.commission_text],
        ["Wohnfläche", a.living_space_sqm ? `${zahl(a.living_space_sqm)} m²` : null],
        ["Grundstück", a.plot_size_sqm ? `${zahl(a.plot_size_sqm)} m²` : null],
        ["Zimmer", zahl(a.rooms)],
        ["Baujahr", a.year_built ? String(a.year_built) : null],
        ["Frei ab", a.available_from ? new Date(a.available_from).toLocaleDateString("de-DE") : null],
        ["Energieklasse", a.energy_class],
      ].filter(([, v]) => v) as [string, string][],
    [a],
  );

  const interesse = async () => {
    setLaeuft(true);
    try {
      await senden("objekt", {
        broker_property_id: a.id,
        property_title: a.title,
        property_address: [a.postal_code, a.city].filter(Boolean).join(" "),
        nachricht: nachricht.trim(),
      });
      setGesendet(true);
    } catch {
      toast.error("Ihre Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es später erneut.");
    } finally {
      setLaeuft(false);
    }
  };

  const schonGemeldet = a.gemeldet && !gesendet;
  return (
    <PortalBlatt
      offen
      onOffen={(o) => !o && onClose()}
      titel={a.title}
      text={[a.postal_code, a.city, a.district].filter(Boolean).join(" ")}
      fuss={
        gesendet ? <Danke text={DANKE_ANFRAGE} /> : schonGemeldet ? (
          <div className="flex items-center gap-2 rounded-[12px] bg-muted px-4 py-3 text-sm"><Check className="h-4 w-4" /> Interesse gemeldet</div>
        ) : (
          <Button className="h-12 w-full text-base" onClick={interesse} disabled={laeuft}>
            {laeuft && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ich habe Interesse
          </Button>
        )
      }
    >
      {a.images?.length > 0 && (
        <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1">
          {a.images.map((img, i) => (
            <img key={i} src={fotoUrl(img.path)} alt={img.caption ?? ""} loading="lazy" className="h-56 w-[85%] shrink-0 snap-center rounded-[12px] object-cover md:w-[60%]" />
          ))}
        </div>
      )}
      <dl className="bg-card rounded-[14px] border border-border/60 shadow-sm divide-y divide-foreground/[0.055]">
        {fakten.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-3 text-[15px]">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {a.description && <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">{a.description}</p>}
      {a.features && a.features.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {a.features.map((f) => <span key={f} className="rounded-full bg-primary/10 px-3 py-1 text-[13px] text-[#8A4100]">{f}</span>)}
        </div>
      )}
      {!gesendet && !schonGemeldet && (
        <div className="space-y-2">
          <Label htmlFor="angebot-nachricht" className="text-[13px] text-muted-foreground">Nachricht (freiwillig)</Label>
          <Textarea id="angebot-nachricht" value={nachricht} onChange={(e) => setNachricht(e.target.value)} rows={3} className="text-base" />
        </div>
      )}
    </PortalBlatt>
  );
}

function GesuchBlatt({ gesuch: g, onClose }: { gesuch: PortalGesuch; onClose: () => void }) {
  const senden = useAnfrageSenden();
  const { data: wohnungen = [] } = useMeineWohnungen();
  const [wohnung, setWohnung] = useState<string>("");
  const [nachricht, setNachricht] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [gesendet, setGesendet] = useState(false);
  const rgi = g.art === "rgi";
  const eck = gesuchEckdatenPortal(g);

  const melden = async () => {
    setLaeuft(true);
    try {
      const w = wohnungen.find((x) => x.id === wohnung)?.label ?? (wohnung === "andere" ? "Eine andere Immobilie" : "");
      await senden("gesuch", { gesuch_id: g.id, wohnung: w, nachricht: nachricht.trim() });
      setGesendet(true);
    } catch (e) {
      toast.error((e as Error).message || "Ihre Anfrage konnte nicht gesendet werden.");
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <PortalBlatt
      offen
      onOffen={(o) => !o && onClose()}
      titel={g.titel}
      text={rgi ? "RGI sucht" : "Eigentümer sucht"}
      fuss={
        gesendet ? <Danke text={DANKE_ANFRAGE} /> : (
          <Button className="h-12 w-full text-base" onClick={melden} disabled={laeuft}>
            {laeuft && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {rgi ? "Unverbindlich melden" : "Ich habe etwas Passendes"}
          </Button>
        )
      }
    >
      {eck.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {eck.map((t) => <span key={t} className="rounded-full bg-muted px-3 py-1 text-[13px]">{t}</span>)}
        </div>
      )}
      {g.beschreibung && <p className="whitespace-pre-line text-[15px] leading-relaxed">{g.beschreibung}</p>}
      {!gesendet && (
        <PortalGruppe>
          <div className="space-y-1.5">
            <Label className="text-[13px] font-medium text-foreground/80">Um welche Immobilie geht es?</Label>
            <Select value={wohnung} onValueChange={setWohnung}>
              <SelectTrigger className={portalFeld}><SelectValue placeholder="Bitte wählen" /></SelectTrigger>
              <SelectContent>
                {wohnungen.map((w) => <SelectItem key={w.id} value={w.id} className="min-h-11">{w.label}</SelectItem>)}
                <SelectItem value="andere" className="min-h-11">Eine andere Immobilie</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gesuch-nachricht" className="text-[13px] font-medium text-foreground/80">Nachricht (freiwillig)</Label>
            <Textarea id="gesuch-nachricht" rows={3} className="text-base" value={nachricht} onChange={(e) => setNachricht(e.target.value)} />
          </div>
        </PortalGruppe>
      )}
    </PortalBlatt>
  );
}

const OBJEKTARTEN = ["Wohnung", "Haus", "Grundstück", "Garage / Stellplatz"];
const zahlLesen = (t: string) => {
  const n = Number(t.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));
  return t.trim() && Number.isFinite(n) ? String(n) : "";
};

function SuchauftragBlatt({ vorhanden, onClose }: { vorhanden: PortalGesuch | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    titel: vorhanden?.titel ?? "",
    objektart: vorhanden?.objektart ?? "Wohnung",
    ort: vorhanden?.ort ?? "",
    zimmer_ab: vorhanden?.zimmer_ab != null ? String(vorhanden.zimmer_ab).replace(".", ",") : "",
    preis_bis: vorhanden?.preis_bis != null ? new Intl.NumberFormat("de-DE").format(vorhanden.preis_bis) : "",
    fuer_wen: vorhanden?.fuer_wen ?? "Für mich",
    beschreibung: vorhanden?.beschreibung ?? "",
  });
  const [laeuft, setLaeuft] = useState(false);
  const [gesendet, setGesendet] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const speichern = async () => {
    if (!f.titel.trim()) return void toast.error("Bitte eine kurze Überschrift eingeben.");
    setLaeuft(true);
    const { error } = await (supabase as any).rpc("portal_suchauftrag_speichern", {
      _id: vorhanden?.id ?? null,
      _d: { ...f, zimmer_ab: zahlLesen(f.zimmer_ab), preis_bis: zahlLesen(f.preis_bis) },
    });
    setLaeuft(false);
    if (error) return void toast.error(error.message || "Konnte nicht gespeichert werden.");
    setGesendet(true);
    qc.invalidateQueries({ queryKey: [PK, "gesuche"] });
  };

  const beenden = async () => {
    if (!vorhanden) return;
    setLaeuft(true);
    const { error } = await (supabase as any).rpc("portal_suchauftrag_beenden", { _id: vorhanden.id });
    setLaeuft(false);
    if (error) return void toast.error("Konnte nicht beendet werden.");
    toast.success("Suchauftrag beendet");
    qc.invalidateQueries({ queryKey: [PK, "gesuche"] });
    onClose();
  };

  return (
    <PortalBlatt
      offen
      onOffen={(o) => !o && onClose()}
      titel={vorhanden ? "Ihr Suchauftrag" : "Suchauftrag hinzufügen"}
      text="Sie suchen selbst – oder für Kinder, Eltern, Freunde?"
      fuss={
        gesendet ? <Danke text={DANKE_SUCHAUFTRAG} /> : (
          <div className="space-y-2">
            <Button className="h-12 w-full text-base" onClick={speichern} disabled={laeuft}>
              {laeuft && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{vorhanden ? "Änderungen senden" : "Suchauftrag senden"}
            </Button>
            {vorhanden && (
              <Button variant="ghost" className="h-11 w-full text-muted-foreground" onClick={beenden} disabled={laeuft}>Suchauftrag beenden</Button>
            )}
          </div>
        )
      }
    >
      {!gesendet && (
        <>
          <PortalGruppe>
            <div className="space-y-1.5">
              <Label htmlFor="sa-titel" className="text-[13px] font-medium text-foreground/80">Kurze Überschrift</Label>
              <Input id="sa-titel" className={portalFeld} value={f.titel} onChange={(e) => set("titel", e.target.value)} placeholder="z. B. Wohnung für unsere Eltern" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium text-foreground/80">Was suchen Sie?</Label>
              <Select value={f.objektart} onValueChange={(v) => set("objektart", v)}>
                <SelectTrigger className={portalFeld}><SelectValue /></SelectTrigger>
                <SelectContent>{OBJEKTARTEN.map((o) => <SelectItem key={o} value={o} className="min-h-11">{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sa-ort" className="text-[13px] font-medium text-foreground/80">Wo?</Label>
                <Input id="sa-ort" className={portalFeld} value={f.ort} onChange={(e) => set("ort", e.target.value)} placeholder="z. B. Pfronten" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sa-zimmer" className="text-[13px] font-medium text-foreground/80">Zimmer ab</Label>
                <Input id="sa-zimmer" inputMode="decimal" className={portalFeld} value={f.zimmer_ab} onChange={(e) => set("zimmer_ab", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sa-preis" className="text-[13px] font-medium text-foreground/80">Preis bis (€)</Label>
                <Input id="sa-preis" inputMode="numeric" className={portalFeld} value={f.preis_bis} onChange={(e) => set("preis_bis", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-medium text-foreground/80">Für wen?</Label>
                <Select value={f.fuer_wen} onValueChange={(v) => set("fuer_wen", v)}>
                  <SelectTrigger className={portalFeld}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Für mich" className="min-h-11">Für mich</SelectItem>
                    <SelectItem value="Für jemand anderen" className="min-h-11">Für jemand anderen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sa-text" className="text-[13px] font-medium text-foreground/80">Was ist Ihnen wichtig? (freiwillig)</Label>
              <Textarea id="sa-text" rows={3} className="text-base" value={f.beschreibung} onChange={(e) => set("beschreibung", e.target.value)} placeholder="z. B. Balkon, Aufzug, ruhige Lage" />
            </div>
          </PortalGruppe>
        </>
      )}
    </PortalBlatt>
  );
}
