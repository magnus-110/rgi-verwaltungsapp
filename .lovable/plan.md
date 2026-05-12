# PDF-Erzeugung aus §35a-DOCX

## Ziel
Aus der bestehenden Word-Generierung (`generate-35a-docx`) zusätzlich pixelgenaue PDFs erzeugen — pro Eigentümer einzeln und als Sammel-ZIP. Layout entspricht 1:1 der Word-Vorlage.

## Lösungsweg
CloudConvert API als Konverter (DOCX → PDF). Schnell integrierbar, kein eigener Microservice nötig, ~0,01–0,02 € pro Konvertierung.

## Schritte

### 1. Secret hinzufügen
- `CLOUDCONVERT_API_KEY` (User legt Account auf cloudconvert.com an, kopiert API-Key aus Dashboard → Authorization → API Keys, gibt ihn im Lovable-Secret-Dialog ein).

### 2. Edge Function `generate-35a-pdf` (neu)
- Übernimmt dieselbe Logik wie `generate-35a-docx` (Buchungen laden, splitLabor, Vars bauen, docxtemplater rendern).
- Statt das DOCX-Buffer direkt zurückzugeben:
  1. CloudConvert-Job erstellen mit Tasks: `import/base64` → `convert` (engine: libreoffice, output_format: pdf) → `export/url`.
  2. Auf Job-Completion warten (Polling oder Webhook; für unsere Größe reicht Polling alle 1s, max 30s).
  3. PDF von `export/url` herunterladen und als `application/pdf`-Response zurückgeben.
- Parameter wie bei DOCX-Function: `building_id`, `fiscal_year`, `owner_contact_id?`, `template_id?`, `mode: 'single' | 'all'`.
- Bei `mode='all'`: Schleife über alle Eigentümer, alle PDFs in einer ZIP (JSZip in Edge Function) zurückgeben.

### 3. Frontend `Paragraph35aSection.tsx`
- Neben jedem "Word"-Button einen "PDF"-Button (Icon `FileText`).
- Sammel-Button "Alle als PDF (ZIP)" neben "Alle als Word (ZIP)".
- Beide Buttons rufen `supabase.functions.invoke('generate-35a-pdf', …)` auf, blob-Download wie heute beim DOCX.
- Loading-State pro Button (Spinner).

### 4. Fehlerbehandlung
- CloudConvert-Quota/-Auth-Fehler → Toast mit klarem Hinweis.
- Timeout >45s → Abbruch + Hinweis "Konvertierung dauert zu lange, bitte erneut versuchen".

## Technische Details
- **CloudConvert API v2**: Endpoint `https://api.cloudconvert.com/v2/jobs`, Bearer-Auth.
- **Job-Payload** (vereinfacht):
  ```json
  {
    "tasks": {
      "import-1": { "operation": "import/base64", "file": "<base64>", "filename": "doc.docx" },
      "convert-1": { "operation": "convert", "input": "import-1", "output_format": "pdf", "engine": "libreoffice" },
      "export-1": { "operation": "export/url", "input": "convert-1" }
    }
  }
  ```
- **Polling**: `GET /v2/jobs/{id}` bis `status == "finished"`, dann `tasks[export-1].result.files[0].url` herunterladen.
- **ZIP**: `npm:jszip` in Deno (Edge Function), wie bereits in anderen Functions verwendet.

## Was nicht geändert wird
- Bestehende `generate-35a-docx` bleibt erhalten (User können weiterhin Word-Versionen ziehen).
- Word-Vorlagen-Verwaltung im Dropdown unverändert.
- Datenlogik (`splitLabor`, `buildVarsFor`) wird in eine gemeinsame Helper-Datei extrahiert, damit beide Functions dieselbe Quelle nutzen — keine doppelte Wartung.

## Kosten-Hinweis für User
CloudConvert: 25 Konvertierungen/Tag gratis, danach Pakete ab 9 $/Monat für 500 Konvertierungen. Für eine typische Jahresabrechnung mit ~50 Eigentümern liegen die Kosten bei <1 €.
