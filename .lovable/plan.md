## Ziel

In der Kassenprüfung soll bei Splitbuchungen direkt unter der „Betrag"-Zeile sichtbar werden, dass es sich um eine Splitbuchung handelt, wie hoch der Gesamtbetrag der Originalbuchung ist und welche anderen Teile zur selben Splitgruppe gehören. Die anderen Splits werden leicht ausgegraut (Opacity ~38%) angezeigt, damit der aktuelle Split optisch dominiert.

## Wo

Datei: `src/components/finance/BookingReviewDialog.tsx` (das ist das Vollbild-Detail, das beim Klick auf eine Buchung in der Kassenprüfung geöffnet wird – `CashAuditAccountSheet` / `CashAuditJournal` öffnen genau diesen Dialog).

## Erkennung einer Splitbuchung

Eine Buchung gehört zu einer Splitgruppe, wenn `split_parts_total > 1`. Die Geschwister teilen sich dieselbe `invoice_id`. Felder existieren bereits in `bookings`:
- `split_part` (Position innerhalb der Gruppe, 1-basiert)
- `split_parts_total` (Anzahl Teile)
- `invoice_id` (gemeinsamer Anker)

## Datenbeschaffung

In `BookingReviewDialog` zusätzliche Query (über `useEffect` analog zur PDF-Logik), die nur läuft wenn `booking.split_parts_total && booking.split_parts_total > 1 && booking.invoice_id`:

```ts
supabase
  .from("bookings")
  .select(`
    id, booking_date, amount, booking_type, description, split_part,
    chart_of_accounts:account_id(account_number, account_name),
    counter_account:counter_account_id(account_number, account_name)
  `)
  .eq("invoice_id", booking.invoice_id)
  .order("split_part", { ascending: true });
```

Aus dem Ergebnis abgeleitet:
- `total = Σ amount aller Geschwister` (Gesamtbetrag der Originalbuchung)
- Liste der Geschwister sortiert nach `split_part`

Damit die Query funktioniert, muss `invoice_id`, `split_part`, `split_parts_total` zur `AuditBookingRow`-Schnittstelle ergänzt und in den `select`-Statements von `CashAuditAccountSheet.tsx` und `CashAuditJournal.tsx` mitgeladen werden (`split_part`, `split_parts_total` ergänzen – `invoice_id` ist bereits vorhanden).

## UI-Darstellung

Direkt unter der `Row label="Betrag"`-Zeile (Zeile 111–115) wird eine zusätzliche Zelle in dieselbe `divide-y`-Box eingefügt, sichtbar nur bei Splitbuchungen:

```
┌─ Betrag ───────────────────── −48,79 € ─┐
│ Splitbuchung 2 von 5 · Gesamt: 1.043,87 €│
│   Teil 1 · 1110 Verbrauchsmaterial …  −48,79 € │  ← aktueller Teil, normal
│   Teil 2 · 4210 Hausreinigung …      −250,00 €│  ← ausgegraut (opacity-[0.38])
│   Teil 3 · 4250 Gartenpflege …       −400,00 €│  ← ausgegraut
│   …                                              │
└──────────────────────────────────────────┘
```

Konkret:
- Eine neue `Row`-Variante (oder ein eigener Block in der Card) mit Label „Splitbuchung" und Wert „X von Y · Gesamt: <fmt(total)>".
- Darunter eine kompakte Liste aller Geschwister: Pro Zeile `Teil N · <Konto-Nr> <Konto-Name> · <±Betrag>`.
- Aktiver Teil (`sibling.id === booking.id`): normale Textfarbe, leicht hervorgehoben (`font-medium`).
- Andere Teile: Wrapper mit `opacity-[0.38]` (entspricht 38%).
- Vorzeichen/Farbe je Geschwister analog zur Hauptanzeige berechnen (`booking_type === "income"` → grün/+, sonst rot/−). Reine Frontend-Anzeige, keine Save-Logik.

Tabelleneintrag in der bestehenden `divide-y`-Card statt separatem Block, damit die Optik konsistent bleibt.

## Edge Cases

- `split_parts_total === 1` oder `null` → komplette Splitsektion wird nicht gerendert (kein Verhalten an bestehenden Buchungen).
- Keine `invoice_id` aber `split_parts_total > 1` (theoretisch) → fällt zurück auf reinen Hinweistext „Splitbuchung X von Y" ohne Geschwister-Liste.
- Loading-State: solange Geschwister geladen werden, wird die Hinweiszeile gerendert, die Liste wird per dezentem „Lade Splitteile…" Skeleton ersetzt.

## Nicht im Scope

- Keine Änderungen an `BookingsTab` (separate Ansicht).
- Keine DB-Migrationen, keine Aggregations-/Save-Logik.
- Keine Anpassung in `BookingReviewMode` (separate Komponente).
