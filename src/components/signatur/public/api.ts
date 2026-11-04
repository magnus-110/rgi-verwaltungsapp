import { supabase } from "@/integrations/supabase/client";
import type { Frei, TextZeile } from "@shared/signatur/ersetzung.ts";

export type { Frei, TextZeile };

/** Ausfüllfeld auf der Unterschriftsseite (sign-public „get“). Koordinaten in PDF-Punkten, oben links, page 0-basiert. */
export type SignFeld = {
  id: string;
  feld_key: string;
  /** vorbelegt = Angabe steht schon im PDF (ausgangswert), darf geändert werden */
  typ: "ankreuz" | "auswahl" | "datum" | "text" | "vorbelegt";
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  beschriftung: string;
  gruppe: string | null;
  option: string | null;
  pflicht: boolean;
  abhaengig_von: { feld_key: string } | { gruppe: string; option: string } | null;
  max_laenge: number | null;
  /** gespeicherter Wert (vorab von RGI bzw. von anderen Unterzeichnern) */
  wert: string | null;
  /** true = dieser Unterzeichner füllt aus */
  eigen: boolean;
  vorab: boolean;
  /** Reihenfolge im Formular (null/fehlt = Lesereihenfolge) */
  reihenfolge?: number | null;
  /** „iban“ = IBAN-Feld */
  format?: string | null;
  heute_vorbelegen?: boolean | null;
  /** nur vorbelegt */
  ausgangswert?: string | null;
  text_zeilen?: TextZeile[] | null;
  frei?: Frei | null;
};

export type Rechteck = { x: number; y: number; w: number; h: number };

/**
 * Ergänzung/Korrektur des Unterzeichners (nur mit Freigabe). Koordinaten wie Felder (pt, oben links, page 0-basiert).
 * x/y/w/h = Textfeld (Ergänzung bzw. „Richtig ist“), bereich = durchgestrichene Stelle (nur Korrektur).
 */
export type SignErgaenzung = Rechteck & {
  id: string;
  art: "ergaenzung" | "korrektur";
  page: number;
  bereich: Rechteck | null;
  text: string;
  /** nur im Browser: Ersatztext wurde von Hand verschoben (dann nicht mehr automatisch platzieren) */
  manuell?: boolean;
  /** Korrektur per Antippen: markierter Originaltext, seine Zeilen und der freie Platz daneben */
  original_text?: string | null;
  zeilen?: TextZeile[] | null;
  frei?: Frei | null;
  /** nur im Browser: markierte Wörter (Textebene) */
  woerter?: string[];
};

/** Antwort von sign-public {action:"get"} – siehe /esig/API.md. */
export type SignInfo = {
  zustand: "ok" | "abgelaufen" | "zurueckgezogen" | "unterschrieben" | "unbekannt" | "papier_eingegangen";
  nummer: string;
  titel: string;
  objekt: string | null;
  seitenzahl: number;
  frist: string | null;
  name: string;
  email: string | null;
  /** „link“ = Link kam nicht per E-Mail von uns, sondern wurde vom Büro selbst verschickt. */
  versand?: "mail" | "link";
  dokumentart: string | null;
  typ: string | null;
  unterschriftsseite: number | null;
  pdf_url: string | null;
  papier_erlaubt: boolean;
  telefon: string;
  signed_at?: string | null;
  papier_eingegangen?: boolean;
  /** optional, falls das Backend sie mitliefert („Herr“ / „Frau“) */
  anrede?: string | null;
  /** Ausfüllfelder (eigene bedienbar, übrige als fester Inhalt) */
  felder?: SignFeld[];
  /** RGI hat freigegeben: eigene Angaben ergänzen/korrigieren */
  darf_ergaenzen?: boolean;
  /** Ergänzungen anderer Unterzeichner (fester Inhalt) */
  ergaenzungen_andere?: SignErgaenzung[];
  /** Bereits geleistete Unterschriften anderer Unterzeichner (fester Inhalt) */
  unterschriften_andere?: SignUnterschrift[];
  /** Lage der Unterschrift wie in der Endfassung (_shared/signatur/bild.ts) */
  unterschrift_lage?: UnterschriftLage;
};

export type UnterschriftLage = { UEBERSTAND: number; EINZUG?: number; ZEILE_ABSTAND: number; ZEILE_GROESSE: number };

/** Unterschrift eines anderen Unterzeichners, der schon unterschrieben hat (pt, oben links, page 0-basiert). */
export type SignUnterschrift = Rechteck & {
  page: number;
  name: string;
  typed_name: string | null;
  /** data:image/png;base64,… – fehlt bei getipptem Namen */
  signature_png: string | null;
  signed_at: string;
  ort: string | null;
};

export type SignErgebnis = {
  ok: boolean;
  signed_at: string;
  nummer: string;
  kopie_an?: string | null;
  download_url?: string | null;
};

export type PapierDatei = { name: string; mime: string; base64: string };

/** Fehler, bei dem die Funktion gar nicht erreichbar war (Netz, noch nicht bereitgestellt). */
export class NetzFehler extends Error {}

const NETZ_TEXT =
  "Die Verbindung zu unserem Server ist gerade nicht möglich. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es in einigen Minuten erneut.";

async function call<T>(body: Record<string, unknown>): Promise<T> {
  let res: { data: any; error: any };
  try {
    res = await supabase.functions.invoke("sign-public", { body });
  } catch {
    throw new NetzFehler(NETZ_TEXT);
  }
  const { data, error } = res;
  if (error) {
    const name = (error as any)?.name as string | undefined;
    const status = (error as any)?.context?.status as number | undefined;
    if (name === "FunctionsFetchError" || name === "FunctionsRelayError" || status === 404 || status === 502 || status === 503 || status === 504) {
      throw new NetzFehler(NETZ_TEXT);
    }
    let msg = "Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.";
    try {
      const b = await (error as any)?.context?.json?.();
      if (b?.error) msg = b.error;
    } catch {
      /* Standardmeldung */
    }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export const holeInfo = (token: string) => call<SignInfo>({ action: "get", token });

export const unterschreiben = (
  token: string,
  typed_name: string,
  signature_png: string | null,
  felder?: Record<string, string | null>,
  ergaenzungen?: SignErgaenzung[],
) =>
  call<SignErgebnis>({
    action: "sign",
    token,
    typed_name,
    ...(signature_png ? { signature_png } : {}),
    ...(felder && Object.keys(felder).length ? { felder } : {}),
    ...(ergaenzungen?.length
      ? {
          ergaenzungen: ergaenzungen.map(({ art, page, x, y, w, h, bereich, text, original_text, zeilen, frei }) =>
            art === "korrektur" && zeilen?.length
              ? (frei?.scan
                ? { art, page, neu: true, bereich, frei, text } // Scan ohne Textebene: Rechteck, Durchstreichung mittig
                : { art, page, original_text, zeilen, frei, text })
              : { art, page, x, y, w, h, bereich, text }),
        }
      : {}),
    consent: true,
  });

export const papierHochladen = (token: string, dateien: PapierDatei[]) =>
  call<{ ok: boolean; seiten: number }>({ action: "paper_upload", token, dateien });

export const holeDownload = (token: string) => call<{ url: string }>({ action: "download", token });

/* ---------- Formatierung ---------- */

export const datum = (iso: string | null | undefined) => {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
};

export const datumZeit = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const t = d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
  const z = d.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
  return `${t}, ${z} Uhr`;
};

/** „Herr Mustermann“ wenn Anrede bekannt, sonst der volle Name. */
export const grussName = (name: string, anrede?: string | null) => {
  const a = (anrede || "").trim();
  const nach = name.trim().split(/\s+/).pop() || name;
  if (/^herr/i.test(a)) return `Herr ${nach}`;
  if (/^frau/i.test(a)) return `Frau ${nach}`;
  return name.trim();
};

/**
 * Öffnet eine PDF-URL in neuem Tab. Das Fenster wird sofort (im Klick) geöffnet,
 * damit mobile Browser es nicht als Pop-up blockieren; die URL folgt nach dem Abruf.
 */
export async function oeffnePdf(holeUrl: () => Promise<string>) {
  const w = window.open("", "_blank");
  try {
    const url = await holeUrl();
    if (w && !w.closed) w.location.href = url;
    else window.location.href = url;
  } catch (e) {
    w?.close();
    throw e;
  }
}
