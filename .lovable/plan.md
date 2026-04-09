

## Globaler Liegenschafts-/Perioden-Selektor in der Finanzen-Seite

### Analyse: Wo wird was gebraucht?

| Tab | Liegenschaft | Wirtschaftsjahr |
|-----|:---:|:---:|
| Rechnungen | ja (hat eigenen Filter) | nein |
| Vorlagen | ja (hat eigenen Filter) | nein |
| Kontoauszüge | ja (nutzt bereits shared) | nein |
| Buchungen | optional (kein Filter aktuell) | nein |
| Abrechnung | ja (nutzt bereits shared) | ja (nutzt bereits shared) |
| Planung & Berichte | ja (nutzt bereits shared) | ja (nutzt bereits shared) |

### Loesung

Den `BillingPeriodSelector` aus den einzelnen Tabs herausnehmen und **einmalig oben** in `Finance.tsx` anzeigen — direkt unter dem Seitentitel. Das Wirtschaftsjahr-Dropdown wird nur angezeigt, wenn der aktive Tab es braucht (Abrechnung oder Planung).

### Aenderungen

**1. `Finance.tsx`**
- Tab-State von `defaultValue` auf controlled `value` umstellen (neuer State `activeTab`)
- `BillingPeriodSelector` **ueber** die Tabs verschieben
- Periode-Dropdown nur anzeigen wenn `activeTab` in `["abrechnung", "planung"]`
- Shared building/period an alle Sub-Tabs weitergeben

**2. `InvoicesTab.tsx`**
- Neue Props: `sharedBuildingId?: string | null`, `onBuildingChange?: (id: string | null) => void`
- Wenn `sharedBuildingId` gesetzt: eigenen Gebäude-Filter ausblenden und stattdessen `sharedBuildingId` nutzen
- Fallback auf internen State wenn keine Props

**3. `BookingTemplatesTab.tsx`**
- Neue Props: `sharedBuildingId?: string | null`, `onBuildingChange?: (id: string | null) => void`
- Wenn `sharedBuildingId` gesetzt: eigenen Gebäude-Selektor ausblenden und `sharedBuildingId` als `filterBuildingId` nutzen
- Fallback auf internen State wenn keine Props

**4. `BookingsTab.tsx`**
- Keine Aenderung noetig — zeigt alle Buchungen aller Gebaeude, kein eigener Building-Filter

**5. `BillingTab.tsx`**
- `BillingPeriodSelector` aus dem eigenen Render entfernen (wird jetzt oben angezeigt)
- Props bleiben gleich, nur der Selektor faellt weg

**6. Planung-Tab in `Finance.tsx`**
- `BillingPeriodSelector` Render dort entfernen (ist jetzt global oben)

### Ergebnis
- Nutzer waehlt oben einmal die Liegenschaft → alle Tabs filtern automatisch
- Wirtschaftsjahr erscheint nur bei Abrechnung/Planung
- Jeder Tab kann die Auswahl weiterhin aendern (Sync zurueck nach oben)

