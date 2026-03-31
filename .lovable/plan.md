

## Problem-Analyse & Fix: CSV-Import schreibt Daten falsch

### Ursache

Zwei Probleme identifiziert:

**1. Import-Request nicht gebatcht**: Die Analyse wird in 100er-Batches gesendet, aber der Import sendet ALLE 700 Kontakte (mit allen Personen, Telefonen, E-Mails, Bankdaten) in einem einzigen Request. Das überschreitet das Body-Size-Limit der Edge Function — der Request wird entweder abgeschnitten oder scheitert teilweise.

**2. Sub-Table Inserts ohne Fehlerprüfung**: Die Edge Function prüft nicht, ob die Inserts in `contact_persons`, `contact_phones`, `contact_emails`, `contact_bank_accounts` erfolgreich waren. Fehler werden still verschluckt.

### Fix-Plan

**Datei 1: `src/components/contacts/ImportContactsCsvDialog.tsx`**
- `handleImport` ändern: Import in Batches von 50 Kontakten senden (statt alle auf einmal)
- Progress-Bar inkrementell pro Batch aktualisieren
- Fehler aus allen Batches sammeln und anzeigen

**Datei 2: `supabase/functions/import-contacts-csv/index.ts`**
- Error-Handling für alle Sub-Table Inserts hinzufügen (persons, phones, emails, bank)
- Bei Fehler in Sub-Tables den Fehler loggen und zum Error-Array hinzufügen
- `_selected` und `ai_corrections`/`is_duplicate` Felder vor dem Insert bereinigen
- Edge Function redeployen

### Optimale CSV-Struktur für direkten Import

Für den Nutzer wird folgende Referenz-Struktur dokumentiert, die direkt ohne KI-Analyse geparst werden kann:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Spalte              │ Beispiel              │ Pflicht │ Mapping      │
├──────────────────────────────────────────────────────────────────────┤
│ Stichwort           │ "Weber Andrea+Heiko"  │ Nein    │ short_name   │
│ Anrede              │ "Herr" / "Firma"      │ Nein    │ salutation   │
│ Nachname            │ "Weber"               │ Ja*     │ last_name    │
│ Vorname             │ "Andrea"              │ Nein    │ first_name   │
│ Firma               │ "Müller GmbH"         │ Ja*     │ company_name │
│ Typ                 │ person/company/        │ Nein    │ contact_type │
│                     │ service_provider       │         │              │
│ Straße              │ "Hauptstr. 1"         │ Nein    │ address_street│
│ PLZ                 │ "50667"               │ Nein    │ address_zip  │
│ Ort                 │ "Köln"                │ Nein    │ address_city │
│ Telefon 1           │ "0221/12345"          │ Nein    │ phone        │
│ Telefon 1 Notiz     │ "Andrea"              │ Nein    │ phone note   │
│ Telefon 2           │ "0157/99887766"       │ Nein    │ phone        │
│ Telefon 2 Notiz     │ "Heiko mobil"         │ Nein    │ phone note   │
│ E-Mail 1            │ "a@weber.de"          │ Nein    │ email        │
│ E-Mail 1 Notiz      │ "bevorzugt"           │ Nein    │ email note   │
│ E-Mail 2            │ "h@weber.de"          │ Nein    │ email        │
│ Fax                 │ "0221/12346"          │ Nein    │ fax          │
│ IBAN                │ "DE89..."             │ Nein    │ iban         │
│ BIC                 │ "COLSDE33"            │ Nein    │ bic          │
│ Kontoinhaber        │ "Andrea Weber"        │ Nein    │ acct holder  │
│ Bank                │ "Sparkasse Köln"      │ Nein    │ bank name    │
│ Webseite            │ "www.weber.de"        │ Nein    │ notes        │
│ Person 2 Vorname    │ "Heiko"               │ Nein    │ add. person  │
│ Person 2 Nachname   │ "Weber"               │ Nein    │ add. person  │
│ Notizen             │ "Beiratsmitglied"     │ Nein    │ notes        │
└──────────────────────────────────────────────────────────────────────┘
* Entweder Nachname oder Firma muss gefüllt sein
```

### Technische Details

- Client-seitig: `handleImport` loop mit `batchSize = 50`, Ergebnisse akkumulieren
- Edge Function: Jeden Sub-Table-Insert mit `const { error } = await ...` prüfen
- Edge Function redeployen nach Änderungen
- CSV-Struktur-Referenz wird als Info-Text im Upload-Bereich angezeigt (kleiner Link "CSV-Format anzeigen")

