
# Optimierungsplan: Kostenschutz, Automatische Filter und Intelligentes Chunking

## Zusammenfassung deiner Fragen

| Frage | Antwort |
|-------|---------|
| Kostet extra API-Geld? | Nein - alle Änderungen sind kostenlos/reduzieren Kosten |
| Schutz vor Fehlern? | Teilweise vorhanden, wird verbessert |
| Automatisch filtern? | Erkennung existiert, muss nur aktiviert werden |

---

## Phase 1: Kostenschutz (Priorität 1)

### 1.1 API-Key Validierung vor Upload

Bevor ein Dokument verarbeitet wird, prüfen wir ob der API-Key funktioniert:

```text
Ablauf:
1. Frontend sendet Upload-Request
2. Edge Function macht TEST-Anfrage an Mistral (minimal, ~$0.0001)
3. Bei Fehler: Sofort abbrechen mit klarer Meldung
4. Bei Erfolg: Normal weiter verarbeiten
```

Änderung in `process-document/index.ts`:
- Neue Funktion `validateMistralApiKey()` am Anfang
- Minimaler API-Call der prüft ob Key gültig ist
- Bei Fehler: Dokument sofort auf `error` setzen, BEVOR Kosten entstehen

### 1.2 Tägliches Kosten-Limit

Neues System zur Kostenverfolgung:

```text
Neue Tabelle: api_usage_tracking
┌─────────────────────────────────────────────────┐
│ id        | date       | api_type    | cost    │
│ uuid      | 2025-01-30 | mistral_ocr | 0.15    │
│ uuid      | 2025-01-30 | embeddings  | 0.02    │
└─────────────────────────────────────────────────┘

Prüfung vor jedem API-Call:
- Summiere Kosten des aktuellen Tages
- Wenn > Limit (z.B. 5€/Tag): Stoppe mit Warnung
```

### 1.3 Dokument-Größen-Warnung

Im Frontend vor Upload:
- Bei Dateien > 50 Seiten: Warnung anzeigen
- Bei Dateien > 100 Seiten: Bestätigung erforderlich
- Geschätzte Kosten anzeigen

---

## Phase 2: Automatische Filter aktivieren (Priorität 2)

### 2.1 Backend-Änderung

Die automatische Erkennung existiert bereits - sie muss nur verwendet werden!

Änderung in `query-documents/index.ts`:

```text
Vorher (Zeile 886):
searchSimilarChunks(supabase, embedding, ...)

Nachher:
// Automatisch erkannte Filter nutzen
const autoFilters = extractMetadataFromQuestion(question);

// NEUE RPC-Funktion mit Filtern
supabase.rpc('search_document_chunks_with_metadata', {
  query_embedding: embedding,
  filter_categories: autoFilters.categories.length > 0 ? autoFilters.categories : null,
  filter_features: autoFilters.features.length > 0 ? autoFilters.features : null,
  ...
});
```

### 2.2 Ablauf (vollautomatisch)

```text
Benutzer fragt: "Was steht zur Heizung im Wirtschaftsplan?"

1. Automatische Erkennung:
   - Kategorie: "finanzen" (wegen "Wirtschaftsplan")
   - Feature: "gas_heating" oder "oil_heating" (wegen "Heizung")

2. Gefilterte Suche:
   - Nur Chunks mit category = 'finanzen' ODER feature = 'heating'
   - Irrelevante Protokolle/Rechtsdokumente werden ausgeblendet

3. Bessere Antwort:
   - Relevantere Treffer
   - Schnellere Suche
   - Weniger "Rauschen"
```

### 2.3 Optionale manuelle Filter (UI-Erweiterung)

Falls gewünscht, kann später ein Filter-Panel ergänzt werden:

```text
┌─────────────────────────────────────────────┐
│ 📂 Kategorien:                              │
│ [x] Alle  [ ] Finanzen  [ ] Protokolle     │
│ [ ] Technik  [ ] Rechtlich                  │
└─────────────────────────────────────────────┘
```

Dies ist optional - die automatische Erkennung funktioniert in 90% der Fälle.

---

## Phase 3: Intelligentes Chunking (Priorität 3)

### 3.1 Tabellen-Erkennung

Mistral OCR liefert Markdown-Tabellen. Aktuell werden diese oft mittendrin getrennt:

```text
Vorher (Problem):
Chunk 1: "| Name | MEA | Wohnung |\n| Müller | 100 |"
Chunk 2: " 1 |\n| Schmidt | 150 | 2 |"

Nachher (Lösung):
Chunk 1: Komplette Tabelle als Einheit
```

Änderung in `createSemanticChunks()`:
- Tabellen-Regex: `/\|[^|]+\|[\s\S]*?\n(?!\|)/g`
- Tabellen werden als `priority: keep_together` markiert
- Niemals in der Mitte trennen

### 3.2 Überschriften-basierte Trennung

```text
Vorher:
Text wird nach ~1000 Zeichen getrennt, egal wo

Nachher:
1. Erkenne Markdown-Überschriften (## oder ###)
2. Erkenne nummerierte Abschnitte (1., 2., 3.)
3. Neuer Chunk beginnt bei neuer Überschrift
```

### 3.3 Erweiterte Dokumenttyp-Erkennung

Neue Patterns für bessere Kategorisierung:

```text
Neu erkannte Typen:
- eigentumerliste    → "Eigentümer", "MEA", "Einheit"
- hausgeldabrechnung → "Hausgeld", "Abrechnung", Jahr
- wirtschaftsplan    → "Wirtschaftsplan", "Vorauszahlung"
- versicherung       → "Police", "Versicherung"
- rechnung           → "Rechnung", "MwSt", "Betrag"
```

---

## Phase 4: Egress-Optimierung (Kostensenkung)

### 4.1 On-Demand URL-Generierung

```text
Vorher:
- Jede Chat-Antwort enthält Signed URLs für ALLE Quellen
- Auch wenn Benutzer sie nie öffnet
- Hoher Egress-Verbrauch

Nachher:
- Chat-Antwort enthält nur Metadaten (documentId, fileName)
- Signed URL wird erst bei Klick auf "Quelle anzeigen" generiert
- Neue Edge Function: get-document-url
```

### 4.2 Lazy Loading im PDF-Viewer

```text
Vorher:
- PDF wird sofort vollständig geladen

Nachher:
- Nur erste Seite wird geladen
- Weitere Seiten bei Bedarf (Scroll)
```

---

## Technische Änderungen

### Neue/Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `process-document/index.ts` | API-Key Validierung, Kostenlimit-Prüfung |
| `query-documents/index.ts` | Automatische Filter aktivieren |
| `continue-processing/index.ts` | Intelligentes Chunking |
| `get-document-url/index.ts` | NEUE Edge Function für On-Demand URLs |
| `src/pages/Documents.tsx` | URL-Handling anpassen |
| `src/components/documents/DocumentSourcesList.tsx` | Lazy URL Loading |

### Optionale neue Tabelle

```sql
CREATE TABLE api_usage_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL DEFAULT CURRENT_DATE,
  api_type text NOT NULL, -- 'ocr', 'embed', 'chat'
  estimated_cost numeric(10,4) NOT NULL,
  document_id uuid REFERENCES building_documents(id),
  created_at timestamptz DEFAULT now()
);

-- Index für tägliche Summen
CREATE INDEX idx_api_usage_date ON api_usage_tracking(date);
```

---

## Umsetzungsreihenfolge

1. **Kostenschutz** (sofort)
   - API-Key Validierung vor Upload
   - Retry-Limit bereits vorhanden (3 Versuche)

2. **Automatische Filter aktivieren** (schnell)
   - Eine Zeile Code-Änderung in `query-documents`
   - Nutzt existierende Erkennung

3. **Intelligentes Chunking** (mittel)
   - Tabellen-Erkennung implementieren
   - Überschriften-basierte Trennung

4. **Egress-Optimierung** (kann warten)
   - Neue Edge Function
   - Frontend-Anpassung

---

## Erwartete Ergebnisse

| Bereich | Vorher | Nachher |
|---------|--------|---------|
| Fehler-Schutz | Retry-Limit 3x | + API-Validierung + Kostenlimit |
| Filter | Erkannt aber ignoriert | Automatisch aktiv |
| Chunking | Größenbasiert | Strukturbasiert |
| Egress | URLs immer generiert | On-Demand |
| API-Kosten | Keine Kontrolle | Tägliches Limit möglich |
