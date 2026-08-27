/**
 * Der Rechenkern gegen echte Abrechnungen
 * =======================================
 *
 * Jeder Test vergleicht unser Ergebnis mit dem, was der Messdienstleister
 * tatsächlich abgerechnet hat. Die Toleranz beträgt einen Cent — mehr wäre
 * kein Rundungsunterschied mehr, sondern ein Denkfehler.
 *
 * Drei Positionen weichen bekanntermaßen um zwei Cent ab: Dort trennt der
 * Anbieter Gleichstände bei der summenerhaltenden Rundung anders auf als wir.
 * Diese Fälle sind einzeln benannt und begründet.
 */

import { describe, expect, it } from 'vitest';
import { rechneAbrechnung } from '../abrechnung';
import { fifoVerbrauch, co2Aufteilung, eur, round } from '../kern';
import { teileVerbrauchskosten } from '../erfassung';
import {
  adolfHaffWeg3, birkenweg6, istaHeizoel, mittelgasse1Erfassung, sorgschrofenweg2,
} from './faelle';

/**
 * Toleranz für den Vergleich mit einer fremden Abrechnung.
 *
 * Ein Cent für Positionen, die exakt übereinstimmen müssen. Wo der Anbieter
 * einen Gleichstand in der summenerhaltenden Rundung anders auflöst, sind zwei
 * Cent zulässig — diese Fälle sind in `bekannteAbweichung` einzeln benannt und
 * begründet. Die Gesamtsumme muss immer exakt stimmen; das prüft ein eigener
 * Test je Liegenschaft.
 */
const CENT = 0.011;
const CENT_MIT_GLEICHSTAND = 0.021;

const toleranz = (fall: { bekannteAbweichung?: Record<string, string> }, id: string) =>
  fall.bekannteAbweichung?.[id] ? CENT_MIT_GLEICHSTAND : CENT;

describe('Rundung', () => {
  it('rundet float-sicher — 4102,45 × 0,3 ergibt 1230,74 und nicht 1230,73', () => {
    expect(eur(4102.45 * 0.3)).toBe(1230.74);
  });

  it('rundet kaufmännisch auf beliebige Stellen', () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(2.675, 2)).toBe(2.68);
    expect(round(182.03181554, 7)).toBe(182.0318155);
  });
});

describe('Birkenweg 6 — BRUNATA, Erdgas, Formel nach § 9 Abs. 3', () => {
  const e = rechneAbrechnung(birkenweg6.eingang);

  it('trennt Heizung und Warmwasser wie der Anbieter', () => {
    expect(e.kostenWarmwasser).toBeCloseTo(birkenweg6.sollZwischen!.warmwasserKosten, 2);
    expect(e.kostenHeizung).toBeCloseTo(birkenweg6.sollZwischen!.heizungKosten, 2);
  });

  it.each(Object.entries(birkenweg6.soll))(
    'Einheit %s bekommt %s €',
    (id, soll) => {
      const ist = e.jeEinheit
        .filter((z) => z.einheitId === id)
        .reduce((s, z) => s + z.gesamt, 0);
      expect(Math.abs(ist - soll)).toBeLessThanOrEqual(toleranz(birkenweg6, id));
    },
  );

  it('meldet den Verstoß gegen § 8 Abs. 1 — Warmwasser zu 100 % nach Verbrauch', () => {
    const fehler = e.hinweise.filter((h) => h.norm === '§ 8 Abs. 1 HeizkostenV');
    expect(fehler).toHaveLength(1);
    expect(fehler[0].schwere).toBe('fehler');
  });

  it('meldet den fehlenden Wärmemengenzähler nach § 9 Abs. 2', () => {
    expect(e.hinweise.some((h) => h.norm === '§ 9 Abs. 2 HeizkostenV')).toBe(true);
  });

  it('verteilt die Summe vollständig', () => {
    const verteilt = eur(e.jeEinheit.reduce((s, z) => s + z.gesamt, 0));
    expect(verteilt).toBe(e.kostenGesamt);
  });

  it('liegt in der Gesamtsumme höchstens drei Cent neben dem Anbieter', () => {
    // Unsere Summe stimmt per Konstruktion exakt mit den Kosten überein (Test
    // darüber). Die Summe der Anbieter-Einzelabrechnungen tut das nicht immer:
    // beim Sorgschrofenweg fehlen dort zwei Cent gegenüber den Gesamtkosten.
    const sollSumme = eur(Object.values(birkenweg6.soll).reduce((s, x) => s + x, 0));
    const verteilt = eur(e.jeEinheit.reduce((s, z) => s + z.gesamt, 0));
    expect(Math.abs(verteilt - sollSumme)).toBeLessThanOrEqual(0.031);
  });
});

describe('Sorgschrofenweg 2 — BRUNATA, Wärmezähler, zwei Nutzergruppen', () => {
  const e = rechneAbrechnung(sorgschrofenweg2.eingang);

  it('trennt Heizung und Warmwasser wie der Anbieter', () => {
    expect(e.kostenWarmwasser).toBeCloseTo(sorgschrofenweg2.sollZwischen!.warmwasserKosten, 2);
    expect(e.kostenHeizung).toBeCloseTo(sorgschrofenweg2.sollZwischen!.heizungKosten, 2);
  });

  it.each(Object.entries(sorgschrofenweg2.soll))(
    'Einheit %s bekommt %s €',
    (id, soll) => {
      const ist = e.jeEinheit
        .filter((z) => z.einheitId === id)
        .reduce((s, z) => s + z.gesamt, 0);
      expect(Math.abs(ist - soll)).toBeLessThanOrEqual(toleranz(sorgschrofenweg2, id));
    },
  );

  it('verteilt Kosten einer Nutzergruppe nur innerhalb dieser Gruppe', () => {
    const ng2 = e.posten.filter((p) => p.bezeichnung === 'Kalt-/Abwasser NG2');
    const einheitenNg2 = new Set(ng2.map((p) => p.einheitId));
    expect(einheitenNg2).toEqual(new Set(['0003', '0004', '0005', '0006']));
  });

  it('meldet keinen Schlüsselverstoß — 70 % nach Verbrauch ist zulässig', () => {
    expect(e.hinweise.filter((h) => h.schwere === 'fehler')).toHaveLength(0);
  });

  it('verteilt die Summe vollständig', () => {
    const verteilt = eur(e.jeEinheit.reduce((s, z) => s + z.gesamt, 0));
    expect(verteilt).toBe(e.kostenGesamt);
  });

  it('liegt in der Gesamtsumme höchstens drei Cent neben dem Anbieter', () => {
    // Unsere Summe stimmt per Konstruktion exakt mit den Kosten überein (Test
    // darüber). Die Summe der Anbieter-Einzelabrechnungen tut das nicht immer:
    // beim Sorgschrofenweg fehlen dort zwei Cent gegenüber den Gesamtkosten.
    const sollSumme = eur(Object.values(sorgschrofenweg2.soll).reduce((s, x) => s + x, 0));
    const verteilt = eur(e.jeEinheit.reduce((s, z) => s + z.gesamt, 0));
    expect(Math.abs(verteilt - sollSumme)).toBeLessThanOrEqual(0.031);
  });
});

describe('Adolf-Haff-Weg 3 — Allgäu Messpartner, Pellets, Nutzerwechsel', () => {
  const e = rechneAbrechnung(adolfHaffWeg3.eingang);

  it('rechnet den Warmwasseranteil ungerundet — Konvention des Anbieters', () => {
    expect(e.kostenWarmwasser).toBeCloseTo(adolfHaffWeg3.sollZwischen!.warmwasserKosten, 2);
    expect(e.kostenHeizung).toBeCloseTo(adolfHaffWeg3.sollZwischen!.heizungKosten, 2);
  });

  it.each(Object.entries(adolfHaffWeg3.soll))(
    'Zeitraum %s bekommt %s €',
    (id, soll) => {
      const ist = e.jeEinheit
        .filter((z) => z.zeitraum === id || z.einheitId === id)
        .reduce((s, z) => s + z.gesamt, 0);
      expect(Math.abs(ist - soll)).toBeLessThanOrEqual(toleranz(adolfHaffWeg3, id));
    },
  );

  it('teilt die Heizungs-Grundkosten des Nutzerwechsels nach Gradtagen', () => {
    // 531/1000 Gradtage × 89,95 m² = 47,76 m² für den ersten Zeitraum
    const z1 = e.posten.find(
      (p) => p.zeitraum === 'NE004-Z1' && p.kategorie === 'heizung_grund',
    );
    expect(z1?.anteile).toBeCloseTo(47.76, 2);
  });

  it('teilt die Warmwasser-Grundkosten desselben Wechsels nach Kalendertagen', () => {
    // 121/365 Kalendertage × 89,95 m² = 29,82 m²
    const z1 = e.posten.find(
      (p) => p.zeitraum === 'NE004-Z1' && p.kategorie === 'warmwasser_grund',
    );
    expect(z1?.anteile).toBeCloseTo(29.82, 2);
  });

  it('verteilt die Summe vollständig', () => {
    const verteilt = eur(e.jeEinheit.reduce((s, z) => s + z.gesamt, 0));
    expect(verteilt).toBe(e.kostenGesamt);
  });

  it('liegt in der Gesamtsumme höchstens drei Cent neben dem Anbieter', () => {
    // Unsere Summe stimmt per Konstruktion exakt mit den Kosten überein (Test
    // darüber). Die Summe der Anbieter-Einzelabrechnungen tut das nicht immer:
    // beim Sorgschrofenweg fehlen dort zwei Cent gegenüber den Gesamtkosten.
    const sollSumme = eur(Object.values(adolfHaffWeg3.soll).reduce((s, x) => s + x, 0));
    const verteilt = eur(e.jeEinheit.reduce((s, z) => s + z.gesamt, 0));
    expect(Math.abs(verteilt - sollSumme)).toBeLessThanOrEqual(0.031);
  });
});

describe('Brennstoff nach FIFO — ista, Heizöl mit CO₂ je Schicht', () => {
  const r = fifoVerbrauch(istaHeizoel.layers, istaHeizoel.endbestand);

  it('ermittelt die verbrauchte Menge', () => {
    expect(r.verbrauchMenge).toBeCloseTo(istaHeizoel.soll.verbrauchMenge, 2);
  });

  it('bewertet den Verbrauch aus den ältesten Schichten', () => {
    expect(r.verbrauchBetrag).toBeCloseTo(istaHeizoel.soll.verbrauchBetrag, 2);
  });

  it('führt die CO₂-Menge schichtweise mit', () => {
    expect(r.verbrauchCo2Kg).toBeCloseTo(istaHeizoel.soll.verbrauchCo2Kg, 1);
    expect(r.verbrauchCo2Kosten).toBeCloseTo(istaHeizoel.soll.verbrauchCo2Kosten, 2);
  });

  it('lässt den Rest in den jüngsten Schichten stehen', () => {
    expect(r.restbestandBetrag).toBeCloseTo(istaHeizoel.soll.restbestandBetrag, 2);
  });
});

describe('Mittelgasse 1 — zwei Erfassungssysteme mit Gerätewechsel', () => {
  const a = teileVerbrauchskosten(
    mittelgasse1Erfassung.verbrauchskosten,
    mittelgasse1Erfassung.systeme,
  );
  const soll = mittelgasse1Erfassung.soll;

  it('bewertet beide Systeme mit demselben Preis je MWh', () => {
    expect(a.preisJeBezugseinheit).toBeCloseTo(soll.preisJeMwh, 6);
  });

  it('teilt den Wärmezähler-Block ab', () => {
    const wmz = a.bloecke.find((b) => b.bezeichnung === 'Wärmezähler');
    expect(wmz?.betrag).toBeCloseTo(soll.wmzBlock, 2);
  });

  it('zerlegt den Verteiler-Block am Umrüstungstag über den Zeitfaktor', () => {
    const vor = a.bloecke.find((b) => b.bezeichnung.includes('bis 16.10.2025'));
    const nach = a.bloecke.find((b) => b.bezeichnung.includes('ab 16.10.2025'));
    expect(vor?.betrag).toBeCloseTo(soll.hkvVorUmruestung, 2);
    expect(nach?.betrag).toBeCloseTo(soll.hkvNachUmruestung, 2);
    expect(eur((vor?.betrag ?? 0) + (nach?.betrag ?? 0))).toBeCloseTo(soll.hkvBlock, 2);
  });
});

describe('CO₂ nach dem Stufenmodell des CO2KostAufG', () => {
  it('ordnet unter 12 kg je m² die erste Stufe zu — der Nutzer trägt alles', () => {
    const r = co2Aufteilung(5595, 400, 470.4);
    expect(r.emissionProM2).toBeCloseTo(11.9, 1);
    expect(r.stufe).toBe(1);
    expect(r.anteilVermieter).toBe(0);
    expect(r.kostenMieter).toBe(400);
  });

  it('ordnet Birkenweg 6 mit 16,9 kg je m² die zweite Stufe zu', () => {
    const r = co2Aufteilung(4968, 325.16, 294);
    expect(r.emissionProM2).toBeCloseTo(16.9, 1);
    expect(r.stufe).toBe(2);
    expect(r.anteilVermieter).toBeCloseTo(0.1, 5);
    expect(r.kostenVermieter).toBeCloseTo(32.52, 2);
  });

  it('ordnet ab 52 kg je m² die höchste Stufe zu', () => {
    const r = co2Aufteilung(6000, 500, 100);
    expect(r.stufe).toBe(10);
    expect(r.anteilVermieter).toBeCloseTo(0.95, 5);
  });
});
