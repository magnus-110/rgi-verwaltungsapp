/**
 * Mehrere Erfassungssysteme und Gerätewechsel im laufenden Abrechnungszeitraum
 * ===========================================================================
 *
 * Zwei Fälle, die im Bestand regelmäßig vorkommen und die eine naive Verteilung
 * falsch rechnet:
 *
 * 1) EIN Gebäude, MEHRERE Erfassungssysteme — ein Teil der Wohnungen hängt an
 *    Wärmezählern, der Rest an Heizkostenverteilern. Die Verbrauchskosten
 *    werden über eine gemeinsame Bezugsgröße (MWh) zu EINEM Preis bewertet und
 *    dann auf die Systeme aufgeteilt, nicht je System separat. Nur so zahlt
 *    eine Kilowattstunde im ganzen Haus gleich viel.
 *    Im Bestand: Mittelgasse 1 und Hauptstr. 7-9.
 *
 * 2) GERÄTEWECHSEL mitten im Zeitraum. Alte und neue Geräte haben verschiedene
 *    Skalen, ihre Anzeigen sind nicht addierbar. Der Kostenblock des betroffenen
 *    Systems wird deshalb über einen Zeitfaktor (Gradtage) in zwei Teile
 *    zerlegt, die getrennt auf die jeweiligen Geräteeinheiten verteilt werden.
 *
 * Validiert gegen RegioMess, Mittelgasse 1, Umrüstung am 16.10.2025.
 */

import { eur, round } from './kern';
import type { ErfassungsSystem, Teilblock, VerbrauchsAufteilung } from './typen';

/**
 * Verteilt den Verbrauchskostenblock auf die Erfassungssysteme.
 * Alle Systeme werden mit demselben Preis je Bezugseinheit bewertet.
 */
export function teileVerbrauchskosten(
  verbrauchskosten: number,
  systeme: ErfassungsSystem[],
): VerbrauchsAufteilung {
  const gesamtMenge = systeme.reduce((s, x) => s + x.mengeGemeinsam, 0);
  if (gesamtMenge === 0) return { preisJeBezugseinheit: 0, bloecke: [] };

  const preis = verbrauchskosten / gesamtMenge;

  const bloecke: Teilblock[] = [];
  for (const s of systeme) {
    const betrag = eur(preis * s.mengeGemeinsam);
    if (!s.umruestung) {
      bloecke.push({ bezeichnung: s.bezeichnung, betrag, verbrauchKey: s.verbrauchKey });
      continue;
    }
    // Gerätewechsel: Block über den Zeitfaktor in zwei Abschnitte zerlegen
    const vor = eur(betrag * s.umruestung.zeitfaktorVor);
    const nach = eur(betrag - vor);
    bloecke.push({
      bezeichnung: `${s.bezeichnung} (bis ${s.umruestung.datum})`,
      betrag: vor,
      verbrauchKey: s.umruestung.verbrauchKeyVor,
    });
    bloecke.push({
      bezeichnung: `${s.bezeichnung} (ab ${s.umruestung.datum})`,
      betrag: nach,
      verbrauchKey: s.umruestung.verbrauchKeyNach,
    });
  }

  return { preisJeBezugseinheit: round(preis, 7), bloecke };
}
