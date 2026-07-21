## Problem

Im Owner-Login (`/weg-owner/kassenpruefung`) wird `CashAuditWizard` ohne `tokenMode` gerendert. `CashAuditDocuments` fragt dann Rechnungen, Bankauszüge und Audit-PDFs direkt aus den Tabellen (`invoices`, `bank_statements`, `cash_audit_statements`) und öffnet Dateien über `supabase.storage.createSignedUrl(...)`. Der Owner hat auf diese Tabellen/Buckets aber keine RLS-Rechte — daher erscheinen keine Rechnungen und Kontoauszüge lassen sich nicht anklicken.

Über den Token-Link funktioniert es, weil dort SECURITY-DEFINER-RPCs (`get_audit_invoices_by_token`, `get_audit_pdf_statements_by_token`, `get_audit_bank_statement_pdfs_by_token`) plus die Edge-Function `audit-signed-url` verwendet werden, die Token-basiert die Zugriffsrechte prüfen.

## Lösung

Der Owner-Weg soll intern denselben Pfad wie der Proxy-Weg nutzen, damit alle Dokumente identisch angezeigt und geöffnet werden können.

### Änderung in `src/pages/weg-owner/CashAudit.tsx`

- Beim Abruf des Audits zusätzlich `access_token` selektieren.
- `CashAuditWizard` mit `tokenMode` und `token={audit.access_token}` rendern.

Damit gehen alle Dokument-Abfragen und das Öffnen der Dateien über die bereits vorhandenen RPCs / `audit-signed-url`-Edge-Function — genau wie beim öffentlichen Link. Es sind keine RLS-, Grant- oder DB-Änderungen nötig, weil der Owner nur einen Token verwendet, der bereits zu seinem Audit gehört und der Zugriff serverseitig autorisiert wird.

### Nicht-Ziel

- Keine Änderungen an `CashAuditDocuments`, den RPCs, den Buckets oder anderen Kassenprüfungs-Ansichten.
- Kein neuer Token wird erzeugt; falls `access_token` fehlt, bleibt der bisherige Fallback (direkte Queries).

## Verifikation

- Als Owner in Birkenweg 6 einloggen, Kassenprüfung öffnen: Rechnungen erscheinen, Kontoauszüge lassen sich öffnen.
- Öffentlicher Proxy-Link funktioniert unverändert.
