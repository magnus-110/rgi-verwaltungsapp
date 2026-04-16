

## Plan: "Prüfen"-Button in den Header der Buchungszeile verschieben

### Konzept
Der "Zur Prüfung markieren"-Block unten in der Buchungsmaske wird entfernt. Stattdessen kommt ein kompakter Flag-Button oben rechts in die Collapsible-Header-Zeile — dort wo aktuell der Betrag steht. Der Betrag bleibt, aber daneben (oder davor) wird ein kleiner Flag-Button eingefügt.

### Änderungen in `TransactionReviewMode.tsx`

**1. Header-Zeile (Zeilen ~1198-1210)**
- Neben dem Betrag und dem Trash-Button einen `Flag`-Icon-Button einfügen
- Kompakt: nur Icon + "Prüfen" Text, orange wenn aktiv (`needs_review === true`)
- Klick toggled `needs_review` (stopPropagation damit Collapsible nicht toggled)
- Wenn `needs_review` aktiv: kleines Notiz-Input erscheint im expanded Content (oben, direkt unter dem Header)

**2. Review-Block unten entfernen (Zeilen ~1472-1486)**
- Den gesamten `div` mit Checkbox + Notiz-Input entfernen
- Die Notiz-Eingabe wird stattdessen als schmale Zeile direkt unter dem Header im CollapsibleContent angezeigt (nur wenn `needs_review === true`)

**3. Buchen-Button Text (Zeile ~1491)**
- Bleibt: zeigt weiterhin "Buchen & Zur Prüfung" wenn `needs_review === true`

### Ergebnis
- Header-Zeile: `[1. Beschreibung] [Badge] ... [🚩 Prüfen] [Betrag] [🗑]`
- Kein zusätzlicher Platzverbrauch in der Buchungsmaske
- Review-Notiz nur bei Bedarf sichtbar

