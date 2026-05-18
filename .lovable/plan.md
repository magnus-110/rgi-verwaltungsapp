## Ziel

Pro Liegenschaft soll jedem aus den Kontoauszügen erkannten Bankkonto (IBAN) eine eigene Bezeichnung **und** ein Konto aus dem Kontenrahmen (z. B. Bank 1800, Rücklage I 1810, Rücklage II 1820 …) zugeordnet werden können. Buchungen aus diesem Kontoauszug werden danach automatisch auf das richtige Bank-/Rücklagenkonto gebucht.

Beispiel **Neuer Weg 14**: 6 IBANs → jede IBAN bekommt einen Namen ("Instandhaltungsrücklage Haus A") und ein eigenes COA-Konto (1811, 1812, …). Beim Import der Auszüge landet jede Transaktion automatisch auf dem zugeordneten Konto.

## Was gebaut wird

### 1. Neue Tabelle `building_bank_accounts`

Speichert die Zuordnung IBAN → COA-Konto pro Liegenschaft.

Felder (Domain):
- `building_id`, `iban` (unique je Liegenschaft)
- `display_name` (frei wählbare Bezeichnung, z. B. "Rücklage Aufzug")
- `coa_account_id` → `chart_of_accounts.id` (Pflicht, sobald zugeordnet)
- `bank_name` (auto aus BIC/Auszug), `is_active`

RLS analog zu anderen finance-Tabellen (Admin/Verwalter dieser Liegenschaft).

### 2. UI: Bank-Konten-Verwaltung in **Buchhaltung → Kontoauszüge**

Die heutige Pillen-Leiste mit den IBANs (siehe Screenshot Neuer Weg 14) wird klickbar. Klick auf eine IBAN-Pille öffnet ein Dialog mit:

- IBAN (read-only) + Bank
- Feld **Bezeichnung** (Freitext, z. B. "Rücklage Haus A")
- Feld **Konto im Kontenrahmen** (Suchcombobox `AccountSearchSelect`, gefiltert auf Kategorie "Bankkonto" / Rücklagen)
- Button **„Neues Konto im Kontenrahmen anlegen"** → öffnet `CreateAccountInlineDialog` (nur für diese Liegenschaft, `building_id` gesetzt). Nach dem Anlegen wird es direkt in der Combobox vorausgewählt.
- Speichern

Nicht zugeordnete IBANs erhalten einen orangen „Zuordnen"-Badge, damit der Nutzer sieht, wo noch Arbeit liegt.

### 3. Automatische Konto-Zuweisung bei Buchungen

Heute hardcoded:
```
const bankAccount = accounts.find(a => a.account_number === "1800") || …
```
in `TransactionReviewMode.tsx` (Zeilen 379 und 464) sowie analog im Make-Webhook-Pfad.

Neue Logik (Helper `resolveBankAccountForTransaction`):
1. IBAN der Transaktion → `bank_statements.account_iban` lesen
2. In `building_bank_accounts` nach (building_id, iban) suchen
3. Wenn Mapping vorhanden → `coa_account_id` verwenden
4. Sonst Fallback wie bisher (1800)

Damit landen Buchungen aus Auszug IBAN-A automatisch auf 1811, aus IBAN-B auf 1812 usw. — sowohl im Review-Mode als auch beim Auto-Booking via Make.

### 4. Anzeige der Zuordnung

- IBAN-Pille zeigt: `IBAN — Bezeichnung (Kontonr.)`
- In Kontenplan-Übersicht erscheinen die neu angelegten Liegenschafts-spezifischen Bankkonten korrekt sortiert in der Sektion „Bankkonten".

## Technische Details

Migration:
```sql
CREATE TABLE public.building_bank_accounts (
  id uuid pk default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  iban text not null,
  display_name text,
  coa_account_id uuid references chart_of_accounts(id) on delete set null,
  bank_name text,
  is_active boolean default true,
  created_at, updated_at,
  unique (building_id, iban)
);
-- RLS: SELECT/INSERT/UPDATE/DELETE für authentifizierte Admins der Liegenschaft
```

Frontend:
- Neue Komponente `BankAccountMappingDialog.tsx`
- Neuer Hook `useBuildingBankAccounts(buildingId)`
- Anpassung `BankStatementsTab.tsx` (Pillen klickbar, Mapping-Anzeige)
- Anpassung `TransactionReviewMode.tsx` (Helper statt Hardcode)
- Ggf. Anpassung Make-Webhook-Handler in `supabase/functions/` (gleicher Helper-Port nach Deno).

Keine Änderung an bestehenden Buchungen — Mapping wirkt nur auf neue/künftige Buchungen. Optional späterer „Bestehende Buchungen umbuchen"-Button (nicht in diesem Scope).

## Nicht enthalten

- Rückwirkendes Umbuchen bereits existierender Buchungen (separater Schritt, auf Wunsch)
- Multi-IBAN-Mapping zu einem Konto (1:1 reicht für den Use-Case)
