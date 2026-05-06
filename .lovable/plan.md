## Problemanalyse `classify-email`

Beim Durchgehen von `supabase/functions/classify-email/index.ts` sind drei konkrete Schwachstellen aufgefallen, die genau die beschriebenen Symptome erklären:

### 1. Empfänger statt Absender als Kontakt
- Direkter Match passiert nur über `from_address` (Zeile 110–113) — das ist korrekt für eingehende Mails.
- Aber: Es gibt kein Direction-Flag. Bei **gesendeten Mails** (Sent-Folder, später relevant) und bei **Mails, die wir an einen Kontakt schicken**, kann die KI im Freitext den Empfänger als Kontakt vorschlagen. Aktuell wird `classification.contact_id` ungeprüft übernommen, sobald kein direkter Sender-Match existiert.
- Außerdem: Der Prompt enthält nur "Von:" — keinerlei Hinweis, dass wir den **Absender** zuordnen wollen. Wenn der Absender unbekannt ist, sucht die KI in Betreff/Body nach einem bekannten Namen (z. B. "Beschwerde Familie Müller") und ordnet diesen Empfänger-Namen zu.

### 2. Liegenschaft im Betreff wird nicht erkannt
- Der Prompt gibt der KI nur den **Namen** und die **Adresse** des Gebäudes (`b.name (b.address)`).
- Es gibt **keinen Pre-Match** auf Betreff/Body. Die KI muss in einem einzigen Mistral-Small-Call sowohl Kategorie, Priorität, Summary als auch Building-/Contact-Match erledigen — und Mistral-Small ist zu schwach für sauberes Fuzzy-Matching ("Hauptstr. 12" vs. "Hauptstraße 12a").
- Es werden auch keine Aliasse berücksichtigt (z. B. interne Kurznamen, Hausnummern, Stadtteile), und es gibt keine Building-Matches über die Kontakt-Beziehung des Senders hinaus.

### 3. UUID-Halluzinationen
- Die KI gibt UUIDs als Freitext zurück. Es gibt **keine Validierung**, ob die zurückgegebene `building_id`/`contact_id` tatsächlich in der Liste war. Bei langen Kontaktlisten halluziniert Mistral-Small gerne UUIDs zusammen.

---

## Plan

### Schritt 1 — Deterministisches Pre-Matching (vor der KI)

In `classify-email` vor dem Mistral-Call eine deterministische Match-Schicht einbauen, die zuverlässig liefert, was die KI heute schludrig macht:

**Sender-Match (Kontakt):**
- Wie bisher: `from_address` → `emailToContactId`.
- Zusätzlich: Domain-Match (`@hausverwaltung-x.de` → Firmenkontakt mit gleicher Domain, sofern eindeutig).
- **Wichtig:** Niemals `to_addresses`/`cc_addresses` als Kontakt-Match verwenden — das ist der Hauptgrund für "Empfänger statt Sender".

**Building-Match (mehrstufig, in dieser Reihenfolge):**
1. **Sender → Kontakt → Building-Assignments** (wenn Kontakt 1 Gebäude hat → direkt; wenn mehrere → Kandidatenliste an KI weitergeben).
2. **Betreff-Scan**: Für jedes Building Tokens bilden aus `name`, `address` (Straße ohne Hausnummer, Hausnummer, PLZ, Stadt) und matchen gegen `subject` (case-insensitive, Umlaute normalisiert, "str." ↔ "straße"). Bei eindeutigem Treffer → setzen, sonst Kandidaten an KI.
3. **Body-Scan** (erste 2000 Zeichen) als Fallback mit gleichem Token-Set.

Der deterministische Treffer **gewinnt immer** über die KI-Antwort. Die KI bekommt nur noch eine vorgefilterte Kandidatenliste statt aller Gebäude/Kontakte.

### Schritt 2 — Prompt schärfen + KI-Output validieren

- Prompt erweitern: explizit "Du ordnest immer den **Absender** zu, niemals Empfänger oder im Text genannte Dritte." + Beispiele.
- KI bekommt nur noch **vorgefilterte Building-Kandidaten** (max. 5–10) statt der vollen Liste.
- Modell auf `mistral-medium-latest` für die Klassifizierung anheben (Small ist zu schwach für saubere UUID-Auswahl).
- Nach KI-Antwort: Validieren, dass zurückgegebene `building_id`/`contact_id` tatsächlich in der übergebenen Kandidatenliste enthalten war — sonst verwerfen.

### Schritt 3 — Direction-Flag respektieren

- Falls die E-Mail aus dem Sent-Folder stammt (über `folder_id` ermittelbar), Logik umdrehen: Kontakt-Match dann über `to_addresses[0]`, Building über Empfänger-Kontakt-Beziehung.
- Aktuell läuft `classify-email` nur auf Inbox — sicherheitshalber explizit prüfen und Sent-Mails überspringen oder mit umgekehrter Logik behandeln.

### Schritt 4 — Diagnose-Logging

Pro E-Mail einen kompakten Log ausgeben: `directContactMatch`, `subjectBuildingMatch`, `bodyBuildingMatch`, `aiBuildingId`, `final` — damit du in den Edge-Function-Logs sofort siehst, warum eine bestimmte Mail falsch zugeordnet wurde.

---

## Betroffene Dateien

- `supabase/functions/classify-email/index.ts` — komplette Refaktorierung der Match-Logik (Pre-Match-Helfer, Validierung, Prompt, Direction).

Keine Datenbank-Migration nötig, keine UI-Änderungen, kein Re-Klassifizieren bestehender Mails erforderlich — neue Logik greift ab dem nächsten Klassifikations-Lauf. Optional: kleiner Button "Erneut klassifizieren" für falsch zugeordnete Mails (kann in Folge-Iteration kommen, sag bitte Bescheid wenn gewünscht).

## Offene Frage

Sollen wir bei mehrdeutigen Treffern (z. B. Sender hat 3 Gebäude, Betreff nennt keines) lieber **leer lassen** (du ordnest manuell zu) oder **das wahrscheinlichste raten** (KI entscheidet aus Kandidaten)? Empfehlung: leer lassen — falsche Zuordnung ist schlimmer als keine.