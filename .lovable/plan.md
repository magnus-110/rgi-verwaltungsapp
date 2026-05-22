# Fix: Gesamtabrechnung – Verteilbar-Spalte, Vorzeichen, Abrechnungssaldo

## Analyse der drei Bugs

Alle drei Fehler liegen in `src/components/finance/lib/buildBillingPayload.ts` (`buildOverallPayload`). Die UI-Berechnung in `BillingSettlement.tsx` ist bereits korrekt – das PDF/DOCX-Payload weicht ab.

### Bug 1 – Nicht verteilungsrelevante Konten zeigen trotzdem einen „Verteilbar"-Betrag
`sectionListFromUi()` (Z. 134–137) setzt `betrag_verteilbar` IMMER aus `abs`, auch wenn `is_distributable=false`. Dadurch erscheinen Kapitalertragsteuer (12,65 €) und Soli (0,69 €) in der „nicht_umlagefaehig"-Liste mit einem Verteilbar-Wert, obwohl sie zu Recht nicht in der Verteilbar-Summe (7.240,68 €) enthalten sind. → Wenn `a.is_distributable !== true`, muss `betrag_verteilbar` leer (`"–"`) sein.

### Bug 2 – Vorzeichen der Verteilbar-Beträge & Zwischensummen
- In `sectionListFromUi` ist `verteilbar` zwar `-Math.abs(...)` für `asExpense` (Z. 135) – jedoch verwenden viele DOCX-Vorlagen `betrag_verteilbar` ohne expliziten Sign-Flip; aktuell stimmt das Vorzeichen also pro Konto bereits, ABER:
- `subtotals()` (Z. 240–246): die Zwischensumme `sub_nicht_umlagefaehig.verteilbar` filtert mit `is_distributable===true` (korrekt), aber gibt sie als `fmtEUR(-verteilbar)` aus – nutzt dabei aber `abs(a.totalAbs)`. Das Format ist negativ; in der UI-Spalte „Verteilbar" der Zwischensumme erscheint sie aber laut Screenshot positiv. Ursache: Die Vorlage rendert vermutlich `sum_bewirtschaftung_verteilbar` etc., nicht `sub_...verteilbar`. → Beide Platzhalter müssen vorzeichen-konsistent NEGATIV sein (analog Ist).
- `sum_ausgaben_verteilbar` (Z. 261/309): aktuell nur `totalOperatingDist + heating`. Es fehlen die verteilbaren Anteile aus `operating_non_distributable` (z. B. Heizkostenverordnung-Konten, die in dieser Sektion sitzen können) und `reserve`. Beim Adolf-Haf-Weg soll der Wert **-30.916,90 €** sein, was alle Sektionen umfasst, jedoch nur is_distributable=true Konten.

### Bug 3 – Abrechnungssaldo
`sum_einnahmen_inkl_vorschuss` (Z. 224–229) rechnet `totalSollKostendeckung + totalSollEHR + max(0, totalUeberzahlung) + Zinsen + sonstige`. Damit landet die Überzahlung (im Adolf-Haf-Weg ~210 €) in der Einnahmen-Summe der Abrechnungssaldo-Zeile. Korrekt:
- **Summe Einnahmen (Vorschüsse Soll)** = `totalSollKostendeckung + totalSollEHR` (= 32.946,00 €), OHNE Überzahlung, OHNE Zinsen/sonstige Erträge.
- **Summe Ausgaben** = neue **verteilbare Gesamtausgaben** (= -30.916,90 €), NICHT `sum_ausgaben_ist` (-30.930,24 €).
- **Guthaben/Nachzahlung** = Soll-Vorschüsse + verteilbare Ausgaben = 2.029,10 €.

## Umsetzung (in dieser Reihenfolge, jede Stufe einzeln verifizierbar)

### Schritt 1 – `sectionListFromUi`: leere Verteilbar-Zelle für is_distributable=false
- `betrag_verteilbar`: nur befüllen, wenn `a.is_distributable === true`, sonst `""` (DOCX rendert dann „–" via Vorlagen-Logik bzw. leerer String).

### Schritt 2 – Korrekte Verteilbar-Gesamtsumme
Neue Hilfsfunktion `sumVerteilbarSection(accs)` = Σ `Math.abs(a.totalAbs)` über `a.is_distributable === true`.
- `sumVerteilbar` neu berechnen: `operating_distributable + operating_non_distributable + heating + reserve` (jeweils nur is_distributable=true).
- `sum_ausgaben_verteilbar = fmtEUR(-sumVerteilbar)`.

### Schritt 3 – Konsistenz der Sektion-Zwischensummen
- `subtotals().verteilbar` bleibt negativ (`fmtEUR(-verteilbar)`), das ist bereits korrekt. Sicherstellen, dass `sub_nicht_umlagefaehig.verteilbar` 7.240,68 € als **-7.240,68 €** ausgibt (analog Ist) – im Code bereits so, also nur per Screenshot-QA bestätigen.

### Schritt 4 – Abrechnungssaldo-Platzhalter neu definieren
- Neuen Platzhalter `sum_einnahmen_vorschuss_soll` = `fmtEUR(totalSollKostendeckung + totalSollEHR)` hinzufügen.
- Neuen Platzhalter `abrechnungssaldo_soll` = `fmtEUR((totalSollKostendeckung + totalSollEHR) - sumVerteilbar)` mit Label-Logik (Guthaben/Nachzahlung).
- `sum_einnahmen_inkl_vorschuss` NICHT entfernen (Rückwärtskompatibilität), aber Doku-Kommentar hinzufügen, dass für die Abrechnungssaldo-Zeile die neuen Platzhalter zu verwenden sind.
- Die aktive DOCX-Vorlage „Gesamtabrechnung" so anpassen, dass im Abrechnungssaldo-Block:
  - „Summe Einnahmen (Vorschüsse Soll)" → `{sum_einnahmen_vorschuss_soll}`
  - „Summe Ausgaben (Ist)" → `{sum_ausgaben_verteilbar}` (Label auf „verteilungsrelevant" umbenennen)
  - „Guthaben für Eigentümer" → `{abrechnungssaldo_soll}` mit Label

### Schritt 5 – Verifikation
- DB-Spotcheck Adolf-Haf-Weg 3 (Konten 7100/7110 Kapitalertragsteuer/Soli, Summe Konten is_distributable=true vs. false), Soll-Werte aus economic_plan/sollstellung.
- DOCX neu generieren → erwartete Werte: Verteilbar nicht_umlagefaehig **-7.240,68 €**, Summe verteilbare Ausgaben **-30.916,90 €**, Einnahmen Soll **32.946,00 €**, Saldo Guthaben **2.029,10 €**.
- QA via Konvertierung in PNG & Inspektion vor Abgabe.

## Nicht im Scope
- Einzelabrechnung (`buildOwnerPayload`) – wird in separatem Schritt geprüft, falls die Owner-PDFs gleichen Fehler zeigen.
- UI in `BillingSettlement.tsx` (HTML-Anzeige) – nutzt bereits getrennte Logik mit korrekten Werten.
