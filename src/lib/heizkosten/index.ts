/**
 * Heizkostenabrechnung nach HeizkostenV
 * =====================================
 *
 * Öffentliche Schnittstelle des Rechenkerns. Der Kern kennt weder Supabase
 * noch React — er bekommt einen Eingang und liefert ein Ergebnis samt
 * Rechenweg und Prüfhinweisen.
 *
 * Ein vollständiger Lauf sieht so aus:
 *
 *   import { rechneAbrechnung } from '@/lib/heizkosten';
 *   const ergebnis = rechneAbrechnung(eingang);
 *
 * Die Anbindung an die Datenbank liegt in `daten.ts`: `ladeEingang` baut den
 * Eingang aus den Stammdaten zusammen, `speichereErgebnis` schreibt das
 * Ergebnis zurück — auch in `heating_distribution_values`, aus der die
 * Jahresabrechnung, die Einzelabrechnung und die Mieter-Nebenkostenabrechnung
 * bereits heute lesen.
 */

export { ENGINE_VERSION, round, eur, fifoVerbrauch, trenneHeizungWarmwasser, verteile, co2Aufteilung, summenerhaltendRunden } from './kern';
export { teileVerbrauchskosten } from './erfassung';
export { rechneAbrechnung } from './abrechnung';
export {
  ersatzwertVorschlaege, ersterBrauchbarerVorschlag, pruefeErsatzwertGrenze,
  type ErsatzwertStufe, type ErsatzwertVorschlag, type ErsatzwertEingang, type ErsatzwertGrenze,
} from './ersatzwerte';
export {
  pruefeSchluessel, pruefeEichung, pruefeBewertungsfaktoren, pruefeVerbrauchssprung,
  pruefeSumme, pruefePflichtangaben, pruefeVerbrauchsinformation,
  type GeraetPruefung,
} from './pruefungen';
export * from './typen';
