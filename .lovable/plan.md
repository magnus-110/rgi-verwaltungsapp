# E-Mail-Vorlagen im Postfach

## Ziel
Schneller Zugriff auf wiederverwendbare E-Mail-Texte (Betreff + Body) direkt im Verfass-Fenster, ohne den Schreibflow zu stören. Vorlagen sind **kontaktübergreifend** (global pro Nutzer/Firma), unterstützen Platzhalter und können inline angelegt/bearbeitet werden.

## UX – wo & wie

**Picker-Button** (klein, unauffällig) in der Toolbar von `FloatingComposeWindow.tsx` und `ComposeEmailDialog.tsx`, direkt neben dem Paperclip-Icon (Send-Bereich unten):

- Icon: `FileText` oder `LayoutTemplate` (lucide), Ghost-Button, gleiche Größe wie Paperclip
- Tooltip: „Vorlage einfügen"
- Klick öffnet **Popover** mit:
  - Suchfeld oben (filtert nach Name/Kategorie)
  - Liste der Vorlagen (Name + kleine Vorschau des Betreffs, gruppiert nach Kategorie)
  - Footer-Zeile: `+ Neue Vorlage` und (bei Hover je Eintrag) Stift-/Mülleimer-Icon
- Klick auf Eintrag → Betreff + Body werden eingefügt (siehe Verhalten unten)
- Klick auf `+ Neue Vorlage` oder Stift → öffnet `EmailTemplateEditorDialog`

**Verhalten beim Einfügen:**
- Betreff: nur überschreiben wenn leer, sonst Bestätigungs-Toast „Betreff ersetzt" mit Undo
- Body: an aktueller Cursor-Position einfügen (nicht überschreiben), bestehender Text & Quote bleiben erhalten
- Platzhalter werden vorher aufgelöst (siehe unten)

**Editor-Dialog** (`EmailTemplateEditorDialog.tsx`):
- Felder: Name*, Kategorie (freier Text mit Vorschlägen), Betreff, Body (Textarea), `is_shared` Toggle (privat/team)
- Hinweis-Box mit verfügbaren Platzhaltern (Klick fügt sie ein)
- Speichern/Löschen/Abbrechen

## Platzhalter (praxistauglich, klein gehalten)

Beim Einfügen werden ersetzt aus dem Compose-Kontext:
- `{{empfaenger_name}}` – aus `to` (Kontakt-Lookup über `contact_persons.email`)
- `{{empfaenger_anrede}}` – „Sehr geehrter Herr X" / „Sehr geehrte Frau Y" / Fallback „Sehr geehrte Damen und Herren"
- `{{absender_name}}` – aus aktivem Profil
- `{{absender_signatur}}` – aus E-Mail-Account
- `{{liegenschaft}}` – aus `replyTo.building_id` falls Antwort, sonst leer
- `{{datum_heute}}` – `dd.MM.yyyy`

Nicht aufgelöste Platzhalter bleiben stehen und werden gelb hervorgehoben (mit Toast „2 Platzhalter müssen noch gefüllt werden").

## Technisches Design

### Neue Tabelle `email_templates`

```text
id              uuid PK
created_by      uuid (auth.users)
name            text NOT NULL
category        text
subject         text
body            text NOT NULL
is_shared       boolean DEFAULT true   -- true = alle Nutzer der Firma sehen sie
sort_order      int DEFAULT 0
usage_count     int DEFAULT 0          -- für „häufig genutzt" Sortierung
last_used_at    timestamptz
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

RLS:
- SELECT: alle authentifizierten Nutzer (`is_shared = true`) ODER `created_by = auth.uid()`
- INSERT/UPDATE/DELETE: `created_by = auth.uid()` (oder Admin-Rolle via `has_role`)

Da das Tool eine Verwaltungs-App ist und alle Nutzer Admins/Verwalter sind, ist `is_shared = true` der Default. Kein per-Kontakt-Bezug → erfüllt „kontaktübergreifend".

### Neue Komponenten
- `src/components/email/EmailTemplatePicker.tsx` – Popover mit Liste/Suche
- `src/components/email/EmailTemplateEditorDialog.tsx` – Anlegen/Bearbeiten
- `src/hooks/useEmailTemplates.ts` – React-Query Fetch/Insert/Update/Delete
- `src/lib/emailTemplateVars.ts` – Platzhalter-Resolver (rein clientseitig)

### Integration
- `FloatingComposeWindow.tsx`: Picker-Button neben Paperclip; Insert-Handler nutzt `bodyText` State + ggf. `subject`
- `ComposeEmailDialog.tsx`: gleiche Einbindung an beiden Render-Stellen (Z. 419 + 648)

### Variablen-Auflösung
Resolver bekommt `{ to, subject, body, replyTo, accountId }` und Kontakt-Lookup via vorhandenem `contact_persons` Hook. Greift nur bei tatsächlichem Insert, nicht beim Speichern (Templates bleiben mit `{{...}}`).

### Usage-Tracking
Beim Einfügen: `update email_templates set usage_count = usage_count+1, last_used_at = now()`. Picker sortiert: zuletzt genutzt → meistgenutzt → alphabetisch.

## Out of Scope (bewusst weggelassen)
- HTML-Editor / Rich Text (bleiben Plain-Text wie Compose heute)
- Per-Liegenschaft-spezifische Vorlagen (kann später als optionales `building_id` ergänzt werden)
- Versionierung
- AI-generierte Vorlagen aus bestehenden E-Mails (späteres Add-on)

## Akzeptanzkriterien
1. Im Verfass-Fenster (Float, Dialog, Mobile) erscheint ein dezenter Vorlagen-Button.
2. Popover zeigt alle Vorlagen mit Suche, ein Klick fügt Betreff (wenn leer) + Body ein.
3. `+ Neue Vorlage` und Bearbeiten/Löschen funktioniert direkt aus dem Popover.
4. Platzhalter werden beim Einfügen aufgelöst; ungelöste bleiben sichtbar.
5. Vorlagen sind für alle Nutzer sichtbar (kontaktübergreifend).
6. `usage_count`/`last_used_at` werden gepflegt und beeinflussen Sortierung.
