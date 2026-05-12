## Problem

In der Maske **Buchhaltung → Buchungen → "Neue Buchung"** (`CreateBookingDialog`) funktioniert der Buchungstext-Generator korrekt:
- Periode (z. B. `09/25`) wird **nur** über das Kürzel-Feld der `BookingTextTemplateCombobox` eingefügt (1, 01–12, 000) — niemals automatisch aus dem Beleg-Datum.
- Unter dem Eingabefeld steht ein Hinweis: *Format: Buchungskürzel Gegenkonto Lieferant Re. Nr.*
- Im Eingabefeld ist ein Beispiel-Placeholder.

In der Maske **Buchhaltung → Kontoauszüge → Buchen** (`TransactionReviewMode`) gibt es zwei Probleme:
1. **Bug**: Der Buchungstext bekommt automatisch ein Perioden-Präfix aus `booking_date` (`formatMonthYearRef(...)`) injiziert — an mehreren Stellen (`buildAutoTextForRow`, `updateRow`, `applySelectionToRow`, `onAssignInvoice`, `createNewBookingFromSelection`). Das erzeugt unerwünschte/falsche Präfixe und weicht vom Verhalten der anderen Maske ab.
2. **Hinweis fehlt**: Weder Format-Hinweis noch Beispiel-Placeholder werden angezeigt.

## Lösung — Logik aus `CreateBookingDialog` übernehmen

### 1. Periode nicht mehr automatisch setzen
In `src/components/finance/TransactionReviewMode.tsx` an allen Aufrufen von `buildBookingText` / `rebuildBookingTextIfAuto` für Buchungstext-Generierung `period` auf `null` setzen (statt `formatMonthYearRef(...)`):

- `buildAutoTextForRow` (≈Zeile 758)
- `updateRow` Auto-Rebuild-Block (≈Zeile 786)
- `applySelectionToRow` (≈Zeile 832)
- `createNewBookingFromSelection` (≈Zeile 876–883)
- `onAssignInvoice` (≈Zeile 1762 + 1769)
- ggf. weitere Stellen mit `formatMonthYearRef` im Kontext eines Buchungstext-Builds (Zeilen 492, 576, 700)

Die Periode kommt dann ausschließlich vom Nutzer über die `BookingTextTemplateCombobox` (Kürzel `01`–`12`, `1`–`4`, `000`) — exakt wie in `CreateBookingDialog`.

### 2. Format-Hinweis + Placeholder ergänzen
In `TransactionReviewMode.tsx` im Buchungstext-Block (≈Zeilen 2393–2411):
- `placeholder="z. B. 09/25 Hausmeister Markus Gschwend, Re. Nr. 8824748"` am `Input`-Feld
- Unterhalb des Grids ein `<p>` mit dem Hinweis-Text (1:1 wie in `CreateBookingDialog` Zeilen 437–439):
  *"Format: Buchungskürzel Gegenkonto Lieferant Re. Nr."*

### 3. Keine sonstigen Änderungen
Andere Logik (Vendor-Resolve, Rechnungs-Zuordnung, Vorlagen-Buchungstext via `buildTemplateBookingText`) bleibt unverändert. Es geht ausschließlich um Angleichung des Buchungstext-Generators.

## Betroffene Dateien
- `src/components/finance/TransactionReviewMode.tsx` (einzige Datei)

## Validierung
- Build / TS-Check
- Manuell im Preview: Bank-Transaktion buchen → Buchungstext zeigt nur `Gegenkonto Lieferant, Re. Nr. …`; Periode erscheint erst nach Eingabe `01` ↵ im Kürzel-Feld; Hinweis sichtbar.
