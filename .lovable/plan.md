## Ziel
Der „PDF herunterladen"-Button im §35a Vorschau-Dialog soll künftig die serverseitige PDF-Generierung aus der Word-Vorlage nutzen (gleiche Edge Function wie der reguläre Download), statt clientseitig via jsPDF zu rendern.

## Änderungen

### 1. `Paragraph35aCertificatePreviewDialog.tsx`
- Neue Props: `templateId`, `buildingId`, `fiscalYear`, `periodId` (und Toast-Fehlerbehandlung wie in `downloadFromTemplate`).
- `handleDownload` ruft nicht mehr `generate35aPdf` auf, sondern führt denselben `fetch` auf `https://${VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/generate-35a-docx` aus mit Body `{ template_id, building_id, fiscal_year, period_id, assignment_ids: [owner.id], format: "pdf" }`, lädt die Blob-Response als Datei herunter (Dateiname aus `Content-Disposition`).
- Wenn keine `templateId` vorhanden ist: Toast „Bitte zuerst eine Vorlage auswählen" und Button-Disable.
- Imports von `generate35aPdf` entfernen.

### 2. `Paragraph35aSection.tsx`
- Beim Rendern des Dialogs zusätzlich `templateId`, `buildingId`, `fiscalYear`, `periodId` durchreichen.

### 3. `Paragraph35aCertificatePdf.tsx`
- `generate35aPdf` wird nicht mehr verwendet → Funktion entfernen.
- `buildCertificateHtml`, `CertificateContext`, `loadLogoBase64`, `generate35aZip` bleiben erhalten (werden weiter für die HTML-Vorschau bzw. an anderen Stellen genutzt — vor dem Entfernen via grep prüfen, ob `generate35aZip` noch referenziert wird; falls nein, mitlöschen).

## Hinweis
Die Vorschau im Dialog (iframe mit `buildCertificateHtml`) bleibt unverändert — nur der Download-Pfad ändert sich.