# Manuelle Rechnungs-Zuordnung: Offene Rechnungen anzeigen

## Problem
Im Dialog "Manuelle Zuordnung" auf der Buchhaltung-Seite werden bei der Liegenschaft keine Rechnungen vorgeschlagen, obwohl welche existieren.

## Ursache
In `src/components/finance/BankStatementsTab.tsx` (Zeile 146–161) lädt die Query `invoices-for-assign` ausschließlich Rechnungen mit `status = 'paid'`. Datenbank-Check bestätigt: Es liegen 5 Rechnungen mit `status = 'open'` und 1 mit `status = 'credit_open'` vor — genau diese will der Nutzer einer Banktransaktion zuordnen, sie werden aber gefiltert.

## Lösung
Den `status='paid'`-Filter aus der Query entfernen. Damit werden alle Rechnungen der Liegenschaft als Zuordnungs-Kandidaten gelistet. Der bestehende Filter „bereits einer Transaktion zugewiesen" (`matched_invoice_id`) bleibt erhalten und greift weiterhin korrekt — eine bereits zugeordnete Rechnung erscheint nicht mehrfach.

Zusätzlich nehmen wir das `status`-Feld in den Select auf, damit es später (optional) im Dialog als kleines Badge angezeigt werden könnte. In diesem Schritt verändern wir die UI nicht.

## Änderungen
- `src/components/finance/BankStatementsTab.tsx`: Query `invoices-for-assign` — `eq("status", "paid")` entfernen, `status` zum SELECT hinzufügen.

## Nicht betroffen
- AssignmentDialog UI bleibt unverändert.
- Andere Stellen, die Rechnungen laden, werden nicht angefasst.
