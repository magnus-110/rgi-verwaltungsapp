

## Ziel
Eingabefeld und Vorschau verschmelzen: Sobald ein Platzhalter eingefügt wird, erscheint er **direkt im Inhaltsfeld** als grauer Beispielwert (z. B. „Frau Dagmar Wollmann"). Keine separate Live-Vorschau mehr nötig.

## Lösungsansatz: Contenteditable WYSIWYG-Editor

Da ein normales `<textarea>` keine farbigen/inline-gerenderten Elemente erlaubt, ersetzen wir es durch ein **`contenteditable` `<div>`** mit Platzhalter-Pillen.

### Neue Komponente: `WysiwygPlaceholderEditor.tsx`

- `<div contenteditable="true">` mit Tailwind-Styling, das wie das aktuelle `Textarea` aussieht (border, padding, focus-ring, min-height).
- Platzhalter werden als **inline `<span contenteditable="false">`-Pillen** eingefügt:
  - Sichtbarer Text = Beispielwert (z. B. „Frau Dagmar Wollmann") in `text-muted-foreground`, leichter `bg-muted/50`-Hintergrund, abgerundet.
  - `data-placeholder="anrede_brief"` Attribut speichert den eigentlichen Schlüssel.
  - `contenteditable="false"` → wird wie ein einzelnes Token behandelt (Backspace löscht die ganze Pille auf einmal).
- Beim Tippen reiner Text → ganz normale Texteingabe.
- Beim Klick auf Platzhalter-Karte (oder Drag & Drop) → fügt eine Pille an der Cursor-Position ein.

### Serialisierung (DOM ↔ Template-String)

- **Beim Auslesen** (für Senden/Speichern): DOM-Walker konvertiert Pillen zurück in `{{anrede_brief}}` und Textknoten in puren Text → ergibt den finalen `body`-String, den der Backend-Renderer (`comm-vars.ts`) wie bisher verarbeitet.
- **Beim Initialisieren** (Vorlage laden): String mit `{{key}}` → DOM mit Pillen + Text-Nodes.
- Zeilenumbrüche werden via `<br>` (Klartext-Modus) bzw. nativ (HTML-Modus) abgebildet.
- Live-Update von `samples` aktualisiert nur den **angezeigten Text** in den Pillen, nicht den Schlüssel.

### Cursor-/Editing-Verhalten

- Enter im Klartext-Modus → `<br>` einfügen (kein `<div>`-Wrap).
- Backspace neben einer Pille → Pille als Ganzes löschen.
- Paste → nur Text-Inhalt einfügen (kein Rich-Text aus Word etc.).

## Aufräumen / Entfernen

- **`InlinePreviewEditor.tsx`** wird gelöscht (durch neuen Editor ersetzt).
- **`EmailPreviewPane`-Aufrufe** für Body und Subject im `EmailCampaignWizard` entfernen (Live-Vorschau-Block unterhalb des Inhalts entfällt). Datei selbst bleibt vorerst erhalten, falls für Schritt-3-Zusammenfassung noch genutzt.
- Auch der **Subject-Input** bekommt den gleichen Editor (single-line Variante: `WysiwygPlaceholderEditor` mit `singleLine` prop, kein Enter, kein `<br>`).

## Geänderte/neue Dateien

| Datei | Änderung |
|---|---|
| `src/components/communication/WysiwygPlaceholderEditor.tsx` | **Neu** — Contenteditable-Editor mit Platzhalter-Pillen + DOM↔String-Serialisierung |
| `src/components/communication/EmailCampaignWizard.tsx` | `InlinePreviewEditor` → `WysiwygPlaceholderEditor`; Subject-Input ebenfalls als Wysiwyg (single-line); Vorschau-Boxen entfernen |
| `src/components/communication/TemplateUploadDialog.tsx` | gleiche Umstellung wie Wizard |
| `src/components/communication/InlinePreviewEditor.tsx` | **Entfernt** |

## Backend-Auswirkungen
**Keine.** Der gespeicherte/gesendete `body`-String enthält weiterhin `{{key}}`-Tokens. Backend (`comm-vars.ts`, `comm-render-letters`, `send-email`) bleibt unverändert.

## Bewusst KISS gehalten
- Kein Rich-Text-Editor (Tiptap/Slate) — wir brauchen nur Text + Pillen, ein schlanker `contenteditable` reicht und vermeidet eine schwere Library.
- HTML-Modus zeigt die Pillen genauso wie Klartext-Modus; rohe HTML-Tags werden im Editor weiterhin als Text getippt (so wie aktuell).

