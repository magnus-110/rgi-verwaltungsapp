

# Plan: Verteilerschlüssel-Warnung + Code-Fix für Hausgeld-Großschreibung

Die Claude-Analyse ist fundiert und deckt sich mit dem, was wir im Code sehen. Davon kann ich **zwei Punkte sofort umsetzen** (Code-seitig). Die anderen sind reine Stammdaten-Lücken, die du in der UI pflegen musst — dafür liefern wir die Warnung.

## Was umgebaut wird

### A) Datei: `src/components/finance/BillingSettlement.tsx` — Warnung bei fehlenden Stammdaten

#### 1. Helper `getDistributionWarnings()`
Iteriert nach Berechnung über alle distributionsrelevanten Konten der Abrechnung und prüft:
- Hat das Konto einen Betrag ≠ 0?
- Liefert der Schlüssel verwertbare Anteile? (Personen-Anteile vorhanden, `heating_distribution_values` für die Periode vorhanden, MEA-Summe > 0)
- Wird der Konto-Anteil aller Eigentümer in Summe = 0, obwohl absTotal ≠ 0?

Gibt eine Liste `{ accountNumber, accountName, amount, distributionKey, reason }` zurück.

Mögliche `reason`-Werte:
- `"Kein Verteilerschlüssel hinterlegt"`
- `"Verteilerschlüssel 'personen', aber keine Personen-Anteile gepflegt"`
- `"Verteilerschlüssel 'heizkostenverordnung', aber keine Brunata-Werte für diese Periode"`
- `"Verteilerschlüssel 'mea', aber MEA-Summe = 0"`
- `"Unbekannter Verteilerschlüssel '<key>'"`

**Kein automatischer Fallback** auf MEA — Werte bleiben 0,00 €, damit nichts „still" falsch verteilt wird (Müll nach MEA wäre z. B. juristisch anfechtbar).

#### 2. UI: Warn-Banner über der Eigentümer-Tabelle
Direkt unter dem Abrechnungs-Header ein gelbes `Alert`-Panel mit `AlertTriangle`-Icon, sobald `getDistributionWarnings().length > 0`:

```
⚠ Verteilung unvollständig — 3 Konten werden nicht verteilt:
   • 1010 Müll (378,60 €) — Verteilerschlüssel 'personen' ohne Personen-Anteile
   • 1011 Papiertonne (27,84 €) — Verteilerschlüssel 'personen' ohne Personen-Anteile
   • 1431 Gerätemiete (389,54 €) — Verteilerschlüssel 'heizkostenverordnung' ohne Brunata-Werte
   
   → Verteilerschlüssel im Kontenrahmen oder per Building-Override anpassen, dann Abrechnung neu laden.
```

#### 3. CSV-Export: Warnblock
- **Gesamt-CSV**: Am Ende des Header-Blocks (vor der ersten Sektion) Warnzeilen einfügen.
- **Einzelabrechnungs-CSV**: gleicher Block am Anfang jeder Eigentümer-CSV.

Format:
```
WARNUNG;Folgende Konten konnten nicht verteilt werden:
;1010 Müll;378,60;Verteilerschlüssel 'personen' ohne Personen-Anteile
;1431 Gerätemiete;389,54;Verteilerschlüssel 'heizkostenverordnung' ohne Brunata-Werte
```

### B) Datei: `src/components/finance/BillingSettlement.tsx` — Code-Fix `cost_type` Case-Insensitive

`calcAnnual(types: string[])` macht aktuell exact-match auf `c.cost_type` → bei „Hausgeld" (groß) schlägt der Filter fehl, `totalVorschuss` = 0 → Abrechnungsspitze stimmt nicht. Fix: `c.cost_type?.toLowerCase()` gegen Lowercase-Liste vergleichen (deckt auch zukünftige Inkonsistenzen ab, ohne Daten anfassen zu müssen).

## Was Stammdaten-Pflege bleibt (nicht im Code lösbar)

Diese fünf Punkte aus der Claude-Analyse sind **bewusst keine Code-Änderungen**, weil sie buchhalterische Entscheidungen sind und je Liegenschaft variieren können:

| # | Lücke | Wo pflegen |
|---|---|---|
| 1 | 1010/1011 Verteilerschlüssel | Kontenrahmen oder `building_account_overrides` → MEA |
| 2 | 1431/1440 Verteilerschlüssel | Kontenrahmen oder `building_account_overrides` → MEA, `is_heating_relevant=false` |
| 3 | 1850/1860 `is_billing_relevant` | Kontenrahmen |
| 4 | Wirtschaftsplan 2025 mit `total_reserve = 3.600 €` | Wirtschaftsplan-Wizard |
| 5 | EWR-Jahresabrechnung 2025 auf 1050 buchen | Buchhaltung |

Die neue Warnung macht **Lücken 1, 2 und 4** sofort sichtbar, sodass du sie nicht mehr beim PDF-Vergleich entdecken musst.

## Konsistenz mit dem System
- Liest nur bereits geladene Daten (`sectionAccounts`, `personShares`, `heatingDistValues`, `meaShares`) — keine zusätzlichen Queries.
- Keine neue Berechnungslogik — nur Validierung der bestehenden Verteilung.
- UI, PDF und CSV bleiben automatisch synchron.

## Reihenfolge nach Approval
1. `calcAnnual` auf case-insensitive `cost_type` umstellen
2. Helper `getDistributionWarnings()` implementieren
3. Warn-Banner über der Eigentümer-Tabelle einbauen
4. Warnblock in `buildOverallCsvLines()` und `buildOwnerCsvLines()` ergänzen
5. Test: Birkenweg 6 / 2025 → Banner muss 1010/1011/1431/1440 listen, Abrechnungsspitze muss jetzt mit gezahltem Hausgeld rechnen

