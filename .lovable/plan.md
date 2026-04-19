

## Erweiterter DMS-Plan — finale Version

### Neue / präzisierte Details

**1. E-Mail-Anhänge → Stammakte**
- Im `EmailAttachments`-Komponente neuer Button **„In Stammakte ablegen"** pro Anhang.
- Dialog: Gebäude (vorgeschlagen aus Email-Zuordnung) → Ordner → Sichtbarkeit → optional Person/Dienstleister verknüpfen.
- Datei wird ins `building-files`-Bucket kopiert, neuer `building_files`-Eintrag mit `source = 'email'` + `source_email_id` (FK auf Email).
- Bulk-Aktion: alle Anhänge einer Mail auf einmal ablegen.

**2. Rechnungen automatisch ablegen**
- Neue Spalte `building_files.source` enum: `manual` | `email` | `invoice` | `booking` | `meeting`.
- Beim Invoice-Import (`extract-invoice`-Function) wird die PDF zusätzlich als `building_files`-Eintrag in der Kategorie **„Rechnungen"** (Unterordner unter „Finanzen") angelegt — `linked_invoice_id` verweist auf `invoices.id`.
- Doppelte Speicherung vermeiden: `file_path` zeigt auf dieselbe Storage-Datei, kein Bytes-Duplikat.
- In der Datei-Liste erscheint Chip „🧾 Rechnung Nr. … · 1.234,56 €" mit Sprung in die Buchhaltung.

**3. Abrechnungs-/Wirtschaftsplan-Verknüpfung (Vorbereitung)**
- Spalte `building_files.linked_billing_period_id` (nullable, FK auf `billing_periods`) und `linked_contact_id` (existiert bereits).
- Standard-Unterordner unter „Finanzen": **Gesamtabrechnungen**, **Einzelabrechnungen**, **Wirtschaftspläne**, **Rechnungen**, **Kontoauszüge**.
- Später kann der Abrechnungs-Wizard pro generiertem PDF automatisch einen `building_files`-Eintrag mit `linked_contact_id` (Eigentümer) + `linked_billing_period_id` schreiben → erscheint sofort persönlich freigegeben in der Stammakte UND beim Eigentümer-Portal.
- Heute: Schema vorbereiten, UI-Hook im `BillingTab` als TODO-Marker setzen — keine Logik.

**4. Weitere wichtige Details**

| Detail | Umsetzung |
|---|---|
| **Drag-&-Drop direkt aus Outlook/Finder** | `BuildingDocumentsTab` akzeptiert mehrere Dateien gleichzeitig per Drop, Upload-Dialog erscheint mit Sammeleinstellungen (eine Kategorie + Sichtbarkeit für alle). |
| **OCR-Volltextsuche** | Bestehende `extracted_text`-Spalte wird in der Suche genutzt (ts_vector-Index `building_files_search_idx` über `display_name`, `description`, `extracted_text`). |
| **Tags zusätzlich zu Ordnern** | Optionales Array `tags text[]` für Querverweise (z. B. „Dachsanierung 2024" über mehrere Ordner hinweg). |
| **Audit-Log** | Neue Tabelle `building_file_activity` (file_id, user_id, action, created_at) — wer hat wann hochgeladen/ersetzt/gelöscht/Sichtbarkeit geändert. |
| **Papierkorb (30 Tage)** | `deleted_at` Spalte statt Hard-Delete; nächtlicher Cron räumt nach 30 Tagen auf (analog zu Todos/Emails). |
| **Pflicht-Dokument-Indikator** | Auf Stammakte-Kategorien (Teilungserklärung, Hausordnung, Versicherung) Flag `is_recommended` — UI zeigt rotes „fehlt"-Badge im Ordnerbaum, falls leer. |
| **Ablauf-Dashboard** | Im Gebäude-Dashboard Widget „Ablaufende Dokumente" (nächste 90 Tage) → Klick springt in Stammakte. |
| **Mobile** | Drei-Spalten-Layout kollabiert auf Mobile zu Drill-Down: Ordner → Liste → Detail (jeweils Vollbild mit Zurück-Pfeil). |
| **Berechtigung Eigentümer-Portal** | Bestehende RLS-Policies werden auf `visibility_role` umgestellt; Eigentümer sehen automatisch Dateien mit `eigentuemer`/`alle` + persönlich zugeordnete. |
| **Versions-Diff** | Beim Hochladen einer neuen Version: Hinweis, ob Dateigröße/Hash identisch → Warnung „inhaltsgleich, trotzdem neue Version?". |

---

### Datenmodell-Erweiterungen (final)

`building_files` neue Spalten:
- `visibility_role` enum, `valid_until` date, `version` int, `parent_file_id` uuid, `is_current_version` bool
- `linked_contact_id` uuid, `maintenance_config_id` uuid, `linked_invoice_id` uuid, `linked_billing_period_id` uuid, `source_email_id` uuid
- `source` enum (`manual`/`email`/`invoice`/`booking`/`meeting`)
- `tags` text[], `deleted_at` timestamptz

`building_file_categories` neue Spalten:
- `parent_id` uuid, `building_id` uuid, `auto_rag_enabled` bool, `is_recommended` bool

Neue Tabellen:
- `building_file_visibility` (file_id, contact_id) — Mehrfach-Personen-Freigabe
- `building_file_activity` — Audit-Log
- RPC `ensure_stammakte_categories(building_id)` — idempotenter Seed beim ersten Tab-Aufruf

---

### Implementierungs-Reihenfolge

1. **Migration**: Schema-Erweiterungen + RPC + RLS-Update + ts_vector-Index
2. **Cleanup**: alte gebäudespezifische `document_chunks` löschen
3. **Core-UI**: `BuildingDocumentsTab` mit Drei-Spalten-Layout, Ordnerbaum, Datei-Liste, Detail-Panel, Upload-Dialog, Versionierung
4. **Integrationen**: 
   - `EmailAttachments` → „In Stammakte ablegen"-Button
   - `extract-invoice`-Function → automatischer Eintrag im Ordner „Rechnungen"
   - `MaintenanceConfigSection` → Datei-Verknüpfung
   - `ContactDetail` → Sektion „Verträge & Dokumente"
   - `BuildingServiceProvidersTab` → Doku-Counter
5. **RAG**: `index-building-file` Edge-Function + Kategorie-Default-Steuerung
6. **Komfort**: Audit-Log-Anzeige, Papierkorb, Ablauf-Widget im Dashboard, globale Volltextsuche im Tab
7. **Hook für später** (TODO-Marker, keine Logik): `BillingTab` Speicher-Callback für Abrechnungs-PDFs vorbereiten

