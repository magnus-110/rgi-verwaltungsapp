

# CSV-Export im HV-Office-Format (Gesamt + Einzelabrechnungen)

## Logik der HV-Office-CSV — verstanden

Die beigefügten PDFs zeigen das HV-Office-Format. Es gibt zwei Dokument-Typen, die wir beide als CSV abbilden:

### 1. Gesamtabrechnung (Building-weit, einmal pro WEG)
Spaltenstruktur (5 Spalten): `Konto | Bezeichnung | Wirtschaftsplan | Einnahmen-/Ausgabenrechnung | Verteilungsrelevante Beträge`

Sektionen in fester Reihenfolge:
1. **Geld- und Bestandskonten** — Anfangsbestände 1800 + 1810 + Summenzeile
2. **Einnahmen** — inkl. Vorschüsse zur Kostendeckung, Vorschüsse auf EHR, Zinseinnahmen 1840 → Zwischensumme
3. **Ausgaben → umlagefähige Beträge** — Konten mit `is_distributable=true` aus `operating_distributable` → Zwischensumme
4. **Ausgaben → nicht umlagefähige Beträge** — `operating_non_distributable` (inkl. 1500/1520/1850/1860/1920) → Zwischensumme
5. **Abgrenzungen / Sollstellungen** — Konten 4020, 4110, 4130, 4160, 4180 → Zwischensumme
6. **Zuweisung und Entnahme aus der Rücklage** — 1720 (Plan IHR) + 1920-Gegenbuchung
7. **Wirtschaftsplansumme / Abrechnungssumme** (Fettzeile)
8. **Vorschussverpflichtung gem. WPL** + **Abrechnungsspitze** (Fettzeile)
9. **Geldkonten Endbestand gesamt** + **Kontrolle Endbestände** (1800/1810) + Kontrollsumme

### 2. Einzelabrechnung (eine pro Eigentümer)
7-Spalten-Struktur: `Konto | Bezeichnung | Verteilungsrelevant Ges. | Verteiler | Gesamt-Anteil | Ihr Anteil | Ihre Kosten`

Gleiche Sektionen wie Gesamt, aber mit zusätzlichen Spalten für Verteilungsschlüssel und Eigentümeranteil. Plus Schlusszeilen pro Eigentümer:
- Abrechnungssumme · Vorschussverpflichtung WPL · Abrechnungsspitze (GH) · Vorschussverpflichtung IST · Unterzahlung WPL · Abrechnungssaldo (GH)

## Was umgebaut wird

### Datei: `src/components/finance/BillingSettlement.tsx`

Die bestehende `exportCsv`-Funktion (Z. 656-674) wird ersetzt. Statt einer flachen Tabelle wird eine HV-Office-konforme CSV erzeugt — alles Daten, die in der Komponente bereits berechnet sind (`sectionAccounts`, `getSectionTotal`, `getOpeningTotal`, `getClosingTotal`, `ownerResults`, `economicPlan`, `totalVorschuss`, `abrechnungssumme`, `abrechnungsspitze`).

#### Neue Funktion `buildOverallCsvLines()` — Gesamtabrechnung
Generiert in der oben beschriebenen Sektionsreihenfolge alle Zeilen mit korrekten Zwischensummen und Schlussblock (Wirtschaftsplansumme, Abrechnungsspitze, Endbestände).

#### Neue Funktion `buildOwnerCsvLines(owner)` — eine Einzelabrechnung
Iteriert über `owner.accountBreakdown` (existiert bereits), gruppiert nach Sektion (`distributable` → umlagefähig, `non_distributable` → nicht umlagefähig, `reserve` → Rücklage), gibt 7-Spalten-Format aus, hängt Schlussblock an (Abrechnungssumme, WPL-Vorschuss, Abrechnungsspitze, IST-Vorschuss, Saldo).

#### Neue UI: Dropdown-Menü statt einzelnem CSV-Button
Der bestehende „CSV"-Button (Z. 830) wird zu einem Dropdown mit drei Optionen (analog zu `HeatingExportSection`):
- **CSV: Gesamtabrechnung** → `Abrechnung_Gesamt_<Building>_<FY>.csv`
- **CSV: Alle Einzelabrechnungen (ZIP)** → eine ZIP-Datei mit je einer CSV pro Eigentümer (`Einzelabrechnung_Einheit-XXXX_<Name>_<FY>.csv`)
- **CSV: Einzelner Eigentümer** → Untermenü mit allen Eigentümern, einzelne CSV-Datei

Für ZIP wird `jszip` (bereits via npm verfügbar in vergleichbaren Projekten) verwendet. Falls nicht vorhanden, alternativ: einzelne Downloads sequentiell triggern.

### Detail-Format pro Zeile

Trennzeichen `;`, Zahlen deutsches Format (`1.234,56`), Vorzeichen `-` für Ausgaben, UTF-8 BOM (für Excel-DE), Sektionsüberschriften als Header-Zeile (z. B. `;UMLAGEFÄHIGE BETRÄGE;;;;;`), Zwischensummen mit Label `Zwischensumme` in Spalte 2.

### Header-Block jeder CSV
```
WEG <Building Name>
Adresse: <building.address>
Jahresabrechnung <FY>
Abrechnungszeitraum: <period_from> – <period_to>
Erstellt am: <heute>
[Bei Einzelabrechnung:] Einheit: <unit_number> · Eigentümer: <name>
[Leerzeile]
```

## Konsistenz mit dem bestehenden System
- Alle Werte stammen aus den **bereits berechneten Variablen** in `BillingSettlement.tsx` — keine neue Berechnungslogik, keine Edge-Function. Damit sind UI, PDF und CSV automatisch synchron.
- §35a-Beträge erscheinen pro Eigentümer als zusätzliche Info-Zeilen am Ende der Einzelabrechnung.
- Heizkosten 1400 nutzen `heatingDistValues` analog zur PDF-/UI-Verteilung.

## Reihenfolge nach Approval
1. `exportCsv` durch `buildOverallCsvLines` + `buildOwnerCsvLines` ersetzen
2. Dropdown-Menü mit drei Optionen einbauen (DropdownMenu aus shadcn)
3. ZIP-Erzeugung via `jszip` (Install bei Bedarf)
4. Test-Download für Birkenweg 6 / 2025 → Vergleich gegen die beigefügten HV-Office-PDFs

## Hinweis
Wenn die Werte in der CSV abweichen (z. B. Müll wird laut PDF mit 354,610/1000 verteilt — bei dir aber leer), liegt das an Stammdaten-Lücken (Personen-Anteile, `heating_distribution_values`, Wirtschaftsplan), nicht am CSV-Generator. Die wurden bereits in der vorherigen Session adressiert.

