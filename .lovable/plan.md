

## Zwei Probleme: Konten-Trennung + Bankkonto-Anzeige

### Problem 1: Personenkonten werden gebäudeübergreifend angezeigt

**Ursache**: Die Kontenabfragen in `CreateBookingDialog`, `EditBookingDialog`, `BookingReviewSection` und `AssignmentDialog` laden ALLE Konten aus `chart_of_accounts` ohne Filterung nach `building_id`. Da Personenkonten (0001, 0002, 0003) pro Gebäude existieren, aber verschiedene `building_id`s haben, werden z.B. die Konten von Beispielgebäude in Birkenweg-6-Buchungen referenziert.

**Bestätigter Datenbankbefund**: 4 Buchungen in Birkenweg 6 (`f5fa943b`) verweisen auf Konten von Beispielgebäude (`44899d2f`) — konkret "Hausgeld van Praag" und "Hausgeld Göttinger".

**Lösung**: Überall wo Konten geladen werden, muss gefiltert werden:
- Globale Konten (`building_id IS NULL`) immer anzeigen
- Gebäudespezifische Konten nur für die gewählte Liegenschaft (`building_id = selectedBuildingId`)

Betroffene Dateien:
1. **`CreateBookingDialog.tsx`** — Query `chart_of_accounts` nach `building_id` filtern (NULL oder ausgewählte Liegenschaft)
2. **`EditBookingDialog.tsx`** — Selbe Filterung
3. **`AssignmentDialog.tsx`** — Account-Combobox ebenfalls filtern
4. **`BookingReviewSection.tsx`** — Ist bereits korrekt nach `building_id` in bookings gefiltert, aber die fehlerhaften Buchungen existieren bereits in der DB

**Datenbereinigung**: Migration, die die 4 fehlerhaften Buchungen korrigiert — die `account_id` auf die korrekten Birkenweg-6-Konten umbiegt (Matching über `account_number`).

### Problem 2: Bankkonto (IBAN) bei Kontoauszügen anzeigen

**Ist-Zustand**: Die Transaktionsliste zeigt kein Bankkonto. Die IBAN ist in `bank_statements.account_iban` gespeichert.

**Lösung**: 
- In `BankStatementsTab.tsx` die `bank_statements`-Daten für den gewählten Liegenschaft laden
- Über dem Transaktionsbereich die Konto-IBAN als Info-Banner anzeigen (z.B. "Konto: DE48 7335 0000 0514 8409 82 — Giro Business WEG Birkenweg 6")
- Optional: Neues DB-Feld `account_name` in `bank_statements` speichern (aus CAMT-XML `<Nm>`-Element unter `<Acct>`)

### Dateien

1. `src/components/finance/CreateBookingDialog.tsx` — Konten nach building_id filtern
2. `src/components/finance/EditBookingDialog.tsx` — Konten nach building_id filtern  
3. `src/components/finance/AssignmentDialog.tsx` — Account-Combobox filtern
4. `src/components/finance/BankStatementsTab.tsx` — Bankkonto-Info anzeigen
5. Migration: Fehlerhafte account_ids in bookings korrigieren + `account_name` Spalte zu `bank_statements` hinzufügen
6. `supabase/functions/parse-bank-statement/index.ts` — Kontoname aus CAMT-XML extrahieren und speichern

