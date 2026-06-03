## Ziel
Rechtsklick auf ein **Inline-Bild im E-Mail-Body** öffnet ein Kontextmenü mit zwei Aktionen:
- **„Im DMS / Gebäudeordner speichern"** (gleicher Dialog wie bei normalen Anhängen)
- **„Als Rechnung importieren"** (gleicher OCR-Workflow wie bei normalen Anhängen; optional zusätzlich „Als Beleg / Gutschrift importieren")

Funktioniert überall, wo `EmailHtmlBody` verwendet wird (Inbox-Detail, ETV-AgendaItem-Dialog usw.).

## Umsetzung

### 1. Aktionen aus `EmailAttachments.tsx` in einen Hook extrahieren
Neue Datei `src/components/email/lib/useAttachmentActions.ts`:
- `importAttachmentAsInvoice(att, asCreditNote)` — die exakte Logik aus `handleImportAsInvoice` (Z. 97–181), inkl. Bild→PDF-Konvertierung via `mergeImagesToPdf`, Upload in `invoices`-Bucket, Insert, `extract-invoice` / `match-credit-note` Trigger, Toasts.
- Liefert außerdem `state` (importingId, importedIds) und einen Setter für die SaveToBuilding-Pipeline (`requestSaveToBuilding(att)` → öffnet `SaveAttachmentToBuildingDialog`).

`EmailAttachments.tsx` wird auf den Hook umgestellt, Verhalten bleibt 1:1.

### 2. `EmailHtmlBody` um Kontextmenü erweitern
- Beim Auflösen der `cid:`-Referenzen zusätzlich pro ersetztem URL ein Mapping `signedUrl → attachmentId` führen.
- In das iframe-`srcDoc` ein kleines Inline-Script einbetten, das:
  - das Mapping als `window.__inlineAttachmentMap` erhält,
  - auf jedem `<img>` ein `contextmenu`-Listener registriert,
  - bei einem Treffer (`img.src` im Mapping) `e.preventDefault()` macht und via `window.parent.postMessage({ type: "rgi-inline-image-menu", attachmentId, x, y }, "*")` meldet (Koordinaten relativ zum iframe).
- Parent-Komponente `EmailHtmlBody` hört auf `message`, übersetzt iframe-Koordinaten in Viewport-Koordinaten (bounding rect des iframes), und öffnet ein kontrolliertes Shadcn-`DropdownMenu` an dieser Position mit den Aktionen.

### 3. Aktionen verdrahten
- `EmailHtmlBody` nutzt den neuen `useAttachmentActions`-Hook und rendert intern:
  - das Positions-gesteuerte DropdownMenu,
  - `<SaveAttachmentToBuildingDialog>` (existiert bereits),
  - die nötigen Snackbars laufen über `sonner` (schon im Hook).
- Beim Menü-Klick wird das passende `email_attachments`-Row aus dem bereits geladenen `inlineAttachments`-Array genommen und an den Hook übergeben.

### 4. Menü-Inhalt
```
🗂  Im Gebäude/DMS speichern
📄  Als Rechnung importieren
💶  Als Beleg / Zahlungseingang importieren
⬇  Bild herunterladen
```
„Herunterladen" ist günstig dazu, weil der iframe-`base target="_blank"` den nativen Browser-Rechtsklick blockiert/umlenkt — so geht keine Funktionalität verloren.

## Was nicht geändert wird
- Keine Änderungen an Edge Functions, DB-Schema, Buckets.
- Keine Änderungen an „normaler" Anhangsleiste außer der Refaktorisierung in den Hook (Verhalten identisch).
- iframe-`sandbox` bleibt; das Inline-Script läuft im iframe-eigenen Origin und `postMessage` ist erlaubt.

## Betroffene Dateien
- **neu:** `src/components/email/lib/useAttachmentActions.ts`
- **geändert:** `src/components/email/EmailHtmlBody.tsx` (Mapping + iframe-Script + Menü + Dialog)
- **geändert:** `src/components/email/EmailAttachments.tsx` (Aufrufe gehen über den neuen Hook)