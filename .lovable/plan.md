## Drei Payload-Korrekturen für die Gesamtabrechnung

Alle Änderungen liegen in zwei Dateien, kein UI-Verhalten ändert sich:

- `src/components/finance/BillingSettlement.tsx`
- `src/components/finance/lib/buildBillingPayload.ts`

### 1. Anfangsbestand gesamt 9.266,59 € → 31.553,11 €

`openingTotal` (BillingSettlement.tsx Zeile 455) addiert die Werte signiert. Da z. B. `openingPrepay` oder `openingOther` negativ sein kann, kürzt sich die Bank+Rücklage+Brennstoff-Summe heraus.

Fix: Wie schon in der UI (Zeile 1298) Beträge betragsmäßig summieren:

```ts
const openingTotal =
  Math.abs(openingGiro) +
  Math.abs(openingReserve) +
  Math.abs(openingFuel) +
  Math.abs(openingPrepay) +
  Math.abs(openingOther);
```

Damit liefert `bestaende_anfang_gesamt` 11.143,26 + 20.129,14 + 280,71 = **31.553,11 €**. Dasselbe analog für `closingTotal` (Zeile direkt darunter), damit Endbestände konsistent sind.

### 2. Zinseinnahmen werden negativ ausgewiesen

In `buildBillingPayload.ts` `sectionListFromUi` (Zeilen 112–136) wird für die Income-Sektion `signed = a.total` durchgereicht. Bei Bank-zentrischer Buchung ist `total` für Income-Konten negativ (Bewegung auf der Bankseite). Deshalb erscheinen 50,59 € als −50,59 €.

Fix: Income-Sektion explizit als Ertrag (positiv) formatieren. Neue Option `asIncome` einführen oder beim Aufruf für `income` `signed = abs` erzwingen:

```ts
// in sectionListFromUi
if (opts.asIncome) signed = abs;
```

`einnahmen_full` und `einnahmen_nur_buchungen` mit `{ asIncome: true }` aufrufen. `betrag`, `betrag_ist`, `betrag_verteilbar` werden dadurch positiv (passend zu „Einnahmen").

### 3. Zwischensummen zeigen "undefined" + Verteilbar fehlt vorzeichenrichtig

Die Word-Vorlage rendert pro Sektion eine Zwischensumme mit drei Spalten (Plan / Ist / Verteilbar), aber das Payload liefert nur kombinierte Felder (`sum_bewirtschaftung_umlagefaehig` etc.) und ein einzelnes Aggregat über *alle* Sektionen. Dadurch sind die spaltenspezifischen Tags `undefined`, und die Verteilbar-Zwischensumme bekommt kein eigenes Vorzeichen.

Fix: Pro Ausgaben-Sektion drei dedizierte Felder ergänzen, jeweils negativ formatiert (Ist und Verteilbar als „−"-Beträge, Plan ebenfalls negativ wie in der UI):

```
sum_bewirtschaftung_plan / _ist / _verteilbar
sum_nicht_umlagefaehig_plan / _ist / _verteilbar
sum_heizkosten_plan / _ist / _verteilbar
sum_ruecklage_plan / _ist / _verteilbar
```

Berechnung pro Sektion:
- `_ist` = `−Σ |a.totalAbs|`
- `_plan` = `−Σ |a.wpAmount|`
- `_verteilbar`: nur Konten mit `is_distributable === true` (für `nicht_umlagefaehig` analog zur neuen UI-Filterung), als `−Σ |a.totalAbs|`

Die bestehenden kombinierten Felder (`sum_bewirtschaftung_umlagefaehig` etc.) bleiben für Rückwärtskompatibilität bestehen.

### Erwartetes Ergebnis im Payload/Dokument

| Position | vorher | nachher |
|---|---|---|
| `bestaende_anfang_gesamt` | 9.266,59 € | **31.553,11 €** |
| `bestaende_ende_gesamt` | (analog korrigiert) | korrekt |
| Zinseinnahmen-Zeile | −50,59 € | **+50,59 €** |
| Zwischensumme Bewirtschaftung Ist | undefined | **−18.712,21 €** |
| Zwischensumme Bewirtschaftung Verteilbar | undefined | **−18.712,21 €** |
| Zwischensumme Plan | undefined | korrekter Plan-Wert (negativ) |

Keine Änderung an Berechnungslogik (Spitze, Abrechnungssumme bleiben +2.029,10 € bzw. 30.916,90 €).
