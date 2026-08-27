/**
 * Prüfungen — die Fälle aus dem echten Bestand
 */

import { describe, expect, it } from 'vitest';
import {
  pruefeBewertungsfaktoren, pruefeEichung, pruefeSchluessel, pruefeSumme,
  pruefeVerbrauchsinformation, pruefeVerbrauchssprung, pruefePflichtangaben,
  type GeraetPruefung,
} from '../pruefungen';

describe('Umlageschlüssel nach § 7 und § 8', () => {
  it('lässt 70 % nach Verbrauch durch', () => {
    expect(pruefeSchluessel(0.30, 0.30, false)).toHaveLength(0);
  });

  it('lässt 50 % nach Verbrauch durch — die untere Grenze', () => {
    expect(pruefeSchluessel(0.50, 0.50, false)).toHaveLength(0);
  });

  it('meldet Birkenweg 6: Warmwasser zu 100 % nach Verbrauch', () => {
    const h = pruefeSchluessel(0.30, 0.00, true);
    expect(h.find((x) => x.norm === '§ 8 Abs. 1 HeizkostenV')?.schwere).toBe('fehler');
  });

  it('meldet Hauptstr. 7-9: Heizung zu 100 % nach Verbrauch', () => {
    const h = pruefeSchluessel(0.00, 0.30, false);
    expect(h.find((x) => x.norm === '§ 7 Abs. 1 HeizkostenV')?.schwere).toBe('fehler');
  });

  it('schweigt zum Warmwasser, wenn die Anlage keines liefert', () => {
    const h = pruefeSchluessel(0.30, 0.00, false, false);
    expect(h).toHaveLength(0);
  });
});

describe('Eichung nach § 31 MessEG', () => {
  const stichtag = new Date('2026-08-27');

  it('meldet Straußbergstr. 11 mit Eichjahr 2016', () => {
    const g: GeraetPruefung[] = [
      { deviceNo: '4711', deviceType: 'wwz', calibrationYear: 2016, einheit: '0001' },
    ];
    const h = pruefeEichung(g, stichtag);
    expect(h[0].schwere).toBe('fehler');
    expect(h[0].betrifft).toContain('4711');
  });

  it('warnt rechtzeitig, bevor die Frist abläuft', () => {
    const g: GeraetPruefung[] = [
      { deviceNo: '4712', deviceType: 'wwz', calibrationYear: 2021 },
    ];
    const h = pruefeEichung(g, stichtag);
    expect(h[0].schwere).toBe('hinweis');
  });

  it('lässt gültige Geräte in Ruhe', () => {
    const g: GeraetPruefung[] = [
      { deviceNo: '4713', deviceType: 'wwz', calibrationYear: 2024 },
    ];
    expect(pruefeEichung(g, stichtag)).toHaveLength(0);
  });

  it('prüft Heizkostenverteiler nicht — sie sind nicht eichpflichtig', () => {
    const g: GeraetPruefung[] = [
      { deviceNo: '4714', deviceType: 'hkv', calibrationYear: 2010 },
    ];
    expect(pruefeEichung(g, stichtag)).toHaveLength(0);
  });

  it('rechnet Kaltwasserzähler mit sechs Jahren statt fünf', () => {
    const kalt: GeraetPruefung[] = [{ deviceNo: 'k', deviceType: 'kwz', calibrationYear: 2020 }];
    const warm: GeraetPruefung[] = [{ deviceNo: 'w', deviceType: 'wwz', calibrationYear: 2020 }];
    expect(pruefeEichung(kalt, stichtag)).toHaveLength(1);
    expect(pruefeEichung(kalt, stichtag)[0].schwere).toBe('hinweis');
    expect(pruefeEichung(warm, stichtag)[0].schwere).toBe('fehler');
  });
});

describe('Bewertungsfaktoren', () => {
  it('meldet die Funkgeräte der Hauptstr. 7-9 ohne Faktor', () => {
    const g: GeraetPruefung[] = Array.from({ length: 24 }, (_x, i) => ({
      deviceNo: `129134${i}`, deviceType: 'hkv' as const, ratingFactor: null,
    }));
    const h = pruefeBewertungsfaktoren(g);
    expect(h[0].schwere).toBe('fehler');
    expect(h[0].text).toContain('24 Heizkostenverteiler');
  });

  it('weist auf korrigierte Protokollfaktoren hin', () => {
    const g: GeraetPruefung[] = [
      { deviceNo: '53610718', deviceType: 'hkv', ratingFactor: 0.88, ratingFactorSource: 'protokoll_zehnerkorrektur' },
    ];
    const h = pruefeBewertungsfaktoren(g);
    expect(h).toHaveLength(1);
    expect(h[0].schwere).toBe('hinweis');
    expect(h[0].text).toContain('0.088');
  });

  it('schweigt bei geprüften Faktoren aus der Abrechnung', () => {
    const g: GeraetPruefung[] = [
      { deviceNo: '53610718', deviceType: 'hkv', ratingFactor: 0.88, ratingFactorSource: 'abrechnung' },
    ];
    expect(pruefeBewertungsfaktoren(g)).toHaveLength(0);
  });
});

describe('Plausibilität und Summen', () => {
  it('meldet einen Verbrauchssprung von über 40 %', () => {
    const h = pruefeVerbrauchssprung([{ einheit: '0004', aktuell: 1410, vorjahr: 1000 }]);
    expect(h).toHaveLength(1);
    expect(h[0].betrifft).toBe('0004');
  });

  it('lässt kleine Schwankungen durch', () => {
    expect(pruefeVerbrauchssprung([{ einheit: '0001', aktuell: 1100, vorjahr: 1000 }])).toHaveLength(0);
  });

  it('kommt ohne Vorjahreswert zurecht', () => {
    expect(pruefeVerbrauchssprung([{ einheit: '0001', aktuell: 1100, vorjahr: null }])).toHaveLength(0);
  });

  it('akzeptiert eine exakte Summe', () => {
    expect(pruefeSumme(9922.01, 9922.01)).toHaveLength(0);
  });

  it('meldet jede Abweichung ab einem halben Cent', () => {
    const h = pruefeSumme(9922.02, 9922.01);
    expect(h).toHaveLength(1);
    expect(h[0].schwere).toBe('fehler');
  });
});

describe('Pflichtangaben nach § 6a und § 6b', () => {
  it('schweigt, wenn alle Angaben vorliegen', () => {
    expect(pruefePflichtangaben({
      energietraegermix: true, steuernAbgaben: true, energiepreise: true,
      vorjahresvergleich: true, durchschnittsnutzer: true, beschwerdestellen: true,
    })).toHaveLength(0);
  });

  it('nennt die fehlenden Angaben beim Namen', () => {
    const h = pruefePflichtangaben({
      energietraegermix: true, steuernAbgaben: true, energiepreise: true,
      vorjahresvergleich: false, durchschnittsnutzer: false, beschwerdestellen: true,
    });
    expect(h[0].text).toContain('Vorjahresvergleich');
    expect(h[0].text).toContain('Durchschnittsnutzer');
    expect(h[0].text).toContain('3 %');
  });

  it('meldet Neuer Weg 14, Einheit 009 ohne unterjährige Verbrauchsinfo', () => {
    const h = pruefeVerbrauchsinformation(['009']);
    expect(h[0].norm).toBe('§ 6b HeizkostenV');
    expect(h[0].betrifft).toBe('009');
  });
});
