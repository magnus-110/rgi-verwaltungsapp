# Problem

Für Tirolerstr. 142 (GJ 2025) weichen UI und PDF voneinander ab und beide sind rechnerisch unsauber:

| Stelle | Vorschuss (Soll) | Ausgaben | Spitze | Anzeige |
|---|---|---|---|---|
| UI (`BillingSettlement.tsx`) | 20.337,00 | **16.759,70** (zu niedrig — Rücklage fehlt) | 3.577,30 | „Guthaben" ✅ Vorzeichen, falscher Wert |
| Word-PDF (`buildBillingPayload.ts`) | 20.337,00 | **≈ 23.914,30** (Rücklage doppelt) | −3.577,30 | „Nachzahlung" ❌ Vorzeichen, falscher Wert |
| **Korrekt** | 20.337,00 | **20.509,70** | **−172,70** | „Nachzahlung" |

# Ursachen

1. **UI** baut `abrechnungssumme` aus `getSectionDistributable(...)` PLUS `totalReserve` (aus `economicPlan.total_reserve` ODER nur Konten `193x`).  
   → Wenn die IHR-Zuführung in der Sektion `reserve` auf einem Konto liegt, das nicht zu `193x` matcht (z. B. 1810/1820), oder zusätzlich in einer Operating-Sektion erscheint, fehlt sie / kommt unterzählt.
2. **PDF** (`buildBillingPayload.sumVerteilbar`) addiert ALLE Sektionen inkl. `reserve` über `is_distributable=true` — zählt damit die IHR ein zweites Mal mit, wenn `totalReserve` (aus `economicPlan`) sie schon in einer anderen Sektion abdeckt.
3. Beide Berechnungen sind voneinander unabhängig implementiert → Vorzeichen und Wert können auseinanderlaufen.

# Lösung

Eine **einzige** verbindliche Formel für die Abrechnungssumme, die in UI und PDF identisch verwendet wird:

```
abrechnungssumme = Σ |totalAbs| aller Konten mit is_distributable=true
                    aus den Sektionen { operating_distributable,
                                        operating_non_distributable,
                                        heating, reserve }
                  − totalReserveWithdrawal
```

- Plan-IHR (`193x` bzw. das Konto, das in der Sektion `reserve` liegt) wird **genau einmal** über die Sektion `reserve` gezählt.
- `economicPlan.total_reserve` wird nicht mehr ZUSÄTZLICH addiert (nur noch als Vergleichswert „Plan/Soll" angezeigt, nicht als Summand).
- Abgrenzungen bleiben nachrichtlich (unverändert).

```
abrechnungsspitze = (totalSollKostendeckung + totalSollEHR) − abrechnungssumme
```

Vorzeichenkonvention bleibt: `≥ 0 → Guthaben`, `< 0 → Nachzahlung`.

# Änderungen

### `src/components/finance/BillingSettlement.tsx`
- Neue Helper-Konstante `abrechnungssummeShared` exakt nach obiger Formel berechnen.
- `abrechnungssumme` und `abrechnungsspitze` auf diese Helper umstellen (alte Berechnung Zeile 559–564 ersetzen).
- Anzeige bleibt: „Abrechnungssumme (Gesamtkosten)" zeigt jetzt korrekt 20.509,70 €.

### `src/components/finance/lib/buildBillingPayload.ts`
- `sumVerteilbar` (Zeile 269–277) bleibt als Datenbasis, wird aber zentral als Quelle für die Abrechnungssumme verwendet.
- `totals.abrechnungssumme` und `totals.abrechnungsspitze` in `getTotals(...)` so anpassen, dass sie aus derselben `sumVerteilbar`-Logik kommen (gemeinsamer Helper, damit UI ↔ PDF nie wieder auseinanderlaufen).
- Word-Felder `abrechnungssaldo_soll*` und `abrechnungsspitze*` damit automatisch vorzeichengleich zur UI.

### Optionaler kleiner Refactor (empfohlen, low-risk)
- Helper `computeBillingTotals(sectionAccounts, totalReserveWithdrawal)` in `src/components/finance/lib/` extrahieren und sowohl in `BillingSettlement.tsx` als auch in `buildBillingPayload.ts` importieren. Verhindert Drift in Zukunft.

# Validierung

Nach Umsetzung erneut die Abrechnung 2025 der Tirolerstr. 142 öffnen und prüfen:

- UI „Abrechnungssumme (Gesamtkosten)" = **20.509,70 €**
- UI „Abrechnungsspitze (Nachzahlung)" = **172,70 €** (rot)
- PDF-Zeile „Nachzahlung der Eigentümer" = **172,70 €**
- Bestände unten (Giro 8.961,47 / IHR 15.443,14 / Heizöl 4.650,59 = 29.055,20 €) unverändert.

# Word-Vorlage

Deine Vorlage `Gesamtabrechnung_Vorlage_v2.docx` ist **korrekt** — sie nutzt bereits die richtigen Konditional-Tokens `{#abrechnungssaldo_soll_guthaben}` / `{#abrechnungssaldo_soll_nachzahlung}`. Das Vorzeichenproblem liegt zu 100 % in `buildBillingPayload.ts`, nicht in deinem DOCX. Nichts an der Vorlage muss geändert werden.
