# TOP-Reihenfolge (Drag & Drop) + Grunddaten standardmäßig zu

## Problem

Beim Verschieben eines Tagesordnungspunkts springt die Karte zurück bzw. die neue Reihenfolge erscheint verzögert oder gar nicht. Grund im aktuellen Code (`src/components/meetings/AgendaItemEditor.tsx`):

- Nach dem Loslassen wird die Liste **nicht sofort** lokal umsortiert. Angezeigt wird weiter das alte Query-Ergebnis, bis alle Schreibvorgänge fertig sind.
- Die Reihenfolge wird mit **einem einzelnen UPDATE pro TOP nacheinander** gespeichert. Bei 10+ TOPs dauert das spürbar, und während der Zwischenzustände kann ein Refetch eine gemischte Reihenfolge zeigen.
- Fehler beim Speichern werden **nicht angezeigt** (kein `onError`), es sieht dann so aus, als „funktioniere Drag & Drop nicht“.

(Die Datenbank hat keine Unique-Beschränkung auf `sort_order`, und aktuell gibt es keine doppelten Werte — das Problem liegt im Frontend-Ablauf.)

## Lösung

1. **Sofortige optimistische Umsortierung**: Beim `onDragEnd` wird die neue Reihenfolge direkt in den React-Query-Cache geschrieben, die Karte bleibt also an der neuen Position.
2. **Ein Schreibvorgang statt vieler**: Die neuen `sort_order`-Werte werden gebündelt gespeichert (ein `upsert` mit allen betroffenen Zeilen), danach einmal invalidiert.
3. **Fehlerbehandlung**: Schlägt das Speichern fehl, wird die alte Reihenfolge wiederhergestellt und ein Fehler-Toast angezeigt.
4. **Robustere Anzeige**: TOP-Nummerierung bleibt an der Listenposition orientiert; Drag bleibt während des Bearbeitungsmodus deaktiviert (wie bisher).

## Grunddaten

In `src/components/meetings/MeetingEditor.tsx` startet Schritt 1 („Grunddaten“) mit `{ 0: true }`. Der Startzustand wird auf „alle zu“ geändert, sodass beim Öffnen einer Versammlung nichts aufgeklappt ist. Bei einer **neuen** Versammlung bleibt Grunddaten geöffnet, da dort sonst kein Eingabefeld sichtbar wäre.

## Betroffene Dateien

- `src/components/meetings/AgendaItemEditor.tsx`
- `src/components/meetings/MeetingEditor.tsx`
