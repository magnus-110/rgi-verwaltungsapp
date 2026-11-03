// Elektronische Unterschrift – Ausfüllfelder (Tabelle sign_request_fields).
// Feldarten: ankreuz (einzeln) · auswahl („genau eins“ je gruppe) · datum · text.
// Unterschriftsfelder bleiben in sign_request_signers.placements (typ „unterschrift“ wird beim
// Anlegen dorthin umgesetzt). Koordinaten wie placements: page 0-basiert, PDF-Punkte, oben links.
import { Fehler, uuidOderNull, zeile } from "./basis.ts";
import type { Db } from "./basis.ts";
import { freiPruefen, ibanFehler, ibanGruppiert, istIbanFeld, zeilenPruefen, type Frei, type TextZeile } from "./ersetzung.ts";

// vorbelegt = Angabe steht schon im PDF (ausgangswert an text_zeilen); der Unterzeichner darf sie ändern.
export const FELD_TYPEN = ["ankreuz", "auswahl", "datum", "text", "vorbelegt"] as const;
export type FeldTyp = typeof FELD_TYPEN[number];
export const MAX_FELDER = 60;
export const TEXT_MAX = 200;

export type Abhaengigkeit = { feld_key: string } | { gruppe: string; option: string };

/** Zeile aus sign_request_fields (Auszug). */
export interface Feld {
  id: string;
  request_id: string;
  feld_key: string;
  typ: FeldTyp;
  position: number;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  beschriftung: string;
  gruppe: string | null;
  option: string | null;
  ausfueller: "rgi" | "unterzeichner";
  signer_id: string | null;
  ausfueller_rolle: string | null;
  pflicht: boolean;
  abhaengig_von: Abhaengigkeit | null;
  max_laenge: number | null;
  wert: string | null;
  wert_gesetzt_von: string | null;
  wert_gesetzt_signer_id: string | null;
  wert_gesetzt_user_id: string | null;
  wert_gesetzt_am: string | null;
  quelle: string;
  anker: { page: number; x: number; y: number; w: number; h: number } | null;
  /** Reihenfolge im Formular (null = Lesereihenfolge) */
  reihenfolge?: number | null;
  /** Untertyp eines Textfeldes: „iban“ */
  format?: string | null;
  /** Datum mit heute vorbelegen (null = automatisch bei Beschriftung „Datum“) */
  heute_vorbelegen?: boolean | null;
  /** nur vorbelegt: Text im PDF, seine Zeilen und der freie Platz daneben */
  ausgangswert?: string | null;
  text_zeilen?: TextZeile[] | null;
  frei?: Frei | null;
}

export const VORBELEGT_MAX = 300;

const KEY_RE = /^[a-z0-9][a-z0-9_.-]{0,59}$/;
const DATUM_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Datum JJJJ-MM-TT prüfen (echtes Kalenderdatum, Jahr 1900–2100). */
export function gueltigesDatum(v: string): boolean {
  const m = DATUM_RE.exec(v);
  if (!m) return false;
  const [j, mo, t] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (j < 1900 || j > 2100) return false;
  const d = new Date(Date.UTC(j, mo - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === mo - 1 && d.getUTCDate() === t;
}

/** TT.MM.JJJJ */
export const datumDe = (v: string) => {
  const m = DATUM_RE.exec(v);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : v;
};

/** Wert in die gespeicherte Form bringen (oder Fehlermeldung). null = leer. */
export function wertNormalisieren(f: Pick<Feld, "typ" | "beschriftung" | "max_laenge"> & { format?: string | null }, roh: unknown): string | null {
  if (roh === undefined || roh === null || roh === "" || roh === false) return null;
  const name = f.beschriftung || "Feld";
  switch (f.typ) {
    case "ankreuz":
    case "auswahl":
      if (roh === true || roh === "ja" || roh === "true" || roh === 1) return "ja";
      throw new Fehler(400, `„${name}“: ungültiger Wert.`);
    case "datum": {
      const s = String(roh).trim();
      // auch TT.MM.JJJJ annehmen
      const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
      const iso = de ? `${de[3]}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}` : s;
      if (!gueltigesDatum(iso)) throw new Fehler(400, `„${name}“: Bitte ein gültiges Datum eingeben.`);
      return iso;
    }
    case "text": {
      const max = Math.min(f.max_laenge ?? TEXT_MAX, 500);
      const s = zeile(roh, 2000);
      if (!s) return null;
      if (istIbanFeld(f)) {
        // IBAN: Prüfziffer prüfen, in 4er-Blöcken speichern
        const fehler = ibanFehler(s);
        if (fehler) throw new Fehler(400, `„${name}“: ${fehler}`);
        return ibanGruppiert(s);
      }
      if (s.length > max) throw new Fehler(400, `„${name}“: höchstens ${max} Zeichen.`);
      return s;
    }
    case "vorbelegt": {
      const s = zeile(roh, 2000);
      if (!s) return null;
      if (s.length > VORBELEGT_MAX) throw new Fehler(400, `„${name}“: höchstens ${VORBELEGT_MAX} Zeichen.`);
      return s;
    }
  }
  return null;
}

/** Ist das Feld aktiv (Abhängigkeit erfüllt)? `wert(key)` liefert den aktuellen Wert eines Feldes. */
export function istAktiv(f: Pick<Feld, "abhaengig_von">, felder: Pick<Feld, "feld_key" | "gruppe" | "option">[], wert: (key: string) => string | null): boolean {
  const a = f.abhaengig_von as Record<string, string> | null;
  if (!a) return true;
  if (a.feld_key) return wert(a.feld_key) === "ja";
  if (a.gruppe && a.option) {
    const ziel = felder.find((x) => x.gruppe === a.gruppe && x.option === a.option);
    return !!ziel && wert(ziel.feld_key) === "ja";
  }
  return true;
}

/** Anzeigename einer Auswahlgruppe (für Meldungen). */
function gruppenName(gruppe: string): string {
  const g = gruppe.replace(/_/g, " ");
  return g.charAt(0).toUpperCase() + g.slice(1);
}

/**
 * Prüft die Werte vollständig (Pflicht, Gruppe genau eins, Abhängigkeiten) für die Felder in `bereich`
 * (z. B. alle Felder eines Unterzeichners). `werte` = alle aktuellen Werte (inkl. vorab gesetzter).
 * Liefert die erste Fehlermeldung oder null.
 */
export function vollstaendigPruefen(felder: Feld[], bereich: (f: Feld) => boolean, werte: Map<string, string | null>): string | null {
  const w = (k: string) => werte.get(k) ?? null;
  const gruppen = new Map<string, Feld[]>();
  const einzeln: Feld[] = [];
  for (const f of felder.filter(bereich)) {
    if (f.typ === "auswahl" && f.gruppe) gruppen.set(f.gruppe, [...(gruppen.get(f.gruppe) ?? []), f]);
    else einzeln.push(f);
  }
  // Zuerst die Auswahlgruppen (genau eins), dann die übrigen Felder (Pflicht, nur wenn aktiv)
  for (const [g, liste] of gruppen) {
    // Gruppe vollständig betrachten (auch Optionen anderer Bereiche zählen mit)
    const alle = felder.filter((f) => f.typ === "auswahl" && f.gruppe === g);
    const aktiv = alle.filter((f) => istAktiv(f, felder, w));
    const gewaehlt = aktiv.filter((f) => w(f.feld_key) === "ja");
    if (gewaehlt.length > 1) return `„${gruppenName(g)}“: Bitte nur eine Möglichkeit wählen.`;
    if (!gewaehlt.length && liste.some((f) => f.pflicht) && aktiv.length) {
      return `„${gruppenName(g)}“: Bitte genau eine Möglichkeit wählen.`;
    }
  }
  for (const f of einzeln) {
    if (!istAktiv(f, felder, w)) continue;
    if (f.pflicht && !w(f.feld_key)) {
      return f.typ === "ankreuz"
        ? `Bitte „${f.beschriftung || "Ankreuzfeld"}“ ankreuzen.`
        : `Bitte „${f.beschriftung || "Feld"}“ ausfüllen.`;
    }
  }
  return null;
}

/** Felder eines Vorgangs laden (sortiert). */
export async function felderLaden(db: Db, requestId: string): Promise<Feld[]> {
  const { data, error } = await db.from("sign_request_fields").select("*").eq("request_id", requestId)
    .order("position", { ascending: true }).order("created_at", { ascending: true });
  if (error) {
    console.error("[felder] laden:", error.message);
    return [];
  }
  return (data ?? []).map((f: Feld) => ({ ...f, x: Number(f.x), y: Number(f.y), w: Number(f.w), h: Number(f.h) }));
}

// ================================================================ Anlegen

/** Eingabe aus create (App, Konnektor). ausfueller: "rgi" | "signer:<index>" | "rolle:<key>" | Index (Zahl). */
// deno-lint-ignore no-explicit-any
type Roh = any;

export interface SignerRef {
  index: number;
  methode: string;
  rolle_key: string | null;
  rolle: string | null;
}

/** Wer füllt aus? → { art, index } (Index in der Unterzeichnerliste) oder Fehler. */
function ausfuellerAufloesen(roh: unknown, signers: SignerRef[], name: string): { art: "rgi" } | { art: "unterzeichner"; index: number; rolle: string | null } {
  const externe = signers.filter((s) => s.methode !== "intern");
  const erster = () => {
    if (!externe.length) throw new Fehler(400, `${name}: Es gibt keinen externen Unterzeichner, der das Feld ausfüllen kann.`);
    return externe[0];
  };
  if (roh === undefined || roh === null || roh === "") {
    const s = erster();
    return { art: "unterzeichner", index: s.index, rolle: null };
  }
  if (roh === "rgi") return { art: "rgi" };
  const s = String(roh);
  const idx = typeof roh === "number" ? roh : /^signer:(\d+)$/.exec(s)?.[1];
  if (idx !== undefined && idx !== null) {
    const n = Number(idx);
    const t = signers.find((x) => x.index === n);
    if (!t) throw new Fehler(400, `${name}: Unterzeichner ${n + 1} gibt es nicht.`);
    if (t.methode === "intern") throw new Fehler(400, `${name}: Interne Unterzeichner können keine Felder ausfüllen – „RGI (vorab)“ wählen.`);
    return { art: "unterzeichner", index: n, rolle: null };
  }
  const rolle = /^rolle:(.+)$/.exec(s)?.[1] ?? s;
  if (rolle === "rgi" || rolle === "verwaltung") return { art: "rgi" };
  // Rolle (z. B. „gdw“): Unterzeichner mit diesem Rollenschlüssel, sonst der erste externe
  const t = externe.find((x) => x.rolle_key === rolle) ?? erster();
  return { art: "unterzeichner", index: t.index, rolle };
}

export interface FeldPlan {
  zeile: Record<string, unknown>; // ohne request_id/signer_id
  signerIndex: number | null;
}

/**
 * Felder aus create prüfen. Unterschriftsfelder (typ „unterschrift“) werden zurückgegeben, damit sie als
 * placements des Unterzeichners gespeichert werden. Vorab-Werte („rgi“) werden hier festgeschrieben.
 */
export function felderPlanen(roh: unknown, seiten: number, signers: SignerRef[], userId: string | null, userName: string | null, masse?: { w: number; h: number }[]): {
  felder: FeldPlan[];
  unterschriften: { signerIndex: number | "rgi"; page: number; x: number; y: number; w: number; h: number }[];
} {
  if (roh == null) return { felder: [], unterschriften: [] };
  if (!Array.isArray(roh)) throw new Fehler(400, "Felder sind ungültig.");
  if (roh.length > MAX_FELDER) throw new Fehler(400, `Höchstens ${MAX_FELDER} Felder je Dokument.`);
  const felder: FeldPlan[] = [];
  const unterschriften: { signerIndex: number | "rgi"; page: number; x: number; y: number; w: number; h: number }[] = [];
  const keys = new Set<string>();
  const jetzt = new Date().toISOString();

  roh.forEach((f: Roh, i: number) => {
    const typ = String(f?.typ || "");
    const beschriftung = zeile(f?.beschriftung, 160);
    const name = beschriftung ? `Feld „${beschriftung}“` : `Feld ${i + 1}`;
    const z = { page: Number(f?.page), x: Number(f?.x), y: Number(f?.y), w: Number(f?.w), h: Number(f?.h) };
    if (!Number.isInteger(z.page) || z.page < 0 || z.page >= seiten) throw new Fehler(400, `${name} liegt auf einer Seite, die es nicht gibt.`);
    if (![z.x, z.y, z.w, z.h].every(Number.isFinite) || z.w <= 0 || z.h <= 0 || z.w > 3000 || z.h > 3000 || z.x < -50 || z.y < -50) {
      throw new Fehler(400, `${name} hat ungültige Maße.`);
    }
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const lage = { page: z.page, x: r1(z.x), y: r1(z.y), w: r1(z.w), h: r1(z.h) };

    const wer = ausfuellerAufloesen(f?.ausfueller, signers, name);
    if (typ === "unterschrift") {
      unterschriften.push({ signerIndex: wer.art === "rgi" ? "rgi" : wer.index, ...lage });
      return;
    }
    if (!(FELD_TYPEN as readonly string[]).includes(typ)) throw new Fehler(400, `${name}: unbekannte Feldart „${typ}“.`);
    let key = zeile(f?.feld_key, 60).toLowerCase();
    if (!key) key = `${typ}_${i + 1}`;
    if (!KEY_RE.test(key)) throw new Fehler(400, `${name}: ungültiger Schlüssel.`);
    if (keys.has(key)) throw new Fehler(400, `Feld-Schlüssel „${key}“ ist doppelt.`);
    keys.add(key);
    const gruppe = typ === "auswahl" ? zeile(f?.gruppe, 60).toLowerCase() || null : null;
    const option = typ === "auswahl" ? zeile(f?.option, 60).toLowerCase() || key : null;
    if (typ === "auswahl" && !gruppe) throw new Fehler(400, `${name}: Auswahlfelder brauchen eine Gruppe.`);
    const max = typ === "text" ? Math.max(1, Math.min(500, Number(f?.max_laenge) || TEXT_MAX)) : null;
    let abh: Abhaengigkeit | null = null;
    const a = f?.abhaengig_von;
    if (a && typeof a === "object") {
      if (a.feld_key) abh = { feld_key: zeile(a.feld_key, 60).toLowerCase() };
      else if (a.gruppe && a.option) abh = { gruppe: zeile(a.gruppe, 60).toLowerCase(), option: zeile(a.option, 60).toLowerCase() };
    }
    const format = typ === "text" && f?.format === "iban" ? "iban" : null;
    if (f?.format != null && f.format !== "" && !format) throw new Fehler(400, `${name}: unbekannter Untertyp „${zeile(f.format, 20)}“ (nur „iban“ bei Textfeldern).`);
    const heute = typ === "datum" && typeof f?.heute_vorbelegen === "boolean" ? f.heute_vorbelegen : null;
    let reihenfolge: number | null = null;
    if (f?.reihenfolge !== undefined && f?.reihenfolge !== null && f?.reihenfolge !== "") {
      const r = Number(f.reihenfolge);
      if (!Number.isInteger(r) || r < 0 || r > 9999) throw new Fehler(400, `${name}: ungültige Reihenfolge.`);
      reihenfolge = r;
    }
    // Vorbelegte, änderbare Angabe: Text steht im PDF; Zeilen und freier Platz aus der Textebene
    let vorbelegt: { ausgangswert: string; text_zeilen: TextZeile[]; frei: Frei } | null = null;
    if (typ === "vorbelegt") {
      if (wer.art === "rgi") throw new Fehler(400, `${name}: Eine änderbare Angabe muss einem Unterzeichner gehören.`);
      const ausgangswert = zeile(f?.ausgangswert, 1000);
      if (!ausgangswert) throw new Fehler(400, `${name}: Der Text aus dem Dokument fehlt.`);
      if (ausgangswert.length > VORBELEGT_MAX) throw new Fehler(400, `${name}: höchstens ${VORBELEGT_MAX} Zeichen.`);
      const seite = masse?.[z.page] ?? { w: 3000, h: 3000 };
      try {
        const text_zeilen = zeilenPruefen(f?.text_zeilen, seite, name);
        vorbelegt = { ausgangswert, text_zeilen, frei: freiPruefen(f?.frei, text_zeilen, seite) };
      } catch (e) {
        throw new Fehler(400, e instanceof Error ? e.message : String(e));
      }
    }
    const basis = { typ, beschriftung, max_laenge: max, format } as Pick<Feld, "typ" | "beschriftung" | "max_laenge" | "format">;
    const wert = wer.art === "rgi" ? wertNormalisieren(basis, f?.wert) : null;
    const anker = f?.anker && typeof f.anker === "object" && Number.isInteger(Number(f.anker.page))
      ? { page: Number(f.anker.page), x: Number(f.anker.x) || 0, y: Number(f.anker.y) || 0, w: Number(f.anker.w) || 1, h: Number(f.anker.h) || 1 }
      : null;
    felder.push({
      signerIndex: wer.art === "unterzeichner" ? wer.index : null,
      zeile: {
        feld_key: key,
        typ,
        position: i,
        ...lage,
        beschriftung,
        gruppe,
        option,
        ausfueller: wer.art,
        ausfueller_rolle: wer.art === "unterzeichner" ? wer.rolle : "rgi",
        pflicht: f?.pflicht === true,
        abhaengig_von: abh,
        max_laenge: max,
        wert,
        wert_gesetzt_von: wert ? (userName || "RGI Immobilien") : null,
        wert_gesetzt_user_id: wert ? uuidOderNull(userId) : null,
        wert_gesetzt_am: wert ? jetzt : null,
        quelle: ["vorlage", "vorschlag"].includes(f?.quelle) ? f.quelle : "manuell",
        anker,
        reihenfolge,
        format,
        heute_vorbelegen: heute,
        ausgangswert: vorbelegt?.ausgangswert ?? null,
        text_zeilen: vorbelegt?.text_zeilen ?? null,
        frei: vorbelegt?.frei ?? null,
      },
    });
  });

  // Reihenfolge im Formular: angegebene Werte zuerst, sonst Lesereihenfolge (Seite, y, x).
  // Möglichkeiten einer Auswahl bleiben zusammen (Rang der Gruppe = kleinster Rang einer Möglichkeit).
  {
    const lese = [...felder].sort((a, b) => {
      const p = a.zeile as Record<string, number>, q = b.zeile as Record<string, number>;
      return p.page - q.page || Math.round(p.y) - Math.round(q.y) || p.x - q.x;
    });
    const rang = new Map<FeldPlan, number>();
    lese.forEach((p, i) => {
      const r = p.zeile.reihenfolge as number | null;
      rang.set(p, r !== null ? r : 10000 + i);
    });
    const gruppenRang = new Map<string, number>();
    for (const p of felder) {
      const g = p.zeile.gruppe as string | null;
      if (p.zeile.typ === "auswahl" && g) gruppenRang.set(g, Math.min(gruppenRang.get(g) ?? Infinity, rang.get(p)!));
    }
    const sortiert = [...lese].sort((a, b) => {
      const ga = a.zeile.typ === "auswahl" ? gruppenRang.get(a.zeile.gruppe as string) : undefined;
      const gb = b.zeile.typ === "auswahl" ? gruppenRang.get(b.zeile.gruppe as string) : undefined;
      return (ga ?? rang.get(a)!) - (gb ?? rang.get(b)!) || rang.get(a)! - rang.get(b)!;
    });
    sortiert.forEach((p, i) => { p.zeile.reihenfolge = i + 1; });
  }

  // Abhängigkeiten müssen auf vorhandene Felder zeigen
  const alle = felder.map((p) => p.zeile as unknown as Feld);
  for (const p of felder) {
    const a = p.zeile.abhaengig_von as Record<string, string> | null;
    if (!a) continue;
    const ok = a.feld_key ? alle.some((x) => x.feld_key === a.feld_key && x.typ === "ankreuz")
      : alle.some((x) => x.typ === "auswahl" && x.gruppe === a.gruppe && x.option === a.option);
    if (!ok) throw new Fehler(400, `Feld „${p.zeile.beschriftung || p.zeile.feld_key}“ hängt von einem Feld ab, das es nicht gibt.`);
  }
  // Vorab-Werte (RGI) müssen in sich stimmig sein: aktive RGI-Pflichtfelder gefüllt, Gruppen höchstens eins
  const werte = new Map(alle.map((x) => [x.feld_key, x.wert ?? null]));
  const fehler = vollstaendigPruefen(alle, (x) => x.ausfueller === "rgi", werte);
  if (fehler) throw new Fehler(400, `Vorab-Werte (RGI): ${fehler}`);
  // Eine Auswahlgruppe gehört genau einem Ausfüller
  const besitzer = new Map<string, string>();
  for (const x of alle.filter((x) => x.typ === "auswahl")) {
    const wer = x.ausfueller === "rgi" ? "rgi" : String(felder.find((p) => p.zeile.feld_key === x.feld_key)?.signerIndex);
    if (besitzer.has(x.gruppe!) && besitzer.get(x.gruppe!) !== wer) {
      throw new Fehler(400, `Alle Möglichkeiten der Auswahl „${x.gruppe}“ müssen von derselben Person ausgefüllt werden.`);
    }
    besitzer.set(x.gruppe!, wer);
  }
  return { felder, unterschriften };
}

// ================================================================ Ausfüllen beim Unterschreiben

/**
 * Prüft die Eingaben eines Unterzeichners serverseitig vollständig: nur eigene Felder, Typ, Datum,
 * Länge, Gruppe genau eins, Abhängigkeiten, Pflicht. Liefert die zu speichernden Werte je Feld-ID
 * (inaktive eigene Felder werden geleert).
 */
export function eingabenPruefen(felder: Feld[], signerId: string, roh: unknown): Map<string, string | null> {
  const eigene = felder.filter((f) => f.ausfueller === "unterzeichner" && f.signer_id === signerId);
  const eingabe: Record<string, unknown> = roh && typeof roh === "object" && !Array.isArray(roh) ? roh as Record<string, unknown> : {};
  for (const k of Object.keys(eingabe)) {
    const f = felder.find((x) => x.id === k || x.feld_key === k);
    if (!f) throw new Fehler(400, "Unbekanntes Feld.");
    if (!eigene.includes(f)) throw new Fehler(403, `„${f.beschriftung || "Feld"}“ füllt jemand anderes aus.`);
  }
  const werte = new Map<string, string | null>(felder.map((f) => [f.feld_key, f.typ === "vorbelegt" ? f.wert ?? f.ausgangswert ?? null : f.wert ?? null]));
  for (const f of eigene) {
    const v = eingabe[f.id] ?? eingabe[f.feld_key];
    if (f.typ === "vorbelegt") {
      // nicht übermittelt = unverändert; leer ist nicht erlaubt (der Text steht ja im Dokument)
      const n = v === undefined ? f.ausgangswert ?? null : wertNormalisieren(f, v);
      if (!n) throw new Fehler(400, `„${f.beschriftung || "Angabe"}“ darf nicht leer sein. Bitte den richtigen Wert eintragen.`);
      werte.set(f.feld_key, n);
      continue;
    }
    werte.set(f.feld_key, wertNormalisieren(f, v));
  }
  const fehler = vollstaendigPruefen(felder, (f) => eigene.includes(f), werte);
  if (fehler) throw new Fehler(400, fehler);
  const w = (k: string) => werte.get(k) ?? null;
  const out = new Map<string, string | null>();
  for (const f of eigene) {
    if (f.typ === "vorbelegt") {
      // gespeichert wird nur ein geänderter Wert (null = unverändert)
      const n = w(f.feld_key);
      out.set(f.id, n && n !== (f.ausgangswert ?? "").trim() ? n : null);
      continue;
    }
    out.set(f.id, istAktiv(f, felder, w) ? w(f.feld_key) : null);
  }
  return out;
}

/** Text eines Wertes für Nachweis/Protokoll. */
export function wertText(f: Pick<Feld, "typ" | "wert"> & { ausgangswert?: string | null }): string {
  if (f.typ === "vorbelegt") return f.wert ? `${f.ausgangswert ?? ""} → ${f.wert}` : "unverändert";
  if (!f.wert) return "–";
  if (f.typ === "datum") return datumDe(f.wert);
  if (f.typ === "ankreuz" || f.typ === "auswahl") return "angekreuzt";
  return f.wert;
}
