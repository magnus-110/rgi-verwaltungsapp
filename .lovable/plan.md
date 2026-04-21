

## Ziel
Eröffnungsbuchungen via Konto 4000 (Saldenvortragskonto) als gleichwertige Quelle für Jahresanfangsbestände nutzen – so wie in jeder professionellen Buchhaltung üblich. Die separate Tabelle `account_balances` bleibt als Fallback / explizite Übersteuerung erhalten, ist aber nicht mehr Pflicht.

## Praxis-Hintergrund
In der Hausverwaltung/SKR-Buchhaltung gibt es zwei legitime Wege, einen Anfangsbestand zu erfassen:

1. **Saldenvortrag (dein Weg, Standard)**: Buchung gegen Konto 4000 „Eröffnungsbuchungen" zum 01.01. – z. B. `1800 an 4000: 3.510 €`. Vorteil: Alles lebt im Buchungsjournal, voll nachvollziehbar, kein Doppelpflege-Risiko.
2. **Stammdaten-Eintrag**: Manueller Eintrag in `account_balances.opening_balance`. Sinnvoll nur, wenn keine Eröffnungsbuchung existiert (z. B. ganz neue Liegenschaft ohne Vorjahresdaten).

Aktuell verlangt das System Variante 2, obwohl Variante 1 schon vorhanden ist → unnötige Doppelarbeit.

## Lösung

### 1. Effektiven Anfangsbestand zentral berechnen
Neue Helper-Funktion `getEffectiveOpeningBalance(accountId, bookings, accountBalances, fiscalYear)`:
- **Priorität A**: Wenn Buchungen am 01.01. (oder erstem Tag des Wirtschaftsjahres) gegen Konto 4000 existieren, summiere diese als Anfangsbestand (über `sumForAccount`-Logik).
- **Priorität B**: Wenn `account_balances.opening_balance` gesetzt ist, nutze diesen Wert (manueller Override).
- **Fallback**: 0 €.

Diese Funktion lebt in `src/components/finance/lib/bookingAggregation.ts` (neben `sumForAccount`).

### 2. UI: BalanceCarryForward umbauen
- Neue Spalte „Quelle": zeigt automatisch erkannt, ob Anfangsbestand aus **Eröffnungsbuchung 4000** (grünes Badge + Datum/Betrag), aus **manuellem Eintrag** (graues Badge) oder **fehlend** (rotes Badge) kommt.
- Wenn Eröffnungsbuchung erkannt: Input-Feld read-only mit Hinweis „Aus Buchung 01.01. übernommen" + Link „manuell überschreiben".
- Hinweistext am Anfang des Cards: „Anfangsbestände werden bevorzugt aus Eröffnungsbuchungen (Gegenkonto 4000) ermittelt. Manuelle Einträge nur, wenn keine Eröffnungsbuchung existiert."
- „Salden übernehmen"-Button bleibt als Komfort für den Fall, dass weder Eröffnungsbuchung noch Vorjahresdaten existieren.

### 3. Asset Report & Settlement angleichen
`AssetReportSection.tsx` und `BillingSettlement.tsx` nutzen ebenfalls `getEffectiveOpeningBalance` statt direkt `account_balances.opening_balance`. So zeigen Vermögensbericht und Abrechnung automatisch den korrekten Wert (z. B. 3.510 € für dein Bankkonto), ohne dass du noch etwas eintragen musst.

### 4. Validation Panel ergänzen
`BillingValidationPanel.tsx`: Check „Anfangsbestände vorhanden" prüft beide Quellen. Solange entweder eine Eröffnungsbuchung gegen 4000 oder ein manueller Eintrag existiert, ist der Check grün.

### 5. Memory-Update
Neuer Eintrag `mem://features/finance/anfangsbestand-quellen`:
> Jahresanfangsbestände werden in 2 Varianten unterstützt: (1) Eröffnungsbuchung gegen Konto 4000 am ersten Tag des Wirtschaftsjahres (Standard, SKR-konform), (2) Manueller Eintrag in `account_balances.opening_balance`. Helper `getEffectiveOpeningBalance` priorisiert (1) vor (2). UI zeigt erkannte Quelle transparent an.

## Betroffene Dateien
- `src/components/finance/lib/bookingAggregation.ts` (Helper ergänzen)
- `src/components/finance/BalanceCarryForward.tsx` (UI mit Quellen-Erkennung)
- `src/components/finance/AssetReportSection.tsx` (Helper nutzen)
- `src/components/finance/BillingSettlement.tsx` (Helper nutzen)
- `src/components/finance/BillingValidationPanel.tsx` (Check anpassen)

## Konkretes Ergebnis für deine Liegenschaft
Nach Umsetzung erscheint im BalanceCarryForward für Konto 1800 automatisch:
- **Anfangsbestand 2025**: 3.510,00 € ✓ (aus Eröffnungsbuchung 01.01.25)
- Quelle-Badge: „Buchung 4000"
- Kein manueller Eintrag mehr nötig.

