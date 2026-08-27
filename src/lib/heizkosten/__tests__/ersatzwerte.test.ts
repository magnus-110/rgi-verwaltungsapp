/**
 * § 9a HeizkostenV — Ersatzwerte und die 25-%-Grenze
 */

import { describe, expect, it } from 'vitest';
import {
  ersatzwertVorschlaege, ersterBrauchbarerVorschlag, pruefeErsatzwertGrenze,
} from '../ersatzwerte';

describe('Ersatzwerte nach § 9a Abs. 1', () => {
  it('liefert alle drei Stufen in der Reihenfolge der Verordnung', () => {
    const v = ersatzwertVorschlaege({
      vorjahrEigen: 412,
      vergleichsraeume: [380, 398],
      hausDurchschnittJeM2: 5.9,
      flaecheM2: 68,
    });
    expect(v.map((x) => x.stufe)).toEqual([1, 2, 3]);
    expect(v[0].wert).toBe(412);
    expect(v[1].wert).toBe(389);
    expect(v[2].wert).toBeCloseTo(401.2, 1);
  });

  it('nimmt die erste Stufe, die einen Wert liefert', () => {
    const ohneVorjahr = ersterBrauchbarerVorschlag({
      vorjahrEigen: null,
      vergleichsraeume: [380, 398],
    });
    expect(ohneVorjahr?.stufe).toBe(2);
    expect(ohneVorjahr?.wert).toBe(389);
  });

  it('gibt null zurück, wenn keine Stufe greift', () => {
    expect(ersterBrauchbarerVorschlag({})).toBeNull();
  });

  it('begründet jede Stufe mit ihrer Fundstelle', () => {
    const v = ersatzwertVorschlaege({ vorjahrEigen: 100 });
    expect(v[0].begruendung).toContain('§ 9a Abs. 1');
  });
});

describe('Die 25-%-Grenze nach § 9a Abs. 2', () => {
  it('lässt kleine Anteile ohne Hinweis durch', () => {
    const g = pruefeErsatzwertGrenze({ flaecheMitErsatzwert: 33.4, flaecheGesamt: 470.4 });
    expect(g.ueberschritten).toBe(false);
    expect(g.hinweis).toBeNull();
  });

  it('warnt ab 15 %, bevor die Grenze reißt', () => {
    const g = pruefeErsatzwertGrenze({ flaecheMitErsatzwert: 90, flaecheGesamt: 470.4 });
    expect(g.ueberschritten).toBe(false);
    expect(g.hinweis?.schwere).toBe('warnung');
  });

  it('sperrt die verbrauchsabhängige Abrechnung über 25 %', () => {
    const g = pruefeErsatzwertGrenze({ flaecheMitErsatzwert: 130, flaecheGesamt: 470.4 });
    expect(g.ueberschritten).toBe(true);
    expect(g.hinweis?.schwere).toBe('fehler');
    expect(g.hinweis?.norm).toBe('§ 9a Abs. 2 HeizkostenV');
  });

  it('kommt mit einer Fläche von null zurecht', () => {
    const g = pruefeErsatzwertGrenze({ flaecheMitErsatzwert: 10, flaecheGesamt: 0 });
    expect(g.ueberschritten).toBe(false);
  });
});
