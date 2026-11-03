/**
 * Ausfüllfelder auf der Unterschriftsseite (sign-public „get“ → info.felder).
 * - Eigene Felder: orange hervorgehoben, direkt im PDF bedienbar (Ankreuzen per Tipp,
 *   Datum per nativem Date-Input, Text per Eingabefeld – beides in einem kleinen Feld-Editor).
 * - Felder anderer bzw. von RGI vorab ausgefüllte: als fester Inhalt.
 * Die Prüfung hier ist nur zur Führung – maßgeblich prüft sign-public beim Unterschreiben.
 */
import { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { datum, type SignFeld } from "./api";

export type Werte = Record<string, string | null>;

const ORANGE = "#ee7202";
const TINTE = "#14142B";

/** Aktueller Wert eines Feldes (eigene Eingabe, sonst gespeicherter Wert). */
export const wertVon = (f: SignFeld, werte: Werte) => (f.eigen ? werte[f.id] ?? null : f.wert);

/** Ist das Feld aktiv (Bedingung erfüllt)? */
export function istAktiv(f: SignFeld, felder: SignFeld[], werte: Werte): boolean {
  const a = f.abhaengig_von as { feld_key?: string; gruppe?: string; option?: string } | null;
  if (!a) return true;
  const ziel = a.feld_key
    ? felder.find((x) => x.feld_key === a.feld_key)
    : felder.find((x) => x.typ === "auswahl" && x.gruppe === a.gruppe && x.option === a.option);
  return !!ziel && wertVon(ziel, werte) === "ja";
}

export type Offen = { id: string; text: string; feld: SignFeld };

/** Noch offene Pflichtangaben des Unterzeichners (Gruppen einmal, aktive Pflichtfelder). */
export function offeneFelder(felder: SignFeld[], werte: Werte): Offen[] {
  const out: Offen[] = [];
  const gesehen = new Set<string>();
  for (const f of felder.filter((x) => x.eigen)) {
    if (f.typ === "auswahl" && f.gruppe) {
      if (gesehen.has(f.gruppe)) continue;
      gesehen.add(f.gruppe);
      const gruppe = felder.filter((x) => x.typ === "auswahl" && x.gruppe === f.gruppe);
      const aktiv = gruppe.filter((x) => istAktiv(x, felder, werte));
      const gewaehlt = aktiv.filter((x) => wertVon(x, werte) === "ja").length;
      if (gruppe.some((x) => x.pflicht) && aktiv.length && gewaehlt !== 1) {
        out.push({ id: f.id, text: `${gruppenText(f)}: eine Möglichkeit ankreuzen`, feld: aktiv[0] ?? f });
      }
      continue;
    }
    if (!f.pflicht || !istAktiv(f, felder, werte) || wertVon(f, werte)) continue;
    out.push({ id: f.id, text: f.typ === "ankreuz" ? `${f.beschriftung || "Kästchen"} ankreuzen` : f.beschriftung || "Feld ausfüllen", feld: f });
  }
  return out;
}

const gruppenText = (f: SignFeld) => {
  const g = (f.gruppe || "Auswahl").replace(/_/g, " ");
  return g.charAt(0).toUpperCase() + g.slice(1);
};

/** Datum/Text: Anzeige des Werts im Feld. */
const anzeige = (f: SignFeld, w: string | null) => (!w ? "" : f.typ === "datum" ? datum(w) : w);

/** Ebene über einer PDF-Seite (seite 0-basiert, scale = px je pt). */
export function FelderEbene({
  felder, werte, seite, scale, aktivId, onWert, onBearbeiten,
}: {
  felder: SignFeld[];
  werte: Werte;
  seite: number;
  scale: number;
  aktivId: string | null;
  onWert: (f: SignFeld, wert: string | null) => void;
  onBearbeiten: (f: SignFeld) => void;
}) {
  const liste = felder.filter((f) => f.page === seite);
  if (!liste.length) return null;
  return (
    <>
      {liste.map((f) => {
        const w = wertVon(f, werte);
        const box = { left: f.x * scale, top: f.y * scale, width: f.w * scale, height: f.h * scale };
        const kaestchen = f.typ === "ankreuz" || f.typ === "auswahl";
        // Fester Inhalt: Felder anderer Unterzeichner. Vorab-Werte von RGI stehen schon im PDF (quelle.pdf).
        if (!f.eigen) {
          if (!w || f.vorab) return null;
          return (
            <div key={f.id} className="absolute flex items-center overflow-hidden bg-white/0" style={box} aria-label={`${f.beschriftung}: ${kaestchen ? "angekreuzt" : anzeige(f, w)}`}>
              {kaestchen ? <Kreuz /> : (
                <span className="truncate pl-[1px] font-sans leading-none" style={{ color: TINTE, fontSize: Math.max(7, Math.min(f.h * 0.72, 12) * scale) }}>{anzeige(f, w)}</span>
              )}
            </div>
          );
        }
        const aktiv = istAktiv(f, felder, werte);
        const leer = !w;
        const markiert = aktivId === f.id;
        if (!aktiv) {
          return (
            <div
              key={f.id}
              className="absolute rounded-[2px] border border-dashed border-[#BDBDBD]"
              style={box}
              title={`${f.beschriftung} – nur nötig, wenn die passende Möglichkeit gewählt ist`}
            />
          );
        }
        if (kaestchen) {
          // Trefferfläche bis 36 px (Handy), aber nie über das nächste Kästchen hinaus;
          // das sichtbare Kästchen bleibt in Originalgröße
          const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
          const abstand = Math.min(
            Infinity,
            ...liste.filter((x) => x.id !== f.id && (x.typ === "ankreuz" || x.typ === "auswahl"))
              .map((x) => Math.max(Math.abs(x.x + x.w / 2 - cx), Math.abs(x.y + x.h / 2 - cy)) * scale),
          );
          const hit = Math.max(box.width + 4, Math.min(36, abstand - 2));
          return (
            <button
              key={f.id}
              type="button"
              id={`sig-feld-${f.id}`}
              role={f.typ === "auswahl" ? "radio" : "checkbox"}
              aria-checked={w === "ja"}
              aria-label={f.beschriftung || "Ankreuzen"}
              onClick={() => onWert(f, w === "ja" ? null : "ja")}
              className="pointer-events-auto absolute flex items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[#ee7202]"
              style={{ left: box.left + box.width / 2 - hit / 2, top: box.top + box.height / 2 - hit / 2, width: hit, height: hit }}
            >
              <span
                className={cn("relative block rounded-[2px] border-2", leer && f.pflicht && "animate-[pulse_2s_ease-in-out_infinite]")}
                style={{
                  width: Math.max(box.width, 10), height: Math.max(box.height, 10),
                  borderColor: ORANGE, backgroundColor: w === "ja" ? "#FFF7ED" : "rgba(238,114,2,0.18)",
                  boxShadow: markiert ? `0 0 0 2px #fff, 0 0 0 3px ${ORANGE}` : undefined,
                }}
              >
                {w === "ja" && <Kreuz />}
              </span>
            </button>
          );
        }
        return (
          <button
            key={f.id}
            type="button"
            id={`sig-feld-${f.id}`}
            onClick={() => onBearbeiten(f)}
            aria-label={`${f.beschriftung}${w ? `: ${anzeige(f, w)}` : " – bitte ausfüllen"}`}
            className="pointer-events-auto absolute flex items-center overflow-hidden rounded-[3px] border-2 px-[2px] text-left outline-none focus-visible:ring-2 focus-visible:ring-[#ee7202]"
            style={{
              ...box,
              // Auf dem Handy mind. 14 px hoch – mittig um die Linie, damit nichts darunter verdeckt wird
              top: box.top - Math.max(0, 14 - box.height) / 2,
              height: Math.max(14, box.height),
              borderColor: ORANGE,
              backgroundColor: w ? "rgba(255,247,237,0.92)" : "rgba(238,114,2,0.16)",
              boxShadow: markiert ? `0 0 0 2px ${ORANGE}` : undefined,
            }}
          >
            <span
              className={cn("truncate font-sans leading-none", !w && "text-[#B35300]")}
              style={{ color: w ? TINTE : undefined, fontSize: Math.max(7, Math.min(f.h * 0.72, 12) * scale) }}
            >
              {w ? anzeige(f, w) : f.typ === "datum" ? "Datum" : f.beschriftung || "Text"}
            </span>
          </button>
        );
      })}
    </>
  );
}

function Kreuz() {
  return (
    <svg viewBox="0 0 10 10" className="absolute inset-[12%] h-[76%] w-[76%]" aria-hidden>
      <path d="M1 1 L9 9 M9 1 L1 9" stroke={TINTE} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Kleiner Editor für Datum/Text (unten fest, gut mit dem Daumen erreichbar). */
export function FeldEditor({
  feld, wert, onWert, onSchliessen,
}: {
  feld: SignFeld;
  wert: string | null;
  onWert: (wert: string | null) => void;
  onSchliessen: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = window.setTimeout(() => ref.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [feld.id]);
  const max = feld.max_laenge ?? 200;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(12px,env(safe-area-inset-bottom))]" role="dialog" aria-label={feld.beschriftung}>
      <div className="w-full max-w-[460px] rounded-[12px] border border-[#E5E5E5] bg-white p-4 shadow-[0_10px_40px_rgba(0,0,0,0.25)]">
        <label htmlFor="sig-feld-eingabe" className="block text-[14px] font-semibold leading-[18px] text-[#2B2B2B]">
          {feld.beschriftung || (feld.typ === "datum" ? "Datum" : "Text")}
          {feld.pflicht && <span className="text-[#B35300]"> *</span>}
        </label>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSchliessen();
          }}
        >
          <input
            ref={ref}
            id="sig-feld-eingabe"
            type={feld.typ === "datum" ? "date" : "text"}
            value={wert ?? ""}
            maxLength={feld.typ === "text" ? max : undefined}
            min={feld.typ === "datum" ? "1900-01-01" : undefined}
            max={feld.typ === "datum" ? "2100-12-31" : undefined}
            onChange={(e) => onWert(e.target.value || null)}
            enterKeyHint="done"
            className="h-[48px] min-w-0 flex-1 rounded-[8px] border border-[#CCCCCC] bg-white px-3 text-[16px] text-[#2B2B2B] outline-none focus:border-[#B35300] focus:ring-2 focus:ring-[#B35300]/20"
          />
          <button type="submit" className="h-[48px] shrink-0 rounded-[8px] bg-[#B35300] px-5 text-[15px] font-semibold text-white hover:bg-[#9A4700]">
            Fertig
          </button>
        </form>
        {feld.typ === "text" && <p className="mt-1.5 text-[12px] text-[#6B6B6B]">Höchstens {max} Zeichen.</p>}
      </div>
    </div>
  );
}

/** Liste „Bitte noch ausfüllen (n)“ mit Sprung zum Feld. */
export function OffeneListe({ offen, onSprung }: { offen: Offen[]; onSprung: (o: Offen) => void }) {
  if (!offen.length) return null;
  return (
    <div className="rounded-[10px] border border-[#F6D3AE] bg-[#FFF7ED] px-3 py-2.5">
      <div className="text-[14px] font-semibold leading-[18px] text-[#B35300]">Bitte noch ausfüllen ({offen.length})</div>
      <ul className="mt-1.5 space-y-1">
        {offen.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => onSprung(o)}
              className="flex min-h-[40px] w-full items-center gap-2 rounded-[8px] bg-white px-3 py-2 text-left text-[14px] leading-[18px] text-[#2B2B2B] hover:bg-[#FFFDF9]"
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-[#ee7202]" aria-hidden />
              <span className="min-w-0 flex-1">{o.text}</span>
              <span className="shrink-0 text-[12.5px] text-[#6B6B6B]">Seite {o.feld.page + 1}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#B35300]" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
