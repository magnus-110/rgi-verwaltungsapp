## Ziel

Bei §35a soll die KI keine geschätzten Lohnanteile mehr ausrechnen, sondern die **tatsächlichen Rechnungspositionen** der verknüpften Rechnung analysieren, die §35a-relevanten Positionen **per Index auswählen** und daraus den Betrag **summieren**. Im UI (`Section35aEditor`) sind genau diese Positionen sichtbar angeklickt, sodass der Nutzer jede Position nachvollziehen und ent-/anklicken kann.

Kein Erfinden von Zahlen mehr: Wenn keine Rechnungspositionen vorliegen, gibt die KI keinen `amount_35a` aus, sondern markiert die Buchung nur als `is_35a_relevant=true` und überlässt dem Nutzer die Eingabe.

## 1. `suggest-match` Edge Function — Positions-basierte §35a-Analyse

### 1a) Rechnungspositionen in den Prompt geben
Wenn `transaction.matched_invoice_id` gesetzt ist (oder die KI eine Rechnung matcht), Rechnung inkl. `line_items` aus DB laden und im User-Prompt als eigenen Block einfügen:

```
RECHNUNGSPOSITIONEN (Rechnung {nr}, brutto {x} €):
[0] "Wartung Aufzug Jahrespauschale" — netto 420,00 € (USt 19%)
[1] "Anfahrtspauschale"               — netto  35,00 € (USt 19%)
[2] "Ersatzteil Türkontakt"           — netto  78,50 € (USt 19%)
[3] "Material Schmierfett"            — netto  12,00 € (USt 19%)
```

### 1b) Neues §35a-Feld im Tool-Schema
`suggested_bookings[].paragraph_35a` ersetzt die heutige Heuristik. Struktur:

```json
{
  "is_35a_relevant": true,
  "selected_line_items": [
    { "index": 0, "type_35a": "labor", "reason": "Arbeitsleistung Wartung" },
    { "index": 1, "type_35a": "labor", "reason": "Anfahrt = Fahrtkosten Handwerker" },
    { "index": 2, "type_35a": "labor", "reason": "Reparaturarbeit (Ersatzteil bleibt Material, hier 0)" }
  ],
  "explanation": "Material (Schmierfett, Ersatzteil-Anteil) ausgeschlossen."
}
```

`amount_35a` wird **server-seitig** aus `selected_line_items` berechnet (Summe der Netto-Beträge der gewählten Positionen, ggf. type_35a-gewichtet) — die KI darf den Betrag nicht mehr frei nennen.

Wenn keine `line_items` vorhanden sind:
- `is_35a_relevant` darf `true` sein,
- `selected_line_items` bleibt leer,
- `amount_35a` bleibt **null** (keine erfundene Pauschale, kein Fallback auf Brutto×%).

### 1c) System-Prompt anpassen
- §35a-Sektion umschreiben: „Analysiere Rechnungspositionen **einzeln**. Markiere nur Positionen, die echte Arbeitsleistung (Lohn/Anfahrt) enthalten. Material, Ersatzteile, Gerätekosten ausschließen. Wenn keine Positionen vorliegen: keinen amount_35a setzen."
- Die alten Pauschalsätze (~50%, ~80%, …) nur noch als **Plausibilitätscheck** behalten, nicht als Berechnungsbasis.

### 1d) Validation-Layer
- Wenn `selected_line_items[i].index` außerhalb von `line_items` liegt → entfernen + Warning.
- `amount_35a` immer aus Summe neu rechnen, KI-Wert ignorieren.

## 2. `build35aDetail.ts` — Auto-Übernahme aus KI

`build35aDetailFromSuggestion(...)` bekommt ein neues Argument `aiSelectedItems?: {index, type_35a, reason}[]`.

- Wenn `aiSelectedItems` vorhanden: genau diese Indizes als `is_35a: true` zurückgeben, `description` aus der echten OCR-Position, `type_35a` aus KI, neues Feld `ai_picked: true` + `ai_reason` für UI-Tooltip.
- Greedy-Matching nach Brutto-Summe (heutiger Algorithmus) entfällt — er erfindet Auswahl.
- Fallback „custom item" nur, wenn `aiSelectedItems` leer **und** der Nutzer den Vorschlag explizit übernimmt — sonst gar nichts.

## 3. `TransactionReviewMode` — Vorschlag übernehmen

In der schon vorhandenen `applyAiSuggestion`-Logik (rechtes Panel, „Vorschlag übernehmen"):
- `line_items_detail` aus `paragraph_35a.selected_line_items` + `invoiceDetail.line_items` bauen (über neuen `build35aDetail`-Pfad).
- Falls Rechnung verknüpft, aber `selected_line_items` leer → `line_items_detail = null`, `amount_35a = null`, `is_35a_relevant` bleibt wie vom KI vorgeschlagen; UI zeigt Hinweis „KI konnte keine Position eindeutig zuordnen — bitte manuell auswählen".

## 4. `Section35aEditor` UI

Bereits vorhandene Checkboxen pro Position bleiben. Ergänzungen:
- Pro Position kleines Sparkles-Badge „KI" wenn `ai_picked: true`, mit Tooltip = `ai_reason`.
- Summen-Zeile zeigt: „Netto-Lohnanteil aus 3 von 4 Positionen: 533,00 €" — also klar nachvollziehbar woher die Zahl kommt.
- Wenn Nutzer eine Position abwählt/dazunimmt, Summe + `amount_35a` live neu berechnen (bereits implementiert) und `ai_picked`-Badge bleibt zur Transparenz stehen.

## 5. Nicht im Scope

- Keine Änderungen am OCR (Rechnungspositionen müssen aus `invoices.line_items` vorhanden sein; bei Altrechnungen ohne Positionen fällt der Mechanismus sauber auf „kein amount_35a" zurück).
- Keine Änderungen an `generate-35a-docx` — die liest weiter `line_items_detail`.
- Keine Änderungen am Prefetch-Loop, RAG-Suche oder Vendor-Memory.

## Technische Stichpunkte

- Geänderte Dateien:
  - `supabase/functions/suggest-match/index.ts` (Prompt + Tool-Schema + Validation + Invoice-Load mit `line_items`)
  - `src/components/finance/build35aDetail.ts` (neuer Signaturpfad `aiSelectedItems`)
  - `src/components/finance/TransactionReviewMode.tsx` (`applyAiSuggestion` nutzt neuen Pfad; kein Brutto×%-Fallback mehr)
  - `src/components/finance/Section35aEditor.tsx` (Sparkles-Badge + Tooltip für `ai_picked`)
- `LineItemDetail`-Typ um optionale `ai_picked?: boolean`, `ai_reason?: string` erweitern.
- DB-Schema: unverändert (`line_items_detail` ist `jsonb`).
