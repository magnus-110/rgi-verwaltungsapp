

## Plan: Intelligente Unterscheidung — "Rechnung fehlt" vs. "Vorlage erstellen"

### Das Problem
Aktuell schlägt die KI bei jeder unzugeordneten wiederkehrenden Transaktion eine neue Vorlage vor (`template_suggestion`). Das ist falsch für Fälle, wo es historisch Rechnungen gab (z.B. Gas-Abschlag mit Jahresrechnung) — dort fehlt einfach die aktuelle Rechnung.

### Die Lösung: Historische Buchungsdaten als KI-Kontext

**Kernidee:** Beim Aufruf von `suggest-match` zusätzlich die historischen Buchungen desselben Kreditors (IBAN/Name) mitliefern — inklusive der Info, ob diese mit Rechnungen verknüpft waren. Die KI entscheidet dann:

1. **Historisch MIT Rechnungen** → Neues Feld `missing_invoice_hint` statt `template_suggestion`. Markiert die Transaktion als "Rechnung fehlt noch" mit Erklärung
2. **Historisch OHNE Rechnungen** → Wie bisher `template_suggestion` für neue Vorlage

### Änderungen

**1. Edge Function `suggest-match/index.ts`**

- Neuer optionaler Input: `historicalBookings` — Array mit vergangenen Buchungen desselben Kreditors inkl. `has_invoice: boolean`
- System-Prompt erweitern um die Regel:
  > "Wenn historische Buchungen desselben Kreditors ÜBERWIEGEND mit Rechnungen verknüpft waren, erstelle KEINE template_suggestion sondern setze missing_invoice_hint mit einer Erklärung, dass die Rechnung noch fehlt."
- Neues Tool-Output-Feld `missing_invoice_hint`:
  ```
  { vendor_name, expected_invoice_description, last_invoice_date, explanation }
  ```

**2. Frontend `AssignmentDialog.tsx`**

- Vor dem KI-Aufruf: Query auf `bookings` WHERE gleicher Kreditor (IBAN oder Name) + gleiches Gebäude, aus den letzten 2 Jahren. Pro Buchung: `{ amount, date, has_invoice: !!invoice_id }`
- Diese als `historicalBookings` an die Edge Function mitgeben
- Neuer State `missingInvoiceHint` — zeigt ein gelbes Banner: "⚠️ Rechnung fehlt — In der Vergangenheit gab es für [Kreditor] regelmäßig Rechnungen. Bitte Rechnung anfordern/hochladen."

**3. Kontoauszug-Ansicht (BankStatementsTab)**

- Transaktionen, die vom KI als "Rechnung fehlt" markiert wurden, bekommen ein oranges Badge/Icon (z.B. `FileWarning`) in der Liste
- Optional: Neuer `match_status`-Wert `invoice_pending` in der `bank_transactions`-Tabelle, damit man filtern kann

### Technische Details

```text
Frontend (AssignmentDialog)
  │
  ├─ Query: historische Buchungen des Kreditors (letzte 2 Jahre)
  │   → SELECT amount, booking_date, invoice_id IS NOT NULL as has_invoice
  │     FROM bookings WHERE building_id = X 
  │     AND (description ILIKE '%vendor%' OR invoice_id IN (SELECT id FROM invoices WHERE vendor_iban = Y))
  │
  └─ suggest-match Edge Function
      │
      ├─ Historisch mit Rechnungen? → missing_invoice_hint
      └─ Historisch ohne Rechnungen? → template_suggestion (wie bisher)
```

### Dateien
- `supabase/functions/suggest-match/index.ts` — Prompt + neues Output-Feld
- `src/components/finance/AssignmentDialog.tsx` — Historische Daten laden + Banner anzeigen
- `src/components/finance/BankStatementsTab.tsx` — Badge für "Rechnung fehlt"
- Migration: neuer `match_status`-Wert `invoice_pending` (falls als Enum gespeichert, sonst nur Textfeld)

### Kein Overengineering
- Keine automatische Vorlage bei fehlender Rechnung
- Kein neues UI-Element nötig — nur ein Banner im AssignmentDialog + Badge in der Liste
- Die KI macht die Entscheidung, der Nutzer sieht nur das Ergebnis

