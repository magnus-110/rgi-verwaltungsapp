
## Analyse: Warum die Breite noch immer nicht veränderbar ist

### Befund
Das Problem ist sehr wahrscheinlich **nicht**:
- nicht `minSize`
- nicht `min-w-0`
- nicht der Resize-Handle selbst

Denn:
- Im Session-Replay sieht man, dass der Handle korrekt in `hover` und `drag` geht.
- Der Drag-Vorgang wird also ausgelöst.
- Trotzdem verändert sich die sichtbare Breite nicht.

### Wahre Ursache
In `src/pages/Inbox.tsx` hängen auf den beiden `ResizablePanel`-Elementen noch immer harte Flex-Overrides mit `!important`:

- linkes Panel:
  - `!block !flex-[1_1_0]`
  - `md:!flex-initial`
- rechtes Panel:
  - `!block !flex-[1_1_0]`
  - `md:!flex-initial`

`react-resizable-panels` steuert die Panel-Breiten über **Inline-Flex-Styles**.  
Diese `!important`-Klassen in der Inbox überschreiben genau diese Berechnung auf Desktop. Deshalb:
- der Handle reagiert,
- der Cursor ändert sich,
- aber die Breite bleibt effektiv fix.

### Warum die bisherigen Fixes nicht gereicht haben
1. `minSize` kleiner machen:
   - hilft nur, wenn Resize grundsätzlich funktioniert
   - hier wird die Flex-Berechnung bereits überschrieben

2. `min-w-0` im shared Resizable:
   - war sinnvoll
   - beseitigt nur Shrink-Probleme durch Kind-Content
   - behebt aber keine `!important`-Flex-Überschreibung

### Was geändert werden muss
#### 1. Desktop-Overrides aus den Panels entfernen
In `src/pages/Inbox.tsx`:
- alle `md:!flex-initial` von beiden `ResizablePanel` entfernen
- auch die `!flex-[1_1_0]`-Nutzung so umbauen, dass sie **nur mobile Sichtbarkeit** löst, aber **nie Desktop-Resize** beeinflusst

#### 2. Mobile/Desktop sauber trennen
Statt dieselben Panels mit aggressiven Klassen für beide Modi zu verwenden:
- entweder reine `hidden md:block` / `block md:hidden`-Sichtbarkeitslogik
- oder besser: Mobile und Desktop Rendering klar trennen, damit Desktop-Panels keine Mobile-Flex-Hacks mehr tragen

#### 3. Panel-Inhalt weiter shrink-fähig halten
Beibehalten:
- `min-w-0`
- `min-h-0`
- `overflow-hidden`

Das ist korrekt, aber nur als Ergänzung, nicht als Hauptfix.

### Konkreter Umsetzungsplan
1. `src/pages/Inbox.tsx` prüfen und die `ResizablePanel`-Klassen auf Desktop entschlacken
2. Mobile Sichtbarkeitslogik so umbauen, dass keine `!flex-*` Klassen mehr auf Desktop wirken
3. Sicherstellen, dass linke E-Mail-Liste und rechter Detailbereich nur über `defaultSize/minSize/maxSize` vom Resizable-System gesteuert werden
4. Optional die Desktop-Struktur an das funktionierende Muster aus `Contacts.tsx` / `Buildings.tsx` angleichen
5. Danach End-to-End testen:
   - Desktop `/postfach`
   - Liste mehrfach schmaler und breiter ziehen
   - mit selektierter und nicht selektierter E-Mail
   - prüfen, dass Mobile-Verhalten unverändert bleibt

### Betroffene Datei
- `src/pages/Inbox.tsx`

### Technische Details
```text
Aktuell:
ResizablePanel + !important flex classes
        -> überschreibt Inline-Flex von react-resizable-panels
        -> Drag feuert, Breite ändert sich aber nicht sichtbar

Soll:
ResizablePanel ohne Desktop-Flex-Overrides
        -> Inline-Flex vom Library-Code greift wieder
        -> Breite wird normal veränderbar
```

### Ergebnis nach Umsetzung
Die E-Mail-Liste lässt sich wieder normal schmaler und breiter ziehen, weil die Resize-Library die Flex-Breiten auf Desktop endlich wieder selbst kontrollieren kann.
