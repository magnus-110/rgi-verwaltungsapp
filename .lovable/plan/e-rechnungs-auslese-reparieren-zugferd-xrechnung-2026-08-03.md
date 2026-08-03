# E-Rechnungs-Auslese reparieren (ZUGFeRD/XRechnung)

## Befund (geprüft)

Die beiden MTS-Rechnungen im Faulenseeweg 22 (RE260016, RE260025) wurden als ZUGFeRD erkannt — und genau deshalb sind sie leer. Die gespeicherten Rohdaten enthalten nur die IBAN, alles andere ist `null`:

```text
format: zugferd, vendor_name: null, invoice_number: null, invoice_date: null,
net/vat/gross: null, line_items: [], recipient_address: null
```

Die dritte MTS-Rechnung (Am Jürgenfeld 5, RE260024) wurde nicht als ZUGFeRD erkannt, lief über die normale OCR-Strecke — und ist vollständig gefüllt (Datum, Netto 425, USt 80,75, Brutto 505,75, Position, Beschreibung).

Datenbankweit bestätigt sich das Muster:

| Weg | Rechnungen | ohne Datum | ohne Netto | ohne Positionen |
| --- | --- | --- | --- | --- |
| als ZUGFeRD erkannt | 5 | 5 | 5 | 5 |
| normale OCR | 488 | 9 | 27 | 31 |

Also: **die OCR-Strecke funktioniert, die E-Rechnungs-Strecke ist zu 100 % kaputt** — und sie überschreibt die funktionierende, weil sie bei Treffer sofort abbricht und die OCR gar nicht mehr startet.

Zwei Ursachen:
1. Der eingebettete XML-Anhang wird aus dem PDF nicht sauber extrahiert (nur ein einziges Dekomprimierungsverfahren, keine Objekt-Streams), und der anschließende XML-Parser trifft die ZUGFeRD/Factur-X-Feldpfade nicht.
2. Es gibt keine Qualitätsprüfung: Auch ein komplett leeres Ergebnis gilt als „erfolgreich" und beendet die Verarbeitung.

## Was gebaut wird

### 1. Qualitäts-Gate mit OCR-Rückfall (wichtigster Fix)
Ein E-Rechnungs-Ergebnis wird nur akzeptiert, wenn Rechnungsnummer, Rechnungsdatum und Bruttobetrag vorhanden sind. Sonst läuft automatisch die bewährte OCR-Strecke weiter. Damit kann keine Rechnung mehr „leer" enden — schlimmstenfalls ist sie so gut wie heute die OCR-Rechnungen.

### 2. Zusammenführen statt Entweder-Oder
Wenn XML-Daten teilweise erkannt werden, werden sie als bevorzugte Quelle behandelt und die fehlenden Felder aus der OCR ergänzt (XML gewinnt bei Beträgen/IBAN/Nummer, OCR füllt Beschreibung, Positionen, Empfängeradresse, Kontovorschlag, §35a- und Brennstoff-Erkennung). Die Liegenschaftszuordnung und die Duplikatsprüfung laufen danach einmal gemeinsam.

### 3. Robustere XML-Extraktion aus dem PDF
- Eingebettete Dateien über die PDF-Struktur finden statt nur über den Dateinamen
- Dekomprimierung mit `deflate` **und** `deflate-raw` und unkomprimierter Fallback
- Auch Objekt-Streams und mehrere Anhänge durchsuchen; der erste Anhang, der eine gültige Rechnung enthält, gewinnt

### 4. Feldpfade für ZUGFeRD/Factur-X und XRechnung korrigieren
- Datum: `DateTimeString` mit Format-Attribut `102` (JJJJMMTT) korrekt lesen, ebenso Fälligkeit und Zahlungsziel
- Beträge aus der Summenblock-Sektion eindeutig zuordnen (Netto, Steuer, Brutto, bereits gezahlt, Zahlbetrag)
- Verkäufer-/Käufername inklusive Adresse aus dem jeweiligen Handelspartner-Block
- Rechnungspositionen mit Bezeichnung, Menge, Einzelpreis, Netto und Steuersatz
- Verwendungszweck und Zahlungsbedingungen

### 5. Nachlauf für die bestehenden 5 Rechnungen
Die fünf betroffenen Rechnungen (inkl. der beiden MTS-Rechnungen im Faulenseeweg 22) werden nach dem Fix erneut durch die Auslese geschickt, damit Datum, Netto/USt und Positionen nachgetragen werden. Bereits von Hand korrigierte Felder werden dabei nicht überschrieben.

### 6. Sichtbarkeit im UI
In der Rechnungsansicht wird angezeigt, woher die Daten stammen (E-Rechnung / OCR / gemischt), und der vorhandene „Erneut auslesen"-Aufruf bleibt der manuelle Notausgang.

## Technische Details

- `supabase/functions/_shared/einvoice.ts`: neue Anhang-Extraktion (mehrere Filter, Objekt-Streams), korrigierte CII-/UBL-Feldpfade, Rückgabe zusätzlich mit `confidence`-Feldern
- `supabase/functions/extract-invoice/index.ts`: E-Rechnungs-Block liefert kein `return` mehr, sondern ein Teilergebnis-Objekt; Gate prüft `invoice_number && invoice_date && gross_amount`; anschließend Merge mit dem OCR-Resultat, dann wie bisher Gebäude-Matching, Duplikatsprüfung und Speicherung
- Keine Schemaänderung nötig; `ocr_extracted_data` erhält zusätzlich `source: "einvoice" | "ocr" | "merged"`
- Nachlauf über einmaligen Aufruf der Funktion für die 5 betroffenen IDs
