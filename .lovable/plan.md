## Phase 4 — Mieter-Nebenkostenabrechnung (Read-Verteilung)

### Prinzip
- **Kostenbasis:** Alle Konten mit `chart_of_accounts.is_billing_relevant = true` im gewählten Wirtschaftsjahr (über v_account_movements / sumForAccount, wie bei der WEG).
- **Verteilerschlüssel:** kommt aus `chart_of_accounts.default_distribution_key` (z.B. `qm`, `personen`, `einheit`, `verbrauch_wasser`, custom…).
- **Anteil pro Mieter:** `contact_building_shares.share_value` für die zur `default_distribution_key` passende `share_type`.
- **Zeitanteil:** Tag-genaue Überschneidung von Mieter-Zeitraum (`valid_from/valid_to`) mit dem Wirtschaftsjahr, gewichtet die Quote zusätzlich.
- **NK-Vorz.:** aus `contact_building_costs` (cost_type ILIKE „nebenkosten", interval monatlich), wie bereits in Phase 3 berechnet.
- **Saldo:** `Summe Umlage − Summe NK-Vorz. = Nachzahlung (>0) / Guthaben (<0)`.

### Validierung vor Verteilung
Pro umlagefähigem Konto:
1. `default_distribution_key` gesetzt? sonst Warnung „Konto X hat keinen Verteilerschlüssel".
2. Mindestens ein Mieter im Zeitraum hat einen `contact_building_shares`-Eintrag mit passender `share_type`? sonst Warnung „Konto X verwendet Schlüssel 'Y', aber kein Mieter hat einen Y-Anteil gepflegt".
3. Summe der Anteile > 0.

Warnungen werden oben in einem `BillingValidationPanel`-ähnlichen Bereich gesammelt. Bei Fehlern wird trotzdem gerendert, das betroffene Konto bleibt aber unverteilt (Hinweis in Tabelle).

### UI: neuer Tab `RentBillingPage`
Eintrag im bestehenden Finance-Layout: wenn `isRentMode`, zeigt der „Abrechnung"-Tab nicht mehr `BillingTab` (WEG) sondern eine neue `RentBillingPage` (komplett getrennte Komponente).

Aufbau:
1. **Header:** Gebäude, Wirtschaftsjahr, Anzahl Mieter im Zeitraum.
2. **Validierungspanel** (Warnungen siehe oben).
3. **Gesamtverteilung-Tabelle (read-only):**
   - Zeilen: jedes umlagefähige Konto.
   - Spalten: Kontonr · Bezeichnung · Saldo Periode · Schlüssel · Σ Anteile · davon umlagef.
4. **Mieter-Einzelabrechnungen:** Accordion pro Mieter.
   - Kopf: Name · Einheit · Zeitraum · Monate.
   - Tabelle: Konto · Schlüssel · sein Anteil · Kontosumme · sein Zeitanteil (Monate/12) · **Umlage €**.
   - Footer: Σ Umlage · Σ NK-Vorz. (aus Phase 3) · **Saldo (Nachzahlung/Guthaben)**.

### Was NICHT enthalten ist
- Keine Buchungen ins Hauptbuch (keine Sollstellung, keine 1700/1710-Logik).
- Kein PDF, kein Versand, keine Sperre/Festschreibung.
- Keine USt, kein settlement_note.
- Kein Heizkosten-FIFO/Brunata (kommt in späterer Phase, separat).

### Datenmodell
- **Keine Schema-Änderungen.** Alles arbeitet auf vorhandenen Tabellen: `chart_of_accounts`, `bookings`/`v_account_movements`, `contact_building_assignments`, `contact_building_shares`, `contact_building_costs`.

### Dateien
- Neu: `src/components/finance/rent/RentBillingPage.tsx` (Hauptseite).
- Neu: `src/components/finance/rent/lib/computeRentSettlement.ts` (reine Funktion: nimmt Konten + Bookings + Mieter + Shares + Costs → liefert pro Mieter die Verteilungsmatrix).
- Edit: `src/pages/Finance.tsx` — im Tab `abrechnung`: bei `isRentMode` → `RentBillingPage` statt `BillingTab`.

### Testfälle
1. Konto „Müllgebühr" 1.200 €, Schlüssel `qm`, 2 Mieter (50/50 qm, ganzes Jahr) → je 600 € Umlage.
2. Mieter zog 1.7. ein → halbjährige Umlage (6/12), Restanteil bleibt beim Vermieter (nicht umlagefähig zu anderen Mietern).
3. Konto ohne `default_distribution_key` → Warnung, Umlage 0.
4. Konto mit Schlüssel `personen`, aber kein Mieter hat `personen`-Anteil → Warnung, Umlage 0.
5. Mieter mit NK-Vorz. 150 €/M × 12 = 1.800 € und Σ Umlage 1.620 € → Guthaben 180 €.
