## Problem

Im Kontenabgleich (Finanzen → Buchhaltung → Kontenabgleich) stimmen die Buchhaltungs-Salden nicht mit der Realität überein. Zwei Bugs in der Datenbank-Funktion `calculate_account_balance_at`, die Anfangs- und Endsaldo aus den Buchungen berechnet:

### Bug 1 — Falsches Vorzeichen für Bankkonten

Die Funktion nutzt heute:
```
WHEN account_id = p_account_id THEN +amount
WHEN counter_account_id = p_account_id THEN -amount
```

Das ist das **Gegenteil** der bank-zentrischen Konvention, die der Rest der App nutzt (`sumForAccount` in `src/components/finance/lib/bookingAggregation.ts`, Memory „Bank-Centric Booking Logic"):

> Buchungen werden bank-zentrisch erfasst (Bank 1800 als Hauptkonto). `account_id`-Seite zählt +amount, `counter_account_id`-Seite zählt −amount.

Konkretes Beispiel aus den echten Buchungen (01.01.2025):
- Eröffnungsbuchung: `account_id = 4000 (Eröffnung)`, `counter_account_id = 1800 (Bank)`, `amount = 11.143,26`
- Korrekt für 1800: **+11.143,26 €** Anfangsbestand
- RPC liefert: **−11.143,26 €** ❌

Dasselbe Vorzeichenproblem trifft alle Bewegungen während des Monats und führt damit auch zu einem falschen Endsaldo.

### Bug 2 — Anfangssaldo schließt Eröffnungsbuchungen aus

Der Dialog ruft die RPC für den **Vortag** auf (`prevDay = 31.12.2024`) und filtert mit `booking_date <= p_date`. Eröffnungsbuchungen vom 01.01. (Anfangsbestand zum 01.01.2025) liegen **nach** diesem Datum und werden deshalb beim Anfangssaldo Januar weggelassen → Anfangssaldo lt. Buchhaltung = 0 € statt korrekt 11.143,26 €.

Im Code-Kommentar steht zwar „last day of previous month", die Eröffnung gehört aber per Definition zum Anfangsbestand des neuen Jahres.

## Lösung

### 1. RPC `calculate_account_balance_at` neu fassen (Migration)

```sql
CREATE OR REPLACE FUNCTION public.calculate_account_balance_at(
  p_account_id uuid, p_building_id uuid, p_date date
) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN b.account_id = p_account_id         THEN  b.amount  -- bank-zentrische Konvention
      WHEN b.counter_account_id = p_account_id THEN -b.amount
      ELSE 0
    END
  ), 0)
  FROM public.bookings b
  WHERE b.building_id = p_building_id
    AND b.booking_date <= p_date
    AND b.status <> 'cancelled'                 -- stornierte Buchungen ignorieren
    AND (b.account_id = p_account_id OR b.counter_account_id = p_account_id);
$$;
```

Wichtig: Die Vorzeichen-Konvention ist **identisch** zu `sumForAccount` aus `src/components/finance/lib/bookingAggregation.ts` und zur AccountPlanView/BookingsTab. Damit zeigen Kontenabgleich, Kontenplan und Vermögensbericht endlich dieselben Zahlen.

Zusätzlich: `status <> 'cancelled'` entspricht der Filterung in `BankReconciliationTab` selbst (Zeile 96).

### 2. Anfangssaldo-Datum korrigieren (`BankReconciliationTab.tsx`)

Statt RPC mit Vortag aufzurufen und damit Eröffnungen vom 01.01. zu verlieren, fragen wir den Anfangssaldo als **Saldo bis Vortag plus alle Eröffnungsbuchungen (gegen Konto 4000) am Monatsersten** ab. Praktisch am einfachsten: zwei zusätzliche Saldenpunkte berechnen.

Konkret im Dialog:
- `openingBook = balance(letzter Tag Vormonat) + Σ Eröffnungsbuchungen (4000) am 1. Tag des Monats auf diesem Konto`
- `closingBook = balance(letzter Tag des Monats)` — bleibt wie bisher, ist nach Bugfix 1 dann korrekt

Implementierung: Wir lassen die RPC für den Endsaldo, holen für den Anfangssaldo aber zusätzlich gezielt die Eröffnungsbuchungen via `supabase.from('bookings').select(...)` für dieses Bankkonto am 1. des Monats, die gegen Konto 4000 laufen. Das ist deckungsgleich mit `getEffectiveOpeningBalance` aus `bookingAggregation.ts` (Memory „Anfangsbestand-Quellen").

Alternative (sauberer): Eine neue RPC `calculate_account_opening_balance_at(account, building, year, month)`, die intern beides bündelt. Wir gehen den client-seitigen Weg, weil es nur ein Aufrufer ist und kein neues SQL-Objekt nötig wird.

### 3. Sanity-Anzeige im Dialog

Im Vergleichs-Block zusätzlich die **Differenz Anfangssaldo** anzeigen (heute wird `openingDiff` berechnet, aber nicht gerendert) — sonst sieht der Nutzer den Endwert grün, obwohl der Monat auf einem falschen Anfangssaldo basiert.

## Betroffene Dateien

- `supabase/migrations/<neu>.sql` — RPC `calculate_account_balance_at` neu (Vorzeichen + cancelled-Filter)
- `src/components/finance/BankReconciliationTab.tsx` — Anfangssaldo inkl. Eröffnungsbuchungen am 1., zusätzliche Anfangssaldo-Differenz im UI
- Keine weiteren Aufrufer der RPC (nur dieser Tab nutzt sie)

## Verifikation nach dem Fix

Beispiel WEG mit Buchungen vom 01.01.2025 (`account_id=4000, counter=1800, amount=11.143,26`):
- Vor Fix: Januar-Anfangssaldo Bank 1800 = 0 €, Endsaldo mit verkehrtem Vorzeichen
- Nach Fix: Januar-Anfangssaldo = +11.143,26 €, Endsaldo entspricht Kontenplan/AccountPlanView

Manueller Check: Im Kontenabgleich Januar öffnen → Anfangssaldo lt. Buchhaltung muss exakt dem Eröffnungsbetrag (Konto 4000 ↔ 1800) entsprechen, identisch zum Wert in „Buchen → Kontenplan" für Konto 1800 zum 31.01.