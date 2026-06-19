## Ziel
Bug in der PDF/DOCX-Gesamtabrechnung (Birkenweg 6, WJ 2025): Spalte "Verteilbar" zeigt Zeilen für nicht‑verteilungsrelevante Konten (1850 Kapitalertragsteuer, 1860 Soli) und stellt die Werte ohne Minus‑Vorzeichen dar. Außerdem soll `{sum_ausgaben_verteilbar}` sauber nur die verteilbaren Kosten summieren – nie identisch mit `{sum_ausgaben_ist}`.

## Beobachtung
- In `src/components/finance/lib/buildBillingPayload.ts` (Funktion `sectionListFromUi`, ab Zeile 115) wird pro Zeile `betrag_verteilbar` gesetzt.
- Aktuell hängt das Blanking ausschließlich an `a.is_distributable === true`. Bei den Konten 1850/1860 wird das Flag in der UI zwar respektiert (Subtotal stimmt: -9.606,61 € vs. -9.616,50 €), aber das per‑Zeilen‑Feld bekommt trotzdem einen Wert (Screenshot: „9,39 €", „0,50 €"), weil das Flag in der durchgereichten Section‑Liste anders kommt oder `distributableAmount` einen Fallback liefert.
- Der Verteilbar‑Wert pro Zeile erscheint im PDF außerdem **positiv** (z. B. „378,60 €"), obwohl im Code `-Math.abs(...)` für `asExpense` gesetzt ist. Ursache: Das Template/Field rendert `{betrag_verteilbar}` ohne weitere Behandlung, aber der Payload muss garantiert negativ ausgegeben werden – das ist robust zu machen.
- `sum_ausgaben_verteilbar` basiert auf `totals.abrechnungssumme` (BillingSettlement.tsx Z. 569). Diese Summe ist korrekt distributable‑only, soll aber per Zeilen‑Konsistenz garantiert nicht versehentlich auf `sumIst` zurückfallen.

## Änderungen (nur Frontend/Payload)

### 1. `src/components/finance/lib/buildBillingPayload.ts`
- `sectionListFromUi`: Verschärftes Blanking für `betrag_verteilbar`:
  - Leer (`""`) wenn **eines** zutrifft: `a.is_distributable !== true`, oder Kontonummer in fester Block‑Liste der Quellensteuern (`1850`, `1860`), oder `distributableAmount === 0`.
  - Vorzeichen erzwingen: bei `asExpense` immer `-Math.abs(distributableAmount ?? totalAbs)`; bei `asIncome` immer `+Math.abs(...)`. (Bereits so codiert – wird abgesichert + Kommentar.)
- `sum_ausgaben_verteilbar`: Neuberechnung direkt aus den im Payload gelieferten Sections (Summe der `is_distributable`‑Konten mit gleichen Filter‑Regeln wie `getSectionDistributable`), statt Pass‑through von `totals.abrechnungssumme`. Damit ist die Zahl per Konstruktion identisch mit der Spalten‑Summe und kann nie versehentlich `sumIst` entsprechen.
  - `sumVerteilbar` lokal aus `sectionAccounts` neu summieren (operating_distributable + operating_non_distributable + heating + reserve − reserve_withdrawal), nur Konten mit `is_distributable === true`, ohne Bilanzkonten/Heizungs‑Vorauszahlungen und ohne harte Block‑Liste (1850/1860).
  - Ergebnis als `fmtEUR(-sumVerteilbar)` setzen.

### 2. Keine Änderung an
- DOCX‑Vorlage (Tags bleiben `{betrag_verteilbar}` / `{sum_ausgaben_verteilbar}`).
- UI‑Tabelle `BillingSettlement.tsx` (Anzeige ist bereits korrekt: Spalte "Verteilungsrel." zeigt 1850/1860 als „–").

## Verifikation
- Birkenweg 6, WJ 2025: PDF/DOCX neu generieren.
  - Zeilen 1850/1860 in „Nicht umlagefähige Kosten": Spalte Verteilbar leer.
  - Alle anderen Verteilbar‑Werte mit Minus (negativ) dargestellt.
  - `sum_ausgaben_verteilbar` = Summe aller (negativen) Verteilbar‑Subtotale, ≠ `sum_ausgaben_ist`.

## Out of scope
- Andere Vorlagen (Einzelabrechnung, Wirtschaftsplan) und UI‑Anpassungen außerhalb der Settlement‑Payload.
