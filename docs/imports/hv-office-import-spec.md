# HV-Office Import-Spezifikation für `bookings`

**Diese Datei MUSS jedem KI-Agenten (Claude, GPT, …) als Systemprompt mitgegeben werden, bevor er Buchungen aus HV-Office in die Supabase-Tabelle `bookings` schreibt.**

## Goldene Regel

> **Pro Geschäftsvorgang wird genau EINE Zeile in `bookings` angelegt — niemals zwei Spiegelzeilen.**

Die App ist bank-zentrisch: `account_id` und `counter_account_id` einer einzigen Zeile bilden zusammen den vollständigen Vorgang ab. Aggregator wie `sumForAccount` rechnen `account_id = +amount`, `counter_account_id = −amount`. Eine zweite Zeile mit vertauschten Konten würde **alle Salden verdoppeln**.

Ein DB-Trigger `trg_prevent_mirror_booking` lehnt Spiegelbuchungen ab und wirft `Spiegelbuchung erkannt …`. Beim Auftreten dieses Fehlers: Vorgang überspringen.

## Konvention für `account_id` / `counter_account_id`

### Bank-bezogene Vorgänge (mit `bank_transaction_id`)
- `account_id` = **Bankkonto** (i.d.R. `1800` Giro)
- `counter_account_id` = das Sachkonto (Kosten-, Personen-, Rücklagenkonto)
- `booking_type`:
  - `expense` = Geld geht vom Bankkonto ab (Zahlung an Lieferant, Auszahlung)
  - `income` = Geld geht auf das Bankkonto ein (HG-Eingang, Erstattung)
- `amount` = immer positiv

**Beispiel: Hausgeld 01/25 BARANIAK 370 €**
```
account_id = 1800 (Bank)
counter_account_id = 0001 (Personenkonto BARANIAK)
booking_type = income
amount = 370.00
booking_date = 2025-01-02
description = "HG 01/25 BARANIAK"
bank_transaction_id = <UUID der CAMT-Zeile>
```

**Beispiel: Allianz Wohngebäude Q2 955,23 €**
```
account_id = 1800
counter_account_id = 4250 (Versicherung)
booking_type = expense
amount = 955.23
```

### Interne Umbuchungen (ohne Bankbezug)
- `account_id` = **Soll-Seite** (Konto, das belastet wird)
- `counter_account_id` = **Haben-Seite** (Konto, das entlastet wird)
- `booking_type` = `expense` (Soll = Belastung der Account-Seite)
- `amount` = positiv

**Beispiel: Sollstellung Guthaben Abrechnung 2024 BARANIAK 949,58 €**
```
account_id = 0001 (Personenkonto wird belastet)
counter_account_id = 4020 (Erlöse Abrechnungsspitze)
booking_type = expense
amount = 949.58
description = "Sollstellung Guth. Abr. 2024 BARANIAK"
bank_transaction_id = NULL
```

**Beispiel: Rücklagenbildung 5.000 € (Bank → Rücklagenkonto)**
> Bank ist beteiligt → wie Bank-Vorgang behandeln, **eine** Zeile:
```
account_id = 1800
counter_account_id = 1300 (Instandhaltungsrücklage)
booking_type = expense
amount = 5000.00
```

## Pflichtfelder pro Zeile

| Feld | Wert |
|---|---|
| `building_id` | UUID des Gebäudes |
| `fiscal_year` | aus `booking_date` ableiten (`EXTRACT(YEAR …)`) |
| `booking_date` | Datum aus HV-Office |
| `amount` | **immer positiv**, max. 2 Nachkommastellen |
| `account_id` | siehe Konvention |
| `counter_account_id` | siehe Konvention |
| `booking_type` | `income` oder `expense` |
| `description` | Originaltext aus HV-Office |
| `source` | `'hv_office_import'` |
| `booking_reference` | HV-Office-Belegnummer falls vorhanden |
| `bank_transaction_id` | UUID falls verknüpfbar, sonst NULL |
| `status` | `'confirmed'` |

## Verboten

- ❌ Zwei Zeilen pro Vorgang („Soll" + „Haben" als separate Datensätze)
- ❌ Negative `amount`-Werte
- ❌ Vertauschen der Konten in einer zweiten Zeile zur „Bestätigung"
- ❌ `booking_type` = `'transfer'` o.ä. — nur `income` oder `expense`
- ❌ Felder leer lassen, wenn Daten vorhanden sind

## Validierung nach dem Import

```sql
-- Muss 0 ergeben
SELECT COUNT(*) FROM bookings a
JOIN bookings b ON b.id <> a.id
  AND b.building_id = a.building_id
  AND b.booking_date = a.booking_date
  AND b.amount = a.amount
  AND COALESCE(b.description,'') = COALESCE(a.description,'')
  AND b.account_id = a.counter_account_id
  AND b.counter_account_id = a.account_id
  AND b.booking_type <> a.booking_type
WHERE a.fiscal_year = <YEAR> AND a.building_id = '<UUID>';
```

Wenn > 0: Spiegelbuchungen entstanden → sofort untersuchen und löschen.
