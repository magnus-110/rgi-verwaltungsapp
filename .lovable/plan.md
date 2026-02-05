
# Plan: Einheitlicher Kalender-Dialog mit Google Kalender Integration

## Ziel
Alle Elemente im Kalender (Termine UND Aufgaben) sollen denselben Dialog verwenden, um eine konsistente Nutzererfahrung zu bieten. Der Google Kalender Export-Button soll immer verfügbar sein.

## Konzeptionelle Entscheidung

### Aktuelle Architektur
- **Termine (Events)**: Eigene Tabelle `calendar_events`, volle Terminfelder
- **Aufgaben (Todos)**: Tabelle `todos` mit optionalem `due_date` und `calendar_start_time`

### Lösungsansatz
Beim Klick auf eine Aufgabe im Kalender wird ein **schreibgeschützter Vorschau-Dialog** geöffnet, der:
1. Die Aufgaben-Details anzeigt
2. Einen prominenten Google Kalender Export-Button enthalt
3. Einen Link zur vollständigen Aufgabenbearbeitung bietet

Alternativ: Aufgaben im Kalender werden bei Klick in den EventDialog mit vorausgefüllten Daten übernommen (konvertiert).

---

## Implementierung

### Schritt 1: Neuen universellen CalendarItemDialog erstellen
Eine neue Komponente `CalendarItemDialog.tsx` die beide Typen handhabt:

```text
+------------------------------------------+
|  [Termin/Aufgabe] Details               |
+------------------------------------------+
|  Titel: Meeting mit Kunde               |
|  Datum: 15.02.2026, 09:00 - 10:00      |
|  Kategorie: Kundentermine               |
|  Beschreibung: ...                      |
+------------------------------------------+
|  [Google Kalender]  [Bearbeiten] [X]   |
+------------------------------------------+
```

### Schritt 2: Calendar.tsx anpassen
- Entfernen des separaten `TodoDialog` für Kalender-Kontext
- Neuen `CalendarItemDialog` verwenden
- Bei Klick auf jedes Element (Event oder Todo) wird derselbe Dialog geöffnet

### Schritt 3: Google Kalender Button immer sichtbar
- Button erscheint sowohl bei neuen Terminen als auch bei bestehenden
- Bei Aufgaben: Daten werden aus dem Todo übernommen (Titel, Datum, Beschreibung)

---

## Technische Details

### CalendarItemDialog Props
```typescript
interface CalendarItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CalendarItem | null;  // Unified item type
  onEditClick?: () => void;   // Falls vollständige Bearbeitung gewünscht
}
```

### Google Calendar URL Generation
Bereits implementiert in `EventDialog.tsx` (Zeilen 28-56):
- Unterstützt ganztägige Events und Termine mit Uhrzeiten
- Übergibt Titel, Datum, Beschreibung

### Betroffene Dateien
1. **Neu**: `src/components/calendar/CalendarItemDialog.tsx`
2. **Ändern**: `src/pages/Calendar.tsx` - Neuer Dialog statt TodoDialog
3. **Behalten**: `EventDialog.tsx` - Für Erstellen/Bearbeiten von Terminen

---

## Ablauf im Kalender

```text
Nutzer klickt auf Element im Kalender
            |
            v
    +---------------+
    | CalendarItem  |
    | Dialog öffnet |
    +---------------+
            |
    +-------+-------+
    |               |
    v               v
[Event]         [Aufgabe]
    |               |
    v               v
Bearbeiten     Details anzeigen
möglich        + Google Export
               + Link zu Aufgabe
```

---

## Vorteile dieser Lösung
1. **Einheitliche UX**: Alle Kalenderelemente werden gleich behandelt
2. **Aufgaben bleiben intakt**: Die Aufgabenverwaltung bleibt separat auf `/todos`
3. **Google Export immer verfügbar**: Sowohl für Termine als auch Aufgaben
4. **Keine Datenvermischung**: Aufgaben und Termine bleiben in getrennten Tabellen
