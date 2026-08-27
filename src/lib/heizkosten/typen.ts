/**
 * Heizkostenabrechnung — gemeinsame Typen
 * ======================================
 *
 * Alle Typen des Rechenkerns an einer Stelle. Der Kern kennt weder Supabase
 * noch React: er bekommt einen Eingang, liefert ein Ergebnis. Das macht ihn
 * testbar und die Abrechnung nachvollziehbar.
 */

// ────────────────────────────────────────────────────────────
// Brennstoff
// ────────────────────────────────────────────────────────────

/** Eine Bestandsschicht: Anfangsbestand oder eine Lieferung. */
export interface BrennstoffLayer {
  bezeichnung: string;
  /** Menge in l, kg oder kWh */
  menge: number;
  betrag: number;
  /** CO₂-Menge dieser Schicht in kg */
  co2Kg?: number;
  /** CO₂-Kosten dieser Schicht in EUR */
  co2Kosten?: number;
}

export interface FifoErgebnis {
  verbrauchMenge: number;
  verbrauchBetrag: number;
  verbrauchCo2Kg: number;
  verbrauchCo2Kosten: number;
  restbestandMenge: number;
  restbestandBetrag: number;
}

// ────────────────────────────────────────────────────────────
// § 9 — Trennung Heizung / Warmwasser
// ────────────────────────────────────────────────────────────

export type TrennungMethode =
  /** § 9 Abs. 2: Wärmemengenzähler misst die Wärme für die Warmwasserbereitung. */
  | { art: 'wmz'; wwWaermemengeKwh: number; gesamtWaermemengeKwh: number }
  /** § 9 Abs. 3: Formel. Nur zulässig, wenn kein Wärmezähler vorhanden ist. */
  | { art: 'formel'; wwVolumenM3: number; temperaturC: number; brennwertFaktor: number; gesamtEnergieKwh: number }
  /** Fester Prozentsatz — zum Nachrechnen fremder Abrechnungen. */
  | { art: 'vorgabe'; wwAnteil: number }
  /** Kein Warmwasser aus dieser Anlage. */
  | { art: 'keine' };

export interface TrennungErgebnis {
  wwEnergieKwh: number | null;
  wwAnteil: number;
  rechenweg: string;
  /** § 9 Abs. 2: fehlender Wärmemengenzähler → 15 % Kürzungsrecht (§ 12 Abs. 1) */
  warnungKeinWmz: boolean;
}

// ────────────────────────────────────────────────────────────
// Nutzeinheiten
// ────────────────────────────────────────────────────────────

/** Ein Nutzerzeitraum innerhalb einer Nutzeinheit (§ 9b bei Nutzerwechsel). */
export interface Nutzerzeitraum {
  name: string;
  von: string;
  bis: string;
  /** Zeitanteil nach Kalendertagen (0..1) — Warmwasser-Grundkosten und Sonstiges */
  anteilKalendertage: number;
  /** Zeitanteil nach Gradtagen (0..1) — Heizungs-Grundkosten, § 9b Abs. 2 */
  anteilGradtage: number;
  /** Erfasste Verbräuche dieses Zeitraums, je Verbrauchsschlüssel */
  verbrauch: Record<string, number>;
  /** Verweis auf die Zuordnung in der App, für das Zurückschreiben */
  assignmentId?: string | null;
  mappingId?: string | null;
}

export interface Nutzeinheit {
  id: string;
  bezeichnung: string;
  /** Abrechnungsfläche, nicht die Fläche aus der Teilungserklärung */
  flaecheM2: number;
  /** Zuordnung zu Nutzergruppen je Kostenbereich, z. B. { kaltwasser: 'NG1' } */
  nutzergruppen?: Record<string, string>;
  zeitraeume: Nutzerzeitraum[];
  unitNumber?: string | null;
  assignmentId?: string | null;
  mappingId?: string | null;
}

// ────────────────────────────────────────────────────────────
// Verteilung
// ────────────────────────────────────────────────────────────

/**
 * Fachliche Einordnung einer Verteilung. Entscheidet, in welche Spalte der
 * Betrag am Ende wandert — und damit, was in der Abrechnung als „Heizung
 * Grundkosten“ bzw. „Warmwasser Verbrauch“ erscheint.
 */
export type Kostenkategorie =
  | 'heizung_grund'
  | 'heizung_verbrauch'
  | 'warmwasser_grund'
  | 'warmwasser_verbrauch'
  | 'wasser'
  | 'sonstiges';

/** Ein einzelner Verteilungsvorgang. */
export interface Verteilung {
  bezeichnung: string;
  betrag: number;
  kategorie: Kostenkategorie;
  /** Bemessungsgrundlage je Einheit */
  basis: 'flaeche' | 'nutzeinheit' | { verbrauch: string };
  /** Zeitteilung bei Nutzerwechsel */
  zeitteilung: 'gradtage' | 'kalendertage' | 'keine';
  /** Nur diese Nutzergruppe berücksichtigen */
  nutzergruppe?: { bereich: string; gruppe: string };
  /** Direktzuordnung an eine einzelne Einheit */
  direktAn?: string;
}

export interface Posten {
  einheitId: string;
  zeitraum: string;
  bezeichnung: string;
  kategorie: Kostenkategorie;
  anteile: number;
  betragJeEinheit: number;
  betrag: number;
}

// ────────────────────────────────────────────────────────────
// CO₂
// ────────────────────────────────────────────────────────────

export interface Co2Ergebnis {
  emissionProM2: number;
  stufe: number;
  anteilMieter: number;
  anteilVermieter: number;
  kostenMieter: number;
  kostenVermieter: number;
}

// ────────────────────────────────────────────────────────────
// Prüfungen
// ────────────────────────────────────────────────────────────

export interface Pruefhinweis {
  schwere: 'fehler' | 'warnung' | 'hinweis';
  norm: string;
  text: string;
  /** Betroffene Einheit oder Gerät, wenn zuordenbar */
  betrifft?: string;
}

// ────────────────────────────────────────────────────────────
// Mehrere Erfassungssysteme
// ────────────────────────────────────────────────────────────

export interface ErfassungsSystem {
  bezeichnung: string;
  /** Anteil dieses Systems an der gemeinsamen Bezugsgröße (i. d. R. MWh) */
  mengeGemeinsam: number;
  /** Verbrauchsschlüssel für die Verteilung auf die Nutzeinheiten */
  verbrauchKey: string;
  /** Gerätewechsel im Zeitraum */
  umruestung?: {
    datum: string;
    /** Zeitfaktor für den Abschnitt VOR der Umrüstung, i. d. R. Gradtage */
    zeitfaktorVor: number;
    verbrauchKeyVor: string;
    verbrauchKeyNach: string;
  };
}

export interface Teilblock {
  bezeichnung: string;
  betrag: number;
  verbrauchKey: string;
}

export interface VerbrauchsAufteilung {
  preisJeBezugseinheit: number;
  bloecke: Teilblock[];
}

// ────────────────────────────────────────────────────────────
// Eingang und Ergebnis einer Abrechnung
// ────────────────────────────────────────────────────────────

/** Eine Kostenposition aus der Buchhaltung. */
export interface Kostenposition {
  konto?: string | null;
  bezeichnung: string;
  betrag: number;
  /**
   * Was die Position betrifft — die Messdienste drucken das als H), W), H/W).
   * 'beides' wird nach dem Warmwasseranteil gequotelt, die anderen nicht.
   */
  art: 'heizung' | 'warmwasser' | 'beides';
}

export interface AbrechnungEingang {
  anlage: {
    name: string;
    energieart: string;
    abrechnungsflaecheM2: number;
    zeitraum: { von: string; bis: string };
    /** Anteil der Grundkosten; Rest = Verbrauchskosten. Zulässig 0,30–0,50. */
    gkAnteilHeizung: number;
    gkAnteilWarmwasser: number;
    trennung: TrennungMethode;
    /**
     * Rundung des Warmwasseranteils vor Anwendung auf die Kosten.
     * 'prozent2' rundet auf zwei Nachkommastellen in Prozent (RegioMess,
     * BRUNATA), 'exakt' rechnet ungerundet weiter (Allgäu Messpartner).
     */
    rundungWwAnteil?: 'prozent2' | 'exakt';
  };
  kosten: Kostenposition[];
  einheiten: Nutzeinheit[];
  /** Verbrauchsschlüssel, wenn es nur ein Erfassungssystem gibt */
  heizungVerbrauchKey: string;
  warmwasserVerbrauchKey: string;
  /** Mehrere Erfassungssysteme für die Heizung (Wärmezähler neben Verteilern) */
  erfassungHeizung?: ErfassungsSystem[];
  /** Kaltwasser, Direktumlagen und alles Weitere */
  sonstige?: Verteilung[];
  co2?: { kg: number; kosten: number };
}

/** Ergebnis je Nutzeinheit und Zeitraum — bildet heating_settlement_items ab. */
export interface EinheitErgebnis {
  einheitId: string;
  zeitraum: string;
  bezeichnung: string;
  unitNumber?: string | null;
  assignmentId?: string | null;
  mappingId?: string | null;
  von?: string;
  bis?: string;
  flaecheM2: number;
  heizungGrund: number;
  heizungVerbrauch: number;
  warmwasserGrund: number;
  warmwasserVerbrauch: number;
  wasser: number;
  sonstiges: number;
  gesamt: number;
  posten: Posten[];
}

export interface AbrechnungErgebnis {
  engineVersion: string;
  /** Kosten nach der Trennung */
  kostenGesamt: number;
  kostenHeizung: number;
  kostenWarmwasser: number;
  kostenSonstige: number;
  wwAnteil: number;
  rechenwegTrennung: string;
  /** Preis je Bezugseinheit, wenn mehrere Erfassungssysteme im Spiel sind */
  erfassungAufteilung?: VerbrauchsAufteilung;
  posten: Posten[];
  summeJeSchluessel: Record<string, number>;
  jeEinheit: EinheitErgebnis[];
  hinweise: Pruefhinweis[];
  co2?: Co2Ergebnis;
}
