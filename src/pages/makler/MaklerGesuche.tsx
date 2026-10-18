/**
 * Makler › Gesuche
 * - Gesuche von RGI: was unsere Kunden suchen (in der Nutzer-App zeigbar).
 * - Suchaufträge von Eigentümern: kommen aus der Nutzer-App und gehen erst
 *   live, wenn wir freigeben.
 * Zusammengebracht wird nie über die App, sondern persönlich (Maklervertrag).
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Pencil, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LeerHinweis, MaklerGuard, SeitenKopf } from "@/components/broker/MaklerUi";
import { ZielgruppeFelder } from "@/components/broker/Zielgruppe";
import { useBrokerAccess, useBrokerProperties, useMaklerNeuLaden } from "@/hooks/useMakler";
import { useGesuche, type GesuchMitKontakt } from "@/hooks/useGesuche";
import { db, fehler, type Zielgruppe } from "@/lib/makler";
import { GESUCH_STATUS_LABEL, OBJEKTARTEN_GESUCH, gesuchEckdaten, passtZu, type Gesuch, type GesuchStatus } from "@/lib/gesuche";
import { cn } from "@/lib/utils";

export default function MaklerGesuche() {
  return (
    <MaklerGuard>
      <Inhalt />
    </MaklerGuard>
  );
}

const STATUS_FARBE: Record<GesuchStatus, string> = {
  entwurf: "bg-muted text-muted-foreground",
  pruefung: "bg-amber-100 text-amber-900",
  sichtbar: "bg-emerald-100 text-emerald-800",
  abgelehnt: "bg-red-50 text-red-700",
  beendet: "bg-muted text-muted-foreground",
};

function kontaktName(g: GesuchMitKontakt) {
  const c = g.contacts;
  if (!c) return "Eigentümer";
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company_name || "Eigentümer";
}

function Inhalt() {
  const { userId } = useBrokerAccess();
  const neuLaden = useMaklerNeuLaden();
  const { data: gesuche = [], isLoading } = useGesuche();
  const { data: objekte = [] } = useBrokerProperties();
  const [bearbeiten, setBearbeiten] = useState<GesuchMitKontakt | "neu" | null>(null);

  const pruefung = gesuche.filter((g) => g.art === "eigentuemer" && g.status === "pruefung");
  const unsere = gesuche.filter((g) => g.art === "rgi");
  const vonEigentuemern = gesuche.filter((g) => g.art === "eigentuemer" && g.status !== "pruefung");

  const aendern = async (g: Gesuch, patch: Partial<Gesuch>, ok: string) => {
    const { error } = await db.from("broker_gesuche").update(patch).eq("id", g.id);
    if (error) return fehler("Konnte nicht gespeichert werden", error);
    toast.success(ok);
    neuLaden();
  };
  const freigeben = (g: Gesuch) =>
    aendern(g, { status: "sichtbar", geprueft_von: userId, geprueft_am: new Date().toISOString(), ablehnungsgrund: null }, "Freigegeben – jetzt in der App sichtbar");
  const ablehnen = (g: Gesuch) =>
    aendern(g, { status: "abgelehnt", geprueft_von: userId, geprueft_am: new Date().toISOString() }, "Nicht freigegeben");

  const passendeObjekte = (g: Gesuch) =>
    objekte.filter((o) => (o.status === "vermarktung" || o.status === "reserviert") && passtZu(g, o));

  return (
    <div className="max-w-5xl mx-auto">
      <SeitenKopf
        titel="Gesuche"
        unter="Was eure Kunden suchen – und Suchaufträge von Eigentümern aus der Nutzer-App. Zusammengebracht wird persönlich, mit Maklervertrag."
        rechts={<Button className="h-11" onClick={() => setBearbeiten("neu")}><Plus className="h-4 w-4 mr-1.5" />Gesuch</Button>}
      />

      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : gesuche.length === 0 ? (
        <LeerHinweis icon={Search} titel="Noch keine Gesuche" text="Legt an, was eure Kunden suchen. Suchaufträge von Eigentümern erscheinen hier zur Prüfung." />
      ) : (
        <div className="space-y-8">
          {pruefung.length > 0 && (
            <Abschnitt titel={`Zur Prüfung (${pruefung.length})`}>
              {pruefung.map((g) => (
                <Karte key={g.id} g={g} hervor wer={kontaktName(g)} passend={[]}>
                  <Button variant="outline" className="h-10" onClick={() => setBearbeiten(g)}><Pencil className="h-4 w-4 mr-1.5" />Bearbeiten</Button>
                  <Button variant="outline" className="h-10" onClick={() => ablehnen(g)}><X className="h-4 w-4 mr-1.5" />Nicht freigeben</Button>
                  <Button className="h-10" onClick={() => freigeben(g)}><Check className="h-4 w-4 mr-1.5" />Freigeben</Button>
                </Karte>
              ))}
            </Abschnitt>
          )}

          <Abschnitt titel="Unsere Gesuche">
            {unsere.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine.</p>
            ) : (
              unsere.map((g) => (
                <Karte key={g.id} g={g} passend={g.status === "sichtbar" ? passendeObjekte(g) : []}>
                  <Button variant="outline" className="h-10" onClick={() => setBearbeiten(g)}><Pencil className="h-4 w-4 mr-1.5" />Bearbeiten</Button>
                  {g.status === "sichtbar" && <Button variant="outline" className="h-10" onClick={() => aendern(g, { status: "beendet" }, "Beendet")}>Beenden</Button>}
                </Karte>
              ))
            )}
          </Abschnitt>

          <Abschnitt titel="Suchaufträge von Eigentümern">
            {vonEigentuemern.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine.</p>
            ) : (
              vonEigentuemern.map((g) => (
                <Karte key={g.id} g={g} wer={kontaktName(g)} passend={g.status === "sichtbar" ? passendeObjekte(g) : []}>
                  <Button variant="outline" className="h-10" onClick={() => setBearbeiten(g)}><Pencil className="h-4 w-4 mr-1.5" />Bearbeiten</Button>
                  {g.status === "sichtbar" && <Button variant="outline" className="h-10" onClick={() => aendern(g, { status: "beendet" }, "Beendet")}>Beenden</Button>}
                  {(g.status === "abgelehnt" || g.status === "beendet") && <Button variant="outline" className="h-10" onClick={() => freigeben(g)}>Wieder freigeben</Button>}
                </Karte>
              ))
            )}
          </Abschnitt>
        </div>
      )}

      {bearbeiten && (
        <GesuchDialog
          key={bearbeiten === "neu" ? "neu" : bearbeiten.id}
          gesuch={bearbeiten === "neu" ? null : bearbeiten}
          onClose={() => setBearbeiten(null)}
          onSaved={() => { setBearbeiten(null); neuLaden(); }}
        />
      )}
    </div>
  );
}

function Abschnitt({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{titel}</h2>
      {children}
    </section>
  );
}

function Karte({
  g,
  wer,
  hervor,
  passend,
  children,
}: {
  g: Gesuch;
  wer?: string;
  hervor?: boolean;
  passend: { id: string; title: string }[];
  children: React.ReactNode;
}) {
  const eck = gesuchEckdaten(g);
  return (
    <div className={cn("rounded-xl border bg-card p-4 space-y-2", hervor && "border-amber-300 ring-1 ring-amber-200")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium break-words">{g.titel}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {wer ? `${wer} · ` : ""}{new Date(g.created_at).toLocaleDateString("de-DE")}
            {g.fuer_wen ? ` · ${g.fuer_wen}` : ""}
          </div>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", STATUS_FARBE[g.status])}>{GESUCH_STATUS_LABEL[g.status]}</span>
      </div>
      {eck.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {eck.map((t) => <span key={t} className="rounded-md bg-muted px-2 py-0.5 text-xs">{t}</span>)}
        </div>
      )}
      {g.beschreibung && <p className="text-sm text-muted-foreground whitespace-pre-line">{g.beschreibung}</p>}
      {passend.length > 0 && (
        <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
          Passt vielleicht zu:{" "}
          {passend.map((o, i) => (
            <span key={o.id}>{i > 0 && ", "}<Link to={`/makler/objekte/${o.id}`} className="underline underline-offset-2">{o.title}</Link></span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-1">{children}</div>
    </div>
  );
}

const zahlText = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));
const zahlLesen = (t: string) => {
  const n = Number(t.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));
  return t.trim() && Number.isFinite(n) ? n : null;
};

function GesuchDialog({ gesuch, onClose, onSaved }: { gesuch: GesuchMitKontakt | null; onClose: () => void; onSaved: () => void }) {
  const { userId } = useBrokerAccess();
  const vomEigentuemer = gesuch?.art === "eigentuemer";
  const [f, setF] = useState({
    titel: gesuch?.titel ?? "",
    objektart: gesuch?.objektart ?? "",
    ort: gesuch?.ort ?? "",
    umkreis_km: zahlText(gesuch?.umkreis_km ?? null),
    zimmer_ab: zahlText(gesuch?.zimmer_ab ?? null),
    flaeche_ab: zahlText(gesuch?.flaeche_ab ?? null),
    preis_bis: zahlText(gesuch?.preis_bis ?? null),
    beschreibung: gesuch?.beschreibung ?? "",
    zielgruppe: (gesuch?.zielgruppe ?? "alle") as Zielgruppe,
    orte: gesuch?.orte ?? [],
    gebaeude: gesuch?.gebaeude ?? [],
    sichtbar_bis: gesuch?.sichtbar_bis ?? "",
    inApp: gesuch ? gesuch.status === "sichtbar" : false,
  });
  const [speichert, setSpeichert] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const speichern = async () => {
    if (!f.titel.trim()) return void toast.error("Bitte eine Überschrift eingeben.");
    setSpeichert(true);
    const daten: Record<string, unknown> = {
      titel: f.titel.trim(),
      objektart: f.objektart || null,
      ort: f.ort.trim() || null,
      umkreis_km: zahlLesen(f.umkreis_km),
      zimmer_ab: zahlLesen(f.zimmer_ab),
      flaeche_ab: zahlLesen(f.flaeche_ab),
      preis_bis: zahlLesen(f.preis_bis),
      beschreibung: f.beschreibung.trim() || null,
      zielgruppe: f.zielgruppe,
      orte: f.orte,
      gebaeude: f.gebaeude,
      sichtbar_bis: f.sichtbar_bis || null,
    };
    // Eigene Gesuche: Schalter „In der Nutzer-App zeigen“. Eigentümer-Aufträge behalten ihren Stand.
    if (!vomEigentuemer) daten.status = f.inApp ? "sichtbar" : gesuch?.status === "beendet" ? "beendet" : "entwurf";
    const res = gesuch
      ? await db.from("broker_gesuche").update(daten).eq("id", gesuch.id)
      : await db.from("broker_gesuche").insert({ ...daten, art: "rgi", created_by: userId, assigned_to: userId });
    setSpeichert(false);
    if (res.error) return fehler("Gesuch konnte nicht gespeichert werden", res.error);
    toast.success("Gesuch gespeichert");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{gesuch ? (vomEigentuemer ? "Suchauftrag eines Eigentümers" : "Gesuch bearbeiten") : "Neues Gesuch"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="g-titel">Überschrift</Label>
            <Input id="g-titel" className="h-11" value={f.titel} onChange={(e) => set("titel", e.target.value)} placeholder="z. B. 3-Zimmer-Wohnung in Pfronten" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Art</Label>
              <Select value={f.objektart || "__keine__"} onValueChange={(v) => set("objektart", v === "__keine__" ? "" : v)}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__keine__" className="min-h-10">— keine Angabe —</SelectItem>
                  {OBJEKTARTEN_GESUCH.map((o) => <SelectItem key={o} value={o} className="min-h-10">{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Feld id="g-preis" label="Preis bis (€)" value={f.preis_bis} onChange={(v) => set("preis_bis", v)} />
            <Feld id="g-ort" label="Ort" value={f.ort} onChange={(v) => set("ort", v)} text />
            <Feld id="g-umkreis" label="Umkreis (km)" value={f.umkreis_km} onChange={(v) => set("umkreis_km", v)} />
            <Feld id="g-zimmer" label="Zimmer ab" value={f.zimmer_ab} onChange={(v) => set("zimmer_ab", v)} />
            <Feld id="g-flaeche" label="Wohnfläche ab (m²)" value={f.flaeche_ab} onChange={(v) => set("flaeche_ab", v)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-text">Kurzer Text</Label>
            <Textarea id="g-text" rows={3} value={f.beschreibung} onChange={(e) => set("beschreibung", e.target.value)} />
            <p className="text-xs text-muted-foreground">Nie Namen oder Telefonnummern hineinschreiben – alle Eigentümer können das Gesuch lesen.</p>
          </div>
          {gesuch?.fuer_wen && <p className="text-sm text-muted-foreground">Für wen: {gesuch.fuer_wen}</p>}

          <div className="space-y-3 rounded-lg border p-3">
            {!vomEigentuemer && (
              <div className="flex items-center justify-between gap-3 min-h-11">
                <Label htmlFor="g-app" className="cursor-pointer">In der Nutzer-App zeigen</Label>
                <Switch id="g-app" checked={f.inApp} onCheckedChange={(v) => set("inApp", v)} />
              </div>
            )}
            <ZielgruppeFelder
              idPrefix="g"
              zielgruppe={f.zielgruppe}
              orte={f.orte}
              gebaeude={f.gebaeude}
              onChange={(p) => setF((x) => ({ ...x, ...p }))}
            />
            <div className="space-y-1.5">
              <Label htmlFor="g-bis">Sichtbar bis (leer = ohne Ende)</Label>
              <Input id="g-bis" type="date" className="h-11" value={f.sichtbar_bis} onChange={(e) => set("sichtbar_bis", e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={onClose}>Abbrechen</Button>
          <Button className="h-11" onClick={speichern} disabled={speichert}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Feld({ id, label, value, onChange, text }: { id: string; label: string; value: string; onChange: (v: string) => void; text?: boolean }) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} className="h-11" inputMode={text ? undefined : "decimal"} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
