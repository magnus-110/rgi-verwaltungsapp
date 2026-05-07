## Ziel

1. Kassenprüfer (Token-Link) kann Rechnungen und Kontoauszüge tatsächlich öffnen.
2. Admin lädt beim Erstellen einer Kassenprüfung PDF-Kontoauszüge hoch; diese ersetzen die CAMT-Liste beim Prüfer.
3. Admin kann strukturierte Hilfe-Notizen (Titel + Text) hinterlegen, die dem Prüfer prominent angezeigt werden.

## Datenbank (Migration)

Neue Tabelle `cash_audit_notes`:
- `cash_audit_id` (FK → cash_audits, ON DELETE CASCADE)
- `title` (text, not null), `body` (text, not null)
- `sort_order` (int, default 0)
- RLS: Admin alles; Auditor SELECT über eigenen contact → cash_audits.

Neue Tabelle `cash_audit_statements`:
- `cash_audit_id`, `file_path` (text, Bucket `building-documents`), `file_name`, `uploaded_at`, `sort_order`.
- RLS analog.

Erweiterung Storage: weiterhin `building-documents` Bucket (privat) – Pfad `cash-audits/{auditId}/...`.

Neue/erweiterte SECURITY DEFINER RPCs (alle GRANT EXECUTE TO anon, authenticated):
- `get_audit_notes_by_token(p_token)` → SETOF json (id, title, body, sort_order).
- `get_audit_pdf_statements_by_token(p_token)` → SETOF json (id, file_name, file_path, uploaded_at).
- `get_audit_signed_url_by_token(p_token, p_kind, p_id)` →
  - `p_kind = 'invoice'`: prüft, dass Invoice im Audit-Building/Year liegt, signiert `invoices`-Pfad.
  - `p_kind = 'statement_pdf'`: prüft cash_audit_statements-Eintrag, signiert `building-documents`-Pfad.
  - `p_kind = 'bank_statement'` (Fallback): bestehende CAMT-Datei.
  - Nutzt `storage.create_signed_url(...)` (oder Wrapper über Storage-Schema mit `extensions.uri_encode`); falls direkt nicht verfügbar, Wrapper über `storage.objects` + signed URL via `vault`-frei: stattdessen Edge Function `audit-signed-url` (siehe unten) als saubere Variante.

→ Entscheidung: **Edge Function `audit-signed-url`** statt RPC, weil `createSignedUrl` aus Storage am einfachsten serverseitig per Service-Role-Client erstellt wird. Function validiert Token gegen `cash_audits`, prüft Ressource (invoice/statement_pdf), und liefert signierte URL (300s).

## Backend

Neue Edge Function `supabase/functions/audit-signed-url/index.ts`:
- Public (verify_jwt=false), CORS, Zod-Validierung.
- Input: `{ token, kind: 'invoice'|'statement_pdf'|'bank_statement', id }`.
- Service-Role-Client → cash_audits via token laden → Berechtigung prüfen → `createSignedUrl` → URL zurück.

## Frontend

### CreateAuditDialog (Admin-Erstellung)
- Neue Felder:
  - **PDF-Kontoauszüge hochladen** (Mehrfach-Upload, drag&drop, nur PDF). Lokale Liste mit Entfernen.
  - **Hinweise für Prüfer** (Liste): „+ Notiz hinzufügen" → Inline-Karten mit `Titel` + `Text`-Textarea, sort/delete.
- Beim „Erstellen":
  1. Insert in `cash_audits` (wie bisher) → erhalte `id`.
  2. Upload jedes PDF nach `building-documents/cash-audits/{auditId}/{uuid}-{name}` und Insert in `cash_audit_statements`.
  3. Bulk-Insert der Notizen in `cash_audit_notes`.

### CashAuditWizard (Prüfer-Ansicht, Token + Auth)
- Neuer Bereich oben (zwischen Header und Tabs): **Hinweise vom Verwalter** als Akkordeon/Karten-Liste – nur sichtbar wenn Notizen vorhanden. Lädt via:
  - tokenMode → `get_audit_notes_by_token`
  - sonst → direkter Select auf `cash_audit_notes`.

### CashAuditDocuments (Sektion Kontoauszüge)
- Datenquelle Kontoauszüge umgestellt:
  - tokenMode → `get_audit_pdf_statements_by_token` (statt CAMT-RPC)
  - Auth-Modus → Select aus `cash_audit_statements` per `cash_audit_id`.
- Wenn keine PDFs hochgeladen wurden: leerer State („Keine Kontoauszüge hochgeladen").
- CAMT-Anzeige beim Prüfer entfällt komplett (Wunsch: Ersetzen).

### PDF Öffnen (Token-Modus)
- `openPdf` ruft im tokenMode neue Edge Function `audit-signed-url` auf statt `supabase.storage.from(...).createSignedUrl` (das mit anon-Key an privaten Buckets scheitert → Ursache des „Rechnung nicht klickbar"-Problems).
- Übergibt `kind` + `id`, erhält signedUrl, öffnet `PdfViewerModal`.
- Im Auth-Modus: bestehender Client-Pfad (Storage createSignedUrl) bleibt.

### Props
- `CashAuditDocuments` bekommt zusätzlich `auditId` (für statement-PDF-Query).

## Aufgabenreihenfolge
1. Migration: Tabellen + RLS + RPCs (Notes, PDF-Statements).
2. Edge Function `audit-signed-url`.
3. CreateAuditDialog: Upload + Notizen-Editor.
4. CashAuditWizard: Notizen-Bereich.
5. CashAuditDocuments: PDF-Statements + Edge-Function-Aufruf für Token-Öffnen.
6. Memory-Update („Cash Audit System" → erweitern um PDF-Statements, Notes, audit-signed-url).
