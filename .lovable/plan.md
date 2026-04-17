

## Plan: Vorgangsmodul ("Cases") – V1 mit Zeitstrahl, KI-Zusammenfassung, RAG-Chat & E-Mail-Zuordnung

### Scope V1 (laut Auswahl)
- Vorgang + Zeitstrahl + Notizen + E-Mail/Dokument/Bild anhängen
- KI-Zusammenfassung (regeneriert sich nach jedem neuen Event)
- RAG-Chat im Vorgang (begrenzt auf Vorgang + Gebäude + allgemeine Wissensbasis)
- E-Mail-Workflow: ein Dialog mit "Zuordnen" + Checkbox "auch archivieren"
- KI-Auto-Zuordnung von E-Mails ab >90 % Confidence, sonst Vorschlag
- Verwalter-intern (keine Portal-Sichtbarkeit in V1)

### Datenmodell (neue Tabellen)

**`cases`** – der eigentliche Vorgang
- `id`, `building_id` (FK, NOT NULL), `management_mode` (weg|rent)
- `title`, `description`, `category` (schaden|versicherung|maengel|eigentuemerwechsel|sonstiges – als enum mit Erweiterungsmöglichkeit)
- `status` (open|in_progress|waiting_external|waiting_owner|resolved|archived)
- `priority` (low|medium|high|urgent)
- `assignee_user_id`, `unit_id` (optional), `due_at`, `closed_at`
- `external_refs` jsonb (Versicherungs-Nr., Schadensnr., Aktenzeichen)
- `ai_summary` text, `ai_summary_updated_at`, `ai_keywords` text[] (für E-Mail-Matching)
- `created_by`, `created_at`, `updated_at`

**`case_events`** – jedes Ereignis im Zeitstrahl (polymorph)
- `id`, `case_id` (FK, NOT NULL), `building_id` (denormalisiert für RLS-Speed)
- `event_type` (note|email|document|image|todo|booking|meeting|phone|status_change|ai_summary|file)
- `occurred_at` (Datum, das im Zeitstrahl angezeigt wird – frei setzbar, default now())
- `title`, `body` (text/markdown für Notizen, Telefonnotizen, Statusänderungen)
- `source_table`, `source_id` (z. B. `emails`/`<email_id>`, `building_files`/`<file_id>`, `bookings`/`<booking_id>` …)
- `attachments` jsonb (für Datei-Events: storage path, mime, size)
- `extracted_data` jsonb (KI-extrahierte Felder: Beträge, Fristen, Firmen)
- `created_by`, `created_at`

**`case_participants`** – Beteiligte mit Rolle
- `id`, `case_id`, `contact_id` (FK contacts), `role` (geschaedigter|verursacher|gutachter|versicherer|handwerker|eigentuemer|mieter|sonstiges), `notes`

**Erweiterung `emails`**
- `case_id` uuid (FK, nullable) → ein E-Mail kann optional einem Vorgang zugeordnet werden
- bestehende `is_archived`-Logik bleibt unangetastet (Trennung zuordnen ↔ archivieren)

**Erweiterung `weg_reports` / `miete_reports`**
- `case_id` uuid (FK, nullable) → "Aus Meldung Vorgang erstellen" verlinkt rückwärts

**RLS:** `cases`, `case_events`, `case_participants` erben Lese-/Schreibrechte aus dem Gebäude (über bestehende Admin-/Building-Manager-Logik analog `weg_reports`).

### UI – Building-Hub-Tab "Vorgänge"

Neuer Tab in `BuildingDashboard.tsx` zwischen "Meldungen" und "Schwarzes Brett". Drei Komponenten:

**1. `BuildingCasesTab.tsx`** (Listenansicht im Building-Hub)
- Spalten: Status-Badge · Priorität · Titel · Kategorie · Verantwortlich · Letzte Aktivität · KI-Summary-Tooltip
- Filter: Status, Kategorie, Verantwortlich, Suche
- Buttons: "+ Neuer Vorgang", "Aus Meldung erstellen"
- Klick → öffnet Vorgangs-Detail

**2. `CaseDetailView.tsx`** (Detailansicht – Sheet/Dialog oder Vollbild)
- **Header:** Titel, Status, Priorität, Kategorie, Beteiligte (Avatar-Stack), Verantwortlich, Frist
- **Linke Hauptspalte – Zeitstrahl:**
  - Vertikale Timeline (Lucide-Icons je `event_type`, farbcodiert)
  - Quick-Add-Bar oben: Drag&Drop für Dateien, Eingabezeile für Notizen, Buttons für 📞 Telefon · 📧 Mail anhängen · ✅ Todo · 📷 Foto
  - Lazy-Loading bei vielen Events
- **Rechte Seitenleiste:**
  - **KI-Zusammenfassung** (mit Refresh-Button + "Aktualisiert vor X Min")
  - **Frag den Vorgang** (RAG-Chat, kompakt) – nutzt bestehende `query-documents` mit zusätzlichem Vorgangs-Kontext
  - **Beteiligte** (mit Rolle, +Hinzufügen)
  - **Verlinkte Entitäten** (Einheit, Meldung, Buchungen, Beschluss)

**3. `CreateCaseDialog.tsx`** + **`CreateCaseFromReportDialog.tsx`**
- Vorgangsvorlagen pro Kategorie (Wasserschaden bringt Standard-Felder mit)

### KI-Komponenten (Edge Functions)

**1. `case-summarize`** (neu)
- Input: `case_id` → fetcht alle Events, sortiert chronologisch
- Mistral Small: erstellt 3-5 Sätze Status-Zusammenfassung + 3 nächste Schritte
- Schreibt `cases.ai_summary` + `ai_summary_updated_at`
- Trigger: nach jedem `INSERT` in `case_events` (debounced via Edge-Function-Aufruf vom Frontend nach Event-Erstellung)

**2. `case-suggest-for-email`** (neu)
- Wird von `classify-email` aufgerufen, nachdem `building_id` ermittelt ist
- Input: `email_id` + `building_id`
- Logik:
  - **Schritt 1 (deterministisch):** prüft `In-Reply-To`/`References` gegen E-Mails, die bereits einem Vorgang zugeordnet sind → 100 % Match
  - **Schritt 2 (KI):** holt offene Vorgänge des Gebäudes + deren `ai_keywords`/`title`, fragt Mistral Small mit JSON-Tool-Output: `{ case_id, confidence, reason }`
- Output landet in `emails.ai_case_suggestion_id` + `ai_case_confidence`
- Bei Confidence ≥ 0.9 **automatisch** `emails.case_id` setzen (ohne Archivieren)
- Bei Confidence < 0.9: nur Vorschlag im UI

**3. `case-extract-from-content`** (neu, optional in V1, vorbereitet)
- Wird beim Anhängen von E-Mail/PDF aufgerufen
- Extrahiert Beträge, Fristen, Firmennamen, Versicherungs-Nr. → `case_events.extracted_data`

**4. RAG-Chat im Vorgang** – nutzt bestehende `query-documents`, erweitert um Parameter `case_id`. In der Edge-Function wird der Kontext zusammengesetzt aus:
- Alle `case_events` (Notizen, E-Mail-Bodies, OCR-Texte verlinkter Dokumente)
- Bestehende RAG-Suche im Gebäudekontext (Verträge, Policen, Hausordnung)
- Allgemeine Wissensbasis

### E-Mail-Workflow-Anpassung

**`AssignEmailDialog.tsx`** (ersetzt `ArchiveEmailDialog.tsx`)
- Felder: Liegenschaft · Kontakt · **Vorgang** (gefiltert nach gewähltem Gebäude) · Notiz
- Checkbox: "E-Mail auch archivieren" (default: aus)
- Vorbelegung aus KI-Vorschlägen (Liegenschaft, Kontakt, Vorgang) mit Sparkles-Badge
- Zwei Aktionen im E-Mail-Detail in `Inbox.tsx`:
  - 📎 "Zuordnen" (öffnet Dialog)
  - 🗄️ "Archivieren" (direkt, optional Schnell-Zuordnen via Quick-Picker)
- Auto-Assignment: `classify-email` setzt bei ≥ 90 % Confidence direkt `case_id`/`building_id` ohne Archivieren – im UI als blaues "KI zugeordnet"-Chip sichtbar mit Undo

### Headless/Voice-/MCP-Readiness

Alle Schreibvorgänge laufen über Edge Functions (Single Source of Truth):
- `case-create`, `case-update`, `case-add-event`, `case-link-email`, `case-link-document`, `case-from-report`, `case-summarize`, `case-suggest-for-email`

Diese Funktionen sind später 1:1 von einem MCP-Server, Voice-Agent oder Chatbot aufrufbar. Frontend ruft dieselben Funktionen auf.

### Was bewusst NICHT in V1 ist (für Folge-Iterationen)

- Playbooks & Nächste-Schritte-Engine (Phase 2)
- Kostentracking pro Vorgang & PDF-Bericht (Phase 2)
- Eigentümer-/Mieter-Portal-Sichtbarkeit (Phase 2)
- Kanban-Ansicht
- Realtime-Collab-Indikator
- Audit-Log (kommt mit Phase 2)

### Betroffene Dateien

| Bereich | Datei | Aktion |
|---|---|---|
| DB-Schema | Migration | neue Tabellen `cases`, `case_events`, `case_participants`, Spalten `emails.case_id`, `emails.ai_case_suggestion_id`, `emails.ai_case_confidence`, `weg_reports.case_id`, `miete_reports.case_id` + RLS |
| UI Building-Hub | `BuildingDashboard.tsx` | neuen Tab "Vorgänge" einfügen |
| UI Tab | `src/components/buildings/BuildingCasesTab.tsx` | neu – Listenansicht |
| UI Detail | `src/components/cases/CaseDetailView.tsx` | neu – Header + Timeline + Sidebar |
| UI Timeline | `src/components/cases/CaseTimeline.tsx` | neu – Event-Renderer |
| UI Quick-Add | `src/components/cases/CaseQuickAdd.tsx` | neu – Drop-Zone + Notiz-Eingabe |
| UI Dialoge | `CreateCaseDialog.tsx`, `CreateCaseFromReportDialog.tsx`, `AssignEmailDialog.tsx` (ersetzt `ArchiveEmailDialog`) | neu / refactor |
| UI RAG | `src/components/cases/CaseAskAi.tsx` | neu – kompakter Chat |
| Inbox | `src/pages/Inbox.tsx` | "Zuordnen"-Button + "KI-Zuordnung"-Chip + Vorgangs-Filter |
| Reports | `BuildingReportsTab.tsx`, Reports-Pages | "Vorgang erstellen"-Button |
| Edge Functions | `case-summarize`, `case-suggest-for-email`, `case-add-event`, `case-link-email` | neu |
| Edge Function | `classify-email` | um Vorgangs-Erkennung erweitern |
| Edge Function | `query-documents` | optional `case_id` mit Vorgangs-Kontext |

### Erwartetes Ergebnis V1

- Im Gebäude-Hub neuer Tab "Vorgänge" mit Liste & Detail.
- Vorgang als Zeitstrahl mit Notizen, E-Mails, Dokumenten, Bildern, Buchungen, Todos.
- KI-Zusammenfassung wird automatisch nach jedem Event aktualisiert.
- Frag-den-Vorgang-Chat liefert Antworten aus Vorgangs- & Gebäudekontext.
- E-Mails können Vorgängen zugeordnet werden, ohne archiviert zu werden (Checkbox optional).
- KI ordnet E-Mails ab 90 % Confidence automatisch zu, sonst Vorschlag.
- Aus einer Meldung lässt sich per Klick ein Vorgang anlegen.
- Architektur bereit für MCP/Voice/Chatbot über Edge Functions.

