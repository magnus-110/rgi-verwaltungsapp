/**
 * § 9a HeizkostenV — Ersatzwerte
 * ==============================
 *
 * Wenn ein Gerät ausfällt oder nicht abgelesen werden kann, darf der Verbrauch
 * ersatzweise ermittelt werden. Die Verordnung nennt drei Wege und schreibt
 * ihre Reihenfolge vor: erst der eigene Vorjahresverbrauch, dann vergleichbare
 * Räume derselben Wohnung, zuletzt der Durchschnitt des Hauses.
 *
 * Die zweite Regel wiegt schwerer als die erste: Betreffen die Ersatzwerte mehr
 * als 25 % der Wohn- oder Nutzfläche, darf überhaupt nicht mehr verbrauchs-
 * abhängig abgerechnet werden (§ 9a Abs. 2). Dann wird alles nach Fläche
 * verteilt. Das Modul rechnet das nicht still weg, sondern sperrt.
 */

import { round } from './kern';
import type { Pruefhinweis } from './typen';

export type ErsatzwertStufe = 1 | 2 | 3;

export interface ErsatzwertVorschlag {
  stufe: ErsatzwertStufe;
  bezeichnung: string;
  wert: number | null;
  begruendung: string;
  /** Wie viele Werte in den Vorschlag eingeflossen sind */
  basis: number;
}

export interface ErsatzwertEingang {
  /** Verbrauch desselben Geräts oder derselben Einheit im Vorjahr */
  vorjahrEigen?: number | null;
  /** Verbräuche vergleichbarer Räume derselben Nutzeinheit im selben Zeitraum */
  vergleichsraeume?: number[];
  /** Verbräuche aller übrigen Nutzeinheiten, flächenbezogen (Verbrauch je m²) */
  hausDurchschnittJeM2?: number | null;
  /** Fläche der betroffenen Nutzeinheit, für Stufe 3 */
  flaecheM2?: number | null;
}

/**
 * Liefert alle drei Stufen als Vorschlag — in der Reihenfolge der Verordnung.
 * Der Rechenkern wählt nicht selbst aus: die Entscheidung samt Begründung
 * gehört in die Abrechnung und damit in die Hand des Verwalters.
 */
export function ersatzwertVorschlaege(e: ErsatzwertEingang): ErsatzwertVorschlag[] {
  const vorschlaege: ErsatzwertVorschlag[] = [];

  vorschlaege.push({
    stufe: 1,
    bezeichnung: 'Vorjahresverbrauch derselben Nutzeinheit',
    wert: e.vorjahrEigen != null ? round(e.vorjahrEigen, 2) : null,
    begruendung: e.vorjahrEigen != null
      ? 'Verbrauch derselben Nutzeinheit im vergleichbaren Zeitraum des Vorjahres (§ 9a Abs. 1 Var. 1).'
      : 'Kein Vorjahreswert vorhanden.',
    basis: e.vorjahrEigen != null ? 1 : 0,
  });

  const raeume = (e.vergleichsraeume ?? []).filter((x) => Number.isFinite(x));
  vorschlaege.push({
    stufe: 2,
    bezeichnung: 'Vergleichsräume derselben Nutzeinheit',
    wert: raeume.length > 0
      ? round(raeume.reduce((s, x) => s + x, 0) / raeume.length, 2)
      : null,
    begruendung: raeume.length > 0
      ? `Mittelwert aus ${raeume.length} vergleichbaren Räumen derselben Nutzeinheit im selben Zeitraum (§ 9a Abs. 1 Var. 2).`
      : 'Keine vergleichbaren Räume mit Ablesewert vorhanden.',
    basis: raeume.length,
  });

  const proM2 = e.hausDurchschnittJeM2;
  const flaeche = e.flaecheM2;
  vorschlaege.push({
    stufe: 3,
    bezeichnung: 'Durchschnitt des Gebäudes',
    wert: proM2 != null && flaeche != null ? round(proM2 * flaeche, 2) : null,
    begruendung: proM2 != null && flaeche != null
      ? `Durchschnittsverbrauch des Gebäudes von ${round(proM2, 4)} je m², hochgerechnet auf ${flaeche} m² (§ 9a Abs. 1 Var. 3).`
      : 'Kein Gebäudedurchschnitt ermittelbar.',
    basis: proM2 != null ? 1 : 0,
  });

  return vorschlaege;
}

/** Der erste Vorschlag, der einen Wert liefert — die Reihenfolge der Verordnung. */
export function ersterBrauchbarerVorschlag(e: ErsatzwertEingang): ErsatzwertVorschlag | null {
  return ersatzwertVorschlaege(e).find((v) => v.wert != null) ?? null;
}

export interface ErsatzwertGrenzeEingang {
  /** Fläche der Nutzeinheiten, für die ein Ersatzwert angesetzt wurde */
  flaecheMitErsatzwert: number;
  /** Gesamte Abrechnungsfläche */
  flaecheGesamt: number;
}

export interface ErsatzwertGrenze {
  anteil: number;
  ueberschritten: boolean;
  hinweis: Pruefhinweis | null;
}

/**
 * § 9a Abs. 2: Die 25-%-Grenze.
 *
 * Wird sie überschritten, ist die verbrauchsabhängige Abrechnung unzulässig —
 * es muss vollständig nach Wohn- oder Nutzfläche verteilt werden.
 */
export function pruefeErsatzwertGrenze(e: ErsatzwertGrenzeEingang): ErsatzwertGrenze {
  if (e.flaecheGesamt <= 0) {
    return { anteil: 0, ueberschritten: false, hinweis: null };
  }
  const anteil = e.flaecheMitErsatzwert / e.flaecheGesamt;
  const ueberschritten = anteil > 0.25;

  return {
    anteil: round(anteil, 4),
    ueberschritten,
    hinweis: ueberschritten
      ? {
          schwere: 'fehler',
          norm: '§ 9a Abs. 2 HeizkostenV',
          text:
            `Für ${(anteil * 100).toFixed(1)} % der Abrechnungsfläche wurden Ersatzwerte angesetzt. ` +
            'Ab 25 % darf nicht mehr verbrauchsabhängig abgerechnet werden — die Kosten sind ' +
            'vollständig nach Wohn- oder Nutzfläche zu verteilen.',
        }
      : anteil > 0.15
        ? {
            schwere: 'warnung',
            norm: '§ 9a Abs. 2 HeizkostenV',
            text:
              `Ersatzwerte betreffen ${(anteil * 100).toFixed(1)} % der Abrechnungsfläche. ` +
              'Die Grenze von 25 % ist noch eingehalten, rückt aber näher.',
          }
        : null,
  };
}
