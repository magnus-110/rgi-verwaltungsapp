# Rundmail-Editor: modernes Layout + Drag & Drop

## 1. Modernere Verfassen-Ansicht

Der linke Bereich wird von einer losen Formular-Liste zu einer ruhigen, karten­basierten Komposition:

```text
┌───────────────────────────────────────────────────────────┐
│ ←  Neue Rundmail            [Adolf-Haff-Weg 3]  Speichern  Senden (24) │
├───────────────────────────────────────────────────────────┤
│  Von  Maximilian Göttinger ▾        Versand  sofort ▾      │  ← eine Zeile, dezent
│  Betreff ······················ (große, randlose Zeile)    │
│  ─────────────────────────────────────────────────────────│
│  Text (randlos, große Schreibfläche, angenehme Zeilenhöhe) │
│                                                            │
│  ─────────────────────────────────────────────────────────│
│  Platzhalter einfügen:  Anrede · Vorname · Einheit · …     │  ← Fußleiste
└───────────────────────────────────────────────────────────┘
```

Konkret:
- Kopfzeile aufgeräumt: Titelfeld randlos, Gebäude-Badge, rechts Speichern/Senden mit klarer Primärfarbe.
- "Absender" und "Geplanter Versand" rücken in eine kompakte Kopfzeile der Nachrichtenkarte statt zweier großer Formularblöcke. Terminfeld erscheint erst, wenn "Später senden" gewählt ist.
- Betreff als große, randlose Eingabe (wie in modernen Mail-Clients), getrennt durch feine Linien statt Kästen.
- Textfläche ohne Rahmen, füllt die Höhe, größere Zeilenhöhe, ruhige Typografie.
- Platzhalter-Chips wandern unter das Textfeld in eine dezente Werkzeugleiste (mit lesbaren Labels wie „Anrede", Einfügen an der Cursorposition bleibt).
- Anhänge-Bereiche als zwei klar getrennte Karten mit Icon, Titel, Hilfetext.

## 2. Drag & Drop für Anhänge

- **Anhänge für alle**: gestrichelte Ablagefläche; Dateien darauf ziehen lädt hoch. Beim Ziehen färbt sich die Fläche ein („Dateien hier ablegen"). Klick öffnet weiterhin den Dateidialog.
- **Persönliche Anhänge**: identische Ablagefläche mit Hinweis auf das Präfix `0001_…`; nach dem Ablegen erscheint eine Zusammenfassung „18 zugeordnet · 2 ohne Einheit" inkl. Liste der nicht zuordenbaren Dateien.
- Beide Flächen zeigen die hochgeladenen Dateien als entfernbare Chips.

## 3. Drag & Drop auf Empfänger-Karten

- Jede Empfänger-Karte wird selbst zum Ablageziel: Dateien direkt auf die Karte ziehen hängt sie genau diesem Empfänger an (unabhängig vom Dateinamen).
- Die Karte hebt sich beim Überziehen hervor (Rahmen + leichte Tönung), während des Uploads zeigt sie einen Spinner.
- Zieht man Dateien über die Karten-Liste, aber nicht auf eine Karte, passiert nichts — kein versehentliches Massen-Zuordnen.

## Technische Umsetzung

- Neuer kleiner Hook `useFileDrop` (in `src/components/communication/bulk/useFileDrop.ts`): kapselt `onDragOver/onDragLeave/onDrop`, liefert `isOver` und `dropProps`; verhindert Default-Verhalten des Browsers.
- `BulkMailEditor.tsx`: linker Bereich neu strukturiert (Card-Header mit Absender/Versand, randlose Betreff-/Textfelder, Platzhalter-Toolbar unterhalb, zwei Dropzone-Karten). Upload-Handler (`handleGeneralUpload`, `handlePersonalUpload`) bleiben unverändert und werden zusätzlich vom Drop aufgerufen.
- `BulkRecipientCard.tsx`: erhält `onAddFiles` per Drop über `useFileDrop`, plus `busy`-Overlay und Drop-Highlight-Styling.
- Rein visuelle/Interaktions-Änderungen: Persistenz (`persist`), Empfänger-Gruppierung, „Kein Doppel", Overrides und der Sender bleiben unangetastet.
- Alle Farben über bestehende Design-Tokens (`primary`, `muted`, `border`), keine Hardcodes.
