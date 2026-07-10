## Ziel
Bei aktiviertem "Mieterwechsel im Wirtschaftsjahr" muss der Nutzer nicht zwangsläufig einen zweiten Mieter anlegen und mehrere Abrechnungen kaufen. Außerdem soll der (ausgegraute) Zahl-Button erklären, was noch fehlt.

## Änderungen (nur `src/pages/weg-owner/NebenkostenTool.tsx`)

### 1. Mieterwechsel entkoppeln von "muss zweiten Mieter anlegen"
- `additionalTenantsValid` (Zeile 473–476): Bedingung ändern von "bei Mieterwechsel muss mind. 1 zusätzlicher Mieter existieren" zu:
  - Wenn `tenantChanged` und `additionalTenants.length === 0` → **gültig** (Nutzer kauft nur seine eigene Abrechnung).
  - Wenn `additionalTenants.length > 0` → jeder eingetragene Mieter muss vollständig sein (Name + prepayMonthly > 0), sonst ungültig.
- `quantity` (Zeile 489) bleibt wie es ist: `tenantChanged ? 1 + additionalTenants.length : 1`. Ohne zusätzliche Mieter ist die Anzahl also automatisch 1, es wird nur eine Abrechnung berechnet und im Checkout gekauft.

### 2. UI-Hinweis im Mieterwechsel-Bereich
Im Block "Weitere Mieter" (ab Zeile 877): Einleitungstext ergänzen, dass das Anlegen weiterer Mieter **optional** ist. Beispiel:

> „Optional: Sie können weitere Mieter (Vor- oder Nachmieter) ergänzen, um deren Abrechnungen im selben Vorgang zu erstellen. Wenn Sie nur Ihre eigene Abrechnung erzeugen möchten, lassen Sie diesen Bereich einfach leer – es wird dann nur **eine** Abrechnung berechnet und gekauft."

Falls `additionalTenants.length === 0`: kleiner Info-Chip „Nur 1 Abrechnung – weitere Mieter optional".

### 3. Erklärung, warum Button ausgegraut ist
- Neue Memo-Liste `missingFields: string[]` direkt neben `canBuy`, die durchgeht:
  - keine Wohnung gewählt → „Wohnung wählen"
  - keine Abrechnungsperiode → „Abrechnungszeitraum wählen"
  - `tenantName` leer → „Name des Mieters eintragen"
  - `prepayMonthly` leer/0 → „Geleistete NK-Vorauszahlung eintragen"
  - Wenn `additionalTenants` mit unvollständigen Einträgen: pro Eintrag „Mieter X: Name / Vorauszahlung fehlt"
  - `loadingData` → „Daten werden geladen…"
- Sticky-Bottom-Bar (Zeile 1320–1357):
  - Button-`<Button>` in ein `<Tooltip>` wickeln, das die fehlenden Punkte listet – aktiv sowohl bei Hover als auch bei Klick auf den disabled-Wrapper.
  - Da HTML-`disabled` Klicks schluckt, wird der Button **nicht** mehr per `disabled`-Prop deaktiviert. Stattdessen: `aria-disabled`, gedämpftes Styling wie bisher, und `onClick` prüft `canBuy`:
    - `canBuy === false` → statt Dialog zu öffnen einen Toast/Popover zeigen: „Noch nicht startklar" mit Liste der fehlenden Punkte.
    - `canBuy === true` → wie bisher `setBuyOpen(true)`.
- Zusätzlich unter der Preis-Zeile in der Bottom-Bar bei `!canBuy`: kleiner Text „Noch nicht startklar – tippen für Details" in `RGI.muted`.

### 4. Sonstiges
- Keine Änderungen an Edge Function `create-service-checkout` nötig (bekommt weiterhin `quantity` + Mieter-Array; bei einem Mieter identisches Verhalten wie heute ohne Mieterwechsel).
- Keine DB-Änderungen.

## Technische Details
- Nur eine Datei: `src/pages/weg-owner/NebenkostenTool.tsx`.
- Neue Helfer: `missingFields = useMemo(...)`; Toast über bereits importiertes `toast` (sonner).
- Tooltip: `Tooltip`/`TooltipContent` sind bereits via `TooltipProvider` importiert.
