## Ziel
Pro Tab (Gesamtabrechnung, Einzelabrechnung, Vermögensbericht) ein eigener Download-Button mit eigener, separat verwaltbarer Word-Vorlage.

## Empfehlung: Scope um `asset_report` erweitern + Tab-spezifische Buttons

Wir haben heute bereits `billing_templates.scope` mit den Werten `overall` und `single`. Sauberster Weg ist, das bestehende Modell um einen dritten Wert `asset_report` zu erweitern — kein neues Schema, kein neuer Edge-Function-Call-Pfad nötig.

### Änderungen

**1. Datenmodell (Migration)**
- `billing_templates.scope` Check-Constraint erweitern: `'overall' | 'single' | 'asset_report'`.

**2. Vorlagen-Dialog (`BillingTemplatesDialog.tsx`)**
- Dropdown „Typ" um Eintrag „Vermögensbericht" ergänzen.
- Neues Prop `selectedAssetReportId` + `onSelectAssetReport`.
- Anzeige- und Aktiv-Logik analog zu Single/Overall.
- `localStorage`-Key `billing:asset-report-template` analog zu den bestehenden Keys persistieren.

**3. `BillingSettlement.tsx` — Buttons pro Tab**
Statt eines globalen Buttons im Header rendern wir den Download-Button **innerhalb des jeweiligen Tabs** (oben rechts), damit immer klar ist, was geladen wird:

```text
[Gesamtabrechnung]      → Button "Gesamtabrechnung herunterladen" (DOCX/PDF)
[Einzelabrechnungen]    → Button "Alle Einzelabrechnungen" (ZIP)
                          + pro Eigentümer-Detailansicht: "Diese Einzelabrechnung"
[Vermögensbericht]      → Button "Vermögensbericht herunterladen" (DOCX/PDF)
```

Jeder Button öffnet ein Dropdown mit:
- DOCX
- PDF
- — Trenner —
- „Vorlage wählen / hochladen" → öffnet `BillingTemplatesDialog` vorgefiltert auf den passenden Scope.

**4. Download-Logik (`downloadBilling`)**
- Bestehende Modi `overall` / `single` / `all` bleiben.
- Neuer Modus `asset_report`: ruft `generate-billing-document` mit `template_id = selectedAssetReportTplId`, `mode = "single"`, `items = [{ kind: "asset_report", payload: buildAssetReportPayload(inp) }]` auf.
- Neuer Payload-Builder `buildAssetReportPayload` in `lib/buildBillingPayload.ts` mit den Vermögensbericht-Daten (Bankbestände, Rücklagen 1810/1820, Brennstoffbestand, Abgrenzungen 4100/4120/4160/4180, Forderungen/Verbindlichkeiten Personenkonten).

**5. Edge Function (`generate-billing-document`)**
- Akzeptiert zusätzlich `kind: "asset_report"` im Items-Array (rein kosmetisch für Dateinamen: `Vermoegensbericht_<Jahr>.docx`). Logik bleibt identisch (reines Template-Rendering).

### Warum diese Methode?
- **Nutzt bestehende Infrastruktur** (`billing_templates`-Tabelle, Storage-Bucket, Edge Function) → minimaler Aufbau, alle Vorlagen an einem Ort verwaltbar.
- **Tab-spezifischer Button** ist UX-mäßig eindeutig: der User sieht im Tab, was er herunterlädt, und der „Vorlagen verwalten"-Eintrag im selben Dropdown filtert direkt auf den richtigen Vorlagen-Typ.
- **Skalierbar**: Für künftige Berichte (z. B. §35a-Bescheinigung, Wirtschaftsplan) muss nur ein weiterer `scope`-Wert + Payload-Builder ergänzt werden.

### Offen / Bestätigung nötig
1. Sollen die **Platzhalter** für Einzelabrechnung und Vermögensbericht jetzt mit dokumentiert werden (analog zur Gesamtabrechnung im Dialog-Hilfetext)?  
2. Beim Vermögensbericht: nur **eine** Datei pro Liegenschaft — korrekt? (Kein Per-Eigentümer-Vermögensbericht.)