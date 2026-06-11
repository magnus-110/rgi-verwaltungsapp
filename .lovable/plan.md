## Ziel
1. **Rundmails**: jede beim Kontakt/den Personen hinterlegte E-Mail-Adresse erhält einen eigenen Versand (separate Sends).
2. **„Kein Doppel"-Button** im RecipientPicker (Rundmail + Serienbrief): Kontakte, die durch mehrere Einheiten mehrfach in der Liste stehen, werden auf genau eine Zuordnung reduziert — die mit der numerisch kleinsten `unit_number`.
3. Serienbriefe bleiben unverändert (eine Primärperson pro Kontakt/Einheit).

## Änderungen

### A) Backend — `supabase/functions/_shared/comm-vars.ts`
- Neuer Modus in `loadRecipients`: optional `expand_all_emails: boolean` (default `false` für Briefe, `true` für Mails).
- Wenn aktiv: pro Assignment werden alle gültigen Adressen gesammelt aus
  - `contact_emails` (alle Zeilen, sanitized via `extractEmails`)
  - `contact_persons.email` (alle Personen, sanitized)
  - dedupliziert (case-insensitive)
- Für jede gefundene Adresse wird ein eigener `ResolvedRecipient` erzeugt; `vars.email` und `vars.vorname/nachname/anrede_brief` werden – sofern eine Person zur Adresse zuordenbar ist – auf die jeweilige Person gesetzt. Fallback: Primärperson.
- `person_id` zeigt auf die zugehörige Person (sofern bekannt), sonst `null`.
- `contact_id` bleibt gleich → Override-Mechanik bleibt erhalten (Overrides greifen pro Adresse gleich, das ist gewollt).

### B) Edge Functions, die Rundmails/Preview erzeugen
- `comm-preview-recipients` und der Sende-Pfad (`comm-send-campaign` / Pendant) rufen `loadRecipients` mit `expand_all_emails: true` auf, sofern die Kampagne vom Typ E-Mail ist.
- Briefkampagnen rufen weiterhin ohne Expansion auf.
- Idempotenz-/Dedup-Key beim Versand: `${campaign_id}:${contact_id}:${email_lowercase}` damit dieselbe Adresse nicht doppelt verschickt wird.

### C) Frontend — `src/components/communication/RecipientPicker.tsx`
- Neuer Button **„Kein Doppel"** neben „Alle / Keine".
- Logik:
  - Gruppiere die aktuell sichtbaren (gefilterten) Assignments nach `contact_id`.
  - Pro Gruppe: behalte das Assignment mit der numerisch kleinsten `unit_number` (natürliche Sortierung: `localeCompare(b, { numeric: true })`); fehlende `unit_number` → ans Ende.
  - Setze `assignment_ids` auf diese Liste und leite `contact_ids` ab.
- Sichtbarer Hinweis-Badge „nur 1× pro Kontakt aktiv", solange die Selektion einem Kein-Doppel-Zustand entspricht.

### D) Preview-Liste „Geplante E-Mails"
- Da `comm-preview-recipients` jetzt mehrere Einträge pro Kontakt zurückgibt, zeigt die UI automatisch jede Adresse als eigene Zeile (z. B. „Ines Wiesneth — ines@…" und „Thomas Wiesneth — thomas@…"). Keine zusätzliche Änderung im Frontend nötig, außer ein dezenter Hinweis im Hilfe-Text der Rundmail-Karte.

## Nicht-Ziele
- Keine Änderung an Brief-Erzeugung / Adressblock.
- Keine Schema-Migration nötig — alle Daten liegen schon in `contact_emails` / `contact_persons`.
- Keine CC/BCC-Logik.

## Akzeptanzkriterien
- Kampagne an Achweg 3-5: Wiesneth erscheint mit 2 Einträgen (Ines + Thomas, beide mit ihrer Adresse), beide bekommen die Mail.
- Klick auf „Kein Doppel": Hr. Willems (2 Einheiten) erscheint nur einmal, mit der niedrigeren Einheitsnummer.
- Serienbrief-Wizard: Verhalten unverändert, nur Primärperson pro Einheit.
