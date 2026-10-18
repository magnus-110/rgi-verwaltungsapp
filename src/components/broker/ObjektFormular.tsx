import { useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Segmente } from "./MaklerUi";
import { cn } from "@/lib/utils";
import {
  AUSSTATTUNG,
  ENERGIEKLASSEN,
  ENERGIETRAEGER,
  HEIZUNGEN,
  OBJEKTARTEN,
  UNTERARTEN,
  ZUSTAENDE,
  type BrokerProperty,
} from "@/lib/makler";

// ---------------------------------------------------------------------------
// Formular-Zustand: ein Zustand je Objekt, Zahlen als Text (Komma erlaubt)
// ---------------------------------------------------------------------------
const ZAHL_FELDER = [
  "price_eur", "cold_rent_eur", "warm_rent_eur", "service_charge_eur", "heating_cost_eur", "deposit_eur",
  "living_space_sqm", "plot_size_sqm", "rooms", "energy_value",
] as const;
const GANZZAHL_FELDER = ["bedrooms", "bathrooms", "floor", "total_floors", "year_built"] as const;
const TEXT_FELDER = [
  "title", "commission_text", "condition", "property_type", "property_subtype", "heating_type", "energy_source",
  "energy_certificate_type", "energy_class", "energy_certificate_date", "available_from",
  "street", "house_number", "postal_code", "city", "district", "description",
] as const;

type ZahlFeld = (typeof ZAHL_FELDER)[number] | (typeof GANZZAHL_FELDER)[number];
type TextFeld = (typeof TEXT_FELDER)[number];
export type ObjektForm = Record<ZahlFeld | TextFeld, string> & {
  listing_type: "sale" | "rent";
  features: string[];
  /** immowelt-Nummern, mit Komma getrennt */
  portal_ids: string;
};

const FELD_NAME: Partial<Record<ZahlFeld, string>> = {
  price_eur: "Kaufpreis", cold_rent_eur: "Kaltmiete", warm_rent_eur: "Warmmiete", service_charge_eur: "Nebenkosten",
  heating_cost_eur: "Heizkosten", deposit_eur: "Kaution", living_space_sqm: "Wohnfläche", plot_size_sqm: "Grundstück",
  rooms: "Zimmer", energy_value: "Energiewert", bedrooms: "Schlafzimmer", bathrooms: "Bäder", floor: "Etage",
  total_floors: "Etagen", year_built: "Baujahr",
};

function zahlText(v: number | null | undefined): string {
  return v == null ? "" : String(v).replace(".", ",");
}

export function formAus(p: BrokerProperty): ObjektForm {
  const f = {
    listing_type: p.listing_type === "sale" ? "sale" : "rent",
    features: [...(p.features ?? [])],
    portal_ids: (p.portal_ids ?? []).join(", "),
  } as ObjektForm;
  for (const k of [...ZAHL_FELDER, ...GANZZAHL_FELDER]) f[k] = zahlText(p[k] as number | null);
  for (const k of TEXT_FELDER) f[k] = ((p[k] as string | null) ?? "").toString();
  // Ältere Objekte haben nur „address" – als Straße übernehmen.
  if (!f.street && p.address) f.street = p.address;
  if (f.energy_certificate_date) f.energy_certificate_date = f.energy_certificate_date.slice(0, 10);
  if (f.available_from) f.available_from = f.available_from.slice(0, 10);
  return f;
}

function zahlLesen(text: string, feld: ZahlFeld): number | null {
  const t = text.trim().replace(/\s/g, "").replace(/€|m²|%/g, "");
  if (!t) return null;
  // 1.250,50 → 1250.50 ; 1250,5 → 1250.5 ; 1250.5 → 1250.5
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(norm);
  if (!Number.isFinite(n)) throw new Error(`„${FELD_NAME[feld] ?? feld}" ist keine gültige Zahl.`);
  return n;
}

/** Die Felder, die das Formular speichert (sonst nichts). */
export function payloadAus(f: ObjektForm): Record<string, unknown> {
  if (!f.title.trim()) throw new Error("Der Titel darf nicht leer sein.");
  const p: Record<string, unknown> = { listing_type: f.listing_type, features: f.features };
  for (const k of ZAHL_FELDER) p[k] = zahlLesen(f[k], k);
  for (const k of GANZZAHL_FELDER) {
    const n = zahlLesen(f[k], k);
    p[k] = n == null ? null : Math.round(n);
  }
  for (const k of TEXT_FELDER) p[k] = f[k].trim() || null;
  p.title = f.title.trim();
  p.portal_ids = Array.from(new Set((f.portal_ids ?? "").split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)));
  // Altes Feld „address" weiter befüllen (andere Stellen lesen es noch).
  p.address = [f.street.trim(), f.house_number.trim()].filter(Boolean).join(" ") || null;
  return p;
}

// ---------------------------------------------------------------------------
// Darstellung
// ---------------------------------------------------------------------------
function Karte({ titel, children, className }: { titel: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card p-4 sm:p-5", className)}>
      <h2 className="font-display text-base font-semibold mb-4">{titel}</h2>
      {children}
    </section>
  );
}

function Feld({ label, children, className, id }: { label: string; children: ReactNode; className?: string; id?: string }) {
  return (
    <div className={cn("space-y-1.5 min-w-0", className)}>
      <Label htmlFor={id} className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

const KEIN = "__leer__";

function Auswahl({ value, onChange, optionen, placeholder = "Bitte wählen" }: {
  value: string;
  onChange: (v: string) => void;
  optionen: string[];
  placeholder?: string;
}) {
  const liste = value && !optionen.includes(value) ? [value, ...optionen] : optionen;
  return (
    <Select value={value || KEIN} onValueChange={(v) => onChange(v === KEIN ? "" : v)}>
      <SelectTrigger className="h-11"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={KEIN} className="min-h-10 text-muted-foreground">— keine Angabe —</SelectItem>
        {liste.map((o) => <SelectItem key={o} value={o} className="min-h-10">{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function ObjektFormular({ form, setFeld }: { form: ObjektForm; setFeld: <K extends keyof ObjektForm>(k: K, v: ObjektForm[K]) => void }) {
  const [eigenes, setEigenes] = useState("");
  const kauf = form.listing_type === "sale";

  const zahl = (k: ZahlFeld, label: string, einheit?: string, cls?: string) => (
    <Feld label={einheit ? `${label} (${einheit})` : label} id={`f-${k}`} className={cls}>
      <Input
        id={`f-${k}`}
        className="h-11"
        inputMode="decimal"
        value={form[k]}
        onChange={(e) => setFeld(k, e.target.value)}
      />
    </Feld>
  );
  const text = (k: TextFeld, label: string, ph?: string, cls?: string) => (
    <Feld label={label} id={`f-${k}`} className={cls}>
      <Input id={`f-${k}`} className="h-11" value={form[k]} placeholder={ph} onChange={(e) => setFeld(k, e.target.value)} />
    </Feld>
  );

  const merkmale = [...AUSSTATTUNG, ...form.features.filter((f) => !AUSSTATTUNG.includes(f))];
  const umschalten = (m: string) =>
    setFeld("features", form.features.includes(m) ? form.features.filter((x) => x !== m) : [...form.features, m]);
  const hinzufuegen = () => {
    const m = eigenes.trim();
    if (!m) return;
    if (!form.features.includes(m)) setFeld("features", [...form.features, m]);
    setEigenes("");
  };

  return (
    <div className="space-y-4">
      <Karte titel="Eckdaten & Preis">
        <div className="space-y-4">
          {text("title", "Titel")}
          <Feld label="Kauf oder Miete?">
            <Segmente
              className="w-full sm:w-auto"
              wert={form.listing_type}
              onChange={(v) => setFeld("listing_type", v)}
              optionen={[{ key: "sale", label: "Kauf" }, { key: "rent", label: "Miete" }]}
            />
          </Feld>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {kauf ? (
              zahl("price_eur", "Kaufpreis", "€")
            ) : (
              <>
                {zahl("cold_rent_eur", "Kaltmiete", "€")}
                {zahl("warm_rent_eur", "Warmmiete", "€")}
                {zahl("service_charge_eur", "Nebenkosten", "€")}
                {zahl("heating_cost_eur", "Heizkosten", "€")}
                {zahl("deposit_eur", "Kaution", "€")}
              </>
            )}
            {text("commission_text", "Provision", kauf ? "z. B. 3,57 % inkl. MwSt." : "z. B. provisionsfrei", "col-span-2 lg:col-span-1")}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {zahl("living_space_sqm", "Wohnfläche", "m²")}
            {zahl("plot_size_sqm", "Grundstück", "m²")}
            {zahl("rooms", "Zimmer")}
            {zahl("bedrooms", "Schlafzimmer")}
            {zahl("bathrooms", "Bäder")}
            {zahl("floor", "Etage")}
            {zahl("total_floors", "Etagen gesamt")}
            {zahl("year_built", "Baujahr")}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Feld label="Objektart">
              <Auswahl value={form.property_type} onChange={(v) => { setFeld("property_type", v); setFeld("property_subtype", ""); }} optionen={OBJEKTARTEN} />
            </Feld>
            <Feld label="Unterart">
              <Auswahl value={form.property_subtype} onChange={(v) => setFeld("property_subtype", v)} optionen={UNTERARTEN[form.property_type] ?? []} />
            </Feld>
            <Feld label="Zustand">
              <Auswahl value={form.condition} onChange={(v) => setFeld("condition", v)} optionen={ZUSTAENDE} />
            </Feld>
            <Feld label="Frei ab" id="f-available_from">
              <Input id="f-available_from" type="date" className="h-11" value={form.available_from} onChange={(e) => setFeld("available_from", e.target.value)} />
            </Feld>
          </div>
        </div>
      </Karte>

      <Karte titel="Heizung & Energieausweis">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Feld label="Heizung">
            <Auswahl value={form.heating_type} onChange={(v) => setFeld("heating_type", v)} optionen={HEIZUNGEN} />
          </Feld>
          <Feld label="Energieträger">
            <Auswahl value={form.energy_source} onChange={(v) => setFeld("energy_source", v)} optionen={ENERGIETRAEGER} />
          </Feld>
          <Feld label="Art des Energieausweises">
            <Auswahl value={form.energy_certificate_type} onChange={(v) => setFeld("energy_certificate_type", v)} optionen={["Bedarfsausweis", "Verbrauchsausweis"]} />
          </Feld>
          <Feld label="Energieklasse">
            <Auswahl value={form.energy_class} onChange={(v) => setFeld("energy_class", v)} optionen={ENERGIEKLASSEN} />
          </Feld>
          {zahl("energy_value", "Energiewert", "kWh/m²·Jahr")}
          <Feld label="Ausgestellt am" id="f-energy_certificate_date">
            <Input id="f-energy_certificate_date" type="date" className="h-11" value={form.energy_certificate_date} onChange={(e) => setFeld("energy_certificate_date", e.target.value)} />
          </Feld>
        </div>
      </Karte>

      <Karte titel="Adresse">
        <div className="grid grid-cols-[1fr_96px] sm:grid-cols-[1fr_110px] gap-3">
          {text("street", "Straße")}
          {text("house_number", "Nr.")}
        </div>
        <div className="grid grid-cols-[110px_1fr] gap-3 mt-3">
          {text("postal_code", "PLZ")}
          {text("city", "Ort")}
        </div>
        <div className="mt-3">{text("district", "Ortsteil", "optional")}</div>
        <Feld label="immowelt-Nummer (Online-ID)" id="f-portal_ids" className="mt-3">
          <Input id="f-portal_ids" className="h-11" value={form.portal_ids ?? ""} placeholder="z. B. 2suad5k" onChange={(e) => setFeld("portal_ids", e.target.value)} />
        </Feld>
        <p className="text-xs text-muted-foreground mt-3">
          Auf der Website erscheinen Straße und Hausnummer nur, wenn sie hier eingetragen sind.
          Mit der immowelt-Nummer landen Anfragen von immowelt automatisch als Interessent bei diesem Objekt.
        </p>
      </Karte>

      <Karte titel="Ausstattung">
        <div className="flex flex-wrap gap-2">
          {merkmale.map((m) => {
            const an = form.features.includes(m);
            const eigen = !AUSSTATTUNG.includes(m);
            return (
              <span key={m} className="inline-flex">
                <button
                  type="button"
                  onClick={() => umschalten(m)}
                  aria-pressed={an}
                  className={cn(
                    "min-h-10 rounded-full border px-3.5 text-sm transition-colors",
                    eigen && "rounded-r-none pr-2.5",
                    an ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                  )}
                >
                  {m}
                </button>
                {eigen && (
                  <button
                    type="button"
                    aria-label={`${m} entfernen`}
                    onClick={() => setFeld("features", form.features.filter((x) => x !== m))}
                    className={cn(
                      "min-h-10 rounded-r-full border border-l-0 px-2.5",
                      an ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                    )}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
        <div className="flex gap-2 mt-3">
          <Input
            className="h-11"
            value={eigenes}
            onChange={(e) => setEigenes(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); hinzufuegen(); } }}
            placeholder="Eigenes Merkmal, z. B. Sauna"
          />
          <Button type="button" variant="outline" className="h-11 shrink-0" onClick={hinzufuegen}>
            <Plus className="h-4 w-4 mr-1" />Hinzufügen
          </Button>
        </div>
      </Karte>

      <Karte titel="Beschreibung">
        <Feld label="Text für Website und Exposé" id="f-description">
          <Textarea
            id="f-description"
            rows={9}
            value={form.description}
            onChange={(e) => setFeld("description", e.target.value)}
            placeholder="Beschreiben Sie das Objekt, die Lage und die Besonderheiten."
          />
        </Feld>
        <p className="text-xs text-muted-foreground mt-2">Dieser Text ist öffentlich. Interne Hinweise bitte unter „Verlauf & E-Mails" als Notiz ablegen.</p>
      </Karte>
    </div>
  );
}
