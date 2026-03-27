

# Plan: Eigentümer-TOP-Verwaltung, Admin-Anträge-Tab & KI-Beschlusstext

## Übersicht

Drei Bereiche: (1) Eigentümer können ihre Anträge bearbeiten/löschen/anzeigen, (2) Admin bekommt einen eigenen "Anträge"-Tab statt inline-Anzeige, mit Zuordnung zu konkreten Versammlungen, (3) KI-Beschlusstext-Funktion (Wand2-Stift) direkt im Formular, analog zum E-Mail-KI-Stift.

## 1. Eigentümer-Portal: Anträge bearbeiten/löschen/anzeigen

**Datei:** `src/pages/weg-owner/Meetings.tsx`

- Klick auf einen Antrag öffnet ein Detail-Dialog mit vollem Inhalt (Titel, Beschreibung, Anhänge als Download-Links)
- Nur bei Status `pending`: Bearbeiten-Button (Titel/Beschreibung ändern) und Löschen-Button
- Löschen mit Bestätigungsdialog, löscht auch die Dateien aus Storage
- Bearbeiten im selben Dialog inline (Felder werden editierbar)

**RLS:** Eigentümer dürfen bereits eigene TOPs updaten/deleten (bestehende Policy `Owners can manage their own submitted tops` deckt UPDATE/DELETE ab). Falls nicht vorhanden, wird eine Migration ergänzt.

## 2. Admin: Eigener "Anträge"-Tab auf Versammlungs-Hauptseite

**Datei:** `src/pages/Meetings.tsx`

- Neuer dritter Tab "Anträge" (neben Versammlungen / Beschlusssammlung) mit Badge-Counter für pending
- Zeigt alle `etv_submitted_tops` gruppiert nach Gebäude
- Pro Antrag: Übernehmen-Button mit Dropdown/Select zur Auswahl der Ziel-Versammlung (nur `draft`-Meetings des Gebäudes)
- Nach Übernahme: TOP wird als `etv_agenda_item` in die gewählte Versammlung eingefügt, Status → `accepted`
- Ablehnen/Zurückstellen wie bisher

**Datei:** `src/components/meetings/AgendaItemEditor.tsx`
- `SubmittedTopsSection` wird aus dem AgendaItemEditor entfernt (verschoben in den neuen Tab)

**Neue Komponente:** `src/components/meetings/SubmittedTopsManager.tsx`
- Eigenständige Komponente für den neuen Tab
- Fetcht alle pending TOPs über alle WEG-Gebäude
- Gebäude-Filter
- Pro TOP: Details anzeigen, Versammlung auswählen, übernehmen/ablehnen/zurückstellen

## 3. Admin: Dokument-Upload bei Agenda-Items

**Datei:** `src/components/meetings/AgendaItemEditor.tsx`

- Beim "Neuen TOP hinzufügen"-Formular: File-Upload-Feld für Anhänge (nutzt bestehenden `building-files` Bucket unter `etv-attachments/`)
- Bei bestehenden TOPs: Anhang-Anzeige mit Download-Links
- `attachment_paths` Spalte existiert bereits in `etv_agenda_items`

## 4. KI-Beschlusstext mit Wand2-Stift (wie E-Mail)

**Datei:** `src/components/meetings/AgendaItemEditor.tsx`

- Im "Neuen TOP hinzufügen"-Formular: Wand2-Icon neben dem Beschlusstext-Feld
- Ruft `improve-email-text` Edge Function auf (oder besser: eigene Logik via `chat-with-ai`)
- Generiert einen Beschlusstext nach dem Schema: **Wer** (Die Eigentümergemeinschaft), **Was** (beschließt...), **Wie** (Umsetzungsdetails), **Wann** (Zeitrahmen), plus finanzieller Spielraum für die Verwaltung ohne explizite Nennung
- Ergebnis erscheint als editierbare Vorschau unterhalb des Textfelds (analog `aiSuggestion` bei E-Mail)
- Auch bei bestehenden TOPs über den Sparkles-Button verfügbar (bestehende `AgendaAiAssistant` wird aktualisiert mit besserem Prompt)

**Prompt-Update in `AgendaAiAssistant.tsx`:**
```
Der Beschlusstext MUSS folgende Elemente enthalten:
1. WER: "Die Eigentümer beschließen..."
2. WAS: Konkreter Beschlussgegenstand
3. WIE: Umsetzungsweise, ggf. Beauftragung der Verwaltung
4. WANN: Zeitrahmen oder "unverzüglich"
5. Der Verwaltung soll ein angemessener Handlungsspielraum 
   bei der Umsetzung eingeräumt werden, ohne dies explizit 
   als "finanziellen Spielraum" zu benennen.
```

## 5. Fix: AgendaAiAssistant funktioniert nicht

Die Funktion ruft `chat-with-ai` auf. Vermutlich fehlt die korrekte Response-Extraktion oder der Prompt-Aufbau scheitert. Ich werde:
- Die Edge Function Response korrekt parsen
- Error-Handling verbessern
- Den Prompt optimieren

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/pages/weg-owner/Meetings.tsx` | Detail-Dialog, Edit/Delete für eigene TOPs |
| `src/pages/Meetings.tsx` | Neuer "Anträge"-Tab |
| `src/components/meetings/SubmittedTopsManager.tsx` | **Neu**: Admin-Anträgsverwaltung |
| `src/components/meetings/AgendaItemEditor.tsx` | SubmittedTops-Import entfernen, File-Upload, KI-Stift beim neuen TOP |
| `src/components/meetings/AgendaAiAssistant.tsx` | Prompt-Update mit Wer/Was/Wie/Wann |
| `src/components/meetings/SubmittedTopsSection.tsx` | Kann entfernt oder in SubmittedTopsManager integriert werden |
| `supabase/migrations/` | RLS für UPDATE/DELETE auf `etv_submitted_tops` falls nötig |

