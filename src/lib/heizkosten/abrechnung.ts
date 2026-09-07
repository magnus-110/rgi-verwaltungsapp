/**
 * Heizkostenabrechnung — Orchestrierung
 * =====================================
 *
 * Führt die Einzelschritte in der Reihenfolge zusammen, die die HeizkostenV
 * vorgibt:
 *
 *   1. Kosten nach Kostenart trennen (H, W, H/W)
 *   2. Heizung und Warmwasser trennen (§ 9)
 *   3. Je Verbrauchsart Grund- und Verbrauchskosten bilden (§ 7, § 8)
 *   4. Auf die Nutzeinheiten verteilen, summenerhaltend gerundet
 *   5. Prüfen
 *
 * Der gesamte Rechenweg landet im Ergebnis, damit eine Abrechnung auch Jahre
 * später nachvollziehbar bleibt.
 */

import {
  ENGINE_VERSION, co2Aufteilung, eur, round, summenerhaltendRunden,
  trenneHeizungWarmwasser, verteile,
} from './kern';
import { teileVerbrauchskosten } from './erfassung';
import { pruefeSchluessel, pruefeSumme } from './pruefungen';
import type {
  AbrechnungEingang, AbrechnungErgebnis, EinheitErgebnis, Kostenkategorie,
  Posten, Pruefhinweis, Verteilung,
} from './typen';

/** Summe der Kostenpositionen einer Art. */
function summe(eingang: AbrechnungEingang, art: 'heizung' | 'warmwasser' | 'beides'): number {
  return eur(
    eingang.kosten
      .filter((k) => k.art === art)
      .reduce((s, k) => s + k.betrag, 0),
  );
}

export function rechneAbrechnung(eingang: AbrechnungEingang): AbrechnungErgebnis {
  const { anlage } = eingang;
  const hinweise: Pruefhinweis[] = [];

  // ── 1 + 2: Kostenarten und § 9-Trennung ────────────────────────────────
  const gemeinsameKosten = summe(eingang, 'beides');
  const nurHeizung = summe(eingang, 'heizung');
  const nurWarmwasser = summe(eingang, 'warmwasser');

  const trennung = trenneHeizungWarmwasser(anlage.trennung);

  // Die Rundungskonvention ist anbieterspezifisch: RegioMess und BRUNATA
  // runden den Prozentsatz auf zwei Nachkommastellen (= vier Dezimalstellen im
  // Anteil), bevor sie ihn auf die Kosten anwenden, Allgäu Messpartner rechnet
  // mit dem exakten Quotienten. Ohne die richtige Wahl weichen die Beträge um
  // einige Cent ab.
  const wwAnteil =
    (anlage.rundungWwAnteil ?? 'prozent2') === 'exakt'
      ? trennung.wwAnteil
      : round(trennung.wwAnteil, 4);

  const wwErwaermung = eur(gemeinsameKosten * wwAnteil);
  const kostenWarmwasser = eur(wwErwaermung + nurWarmwasser);
  const kostenHeizung = eur(gemeinsameKosten - wwErwaermung + nurHeizung);

  const hatWarmwasser = anlage.trennung.art !== 'keine' && kostenWarmwasser > 0;

  hinweise.push(...pruefeSchluessel(
    anlage.gkAnteilHeizung,
    anlage.gkAnteilWarmwasser,
    trennung.warnungKeinWmz,
    hatWarmwasser,
  ));

  // ── 3: Grund- und Verbrauchskosten ───────────────────────────────────
  const verteilungen: Verteilung[] = [];

  const hzGk = eur(kostenHeizung * anlage.gkAnteilHeizung);
  const hzVk = eur(kostenHeizung - hzGk);

  if (hzGk > 0) {
    verteilungen.push({
      bezeichnung: 'Heizung Grundkosten',
      betrag: hzGk,
      kategorie: 'heizung_grund',
      basis: 'flaeche',
      // § 9b Abs. 2: Grundkosten der Heizung nach mittleren Gradtagen
      zeitteilung: 'gradtage',
    });
  }

  let erfassungAufteilung: AbrechnungErgebnis['erfassungAufteilung'];

  if (hzVk > 0) {
    if (eingang.erfassungHeizung && eingang.erfassungHeizung.length > 0) {
      // Mehrere Erfassungssysteme: gemeinsamer Preis je Bezugseinheit,
      // danach ein eigener Verteilungsblock je System.
      erfassungAufteilung = teileVerbrauchskosten(hzVk, eingang.erfassungHeizung);
      for (const block of erfassungAufteilung.bloecke) {
        if (block.betrag <= 0) continue;
        verteilungen.push({
          bezeichnung: `Heizung Verbrauchskosten — ${block.bezeichnung}`,
          betrag: block.betrag,
          kategorie: 'heizung_verbrauch',
          basis: { verbrauch: block.verbrauchKey },
          zeitteilung: 'keine',
        });
      }
    } else {
      verteilungen.push({
        bezeichnung: 'Heizung Verbrauchskosten',
        betrag: hzVk,
        kategorie: 'heizung_verbrauch',
        basis: { verbrauch: eingang.heizungVerbrauchKey },
        zeitteilung: 'keine',
      });
    }
  }

  const wwGk = eur(kostenWarmwasser * anlage.gkAnteilWarmwasser);
  const wwVk = eur(kostenWarmwasser - wwGk);

  if (wwGk > 0) {
    verteilungen.push({
      bezeichnung: 'Warmwasser Grundkosten',
      betrag: wwGk,
      kategorie: 'warmwasser_grund',
      basis: 'flaeche',
      // Warmwasser-Grundkosten nach Kalendertagen, nicht nach Gradtagen
      zeitteilung: 'kalendertage',
    });
  }
  if (wwVk > 0) {
    verteilungen.push({
      bezeichnung: 'Warmwasser Verbrauchskosten',
      betrag: wwVk,
      kategorie: 'warmwasser_verbrauch',
      basis: { verbrauch: eingang.warmwasserVerbrauchKey },
      zeitteilung: 'keine',
    });
  }

  verteilungen.push(...(eingang.sonstige ?? []));

  // ── 4: Verteilen ────────────────────────────────────────────────
  const posten: Posten[] = [];
  const summeJeSchluessel: Record<string, number> = {};

  for (const v of verteilungen) {
    const p = verteile(v, eingang.einheiten);
    posten.push(...p);
    summeJeSchluessel[v.bezeichnung] = eur(p.reduce((s, x) => s + x.betrag, 0));
  }

  // ── Ergebnis je Nutzeinheit und Zeitraum ───────────────────────────────
  const jeEinheit: EinheitErgebnis[] = [];

  for (const e of eingang.einheiten) {
    for (const zr of e.zeitraeume) {
      const eigene = posten.filter((p) => p.einheitId === e.id && p.zeitraum === zr.name);
      const nach = (k: Kostenkategorie) =>
        eur(eigene.filter((p) => p.kategorie === k).reduce((s, p) => s + p.betrag, 0));

      const zeile: EinheitErgebnis = {
        einheitId: e.id,
        zeitraum: zr.name,
        bezeichnung: e.bezeichnung,
        unitNumber: e.unitNumber ?? null,
        assignmentId: zr.assignmentId ?? e.assignmentId ?? null,
        mappingId: zr.mappingId ?? e.mappingId ?? null,
        von: zr.von,
        bis: zr.bis,
        flaecheM2: e.flaecheM2,
        heizungGrund: nach('heizung_grund'),
        heizungVerbrauch: nach('heizung_verbrauch'),
        warmwasserGrund: nach('warmwasser_grund'),
        warmwasserVerbrauch: nach('warmwasser_verbrauch'),
        wasser: nach('wasser'),
        sonstiges: nach('sonstiges'),
        gesamt: eur(eigene.reduce((s, p) => s + p.betrag, 0)),
        posten: eigene,
      };
      jeEinheit.push(zeile);
    }
  }

  // ── 4b: Gemeinschaftseigentum umlegen ─────────────────────────────────
  // Hausmeisterwohnung und Gemeinschaftsräume verbrauchen Wärme, haben aber
  // keinen Empfänger. Ihr Anteil wird deshalb ganz normal gerechnet — sonst
  // fehlte er in der Bezugsgröße und alle anderen zahlten zu viel — und
  // danach auf die übrigen Einheiten verteilt. Nach welchem Schlüssel das
  // geschieht, steht an der Anlage: die Wohnfläche ist der Regelfall, in
  // manchen Häusern beschließt die Gemeinschaft aber die Verteilung nach
  // Einheiten oder nach Miteigentumsanteil. Die Zeile der Gemeinschaft bleibt
  // mit ihrem Rechenweg stehen und geht auf null.
  const istGemeinschaft = new Set(
    eingang.einheiten.filter((e) => e.gemeinschaft).map((e) => e.id),
  );
  let umlageGemeinschaft: AbrechnungErgebnis['umlageGemeinschaft'];

  if (istGemeinschaft.size > 0) {
    const traeger = jeEinheit.filter((z) => !istGemeinschaft.has(z.einheitId));
    const betrag = eur(
      jeEinheit.filter((z) => istGemeinschaft.has(z.einheitId))
        .reduce((s, z) => s + z.gesamt, 0),
    );

    // Anteil je Einheit nach dem eingestellten Schlüssel. Fehlt er — weil bei
    // den Personen für diesen Schlüssel nichts hinterlegt ist — fällt die
    // Umlage auf die Wohnfläche zurück, und das wird gemeldet statt still
    // hingenommen: eine Umlage nach dem falschen Schlüssel ist ein Fehler,
    // den später niemand mehr bemerkt.
    const anteilJeEinheit = new Map(
      eingang.einheiten.map((e) => [e.id, e.umlageAnteil]),
    );
    const gewaehlt = anlage.umlageSchluessel;
    const traegerMitAnteil = traeger.filter(
      (z) => (anteilJeEinheit.get(z.einheitId) ?? 0) > 0,
    );
    const nachSchluessel = gewaehlt != null && traegerMitAnteil.length === traeger.length;

    if (gewaehlt != null && !nachSchluessel && betrag !== 0 && traeger.length > 0) {
      hinweise.push({
        schwere: 'warnung',
        norm: '§ 28 WEG',
        text: `Für den Umlageschlüssel „${gewaehlt.bezeichnung}“ ist nicht bei allen `
          + `Einheiten ein Anteil hinterlegt (${traegerMitAnteil.length} von ${traeger.length}). `
          + 'Das Gemeinschaftseigentum wurde ersatzweise nach Wohnfläche umgelegt.',
      });
    }

    const anteilVon = (z: EinheitErgebnis) =>
      nachSchluessel ? (anteilJeEinheit.get(z.einheitId) ?? 0) : z.flaecheM2;
    const schluesselName = nachSchluessel ? gewaehlt!.bezeichnung : 'Wohnfläche';
    const flaeche = traeger.reduce((s, z) => s + anteilVon(z), 0);

    if (betrag !== 0 && traeger.length > 0 && flaeche > 0) {
      const roh: Posten[] = traeger.map((z) => ({
        einheitId: z.einheitId,
        zeitraum: z.zeitraum,
        bezeichnung: `Umlage Gemeinschaftseigentum (nach ${schluesselName})`,
        kategorie: 'sonstiges' as Kostenkategorie,
        anteile: anteilVon(z),
        betragJeEinheit: betrag / flaeche,
        betrag: eur((betrag * anteilVon(z)) / flaeche),
      }));
      const verteiltUmlage = summenerhaltendRunden(roh, betrag, []);

      // Gegenbuchung: die Zeile der Gemeinschaft geht auf null.
      for (const z of jeEinheit) {
        if (!istGemeinschaft.has(z.einheitId) || z.gesamt === 0) continue;
        const gegen: Posten = {
          einheitId: z.einheitId,
          zeitraum: z.zeitraum,
          bezeichnung: 'Umlage auf alle Einheiten',
          kategorie: 'sonstiges',
          anteile: 0,
          betragJeEinheit: 0,
          betrag: eur(-z.gesamt),
        };
        posten.push(gegen);
        z.posten.push(gegen);
        z.sonstiges = eur(z.sonstiges + gegen.betrag);
        z.gesamt = 0;
      }

      for (const p of verteiltUmlage) {
        posten.push(p);
        const z = jeEinheit.find((x) => x.einheitId === p.einheitId && x.zeitraum === p.zeitraum);
        if (!z) continue;
        z.posten.push(p);
        z.sonstiges = eur(z.sonstiges + p.betrag);
        z.gesamt = eur(z.gesamt + p.betrag);
      }

      umlageGemeinschaft = {
        betrag,
        schluessel: schluesselName,
        anteile: round(flaeche, 2),
        einheiten: eingang.einheiten.filter((e) => e.gemeinschaft).map((e) => e.bezeichnung),
      };
    }
  }

  // ── 5: Prüfen ───────────────────────────────────────────────────
  const kostenSonstige = eur((eingang.sonstige ?? []).reduce((s, v) => s + v.betrag, 0));
  const zuVerteilen = eur(kostenHeizung + kostenWarmwasser + kostenSonstige);
  const verteilt = eur(jeEinheit.reduce((s, z) => s + z.gesamt, 0));
  hinweise.push(...pruefeSumme(verteilt, zuVerteilen));

  const co2 = eingang.co2
    ? co2Aufteilung(eingang.co2.kg, eingang.co2.kosten, anlage.abrechnungsflaecheM2)
    : undefined;

  return {
    engineVersion: ENGINE_VERSION,
    kostenGesamt: zuVerteilen,
    kostenHeizung,
    kostenWarmwasser,
    kostenSonstige,
    wwAnteil,
    rechenwegTrennung: trennung.rechenweg,
    erfassungAufteilung,
    umlageGemeinschaft,
    posten,
    summeJeSchluessel,
    jeEinheit,
    hinweise,
    co2,
  };
}
