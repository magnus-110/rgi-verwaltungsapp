

## Verbessertes RAG-System mit DMS-Kategorien

### Problem
- NOVA durchsucht `document_chunks` (Vektorsuche), aber Chunks sind **nicht** mit den DMS-Ordnern verknüpft (`building_documents.category` ist überall `"general"`).
- Die User-Erwartung: "wenn ich Teilungserklärung sage, soll im Ordner *Teilungserklärung* gesucht werden" — aktuell unmöglich, weil die RAG-Pipeline die Kategorienhierarchie aus `building_file_categories` ignoriert.
- Hardcodiertes Keyword-Mapping in `query-documents/index.ts` (Zeile 35-51) deckt nur 6 generische Kategorien ab, nicht die echten Ordner ("Teilungserklärung", "Hausordnung", "Versorgerverträge", "Wirtschaftsplan" usw.).
- `building_files` (DMS) hat `category_id` + `extracted_text`, aber keine Chunks/Embeddings — wird nur als Volltext-Score in `chat-with-ai` durchsucht.

### Lösung: Kategorie-bewusste RAG-Pipeline

Eine **einheitliche Vektorsuche über `building_files`** (= das, was im DMS hochgeladen wurde) mit **Ordner-Filter** anhand der echten Kategorienhierarchie.

#### Schritt 1 — Datenmodell vereinheitlichen
- `document_chunks` bekommt zusätzliche Spalten: `file_id uuid` (FK auf `building_files`), `category_id uuid` (FK), `category_slug text` (denormalisiert für schnellen Filter), `category_path text[]` (z. B. `['Stammakte','Teilungserklärung']` für Eltern-Filter).
- Neuer Trigger: Beim Verarbeiten eines `building_files`-Eintrags wird sein `category_id` (+ Eltern + Slug) automatisch in seine Chunks geschrieben.
- Migration füllt bestehende Chunks rückwirkend, soweit ableitbar (über Datei-Pfad → `building_files`-Lookup).

#### Schritt 2 — `process-building-file` erweitern: echtes RAG statt nur OCR
Aktuell macht die Function nur OCR → `extracted_text`. Sie soll künftig zusätzlich:
1. Semantisches Chunking (analog `process-document`).
2. Mistral-Embeddings je Chunk.
3. Insert in `document_chunks` mit `file_id`, `category_id`, `category_slug`, `category_path`, `building_id`.

So wird **jedes DMS-Dokument** automatisch RAG-fähig — und ist damit über seinen Ordner adressierbar.

#### Schritt 3 — Slug-Resolver in `query-documents`
Statt Hardcoded-Mapping eine zweistufige Strategie:

**A) Kategorie-Detektor (LLM-light, Mistral Small):**
- Lädt einmalig alle Kategorien-Slugs/Namen aus `building_file_categories`.
- Mistral Small bekommt Frage + Kategorienliste und gibt 0-3 passende `category_slug`s zurück (JSON, ~200ms).
- Beispiel: "Was steht in der Teilungserklärung zum Sondernutzungsrecht?" → `["stammakte-teilungserklaerung"]`.
- Beispiel: "Welche Verträge habe ich?" → `["vertraege-versorger","vertraege-dienstleister","vertraege-bank"]`.

**B) Hybrid-Retrieval:**
1. **Phase 1 — Kategorie-gefiltert**: Vektorsuche nur in Chunks der erkannten `category_slug`s (oder Eltern-Slug für "alle Verträge"). Limit 8.
2. **Phase 2 — Globaler Fallback**: Falls weniger als 4 Treffer ODER beste Similarity < 0.65, ergänzende ungefilterte Suche über das Gebäude (Limit 4).
3. **Re-Ranking**: Chunks aus erkannter Kategorie bekommen Similarity-Boost +0.1 (so dass Teilungserklärungs-Chunks in Teilungserklärungs-Fragen vorne stehen, auch wenn andere Dokumente das Wort enthalten).

#### Schritt 4 — Quellen-Anzeige verbessern
Antwort von NOVA nennt künftig den **Ordnerpfad**:
> _Quelle: Stammakte › Teilungserklärung › "Teilungserklärung Musterstr. 12.pdf", S. 4_

Im Frontend (`DocumentChat.tsx` und Nova-Chat) wird die `category_path`-Information aus dem Chunk-Metadata-JSON gerendert.

#### Schritt 5 — `chat-with-ai` aufräumen
Die separate Volltext-Scoring-Logik für `building_files` (Zeile 392-432) und `building_documents` (434-...) entfällt. Stattdessen ein einziger Aufruf an `query-documents` (intern, mit Service-Role) — eine Quelle der Wahrheit.

---

### Komponenten-Übersicht

| Datei | Typ | Zweck |
|---|---|---|
| Migration | NEU | Spalten `file_id`, `category_id`, `category_slug`, `category_path` an `document_chunks`; Backfill-Script |
| Migration | NEU | RPC `search_chunks_by_category(query_embedding, building_id, category_slugs[], limit)` |
| Migration | NEU | RPC `get_category_taxonomy(building_id)` — liefert flache Liste aller Slugs+Namen+Pfaden |
| `process-building-file/index.ts` | EDIT | OCR + Chunking + Embeddings + Chunk-Insert mit Kategorie-Metadaten |
| `query-documents/index.ts` | EDIT | Kategorie-Detektor (Mistral Small), Hybrid-Retrieval, Boost-Logik |
| `chat-with-ai/index.ts` | EDIT | Bestehende Score-Logik raus, intern `query-documents` aufrufen |
| `DocumentChat.tsx` + Nova Chat-Components | EDIT | Quellen mit Ordnerpfad anzeigen |

### Was bleibt unverändert
- DMS-Upload-UX (Ordnerauswahl beim Hochladen) — nutzt schon `building_files` + `category_id`.
- Existierende `building_documents` (Legacy-Pfad) bleibt funktionsfähig, neue Uploads laufen aber nur noch über `building_files`.
- Vektorsuche-Engine (pgvector + Mistral-Embeddings).

### Reihenfolge der Umsetzung
1. **Migration**: Spalten + RPC + Backfill für vorhandene Chunks.
2. **process-building-file**: Chunking/Embeddings einbauen, alte DMS-Files automatisch nachverarbeiten (Knopf "RAG neu indizieren" pro Datei).
3. **query-documents**: Kategorie-Detektor + Hybrid-Retrieval.
4. **chat-with-ai**: Konsolidierung + Source-Path-Anzeige im Frontend.

Soll ich mit Schritt 1 (Migration + Backfill) starten?

