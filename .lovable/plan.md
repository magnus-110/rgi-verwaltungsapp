## Befund

Für **Tirolerstr. 142 / 2025** liegen in der Datenbank tatsächlich §35a-Buchungen vor: **43 Buchungen mit amount_35a > 0**. Die Ursache liegt daher nicht an fehlenden Daten.

Der wahrscheinlichste Fehler sitzt im Frontend-Datenfluss der Komponente `Paragraph35aSection`: Die Anzeige zählt zwar die geladenen Roh-Buchungen, rendert aber nur `blocks`. Diese Blöcke entstehen erst, wenn zu jeder Buchung die zugehörigen Konten erfolgreich nachgeladen und als Aufwandskonto erkannt werden. Wenn dieser zweite Schritt leer läuft oder ein Konto wegen fehlendem Verteilerschlüssel herausfällt, erscheint fälschlich „Keine Buchungen…“.

## Plan

1. **§35a-Query robuster machen**
   - Buchungen weiter über `building_id`, `fiscal_year` und `is_35a_relevant = true` laden.
   - `amount_35a` nicht mehr als versteckten Frontend-Ausschluss nutzen, wenn `is_35a_relevant` gesetzt ist; stattdessen für die Anzeige sauber auf `amount_35a ?? amount` zurückfallen.
   - Die Rechnungseinbettung (`invoices(...)`) optional halten, damit Buchungen ohne Rechnung nicht aus dem UI-Datenfluss verschwinden.

2. **Konten-Fallback reparieren**
   - Falls `chart_of_accounts` nicht rechtzeitig oder unvollständig geladen ist, trotzdem einen sichtbaren §35a-Block erzeugen statt alles zu verwerfen.
   - Bei bankzentrierten Buchungen bevorzugt `counter_account_id` als Aufwandskonto verwenden, wenn dieses §35a-relevant ist; erst danach auf `account_id` zurückfallen.
   - Für Konten ohne `default_distribution_key` einen sicheren Fallback `mea` setzen, damit sie nicht aus der Darstellung fallen.

3. **Fehlerzustand sichtbar machen**
   - Wenn Roh-Buchungen vorhanden sind, aber keine Blöcke erzeugt werden können, nicht „Keine Buchungen gefunden“ anzeigen, sondern einen klaren Hinweis wie „Buchungen gefunden, aber Kontenzuordnung fehlt“.
   - So ist beim nächsten Problem sofort unterscheidbar, ob keine Daten existieren oder nur die Verteilung blockiert.

4. **Validierung**
   - Nach Änderung prüfen, dass in der §35a-Karte für Tirolerstr. 142 / 2025 nicht mehr 0 erscheint, sondern die 43 vorhandenen Buchungen bzw. deren gruppierte Kontoblöcke gerendert werden.
   - Zusätzlich sicherstellen, dass die Bearbeitung des Typs Dienstleister/Handwerker und das Entfernen weiterhin funktionieren.

## Technische Änderung

Betroffene Dateien:
- `src/components/finance/Paragraph35aSection.tsx`
- `src/components/finance/lib/paragraph35aDistribution.ts`

Keine Datenbankmigration nötig; die Daten sind vorhanden.