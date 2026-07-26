## 1) Farb-Bug bei Schlüsselanhänger (nur Orange erscheint zusätzlich)

**Status:** Ursache noch nicht bestätigt — die vorhandene `stripPlaceholderColoring`-Logik entfernt `<w:shd>`, `<w:color>`, `<w:highlight>` in der Zelle des jeweiligen Platzhalters. Dass Orange bei Grün und Rot trotzdem bleibt, deutet darauf hin, dass die orange Färbung **nicht** über eines dieser Elemente kommt (oder nicht in der `{o}`-Zelle sitzt).

**Vorgehen: erst diagnostizieren, dann fixen**
1. Aktuelle Vorlage (`key-files/_global/tag-template-…docx`) laden, `word/document.xml` inspizieren und prüfen, wo die orange Farbe tatsächlich definiert ist. Typische Verdächtige:
   - `<w:tcBorders>` / `<w:tblBorders>` mit orangefarbenem Rand
   - Paragraph-Shading `<w:pPr><w:shd w:fill="…">`
   - Theme/Style-Referenzen (`<w:pStyle>`, `<w:tblStyle>`) mit orangem Fill
   - Eine Deko-Zelle ohne `{o}`-Platzhalter, die orange gefärbt ist
2. Basierend auf dem Fund `stripPlaceholderColoring` erweitern, damit die richtige Quelle entfernt wird (z. B. zusätzlich `<w:shd>` in `pPr`, oder Cell-Borders neutralisieren, oder Deko-Zelle über feste Position identifizieren).
3. Für alle drei Farben identisches Verhalten verifizieren (Grün, Orange, Rot je einzeln gedruckt).

## 2) TOP-Beschreibung optional in Einladung übernehmen

**DB-Migration**
- Spalte `include_description_in_invitation boolean NOT NULL DEFAULT false` auf `etv_agenda_items` ergänzen.

**Admin-UI (`src/components/meetings/AgendaItemEditor.tsx`)**
- Neue Checkbox „Beschreibung in Einladung übernehmen" unter dem Beschreibungsfeld (im Neu- und im Bearbeiten-Formular).
- Insert/Update-Payload um das neue Feld erweitern.

**Rendering (`supabase/functions/comm-render-letters/index.ts`)**
- Query um `include_description_in_invitation` erweitern.
- Zusätzliche Template-Variablen bereitstellen:
  - `agenda_list_detailed`: pro TOP eine Zeile `TOP N: Titel` + (falls Checkbox aktiv) neue Zeile mit Einrückung und Beschreibung
  - Vorhandene Variablen `agenda_list` / `agenda_titles` bleiben unverändert (Rückwärtskompatibilität).
- Doku im `VariableHelpSheet` ergänzen.

## 3) Wirtschaftsplan: 10er-Stepper beim Aufrunden

In `src/components/finance/ManualEconomicPlanEditor.tsx` an beiden Stellen mit `ArrowUp` (Gesamt-View ~Zeile 1076 und Einzelplan-View ~Zeile 1265):
- Rundungslogik umbauen von „auf nächste ganze €" auf „auf nächste 10er-Stelle nach oben (Betrag)":
  - `const abs = Math.abs(v); const nextTen = Math.floor(abs / 10) * 10 + 10; const rounded = Math.sign(v || -1) * nextTen;`
  - Jeder Klick springt +10 (0 → -10 → -20 → …); Vorzeichen bleibt negativ wie bisher.
- Tooltip-Text anpassen: „Auf nächste 10er aufrunden".

## 4) Vorjahres-IST-Summe im Wirtschaftsplan anzeigen

**Ziel:** Unterhalb der Plan-Summe zusätzlich die IST-Summe des Vorjahres als Vergleichszeile.

**Umsetzung**
- Bereits vorhandene `previousAmount`-Werte pro Zeile (siehe `onPreviousAmountClick`) aufsummieren → `previousTotal`.
- In `EconomicPlanLayout` (bzw. dem `footer`-Bereich der `TableSection`, siehe Props ab Zeile 1134/1135) eine zusätzliche Fußzeile:
  - „Vorjahres-IST gesamt: X €"
  - Optional Differenz und Prozent-Änderung (Wiederverwendung der vorhandenen Prozent-Helper um Zeile 662).
- Nur in der Gesamt-Ansicht (nicht in Einzelabrechnung).

## Technische Details

- Migration erhält GRANTs nicht neu — nur Spalten-ALTER.
- Keine Änderungen an bestehenden Template-Variablen — nur additiv.
- 10er-Rundung bleibt clientseitig; keine DB-Auswirkung.
- Farb-Fix betrifft nur `src/components/buildings/keys/tagTemplate.ts`.

## Reihenfolge

1. Farb-Bug diagnostizieren (Template-XML lesen) → gezielter Fix.
2. Migration `etv_agenda_items.include_description_in_invitation`.
3. AgendaItemEditor + comm-render-letters anpassen.
4. 10er-Stepper.
5. Vorjahres-IST-Fußzeile.
