# E-Mail-Archiv: Filter "Keine Liegenschaft" + KI-Suche

## 1. Filter-Option "Keine Liegenschaft"

In `src/pages/Inbox.tsx` (Archiv-Filter, Zeile ~1126):
- Liegenschafts-Select um Eintrag **"Ohne Liegenschaft"** ergänzen (Wert `none`)
- Analog im Kontakt-Select **"Ohne Kontakt"** hinzufügen
- Query-Logik (~Zeile 295) erweitern: bei Wert `none` → `.is("building_id", null)` bzw. `.is("contact_id", null)` statt `.eq(...)`

## 2. KI-Suche per Mistral

**UI** (`src/pages/Inbox.tsx`, Header der Mailliste neben dem normalen Suchfeld, nur sichtbar im Archiv):
- Kleines Icon-Button (`Sparkles`) öffnet einen Dialog "KI-Suche im Archiv"
- Textarea: „Beschreibe Inhalt, Absender oder Liegenschaft …"
- Button „Suchen" → ruft neue Edge Function auf
- Ergebnisliste: Klick auf Treffer öffnet die E-Mail (setzt `selectedEmailId`, ggf. Folder-Wechsel falls nicht im Archiv)
- Loading-Spinner + Fehler-Toast (429/402 freundlich)

**Edge Function** `supabase/functions/ai-search-emails/index.ts`:
1. Auth-Check via JWT (User-bound, RLS bleibt aktiv)
2. Input: `{ query: string, accountIds?: string[] }`
3. Lädt Kandidaten aus `emails` (nur archivierte, eigener Workspace via RLS): `id, subject, from_name, from_address, date, ai_summary, building_id, contact_id` — limit 500, neueste zuerst
4. Joint Liegenschaft-Name und Kontakt-Name (kleine Maps clientseitig in der Function)
5. Mistral-Aufruf (`mistral-small-latest`) mit Tool-Calling für strukturierte Ausgabe:
   - System: „Du hilfst dem Nutzer, eine archivierte E-Mail zu finden. Wähle aus der Liste maximal 10 IDs aus, die am besten zur Beschreibung passen, sortiert nach Relevanz."
   - User: Beschreibung + komprimierte E-Mail-Liste (eine Zeile pro Mail: `id | datum | von | betreff | liegenschaft | kontakt | summary[160 Zeichen]`)
   - Tool-Schema: `{ matches: [{ id, reason }] }`
6. Resolve IDs zurück mit vollen Mail-Daten, gibt sortierte Treffer zurück
7. Retry/Backoff wie in `improve-email-text` (429/5xx)
8. Verwendet bestehenden Secret `MISTRAL_API_KEY`, kein neuer Key nötig
9. Eintrag in `supabase/config.toml`: `[functions.ai-search-emails] verify_jwt = true`

**Neue Komponente** `src/components/email/AiEmailSearchDialog.tsx`:
- Dialog mit Textarea, Submit, Trefferliste (Betreff, Absender, Datum, Liegenschaft, AI-Begründung)
- Callback `onSelect(emailId)` → Inbox öffnet die Mail

## Technische Details

- Token-Limit: Mailliste auf ~500 Einträge & Summary auf 160 Zeichen kürzen, um Mistral-Kontext klein zu halten
- Keine DB-Schemaänderungen
- Bestehende RLS auf `emails` reicht — Function nutzt User-JWT-Client (kein service_role)
- Anti-Halluzination: nur IDs zulassen, die in der gelieferten Kandidatenliste vorkommen (serverseitig filtern)

## Geänderte/Neue Dateien
- `src/pages/Inbox.tsx` (Filter + KI-Icon)
- `src/components/email/AiEmailSearchDialog.tsx` (neu)
- `supabase/functions/ai-search-emails/index.ts` (neu)
- `supabase/config.toml` (Function registrieren)
