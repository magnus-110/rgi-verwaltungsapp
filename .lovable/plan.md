## Ziel
Im Wartungskonfigurations-Kalender (Letzte Wartung eintragen) soll der Nutzer schnell ein bestimmtes Jahr und Monat auswählen können, statt Monat für Monat durchzuklicken.

## Aktuelles Verhalten
- Der `<Calendar>`-Komponent aus `src/components/ui/calendar.tsx` (react-day-picker v8.10.1) zeigt nur Links/Rechts-Pfeile für Monatsnavigation.
- Um z.B. 2 Jahre zurückzugehen, muss der Nutzer 24x klicken.

## Änderungen

### 1. Calendar-Komponente erweitern (`src/components/ui/calendar.tsx`)
react-day-picker v8 unterstützt `captionLayout="dropdown"` für Jahr/Monat-Dropdowns. Der `<Calendar>`-Komponent erhält:
- Neue optional Props: `captionLayout`, `fromYear`, `toYear`
- Zusätzliche CSS-Klassen für die Dropdown-Selektoren, damit sie mit dem bestehenden Design konsistent sind

### 2. MaintenanceConfigSection anpassen (`src/components/buildings/MaintenanceConfigSection.tsx`)
Im Date-Picker-Popover für "Letzte Wartung eintragen" wird der `<Calendar>` aufgerufen mit:
```tsx
captionLayout="dropdown"
fromYear={new Date().getFullYear() - 20}
toYear={new Date().getFullYear()}
```

### 3. Keine Schema-Änderungen
Nur Frontend-Änderung, keine Datenbank-Migration nötig.

## Akzeptanzkriterien
- [ ] Im Kalender-Popover erscheinen Dropdowns für Jahr und Monat
- [ ] Der Nutzer kann direkt ein beliebiges Jahr (z.B. 2020) und Monat wählen
- [ ] Das Design bleibt konsistent mit dem bestehenden UI
- [ ] Datumselektion funktioniert weiterhin wie bisher