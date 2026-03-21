

# Plan: Buchungen-Tab und Kontoauszuege ueberarbeiten

## Buchungen-Tab (BookingsTab.tsx) - Komplett umstrukturieren

### Neue Logik
- **Standard-Ansicht**: Alle offenen (pending) Buchungen ueber ALLE Liegenschaften laden, gruppiert nach Liegenschaft mit Unterueberschriften
- **Filter**: Suchfeld fuer Liegenschaften (Text-Suche), Wirtschaftsjahr-Auswahl (bleibt)
- **Kuerzel-Spalte entfernen** aus der Tabelle
- **Pagination**: 25 Buchungen pro Seite mit Seitenwechsel-Buttons
- **Separate Bereiche**: Zwei aufklappbare Sektionen am Ende:
  - "Bestaetigte Buchungen" (status=confirmed) - aufklappbar, eigene Tabelle mit Liegenschafts- und Jahresfilter
  - "Manuell erstellte Buchungen" (source=manual) - aufklappbar, eigene Tabelle

### Query-Aenderung
- Hauptquery: `status = 'pending'`, kein Building-Filter noetig (alle laden), nach fiscal_year filtern
- Gruppierung im Frontend nach `building_id` mit Unterueberschriften
- Bestaetigte/Manuelle Buchungen als separate Queries in Collapsibles

### Spalten (Haupttabelle)
Datum | Soll-Konto | Gegen-Konto | Buchungstext | Beleg-Nr. | Betrag | MwSt | Optionen | Status

## Kontoauszuege-Tab (BankStatementsTab.tsx)

### Vollstaendig gematchte Auszuege ausblenden
- Im Frontend pruefen: Wenn alle Transaktionen eines Statements `booked_at` haben oder `match_status = 'ignored'` → Statement nicht in der Liste anzeigen
- Dazu: Alle Transaktionen pro Statement zaehlen (separater Query oder Count)
- Toggle-Button "Abgeschlossene anzeigen" um sie optional einzublenden

### Uebergreifender Buchen-Button
- Statt pro Statement einen "Buchen"-Button: Ein globaler Button oben in der Card-Header
- Zaehlt alle gematchten+nicht-gebuchten Transaktionen ueber alle Statements
- Edge Function `send-booking-data` anpassen: Neuen Modus `bookAll: true` statt `statementId`, der alle ungebuchten gematchten Transaktionen verarbeitet

## Dateien

| Datei | Aenderung |
|---|---|
| `src/components/finance/BookingsTab.tsx` | Komplett umschreiben: Offene Buchungen aller Liegenschaften, Gruppierung, Pagination, Suche, separate Collapsibles fuer bestaetigte/manuelle |
| `src/components/finance/BankStatementsTab.tsx` | Vollstaendig gematchte Statements ausblenden, globaler Buchen-Button, Toggle fuer abgeschlossene |
| `supabase/functions/send-booking-data/index.ts` | bookAll-Modus hinzufuegen |

