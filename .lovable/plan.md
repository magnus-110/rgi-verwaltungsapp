
## Ziel

Die neue Sammelbericht-Vorlage (`RGI_WEG_Jahresbericht_v2_template.docx`) verwendet andere Platzhalter-Namen als die bisherigen Einzel-Vorlagen. Wir passen **nur** den im Sammelbericht-Renderer zusammengebauten Payload an, **ohne** die bestehenden Einzel-Templates (Gesamt-/Einzelabrechnung, §35a, Wirtschaftsplan, Vermögensbericht) zu brechen.

## Hintergrund

`BillingSettlement.tsx → downloadCombined()` sammelt 6 Sub-Payloads:

```
{
  ...common (Top-Level fürs Deckblatt),
  abrechnung_gesamt:      buildOverallPayload(...),
  abrechnung_einzel:      buildOwnerPayload(...),
  vermoegen:              buildAssetReportPayload(...),
  wirtschaftsplan_gesamt: buildOverallPlanPayload(...),
  wirtschaftsplan_einzel: buildOwnerPlanPayload(...),
  p35a:                   generate-35a-docx (payloads_only),
}
```

Docxtemplater löst Variablen innerhalb eines Scopes automatisch nach oben auf (parent-scope-fallback ist eingebaut), d. h. `{wirtschaftsjahr}` funktioniert sowohl im Top-Level als auch innerhalb `{#abrechnung_gesamt}…{/}`. Wir müssen lediglich die Feldnamen vereinheitlichen.

## Was gemacht wird

### 1. Neue Helper-Datei `src/components/finance/lib/remapCombinedPayload.ts`

Reine Mapping-Funktionen — werden ausschließlich vom Sammelbericht-Aggregator aufgerufen, die ursprünglichen `buildOverallPayload` / `buildOwnerPayload` / `buildAssetReportPayload` / `buildOverallPlanPayload` / `buildOwnerPlanPayload` bleiben unverändert (Einzel-Downloads weiter funktionsfähig).

Funktionen:
- `remapCommon(src)` — Deckblatt-Felder
- `remapAbrechnungGesamt(src)`
- `remapAbrechnungEinzel(src)`
- `remapVermoegen(src)`
- `remapP35a(src)`
- `remapWirtschaftsplanGesamt(src)`
- `remapWirtschaftsplanEinzel(src)`

Jede Funktion erhält das bestehende Sub-Payload und ergänzt die neuen Aliase, **ohne** die alten Felder zu entfernen — so bleibt die Vorlage rückwärtskompatibel.

### 2. Konkrete Renames / Aliase

**Deckblatt (Top-Level + in jeden Sub-Payload injiziert)**

| Neu | Quelle (alt) |
|---|---|
| `gebaeude_name` | `building_name` ∥ `gebaeude_name` (existiert schon) |
| `gebaeude_adresse` | `building_address` ∥ `gebaeude_adresse` |
| `datum_heute` | `erstell_datum` ∥ `erstellt_am` ∥ `created_at` |
| `abrechnungszeitraum_von` | `periode_von` ∥ `period_from` |
| `abrechnungszeitraum_bis` | `periode_bis` ∥ `period_to` |
| `wirtschaftsjahr` | `fiscal_year` ∥ `wirtschaftsjahr` |

**Vermögensbericht (`{#vermoegen}`)**

In `carry_accounts` / `liquide_mittel`-Items zusätzlich:
- `konto_name` ← bereits vorhanden (keine Änderung nötig)
- `endbestand` ← Alias zu `betrag` (Items)

Plus Top-Level:
- `bestaende_ende` ← Alias zu `sum_liquide_mittel`

**Einzelabrechnung (`{#abrechnung_einzel}`)**

In `sektionen[]`:
- `bezeichnung` ← Alias zu `sektion`

In `sektionen[].zeilen[]`:
- `verteiler` ← bereits vorhanden (keine Änderung nötig)
- (HINWEIS: das frühere `verteilungsrelevant` bleibt als zusätzliches Feld erhalten — Vorlage verwendet jetzt `verteiler`, beide existieren parallel)

**§35a (`{#p35a}`)**

In `positionen_dienste[]` und `positionen_handwerker[]`:
- `ihre_kosten` ist bereits korrekt belegt (siehe `generate-35a-docx/index.ts` Zeilen 345/352) — keine Änderung nötig.

Top-Level:
- `datum_heute` ← Alias zu `erstell_datum`

**Wirtschaftsplan Gesamt + Einzel (`{#wirtschaftsplan_gesamt|einzel}`)**

Top-Level Aliase ergänzen:
- `wirtschaftsjahr` ← `fiscal_year`
- `abrechnungszeitraum_von` ← `period_from`
- `abrechnungszeitraum_bis` ← `period_to`
- `gebaeude_name` ← `building_name` (existiert schon, nur sicherstellen)
- `summe_plan` ← `total_planned`

### 3. Offene Punkte aus Claudes Liste — Mapping

Wir füllen die noch fehlenden Variablen aus bereits berechneten UI-Werten:

**Gesamtabrechnung-Scope:**
- `bank_anfangsbestand`, `bank_endbestand`, `ruecklage_*`, `brennstoff_*`, `bestaende_anfang_gesamt`, `bestaende_ende_gesamt` — **sind bereits in `buildOverallPayload`** (Zeilen 342–353), gehören damit in `abrechnung_gesamt.*`. Wir spiegeln sie zusätzlich nach `vermoegen.*`, damit sie in beiden Scopes funktionieren.
- `sum_einnahmen_inkl_vorschuss` — bereits vorhanden (Z. 282).
- `sum_bewirtschaftung_plan` etc. — bereits vorhanden (Z. 291–302).
- `sum_vorschuss` — bereits vorhanden (Z. 328).

**Einzelabrechnung-Scope:** alle aufgelisteten Variablen (`abrechnungssaldo_*`, `sum_abrechnung_gesamt/ihre`, `sum_vorschuss_wp_gesamt/ihre`, `has_ueberzahlung`, `ueberzahlung_wpl_*`, `zwischensumme_gesamt/ihre_kosten`) sind in `buildOwnerPayload` (Z. 470–500, 422–423) bereits vorhanden — kein Mapping nötig.

**Vermögensbericht-Scope:** `sum_guthaben_nachzahlung`, `sum_abgrenzung`, `sum_forderungen`, `sum_verbindlichkeiten`, `vermoegensstand_gesamt` — alle bereits in `buildAssetReportPayload` (Z. 621–627). `bestaende_ende` ergänzen wir als Alias auf `sum_liquide_mittel`.

**§35a-Scope:** `summe_dienste`, `summe_handwerker`, `bescheinigung_nr`, `tage`, `einheit_lage`, `empfaenger_strasse/plz/ort` — alle bereits in `generate-35a-docx → buildVarsFor` (Z. 374–391).

**Wirtschaftsplan-Scope:** `owner_total`, `owner_reserve_monthly`, `owner_hausgeld_monthly` — bereits in `buildOwnerPlanPayload` (Z. 738, 745, 747). `total_amount/your_amount/total_share/your_share/change_percent` — bereits in `accountsList`-Items (Z. 700–706, 659).

### 4. Wiring in `BillingSettlement.tsx → downloadCombined()` (≈ Z. 1196–1217)

Statt der rohen Sub-Payloads laufen sie durch die Remap-Funktionen, Common wird in jeden Sub-Payload injiziert:

```ts
const common = remapCommon({ ...pickCommon(o.payload), ...pickCommon(p.overall) });

return {
  kind: "owner",
  ownerId: o.assignmentId,
  ownerName: o.name,
  payload: {
    ...common,
    abrechnung_gesamt:      { ...common, ...remapAbrechnungGesamt(p.overall) },
    abrechnung_einzel:      { ...common, ...remapAbrechnungEinzel(o.payload) },
    vermoegen:              { ...common, ...remapVermoegen(p.asset_report) },
    wirtschaftsplan_gesamt: { ...common, ...remapWirtschaftsplanGesamt(p.economic_plan_overall) },
    wirtschaftsplan_einzel: { ...common, ...remapWirtschaftsplanEinzel(ep?.payload) },
    p35a:                   { ...common, ...remapP35a(p35?.payload) },
  },
};
```

### 5. Was NICHT geändert wird

- Renderer (`generate-billing-document/index.ts`) bleibt unverändert — er rendert generisch.
- `buildOverallPayload`, `buildOwnerPayload`, `buildAssetReportPayload`, `buildOverallPlanPayload`, `buildOwnerPlanPayload`, `generate-35a-docx/buildVarsFor` bleiben unverändert — alte Einzel-Vorlagen funktionieren weiter.
- Keine DB-Änderung, keine neue Edge Function.

### 6. Hinweise an User aus Claudes Liste, die wir nicht im Code lösen

- **Einzelabrechnung-Detail-Tabelle 5-spaltig vs. Payload 2-spaltig:** Strukturelle Anpassung muss in der Word-Vorlage selbst erfolgen — das Payload liefert pro Sektion bereits `zeilen[]` mit `konto_nr`, `konto_name`, `verteiler`, `gesamt_anteil`, `ihr_anteil`, `ihre_kosten` (Z. 414–420). Die 5 Spalten lassen sich daraus mappen.
- **Vermögensbericht 5 Sektionen → 1 `{#carry_accounts}`:** Die ursprünglichen 5 Listen (`liquide_mittel`, `guthaben_nachzahlung`, `abgrenzung`, `forderungen`, `verbindlichkeiten`) liegen weiterhin im Payload — falls Claude die 5 Header behalten will, kann er die einzelnen Loops weiter nutzen.

## Technische Details

- **Datei neu:** `src/components/finance/lib/remapCombinedPayload.ts` (~150 Zeilen)
- **Datei geändert:** `src/components/finance/BillingSettlement.tsx` (Block Z. 1185–1217: Items-Map durch Remap-Pipeline ersetzen)
- **Keine** Änderung an `buildBillingPayload.ts`, `ManualEconomicPlanEditor.tsx`, `generate-35a-docx`, `generate-billing-document`.
