

## Ziel
Rundmail-Wizard nutzerfreundlicher machen: Klartext als Standard, verständliche Platzhalter-Karten mit Live-Vorschau, doppelte Sende-Bestätigung.

## 1. Klartext als Default

`EmailCampaignWizard.tsx`:
- Initial `useState<"html" | "plain">("plain")` (statt `"html"`).
- In `reset()` ebenfalls auf `"plain"` zurücksetzen.
- Reihenfolge der Format-Auswahl umdrehen: **Klartext** zuerst (links, als Standard hervorgehoben), HTML rechts.
- Wenn Vorlage geladen wird: nur auf HTML wechseln, wenn die Vorlage es explizit setzt.

## 2. Platzhalter-Design neu (verständlich für Nicht-Techniker)

Neue Komponente `FriendlyVariablePalette.tsx` ersetzt `VariablePalette` im EmailWizard.

**Karten-Design pro Platzhalter:**
```text
┌─────────────────────────────────────┐
│ Sehr geehrter Herr Müller,          │  ← großes Beispiel (Vorschau echter Daten)
│ Anrede (Brief)                      │  ← kleiner Label-Text
│                            [+ Einfügen] │
└─────────────────────────────────────┘
```
- Großer Text = **Live-Beispielwert** des ersten ausgewählten Empfängers (z. B. "Sehr geehrter Herr Müller,"). Fallback: generisches Beispiel ("Sehr geehrter Herr Mustermann,").
- Kleiner Text darunter = menschenlesbarer Name ("Anrede (Brief)" statt `{{anrede_brief}}`).
- Kein Code/keine Mustache-Syntax sichtbar.
- Status-Badge (rot/gelb) bleibt rechts oben für leere Werte.
- Klick oder Drag fügt weiterhin `{{key}}` ein — die Syntax bleibt im Backend identisch, nur die UI ändert sich.

**Beispiel-Daten-Quelle:** Erweiterung von `usePlaceholderStats` → neuer Hook `usePlaceholderSamples(buildingId, contactIds)` liefert pro Platzhalter den **konkreten Wert des ersten Empfängers**. Verwendet dieselben Queries (contacts, persons, emails, building).

## 3. Live-Vorschau-Panel mit grauen Platzhaltern

Neuer Tab/Toggle im Wizard: **„Schreiben | Vorschau"**.
- **Vorschau** rendert Betreff + Body mit den Daten des **ersten Empfängers**.
- Eingefügte Platzhalter erscheinen dort mit echten Werten in **dezent grauer Schrift** (`text-muted-foreground`), sodass man sofort erkennt: „das ist ein eingesetzter Platzhalter, kein fester Text".
- Beispiel-Empfänger-Auswahl per Dropdown (Default: erster Empfänger).
- Bei Klartext: `<pre>`-Darstellung mit Whitespace; bei HTML: sandboxed iframe.

## 4. Doppelte Sende-Bestätigung

Ersatz für das aktuelle einfache `confirm()`:
- Neuer Mini-Dialog `ConfirmSendDialog` (Shadcn AlertDialog):
  - **Schritt 1:** „Du bist im Begriff, an **N Empfänger** zu senden. Fortfahren?" → Button „Weiter".
  - **Schritt 2:** „Letzte Bestätigung — wirklich jetzt **endgültig versenden**?" → Button „Jetzt senden" (destructive-Style, 2s disabled-Countdown gegen versehentliches Doppelklicken).
- Geplante Versendung („scheduled") nutzt denselben Dialog mit angepasstem Text („für TT.MM. um HH:MM planen").
- Test-Mail bleibt ohne Doppelbestätigung (ist ja nur Test).

## Geänderte/neue Dateien

| Datei | Änderung |
|---|---|
| `src/components/communication/EmailCampaignWizard.tsx` | Klartext-Default, neue Palette einbinden, Vorschau-Toggle, ConfirmSendDialog statt `confirm()` |
| `src/components/communication/FriendlyVariablePalette.tsx` | **Neu** — Karten-Layout mit Sample-Werten + Labels |
| `src/components/communication/usePlaceholderSamples.ts` | **Neu** — liefert Beispielwert je Platzhalter (basiert auf `usePlaceholderStats`) |
| `src/components/communication/EmailPreviewPane.tsx` | **Neu** — rendert Betreff + Body mit grauen Platzhalter-Werten |
| `src/components/communication/ConfirmSendDialog.tsx` | **Neu** — zweistufiger AlertDialog mit Countdown-Button |

## Bewusst weggelassen (KISS)
- Keine WYSIWYG-Inline-Bearbeitung mit echten Pillen im Textfeld (würde Editor-Library erfordern). Stattdessen klare Trennung Schreiben ↔ Vorschau.
- Serienbrief-Wizard (`LetterCampaignWizard`) bleibt unverändert — Anfrage betraf nur Rundmails. Auf Wunsch übertragen wir das gleiche Muster später.

