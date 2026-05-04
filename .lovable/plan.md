# Korrektur: Falsche Empfängerzuordnung beim PDF-Import

## Was ist passiert?

Sie haben recht — es gibt einen echten Datenfehler. Im PDF steht klar:

| Datum | Betrag | Empfänger laut PDF |
|---|---|---|
| 13.02.2025 | -114,24 € | **Markus Reithemann** (DE88720900000008475318) |
| 17.02.2025 | -112,95 € | Landkreis Ostallgäu (DE48733500000610595696) |

In der DB ist die 13.02.-Buchung jedoch fälschlich mit den Empfängerdaten der Landkreis-Buchung verknüpft (Name "Landkreis Ostallgaeu", IBAN DE48..., Verwendungszweck "Abfallgebuehr 1.Quartal 2025").

## Ursache

Die Edge Function `parse-bank-statement-pdf` nutzt Mistral OCR + Mistral LLM, um Transaktionen aus dem Markdown zu extrahieren. Die VR-Bank-PDFs platzieren Empfänger und Datum in unüblicher Reihenfolge (Empfängername steht **über** dem Block, Betrag/Datum **rechts daneben** als getrenntes Tabellenfragment). Das LLM hat hier Spalten falsch gemappt und die Reithemann-Zeile mit den Landkreis-Metadaten "kombiniert".

Bestätigt durch die bereits gespeicherte Warnung am Statement:
> Summenprüfung: Σ Transaktionen -1786.78 € ≠ Differenz -1060.78 € (Δ -726.00 €)

Diese Δ -726 € deutet darauf hin, dass mindestens eine weitere Transaktion verschoben/dupliziert wurde — der Fehler ist also nicht isoliert.

## Geplante Maßnahmen

### 1. Fehlerhaften Datensatz korrigieren (DB-Update)
- Update der DB-Zeile `510077a5-...` (13.02., -114,24 €):
  - `creditor_name` → "Markus Reithemann"
  - `creditor_iban` → "DE88720900000008475318"
  - `purpose` → "250167, 02/25 SecureGo plus"
  - `matched_invoice_id` → `NULL`, `match_status` → `unmatched`
- **Komplette Neu-Verifikation aller 14 Transaktionen** dieses Statements (`40b17193-...`) gegen das Original-PDF — andere Zeilen prüfen und ggf. mit-korrigieren (Δ 726 € deutet auf weitere Fehler hin).

### 2. Parser robuster machen (`parse-bank-statement-pdf/index.ts`)
- **Strict-Prompt erweitern**: explizit klarstellen, dass jede Transaktion genau einen Block (Empfängername + IBAN + Betrag + Datum + Verwendungszweck) bildet und NIE Felder über Blockgrenzen kombiniert werden dürfen. Beispiel-Block aus VR-Bank-Format mitliefern.
- **Saldo-Validierung als harte Warnung im UI**: Wenn `Σ ≠ closing-opening`, soll der Import nicht stillschweigend durchgehen — ein deutlich sichtbares rotes Warn-Badge an der Statement-Karte (`BankStatementsTab`) zeigen mit "Datensätze prüfen!" Hinweis.
- **Plausibilitätscheck pro Transaktion**: Wenn Empfänger-IBAN aus einer anderen Bank stammt als der EREF/MREF nahelegt (z. B. SecureGo-Buchungen ohne EREF/MREF, aber mit Landkreis-Referenz im Purpose), Warnung loggen.

### 3. UI: Manuelle Korrektur ermöglichen
Im `TransactionDetailSheet` einen "Bearbeiten"-Button hinzufügen, mit dem `creditor_name`, `creditor_iban`, `debtor_name`, `debtor_iban`, `purpose` und `match_status` direkt korrigierbar sind. So können Sie selbst nachträglich Parser-Fehler beheben, ohne die Buchung neu importieren zu müssen.

## Technische Details

**Betroffene Dateien:**
- `supabase/functions/parse-bank-statement-pdf/index.ts` — Prompt verschärfen, Beispiel-Block für VR-Bank-Format mitgeben
- `src/components/finance/BankStatementsTab.tsx` — rotes Warn-Badge bei `parse_warnings` mit "Summenprüfung"-Treffer
- `src/components/finance/TransactionDetailSheet.tsx` — Edit-Modus für Empfängerdaten + Verwendungszweck
- DB-Migration NICHT nötig — nur ein Daten-Update via SQL für den konkreten Datensatz

**Daten-Update (SQL):**
```sql
UPDATE bank_transactions SET
  creditor_name = 'Markus Reithemann',
  creditor_iban = 'DE88720900000008475318',
  purpose = '250167, 02/25 SecureGo plus',
  matched_invoice_id = NULL,
  match_status = 'unmatched'
WHERE id = '510077a5-6c21-4b9a-b46c-9e1e710b19ca';
```
(Plus Korrekturen für weitere falsch geparste Zeilen, die ich beim PDF-Vergleich finde.)

## Was passiert NICHT

- Kein Schema-/Tabellenänderung
- Keine Änderung am OCR-Provider (Mistral bleibt)
- Keine Auswirkung auf andere Statements — nur dieses eine fehlerhafte plus Parser-Härtung für künftige Imports
