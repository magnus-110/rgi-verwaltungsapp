/**
 * Formular „Ihre Angaben“ auf der Unterschriftsseite (Schritt „Lesen“): alle Felder des Unterzeichners
 * untereinander (Reihenfolge aus dem Dialog, sonst Lesereihenfolge), dazu Korrekturen („Statt ‚…‘ bitte:“)
 * und Ergänzungen. Eingaben erscheinen live im PDF (Felder.tsx / ErsetzungenSvg). Am Computer (≥ 1024 px)
 * rechts neben dem PDF, sonst darunter.
 * Prüfung hier nur zur Führung – maßgeblich prüft sign-public beim Unterschreiben.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { Check, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BLAU, fussnotenText, ibanFehler, ibanGruppiert, ibanRoh, istIbanFeld, seiteLayout, type Ersetzung,
} from "@shared/signatur/ersetzung.ts";
import { blzListeLaden } from "@/lib/fintsBanken";
import type { SignErgaenzung, SignFeld } from "./api";
import { istAktiv, wertVon, type Werte } from "./Felder";
import { MAX_ZEICHEN, MAX_ZEILEN, textSauber } from "./Ergaenzungen";

const ORANGE = "#ee7202";

// ---------------------------------------------------------------- Hilfen

const heuteIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

/** Datumsfeld mit heute vorbelegen? (Flag, sonst Beschriftung „Datum“ / „Ort, Datum“ …) */
export const heuteVorbelegen = (f: SignFeld) =>
  f.typ === "datum" && (f.heute_vorbelegen === true ||
    (f.heute_vorbelegen == null && /^((ort\s*(,|und|&|\/)\s*)?datum|datum der unterschrift|unterschriftsdatum|heutiges datum|datum \(heute\))$/i.test(f.beschriftung.trim())));

/** Startwerte: Datum heute (falls vorgesehen), vorbelegte Angaben mit dem Text aus dem Dokument. */
export function startWerte(felder: SignFeld[]): Werte {
  const w: Werte = {};
  for (const f of felder.filter((x) => x.eigen)) {
    if (f.typ === "vorbelegt") w[f.id] = f.wert ?? f.ausgangswert ?? "";
    else if (heuteVorbelegen(f) && !f.wert) w[f.id] = heuteIso();
  }
  return w;
}

const istBank = (f: SignFeld) => f.typ === "text" && /kredit\s*institut|geld\s*institut|^bank(name)?\b|name der bank/i.test(f.beschriftung);
const istBic = (f: SignFeld) => f.typ === "text" && /\bBIC\b|swift/i.test(f.beschriftung);

/** Lesereihenfolge (Seite, y, x) als Ersatz, wenn keine Reihenfolge gespeichert ist. */
const lese = (a: SignFeld, b: SignFeld) => a.page - b.page || Math.round(a.y) - Math.round(b.y) || a.x - b.x;
export function sortierteFelder(felder: SignFeld[]): SignFeld[] {
  return [...felder].sort((a, b) => {
    const ra = a.reihenfolge ?? null, rb = b.reihenfolge ?? null;
    if (ra !== null && rb !== null && ra !== rb) return ra - rb;
    if (ra !== null && rb === null) return -1;
    if (ra === null && rb !== null) return 1;
    return lese(a, b);
  });
}

/** Eintrag im Formular: einzelnes Feld oder Auswahlgruppe (genau eins). */
export type Eintrag = { key: string; felder: SignFeld[]; gruppe: string | null };

export function eintraege(alle: SignFeld[], werte: Werte): Eintrag[] {
  const out: Eintrag[] = [];
  const gesehen = new Set<string>();
  for (const f of sortierteFelder(alle.filter((x) => x.eigen))) {
    if (f.typ === "auswahl" && f.gruppe) {
      if (gesehen.has(f.gruppe)) continue;
      gesehen.add(f.gruppe);
      const optionen = sortierteFelder(alle.filter((x) => x.eigen && x.typ === "auswahl" && x.gruppe === f.gruppe)).filter((x) => istAktiv(x, alle, werte));
      if (optionen.length) out.push({ key: `g:${f.gruppe}`, felder: optionen, gruppe: f.gruppe });
      continue;
    }
    if (!istAktiv(f, alle, werte)) continue; // abhängige Felder nur, wenn aktiv
    out.push({ key: f.id, felder: [f], gruppe: null });
  }
  return out;
}

const gruppenTitel = (g: string, felder: SignFeld[]) => {
  const t = g.replace(/_/g, " ");
  return felder.find((f) => /\?$/.test(f.beschriftung))?.beschriftung ?? t.charAt(0).toUpperCase() + t.slice(1);
};

/** Ausgefüllt? (Fortschritt) – vorbelegte Angaben zählen nicht mit. */
const ausgefuellt = (e: Eintrag, werte: Werte) =>
  e.felder.some((f) => !!wertVon(f, werte) && !(istIbanFeld(f) && ibanFehler(wertVon(f, werte)!)));

export function fortschritt(alle: SignFeld[], werte: Werte) {
  const l = eintraege(alle, werte).filter((e) => e.felder[0].typ !== "vorbelegt");
  return { fertig: l.filter((e) => ausgefuellt(e, werte)).length, gesamt: l.length };
}

/** Fehlermeldung eines Eintrags (nur bei angezeigter Prüfung bzw. IBAN sofort). */
export function eintragFehler(e: Eintrag, alle: SignFeld[], werte: Werte): string | null {
  const f = e.felder[0];
  if (e.gruppe) {
    const pflicht = alle.some((x) => x.typ === "auswahl" && x.gruppe === e.gruppe && x.pflicht);
    const n = e.felder.filter((x) => wertVon(x, werte) === "ja").length;
    return pflicht && n !== 1 ? "Bitte eine Möglichkeit wählen." : null;
  }
  const w = wertVon(f, werte);
  if (f.typ === "vorbelegt") return w?.trim() ? null : "Bitte den richtigen Wert eintragen.";
  if (istIbanFeld(f) && w) return ibanFehler(w);
  if (f.pflicht && !w) return f.typ === "ankreuz" ? "Bitte ankreuzen." : "Bitte ausfüllen.";
  return null;
}

// ---------------------------------------------------------------- Ersetzungen im PDF (SVG, wie pdf.ts)

/**
 * Ersetzungen einer Seite als SVG über dem PDF – dieselbe Berechnung wie im fertigen PDF (ersetzung.ts):
 * alter Text exakt durchgestrichen, neuer Text dunkelblau dahinter/darüber bzw. Fußnote unten.
 */
export function ErsetzungenSvg({
  liste, seite, scale, groesse, aktivKey, onTipp,
}: {
  liste: (Ersetzung & { key: string })[];
  seite: number;
  scale: number;
  groesse: { w: number; h: number };
  aktivKey?: string | null;
  onTipp?: (key: string) => void;
}) {
  const hier = liste.filter((e) => e.page === seite && e.zeilen.length && e.neu.trim())
    .sort((a, b) => (a.zeilen[0].y - b.zeilen[0].y) || (a.zeilen[0].x - b.zeilen[0].x));
  if (!hier.length) return null;
  const { layouts, fussnoten } = seiteLayout(hier, groesse);
  const schrift = 'Helvetica, Arial, "Liberation Sans", sans-serif';
  return (
    <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={groesse.w * scale} height={groesse.h * scale} aria-hidden>
      <g transform={`scale(${scale})`}>
        {layouts.map((l, i) => {
          const key = hier[i].key;
          const an = key === aktivKey;
          return (
            <g key={key} onClick={onTipp ? () => onTipp(key) : undefined} style={onTipp ? { pointerEvents: "auto", cursor: "pointer" } : undefined}>
              {an && hier[i].zeilen.map((z, j) => (
                <rect key={j} x={z.x - 1} y={z.y - 1} width={z.w + 2} height={z.h + 2} fill="rgba(31,58,147,0.10)" rx={1} />
              ))}
              {l.striche.map((s, j) => <line key={j} x1={s.x1} x2={s.x2} y1={s.y} y2={s.y} stroke={BLAU} strokeWidth={s.dicke} />)}
              {l.text && (
                <>
                  {l.text.hintergrund && <rect x={l.kasten.x - 1} y={l.kasten.y - 1} width={l.kasten.w + 2} height={l.kasten.h + 2} fill="#fff" fillOpacity={0.85} />}
                  <text x={l.text.x} y={l.text.basis} fontSize={l.text.size} fill={BLAU} fontFamily={schrift} style={{ whiteSpace: "pre" }}>{l.text.inhalt}</text>
                </>
              )}
              {l.marke && <Kreis x={l.marke.x} y={l.marke.y} r={l.marke.r} nr={l.marke.nr} schrift={schrift} />}
              {an && <rect x={l.kasten.x - 1.5} y={l.kasten.y - 1.5} width={l.kasten.w + 3} height={l.kasten.h + 3} fill="none" stroke={BLAU} strokeWidth={0.6} strokeDasharray="2 1.5" />}
            </g>
          );
        })}
        {fussnoten.map((f) => (
          <g key={f.nr}>
            <rect x={f.kasten.x} y={f.kasten.y} width={f.kasten.w} height={f.kasten.h} fill="#fff" fillOpacity={0.9} />
            <Kreis x={f.marke.x} y={f.marke.y} r={f.marke.r} nr={f.nr} schrift={schrift} />
            {f.zeilen.map((z, j) => (
              <text key={j} x={z.x} y={z.basis} fontSize={f.size} fill={BLAU} fontFamily={schrift} style={{ whiteSpace: "pre" }}>{z.inhalt}</text>
            ))}
          </g>
        ))}
      </g>
    </svg>
  );
}

function Kreis({ x, y, r, nr, schrift }: { x: number; y: number; r: number; nr: number; schrift: string }) {
  const t = String(nr);
  const size = r * (t.length > 1 ? 1.15 : 1.45);
  return (
    <>
      <circle cx={x} cy={y} r={r} fill="none" stroke={BLAU} strokeWidth={Math.max(0.45, r * 0.14)} />
      <text x={x} y={y + size * 0.36} fontSize={size} fill={BLAU} textAnchor="middle" fontFamily={schrift}>{t}</text>
    </>
  );
}

/** Ersetzungen aus Feldern (vorbelegt) und Korrekturen (mit Zeilen) – für die Vorschau. */
export function ersetzungenVorschau(felder: SignFeld[], werte: Werte, eigene: SignErgaenzung[], andere: SignErgaenzung[]): (Ersetzung & { key: string })[] {
  const out: (Ersetzung & { key: string })[] = [];
  for (const f of felder) {
    if (f.typ !== "vorbelegt" || !f.text_zeilen?.length) continue;
    const neu = (f.eigen ? werte[f.id] : f.wert) ?? "";
    if (!neu.trim() || neu.trim() === (f.ausgangswert ?? "").trim()) continue;
    out.push({ key: f.id, page: f.page, zeilen: f.text_zeilen, frei: f.frei ?? { bis: 0, oben: 0 }, alt: f.ausgangswert ?? "", neu: neu.trim(), label: f.beschriftung || "Angabe" });
  }
  for (const e of [...andere, ...eigene]) {
    if (e.art !== "korrektur" || !e.zeilen?.length) continue;
    out.push({ key: e.id, page: e.page, zeilen: e.zeilen, frei: e.frei ?? { bis: 0, oben: 0 }, alt: e.original_text ?? "", neu: e.text.replace(/\s+/g, " ") });
  }
  return out;
}

// ---------------------------------------------------------------- Formular

const eingabe = "block h-[48px] w-full rounded-[8px] border bg-white px-3 text-[16px] text-[#2B2B2B] outline-none focus:border-[#B35300] focus:ring-2 focus:ring-[#B35300]/20";

type Props = {
  felder: SignFeld[];
  werte: Werte;
  setWert: (f: SignFeld, wert: string | null) => void;
  ergaenzungen: SignErgaenzung[];
  onErgText: (id: string, text: string) => void;
  onErgLoeschen: (id: string) => void;
  /** Markierung einer Korrektur ändern (zurück ins Dokument) */
  onKorrMarkieren: (id: string) => void;
  aktivId: string | null;
  /** Fokus im Formular → Stelle im PDF zeigen */
  onFokus: (id: string) => void;
  /** Prüfung anzeigen (nach „Weiter“) */
  pruefen: boolean;
  /** Knöpfe „Text ergänzen / Korrigieren“ (nur mit Freigabe) */
  leiste?: ReactNode;
};

export default function Formular({ felder, werte, setWert, ergaenzungen, onErgText, onErgLoeschen, onKorrMarkieren, aktivId, onFokus, pruefen, leiste }: Props) {
  const liste = eintraege(felder, werte);
  const fs = fortschritt(felder, werte);
  const box = useRef<HTMLDivElement>(null);

  /** Nächstes Eingabefeld (Enter/„Weiter“) */
  const weiter = (id: string) => {
    const els = Array.from(box.current?.querySelectorAll<HTMLElement>("[data-sig-eingabe]") ?? []);
    // Radio-Gruppen nur einmal
    const reihe = els.filter((el, i) => !(el.getAttribute("type") === "radio" && els[i - 1]?.getAttribute("name") === el.getAttribute("name")));
    const i = reihe.findIndex((el) => el.id === id || (el.getAttribute("type") === "radio" && el.getAttribute("name") === document.getElementById(id)?.getAttribute("name")));
    const n = reihe[i + 1];
    if (n) n.focus();
    else (document.getElementById(id) as HTMLElement | null)?.blur();
  };
  const enter = (id: string) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      weiter(id);
    }
  };
  const letzteId = (() => {
    const l = [...liste.map((e) => e.felder[0].id), ...ergaenzungen.map((e) => e.id)];
    return l[l.length - 1];
  })();
  const hint = (id: string) => (id === letzteId ? "done" : "next") as "done" | "next";

  // IBAN: Kreditinstitut und BIC aus der BLZ (offline, Bundesbank-Liste) in leere Felder eintragen
  const ibanGeaendert = async (f: SignFeld, wert: string) => {
    const roh = ibanRoh(wert);
    if (!roh.startsWith("DE") || roh.length !== 22 || ibanFehler(roh)) return;
    try {
      const liste = await blzListeLaden();
      const e = liste[roh.slice(4, 12)];
      if (!e) return;
      const [name, bic] = e;
      for (const x of felder.filter((y) => y.eigen && y.id !== f.id)) {
        if (wertVon(x, werteRef.current)) continue;
        if (istBank(x) && name) setWert(x, name.slice(0, x.max_laenge ?? 200));
        else if (istBic(x) && bic) setWert(x, bic.slice(0, x.max_laenge ?? 200));
      }
    } catch {
      /* ohne Liste geht es von Hand */
    }
  };
  const werteRef = useRef(werte);
  werteRef.current = werte;

  return (
    <div ref={box} className="rounded-[12px] border border-[#E5E5E5] bg-white">
      {liste.length > 0 && (
        <div className="border-b border-[#EEEEEE] px-4 pb-3 pt-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[16px] font-semibold leading-[20px] text-[#2B2B2B]">Ihre Angaben</h2>
            {fs.gesamt > 0 && (
              <span className={cn("text-[13px] tabular-nums", fs.fertig === fs.gesamt ? "font-semibold text-[#1E6B34]" : "text-[#595959]")} aria-live="polite">
                {fs.fertig} von {fs.gesamt} ausgefüllt
              </span>
            )}
          </div>
          {fs.gesamt > 0 && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#EEEEEE]" aria-hidden>
              <div className="h-full rounded-full bg-[#ee7202] transition-[width]" style={{ width: `${(fs.fertig / fs.gesamt) * 100}%` }} />
            </div>
          )}
        </div>
      )}
      {liste.length > 0 && (
        <div className="space-y-4 px-4 py-4">
          {liste.map((e) => {
            const f = e.felder[0];
            const fehler = eintragFehler(e, felder, werte);
            const zeigeFehler = !!fehler && (pruefen || (istIbanFeld(f) && ibanRoh(wertVon(f, werte) ?? "").length >= 15));
            const aktiv = e.felder.some((x) => x.id === aktivId);
            const pflicht = e.gruppe ? felder.some((x) => x.typ === "auswahl" && x.gruppe === e.gruppe && x.pflicht) : f.pflicht;
            const titel = e.gruppe ? gruppenTitel(e.gruppe, e.felder) : f.beschriftung || (f.typ === "datum" ? "Datum" : f.typ === "ankreuz" ? "Ankreuzen" : "Angabe");
            const rahmen = cn(eingabe, zeigeFehler ? "border-[#B42318]" : aktiv ? "border-[#ee7202]" : "border-[#CCCCCC]");
            const w = wertVon(f, werte) ?? "";
            const fehlerId = `sig-fehler-${f.id}`;
            const kopf = (
              <span className="mb-1.5 flex items-baseline gap-2 text-[14px] font-semibold leading-[18px] text-[#2B2B2B]">
                <span className="min-w-0 flex-1">
                  {titel}
                  {pflicht && <span className="text-[#B35300]" aria-hidden> *</span>}
                </span>
                <span className="shrink-0 text-[12px] font-normal text-[#6B6B6B]">Seite {f.page + 1}</span>
              </span>
            );
            let feld: ReactNode;
            if (e.gruppe) {
              feld = (
                <fieldset>
                  <legend className="w-full">{kopf}</legend>
                  <div className="space-y-1.5" role="radiogroup">
                    {e.felder.map((o) => {
                      const an = wertVon(o, werte) === "ja";
                      return (
                        <label key={o.id} className={cn("flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[8px] border px-3 py-2 text-[15px] leading-[20px]", an ? "border-[#ee7202] bg-[#FFF7ED]" : "border-[#E5E5E5] bg-white hover:bg-[#FAFAFA]")}>
                          <input
                            type="radio"
                            id={`sig-in-${o.id}`}
                            data-sig-eingabe
                            name={`sig-gruppe-${e.gruppe}`}
                            checked={an}
                            onChange={() => setWert(o, "ja")}
                            onFocus={() => onFokus(o.id)}
                            onKeyDown={enter(`sig-in-${o.id}`)}
                            className="h-5 w-5 shrink-0 accent-[#B35300]"
                          />
                          <span className="min-w-0 flex-1 text-[#2B2B2B]">{o.beschriftung || o.option}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              );
            } else if (f.typ === "ankreuz") {
              const an = w === "ja";
              feld = (
                <label className={cn("flex min-h-[48px] cursor-pointer items-center gap-3 rounded-[8px] border px-3 py-2 text-[15px] leading-[20px]", an ? "border-[#ee7202] bg-[#FFF7ED]" : zeigeFehler ? "border-[#B42318]" : "border-[#E5E5E5] hover:bg-[#FAFAFA]")}>
                  <input
                    type="checkbox"
                    id={`sig-in-${f.id}`}
                    data-sig-eingabe
                    checked={an}
                    onChange={(ev) => setWert(f, ev.target.checked ? "ja" : null)}
                    onFocus={() => onFokus(f.id)}
                    onKeyDown={enter(`sig-in-${f.id}`)}
                    className="h-5 w-5 shrink-0 accent-[#B35300]"
                  />
                  <span className="min-w-0 flex-1 text-[#2B2B2B]">
                    {f.beschriftung || "Ankreuzen"}
                    {f.pflicht && <span className="text-[#B35300]" aria-hidden> *</span>}
                  </span>
                  <span className="shrink-0 text-[12px] text-[#6B6B6B]">Seite {f.page + 1}</span>
                </label>
              );
            } else if (f.typ === "vorbelegt") {
              const geaendert = w.trim() !== (f.ausgangswert ?? "").trim();
              feld = (
                <>
                  <label htmlFor={`sig-in-${f.id}`}>{kopf}</label>
                  <input
                    id={`sig-in-${f.id}`}
                    data-sig-eingabe
                    value={w}
                    maxLength={300}
                    enterKeyHint={hint(f.id)}
                    onChange={(ev) => setWert(f, ev.target.value)}
                    onFocus={() => onFokus(f.id)}
                    onKeyDown={enter(`sig-in-${f.id}`)}
                    aria-invalid={zeigeFehler || undefined}
                    aria-describedby={fehlerId}
                    className={cn(rahmen, geaendert && "text-[#1F3A93]")}
                  />
                  <p id={fehlerId} className="mt-1 flex items-start gap-2 text-[12.5px] leading-[17px] text-[#6B6B6B]">
                    {geaendert ? (
                      <>
                        <span className="min-w-0 flex-1">
                          Geändert – im Dokument wird „{f.ausgangswert}“ durchgestrichen.
                        </span>
                        <button type="button" onClick={() => setWert(f, f.ausgangswert ?? "")} className="inline-flex shrink-0 items-center gap-1 text-[#B35300] underline underline-offset-2">
                          <RotateCcw className="h-3 w-3" /> Zurücksetzen
                        </button>
                      </>
                    ) : (
                      <span>Steht so im Dokument. Nur ändern, wenn es nicht stimmt.</span>
                    )}
                  </p>
                </>
              );
            } else {
              const iban = istIbanFeld(f);
              feld = (
                <>
                  <label htmlFor={`sig-in-${f.id}`}>{kopf}</label>
                  <input
                    id={`sig-in-${f.id}`}
                    data-sig-eingabe
                    type={f.typ === "datum" ? "date" : "text"}
                    value={w}
                    min={f.typ === "datum" ? "1900-01-01" : undefined}
                    max={f.typ === "datum" ? "2100-12-31" : undefined}
                    maxLength={f.typ === "text" ? (iban ? 42 : f.max_laenge ?? 200) : undefined}
                    inputMode={iban ? "text" : undefined}
                    autoCapitalize={iban || istBic(f) ? "characters" : undefined}
                    autoComplete={iban ? "off" : undefined}
                    spellCheck={iban ? false : undefined}
                    enterKeyHint={hint(f.id)}
                    placeholder={iban ? "DE00 0000 0000 0000 0000 00" : undefined}
                    onChange={(ev) => {
                      const v = ev.target.value;
                      if (iban) {
                        const g = ibanGruppiert(v).slice(0, 42);
                        setWert(f, g || null);
                        void ibanGeaendert(f, g);
                      } else setWert(f, v || null);
                    }}
                    onFocus={() => onFokus(f.id)}
                    onKeyDown={enter(`sig-in-${f.id}`)}
                    aria-invalid={zeigeFehler || undefined}
                    aria-describedby={zeigeFehler ? fehlerId : undefined}
                    className={cn(rahmen, iban && "font-mono tracking-[0.02em]")}
                  />
                </>
              );
            }
            return (
              <div key={e.key} className={cn("scroll-mt-24", aktiv && "relative")}>
                {feld}
                {zeigeFehler && f.typ !== "vorbelegt" && (
                  <p id={fehlerId} className="mt-1 text-[12.5px] font-semibold leading-[17px] text-[#B42318]" role="alert">{fehler}</p>
                )}
                {zeigeFehler && f.typ === "vorbelegt" && (
                  <p className="mt-1 text-[12.5px] font-semibold leading-[17px] text-[#B42318]" role="alert">{fehler}</p>
                )}
                {istIbanFeld(f) && !zeigeFehler && w && !ibanFehler(w) && (
                  <p className="mt-1 flex items-center gap-1 text-[12.5px] leading-[17px] text-[#1E6B34]"><Check className="h-3.5 w-3.5" strokeWidth={3} /> IBAN gültig</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(leiste || ergaenzungen.length > 0) && (
        <div className={cn("space-y-3 px-4 py-4", liste.length > 0 && "border-t border-[#EEEEEE]")}>
          {ergaenzungen.length > 0 && (
            <h2 className="text-[15px] font-semibold leading-[20px] text-[#2B2B2B]">Ihre Korrekturen und Ergänzungen ({ergaenzungen.length})</h2>
          )}
          {ergaenzungen.map((e, i) => {
            const id = `sig-in-${e.id}`;
            const aktiv = aktivId === e.id;
            const leer = !textSauber(e.text);
            const fehlt = pruefen && leer;
            const korrektur = e.art === "korrektur";
            const zuVieleZeilen = textSauber(e.text).split("\n").length > MAX_ZEILEN;
            return (
              <div key={e.id} className={cn("rounded-[10px] border p-3", aktiv ? "border-[#1F3A93] bg-[#F7F8FC]" : "border-[#E5E5E5]")}>
                <div className="mb-1.5 flex items-start gap-2">
                  <label htmlFor={id} className="min-w-0 flex-1 text-[14px] font-semibold leading-[19px] text-[#2B2B2B]">
                    {korrektur ? (
                      e.original_text
                        ? <>Statt „<span className="font-normal text-[#595959] line-through decoration-[#1F3A93]">{e.original_text}</span>“ bitte:</>
                        : <>Statt der markierten Stelle bitte:</>
                    ) : (
                      <>Ergänzung {i + 1}</>
                    )}
                    <span className="ml-1 text-[12px] font-normal text-[#6B6B6B]">Seite {e.page + 1}</span>
                  </label>
                  {korrektur && (
                    <button type="button" onClick={() => onKorrMarkieren(e.id)} aria-label="Markierung ändern" title="Markierung ändern" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[#1F3A93] hover:bg-white">
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  <button type="button" onClick={() => onErgLoeschen(e.id)} aria-label="Löschen" title="Löschen" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[#B42318] hover:bg-white">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {korrektur ? (
                  <input
                    id={id}
                    data-sig-eingabe
                    value={e.text}
                    maxLength={MAX_ZEICHEN}
                    enterKeyHint={hint(e.id)}
                    placeholder="richtiger Text"
                    onChange={(ev) => onErgText(e.id, ev.target.value.replace(/\n/g, " "))}
                    onFocus={() => onFokus(e.id)}
                    onKeyDown={enter(id)}
                    className={cn(eingabe, "text-[#1F3A93]", fehlt ? "border-[#B42318]" : "border-[#CCCCCC]")}
                  />
                ) : (
                  <textarea
                    id={id}
                    data-sig-eingabe
                    value={e.text}
                    maxLength={MAX_ZEICHEN}
                    rows={3}
                    enterKeyHint="enter"
                    placeholder="Text eingeben"
                    onChange={(ev) => onErgText(e.id, ev.target.value)}
                    onFocus={() => onFokus(e.id)}
                    className={cn("block min-h-[84px] w-full resize-y rounded-[8px] border bg-white px-3 py-2.5 text-[16px] leading-[22px] text-[#1F3A93] outline-none placeholder:text-[#9A9A9A] focus:border-[#B35300] focus:ring-2 focus:ring-[#B35300]/20", fehlt ? "border-[#B42318]" : "border-[#CCCCCC]")}
                  />
                )}
                <div className="mt-1 flex items-center justify-between gap-2 text-[12px] text-[#6B6B6B]">
                  <span className={fehlt || zuVieleZeilen ? "font-semibold text-[#B42318]" : undefined}>
                    {zuVieleZeilen ? `Höchstens ${MAX_ZEILEN} Zeilen.` : fehlt ? "Bitte Text eingeben oder löschen." : korrektur ? "Erscheint im Dokument in Blau, die alte Stelle wird durchgestrichen." : "Im Dokument verschiebbar (Stelle antippen)."}
                  </span>
                  <span className="shrink-0 tabular-nums">{e.text.length} / {MAX_ZEICHEN}</span>
                </div>
              </div>
            );
          })}
          {leiste}
        </div>
      )}
    </div>
  );
}

/** Kurztext „Statt ‚alt‘: neu“ für Listen (Schritt 2). */
export const korrekturKurz = (e: SignErgaenzung) => fussnotenText({ alt: e.original_text ?? "", neu: textSauber(e.text) });

/** Beim Wechsel des aktiven Eintrags das Eingabefeld ins Bild holen (ohne Tastatur am Handy). */
export function useInsBild(aktivId: string | null, fokus: boolean) {
  useEffect(() => {
    if (!aktivId || !fokus) return;
    const el = document.getElementById(`sig-in-${aktivId}`);
    if (el && document.activeElement !== el) el.focus({ preventScroll: false });
  }, [aktivId, fokus]);
}

export { ORANGE };
