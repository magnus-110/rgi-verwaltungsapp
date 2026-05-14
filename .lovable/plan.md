## Ziel

`buildOwnerPayload` in `src/components/finance/lib/buildBillingPayload.ts` so erweitern, dass die Einzelabrechnung 1:1 die Struktur des Referenz-PDFs (HV-Office) abbildet. Keine Berechnungslogik in `BillingSettlement.tsx` ändern – nur das Payload-Mapping ergänzen.

## Änderungen pro Payload-Bereich

### 1. Sektionen-Struktur (`groupOrder`)

```text
income                       → "Einnahmen"
operating_distributable      → "umlagefähige Beträge" (inkl. Heizkosten 1400)
operating_non_distributable  → "nicht umlagefähige Beträge"
reserve                      → "Zuweisung und Entnahme aus der Rücklage"
```

- `heating`-Sektion wird in `operating_distributable` gemerged (Heizkonten erscheinen als normale Zeile mit Verteiler „Heizk.Abr").
- `income` wird neu aufgenommen, immer angezeigt (ggf. mit 0,00 EUR Eigentümeranteil).

### 2. Pro Sektion (`sektionen`-Loop)

Felder pro Sektion:
- `{sektion}` – Name
- `{#zeilen}…{/zeilen}` – Zeilenloop
- `{zwischensumme_gesamt}` – Σ verteilungsrelevant über alle Zeilen (negativ bei Ausgaben)
- `{zwischensumme_ihre_kosten}` – Σ ownerCost (negativ bei Ausgaben)
- `{zwischensumme}` – bleibt als Alias zu `zwischensumme_ihre_kosten` (Rückwärtskompatibilität)

### 3. Pro Zeile (`zeilen`-Loop)

Bestehende Felder bleiben, eines wird umgemappt:
- `{verteiler}` – jetzt HV-Office-Label statt distKey

| distKey | Label |
|---|---|
| `mea` | Ges.Tausendstel |
| `einheit` | Einheiten |
| `qm` | qm |
| `stellplaetze` | TG-Stellplätze |
| `personen` | Personen |
| `heizk_abr` | Heizk.Abr |

### 4. Top-Level: Abrechnungssumme + Vorschuss zweispaltig

| Feld | Bedeutung |
|---|---|
| `sum_abrechnung_gesamt` | Σ aller Sektionen Gesamt (negativ) |
| `sum_abrechnung_ihre` | totalOwnerCost (negativ) |
| `sum_vorschuss_wp_gesamt` | Soll-Vorschuss WEG-weit (Kostendeckung + EHR) |
| `sum_vorschuss_wp_ihre` | Soll-Vorschuss Eigentümer (hausgeld + reserve) |

Bestehende `sum_abrechnung`, `sum_vorschuss` bleiben als Aliase.

### 5. Abrechnungsspitze-Zeile

| Feld | Bedeutung |
|---|---|
| `abrechnungsspitze_gesamt` | totals.abrechnungsspitze (Soll-Vorschuss − abrechnungssumme) |
| `abrechnungsspitze_ihre` | owner.result-Anteil aus Soll (nicht IST) |
| `abrechnungsspitze_label` | „GH" oder „NZ" |
| `abrechnungsspitze_guthaben` / `_nachzahlung` | bool für conditional Word-Blöcke |

### 6. Neuer Block „zusätzliche Informationen"

| Feld | Bedeutung |
|---|---|
| `vorschuss_ist_gesamt` | tatsächlich gezahlte Vorschüsse WEG (Personenkonten) |
| `vorschuss_ist_ihre` | totalPaid des Eigentümers |
| `ueberzahlung_wpl_gesamt` | totals.totalUeberzahlung (>0) |
| `ueberzahlung_wpl_ihre` | owner.totalPaid − (owner.hausgeld + owner.reserve), wenn > 0 |
| `has_ueberzahlung` | bool (Gesamt > 0,005) für conditional Block |
| `abrechnungssaldo_gesamt` | Spitze + Überzahlung (WEG) |
| `abrechnungssaldo_ihre` | Spitze + Überzahlung (Eigentümer) = owner.result |
| `abrechnungssaldo_label` | „GH" / „NZ" |
| `abrechnungssaldo_guthaben` / `_nachzahlung` | bool |

### 7. Format-Helper

- `fmtEUR` liefert weiterhin „1.234,56 €" – wir lassen das, da sich der User noch nicht auf „EUR"-Suffix festgelegt hat. Wenn gewünscht, kleiner zusätzlicher `fmtEURText`-Helper möglich.

## Nicht im Scope

- Belegnummer-Generierung (User hat keine Antwort gegeben → vorerst nicht).
- Layout/Word-Vorlage selbst – das sind nur Payload-Felder, der User pflegt die Vorlage selbst.
- `BillingSettlement.tsx`-Berechnung bleibt unverändert.

## Aus Gesamtabrechnung übernommene Patterns

1. **Pro-Sektion-Subtotale** als dedizierte Felder (wie `sum_bewirtschaftung_plan/_ist/_verteilbar`) – hier `_gesamt/_ihre_kosten`.
2. **Klartext-Labels** statt distKey für `verteiler` (war in Gesamtabrechnung schon korrekt).
3. **GH/NZ-Booleans** für conditional Word-Blöcke (`{#abrechnungsspitze_guthaben}…{/}`).
4. **Spitze ≠ Saldo**: Spitze nutzt nur Soll-Vorschuss, Saldo ergänzt um Überzahlung – exakt wie wir es in Gesamtabrechnung konsolidiert haben.
5. **Aliase erhalten** für bestehende Vorlagen (`sum_abrechnung`, `sum_vorschuss`, `zwischensumme`).
6. **Werte einmal berechnet, mehrfach geliefert** – keine Logik in der Word-Vorlage.

## Erwartetes Ergebnis

Nach Implementierung kann der User in seiner Einzelabrechnungs-Vorlage folgende neue Platzhalter verwenden, die dem Referenz-PDF exakt entsprechen:

```text
{#sektionen}
  {sektion}
  {#zeilen}{konto_nr} {konto_name} {verteilungsrelevant} {verteiler}
           {gesamt_anteil} {ihr_anteil} {ihre_kosten}{/zeilen}
  Zwischensumme  {zwischensumme_gesamt}   {zwischensumme_ihre_kosten}
{/sektionen}

Abrechnungssumme                {sum_abrechnung_gesamt}   {sum_abrechnung_ihre}
Vorschussverpflichtung WP       {sum_vorschuss_wp_gesamt} {sum_vorschuss_wp_ihre}
Abrechnungsspitze ({abrechnungsspitze_label})   {abrechnungsspitze_gesamt} {abrechnungsspitze_ihre}

zusätzliche Informationen
Vorschussverpflichtung IST      {vorschuss_ist_gesamt}    {vorschuss_ist_ihre}
{#has_ueberzahlung}Überzahlung WPL  {ueberzahlung_wpl_gesamt} {ueberzahlung_wpl_ihre}{/has_ueberzahlung}
Abrechnungssaldo ({abrechnungssaldo_label})  {abrechnungssaldo_gesamt} {abrechnungssaldo_ihre}
```
