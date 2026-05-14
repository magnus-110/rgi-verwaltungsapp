## Befund

Die 5.701 € entstehen nicht aus den Hausgeld-Stammdaten selbst, sondern aus der Monatslogik in `BillingSettlement.tsx`:

- Die Datenbank-Hausgelder ergeben korrekt **32.946 €** Gesamt-Soll für 2025.
- Abzüglich **5.000 € EHR** ergibt das **27.946 € Vorschüsse zur Kostendeckung**.
- Die aktuelle App zeigt aber **22.455 € Kostendeckung** und **5.701 € Überzahlung**.
- Differenz: **5.491 €**. Das ist exakt die Summe der Hausgelder für **Januar + Juli 2025**.

Ursache: `new Date('2025-01-01')` wird im Browser als UTC-Datum geparst. In deutscher Zeitzone wird daraus lokal der Vortag, wodurch Monats-Stichtage am `valid_from`-Datum (01.01. und 01.07.) beim Vergleich aus der Gültigkeit herausfallen. Dadurch fehlen Januar und Juli im Soll; die fehlenden 5.491 € werden dann fälschlich als Überzahlung interpretiert.

## Umsetzung

1. In `BillingSettlement.tsx` eine sichere Datums-/Monatsstichtag-Logik einführen:
   - ISO-Datum `YYYY-MM-DD` ohne Zeitzonenverschiebung als lokales Datum parsen.
   - Monatserste als `Date(year, month, 1)` vergleichen.
   - `valid_from`/`valid_to` ebenfalls auf lokale Monatsstichtage normalisieren.

2. Die Soll-Hausgeld-Gesamtberechnung damit korrigieren:
   - Für jeden Monat im Abrechnungszeitraum zählt ausschließlich der Betrag, der am **1. des Monats** gültig ist.
   - Keine tagesgenaue Proration.
   - `Hausgeld`, `Nebenkosten` und `Ruecklage` bleiben die relevanten Soll-Positionen.

3. Dieselbe Monatsstichtag-Logik für die Einzelabrechnungs-SOLL-Werte verwenden:
   - `hausgeld` je Eigentümer.
   - `reserve` je Eigentümer.
   - Damit Gesamt- und Einzelabrechnung konsistent bleiben.

4. Die Abrechnungsspitze gemäß deiner Ziel-Logik prüfen/anpassen:
   - Vorschüsse Kostendeckung + EHR + positive Überzahlung
   - minus verteilungsrelevante umlagefähige Kosten
   - minus verteilungsrelevante nicht umlagefähige Kosten
   - minus relevante Abgrenzungen, falls vorhanden
   - minus IHR-Plan

## Erwartetes Ergebnis für Adolf-Haff-Weg 2025

- Vorschüsse zur Kostendeckung: **27.946 €**
- Vorschüsse auf Erhaltungsrücklage: **5.000 €**
- Überzahlung Vorschüsse: **210 €**
- Keine fälschliche Überzahlung von **5.701 €** mehr.