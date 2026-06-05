## Problem

Aktuell werden Salden aus hochgeladenen Kontoauszügen unzuverlässig in den monatlichen Kontenabgleich übernommen — teilweise gar nicht, teilweise auf den falschen Monat. Ursachen im Code:

1. **IBAN→Bankkonto-Mapping defekt:** In `syncReconciliation` (sowohl in `parse-bank-statement` als auch `parse-bank-statement-pdf`) wird `.or(...)` zweimal hintereinander aufgerufen. Supabase-PostgREST überschreibt dabei den ersten Filter — die IBAN-Bedingung greift nicht. Folge: irgendein 18xx/10xx-Konto wird gewählt, oft das falsche.
2. **Nur ein Monat pro Auszug:** `syncReconciliation` schreibt Opening/Closing immer in genau einen Monat (`month = dateTo`). Ein CAMT/PDF, der mehrere Monate (z. B. Jan–Dez) abdeckt, schreibt seine Werte nur in den letzten Monat — alle anderen Monate bleiben leer oder bekommen denselben Vortrag.
3. **Multi-`<Stmt>` CAMT wird nicht erkannt:** `getTag(cleanXml, "Stmt")` liefert nur den ersten Statement-Block. Banken liefern oft pro Monat ein `<Stmt>` in einer Datei — der Rest wird ignoriert.
4. **Bestehende Importe werden nicht nachträglich verbucht:** Wenn ein Auszug vor dem Fix importiert wurde, gibt es keine Möglichkeit, den Saldo-Sync für genau diesen Monat manuell anzustoßen.

## Fix

### 1. IBAN-Lookup in beiden Edge Functions korrigieren

`supabase/functions/parse-bank-statement/index.ts` und `parse-bank-statement-pdf/index.ts`:

```ts
let bankAccountId: string | null = null;
if (iban) {
  const cleanIban = iban.replace(/\s/g, "").toUpperCase();
  const { data: coa } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("iban", cleanIban)
    .or(`building_id.is.null,building_id.eq.${buildingId}`)
    .limit(1);
  if (coa?.length) bankAccountId = coa[0].id;
}
```

Wichtig: `.eq` zuerst, dann `.or` — nicht zweimal `.or`.

### 2. CAMT-Parser auf mehrere `<Stmt>` umstellen

In `parse-bank-statement/index.ts`:
- `getAllTags(cleanXml, "Stmt")` statt `getTag(...)`.
- Pro Statement-Block einzeln: Salden extrahieren, `bank_statements`-Row anlegen, Transaktionen parsen, dedupen, `syncReconciliation` aufrufen.
- Ein Aggregat-Result zurückgeben (Summe importierter Transaktionen, Anzahl Statements, je Statement Monat+Saldo).

### 3. Mehrmonatigen Auszug auf alle betroffenen Monate verteilen

Neuer Helper `syncReconciliationRange(buildingId, statementId, iban, dateFrom, dateTo, opening, closing, source)`:

- Erster Monat (`dateFrom`): bekommt `opening_balance_bank = opening`.
- Letzter Monat (`dateTo`): bekommt `closing_balance_bank = closing`.
- Wenn `from` == `to` (Single-Monat): wie bisher Opening+Closing in denselben Monat.
- Zwischenmonate werden NICHT mit Phantom-Werten befüllt — wir markieren sie aber als „aus Auszug verfügbar" (Feld `source_statement_id` setzen, Status `open` lassen), damit der Nutzer sieht: hier liegt ein Auszug.
- `bank_source` wird nur überschrieben, wenn vorher leer oder gleicher Quelltyp (bestehende Logik bleibt).

### 4. Dialog `ReconciliationDialog` (Frontend) erweitern

`src/components/finance/BankReconciliationTab.tsx`:

- Beim Öffnen des Monats: zusätzlich `bank_statements` für (buildingId, bankAccountId via IBAN, period_year/month) abfragen. Wenn ein Auszug den Monat abdeckt und Opening/Closing dort verfügbar sind, vorbelegen — aber nur wenn die Felder bisher leer sind und der Nutzer noch keinen manuellen Wert gespeichert hat.
- Info-Banner im Dialog: „Salden aus Auszug ‹Dateiname› vom ‹Datum›" mit Button **„Salden übernehmen"** (überschreibt das aktuelle Eingabefeld mit Auszugswerten).
- Hinweis-Text, wenn mehrere Auszüge denselben Monat berühren.

### 5. Monatskacheln visuell ergänzen

In der Monatsübersicht: kleines Bank-Icon, wenn für den Monat ein `bank_statements`-Eintrag existiert (auch ohne `bank_reconciliations`-Row). So sieht der Nutzer sofort, wo Quelle vorhanden ist.

### 6. Validierung

- Manuelles Test-Szenario: einen Jahres-CAMT (Jan–Dez) erneut hochladen → erwartet: jeder Monat mit eigenem `<Stmt>` bekommt korrektes Opening/Closing; Single-Monat-Auszüge wie bisher.
- Test mit PDF, das nur einen Monat abdeckt: weiterhin korrekt.
- Test mit falscher IBAN-Zuordnung: 1800-Konto wird sauber per IBAN gewählt, nicht per Fallback.

## Technical Details

**Dateien:**
- `supabase/functions/parse-bank-statement/index.ts` — Multi-Stmt-Loop, IBAN-Fix, `syncReconciliationRange`.
- `supabase/functions/parse-bank-statement-pdf/index.ts` — IBAN-Fix, `syncReconciliationRange`.
- `src/components/finance/BankReconciliationTab.tsx` — Dialog-Vorbelegung aus `bank_statements`, Quelle-Badge, Monatskachel-Icon.

**Keine Schema-Änderungen.** Vorhandene Felder reichen: `bank_statements.statement_date_from/to`, `opening_balance`, `closing_balance`, `account_iban`, `building_id` sowie `bank_reconciliations.source_statement_id`, `bank_source`.

**Backwards-kompatibel:** Bereits importierte Auszüge können über den neuen „Salden übernehmen"-Button im Dialog nachträglich übernommen werden — kein Neu-Import nötig.
