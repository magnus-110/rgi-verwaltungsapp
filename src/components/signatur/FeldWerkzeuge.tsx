/**
 * Ausfüllfelder im Dialog „Unterschrift anfordern“:
 * Werkzeugleiste (Unterschrift · Ankreuzfeld · Auswahl · Datum · Text), Eigenschaften eines Feldes
 * und die Feldliste. Der Zustand liegt im Dialog (UnterschriftAnfordernDialog).
 */
import { ArrowDown, ArrowUp, Calendar, CheckSquare, CircleDot, GripVertical, PenLine, TextCursorInput, Trash2, Type, X } from "lucide-react";
import { useState } from "react";
import type { Frei, TextZeile } from "@shared/signatur/ersetzung.ts";
import { Switch } from "@/components/ui/switch";
import { FELD_TYP_LABEL, type FeldTyp, type WerkzeugTyp } from "@/lib/signatur";
import { eingabeKlasse } from "./ui";

/** Feld im Entwurf (noch nicht gespeichert). */
export interface EntwurfFeld {
  key: string;
  feld_key: string;
  typ: FeldTyp;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  beschriftung: string;
  gruppe: string;
  option: string;
  /** „rgi“ · Schlüssel eines Unterzeichners im Dialog · „rolle:gdw“ (aus der Vorlage) · „“ = erster externer */
  ausfueller: string;
  pflicht: boolean;
  /** „“ · „feld:<feld_key>“ · „gruppe:<gruppe>:<option>“ */
  abhaengig: string;
  wert: string;
  max_laenge: number | null;
  quelle: "manuell" | "vorlage" | "vorschlag";
  anker?: { page: number; x: number; y: number; w: number; h: number };
  /** Reihenfolge im Formular (nur nach manuellem Umsortieren gesetzt) */
  reihenfolge?: number;
  /** Untertyp eines Textfeldes */
  format?: "iban" | null;
  /** nur vorbelegt: Text im Dokument, seine Zeilen, freier Platz, markierte Wörter */
  ausgangswert?: string;
  text_zeilen?: TextZeile[];
  frei?: Frei;
  woerter?: string[];
  /** Datum: mit heute vorbelegen (undefined = automatisch bei Beschriftung „Datum“) */
  heute_vorbelegen?: boolean;
}

/** Beschriftungen, bei denen ein Datum automatisch mit heute vorbelegt wird (wie Formular.tsx). */
export const DATUM_AUTO = /^((ort\s*(,|und|&|\/)\s*)?datum|datum der unterschrift|unterschriftsdatum|heutiges datum|datum \(heute\))$/i;

export const WERKZEUGE: { typ: WerkzeugTyp; icon: typeof PenLine }[] = [
  { typ: "unterschrift", icon: PenLine },
  { typ: "ankreuz", icon: CheckSquare },
  { typ: "auswahl", icon: CircleDot },
  { typ: "datum", icon: Calendar },
  { typ: "text", icon: Type },
  { typ: "vorbelegt", icon: TextCursorInput },
];

export const FELD_ICON: Record<WerkzeugTyp, typeof PenLine> = {
  unterschrift: PenLine, ankreuz: CheckSquare, auswahl: CircleDot, datum: Calendar, text: Type, vorbelegt: TextCursorInput,
};

/** Standardgröße neuer Felder (PDF-Punkte). */
export const FELD_GROESSE: Record<WerkzeugTyp, { w: number; h: number }> = {
  unterschrift: { w: 170, h: 46 },
  ankreuz: { w: 11, h: 11 },
  auswahl: { w: 11, h: 11 },
  datum: { w: 80, h: 16 },
  text: { w: 160, h: 16 },
  vorbelegt: { w: 120, h: 12 },
};

/** Mindestgröße beim Ziehen. */
export const FELD_MIN: Record<WerkzeugTyp, { w: number; h: number }> = {
  unterschrift: { w: 60, h: 20 },
  ankreuz: { w: 6, h: 6 },
  auswahl: { w: 6, h: 6 },
  datum: { w: 30, h: 8 },
  text: { w: 20, h: 8 },
  vorbelegt: { w: 4, h: 4 },
};

export const RGI_FARBE = "#595959";

export function Werkzeugleiste({ werkzeug, onWerkzeug }: { werkzeug: WerkzeugTyp; onWerkzeug: (t: WerkzeugTyp) => void }) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-[#E5E5E5] bg-white p-1" role="toolbar" aria-label="Feldart wählen">
      {WERKZEUGE.map(({ typ, icon: Icon }, i) => {
        const an = werkzeug === typ;
        return (
          <span key={typ} className="inline-flex items-center">
            {i > 0 && <span className="mx-0.5 hidden text-[#BDBDBD] sm:inline" aria-hidden>·</span>}
            <button
              type="button"
              onClick={() => onWerkzeug(typ)}
              aria-pressed={an}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-semibold transition-colors ${
                an ? "bg-[#FFF7ED] text-[#B35300] ring-1 ring-[#ee7202]" : "text-[#2B2B2B] hover:bg-[#FAFAFA]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {FELD_TYP_LABEL[typ]}
            </button>
          </span>
        );
      })}
    </div>
  );
}

export interface AusfuellerOption {
  wert: string;
  text: string;
  farbe: string;
}

/** Eigenschaften des gewählten Feldes. */
export function FeldEigenschaften({
  feld, alle, ausfueller, onChange, onEntfernen, onSchliessen,
}: {
  feld: EntwurfFeld;
  alle: EntwurfFeld[];
  ausfueller: AusfuellerOption[];
  onChange: (patch: Partial<EntwurfFeld>) => void;
  onEntfernen: () => void;
  onSchliessen: () => void;
}) {
  const Icon = FELD_ICON[feld.typ];
  const rgi = feld.ausfueller === "rgi";
  // Mögliche Bedingungen: Ankreuzfelder und Auswahl-Optionen (nicht das Feld selbst, nicht die eigene Gruppe)
  const bedingungen = [
    ...alle.filter((f) => f.key !== feld.key && f.typ === "ankreuz").map((f) => ({ wert: `feld:${f.feld_key}`, text: `angekreuzt: ${f.beschriftung || f.feld_key}` })),
    ...alle.filter((f) => f.typ === "auswahl" && !(feld.typ === "auswahl" && f.gruppe === feld.gruppe))
      .map((f) => ({ wert: `gruppe:${f.gruppe}:${f.option}`, text: `gewählt: ${f.beschriftung || f.option}` })),
  ];
  const gruppen = [...new Set(alle.filter((f) => f.typ === "auswahl" && f.gruppe).map((f) => f.gruppe))];
  const klein = `${eingabeKlasse} h-9 text-[13px]`;
  return (
    <div className="rounded-xl border border-[#E5E5E5] bg-white p-3 shadow-[0_6px_24px_rgba(0,0,0,0.14)]" onClick={(e) => e.stopPropagation()}>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#B35300]" />
        <div className="min-w-0 flex-1 text-[13px] font-semibold text-[#2B2B2B]">
          {FELD_TYP_LABEL[feld.typ]}
          {feld.quelle === "vorlage" && <span className="ml-1.5 rounded-full bg-[#FFF7ED] px-2 py-0.5 text-[11px] font-semibold text-[#B35300]">aus Vorlage</span>}
        </div>
        <button type="button" onClick={onEntfernen} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] font-medium text-[#B35300] hover:bg-[#FFF7ED]" title="Feld entfernen">
          <Trash2 className="h-3.5 w-3.5" /> Entfernen
        </button>
        <button type="button" onClick={onSchliessen} className="rounded p-1 text-[#595959] hover:bg-[#FAFAFA]" aria-label="Eigenschaften schließen">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-[12px] text-[#595959] sm:col-span-2">
          Beschriftung (sieht der Unterzeichner)
          <input className={`${klein} mt-1`} value={feld.beschriftung} maxLength={160} onChange={(e) => onChange({ beschriftung: e.target.value })} />
        </label>
        {feld.typ === "vorbelegt" && (
          <div className="rounded-lg bg-[#FAFAFA] px-2.5 py-2 text-[12px] leading-snug text-[#595959] sm:col-span-2">
            Text im Dokument: <b className="font-semibold text-[#2B2B2B]">„{feld.ausgangswert}“</b>
            <span className="block text-[11.5px] text-[#6B6B6B]">Der Unterzeichner sieht ihn im Formular und darf ihn ändern. Geändert: alter Text wird durchgestrichen, der neue steht dunkelblau daneben. {"Weitere angrenzende Wörter anklicken, um die Stelle zu erweitern."}</span>
          </div>
        )}
        <label className="text-[12px] text-[#595959]">
          {feld.typ === "vorbelegt" ? "Wer darf ändern?" : "Wer füllt aus?"}
          <select className={`${klein} mt-1`} value={feld.ausfueller} onChange={(e) => onChange({ ausfueller: e.target.value })}>
            {ausfueller.filter((a) => feld.typ !== "vorbelegt" || a.wert !== "rgi").map((a) => <option key={a.wert} value={a.wert}>{a.text}</option>)}
          </select>
        </label>
        <label className="text-[12px] text-[#595959]">
          Nur wenn …
          <select className={`${klein} mt-1`} value={feld.abhaengig} onChange={(e) => onChange({ abhaengig: e.target.value })}>
            <option value="">immer</option>
            {bedingungen.map((b) => <option key={b.wert} value={b.wert}>{b.text}</option>)}
          </select>
        </label>
        {feld.typ === "auswahl" && (
          <>
            <label className="text-[12px] text-[#595959]">
              Gruppe (genau eins)
              <input className={`${klein} mt-1`} list="sig-gruppen" value={feld.gruppe}
                onChange={(e) => onChange({ gruppe: e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 60) })} />
              <datalist id="sig-gruppen">{gruppen.map((g) => <option key={g} value={g} />)}</datalist>
            </label>
            <label className="text-[12px] text-[#595959]">
              Wert dieser Möglichkeit
              <input className={`${klein} mt-1`} value={feld.option}
                onChange={(e) => onChange({ option: e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 60) })} />
            </label>
          </>
        )}
        {feld.typ === "text" && (
          <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-[#2B2B2B]">
            <Switch checked={feld.format === "iban"} onCheckedChange={(v) => onChange({ format: v ? "iban" : null, max_laenge: v ? 42 : feld.max_laenge })} aria-label="IBAN-Feld" />
            IBAN (Prüfung, Bank/BIC automatisch)
          </label>
        )}
        {feld.typ === "datum" && !rgi && (
          <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-[#2B2B2B]">
            <Switch
              checked={feld.heute_vorbelegen ?? DATUM_AUTO.test(feld.beschriftung.trim())}
              onCheckedChange={(v) => onChange({ heute_vorbelegen: v })}
              aria-label="Mit heutigem Datum vorbelegen"
            />
            mit heutigem Datum vorbelegen
          </label>
        )}
        {feld.typ === "text" && feld.format !== "iban" && (
          <label className="text-[12px] text-[#595959]">
            Höchstens Zeichen
            <input className={`${klein} mt-1`} type="number" min={1} max={500} value={feld.max_laenge ?? 200}
              onChange={(e) => onChange({ max_laenge: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })} />
          </label>
        )}
        {rgi && (
          <label className="text-[12px] text-[#595959]">
            Vorab-Wert (wird beim Senden festgeschrieben)
            {feld.typ === "datum" ? (
              <input className={`${klein} mt-1`} type="date" value={feld.wert} onChange={(e) => onChange({ wert: e.target.value })} />
            ) : feld.typ === "text" ? (
              <input className={`${klein} mt-1`} value={feld.wert} maxLength={feld.max_laenge ?? 200} onChange={(e) => onChange({ wert: e.target.value })} />
            ) : (
              <span className="mt-1 flex h-9 items-center gap-2 text-[13px] text-[#2B2B2B]">
                <Switch checked={feld.wert === "ja"} onCheckedChange={(v) => onChange({ wert: v ? "ja" : "" })} aria-label="Angekreuzt" />
                angekreuzt
              </span>
            )}
          </label>
        )}
        {feld.typ !== "vorbelegt" && <label className="flex items-center gap-2 text-[13px] text-[#2B2B2B] sm:col-span-2">
          <Switch checked={feld.pflicht} onCheckedChange={(v) => onChange({ pflicht: v })} aria-label="Pflichtfeld" />
          {feld.typ === "auswahl" ? "Pflicht (eine Möglichkeit muss gewählt werden)" : "Pflichtfeld"}
          {feld.abhaengig && feld.pflicht && <span className="text-[12px] text-[#6B6B6B]">– nur wenn die Bedingung erfüllt ist</span>}
        </label>}
      </div>
    </div>
  );
}

/** Kurzliste der Ausfüllfelder (rechte Spalte). */
export function FeldListe({
  felder, ausfueller, aktiv, onWaehlen,
}: {
  felder: EntwurfFeld[];
  ausfueller: AusfuellerOption[];
  aktiv: string | null;
  onWaehlen: (key: string) => void;
}) {
  if (!felder.length) return null;
  return (
    <ul className="space-y-1">
      {felder.map((f) => {
        const Icon = FELD_ICON[f.typ];
        const a = ausfueller.find((x) => x.wert === f.ausfueller);
        return (
          <li key={f.key}>
            <button
              type="button"
              onClick={() => onWaehlen(f.key)}
              className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12.5px] ${
                aktiv === f.key ? "border-[#ee7202] bg-[#FFF7ED]" : "border-[#E5E5E5] bg-white hover:bg-[#FAFAFA]"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: a?.farbe ?? RGI_FARBE }} />
              <span className="min-w-0 flex-1 truncate text-[#2B2B2B]">{f.beschriftung || FELD_TYP_LABEL[f.typ]}</span>
              <span className="shrink-0 text-[11.5px] text-[#6B6B6B]">
                {f.ausfueller === "rgi" ? (f.wert ? "RGI vorab" : "RGI") : a?.text.split(" ·")[0] ?? "1. Unterzeichner"}
                {f.pflicht ? " · Pflicht" : ""} · S. {f.page + 1}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- Reihenfolge im Formular

/** Eintrag der Reihenfolge-Liste: einzelnes Feld oder Auswahlgruppe (alle Möglichkeiten zusammen). */
export interface ReihenEintrag {
  key: string;
  felder: EntwurfFeld[];
}

const leseFolge = (a: EntwurfFeld, b: EntwurfFeld) => a.page - b.page || Math.round(a.y) - Math.round(b.y) || a.x - b.x;

/** Felder eines Unterzeichners in Formular-Reihenfolge (gesetzte Reihenfolge, sonst Lesereihenfolge Seite/y/x). */
export function reihenEintraege(felder: EntwurfFeld[]): ReihenEintrag[] {
  const sortiert = [...felder].sort((a, b) => {
    const ra = a.reihenfolge ?? null, rb = b.reihenfolge ?? null;
    if (ra !== null && rb !== null && ra !== rb) return ra - rb;
    if (ra !== null && rb === null) return -1;
    if (ra === null && rb !== null) return 1;
    return leseFolge(a, b);
  });
  const out: ReihenEintrag[] = [];
  const gruppen = new Map<string, ReihenEintrag>();
  for (const f of sortiert) {
    if (f.typ === "auswahl" && f.gruppe) {
      const g = gruppen.get(f.gruppe);
      if (g) { g.felder.push(f); continue; }
      const neu = { key: `g:${f.gruppe}`, felder: [f] };
      gruppen.set(f.gruppe, neu);
      out.push(neu);
      continue;
    }
    out.push({ key: f.key, felder: [f] });
  }
  return out;
}

/** Liste „Reihenfolge im Formular“ je Unterzeichner: Ziehen (Computer) bzw. Pfeile hoch/runter (Handy). */
export function ReihenfolgeListe({
  gruppen, aktiv, onWaehlen, onReihenfolge,
}: {
  /** je Unterzeichner: Name, Farbe, Felder */
  gruppen: { key: string; name: string; farbe: string; felder: EntwurfFeld[] }[];
  aktiv: string | null;
  onWaehlen: (feldKey: string) => void;
  /** neue Reihenfolge: Feld-Schlüssel → Rang (1 …) */
  onReihenfolge: (raenge: Record<string, number>) => void;
}) {
  const [zieht, setZieht] = useState<{ gruppe: string; von: number } | null>(null);
  const [ueber, setUeber] = useState<number | null>(null);
  const setzen = (liste: ReihenEintrag[]) => {
    const r: Record<string, number> = {};
    liste.forEach((e, i) => e.felder.forEach((f) => { r[f.key] = i + 1; }));
    onReihenfolge(r);
  };
  const schieben = (liste: ReihenEintrag[], von: number, nach: number) => {
    if (nach < 0 || nach >= liste.length || von === nach) return;
    const l = [...liste];
    const [x] = l.splice(von, 1);
    l.splice(nach, 0, x);
    setzen(l);
  };
  return (
    <div className="space-y-3">
      {gruppen.filter((g) => g.felder.length > 0).map((g) => {
        const liste = reihenEintraege(g.felder);
        return (
          <div key={g.key}>
            <div className="mb-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-[#2B2B2B]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.farbe }} aria-hidden />
              {g.name}
            </div>
            <ol className="space-y-1" aria-label={`Reihenfolge im Formular – ${g.name}`}>
              {liste.map((e, i) => {
                const f = e.felder[0];
                const Icon = FELD_ICON[f.typ];
                const gruppe = f.typ === "auswahl" && f.gruppe;
                const text = gruppe
                  ? `${f.gruppe!.replace(/_/g, " ")}: ${e.felder.map((x) => x.beschriftung || x.option).join(" / ")}`
                  : f.beschriftung || (f.typ === "vorbelegt" ? `„${f.ausgangswert}“` : FELD_TYP_LABEL[f.typ]);
                const an = e.felder.some((x) => x.key === aktiv);
                return (
                  <li
                    key={e.key}
                    draggable
                    onDragStart={(ev) => { setZieht({ gruppe: g.key, von: i }); ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", e.key); }}
                    onDragOver={(ev) => { if (zieht?.gruppe === g.key) { ev.preventDefault(); setUeber(i); } }}
                    onDragLeave={() => setUeber((u) => (u === i ? null : u))}
                    onDrop={(ev) => { ev.preventDefault(); if (zieht?.gruppe === g.key) schieben(liste, zieht.von, i); setZieht(null); setUeber(null); }}
                    onDragEnd={() => { setZieht(null); setUeber(null); }}
                    className={`flex items-center gap-1.5 rounded-lg border bg-white py-1 pl-1 pr-1 text-[12.5px] ${
                      ueber === i && zieht?.gruppe === g.key ? "border-[#ee7202] ring-1 ring-[#ee7202]" : an ? "border-[#ee7202] bg-[#FFF7ED]" : "border-[#E5E5E5]"
                    } ${zieht?.gruppe === g.key && zieht.von === i ? "opacity-50" : ""}`}
                  >
                    <span className="hidden h-7 w-5 shrink-0 cursor-grab items-center justify-center text-[#9A9A9A] active:cursor-grabbing md:flex" title="Ziehen zum Verschieben" aria-hidden>
                      <GripVertical className="h-4 w-4" />
                    </span>
                    <span className="w-5 shrink-0 text-center font-semibold tabular-nums text-[#6B6B6B]">{i + 1}.</span>
                    <button type="button" onClick={() => onWaehlen(f.key)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: g.farbe }} />
                      <span className="min-w-0 flex-1 truncate text-[#2B2B2B]">{text}</span>
                      <span className="shrink-0 text-[11.5px] text-[#6B6B6B]">S. {f.page + 1}</span>
                    </button>
                    <button type="button" disabled={i === 0} onClick={() => schieben(liste, i, i - 1)} aria-label={`${text} nach oben`} title="Nach oben"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#2B2B2B] hover:bg-[#FAFAFA] disabled:opacity-25">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button type="button" disabled={i === liste.length - 1} onClick={() => schieben(liste, i, i + 1)} aria-label={`${text} nach unten`} title="Nach unten"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#2B2B2B] hover:bg-[#FAFAFA] disabled:opacity-25">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
    </div>
  );
}
