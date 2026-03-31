

## Liegenschaftsspezifische Zuordnung & bessere Vergleichsansicht

### Änderungen

**1. Edge Function `parse-bank-statement/index.ts` — Matching nur mit liegenschaftsspezifischen Vorlagen**

In `matchTransactions()` (Zeile ~105): Templates-Query um `.eq("building_id", buildingId)` ergänzen, sodass nur Vorlagen der jeweiligen Liegenschaft zum automatischen Matching herangezogen werden. Rechnungen ebenfalls auf die Liegenschaft filtern.

**2. `BankStatementsTab.tsx` — Manuelle Zuordnung: nur liegenschaftsspezifische Daten**

- **Invoices-Query** (Zeile 95-107): Filter auf `building_id = selectedBuilding` hinzufügen. Neuen State `showMatchedInvoices` (default `false`) einführen — standardmäßig nur Rechnungen ohne bestehende Banktransaktions-Zuordnung anzeigen. Toggle-Checkbox "Bereits zugeordnete anzeigen" hinzufügen.
- **Templates-Query** (Zeile 109-119): Filter auf `building_id = selectedBuilding`.
- Beide Queries sollen von `selectedBuilding` abhängen.

**3. `BankStatementsTab.tsx` — Bessere Vergleichsansicht im Zuordnungsdialog (Zeile 633-680)**

Den Dialog erweitern:
- Transaktionsdetails prominent anzeigen: **Betrag, Name (Empfänger/Auftraggeber), IBAN, Verwendungszweck, Datum** — alles auf einen Blick sichtbar
- Bei Rechnungen im Select: **Rechnungsnummer, Lieferant, Betrag, IBAN, Rechnungsdatum** anzeigen (statt nur Nr/Name/Betrag)
- Bei Vorlagen: **Name, Lieferant, erwarteter Betrag, IBAN** anzeigen
- Rechnungs-Query erweitert um `vendor_iban, invoice_date`
- Templates-Query erweitert um `vendor_iban, expected_amount`
- Checkbox/Switch: "Bereits zugeordnete Rechnungen anzeigen" (default: aus)

### Dateien
1. `supabase/functions/parse-bank-statement/index.ts` — matchTransactions liegenschaftsspezifisch
2. `src/components/finance/BankStatementsTab.tsx` — Queries filtern, Dialog umbauen

