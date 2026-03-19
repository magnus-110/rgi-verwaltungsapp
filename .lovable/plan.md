

# Plan: Kontoauszug-Abgleich und Buchungsworkflow

## Verstaendnis des Workflows

Der Nutzer moechte folgenden Ablauf:

```text
┌─────────────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│   RECHNUNGEN        │     │   KONTOAUSZUG        │     │   BUCHUNGEN      │
│                     │     │                      │     │                  │
│ - OCR Upload        │     │ - CAMT.053 Upload    │     │ - Aus Kontoauszug│
│ - Offen/Bezahlt     │────>│ - Match mit bezahl-  │────>│ - Angereichert   │
│ - Offen/Geprueft    │     │   ten Rechnungen     │     │   mit Rechnungs- │
│                     │     │ - Unbekannte Posten   │     │   daten          │
│ "Was muss noch      │     │   gegen Vorlagen     │     │ - Vorlagen-Daten │
│  gezahlt werden?"   │     │   abgleichen         │     │ - Manuell        │
│                     │     │ - Fehlende Rechnungen│     │                  │
└─────────────────────┘     │   identifizieren     │     └──────────────────┘
                            └──────────────────────┘
```

**Rechnungen** = Zahlungstracker ("Was muss noch bezahlt werden?")
**Kontoauszug** = Abgleich-Engine, die:
1. Bezahlte Rechnungen bestaetigt (Match IBAN + Betrag)
2. Unbekannte Kontobewegungen identifiziert
3. Unbekannte gegen Buchungsvorlagen matcht (z.B. monatliche Hausgeld-Eingaenge)
4. Zeigt ob Rechnungen fehlen fuer bestimmte Bewegungen

**Buchungen** = Endergebnis, gespeist aus Kontoauszug + Rechnungsdaten + Vorlagen + manuell

## Aenderungen

### 1. Datenbank: Neue Tabellen

**`bank_statements`** - Importierte Kontoauszuege
- `id`, `building_id`, `file_name`, `file_path`, `import_date`, `statement_date_from`, `statement_date_to`, `account_iban`, `created_by`, `created_at`

**`bank_transactions`** - Einzelne Kontobewegungen
- `id`, `statement_id`, `building_id`, `booking_date`, `value_date`, `amount`, `currency`, `debtor_name`, `debtor_iban`, `creditor_name`, `creditor_iban`, `purpose`, `end_to_end_ref`
- `match_status` (enum: `unmatched`, `matched_invoice`, `matched_template`, `manually_matched`, `ignored`)
- `matched_invoice_id` (FK invoices), `matched_template_id` (FK booking_templates)
- `booking_id` (FK bookings - wenn Buchung erstellt wurde)

**`booking_templates`** - Wiederkehrende Buchungsvorlagen
- `id`, `building_id`, `name`, `description`, `vendor_name`, `vendor_iban`, `expected_amount`, `account_id` (FK chart_of_accounts), `is_35a_relevant`, `interval` (monatlich/quartalsweise/jaehrlich), `category`

RLS: Admins/employees can manage all three tables.

### 2. Edge Function: `parse-bank-statement`

- Akzeptiert CAMT.053 XML-Datei
- Parst alle Einzeltransaktionen (Datum, Betrag, IBAN, Verwendungszweck)
- Speichert in `bank_statements` + `bank_transactions`
- Fuehrt automatisches Matching durch:
  - **Schritt 1**: Bezahlte Rechnungen matchen (IBAN + Betrag-Toleranz ±0.01)
  - **Schritt 2**: Ungematchte gegen `booking_templates` pruefen (IBAN oder Verwendungszweck-Muster)
  - **Schritt 3**: Rest bleibt `unmatched`

### 3. Neuer Tab "Kontoauszuege" in Finance-Seite

- Upload-Zone fuer CAMT.053 XML
- Liste importierter Auszuege mit Zusammenfassung (Anzahl Transaktionen, davon gematcht)
- Detail-Ansicht: Tabelle aller Transaktionen mit Farb-Kodierung:
  - Gruen = Rechnung gematcht
  - Blau = Vorlage gematcht
  - Gelb = Unbekannt (manuell zuweisen)
  - Grau = Ignoriert
- Aktion pro Transaktion: Rechnung zuweisen, Vorlage zuweisen, ignorieren, Buchung erstellen
- Button "Alle gematchten als Buchungen uebernehmen"

### 4. Neuer Tab "Buchungsvorlagen" in Finance-Seite

- CRUD fuer Buchungsvorlagen (Name, IBAN, erwarteter Betrag, Konto, Intervall)
- Vorlagen werden beim Kontoauszug-Import automatisch abgeglichen

### 5. Finance-Seite erweitern

- Von 3 Tabs auf 5 Tabs: Kontenrahmen | Rechnungen | Kontoauszuege | Buchungsvorlagen | Buchungen

## Technische Details

**CAMT.053 Parsing** (Edge Function):
- Standard-XML-Format aller deutschen Banken
- Relevante Pfade: `BkToCstmrStmt/Stmt/Ntry` fuer Einzelbuchungen
- Betrag: `Ntry/Amt`, Datum: `Ntry/BookgDt/Dt`, Verwendungszweck: `Ntry/NtryDtls/TxDtls/RmtInf/Ustrd`

**Matching-Algorithmus**:
```text
Fuer jede Transaktion:
  1. Suche in invoices WHERE status='paid' AND vendor_iban = txn.creditor_iban AND gross_amount = txn.amount
  2. Falls kein Match: Suche in booking_templates WHERE vendor_iban = txn.creditor_iban OR name ILIKE txn.purpose
  3. Falls kein Match: match_status = 'unmatched'
```

## Dateien

| Datei | Aenderung |
|---|---|
| Migration | 3 neue Tabellen + RLS |
| `supabase/functions/parse-bank-statement/index.ts` | CAMT.053 Parser + Matching |
| `src/components/finance/BankStatementsTab.tsx` | Neuer Tab: Upload + Transaktionsliste |
| `src/components/finance/BankTransactionRow.tsx` | Einzelne Transaktion mit Match-Aktionen |
| `src/components/finance/BookingTemplatesTab.tsx` | Neuer Tab: Vorlagen-CRUD |
| `src/pages/Finance.tsx` | 2 neue Tabs hinzufuegen |
| `src/integrations/supabase/types.ts` | Wird automatisch aktualisiert |

