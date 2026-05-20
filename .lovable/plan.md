# Plan: Eigentümer-Freigabe & Jahres-Filter im DMS

## Problem 1 – „Spezifische Eigentümer" bleibt leer

Beim automatischen DMS-Upload (`uploadGeneratedPdfToDms.ts`) wird nur `visibility_role = 'personen'` und `linked_contact_id` gesetzt. Die UI "Freigegeben für" liest aber aus der Tabelle **`building_file_visibility`** (siehe `DocumentDetailPanel.tsx` → `togglePersonVisibility`). Deshalb steht im Edit-Panel „0 ausgewählt", obwohl das Dokument den richtigen Namen hat.

### Fix
In `uploadGeneratedPdfToDms` nach dem Insert in `building_files` zusätzlich einen Eintrag in `building_file_visibility` anlegen, sobald `visibility === "eigentuemer_only"` und `contactId` vorhanden ist:

```
insert into building_file_visibility (file_id, contact_id) values (<neu>, <contactId>)
```

Damit erscheint der Eigentümer im „Freigegeben für"-Picker als angehakt und die RLS-Filterung greift sauber.

## Problem 2 – Zuordnung Wirtschaftsjahr vs. allgemein + Filter im DMS

### Datenmodell (Migration)
- Spalte `fiscal_year integer null` auf `public.building_files`.
- Index `idx_building_files_fiscal_year (building_id, fiscal_year)`.
- Keine RLS-Änderung nötig.

### Schreibseite
- `uploadGeneratedPdfToDms` / `DmsUploadParams` um optionales `fiscalYear?: number | null` erweitern und beim Insert mitschreiben.
- Aufrufe in `BillingSettlement.tsx` (Abrechnungen, §35a, Vermögensbericht, kombiniert) und `ManualEconomicPlanEditor.tsx` (Gesamt/Einzel-Wirtschaftsplan) übergeben das vorhandene `fiscalYear` bzw. `wpYear`.
- Manueller Upload (`UploadDocumentDialog.tsx`): neues optionales Feld „Wirtschaftsjahr" (Select mit „Allgemein" + Jahresliste). Im `DocumentDetailPanel` analoges Feld zum Nachpflegen.

### Anzeige / Filter
- In `BuildingFilesTab.tsx` neuen State `selectedYear: 'all' | 'general' | number` plus Select neben der Kategorie-Auswahl. Optionen werden aus den vorhandenen `files[].fiscal_year` Werten generiert (distinct desc) plus „Allgemein (ohne Jahr)" und „Alle".
- Filterung im Memo der Datei-Liste vor Übergabe an `FileList`. `FileList` bekommt eine kleine Badge „Jahr 2026" bzw. „Allgemein" in der Tabellenzeile (neben Kategorie).

## Betroffene Dateien
- DB-Migration (1 ALTER TABLE + Index).
- `src/components/finance/lib/uploadGeneratedPdfToDms.ts` (Visibility-Insert + fiscalYear).
- `src/contexts/DmsJobsProvider.tsx` (Feld `fiscalYear` durchschleifen).
- `src/components/finance/BillingSettlement.tsx`, `src/components/finance/ManualEconomicPlanEditor.tsx` (fiscalYear bei `enqueueDms` mitgeben).
- `src/components/buildings/BuildingFilesTab.tsx` (Year-Filter UI + Filter-Logik).
- `src/components/files/FileList.tsx` (Jahres-Badge).
- `src/components/buildings/documents/UploadDocumentDialog.tsx` + `DocumentDetailPanel.tsx` (manuelles Feld „Wirtschaftsjahr").
