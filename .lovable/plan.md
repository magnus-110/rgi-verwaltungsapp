## Problem

Im Kontenplan klickt der Nutzer auf eine Buchungszeile. Diese Zeile zeigt für die **Counter-Seite** das Vorzeichen bereits gedreht an (z. B. `−`, weil die Originalbuchung auf der primären Seite `+ income` ist).

`AccountPlanView.tsx` übergibt jetzt korrekt das `original` Buchungsobjekt aus der DB plus `_side`. **Aber:** `EditBookingDialog` initialisiert `form.booking_type` direkt aus `booking.booking_type` (also dem rohen DB-Wert) und ignoriert `_side`. Folge:

- Counter-Zeile zeigt `−`, Editor öffnet mit `+`.
- Beim Speichern dreht die bereits vorhandene Persistenz-Logik (`clickedSide === "counter"` → flip) den Wert zurück → das Vorzeichen wird ungewollt verändert, sobald der Nutzer speichert (auch wenn er nur den Text geändert hat).

Die Init-Seite und die Save-Seite sind also asymmetrisch.

## Fix (1 Datei)

`src/components/finance/EditBookingDialog.tsx`, Init-Effect (Zeilen 117–159):

Bei `clickedSide === "counter"` den `booking_type` für die Anzeige drehen, exakt symmetrisch zur Save-Logik:

```ts
const rawType = booking.booking_type
  ?? (Number(booking.amount) < 0 ? "income" : "expense");
const displayBookingType = clickedSide === "counter"
  ? (rawType === "income" ? "expense" : "income")
  : rawType;
```

Damit gilt:

| Klick-Seite | DB `booking_type` | Editor zeigt | Save persistiert |
|---|---|---|---|
| primary | income | + (income) | income |
| primary | expense | − (expense) | expense |
| counter | income | − (expense, gedreht) | income (zurückgedreht) |
| counter | expense | + (income, gedreht) | expense (zurückgedreht) |

→ Vorzeichen im Editor entspricht **immer exakt der angeklickten Zeile**, und Speichern ohne Vorzeichen-Änderung lässt den DB-Wert unverändert. Nur ein aktiver Wechsel des Vorzeichens im Editor ändert die Buchung.

## Keine weiteren Änderungen

- `AccountPlanView` bleibt wie es ist (übergibt bereits `original` + `_side`).
- Save-Logik bleibt wie sie ist (flip bei counter).
- Keine Aggregations-/DB-Änderungen.
