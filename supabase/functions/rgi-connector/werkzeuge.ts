// Weitere Werkzeuge des Konnektors (Rechnungen, Angebote, Kalender, …).
// Neue Module hier eintragen – index.ts bleibt dafür unverändert.
import { rechnungTools } from "./rechnungen.ts";
import { angebotTools } from "./angebote.ts";
import { kalenderTools } from "./kalender.ts";
import { dmsTools } from "./dms.ts";

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
].join(" ");

export function weitereWerkzeuge(d: Deps) {
  return [
    ...rechnungTools(d),
    ...angebotTools(d),
    ...kalenderTools(d),
    ...dmsTools(d),
  ];
}
