// Weitere Werkzeuge des Konnektors (Rechnungen, Angebote, Kalender, …).
// Neue Module hier eintragen – index.ts bleibt dafür unverändert.
import { rechnungTools } from "./rechnungen.ts";
import { angebotTools } from "./angebote.ts";
import { kalenderTools } from "./kalender.ts";
import { dmsTools } from "./dms.ts";
import { unterschriftTools } from "./unterschriften.ts";

type Deps = {
  db: any;
  log: (tool: string, d: Record<string, unknown>) => Promise<void>;
  uploaderId: (email?: string) => Promise<string>;
  objektGroesse: (bucket: string, path: string) => Promise<number | null>;
};

/** Kurzhinweise für die Server-Anweisungen (initialize) */
export const WEITERE_HINWEISE = [
  "DMS-Ablage: mit dms_kategorien den passenden Unterordner wählen (nicht im Hauptordner ablegen); fehlt ein passender Ordner, mit dms_ordner_anlegen anlegen; falsch abgelegte Dokumente mit dms_dokumente_verschieben umsortieren. Ersetzte oder nicht benötigte Dokumente mit dms_dokumente_loeschen in den Papierkorb legen – zuerst ohne bestaetigt (Vorschau), dann nur nach ausdrücklicher Zustimmung; rückgängig mit dms_dokumente_wiederherstellen.",
  "RGI-Rechnungen schreiben: rechnung_entwurf_anlegen (Entwurf + Vorschau-PDF, Beträge nur nach Vorgabe des Nutzers), dann rechnung_festschreiben – zuerst ohne bestaetigt, Nummer erst nach ausdrücklicher Zustimmung.",
  "Verwalter-Angebote: angebote_suchen, angebot_lesen, angebot_speichern (anlegen/ändern, Sätze nur nach Vorgabe des Nutzers); gewonnenes Angebot mit angebot_gebaeude_anlegen in Gebäude + Verwaltervertrag übernehmen – zuerst ohne bestaetigt, dann nur nach ausdrücklicher Zustimmung.",
  "Kalender der App: kalender_lesen (Termine und fällige Aufgaben), termin_speichern (anlegen/ändern, Zeiten in deutscher Ortszeit, Teilnehmer per Mitarbeiter-E-Mail aus kalender_optionen).",
  "Elektronische Unterschrift (Textform § 126b BGB): zuerst unterschrift_dokument_analysieren (Unterschriftsstellen mit Koordinaten, Zuordnung zu Personen dem Nutzer zeigen), dann unterschrift_vorbereiten mit Feldern je Unterzeichner. art 'link' verschickt nichts und liefert persönliche Links (nur einmal im Klartext) zum Einfügen in eigene E-Mails; art 'email' schickt sofort Einladungen an Externe – nur nach Vorschau und ausdrücklicher Zustimmung (bestaetigt=true). SEPA-Lastschriftmandat oder Eigentümer-Stammdatenblatt an Eigentümer eines Objekts: unterschrift_aus_vorlage (fertige Vorlage mit platzierten Feldern, je Eigentümer ein Vorgang; email nur nach Vorschau + bestaetigt=true). Neuer Link: unterschrift_link_erstellen; Stand: unterschriften_status; Erinnerung: unterschrift_erinnern (ebenfalls erst nach Zustimmung).",
].join(" ");

export function weitereWerkzeuge(d: Deps) {
  return [
    ...rechnungTools(d),
    ...angebotTools(d),
    ...kalenderTools(d),
    ...dmsTools(d),
    ...unterschriftTools(d),
  ];
}
