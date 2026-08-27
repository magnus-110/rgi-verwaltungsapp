/**
 * Prüfungen der Heizkostenabrechnung
 * ==================================
 *
 * Alles, was eine Software beim Rechnen bemerken kann und was in zugekauften
 * Abrechnungen jahrelang unbemerkt geblieben ist. Jede Prüfung nennt ihre
 * Norm, damit die Meldung nachvollziehbar bleibt.
 *
 * Im Bestand gefunden: 3 Schlüsselverstöße, 6 fehlende Wärmezähler,
 * 8 Geräte mit abgelaufener Eichung, 1 fehlende Verbrauchsinformation.
 */

import { round } from './kern';
import type { Pruefhinweis } from './typen';

/** § 7 Abs. 1 und § 8 Abs. 1: 50 bis 70 % der Kosten nach Verbrauch. */
export function pruefeSchluessel(
  heizungGrundkostenAnteil: number,
  warmwasserGrundkostenAnteil: number,
  keinWmz: boolean,
  hatWarmwasser = true,
): Pruefhinweis[] {
  const h: Pruefhinweis[] = [];
  const vkHeizung = 1 - heizungGrundkostenAnteil;
  const vkWasser = 1 - warmwasserGrundkostenAnteil;

  if (vkHeizung < 0.5 || vkHeizung > 0.7) {
    h.push({
      schwere: 'fehler',
      norm: '§ 7 Abs. 1 HeizkostenV',
      text:
        `Heizkosten zu ${(vkHeizung * 100).toFixed(0)} % nach Verbrauch verteilt. ` +
        'Zulässig sind 50–70 %. Kürzungsrecht 15 % (§ 12 Abs. 1).',
    });
  }
  if (hatWarmwasser && (vkWasser < 0.5 || vkWasser > 0.7)) {
    h.push({
      schwere: 'fehler',
      norm: '§ 8 Abs. 1 HeizkostenV',
      text:
        `Warmwasserkosten zu ${(vkWasser * 100).toFixed(0)} % nach Verbrauch verteilt. ` +
        'Zulässig sind 50–70 %. Kürzungsrecht 15 % (§ 12 Abs. 1).',
    });
  }
  if (keinWmz) {
    h.push({
      schwere: 'warnung',
      norm: '§ 9 Abs. 2 HeizkostenV',
      text:
        'Kein Wärmemengenzähler an der verbundenen Anlage; die Trennung läuft über die Formel ' +
        'des § 9 Abs. 3. Seit dem 31.12.2013 ist ein Wärmemengenzähler Pflicht — ' +
        'Kürzungsrecht 15 % (§ 12 Abs. 1).',
    });
  }
  return h;
}

export interface GeraetPruefung {
  deviceNo: string;
  bezeichnung?: string;
  einheit?: string;
  deviceType: 'hkv' | 'wmz' | 'wwz' | 'kwz' | 'fbh';
  ratingFactor?: number | null;
  ratingFactorSource?: string | null;
  calibrationValidUntil?: string | null;
  calibrationYear?: number | null;
}

/**
 * §§ 31, 33 MessEG: Werte von Geräten mit abgelaufener Eichung dürfen im
 * geschäftlichen Verkehr nicht verwendet werden. Heizkostenverteiler sind
 * nicht eichpflichtig, Zähler schon.
 */
export function pruefeEichung(geraete: GeraetPruefung[], stichtag: Date): Pruefhinweis[] {
  const h: Pruefhinweis[] = [];
  const EICHFRIST_JAHRE: Record<string, number> = { wwz: 5, kwz: 6, wmz: 5 };

  for (const g of geraete) {
    const frist = EICHFRIST_JAHRE[g.deviceType];
    if (!frist) continue;

    let ablauf: Date | null = null;
    if (g.calibrationValidUntil) {
      ablauf = new Date(g.calibrationValidUntil);
    } else if (g.calibrationYear) {
      // Eichfrist läuft zum Ende des Jahres ab, das dem Eichjahr folgt
      ablauf = new Date(Date.UTC(g.calibrationYear + frist, 11, 31));
    }
    if (!ablauf || Number.isNaN(ablauf.getTime())) continue;

    if (ablauf < stichtag) {
      h.push({
        schwere: 'fehler',
        norm: '§ 31 MessEG',
        betrifft: g.einheit ? `${g.einheit} · Gerät ${g.deviceNo}` : `Gerät ${g.deviceNo}`,
        text:
          `Die Eichung ist am ${ablauf.toLocaleDateString('de-DE')} abgelaufen. ` +
          'Die Werte dieses Geräts dürfen für die Abrechnung nicht verwendet werden.',
      });
    } else {
      const inEinemJahr = new Date(stichtag);
      inEinemJahr.setFullYear(inEinemJahr.getFullYear() + 1);
      if (ablauf < inEinemJahr) {
        h.push({
          schwere: 'hinweis',
          norm: '§ 31 MessEG',
          betrifft: g.einheit ? `${g.einheit} · Gerät ${g.deviceNo}` : `Gerät ${g.deviceNo}`,
          text: `Die Eichung läuft am ${ablauf.toLocaleDateString('de-DE')} ab — Austausch einplanen.`,
        });
      }
    }
  }
  return h;
}

/**
 * Heizkostenverteiler ohne Bewertungsfaktor können nicht bewertet werden.
 * Das betrifft vor allem Funkgeräte vom Typ HZK, bei denen das
 * Zwischenableseprotokoll nur einen Platzhalter druckt.
 */
export function pruefeBewertungsfaktoren(geraete: GeraetPruefung[]): Pruefhinweis[] {
  const h: Pruefhinweis[] = [];
  const ohne = geraete.filter(
    (g) => g.deviceType === 'hkv' && (g.ratingFactor == null || g.ratingFactor <= 0),
  );
  if (ohne.length > 0) {
    h.push({
      schwere: 'fehler',
      norm: '§ 7 Abs. 1 HeizkostenV',
      text:
        `${ohne.length} Heizkostenverteiler haben keinen Bewertungsfaktor. ` +
        'Ohne Faktor lässt sich die Anzeige nicht in Verbrauchseinheiten umrechnen. ' +
        'Die Faktoren stehen in der Einzelabrechnung des Messdienstleisters.',
      betrifft: ohne.slice(0, 8).map((g) => g.deviceNo).join(', ') + (ohne.length > 8 ? ' …' : ''),
    });
  }

  // Faktoren aus dem Zwischenableseprotokoll, die noch nie gegen eine
  // Abrechnung geprüft wurden — dort werden Werte unter 1 verschoben gedruckt.
  const ungeprueft = geraete.filter(
    (g) => g.deviceType === 'hkv' && g.ratingFactorSource === 'protokoll_zehnerkorrektur',
  );
  if (ungeprueft.length > 0) {
    h.push({
      schwere: 'hinweis',
      norm: 'Datenherkunft',
      text:
        `${ungeprueft.length} Bewertungsfaktoren stammen aus dem Zwischenableseprotokoll und ` +
        'wurden um eine Dezimalstelle korrigiert (0.088 im Protokoll bedeutet 0,88). ' +
        'Vor der ersten eigenen Abrechnung einmal gegen die Abrechnung des Anbieters prüfen.',
    });
  }
  return h;
}

export interface VerbrauchsSprung {
  einheit: string;
  aktuell: number;
  vorjahr: number;
  abweichung: number;
}

/**
 * Plausibilität: ungewöhnliche Verbrauchssprünge gegenüber dem Vorjahr.
 * Meistens ein Zahlendreher bei der Ablesung, gelegentlich ein defektes Gerät.
 */
export function pruefeVerbrauchssprung(
  werte: { einheit: string; aktuell: number; vorjahr: number | null }[],
  grenze = 0.4,
): Pruefhinweis[] {
  const h: Pruefhinweis[] = [];
  for (const w of werte) {
    if (w.vorjahr == null || w.vorjahr <= 0) continue;
    const abweichung = (w.aktuell - w.vorjahr) / w.vorjahr;
    if (Math.abs(abweichung) < grenze) continue;
    h.push({
      schwere: 'hinweis',
      norm: 'Plausibilität',
      betrifft: w.einheit,
      text:
        `Der Verbrauch liegt ${abweichung > 0 ? '' : '−'}${Math.abs(abweichung * 100).toFixed(0)} % ` +
        `${abweichung > 0 ? 'über' : 'unter'} dem Vorjahr ` +
        `(${round(w.aktuell, 2).toLocaleString('de-DE')} gegenüber ${round(w.vorjahr, 2).toLocaleString('de-DE')}). ` +
        'Vor dem Versand gegenprüfen.',
    });
  }
  return h;
}

/**
 * Summenkontrolle: Die Summe der Einzelabrechnungen muss exakt dem
 * verteilten Betrag entsprechen. Bei summenerhaltender Rundung ist die
 * Abweichung immer null; alles andere ist ein Fehler im Rechenweg.
 */
export function pruefeSumme(verteilt: number, soll: number): Pruefhinweis[] {
  const diff = round(verteilt - soll, 2);
  if (Math.abs(diff) < 0.005) return [];
  return [{
    schwere: 'fehler',
    norm: '§ 28 WEG',
    text:
      `Die Summe der Einzelabrechnungen weicht um ${diff.toLocaleString('de-DE', { minimumFractionDigits: 2 })} € ` +
      'vom verteilten Gesamtbetrag ab. Die Abrechnung darf so nicht versendet werden.',
  }];
}

/** § 6a Abs. 3: Pflichtangaben. Fehlen sie, greift ein Kürzungsrecht von 3 %. */
export function pruefePflichtangaben(vorhanden: {
  energietraegermix: boolean;
  steuernAbgaben: boolean;
  energiepreise: boolean;
  vorjahresvergleich: boolean;
  durchschnittsnutzer: boolean;
  beschwerdestellen: boolean;
}): Pruefhinweis[] {
  const fehlend: string[] = [];
  if (!vorhanden.energietraegermix) fehlend.push('Anteil der Energieträger');
  if (!vorhanden.steuernAbgaben) fehlend.push('Steuern, Abgaben und Zölle');
  if (!vorhanden.energiepreise) fehlend.push('Energiepreise');
  if (!vorhanden.vorjahresvergleich) fehlend.push('witterungsbereinigter Vorjahresvergleich');
  if (!vorhanden.durchschnittsnutzer) fehlend.push('Vergleich mit einem Durchschnittsnutzer');
  if (!vorhanden.beschwerdestellen) fehlend.push('Beschwerdestellen und Schlichtung');

  if (fehlend.length === 0) return [];
  return [{
    schwere: 'warnung',
    norm: '§ 6a Abs. 3 HeizkostenV',
    text:
      `Pflichtangaben fehlen: ${fehlend.join(', ')}. ` +
      'Ohne sie kann der Nutzer die Kosten um 3 % kürzen (§ 12 Abs. 1 Satz 2).',
  }];
}

/** § 6b: unterjährige Verbrauchsinformation. Ebenfalls 3 % Kürzungsrecht. */
export function pruefeVerbrauchsinformation(
  einheitenOhneInfo: string[],
): Pruefhinweis[] {
  if (einheitenOhneInfo.length === 0) return [];
  return [{
    schwere: 'warnung',
    norm: '§ 6b HeizkostenV',
    betrifft: einheitenOhneInfo.join(', '),
    text:
      `Für ${einheitenOhneInfo.length} Nutzeinheiten wurde keine unterjährige Verbrauchsinformation ` +
      'erteilt. Kürzungsrecht 3 % (§ 12 Abs. 1 Satz 2).',
  }];
}
