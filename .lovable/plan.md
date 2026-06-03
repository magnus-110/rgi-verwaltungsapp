# Rechnungsvorlagen (Inhalte) + Projekt-Stunden-Import

Zwei Themen, die beide auf den Rechnungs-Editor (`InvoiceEditorDialog.tsx`) zielen.

## 1. Inhalts-Vorlagen (rgi_item_presets) richtig nutzbar machen

Die Tabelle `rgi_item_presets` existiert bereits (letzte Migration), aber:
- Es gibt keine Verwaltung (Umbenennen / Löschen / Bearbeiten) — nur "speichern" und "laden".
- Im Editor erscheint nur ein kleines Dropdown "Aus Vorlage laden…" — leicht zu übersehen.

**Geplante Änderungen:**

- **Neuer Tab** `Rechnungsvorlagen` in `RgiIntern.tsx` (zwischen *Vorlagen* (=Word) und *Einstellungen*), Komponente `ItemPresetsTab.tsx`:
  - Liste aller Vorlagen mit Spalten: Name, Sparte, Anzahl Positionen, Summe netto, Aktionen.
  - Buttons: **Neue Vorlage** (öffnet Editor-Dialog mit leeren Positionen), **Bearbeiten**, **Duplizieren**, **Löschen**.
  - Editor-Dialog `ItemPresetDialog.tsx`: Name, Sparte (Select), Positionen-Tabelle (Beschreibung, Menge, Einheit, € netto, USt%) — wiederverwendet die gleiche Zeilen-Struktur wie der Rechnungseditor.
- **Rechnungseditor:** Das bestehende Dropdown "Aus Vorlage laden…" prominenter machen (Button-Variante mit Icon), und nach Auswahl einen Toast mit Link "Vorlagen verwalten" anzeigen.
- **Default-Vorlagen seeden** (nur falls Tabelle leer ist, beim ersten Öffnen des Tabs): *Verwaltergebühr*, *Eigentümerwechsel*, *Mietvertrag-Erstellung* — als Vorschlag mit 0 € Preisen, damit der Nutzer nur noch Beträge eintragen muss.

**Hook-Erweiterung** in `useRgi.ts`:
- `useRgiItemPresets()`, `useUpsertRgiItemPreset()`, `useDeleteRgiItemPreset()` — analog zu den anderen Hooks, statt der inline-`(supabase as any)`-Calls.
- Typen werden nach Migration automatisch in `types.ts` regeneriert (`rgi_item_presets`).

## 2. "Aus Projekt"-Import auf offene Stunden umstellen

**Aktuelles Problem:** `importFromProject()` lädt nur Positionen der *letzten Rechnung* dieses Projekts. Wenn das Projekt (z. B. "Achweg 3–5 Parkplatz") noch nie abgerechnet wurde, kommt "Keine vorherige Rechnung gefunden" — obwohl Zeit-Einträge existieren.

**Geplante Änderung:** Button "Aus Projekt" öffnet einen neuen Dialog `ImportFromProjectDialog.tsx`:

- Zeigt zwei Quellen nebeneinander:
  1. **Offene Stunden** (`rgi_time_entries` mit `project_id = aktuelles Projekt`, `invoice_item_id IS NULL`, `billable = true`) — mit Checkbox-Auswahl, Default alle ausgewählt.
  2. **Letzte Rechnung dieses Projekts** (falls vorhanden) — Positionen mit Checkbox-Auswahl.
- Gruppierungs-Auswahl für Stunden: *Pro Eintrag* / *Pro Tag* / *Summe* (gleiche Logik wie in `CreateInvoiceFromTimeDialog`, `buildItems` aus dieser Datei extrahieren in `src/lib/rgiBuildItems.ts`).
- "Übernehmen" hängt die ausgewählten Positionen an die aktuellen Draft-Items an. Für Stunden werden `source_time_entry_ids` korrekt gesetzt, sodass sie beim Versenden als abgerechnet markiert werden.

Der Button bleibt deaktiviert, solange kein Projekt gewählt ist — Tooltip "Erst Projekt oben wählen".

## Technische Details

**Migrationen:** keine (Tabelle existiert bereits). Nur Code.

**Neue Dateien:**
- `src/components/rgi-intern/item-presets/ItemPresetsTab.tsx`
- `src/components/rgi-intern/item-presets/ItemPresetDialog.tsx`
- `src/components/rgi-intern/invoices/ImportFromProjectDialog.tsx`
- `src/lib/rgiBuildItems.ts` (extrahierter `buildItems` Helper)

**Geänderte Dateien:**
- `src/pages/RgiIntern.tsx` — neuer Tab.
- `src/hooks/useRgi.ts` — Hooks für Item-Presets.
- `src/components/rgi-intern/invoices/InvoiceEditorDialog.tsx` — `importFromProject` durch Dialog ersetzen, Preset-Hooks verwenden.
- `src/components/rgi-intern/invoices/CreateInvoiceFromTimeDialog.tsx` — `buildItems` importieren statt lokal definieren.

**Keine Schema-Änderung, keine Edge-Function-Änderung.**
