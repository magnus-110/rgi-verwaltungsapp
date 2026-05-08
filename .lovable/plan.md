# E-Mail als PDF drucken

Ein Druck-Button in der E-Mail-Detailansicht (Inbox), der ein sauberes PDF erzeugt — wahlweise nur die aktuelle Mail oder den kompletten Thread.

## Umfang

1. **Neue Komponente** `src/components/email/PrintEmailDialog.tsx`
   - Trigger: Drucker-Icon (Lucide `Printer`) in der E-Mail-Toolbar von `src/pages/Inbox.tsx`
   - Auswahl-Dialog mit zwei Optionen:
     - **Nur diese E-Mail** (Standard)
     - **Gesamter Verlauf** (nur aktiv wenn `thread_id` vorhanden und >1 Mail im Thread; Anzahl wird angezeigt)
   - Buttons: „PDF herunterladen" und „Drucken" (öffnet Print-Dialog des Browsers)

2. **PDF-Erzeugung**
   - Stack: `html2canvas` + `jsPDF` (bereits im Projekt — siehe Memory „PDF generation uses html2canvas + jsPDF, A4, Century Gothic Headings, Work Sans Body")
   - Render in versteckten DOM-Container, dann seitenweise auf A4 umbrechen
   - Inline-Bilder (cid:) werden via vorhandenem Mechanismus aus `EmailHtmlBody` aufgelöst (Logik in Helper extrahieren)

3. **Inhalt pro E-Mail im PDF**
   - Kopfblock (RGI-Header dezent oben): Betreff (H1), Von (Name + Adresse), An, CC, Datum/Uhrzeit
   - Falls vorhanden: KI-Zusammenfassung (kleiner grauer Kasten)
   - Body: bevorzugt `body_html` (gerendert), sonst `body_text` (monospace-frei)
   - Anhänge-Liste am Ende (Dateiname + Größe), keine Inhalte
   - Bei Thread: Mails chronologisch (älteste zuerst), jede Mail mit Trennlinie + neuer Seite optional bei Überlauf

4. **Datenbeschaffung Thread**
   - Query: `emails` filtered by `thread_id = currentEmail.thread_id` und gleichem `account_id`, geordnet nach `date ASC`
   - Inline-Attachments via vorhandener Logik (signed URLs aus `email-attachments` Bucket)

5. **Styling**
   - Century Gothic für Überschriften, Work Sans für Body (gem. Memory)
   - Semantische Tokens (kein hartcodiertes Farb-CSS), A4 Hochformat, 20mm Ränder

## Technische Details

- Keine Backend-/DB-Änderungen nötig
- Reine Frontend-Implementierung
- Wiederverwendung der CID-Auflösung aus `EmailHtmlBody.tsx` → in kleines Helper-Modul `src/lib/emailHtmlResolve.ts` ausziehen
- Sandbox-iframe NICHT verwenden (html2canvas braucht echten DOM-Zugriff); stattdessen `dangerouslySetInnerHTML` in offscreen Container mit Sanitizing nicht nötig (Quelle ist gleiche wie aktuelle Anzeige)

## Geänderte/neue Dateien

- NEU: `src/components/email/PrintEmailDialog.tsx`
- NEU: `src/lib/emailHtmlResolve.ts` (CID → signed URL Helper)
- EDIT: `src/pages/Inbox.tsx` — Drucker-Button + Dialog-State
- EDIT: `src/components/email/EmailHtmlBody.tsx` — nutzt neuen Helper
