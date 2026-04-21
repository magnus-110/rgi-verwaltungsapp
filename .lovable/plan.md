

# Schwachstellen-Behebung – Abrechnung Ende-zu-Ende (überarbeitet)

Korrektur zur Vorversion: Die Buchungen auf **4110 (ARAP – aktive Rechnungsabgrenzung)** und **4130 (PRAP – passive Rechnungsabgrenzung)** sind keine Fehlbuchungen, sondern korrekte periodengerechte Abgrenzungen für Vorjahres-Nachzahlungen und Folgejahres-Vorauszahlungen. Issue #3 entfällt; stattdessen sorgen wir dafür, dass diese Abgrenzungen im Vermögensbericht und in der Bilanz korrekt sichtbar werden.

---

## 🔴 Kritisch

### 1. Erhaltungsrücklage & Bankkonten zeigen 0 € (kein closing_balance gepflegt)
**Fix:** Neuer Helper `getEffectiveClosingBalance` in `bookingAggregation.ts`:
```
closing = getEffectiveOpeningBalance(...) + sumForAccount(accountId, bookings)
```
Verwendung in `EconomicPlanEditor` (Reservenstand), `AssetReportSection` (Bank + Rücklage), `BillingSettlement` (Schlusssaldi automatisch).

### 2. HeatingRebookingSection ignoriert counter_account_id
**Fix:** `getAccountTotal` von `bookings.filter(b => b.account_id === id)` auf `sumForAccount(id, bookings)` umstellen. Damit werden bank-zentrische Buchungen (z. B. `1800 an 1431`) korrekt erfasst.

---

## 🟠 Mittel

### 3. Rechnungsabgrenzungsposten (4110/4130) fehlen im Vermögensbericht
**Praxis:** ARAP/PRAP müssen als Bilanzposten ausgewiesen werden – nicht als laufender Aufwand.
**Fix:** 
- `AssetReportSection` um zwei neue Zeilen erweitern: „Aktive Rechnungsabgrenzung (4110)" und „Passive Rechnungsabgrenzung (4130)" mit Saldo via `sumForAccount`.
- `BillingValidationPanel`: Hinweis (kein Fehler) wenn ARAP/PRAP-Salden offen sind: „Periodenfremde Beträge ausgewiesen – Auflösung im Folgejahr prüfen".
- `BillingSettlement`: ARAP/PRAP-Konten aus `operating_distributable` ausschließen (sind Bilanz, nicht Aufwand).

### 4. Rücklagen-Zinsen werden als Einkommen statt als Rücklagen-Zuwachs geführt
**Fix:** In `AssetReportSection` Zinsbuchungen, deren Gegenkonto das Rücklagenkonto (1810) ist, separat als „Zinszuwachs Rücklage" ausweisen und aus `totalIncome` herausnehmen.

### 5. KapESt (1850) + SolZ (1860) falsch als Bewirtschaftungskosten
**Fix:** DB-Migration: `chart_of_accounts` für 1850/1860 → `settlement_section='reserve'`, `is_billing_relevant=false`. Sie mindern dann den Rücklagenstand statt als nicht-umlagefähigen Aufwand zu erscheinen.

### 6. EconomicPlanEditor – Reservenstand-Query
**Fix:** Filter robust auf `settlement_section='reserve'` umstellen (statt Namens-`ilike`), Saldo via `getEffectiveClosingBalance`.

---

## 🟡 Klein

### 7. React-Key-Warning in `GesamtplanStep`
Fragment mit `key={`cat-${category}`}` ergänzen.

### 8. Heizkosten-Validation: 1400 Edge-Case
1400 aus dem Heizkonten-Set ausnehmen (ist Repost-Ziel, kein Quellkonto).

### 9. Saldenübernahme – Schlusssaldo automatisch
Beim Klick „Salden übernehmen" Closing automatisch via Helper berechnen, manueller Override bleibt.

---

## 📋 Umsetzungsreihenfolge
1. Helper `getEffectiveClosingBalance` in `bookingAggregation.ts`
2. `HeatingRebookingSection` → `sumForAccount`
3. `AssetReportSection` → Bank + Rücklage + ARAP/PRAP-Zeilen + Zins-Sonderbehandlung
4. `EconomicPlanEditor.reserveBalance` → Helper + section-Filter
5. `BillingSettlement` → Closing-Salden automatisch, ARAP/PRAP aus Aufwand ausschließen
6. `BillingValidationPanel` → ARAP/PRAP-Hinweis + 1400-Edge-Case
7. DB-Migration: 1850/1860 → `settlement_section='reserve'`
8. React-Key-Fix in `GesamtplanStep`

## 📁 Betroffene Dateien
- `src/components/finance/lib/bookingAggregation.ts`
- `src/components/finance/HeatingRebookingSection.tsx`
- `src/components/finance/AssetReportSection.tsx`
- `src/components/finance/EconomicPlanEditor.tsx`
- `src/components/finance/BillingSettlement.tsx`
- `src/components/finance/BillingValidationPanel.tsx`
- DB-Migration `chart_of_accounts` (1850/1860)

## 🎯 Konkretes Ergebnis
- Vermögensbericht zeigt Bank 1800, Rücklage 1810 (13.609 € + Zinsen − KapESt/SolZ) sowie ARAP/PRAP als eigene Bilanzposten.
- Wirtschaftsplan-Reservenstand: 13.624,89 € statt 0 €.
- HK-Umbuchung erfasst alle Heizkonten inkl. Brunata-Gerätemiete.
- Abgrenzungsbuchungen bleiben als RAP transparent ausgewiesen, ohne den laufenden Aufwand zu verfälschen.

