# Service-Hub Header, Rundmail-Zeilenumbrüche, DMS-Archiv

## 1. Service-Hub Kopfbereich (`src/pages/weg-owner/ServiceHub.tsx`)

- Kleine Zeile mit Stern-Icon und „Service-Hub" oben entfernen.
- Überschrift „Hilfreiche Dokumente auf Knopfdruck" ersetzen durch „Service-Hub".
- Untertitel neu, bezogen auf den gesamten Hub, z. B.:
  „Zusätzliche Verwaltungsleistungen für Eigentümer: Wir erstellen auf Basis Ihrer hinterlegten Daten geprüfte Dokumente – digital, rechtssicher formatiert und sofort verfügbar."
- Sonst keine Änderungen an den Karten.

## 2. Zeilenumbrüche bei Rundmails

Ursache: Der Editor speichert reinen Text aus einem Textarea, die Kampagne wird aber ohne `body_format` gespeichert, also serverseitig als HTML versendet. In HTML werden `\n` ignoriert – die Mail kommt als ein Fließtextblock an (siehe Screenshot).

Fix in `supabase/functions/comm-send-bulk-email/index.ts` (und der Zeitplan-/Scheduler-Variante, falls sie denselben Code nutzt):

- Kleine Hilfsfunktion analog `src/lib/emailHtml.ts` (`textToHtmlWithLinks`) in einen Shared-Helper legen und nutzen.
- Beim Versand prüfen: enthält der Text keine HTML-Tags, wird er escaped, URLs verlinkt und `\n` in `<br>` gewandelt – vor dem Anhängen der Signatur.
- Gilt für Basistext, Empfänger-Overrides und Test-Mail; ebenso für den Eintrag im „Gesendet"-Ordner.
- Vorschau in `BulkRecipientDialog.tsx` nutzt dieselbe Umwandlung, damit Vorschau = Versand.

## 3. DMS: Archiv für Dokumente und Ordner

Betrifft die Stammakte (`BuildingDocumentsTab` mit `FolderTree` + `DocumentFileList`).

Datenbank (Migration):
- `building_files.archived_at timestamptz null`
- `building_file_categories.archived_at timestamptz null`
- Indizes auf `archived_at` für schnelle Filterung.

Ordnerbaum (`FolderTree.tsx`):
- Normale Struktur zeigt nur Ordner ohne `archived_at`.
- Ganz unten ein eigener, einklappbarer Bereich „Archiv" mit allen archivierten Ordnern (inkl. ihrer Unterordner) und einem Eintrag „Archivierte Dokumente".
- Im Drei-Punkte-Menü je Ordner: „Archivieren" bzw. im Archiv „Wiederherstellen". Archivieren setzt `archived_at` für den Ordner und alle Unterordner; die enthaltenen Dokumente bleiben im Ordner und wandern damit mit ins Archiv.

Dokumentenliste (`DocumentFileList.tsx`):
- Standardabfrage filtert `archived_at is null`; im Archiv-Modus genau umgekehrt.
- Neues Drei-Punkte-Menü je Zeile mit „Archivieren" / „Wiederherstellen" (plus Öffnen).
- Zusätzlich Bulk-Aktion „Archivieren" neben dem bestehenden Löschen, wenn mehrere Dokumente markiert sind.
- Zähler im Ordnerbaum berücksichtigen den Archivstatus.

Archivieren ist ausdrücklich kein Löschen: Papierkorb (`deleted_at`) bleibt unverändert bestehen.

## Technische Hinweise

- Neue Spalten müssen in den Supabase-Typen auftauchen; bis dahin ggf. `as any` bei den Updates wie bereits im Bestand üblich.
- Query-Keys `stammakte-files`, `stammakte-categories`, `stammakte-counts` nach jeder Archiv-Aktion invalidieren.
- Edge Function `comm-send-bulk-email` nach der Änderung neu deployen.
