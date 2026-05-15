## Diagnose: Warum aktuell -63.667,45 € entsteht

Der falsche Wert kommt nicht aus einem einzelnen Rundungsfehler, sondern aus mehreren Quellen in `AssetReportSection`:

1. **`booking_type` wird im Vermögensbericht nicht geladen**
   - `AssetReportSection` ruft Buchungen aktuell ohne `booking_type` ab.
   - Danach wird aber `signedTotalForAccount(...)` verwendet.
   - Ohne `booking_type` behandelt diese Funktion jede Buchung als Ausgabe.
   - Dadurch werden echte Bestandskonten massiv falsch:
     - Konto 1800 wird aktuell rechnerisch ca. **-58.528,85 €** statt korrekt **+8.961,47 €**.
     - Konto 1810 wird ca. **-457,82 €** statt korrekt **+15.443,14 €**.

2. **Die Anfangsbestände werden mit der falschen Logik kombiniert**
   - Für den Vermögensbericht darf nicht `opening aus 4000` plus `signed movements ohne 4000` verwendet werden.
   - Korrekt ist für Bestandskonten: **signierter Kontensaldo über alle Periodenbuchungen inkl. Eröffnungsbuchung 4000**.
   - Genau damit kommt man bei der Tiroler Straße auf:
     - 1450 Heizöl: **4.650,59 €**
     - 1800 Giro: **8.961,47 €**
     - 1810 Rücklage: **15.443,14 €**

3. **Heizöl wird falsch einsortiert bzw. aktuell nicht sauber aus `fuel_inventory` geladen**
   - Die Excel-Vorlage zeigt Heizölrestbestand unter **Liquide Mittel aus Bankkonten und Kasse**.
   - Die UI zeigt Konto 1450 aktuell unter **Sonstige Vermögensposten** und mit falschem Vorzeichen.
   - Zusätzlich fragt der Code ein nicht vorhandenes Feld `end_value_eur` aus `fuel_inventory` ab; dadurch kann der Fuel-Block leer bleiben.

4. **Abgrenzungen werden im Vermögensbericht mit einer falschen Display-Formel gedreht**
   - Aktuell wird teilweise `Math.abs(...) * getAccrualDisplaySign(...)` genutzt.
   - Für den Vermögensbericht muss aber der **echte signierte Kontensaldo** angezeigt werden.
   - Damit entstehen die Excel-Werte:
     - 4110 Ausg. im lfd. J. für Vorjahr: **+924,95 €**
     - 4130 Einn. im lfd. J. für Vorjahr: **-20,79 €**
     - 4160 Ausg. im Folgejahr für lfd. J.: **-940,51 €**

5. **Die Struktur entspricht noch nicht vollständig der Excel-Struktur**
   - Korrekt sind diese Blöcke:
     1. Liquide Mittel aus Bankkonten und Kasse
     2. Guth. und Nachz. aus Abrechnung incl. Altschulden
     3. Zu- und Abflüsse aus Jahresabgrenzung
     4. Forderungen zum Jahresende
     5. Verbindlichkeiten zum Jahresende
     6. Weitere Vermögenswerte / manuelle Posten

## Zielwert laut Excel

```text
Liquide Mittel:
  Heizölrestbestand        4.650,59 €
  VR Bank Giro             8.961,47 €
  VR Bank Rücklagen       15.443,14 €
  Zwischensumme           29.055,20 €

Guthaben/Nachzahlungen:
  Guthaben aus Abr.       -1.223,06 €
  Nachzahlung aus Abr.     1.443,15 €
  Zwischensumme              220,09 €

Jahresabgrenzung:
  Ausg. im Folgejahr       -940,51 €

Forderungen zum Jahresende:
  Ausg. lfd. J. Vorjahr     924,95 €
  Einn. lfd. J. Vorjahr     -20,79 €
  Zwischensumme             904,16 €

Vermögensstand:          29.238,94 €
```

## Was ich zur korrekten Berechnung brauche

Aus der Datenbank:

- `bookings`: `account_id`, `counter_account_id`, `amount`, `booking_date`, `booking_type`, `status`
- `billing_periods`: `period_from`, `period_to`, damit nach Zeitraum gefiltert wird, nicht blind nach `fiscal_year`
- `chart_of_accounts`: `account_number`, `account_name`, `settlement_section`, `is_asset_report_relevant`
- `fuel_inventory`: `entry_type`, `total_price`, `billing_period_id` für den Heizöl-Endbestand
- `asset_report_items`: manuelle weitere Vermögenswerte
- Für **Guthaben/Nachzahlung aus Abrechnung** zusätzlich die berechneten `ownerResults` aus der Abrechnung, weil diese Werte aktuell nicht als Buchungen auf 4020 gespeichert sind.

## Umsetzungsplan

1. **Saldo-Helfer für Vermögensbericht korrigieren**
   - Buchungen inklusive `booking_type` laden.
   - Nach `billing_period.period_from` bis `period_to` filtern.
   - Für Bestandskonten den signierten Saldo über alle Periodenbuchungen verwenden.
   - Fallback nur dann auf `account_balances.opening_balance + Bewegungen`, wenn keine 4000-Eröffnungsbuchung existiert.

2. **Fuel-Logik korrigieren**
   - `end_value_eur` aus der Supabase-Abfrage entfernen.
   - Heizöl-Endbestand aus `fuel_inventory.entry_type = 'closing_balance'` und `total_price` berechnen.
   - Konto 1450 nicht mehr als „Sonstige Vermögensposten“ ausgeben, wenn es als Heizölrestbestand in Liquide Mittel ausgewiesen wird.

3. **Excel-Struktur exakt nachbauen**
   - Sektionen wie in der Excel-Datei aufbauen.
   - Null-Zeilen ausblenden, außer wenn eine feste Excel-Zeile fachlich sichtbar bleiben soll.
   - Manuelle weitere Vermögenswerte separat darunter behalten.

4. **Abgrenzungen nach echtem signierten Saldo ausweisen**
   - Keine `Math.abs(...) * Vorzeichenregel` mehr im Vermögensbericht.
   - 4110/4130 in **Forderungen zum Jahresende**.
   - 4120/4140/4160/4180 bzw. die entsprechenden Folgejahr-Konten in **Zu- und Abflüsse aus Jahresabgrenzung**.

5. **Guthaben/Nachzahlungen einspeisen**
   - `AssetReportSection` bekommt optional die `ownerResults` aus `BillingSettlement`.
   - In der Abrechnungsansicht werden daraus korrekt berechnet:
     - Eigentümer-Guthaben = negative WEG-Verbindlichkeit
     - Eigentümer-Nachzahlung = positive WEG-Forderung
   - In der separaten Finanz-Seite kann der Block nur dann vollständig sein, wenn diese Ergebnisse übergeben oder später gespeichert werden.

6. **Prüfung gegen Tiroler Straße 2025**
   - Nach Umsetzung rechnerisch prüfen, dass die UI auf **29.238,94 €** kommt.
   - Zusätzlich sicherstellen, dass Konten mit Saldo 0 ausgeblendet werden und das Rücklagenkonto positiv erscheint.