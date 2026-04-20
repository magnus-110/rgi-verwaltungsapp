

## Ziel

Monatlicher **Bankkonten-Abgleich (Reconciliation)** als Sicherheitsnetz: Verwalter trägt Anfangs- und Endsaldo lt. physischem Kontoauszug ein, das System vergleicht mit dem Buchhaltungs-Saldo des Bankkontos zum Stichtag. Stimmt's überein → Häkchen "Monat geprüft". Stimmt's nicht → Differenz wird angezeigt, Verwalter weiß: Fehler liegt in **diesem Monat**.

## Praxis-Hintergrund

Klassischer Schritt aus der Buchhaltung. Im alten Programm: Kontoauszug ausdrucken → Anfangssaldo + Endsaldo händisch mit Bilanzkonto vergleichen → Häkchen. Wenn Dezember-Saldo nicht stimmt und nichts geprüft wurde, sucht man 12 Monate rückwärts. Mit Monatsprüfung: max. 1 Monat Suchaufwand.

## Datenmodell

**Neue Tabelle `bank_reconciliations`:**
```text
id                    uuid PK
building_id           uuid FK
bank_account_id       uuid FK → chart_of_accounts (Bankkonto, z.B. 1200)
period_year           int
period_month          int (1-12)
opening_balance_bank  numeric  -- lt. Kontoauszug (Verwalter trägt ein)
closing_balance_bank  numeric  -- lt. Kontoauszug (Verwalter trägt ein)
opening_balance_book  numeric  -- vom System berechnet
closing_balance_book  numeric  -- vom System berechnet
difference            numeric  -- closing_book - closing_bank
status                text     -- 'open' | 'matched' | 'mismatch' | 'confirmed'
confirmed_at          timestamp NULL
confirmed_by          uuid NULL
notes                 text NULL
unique (building_id, bank_account_id, period_year, period_month)
```

## UI-Integration

**Neuer Tab "Kontenabgleich" in Buchhaltung** (neben Kontoauszüge / Buchungen / Vorlagen) ODER kleiner Block oben in `BankStatementsTab`. Empfehlung: **eigener Tab** "Kontenabgleich", da klar abgegrenzte Tätigkeit.

### Komponente `BankReconciliationTab.tsx`

**Layout:**
- Header: Liegenschaft + Bankkonto-Auswahl (Dropdown der Bankkonten 1200, 1201...)
- Jahres-Übersicht: 12-Monats-Grid (Jan...Dez) mit Status-Ampel pro Monat:
  - 🟢 grün = bestätigt (matched + confirmed)
  - 🟡 gelb = offen (noch nicht geprüft)
  - 🔴 rot = Differenz erkannt
  - ⚪ grau = noch keine Buchungen im Monat

**Klick auf Monat → Detail-Dialog:**
```text
┌─ März 2026 — Bankkonto 1200 Hausbank ──────────────┐
│                                                     │
│ Anfangssaldo lt. Kontoauszug:  [12.500,00] €       │
│ Endsaldo lt. Kontoauszug:      [14.230,50] €       │
│                                                     │
│ ─── Vergleich ─────────────────────────────────     │
│ Anfangssaldo lt. Buchhaltung:  12.500,00 € ✓       │
│ Endsaldo lt. Buchhaltung:      14.180,50 €         │
│                                                     │
│ Differenz Endsaldo:            -50,00 € ⚠          │
│                                                     │
│ Notiz: [_________________________________]          │
│                                                     │
│ [Zu Buchungen März springen]  [Als geprüft markieren]│
└─────────────────────────────────────────────────────┘
```

**Logik:**
- `closing_balance_book` = Saldo Bankkonto am letzten Tag des Monats (SUM aller Buchungen `account_id = bank` − `counter_account_id = bank`, kumuliert bis Monatsende)
- Bei Differenz ≠ 0 → Status `mismatch`, Button "Als geprüft markieren" disabled (oder mit Warnung "trotz Differenz bestätigen")
- Bei Differenz = 0 → Button aktiv → Status `confirmed`, Eintrag in `confirmed_at` + `confirmed_by`

### Komfort-Features

1. **Auto-Vorbefüllung Anfangssaldo**: Endsaldo des Vormonats = Anfangssaldo des aktuellen Monats (bei lückenloser Kette)
2. **Auto-Übernahme aus CAMT-XML**: Wenn vorhanden, schlägt das System Anfangs-/Endsaldo aus den importierten Bankauszug-Headern vor (`bank_statements` → erweitern um `opening_balance` / `closing_balance` falls noch nicht vorhanden)
3. **Sprung zu Buchungen**: Filter Buchungsliste auf Monat + Bankkonto, damit Verwalter die Differenz lokalisieren kann
4. **Dashboard-Widget** in `Finance.tsx`: Badge "3 Monate offen / 1 Differenz" als Erinnerung

## Validierungs-Integration

In `BillingValidationPanel`:
- Neuer Check: "Kontenabgleich Bankkonto" → ✅ wenn alle Monate des Wirtschaftsjahres bis heute confirmed, ⚠ wenn offen, ❌ wenn mismatch

## Technische Umsetzung (Reihenfolge)

1. **Migration** — Tabelle `bank_reconciliations` + RLS (admin only) + optional Spalten `opening_balance`/`closing_balance` in `bank_statements`
2. **Helper-RPC** `calculate_account_balance_at(account_id, date)` — berechnet kumulierten Saldo eines Kontos zum Stichtag
3. **`BankReconciliationTab.tsx`** (neu) — 12-Monats-Grid + Detail-Dialog
4. **Integration in Buchhaltung** — neuer Tab "Kontenabgleich" in `Finance.tsx`
5. **Auto-Vorschlag aus CAMT** — `parse-bank-statement` Edge Function um Saldo-Extraktion erweitern (falls noch nicht vorhanden)
6. **Dashboard-Widget** — kleine Karte oben in `Finance.tsx` "Offene Kontenabgleiche"
7. **`BillingValidationPanel`** — Reconciliation-Check ergänzen
8. **Memory** speichern: `mem://features/finance/bank-reconciliation-monthly`

## Bewusste Vereinfachungen (KISS)

- **Pro Monat ein Eintrag** — keine wöchentliche/tägliche Granularität (Praxis: monatlich reicht)
- **Pro Bankkonto getrennt** — wenn 2 Bankkonten existieren, 2 Reconciliations pro Monat
- **Manuelle Eingabe der Salden** als Fallback — auch wenn CAMT-Auto-Vorschlag scheitert, kann Verwalter immer manuell eintragen
- **Keine Auto-Korrektur-Buchungen** — System zeigt nur Differenz, Verwalter muss Fehler selbst suchen und korrigieren (Rechtssicherheit)

