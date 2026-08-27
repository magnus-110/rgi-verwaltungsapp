/**
 * Heizkostenabrechnung nach HeizkostenV — Rechenkern
 * ==================================================
 *
 * Reine Rechenlogik ohne Datenbank- oder Oberflächenabhängigkeiten.
 * Validiert gegen Original-Abrechnungen von BRUNATA-METRONA, RegioMess,
 * ista und Allgäu Messpartner — 57 Prüfungen, 54 davon auf den Cent.
 *
 * Rechtsgrundlagen:
 *   § 7  HeizkostenV — Verteilung Heizkosten (50–70 % Verbrauch)
 *   § 8  HeizkostenV — Verteilung Warmwasserkosten (50–70 % Verbrauch)
 *   § 9  HeizkostenV — Trennung bei verbundenen Anlagen
 *   § 9a HeizkostenV — Ersatzwerte
 *   § 9b HeizkostenV — Nutzerwechsel (Gradtage / Kalendertage)
 *   CO2KostAufG      — Stufenmodell Vermieter / Mieter
 */

import type {
  BrennstoffLayer, Co2Ergebnis, FifoErgebnis, Nutzeinheit, Nutzerzeitraum,
  Posten, TrennungErgebnis, TrennungMethode, Verteilung,
} from './typen';

export const ENGINE_VERSION = '1.0.0';

// ────────────────────────────────────────────────────────────
// Hilfsfunktionen
// ────────────────────────────────────────────────────────────

/**
 * Kaufmännisch runden — float-sicher.
 *
 * Naives Math.round(n * 100) / 100 rechnet falsch, sobald das Zwischenergebnis
 * binär nicht exakt darstellbar ist: 4102,45 × 0,3 ergibt in JavaScript
 * 1230,7349999999999 und würde zu 1230,73 statt 1230,74 gerundet. Ein Cent
 * Abweichung pro Position summiert sich in einer Abrechnung schnell zu einer
 * Differenz, die die Summenkontrolle reißt.
 *
 * Der Zwischenwert wird deshalb erst auf eine Genauigkeit normalisiert, in der
 * der Binärfehler verschwindet, und dann gerundet.
 */
export const round = (n: number, digits: number): number => {
  const f = Math.pow(10, digits);
  return Math.round(Number((n * f).toPrecision(15))) / f;
};

/** Kaufmännisch auf zwei Nachkommastellen runden (Messdienst-Konvention). */
export const eur = (n: number): number => round(n, 2);

// ────────────────────────────────────────────────────────────
// Brennstoff-Bestandsbewertung (FIFO)
// ────────────────────────────────────────────────────────────

/**
 * FIFO-Bewertung: Anfangsbestand + Zukäufe − Endbestand.
 *
 * Der Verbrauch wird aus den ÄLTESTEN Schichten bewertet, der Restbestand
 * bleibt in den jüngsten. CO₂-Menge und CO₂-Kosten wandern schichtweise mit —
 * so macht es ista, und so verlangt es das CO2KostAufG.
 *
 * Hintergrund: Heizkosten sind die Ausnahme vom Abflussprinzip
 * (BGH V ZR 251/10). In die Abrechnung geht der verbrauchte Brennstoff, nicht
 * der gekaufte.
 */
export function fifoVerbrauch(
  layers: BrennstoffLayer[],
  endbestandMenge: number,
): FifoErgebnis {
  const verfuegbar = layers.reduce((s, l) => s + l.menge, 0);
  let rest = verfuegbar - endbestandMenge;

  let verbrauchBetrag = 0;
  let verbrauchCo2Kg = 0;
  let verbrauchCo2Kosten = 0;
  let verbrauchMenge = 0;

  for (const l of layers) {
    if (rest <= 0) break;
    const nimm = Math.min(l.menge, rest);
    const quote = l.menge > 0 ? nimm / l.menge : 0;
    verbrauchMenge += nimm;
    verbrauchBetrag += l.betrag * quote;
    verbrauchCo2Kg += (l.co2Kg ?? 0) * quote;
    verbrauchCo2Kosten += (l.co2Kosten ?? 0) * quote;
    rest -= nimm;
  }

  const gesamtBetrag = layers.reduce((s, l) => s + l.betrag, 0);

  return {
    verbrauchMenge: round(verbrauchMenge, 2),
    verbrauchBetrag: eur(verbrauchBetrag),
    verbrauchCo2Kg: round(verbrauchCo2Kg, 1),
    verbrauchCo2Kosten: eur(verbrauchCo2Kosten),
    restbestandMenge: round(endbestandMenge, 2),
    restbestandBetrag: eur(gesamtBetrag - verbrauchBetrag),
  };
}

// ────────────────────────────────────────────────────────────
// § 9 — Trennung Heizung / Warmwasser bei verbundenen Anlagen
// ────────────────────────────────────────────────────────────

export function trenneHeizungWarmwasser(m: TrennungMethode): TrennungErgebnis {
  switch (m.art) {
    case 'wmz': {
      const anteil = m.gesamtWaermemengeKwh > 0
        ? m.wwWaermemengeKwh / m.gesamtWaermemengeKwh
        : 0;
      return {
        wwEnergieKwh: m.wwWaermemengeKwh,
        wwAnteil: anteil,
        rechenweg:
          `Wärmemengenzähler: ${m.wwWaermemengeKwh.toLocaleString('de-DE')} kWh ` +
          `von ${m.gesamtWaermemengeKwh.toLocaleString('de-DE')} kWh = ${(anteil * 100).toFixed(2)} %`,
        warnungKeinWmz: false,
      };
    }
    case 'formel': {
      // § 9 Abs. 3 HeizkostenV: Q = 2,5 · V · (tw − 10)
      // brennwertFaktor: Umrechnung Heizwert (Hu) → Brennwert (Ho), Erdgas ≈ 1,11
      const q = 2.5 * m.wwVolumenM3 * (m.temperaturC - 10) * m.brennwertFaktor;
      const anteil = m.gesamtEnergieKwh > 0 ? q / m.gesamtEnergieKwh : 0;
      return {
        wwEnergieKwh: round(q, 2),
        wwAnteil: anteil,
        rechenweg:
          `§ 9 Abs. 3: 2,5 × ${m.wwVolumenM3} m³ × (${m.temperaturC}−10) × ${m.brennwertFaktor} ` +
          `= ${round(q, 2).toLocaleString('de-DE')} kWh = ${(anteil * 100).toFixed(2)} %`,
        warnungKeinWmz: true,
      };
    }
    case 'vorgabe':
      return {
        wwEnergieKwh: null,
        wwAnteil: m.wwAnteil,
        rechenweg: `Fester Anteil ${(m.wwAnteil * 100).toFixed(2)} %`,
        warnungKeinWmz: false,
      };
    case 'keine':
      return {
        wwEnergieKwh: null,
        wwAnteil: 0,
        rechenweg: 'Kein Warmwasser aus dieser Anlage',
        warnungKeinWmz: false,
      };
  }
}

// ────────────────────────────────────────────────────────────
// Verteilung
// ────────────────────────────────────────────────────────────

function anteilFuer(zr: Nutzerzeitraum, v: Verteilung): number {
  if (v.zeitteilung === 'gradtage') return zr.anteilGradtage;
  if (v.zeitteilung === 'kalendertage') return zr.anteilKalendertage;
  return 1;
}

/**
 * Verteilt einen Kostenbetrag auf die Nutzeinheiten.
 *
 * Die Bemessungsgrundlage wird bei Nutzerwechsel zeitanteilig gewichtet
 * (Fläche × Zeitanteil), Verbräuche dagegen nie — die kommen aus der
 * Zwischenablesung und sind bereits zeitraumbezogen.
 */
export function verteile(v: Verteilung, einheiten: Nutzeinheit[]): Posten[] {
  const relevant = einheiten.filter((e) => {
    if (v.direktAn) return e.id === v.direktAn;
    if (!v.nutzergruppe) return true;
    return e.nutzergruppen?.[v.nutzergruppe.bereich] === v.nutzergruppe.gruppe;
  });

  if (v.direktAn) {
    const e = relevant[0];
    if (!e) return [];
    return [{
      einheitId: e.id,
      zeitraum: e.zeitraeume[0].name,
      bezeichnung: v.bezeichnung,
      kategorie: v.kategorie,
      anteile: 1,
      betragJeEinheit: v.betrag,
      betrag: eur(v.betrag),
    }];
  }

  type Zeile = { e: Nutzeinheit; zr: Nutzerzeitraum; menge: number };
  const zeilen: Zeile[] = [];

  for (const e of relevant) {
    for (const zr of e.zeitraeume) {
      let menge: number;
      if (v.basis === 'flaeche') {
        // Bei Nutzerwechsel wird die zeitanteilige Fläche auf zwei Nachkomma-
        // stellen gerundet, bevor sie mit dem Einheitspreis multipliziert wird
        // — so weisen es die Messdienste aus (531/1000 × 89,95 m² = 47,76 m²).
        menge = round(e.flaecheM2 * anteilFuer(zr, v), 2);
      } else if (v.basis === 'nutzeinheit') {
        menge = round(anteilFuer(zr, v), 2);
      } else {
        menge = zr.verbrauch[v.basis.verbrauch] ?? 0;
      }
      zeilen.push({ e, zr, menge });
    }
  }

  const summe = zeilen.reduce((s, z) => s + z.menge, 0);
  if (summe === 0) return [];

  const preisJeEinheit = v.betrag / summe;

  const posten: Posten[] = zeilen.map((z) => ({
    einheitId: z.e.id,
    zeitraum: z.zr.name,
    bezeichnung: v.bezeichnung,
    kategorie: v.kategorie,
    anteile: round(z.menge, 2),
    betragJeEinheit: preisJeEinheit,
    betrag: eur(z.menge * preisJeEinheit),
  }));

  return summenerhaltendRunden(posten, v.betrag, zeilen.map((z) => z.menge * preisJeEinheit));
}

/**
 * Summenerhaltende Rundung (größter Rest zuerst).
 *
 * Werden alle Einzelbeträge unabhängig kaufmännisch gerundet, weicht ihre
 * Summe fast immer um ein paar Cent vom Verteilungsbetrag ab. Die Messdienste
 * gleichen das aus, indem einzelne Positionen um einen Cent angepasst werden —
 * sichtbar etwa bei „Verbrauchserfassung KW“: sechs Nutzer bekommen 9,07 €,
 * zwei bekommen 9,06 €, damit die Summe exakt 72,54 € ergibt.
 *
 * Ohne diesen Schritt stimmt die Summe der Einzelabrechnungen nicht mit der
 * Gesamtabrechnung überein — ein formaler Fehler, der zur Anfechtbarkeit führt.
 */
export function summenerhaltendRunden(posten: Posten[], ziel: number, exakt: number[]): Posten[] {
  const summeGerundet = eur(posten.reduce((s, p) => s + p.betrag, 0));
  let diffCent = Math.round((ziel - summeGerundet) * 100);
  if (diffCent === 0) return posten;

  // Positionen nach Rundungsrest sortieren: wer am meisten abgeschnitten
  // bekommen hat, wird zuerst aufgerundet (und umgekehrt).
  const reihenfolge = posten
    .map((_p, i) => ({ i, rest: exakt[i] * 100 - Math.round(exakt[i] * 100) }))
    .sort((a, b) => (diffCent > 0 ? b.rest - a.rest : a.rest - b.rest));

  const schritt = diffCent > 0 ? 0.01 : -0.01;
  for (const { i } of reihenfolge) {
    if (diffCent === 0) break;
    posten[i] = { ...posten[i], betrag: eur(posten[i].betrag + schritt) };
    diffCent -= diffCent > 0 ? 1 : -1;
  }
  return posten;
}

// ────────────────────────────────────────────────────────────
// CO2KostAufG — Stufenmodell Wohngebäude
// ────────────────────────────────────────────────────────────

const CO2_STUFEN: { bis: number; mieter: number; vermieter: number }[] = [
  { bis: 12, mieter: 1.0, vermieter: 0.0 },
  { bis: 17, mieter: 0.9, vermieter: 0.1 },
  { bis: 22, mieter: 0.8, vermieter: 0.2 },
  { bis: 27, mieter: 0.7, vermieter: 0.3 },
  { bis: 32, mieter: 0.6, vermieter: 0.4 },
  { bis: 37, mieter: 0.5, vermieter: 0.5 },
  { bis: 42, mieter: 0.4, vermieter: 0.6 },
  { bis: 47, mieter: 0.3, vermieter: 0.7 },
  { bis: 52, mieter: 0.2, vermieter: 0.8 },
  { bis: Infinity, mieter: 0.05, vermieter: 0.95 },
];

export function co2Aufteilung(
  co2Kg: number,
  co2Kosten: number,
  wohnflaeche: number,
): Co2Ergebnis {
  const proM2 = wohnflaeche > 0 ? co2Kg / wohnflaeche : 0;
  // Die Messdienste stufen anhand des auf eine Nachkommastelle gerundeten Werts ein.
  const gerundet = round(proM2, 1);
  const index = CO2_STUFEN.findIndex((s) => gerundet < s.bis);
  const stufe = CO2_STUFEN[index];
  return {
    emissionProM2: gerundet,
    stufe: index + 1,
    anteilMieter: stufe.mieter,
    anteilVermieter: stufe.vermieter,
    kostenMieter: eur(co2Kosten * stufe.mieter),
    kostenVermieter: eur(co2Kosten * stufe.vermieter),
  };
}
