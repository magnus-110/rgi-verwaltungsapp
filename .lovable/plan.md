## Ziel

Bei Kontakten mit mehreren `contact_persons` sollen Briefe & Mails **alle Personen gemeinsam** adressieren (z. B. „Christina und Sandra Bronold"). Zusätzlich sollen Name(n), Anrede und Adresse direkt im **Gebäude-Tab Kontakte** editierbar sein, nicht nur in der globalen Kontaktseite.

## Teil 1 – Mehrpersonen-Adressierung (ohne Vorlagenänderung)

Die Vorlagen verwenden bereits `{{vollname}}`, `{{anrede_brief}}`, `{{vorname}}`, `{{nachname}}`, `{{adresse_block}}`. Wir erweitern lediglich, **wie diese Variablen gefüllt werden**, wenn ein Kontakt mehrere Personen hat.

**Datei:** `supabase/functions/_shared/comm-vars.ts`

Neue Hilfslogik in `loadRecipients` (nur wenn `expand_all_emails = false`, also bei Briefen und normalen Rundmails pro Kontakt):

- Sammle alle Personen mit Vor- oder Nachname (Filter analog `is_primary` ignorieren — alle aktiven Personen werden Empfänger).
- Berechne kombinierte Felder:
  - `vollname`: 
    - Gleiche Nachnamen → `"Christina und Sandra Bronold"`
    - Sonst → `"Christina Müller und Sandra Bronold"`
    - >2 Personen → mit Komma + „und" vor dem letzten Namen.
  - `vorname`: Vornamen-Liste verbunden mit „ und " bzw. Komma.
  - `nachname`: eindeutige Nachnamen verbunden mit „ und ".
  - `anrede_brief`:
    - Alle gleiche Anrede „Frau"/„Herr" + gleicher Nachname → `"Sehr geehrte Frauen Bronold,"` / `"Sehr geehrte Herren Bronold,"`
    - Mehrere mit gleichem Nachname, gemischte Anrede → `"Sehr geehrte Frau Bronold, sehr geehrter Herr Bronold,"`
    - Unterschiedliche Nachnamen → `"Sehr geehrte Frau Müller, sehr geehrte Frau Bronold,"` (jede Person individuell, durch „, sehr geehrte/r …" verkettet).
    - Fehlt Anrede → Fallback wie bisher.
  - `adresse_block`: oberhalb der Straßenadresse `vollname` (kombiniert) verwenden – passt automatisch.
- Singleton-Fall (1 Person) bleibt unverändert.
- Bei `expand_all_emails = true` (Rundmail, pro E-Mail ein Empfänger) bleibt das bisherige Verhalten: jede Person wird separat addressiert, damit individuelle Postfächer korrekt angeschrieben werden.

**Auswirkungen** automatisch in: Serienbriefe (`comm-render-letters`), Rundmails (`comm-send-emails`), Einladungen (`MeetingInvitationPdf` über `comm-render-letters`). Keine Vorlagen müssen angefasst werden.

**Optionaler Frontend-Hinweis (`emailTemplateVars.ts`):** identische `buildAnrede`-Kombinationslogik für `empfaenger_name` / `empfaenger_anrede` im Compose-Dialog, damit Vorschau konsistent ist. (Lookup auf `contact_persons` per E-Mail liefert ohnehin nur eine Person – wir laden zusätzlich alle Personen desselben Kontakts und kombinieren.)

## Teil 2 – Personen & Adresse im Gebäude editieren

**Datei:** `src/components/contacts/BuildingContactsList.tsx` (Tab „Übersicht" der ausgeklappten Kontakt-Card)

Ergänzungen:

1. **Neuer Block „Personen"** (oberhalb Telefon):
   - Liste aller `contact_persons` mit:
     - Select Anrede (Herr/Frau/Divers/leer)
     - Input Vorname
     - Input Nachname
     - Star-Toggle „primär"
     - Trash-Button (mit Bestätigung)
   - „+ Person"-Button → neuer Person-Datensatz.
   - Speichern via `BufferedInput`-Pattern (analog Telefon/E-Mail) auf Tabelle `contact_persons`.
2. **Adresse editierbar** (vorhandener read-only Block):
   - 3 `BufferedInput`s: Straße, PLZ, Ort
   - Update direkt auf `contacts`-Tabelle (`address_street`, `address_zip`, `address_city`).
   - Hinweistext „Adresse wird über die Kontaktseite verwaltet" entfällt – Änderung wirkt global auf den Kontakt (gewünscht, da Kontakt-zentriertes Modell).

Datenquelle: vorhandener Query in der Datei lädt `persons` bereits inkl. `salutation`. Mutationen über `supabase.from(...).update/insert/delete`, anschließend `refetch()`.

## Technische Hinweise

- Keine Schema-Änderungen, keine neuen RLS-Policies (Tabellen `contacts`, `contact_persons` schon beschreibbar für authentifizierte Admins).
- Keine Migration nötig.
- Edge Functions müssen redeployt werden, da `comm-vars.ts` über `_shared/` eingebunden wird: `comm-render-letters`, `comm-send-emails`, `generate-meeting-protocol`, `etv-render-protocol` (alle, die `loadRecipients` nutzen).
- Verifikation: Achweg 3-5 Einheit 0025 → Briefvorschau muss „Christina und Sandra Bronold" + `Sehr geehrte Frauen Bronold,` zeigen.