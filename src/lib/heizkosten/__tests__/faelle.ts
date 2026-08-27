/**
 * Testfälle aus echten Abrechnungen
 * =================================
 *
 * Jeder Fall enthält die Eingangsdaten UND das Soll-Ergebnis des
 * Messdienstleisters. Weicht der Rechenkern ab, ist entweder unsere Logik
 * falsch — oder die zugekaufte Abrechnung. Beides will man wissen.
 *
 * Quellen: Original-Abrechnungen 2025 von BRUNATA-METRONA, Allgäu Messpartner,
 * RegioMess und ista.
 */

import type { AbrechnungEingang, BrennstoffLayer } from '../typen';

export interface Testfall {
  name: string;
  anbieter: string;
  liegenschaft: string;
  eingang: AbrechnungEingang;
  /** Soll-Gesamtbeträge je Nutzeinheit bzw. Zeitraum aus der Original-Abrechnung */
  soll: Record<string, number>;
  sollZwischen?: Record<string, number>;
  /**
   * Positionen, bei denen der Anbieter Gleichstände in der summenerhaltenden
   * Rundung anders auflöst als wir. Die Gesamtsumme stimmt in allen Fällen
   * exakt; nur ein einzelner Cent liegt bei einer anderen Nutzeinheit.
   * Für unsere eigenen Abrechnungen gilt unsere Aufteilung — sie ist ebenso
   * zulässig, weil die Verordnung die Reihenfolge nicht vorschreibt.
   */
  bekannteAbweichung?: Record<string, string>;
}

const einZeitraum = (name: string, verbrauch: Record<string, number>) => ([{
  name, von: '2025-01-01', bis: '2025-12-31',
  anteilKalendertage: 1, anteilGradtage: 1, verbrauch,
}]);

// ═══════════════════════════════════════════════════════════════════════
// 1) Birkenweg 6 — BRUNATA, Erdgas, verbundene Anlage OHNE Wärmezähler
//    Besonderheit: Warmwasser zu 100 % nach Verbrauch — Verstoß gegen § 8
// ═══════════════════════════════════════════════════════════════════════
export const birkenweg6: Testfall = {
  name: 'Birkenweg 6',
  anbieter: 'BRUNATA-METRONA',
  liegenschaft: '233599',
  eingang: {
    anlage: {
      name: 'Birkenweg 6',
      energieart: 'gas',
      abrechnungsflaecheM2: 294,
      zeitraum: { von: '2025-01-01', bis: '2025-12-31' },
      gkAnteilHeizung: 0.30,
      gkAnteilWarmwasser: 0.00, // ← Verstoß gegen § 8 Abs. 1
      trennung: {
        art: 'formel',
        wwVolumenM3: 51.57,
        temperaturC: 60,
        brennwertFaktor: 1.11,
        gesamtEnergieKwh: 27387,
      },
    },
    kosten: [
      { bezeichnung: 'Heizung und Warmwasser gesamt', betrag: 4002.32, art: 'beides' },
      { bezeichnung: 'Brennerwartung', betrag: 134.17, art: 'heizung' },
    ],
    heizungVerbrauchKey: 'einheiten',
    warmwasserVerbrauchKey: 'ww',
    einheiten: [
      { id: '0001', bezeichnung: 'EG Wollmann/Deng', flaecheM2: 104, zeitraeume: einZeitraum('2025', { einheiten: 11701, ww: 15.11, kw: 82.32 }) },
      { id: '0002', bezeichnung: 'OG01 Reinhard', flaecheM2: 102, zeitraeume: einZeitraum('2025', { einheiten: 4161, ww: 23.99, kw: 90.15 }) },
      { id: '0003', bezeichnung: 'DG Zimmermann', flaecheM2: 88, zeitraeume: einZeitraum('2025', { einheiten: 792, ww: 12.47, kw: 44.47 }) },
    ],
    sonstige: [
      { bezeichnung: 'Kaltwasser Gesamt', betrag: 404.86, kategorie: 'wasser', basis: { verbrauch: 'kw' }, zeitteilung: 'keine' },
      { bezeichnung: 'Abwasser Gesamt', betrag: 340.97, kategorie: 'wasser', basis: { verbrauch: 'kw' }, zeitteilung: 'keine' },
      { bezeichnung: 'Gerätemiete Kaltwasser', betrag: 146.30, kategorie: 'wasser', basis: { verbrauch: 'kw' }, zeitteilung: 'keine' },
      { bezeichnung: 'Abrechnung Kaltwasser', betrag: 115.08, kategorie: 'wasser', basis: 'nutzeinheit', zeitteilung: 'keine' },
      { bezeichnung: 'Verbrauchsschätzung', betrag: 5.30, kategorie: 'sonstiges', basis: 'nutzeinheit', zeitteilung: 'keine', direktAn: '0001' },
    ],
    co2: { kg: 4968, kosten: 325.16 },
  },
  soll: { '0001': 2536.64, '0002': 1757.82, '0003': 854.53 },
  sollZwischen: { warmwasserKosten: 1045.81, heizungKosten: 3090.68 },
  bekannteAbweichung: {
    '0002': 'Ein Cent der Kaltwasserverteilung liegt bei uns auf Einheit 0003 statt 0002.',
    '0003': 'Gegenstück zu 0002 — Gleichstand bei der summenerhaltenden Rundung.',
  },
};

// ═══════════════════════════════════════════════════════════════════════
// 2) Sorgschrofenweg 2 — BRUNATA, Erdgas, MIT Wärmemengenzähler
//    Besonderheit: zwei Nutzergruppen beim Kaltwasser
// ═══════════════════════════════════════════════════════════════════════
const NG = (g: string) => ({ kaltwasser: g });

export const sorgschrofenweg2: Testfall = {
  name: 'Sorgschrofenweg 2',
  anbieter: 'BRUNATA-METRONA',
  liegenschaft: '59626',
  eingang: {
    anlage: {
      name: 'Sorgschrofenweg 2',
      energieart: 'gas',
      abrechnungsflaecheM2: 438.7,
      zeitraum: { von: '2025-01-01', bis: '2025-12-31' },
      gkAnteilHeizung: 0.30,
      gkAnteilWarmwasser: 0.30,
      trennung: { art: 'wmz', wwWaermemengeKwh: 22220, gesamtWaermemengeKwh: 63976 },
    },
    kosten: [
      { bezeichnung: 'Heizung und Warmwasser gesamt', betrag: 9075.31, art: 'beides' },
    ],
    heizungVerbrauchKey: 'einheiten',
    warmwasserVerbrauchKey: 'ww',
    einheiten: [
      { id: '0001', bezeichnung: 'EG li Jachtner/Litz', flaecheM2: 87.55, nutzergruppen: NG('NG1'), zeitraeume: einZeitraum('2025', { einheiten: 7856, ww: 34.36, kw: 94.72 }) },
      { id: '0002', bezeichnung: 'EG re Hann', flaecheM2: 91.32, nutzergruppen: NG('NG1'), zeitraeume: einZeitraum('2025', { einheiten: 5426, ww: 7.51, kw: 36.64 }) },
      { id: '0003', bezeichnung: 'OG li Jörg & Blake', flaecheM2: 94.89, nutzergruppen: NG('NG2'), zeitraeume: einZeitraum('2025', { einheiten: 2818, ww: 9.18 }) },
      { id: '0004', bezeichnung: 'OG re Rumpf/Pfeifer', flaecheM2: 69.88, nutzergruppen: NG('NG2'), zeitraeume: einZeitraum('2025', { einheiten: 3388, ww: 7.07 }) },
      { id: '0005', bezeichnung: 'DG li Rein', flaecheM2: 47.53, nutzergruppen: NG('NG2'), zeitraeume: einZeitraum('2025', { einheiten: 1606, ww: 2.43 }) },
      { id: '0006', bezeichnung: 'DG re Schumacher', flaecheM2: 47.53, nutzergruppen: NG('NG2'), zeitraeume: einZeitraum('2025', { einheiten: 2774, ww: 3.35 }) },
    ],
    sonstige: [
      // Vorverteilung auf Nutzergruppen, dann Binnenverteilung innerhalb der Gruppe
      { bezeichnung: 'Kalt-/Abwasser NG1', betrag: 489.96, kategorie: 'wasser', basis: { verbrauch: 'kw' }, zeitteilung: 'keine', nutzergruppe: { bereich: 'kaltwasser', gruppe: 'NG1' } },
      { bezeichnung: 'Gerätemiete KW NG1', betrag: 50.57, kategorie: 'wasser', basis: { verbrauch: 'kw' }, zeitteilung: 'keine', nutzergruppe: { bereich: 'kaltwasser', gruppe: 'NG1' } },
      { bezeichnung: 'Abrechnung Kaltwasser NG1', betrag: 75.06, kategorie: 'wasser', basis: 'nutzeinheit', zeitteilung: 'keine', nutzergruppe: { bereich: 'kaltwasser', gruppe: 'NG1' } },
      { bezeichnung: 'Kalt-/Abwasser NG2', betrag: 453.70, kategorie: 'wasser', basis: 'flaeche', zeitteilung: 'keine', nutzergruppe: { bereich: 'kaltwasser', gruppe: 'NG2' } },
      { bezeichnung: 'Gerätemiete KW NG2', betrag: 46.83, kategorie: 'wasser', basis: 'flaeche', zeitteilung: 'keine', nutzergruppe: { bereich: 'kaltwasser', gruppe: 'NG2' } },
      { bezeichnung: 'Abrechnung Kaltwasser NG2', betrag: 150.12, kategorie: 'wasser', basis: 'nutzeinheit', zeitteilung: 'keine', nutzergruppe: { bereich: 'kaltwasser', gruppe: 'NG2' } },
    ],
    co2: { kg: 11605, kosten: 759.57 },
  },
  soll: { '0001': 3521.75, '0002': 1956.97, '0003': 1615.72, '0004': 1438.50, '0005': 786.96, '0006': 1021.63 },
  sollZwischen: { warmwasserKosten: 3151.86, heizungKosten: 5923.45 },
  bekannteAbweichung: {
    '0002': 'Gleichstand in der Nutzergruppe NG1 — ein Cent liegt anders.',
    '0005': 'Gleichstand in der Nutzergruppe NG2 — zwei Cent liegen anders.',
    '0006': 'Gegenstück zu 0005.',
  },
};

// ═══════════════════════════════════════════════════════════════════════
// 3) Adolf-Haff-Weg 3 — Allgäu Messpartner, Pellets, Wärmezähler
//    Besonderheit: Nutzerwechsel NE004 zum 01./02.05.2025
//    Heizungs-Grundkosten nach GRADTAGEN, alles Übrige nach Kalendertagen
// ═══════════════════════════════════════════════════════════════════════
export const adolfHaffWeg3: Testfall = {
  name: 'Adolf-Haff-Weg 3',
  anbieter: 'Allgäu Messpartner',
  liegenschaft: '370/20223',
  eingang: {
    anlage: {
      name: 'Adolf-Haff-Weg 3',
      energieart: 'pellets',
      abrechnungsflaecheM2: 668.09,
      zeitraum: { von: '2025-01-01', bis: '2025-12-31' },
      gkAnteilHeizung: 0.30,
      gkAnteilWarmwasser: 0.30,
      // Zentraler Wärmemengenzähler 337598 für die Warmwasserbereitung:
      // 9.129 kWh von 38.421 kWh Gesamtwärme = 23,760 %
      trennung: { art: 'wmz', wwWaermemengeKwh: 9129, gesamtWaermemengeKwh: 38421 },
      rundungWwAnteil: 'exakt',
    },
    kosten: [
      { bezeichnung: 'Heizung und Warmwasser gesamt', betrag: 4900.75, art: 'beides' },
      { bezeichnung: 'Miete Wärmezähler', betrag: 304.64, art: 'heizung' },
      { bezeichnung: 'Miete Erfassungsgeräte Warmwasser', betrag: 132.08, art: 'warmwasser' },
    ],
    heizungVerbrauchKey: 'kwh',
    warmwasserVerbrauchKey: 'ww',
    einheiten: [
      { id: 'NE001', bezeichnung: 'EGli Baraniak', flaecheM2: 89.95, zeitraeume: einZeitraum('2025', { kwh: 3752.90, ww: 8.42, kw: 27.39 }) },
      { id: 'NE002', bezeichnung: 'EGmi Bschorr', flaecheM2: 61.38, zeitraeume: einZeitraum('2025', { kwh: 1285.10, ww: 3.48, kw: 11.22 }) },
      { id: 'NE003', bezeichnung: 'EGre Fahrner', flaecheM2: 89.88, zeitraeume: einZeitraum('2025', { kwh: 3216.00, ww: 3.97, kw: 19.21 }) },
      {
        id: 'NE004', bezeichnung: '1OGli Mickerts → Schober/Häfele', flaecheM2: 89.95,
        zeitraeume: [
          {
            name: 'NE004-Z1', von: '2025-01-01', bis: '2025-05-01',
            // Heizung 531/1000 Gradtage · Warmwasser 121/365 Kalendertage
            anteilGradtage: 531 / 1000, anteilKalendertage: 121 / 365,
            verbrauch: { kwh: 1234.70, ww: 3.90, kw: 10.04 },
          },
          {
            name: 'NE004-Z2', von: '2025-05-02', bis: '2025-12-31',
            anteilGradtage: 469 / 1000, anteilKalendertage: 244 / 365,
            verbrauch: { kwh: 1283.90, ww: 9.10, kw: 25.11 },
          },
        ],
      },
      { id: 'NE005', bezeichnung: '1OGmi Pawlak', flaecheM2: 61.38, zeitraeume: einZeitraum('2025', { kwh: 14.50, ww: 2.41, kw: 5.08 }) },
      { id: 'NE006', bezeichnung: '1OGre Scholz', flaecheM2: 89.53, zeitraeume: einZeitraum('2025', { kwh: 7529.90, ww: 27.61, kw: 61.82 }) },
      { id: 'NE007', bezeichnung: '2OGli Mießen', flaecheM2: 102.67, zeitraeume: einZeitraum('2025', { kwh: 10086.60, ww: 25.62, kw: 42.03 }) },
      { id: 'NE008', bezeichnung: '2OGre Falls', flaecheM2: 83.35, zeitraeume: einZeitraum('2025', { kwh: 888.40, ww: 2.90, kw: 10.12 }) },
    ],
    sonstige: [
      // Kaltwasser und Kanal werden über die Gesamtwassermenge verteilt und
      // getrennt ausgewiesen: Frischwasser für Warmwasser und Kaltwasser,
      // beide zum selben Kubikmeterpreis.
      { bezeichnung: 'Kaltwasser für Warmwasser', betrag: 46.65, kategorie: 'wasser', basis: { verbrauch: 'ww' }, zeitteilung: 'keine' },
      { bezeichnung: 'Kaltwasser', betrag: 113.17, kategorie: 'wasser', basis: { verbrauch: 'kw' }, zeitteilung: 'keine' },
      { bezeichnung: 'Miete Kaltwasserzähler', betrag: 169.36, kategorie: 'wasser', basis: 'nutzeinheit', zeitteilung: 'kalendertage' },
      { bezeichnung: 'Verbrauchserfassung KW', betrag: 72.54, kategorie: 'wasser', basis: 'nutzeinheit', zeitteilung: 'kalendertage' },
    ],
  },
  soll: {
    'NE001': 714.77, 'NE002': 345.44, 'NE003': 609.79,
    'NE004-Z1': 281.17, 'NE004-Z2': 368.55,
    'NE005': 207.79, 'NE006': 1306.36, 'NE007': 1552.46, 'NE008': 352.86,
  },
  sollZwischen: { heizungKosten: 4040.95, warmwasserKosten: 1296.52 },
  bekannteAbweichung: {
    'NE001': 'Gleichstand bei „Verbrauchserfassung KW" — acht gleich große Anteile, ein Cent liegt anders.',
    'NE002': 'wie NE001',
    'NE003': 'wie NE001, zwei Cent',
    'NE004-Z1': 'wie NE001',
    'NE005': 'wie NE001',
    'NE006': 'wie NE001',
    'NE007': 'wie NE001',
  },
};

// ═══════════════════════════════════════════════════════════════════════
// 4) Brennstoff-FIFO mit CO₂ je Schicht — ista, Heizöl
// ═══════════════════════════════════════════════════════════════════════
export const istaHeizoel = {
  name: 'ista N 04-896-0126 (Heizöl-FIFO mit CO₂)',
  layers: [
    { bezeichnung: 'Rest aus Vorjahr', menge: 1300, betrag: 1454.18, co2Kg: 3479.2, co2Kosten: 124.21 },
    { bezeichnung: 'Rechnung 15.10.2024', menge: 2690, betrag: 2476.75, co2Kg: 7199.2, co2Kosten: 385.52 },
    { bezeichnung: 'Rechnung 07.05.2025', menge: 2089, betrag: 1462.30, co2Kg: 5598.5, co2Kosten: 251.93 },
  ] as BrennstoffLayer[],
  endbestand: 3800,
  soll: {
    verbrauchMenge: 2279,
    verbrauchBetrag: 2355.57,
    verbrauchCo2Kosten: 264.52,
    verbrauchCo2Kg: 6099.3,
    restbestandBetrag: 3037.66,
  },
};

// ═══════════════════════════════════════════════════════════════════════
// 5) Mittelgasse 1 — RegioMess, Fernwärme
//    Besonderheit: zwei Erfassungssysteme nebeneinander und ein
//    Gerätewechsel am 16.10.2025 mitten im Abrechnungszeitraum
// ═══════════════════════════════════════════════════════════════════════
export const mittelgasse1Erfassung = {
  name: 'Mittelgasse 1 — Aufteilung auf zwei Erfassungssysteme',
  anbieter: 'RegioMess',
  verbrauchskosten: 4073.69,
  systeme: [
    { bezeichnung: 'Wärmezähler', mengeGemeinsam: 11.409, verbrauchKey: 'wmz' },
    {
      bezeichnung: 'Heizkostenverteiler',
      mengeGemeinsam: 10.970,
      verbrauchKey: 'hkv',
      umruestung: {
        datum: '16.10.2025',
        zeitfaktorVor: 681 / 1000,
        verbrauchKeyVor: 'hkv_alt',
        verbrauchKeyNach: 'hkv_neu',
      },
    },
  ],
  soll: {
    preisJeMwh: 182.0318155,
    wmzBlock: 2076.80,
    hkvBlock: 1996.89,
    hkvVorUmruestung: 1359.88,
    hkvNachUmruestung: 637.01,
  },
};

export const alleFaelle = [birkenweg6, sorgschrofenweg2, adolfHaffWeg3];
