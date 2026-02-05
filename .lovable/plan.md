
# Plan: Intelligente Wissensbasis mit Dokumenten-Upload

## Übersicht

Bei ~30-40 DIN A4 Seiten (ca. 60.000-120.000 Zeichen) ist es zu viel, um alles in den Kontext zu laden. Stattdessen implementieren wir ein **Metadaten-basiertes System**, bei dem Nova nur relevante Dokumente lädt.

## Wie es funktionieren wird

```text
+---------------------------+
|  Admin lädt Dokument hoch |
|  (PDF/Text + Metadaten)   |
+------------+--------------+
             |
             v
+---------------------------+
|  OCR (bei PDF)            |
|  Text-Extraktion          |
+------------+--------------+
             |
             v
+---------------------------+
|  Speicherung als          |
|  knowledge_documents      |
|  (Volltext + Metadaten)   |
+---------------------------+

===== Bei Nutzeranfrage =====

+---------------------------+
|  Nutzer fragt Nova        |
+------------+--------------+
             |
             v
+---------------------------+
|  Keyword-Matching mit     |
|  Metadaten (Kategorie,    |
|  Schlagwörter)            |
+------------+--------------+
             |
             v
+---------------------------+
|  Nur relevante Dokumente  |
|  werden geladen           |
|  (max 3-5 Stück)          |
+------------+--------------+
             |
             v
+---------------------------+
|  Nova antwortet mit       |
|  korrektem Kontext        |
+---------------------------+
```

## Datenbankstruktur

Neue Tabelle `chatbot_knowledge_documents`:

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | UUID | Primärschlüssel |
| title | TEXT | Dokumenttitel (z.B. "Mietvertrag Standardvorlage") |
| content | TEXT | Vollständiger Dokumentinhalt |
| category | TEXT | Kategorie: "mietvertrag", "hausordnung", "rechtliches", "faq", "sonstiges" |
| keywords | TEXT[] | Schlagwörter als Array (z.B. ["kaution", "kündigung", "miete"]) |
| applies_to | TEXT | Für wen gilt es: "alle", "mieter", "weg_eigentuemer" |
| file_path | TEXT | Optionaler Pfad zur Originaldatei |
| created_at | TIMESTAMP | Erstellungsdatum |

## Metadaten-Felder erklärt

### 1. Kategorie (Pflichtfeld)
Wählen Sie beim Hochladen:
- **mietvertrag** - Mietverträge, Vertragsanlagen
- **hausordnung** - Hausordnungen, Regeln
- **rechtliches** - Gesetze, Verordnungen, rechtliche Hinweise
- **faq** - Häufige Fragen, Anleitungen
- **sonstiges** - Alles andere

### 2. Schlagwörter (wichtig für Suche)
Geben Sie 3-8 Begriffe ein, die Nutzer verwenden könnten:
- Mietvertrag → "kaution", "kündigung", "miete", "nebenkosten", "mieterhöhung"
- Hausordnung → "ruhezeiten", "müll", "haustiere", "grillen", "parken"

### 3. Gilt für
- **alle** - Für Mieter und WEG-Eigentümer
- **mieter** - Nur für Mieter relevant
- **weg_eigentuemer** - Nur für WEG-Eigentümer relevant

## UI-Design für Chatbot-Einstellungen

```text
+--------------------------------------------------+
| Wissensdokumente                     [+ Dokument]|
+--------------------------------------------------+
|                                                  |
| [PDF] Mietvertrag Standardvorlage     [✏️] [🗑️] |
|       Kategorie: Mietvertrag                     |
|       Schlagwörter: kaution, kündigung, miete    |
|       Gilt für: Mieter                           |
|       8 Seiten, 12.450 Zeichen                   |
|                                                  |
| [TXT] Hausordnung 2024                [✏️] [🗑️] |
|       Kategorie: Hausordnung                     |
|       Schlagwörter: ruhezeiten, müll, grillen    |
|       Gilt für: Alle                             |
|       2 Seiten, 3.200 Zeichen                    |
|                                                  |
+--------------------------------------------------+

[+ Dokument hinzufügen] - Dialog:
+--------------------------------------------------+
| Neues Wissensdokument                            |
+--------------------------------------------------+
| Titel: [________________________]                |
|                                                  |
| Quelle:  (○) Text eingeben  (●) PDF hochladen    |
|                                                  |
| [PDF auswählen oder hierher ziehen]              |
|                                                  |
| Kategorie: [Mietvertrag        ▼]                |
|                                                  |
| Schlagwörter (mit Komma getrennt):               |
| [kaution, kündigung, miete, nebenkosten______]   |
|                                                  |
| Gilt für: [Mieter              ▼]                |
|                                                  |
|              [Abbrechen]  [Speichern]            |
+--------------------------------------------------+
```

## Intelligente Suche in der Edge Function

Wenn ein Nutzer fragt "Was sind die Ruhezeiten?":

1. Keywords werden extrahiert: ["ruhezeiten"]
2. Dokumente mit passendem Keyword oder Kategorie "hausordnung" werden gefunden
3. Nur diese Dokumente (max. 3-5) werden in den Kontext geladen
4. Nova antwortet basierend auf dem relevanten Wissen

## Implementierung

### 1. Datenbank-Migration
- Neue Tabelle `chatbot_knowledge_documents` erstellen
- Bestehende `knowledge_items` migrieren (optional)

### 2. ChatbotSettings.tsx anpassen
- Bearbeitungs-Bug beheben (lokaler State)
- Neues UI für Dokumentenverwaltung
- Upload-Dialog mit Metadaten-Eingabe

### 3. Neue Edge Function: process-knowledge-document
- PDF-Upload → OCR → Text-Extraktion
- Speicherung in neuer Tabelle

### 4. chat-with-ai Edge Function erweitern
- Keyword-Matching für Dokumentensuche
- Nur relevante Dokumente laden

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| Migration | Neue Tabelle `chatbot_knowledge_documents` |
| `src/pages/ChatbotSettings.tsx` | Komplett überarbeitete Wissensverwaltung |
| `supabase/functions/process-knowledge-document/index.ts` | Neue Function für OCR |
| `supabase/functions/chat-with-ai/index.ts` | Intelligente Dokumentensuche |

## Vorteile dieses Systems

1. **Dokumente bleiben vollständig** - Mietverträge werden nicht zerstückelt
2. **Schnelle Suche** - Metadaten ermöglichen präzises Matching
3. **Skalierbar** - Funktioniert auch mit 100+ Dokumenten
4. **Einfache Pflege** - Klare Struktur mit Kategorien
5. **Zielgruppenspezifisch** - Mieter sehen nur Mieter-relevante Infos
