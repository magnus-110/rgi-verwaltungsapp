## Diagnose

Der Fehler liegt nicht in Supabase und auch nicht daran, dass negative Beträge gespeichert werden sollten.

Aktuelle Buchungslogik:

- `bookings.amount` wird fachlich immer positiv gespeichert.
- Das Vorzeichen wird über `bookings.booking_type` gespeichert:
  - `income` = positiv
  - `expense` = negativ

Der konkrete Fehler entsteht in **Buchen → Buchungen**, besonders in der Kontenplan-Ansicht:

- Eine Buchung wird dort doppelt angezeigt: einmal auf dem Konto und einmal auf dem Gegenkonto.
- Für die Gegenkonto-Anzeige wird `booking_type` künstlich gedreht, damit der Kontosaldo korrekt angezeigt wird.
- Beim Klick auf diese Zeile bekommt `EditBookingDialog` aber diese gedrehte Anzeige-Kopie statt des echten Buchungsdatensatzes.
- Beim Speichern wird diese gedrehte Richtung dann zurück in die echte Buchung geschrieben.
- Ergebnis: Eine eigentlich positive Buchung kann beim Speichern negativ werden und lässt sich scheinbar nicht mehr dauerhaft positiv setzen.

## Plan zur Behebung

1. **Original-Buchung beim Bearbeiten erzwingen**
   - In `AccountPlanView` beim Klick auf eine Buchungszeile nicht die kontenseitig gedrehte Anzeige-Kopie an den Editor übergeben.
   - Stattdessen anhand der `id` die originale Buchung aus dem unveränderten `bookings`-Array suchen und diese an `onRowClick` übergeben.

2. **Gedrehte Anzeige weiterhin nur für Anzeige nutzen**
   - `useAccountAggregation` darf weiterhin die Gegenkonto-Seite für Salden/Anzeige drehen.
   - Diese gedrehte Kopie darf aber nicht mehr als editierbarer Datensatz verwendet werden.

3. **Edit-Dialog zusätzlich absichern**
   - `EditBookingDialog` soll beim Initialisieren defensiv mit Anzeige-Metadaten wie `_side: "counter"` umgehen.
   - Falls doch eine gedrehte Anzeige-Kopie ankommt, soll sie nicht ungeprüft als Speichergrundlage verwendet werden.

4. **Speicherlogik fachlich unverändert lassen**
   - `amount` bleibt positiv.
   - Nur `booking_type` bestimmt das Vorzeichen.
   - Keine Datenbankmigration nötig.

5. **Validierung**
   - Testfall: Positive Buchung öffnen → direkt speichern → bleibt positiv.
   - Testfall: Negative Buchung öffnen → auf positiv wechseln → speichern → bleibt positiv.
   - Testfall: Dieselbe Buchung aus der Gegenkonto-Zeile im Kontenplan öffnen → speichern → echtes Vorzeichen bleibt korrekt.