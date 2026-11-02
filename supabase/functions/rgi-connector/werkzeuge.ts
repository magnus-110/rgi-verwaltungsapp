// Weitere Werkzeuge des Konnektors (Rechnungen, Angebote, Kalender, …).
// Neue Module hier eintragen – index.ts bleibt dafür unverändert.
import { rechnungTools } from "./rechnungen.ts";
import { angebotTools } from "./angebote.ts";
import { kalenderTools } from "./kalender.ts";

type Deps = {
  db: any;
  log: (tool: string, d: Record<string, unknown>) => Promise<void>;
  uploaderId: (email?: string) => Promise<string>;
  objektGroesse: (bucket: string, path: string) => Promise<number | null>;
};

/** Kurzhinweise für die Server-Anweisungen (initialize) */
export const WEITERE_HINWEISE = [
  "RGI-Rechnungen schreiben: rechnung_entwurf_anlegen (Entwurf + Vorschau-PDF, Beträge nur nach Vorgabe des Nutzers), dann rechnung_festschreiben – zuerst ohne bestaetigt, Nummer erst nach ausdrücklicher Zustimmung.",
  "Verwalter-Angebote: angebote_suchen, angebot_lesen, angebot_speichern (anlegen/ändern, Sätze nur nach Vorgabe des Nutzers); gewonnenes Angebot mit angebot_gebaeude_anlegen in Gebäude + Verwaltervertrag übernehmen – zuerst ohne bestaetigt, dann nur nach ausdrücklicher Zustimmung.",
  "Kalender der App: kalender_lesen (Termine und fällige Aufgaben), termin_speichern (anlegen/ändern, Zeiten in deutscher Ortszeit, Teilnehmer per Mitarbeiter-E-Mail aus kalender_optionen).",
].join(" ");

export function weitereWerkzeuge(d: Deps) {
  return [
    ...rechnungTools(d),
    ...angebotTools(d),
    ...kalenderTools(d),
  ];
}
