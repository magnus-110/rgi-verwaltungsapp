

## Direktimport ohne KI-Analyse

### Problem
Die CSV hat jetzt das exakte Zielformat (Vorname, Firma, Typ, Telefon 1, Telefon 1 Notiz, E-Mail 1, E-Mail 1 Notiz, Person 2, etc.), aber:
1. **HEADER_MAP** kennt die neuen Spaltennamen nicht ("Vorname", "Firma", "Typ", "Telefon 1 Notiz", "E-Mail 1 Notiz", "Person 2 Anrede/Vorname/Nachname", "Notizen")
2. Die Telefon/E-Mail-Regex matcht "Telefon 1 Notiz" als Telefonnummer statt als Notiz
3. Die KI-Analyse ist bei vorstrukturierten Daten unnötig und verursacht Timeouts bei 700+ Kontakten

### Lösung
Direktes Client-seitiges Parsing ohne KI — die CSV enthält bereits alle Felder korrekt getrennt.

### Änderungen

**Datei 1: `src/components/contacts/ImportContactsCsvDialog.tsx`**

- **HEADER_MAP erweitern** um alle neuen Spalten:
  - `vorname` → `vorname`, `firma` → `firma`, `typ` → `typ`
  - `telefon 1` → `telefon_1`, `telefon 1 notiz` → `telefon_1_notiz`
  - `telefon 2` → `telefon_2`, `telefon 2 notiz` → `telefon_2_notiz`
  - `telefon 3` → `telefon_3`, `telefon 3 notiz` → `telefon_3_notiz`
  - `e-mail 1` → `email_1`, `e-mail 1 notiz` → `email_1_notiz`
  - `e-mail 2` → `email_2`, `e-mail 2 notiz` → `email_2_notiz`
  - `person 2 anrede/vorname/nachname` → `person2_anrede/vorname/nachname`
  - `person 3 vorname/nachname` → `person3_vorname/nachname`
  - `notizen` → `notizen`

- **Direktes Parsing** in `parseCsvFile`: Wenn die CSV die neuen strukturierten Header hat (Erkennung: Header enthält "Vorname" UND "Firma"), KI-Analyse überspringen und direkt `ParsedContact[]` bauen:
  - `contact_type` direkt aus "Typ"-Spalte
  - Telefone als Array mit zugehörigen Notizen paaren
  - E-Mails ebenso
  - Person 2/3 als zusätzliche Personen
  - Bank aus IBAN/BIC/Kontoinhaber/Bank
  - Direkt zur Preview springen (kein Edge-Function-Call für Analyse)

- **Import bleibt gleich**: Der Import-Step sendet weiterhin an die Edge Function in 50er-Batches

**Datei 2: `supabase/functions/import-contacts-csv/index.ts`** — Keine Änderung nötig, der Import-Teil funktioniert bereits korrekt mit dem `ParsedContact`-Format.

### Ergebnis
- CSV mit dem definierten Format wird sofort geparst (keine Wartezeit, kein KI-API-Call)
- Alte CSVs ohne die neuen Header nutzen weiterhin die KI-Analyse als Fallback
- 700+ Kontakte werden in Sekunden statt Minuten verarbeitet

