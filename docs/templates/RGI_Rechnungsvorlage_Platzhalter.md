# RGI Rechnungsvorlage – Platzhalter

Die Datei `RGI_Rechnung_Vorlage.docx` wird in RGI Intern unter **Word-Vorlagen** hochgeladen
und in der Rechnung als Vorlage ausgewählt. Beim Erzeugen der Rechnung ersetzt die App jeden
Platzhalter durch den echten Wert.

Ein Platzhalter steht in geschweiften Klammern: `{rechnung.nummer}`.
Was die App nicht kennt, bleibt einfach leer — es entsteht kein Fehler.

---

## Empfänger

| Platzhalter | Inhalt |
|---|---|
| `{kunde.name}` | Name des Rechnungsempfängers |
| `{kunde.strasse}` | Straße und Hausnummer |
| `{kunde.plz}` | Postleitzahl |
| `{kunde.ort}` | Ort |
| `{kunde.kundennr}` | Kundennummer |
| `{kunde.email}` | E-Mail-Adresse |
| `{kunde.ustid}` | USt-IdNr. des Empfängers |
| `{kunde.adresse}` | komplette Anschrift in einer Zeile |

## Rechnung

| Platzhalter | Inhalt |
|---|---|
| `{rechnung.nummer}` | Rechnungsnummer, bei Entwürfen „ENTWURF" |
| `{rechnung.datum}` | Rechnungsdatum |
| `{rechnung.faellig}` | Zahlungsziel |
| `{rechnung.leistungszeitraum}` | Leistungszeitraum von–bis |
| `{rechnung.projekt}` | Projektname (steht als Unterzeile beim Betreff) |
| `{rechnung.intro}` | Einleitungstext aus der Rechnungsmaske, mehrzeilig möglich |
| `{rechnung.footer}` | Fußtext aus der Rechnungsmaske |

## Positionen (Tabelle)

Die Tabellenzeile zwischen `{#positionen}` und `{/positionen}` wird für jede Position
einmal wiederholt. Innerhalb der Zeile stehen:

| Platzhalter | Inhalt |
|---|---|
| `{nr}` | laufende Nummer |
| `{beschreibung}` | Leistungsbeschreibung |
| `{menge}` | Menge |
| `{einheit}` | Einheit, z. B. Std, Stück, Monate, pauschal |
| `{einzelpreis}` | Einzelpreis netto |
| `{ust}` | Umsatzsteuersatz der Position, z. B. 19% |
| `{netto}` | Zeilenbetrag **netto** ← wird in der Vorlage verwendet |
| `{summe}` / `{brutto}` | Zeilenbetrag brutto |

> **Wichtig:** In der Betragsspalte steht `{netto}`, nicht `{summe}`. Nur so ergibt die Spalte
> in der Summe genau den Nettobetrag, der darunter ausgewiesen wird.

## Summen

| Platzhalter | Inhalt |
|---|---|
| `{summe.netto}` | Nettosumme |
| `{summe.ust}` | Umsatzsteuer gesamt |
| `{summe.brutto}` | Gesamtbetrag brutto |
| `{summe.netto19}` / `{summe.ust19}` | getrennt nach Steuersatz 19 % |
| `{summe.netto7}` / `{summe.ust7}` | getrennt nach Steuersatz 7 % |
| `{summe.netto0}` / `{summe.ust0}` | getrennt nach Steuersatz 0 % |

## Firmendaten (aus den Firmeneinstellungen)

`{firma.name}` · `{firma.strasse}` · `{firma.plz}` · `{firma.ort}` · `{firma.telefon}` ·
`{firma.email}` · `{firma.website}` · `{firma.iban}` · `{firma.bic}` · `{firma.bank}` ·
`{firma.ustid}` · `{firma.steuernr}` · `{firma.geschaeftsfuehrer}` · `{firma.hrb}` ·
`{firma.amtsgericht}`

---

## Umschalter: Überweisung oder Selbstentnahme

Die Vorlage enthält zwei Zahlungsvarianten. Welche gedruckt wird, entscheidet ein einziger
Wert namens `entnahme`:

| Wert | Ergebnis |
|---|---|
| nicht gesetzt / falsch | **Überweisungstext** mit Zahlungsziel, IBAN, BIC — und die Zeile „Fällig" im Infoblock oben rechts |
| wahr | **Selbstentnahme-Text**: „Der Gesamtbetrag wird gemäß Verwaltervertrag vom Objektkonto entnommen." Die Zeile „Fällig" verschwindet |

Technisch ist das im Word-Dokument so hinterlegt:

```
{^entnahme}   … Überweisungstext …   {/entnahme}
{#entnahme}   … Selbstentnahme …     {/entnahme}
```

Die Rendering-Funktion `rgi-render-invoice` setzt `entnahme` aus dem Feld
`rgi_invoices.paid_by_withdrawal`. Ist es nicht gesetzt, druckt die Vorlage die
Überweisungs-Variante.

---

## Gestaltung

| Element | Umsetzung |
|---|---|
| Format | A4, Ränder oben 2,9 cm · unten 2,0 cm · links 2,5 cm · rechts 2,0 cm |
| Logo | oben rechts, 4,5 cm breit, darunter orange Linie `#F08C1F` |
| Anschriftfeld | links, mit kleiner Absenderzeile — passend für Fensterumschlag |
| Infoblock | rechts, Creme `#FAFAFA`, Rechnungsnr. · Datum · Kundennr. · Leistung · Fällig |
| Betreff | Century Gothic 14 pt, Orange `#F08C1F` |
| Tabellenkopf | Orange `#E8893A`, weiße Schrift, Century Gothic |
| Tabellenzeilen | weiß, feine graue Trennlinie `#E4E4E4` — bewusst ohne Zebra-Streifen |
| Summenblock | rechtsbündig, Gesamtbetrag fett mit oranger Linie darüber |
| Zahlungsblock | Creme-Box mit orangem Balken links |
| Fußzeile | RGI-Standardzeile, Bank- und Steuerdaten, Seitenzahl |
| Schriften | Century Gothic (Überschriften) · Work Sans (Fließtext) |

**Hinweis zur Schrift:** Work Sans ist keine Windows-Standardschrift. Auf den
Arbeitsplätzen installieren — oder die Rechnung immer als PDF versenden, dann bleibt das
Layout in jedem Fall erhalten. Der Versand aus der App erzeugt ohnehin ein PDF.

**Datei erzeugen:** `node docs/templates/build-rgi-invoice-template.js`
(benötigt `rgi-logo.png` im selben Ordner und das npm-Paket `docx`).
