/**
 * Aufnahme neuer Liegenschaften – Datenform und Hilfen.
 *
 * Alles vom Termin vor Ort steht als ein JSON-Dokument in
 * `aufnahmen.antworten`. Dienstleister stehen NICHT darin, sondern wie
 * überall in der App in contact_building_assignments (Rolle "dienstleister").
 */

export type JaNein = "Ja" | "Nein" | "Weiß nicht";

export interface MitText {
  wert?: JaNein | null;
  text?: string;
}

export interface Person {
  name: string;
  whg?: string;
  /** zugeordneter Eigentümer, falls schon im System */
  assignmentId?: string | null;
}

export interface PersonenFrage {
  wert?: "Ja" | "Nein" | null;
  personen?: Person[];
}

export interface AufnahmeAntworten {
  /** Kategorie → "selbst" (machen die Eigentümer) oder "keiner" (gibt es nicht) */
  dienstleister?: Record<string, "selbst" | "keiner">;
  heizung?: {
    art?: string | null;
    oelStand?: string;
    oelKapazitaet?: string;
    oelAnzeige?: JaNein | null;
    oelMelder?: string | null;
    oelMelderName?: string;
    wartung?: JaNein | null;
    enthaertung?: JaNein | null;
    funk?: JaNein | null;
    legionellen?: string;
    besonderheiten?: string;
  };
  haus?: {
    aufzug?: JaNein | null;
    hausordnung?: JaNein | null;
    hausordnungOrt?: string;
    besonderheiten?: string;
    vertraege?: string;
  };
  schluessel?: {
    anlage?: JaNein | null;
    karte?: string;
    halter?: { name: string; anzahl: number }[];
  };
  verwaltung?: {
    wj?: string | null;
    wjAnders?: string;
    kredite?: MitText;
    vermoegen?: MitText;
    angestellte?: MitText;
    bau?: MitText;
    offen?: { wert?: JaNein | null; zeilen?: string[] };
    unterlagen?: string[];
  };
  beirat?: {
    beirat?: PersonenFrage;
    kasse?: PersonenFrage;
    ansprech?: PersonenFrage;
    etvOrt?: string;
    etvZeit?: string | null;
    stimmung?: string;
  };
  /** Antworten aus der alten "Übernahme", nur zum Nachlesen */
  alt?: { frage: string; antwort: string }[];
}

/** Kategorien beim Termin, mit dem Namen der Dienstleister-Kategorie in der App. */
export const DL_KATEGORIEN: { label: string; kategorie: string }[] = [
  { label: "Hausmeister", kategorie: "Hausmeister" },
  { label: "Winterdienst", kategorie: "Winterdienst" },
  { label: "Garten", kategorie: "Gartenpflege" },
  { label: "Treppenhausreinigung", kategorie: "Reinigung" },
  { label: "Papiertonne", kategorie: "Papiertonne" },
  { label: "Heizung", kategorie: "Heizung/Sanitär" },
  { label: "Feuerlöscher", kategorie: "Brandschutz" },
  { label: "Aufzug", kategorie: "Aufzugsservice" },
  { label: "Ablesefirma", kategorie: "Ablesefirma" },
  { label: "Versicherung", kategorie: "Versicherung" },
  { label: "Schornsteinfeger", kategorie: "Schornsteinfeger" },
  { label: "Zimmerer", kategorie: "Zimmerei" },
  { label: "Elektriker", kategorie: "Elektriker" },
];

export const labelZuKategorie = (label: string) => DL_KATEGORIEN.find((k) => k.label === label)?.kategorie ?? label;
export const kategorieZuLabel = (kat: string | null | undefined) =>
  DL_KATEGORIEN.find((k) => k.kategorie === kat)?.label ?? kat ?? "Sonstiges";

export const HEIZARTEN = ["Gas", "Öl", "Wärmepumpe", "Fernwärme", "Pellets", "Sonstiges"];

export const UNTERLAGEN = [
  "Eigentümerliste",
  "Beschlusssammlung",
  "Teilungserklärung & Aufteilungsplan",
  "Letzte Jahresabrechnung",
  "Wirtschaftsplan",
  "Kontoauszüge & Kontenübersicht",
  "Buchungsjournal",
  "Verträge",
  "Versicherungspolicen",
  "Hausordnung",
];

export const ORTE = ["Dach", "Fassade", "Treppenhaus", "Keller", "Heizraum", "Tiefgarage", "Außenanlage", "In einer Wohnung"];

export type ThemaId = "dienstleister" | "heizung" | "haus" | "schluessel" | "verwaltung" | "beirat";

export const THEMEN: { id: ThemaId; titel: string; text: string }[] = [
  { id: "dienstleister", titel: "Dienstleister", text: "Wer macht was am Haus? Firma einmal anlegen, dann ihre Aufgaben antippen." },
  { id: "heizung", titel: "Heizung", text: "Nur antippen. Weitere Fragen erscheinen erst, wenn sie passen." },
  { id: "haus", titel: "Haus & Technik", text: "Beim Rundgang: Technik im Haus, Hausordnung und was auffällt." },
  { id: "schluessel", titel: "Schlüssel", text: "Schließanlage und wer welche Schlüssel hat." },
  { id: "verwaltung", titel: "Verwaltung & Geld", text: "Vor allem an die Vorverwaltung: Geld, Pflichten, offene Themen und Unterlagen." },
  { id: "beirat", titel: "Beirat & Versammlung", text: "Namen so eintragen, wie sie fallen. Ist die Person schon im System, ordnet die App sie zu." },
];

const da = (v: unknown) => v !== undefined && v !== null && v !== "";
const mitText = (m?: MitText) => da(m?.wert);
const personen = (p?: PersonenFrage) => da(p?.wert);

/** Beantwortet / gesamt je Thema – Folgefragen zählen nur, wenn sie gezeigt werden. */
export function fortschritt(a: AufnahmeAntworten, dlAnzahl: Record<string, number>): Record<ThemaId, [number, number]> {
  const dlGeklaert = DL_KATEGORIEN.filter((k) => (dlAnzahl[k.kategorie] ?? 0) > 0 || da(a.dienstleister?.[k.label])).length;
  const h = a.heizung ?? {};
  const heizFragen = [h.art, h.wartung, h.enthaertung, h.funk, h.legionellen];
  if (h.art === "Öl") heizFragen.push(h.oelAnzeige, h.oelMelder);
  const hs = a.haus ?? {};
  const s = a.schluessel ?? {};
  const v = a.verwaltung ?? {};
  const b = a.beirat ?? {};
  const z = (xs: unknown[]) => [xs.filter(da).length, xs.length] as [number, number];
  return {
    dienstleister: [dlGeklaert, DL_KATEGORIEN.length],
    heizung: z(heizFragen),
    haus: z([hs.aufzug, hs.hausordnung]),
    schluessel: z([s.anlage, (s.halter ?? []).length ? "x" : null]),
    verwaltung: [
      [v.wj, mitText(v.kredite) ? 1 : null, mitText(v.vermoegen) ? 1 : null, mitText(v.angestellte) ? 1 : null, mitText(v.bau) ? 1 : null, v.offen?.wert].filter(da).length,
      6,
    ],
    beirat: [[personen(b.beirat) ? 1 : null, personen(b.kasse) ? 1 : null, personen(b.ansprech) ? 1 : null, b.etvOrt].filter(da).length, 4],
  };
}

/** Wirtschaftsjahr → Beginn (Tag, Monat) im Gebäude */
export function wjBeginn(wj: string | null | undefined): { tag: number; monat: number } | null {
  if (wj === "Kalenderjahr") return { tag: 1, monat: 1 };
  if (wj === "01.07. – 30.06.") return { tag: 1, monat: 7 };
  return null;
}

/** Name ohne Anrede, klein – für die Suche in der Eigentümerliste */
export const suchName = (n: string) =>
  n.toLowerCase().replace(/^(herr|frau|hr\.?|fr\.?|familie|fam\.?)\s+/, "").trim();
