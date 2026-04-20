
## Ziel
Die Rechnungsliste im Dialog „Vorlage bearbeiten“ soll wieder sauber mit dem Mausrad/Trackpad scrollbar sein, auch seit dem Hinzufügen des Augen-Buttons zum Öffnen der Rechnung.

## Wahrscheinliche Ursache
Die aktuelle Rechnungs-Auswahlliste kombiniert `cmdk` (`CommandList`/`CommandItem`) mit einer eigenen Wrapper-`div` plus separatem Preview-Button pro Zeile. Dadurch ist die DOM-Struktur nicht mehr sauber im erwarteten `cmdk`-Muster, was Pointer-/Wheel-Events und Hover/Selection-Verhalten blockieren kann.

## Umsetzung
1. `src/components/finance/BookingTemplatesTab.tsx` gezielt umbauen:
   - Die Rechnungs-Auswahl nicht mehr als gemischte `CommandItem` + Wrapper + externen Button rendern.
   - Stattdessen:
     - `CommandInput` nur noch für die Suche verwenden
     - die Trefferliste darunter als eigene, einfache scrollbare Liste rendern (`div`/`ScrollArea` mit `max-h`)
     - jede Zeile als normales Row-Layout mit:
       - linkem Bereich „Rechnung auswählen“
       - rechtem Augen-Button „Rechnung öffnen“

2. Suche robust machen:
   - `filteredInvoices` lokal aus `invoiceSearch` berechnen
   - Suche über `invoice_number`, `vendor_name`, optional Datum/Betrag
   - So entfällt die Abhängigkeit von `cmdk` für das eigentliche List-Rendering

3. Scroll-Verhalten absichern:
   - eigener Scroll-Container nur für die Liste
   - keine verschachtelten interaktiven `cmdk`-Items mehr
   - `min-h-0`, `overflow-y-auto`, feste `max-h` beibehalten
   - Augen-Button mit sauberem `onMouseDown`/`onClick`, ohne den Scrollcontainer zu beeinflussen

4. Auswahl- und Vorschau-Verhalten beibehalten:
   - Klick auf Zeile setzt `linked_invoice_id` und schließt Popover
   - Klick auf Auge öffnet PDF-Vorschau, ohne Rechnung auszuwählen
   - bereits verknüpfte Rechnung neben dem Feld weiter direkt per Auge öffnbar

5. Bewusst keine globale Änderung an `src/components/ui/command.tsx`
   - Damit andere Such-/Combobox-Komponenten nicht unbeabsichtigt kaputtgehen
   - Der Fix bleibt lokal auf die problematische Rechnungs-Auswahl begrenzt

## Betroffene Datei
- `src/components/finance/BookingTemplatesTab.tsx`

## Technische Details
```text
Neu:
CommandInput
  -> lokale Filterung per invoiceSearch
  -> eigener Scroll-Container
     -> row button: Rechnung auswählen
     -> icon button: Rechnung öffnen
```

## QA
- Popover öffnen und mit Mausrad nach unten/oben scrollen
- Dasselbe mit Trackpad testen
- Mehrfach auf das Auge klicken: PDF öffnet, Liste bleibt bedienbar
- Klick auf Zeile verknüpft weiterhin korrekt die Rechnung
- Testen, dass andere Comboboxen im selben Dialog (Liegenschaft, Konto) unverändert funktionieren
