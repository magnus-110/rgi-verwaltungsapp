

## Problem
1. **Logischer Bug**: Wenn die KI im `TransactionReviewMode` einen §35a-Betrag vorschlägt (`amount_35a` aus `suggest-match`), wird das Feld zwar gesetzt — aber `line_items_detail` bleibt leer. Beim Öffnen des §35a-Dialogs sind deshalb keine Positionen markiert, obwohl der grüne Badge einen Betrag anzeigt. Genau das in Bild 196 zu sehen.
2. **Darstellungs-Bug**: Der §35a-Dialog (`max-w-md`, fixe `max-h-64` für die Positionsliste) wird auf manchen Auflösungen abgeschnitten/scrollig dargestellt, besonders bei vielen OCR-Positionen.

## Plan

### 1. Auto-Auswahl der Positionen beim KI-Vorschlag (Hauptproblem)
In `src/components/finance/TransactionReviewMode.tsx` — überall wo aus `suggested_bookings[0]` `amount_35a` und `is_35a_relevant` übernommen werden (3 Stellen: Split-Branch ~L405, Invoice+AI ~L469, AI-only ~L513) — zusätzlich `line_items_detail` befüllen über einen neuen Helper `build35aDetailFromSuggestion(invoiceLineItems, suggestedAmount, defaultType35a)`:

- **Wenn `invoiceLineItems` vorhanden**: Greedy-Auswahl der Positionen, deren Summe (brutto, mit `vat_rate`) der vorgeschlagenen `amount_35a` am nächsten kommt (Toleranz ±5%). Markiere diese als `is_35a: true` mit dem Default-Typ aus dem Konto (`settlement_35a_type`).
- **Wenn keine Positionen vorhanden** (kein OCR / keine line_items): Lege einen einzigen `is_custom: true`-Eintrag mit Beschreibung (z. B. „Lohnanteil lt. KI-Vorschlag") und dem Netto-Betrag an. So sieht der Nutzer im Dialog sofort, was der Betrag repräsentiert.
- Speichere als JSON-String in `row.line_items_detail` (passt zum bestehenden Save-Format L1745).

`invoiceLineItems` muss für die Berechnung im `useMemo`/Init verfügbar sein — daher Helper als reine Funktion, der `invoiceDetail?.line_items` direkt nimmt.

### 2. Sicherstellen, dass beim Öffnen des Dialogs immer ein Auswahl-State existiert
In `Section35aEditor.tsx`: Wenn `is35aRelevant === true`, aber alle `effectiveItems` leer sind UND `invoiceLineItems` leer sind, beim Mount automatisch eine Custom-Position mit dem aktuell gespeicherten `amount_35a` einfügen, damit der Nutzer sie bearbeiten/typisieren kann.

### 3. Responsives §35a-Dialog-Layout
- `DialogContent` von `max-w-md` → `max-w-lg max-h-[90vh] overflow-hidden flex flex-col`.
- Inneren Wrapper auf `flex-1 overflow-y-auto` setzen, damit die Liste bei vielen Positionen vollständig scrollbar ist und MwSt./Summen-Block sowie „Übernehmen"-Button immer sichtbar bleiben (Sticky Footer).
- In `Section35aEditor`: `max-h-64` der Positionsliste durch `max-h-[40vh]` ersetzen für bessere Skalierung auf großen wie kleinen Bildschirmen.

### 4. Gleiches Verhalten in `EditBookingDialog.tsx`
Beim Öffnen einer bestehenden Buchung mit `amount_35a > 0` aber leerem `line_items_detail` denselben Helper aufrufen, damit Altbestände konsistent angezeigt werden (rein clientseitig, kein DB-Migrationsbedarf).

### Dateien
- `src/components/finance/TransactionReviewMode.tsx` (Helper + 3 Auto-Fill-Stellen + Dialog-Layout)
- `src/components/finance/Section35aEditor.tsx` (Mount-Fallback + responsives Layout)
- `src/components/finance/EditBookingDialog.tsx` (Konsistenz für bestehende Buchungen)

Keine DB-Änderungen nötig.

