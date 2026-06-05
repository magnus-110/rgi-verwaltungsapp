## Ziel

Rechnungserstellung zuverlässig machen und den Editor in eine **Live-Vorschau-Ansicht** umbauen: links Eingabeformular, rechts laufend aktualisierte Rechnungsvorschau (visuell wie das fertige PDF).

## Befund

1. **„Rendering fehlgeschlagen: Object not found"** kommt aus `supabase/functions/rgi-render-invoice/index.ts`. Ursache ist eine Schema-Diskrepanz zwischen deiner hochgeladenen `Rechnungsvorlage.docx` und dem Payload, den die Edge Function erzeugt:
   - Template nutzt `{firma.zip}`, `{firma.stadt}`, `{kunde.stadt}`, `{kunde.land}`, `{rechnung.intro}`, `{rechnung.footer}`
   - Edge Function liefert aktuell `firma.plz`, `firma.ort`, `kunde.plz`, `kunde.ort`, `rechnung.intro` (ok), `rechnung.footer` (ok), aber kein `stadt/zip/land`.
   - docxtemplater wirft dann „scope … not found" → bei uns als generischer Fehler sichtbar.

2. Es gibt **keine Live-Vorschau** – jeder Vorschau-Klick stößt die Edge Function (CloudConvert → LibreOffice → PDF) an, was langsam und fehleranfällig ist.

## Umsetzung

### 1. Edge Function `rgi-render-invoice` – Payload erweitern
- `firma`: zusätzlich `zip` (= aktuell `plz`), `stadt` (= `city`), Felder bleiben rückwärtskompatibel.
- `kunde`: zusätzlich `zip`, `stadt`, `land`, `strasse`. Snapshot-Adresse beachten.
- Sicherstellen, dass jede Variable mindestens als leerer String existiert (verhindert docxtemplater-„undefined scope"-Fehler).
- `nullGetter` an `Docxtemplater` übergeben → liefert `""` für fehlende Tags, statt zu werfen.
- Klarere Fehlermeldung, wenn die Vorlagen-Datei im Bucket fehlt („Storage: Object not found" → „Vorlagendatei wurde gelöscht, bitte erneut hochladen").

### 2. `InvoiceEditorDialog.tsx` – Split-Layout

```text
┌────────────────────────── Dialog (max-w-7xl) ──────────────────────────┐
│ Header: „Neue Rechnung"                                               │
├──────────────────────────────┬─────────────────────────────────────────┤
│ LINKS  (overflow-y-auto)     │ RECHTS  (sticky, overflow-y-auto)       │
│   – Kunde / Projekt          │   Live HTML-Vorschau der Rechnung       │
│   – Daten / Vorlage          │   (A4-Skalierung, RGI-Briefkopf,        │
│   – Positionen-Tabelle       │    Positionen-Tabelle, Summen,          │
│   – Intro / Footer           │    Footer, Bankdaten)                   │
├──────────────────────────────┴─────────────────────────────────────────┤
│ Footer: Schließen · Entwurf · Word · PDF · Versenden                  │
└────────────────────────────────────────────────────────────────────────┘
```

- Neue Komponente `InvoiceLivePreview.tsx` (rein client-seitig, React + Tailwind), rendert eine A4-ähnliche Karte mit denselben Daten wie der DOCX-Render. Reagiert reaktiv auf Form-Änderungen, **kein** Backend-Call.
- Quelle der Firmendaten: `useRgiCompanySettings()` (bereits vorhanden, sonst kurzer Hook).
- Beim Vorschau-Button „PDF (Vorschau)" bleibt der bisherige Edge-Function-Render bestehen (für 1:1-DOCX-Output).
- Mobile-Fallback: bei `< lg` stapelt sich die Vorschau unter das Formular.

### 3. Robustheit
- Wenn die ausgewählte Word-Vorlage fehlt oder kein `storage_path` mehr existiert, zeigt der Editor einen Hinweis-Banner („Vorlage nicht gefunden – bitte erneut hochladen") und disabled „Versenden".
- Optional: `previewRender` ruft vorher `supabase.storage.from('rgi-invoice-templates').list()` um Existenz zu prüfen → freundliche Fehlermeldung.

## Technische Details

**Dateien**
- `supabase/functions/rgi-render-invoice/index.ts` – Payload + nullGetter + Fehler-Mapping
- `src/components/rgi-intern/invoices/InvoiceEditorDialog.tsx` – Layout-Umbau auf `grid lg:grid-cols-[1fr_1fr]`
- `src/components/rgi-intern/invoices/InvoiceLivePreview.tsx` *(neu)* – HTML-Vorschau
- `src/hooks/useRgi.ts` – ggf. `useRgiCompanySettings` ergänzen, falls noch nicht exportiert

**Keine DB-Migration nötig.**

## Out-of-Scope
- Echtzeit-DOCX/PDF-Rendering im Browser (zu schwer, nicht nötig – HTML reicht für Vorschau).
- Änderungen am Vorlagen-Upload-Flow.
