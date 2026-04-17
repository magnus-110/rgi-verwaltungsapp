

## Plan: §35a-Dialog erweitern – MwSt-Toggle, editierbare Positionen, Typ pro Position

### Befund
- Dialog-Code existiert in zwei Stellen (identische Logik): `TransactionReviewMode.tsx` (~Z. 1735–1813) und `EditBookingDialog.tsx` (~Z. 496–570).
- Aktuell:
  - MwSt wird automatisch aus `row.vat_rate` aufgeschlagen — kein Toggle, kein Override.
  - Positionen kommen aus `invoice.line_items` (OCR) und sind nur an-/abwählbar.
  - Kein Unterscheidung Handwerker- vs. Haushaltsnahe Dienstleistung pro Position.
- DB hat bereits: `bookings.amount_35a`, `bookings.line_items_detail` (jsonb) — beides nutzbar ohne Migration.
- `chart_of_accounts.settlement_35a_type` (`dienste` | `handwerker`) existiert für die Vorbelegung pro Konto.

### Änderungen im §35a-Dialog (beide Stellen)

**1. Typ pro Position (Handwerker / Dienstleistung)**
- Neben jeder ausgewählten Position ein kleiner Toggle/Pill-Switch:
  - `Handwerker` (blau) ↔ `Dienstleistung` (grün)
- Default kommt aus `chart_of_accounts.settlement_35a_type` des Kontos (oder Gegenkontos), sonst `dienste`.
- Wert wird in `line_items_detail[i].type_35a` gespeichert (`"dienste"` | `"handwerker"`).
- Lohnanteil im Footer wird nach Typ getrennt summiert und beides angezeigt:
  - „Handwerker: 128,25 €"
  - „Dienstleistung: 25,00 €"
  - Gesamt-Lohnanteil bleibt sichtbar.

**2. Editierbare Positionen**
- Beschreibung und Betrag jeder Position als kleine inline-Inputs, sobald die Position selektiert ist (sonst read-only).
- Plus-Button am Ende: „+ Position hinzufügen" (Free-Text, Betrag, Typ) — speichert in `line_items_detail` mit `index = lineItems.length + N`, Flag `is_custom: true`.
- Mülleimer-Icon zum Entfernen einer Custom-Position.
- Validierung: Betrag > 0 und Beschreibung nicht leer.

**3. MwSt-Toggle + Override**
- Eigene Sektion im Dialog unter den Positionen:
  - Checkbox/Switch „MwSt. auf Lohnanteil aufschlagen" (Default: an, wenn Rechnung MwSt enthält).
  - Daneben Auswahl `0%` / `7%` / `19%` / `Eigener Wert` (Input).
  - Default-Satz aus `invoice.vat_rate` bzw. `row.vat_rate`, bleibt aber unabhängig editierbar — wird in `line_items_detail._vat_meta` gespeichert (`{ apply_vat: bool, rate: number }`), damit es beim erneuten Öffnen erhalten bleibt.
- `amount_35a` wird live neu berechnet:
  - `apply_vat=false` → Summe Netto
  - `apply_vat=true` → Netto × (1 + rate/100)

**4. Persistenz beim Buchen**
- `bookings.line_items_detail` enthält dann pro Eintrag: `{ index, description, amount, is_35a, type_35a, is_custom? }` plus optional `_vat_meta` als letzten Eintrag.
- `bookings.amount_35a` weiterhin als Gesamtsumme (Brutto Lohnanteil) — wird vom PDF/§35a-Bescheinigungs-Workflow genutzt.
- Optional Phase 2: `generate-billing-pdf` so erweitern, dass es bei Vorhandensein von `line_items_detail[*].type_35a` daraus die Aufteilung Dienste/Handwerker pro Buchung liest, statt nur über `chart_of_accounts.settlement_35a_type` zu gehen. (Nicht zwingend in dieser Iteration, aber Datenstruktur ist vorbereitet.)

### Betroffene Dateien
| Datei | Änderung |
|---|---|
| `src/components/finance/TransactionReviewMode.tsx` | §35a-Dialog umbauen (Typ-Toggle, Edit-Inputs, Add/Remove, MwSt-Toggle) |
| `src/components/finance/EditBookingDialog.tsx` | Identische Änderung im zweiten Dialog |
| (optional Phase 2) `supabase/functions/generate-billing-pdf/index.ts` | line_items_detail.type_35a respektieren |

### Erwartetes Ergebnis
- Im §35a-Popup kann der Nutzer pro Position:
  - aus-/abwählen
  - Beschreibung + Betrag bearbeiten
  - zwischen Handwerker und Haushaltsnahe Dienstleistung umschalten
  - eigene Positionen hinzufügen
- MwSt-Aufschlag ist optional (Toggle) und Satz ist editierbar — Default kommt aus der Rechnung.
- Lohnanteil wird im Footer getrennt nach Handwerker/Dienstleistung sowie als Gesamt angezeigt.
- Auswahl bleibt persistent in `line_items_detail`.

