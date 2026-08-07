# TOP-Bearbeitung speichert nicht – Ursache und Fix

## Diagnose (verifiziert)

Beim Speichern eines TOPs schickt der Editor immer das Feld `report_sections` mit. Ist der Schalter „Bericht der Verwaltung" aus, wird dabei `null` gesendet.

In der Datenbank ist `etv_agenda_items.report_sections` aber **NOT NULL** (Standardwert `{}`) – geprüft im Schema. Die Datenbank lehnt das Update deshalb komplett ab: Titel, Beschreibung, Beschlusstext, Kategorie – nichts wird gespeichert.

Warum keine Fehlermeldung erscheint: die Speicher-Mutation in `AgendaItemEditor.tsx` hat nur einen Erfolgs-Handler, keinen Fehler-Handler. Der Datenbankfehler wird still verworfen, die Bearbeitungsmaske schließt trotzdem.

## Umsetzung

1. `src/components/meetings/AgendaItemEditor.tsx`
   - Beim Speichern statt `null` ein leeres Objekt `{}` für `report_sections` senden (wenn kein Bericht aktiv).
   - Fehler-Handler (`onError`) an der Update-Mutation ergänzen: rote Fehlermeldung mit Datenbank-Text, damit solche Fälle nie wieder still scheitern.
   - Bearbeitungsmaske erst nach erfolgreichem Speichern schließen (aktuell schließt sie sofort, auch bei Fehler).
   - Gleiche Fehlerbehandlung für das Anlegen neuer TOPs prüfen und ergänzen, falls dort ebenfalls kein `onError` existiert.

2. Keine Datenbank-Änderung nötig.

## Test

TOP bearbeiten (Beschreibung + Beschlusstext ändern) → speichern → Werte bleiben nach Neuladen erhalten; mit aktivem „Bericht der Verwaltung" ebenfalls.
