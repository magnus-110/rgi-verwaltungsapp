## Ziel
Das angezeigte Vorzeichen muss überall zur tatsächlichen Buchung passen: beim Öffnen im Bearbeitungsdialog, beim Speichern nach Änderung und danach in Liste/Kontenplan.

## Festgestellte Ursache
Aktuell wird das Vorzeichen aus `booking_type` abgeleitet, während `amount` immer positiv gespeichert wird. Im Kontenplan werden Gegenkonto-Zeilen zusätzlich nur für die Anzeige invertiert. Dadurch entstehen zwei Probleme:

- Der Bearbeitungsdialog nimmt bei manchen Datensätzen/Ansichten die falsche Seite der Buchung als Quelle und zeigt deshalb beim Anklicken `+`, obwohl die Kontenplan-Zeile `-` zeigt.
- Beim Speichern wird nur `booking_type` gesetzt; die UI und Aggregation interpretieren dieselbe Buchung je nach Hauptkonto/Gegenkonto aber unterschiedlich. Dadurch wirkt die Änderung nicht konsistent.

## Umsetzung
1. **Klare Vorzeichen-Helfer einführen**
   - Eine kleine zentrale Logik im Finanzbereich nutzt künftig konsequent:
     - `income` = positiv auf `account_id`
     - `expense` = negativ auf `account_id`
     - auf `counter_account_id` wird dieses Vorzeichen nur für die Anzeige gedreht
   - Der Betrag bleibt als absoluter Betrag gespeichert.

2. **EditBookingDialog korrigieren**
   - Beim Öffnen wird das Vorzeichen aus der tatsächlichen Buchung bzw. der angeklickten Kontenplan-Seite korrekt hergeleitet.
   - Wenn der Nutzer `+` oder `−` auswählt, wird beim Speichern die echte Buchung so aktualisiert, dass die gewählte Anzeige-Seite danach exakt dieses Vorzeichen zeigt.
   - Damit kann eine negative Kontenplan-Zeile gezielt auf positiv geändert werden und umgekehrt.

3. **Kontenplan-Zeilen stabilisieren**
   - Die Anzeige-Zeile bekommt ein explizites Feld für das Anzeige-Vorzeichen, statt `booking_type` dauerhaft umzudeuten.
   - Beim Klick wird diese Anzeige-Seite an den Editor weitergegeben, ohne den Originaldatensatz zu verfälschen.

4. **Liste und Kontenplan vereinheitlichen**
   - In der normalen Buchungsliste wird weiterhin das Vorzeichen der Hauptkonto-Seite angezeigt.
   - Im Kontenplan wird je Konto die jeweilige Konto-Seite angezeigt.
   - Nach dem Speichern werden `bookings`, `bank-transactions` und die Kontenplan-Aggregation invalidiert, damit alle Ansichten sofort konsistent neu laden.

## Validierung
- Bestehende Buchung aus der Liste öffnen: Dialog zeigt das gleiche Vorzeichen wie die Liste.
- Bestehende Buchung aus dem Kontenplan öffnen: Dialog zeigt das gleiche Vorzeichen wie die angeklickte Kontenplan-Zeile.
- Vorzeichen ändern und speichern: Buchung und alle Ansichten zeigen anschließend das geänderte Vorzeichen korrekt.