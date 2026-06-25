## Ziel
In `RecipientField` (innerhalb `src/components/email/FloatingComposeWindow.tsx`) eine Gebäude-Suche via `/`-Trigger ergänzen. Bestehende Kontakt-Suche bleibt unverändert.

## 1. Datenquelle: Gebäude mit Mitgliedern

In `FloatingComposeWindow` neue React-Query-Abfrage `buildingsWithMembers` ergänzen (parallel zur bestehenden `contactsWithEmails`-Query). Sie kombiniert die schon geladenen Kontakte/E-Mails mit Gebäude-Zuordnungen:

- `buildings`: `id, name` (alphabetisch).
- `contact_building_assignments`: `building_id, contact_id` mit `is_active = true`.
- Aus den bereits geladenen `contactsWithEmails` (Name = `displayName`, alle `emails[*].email`) pro Gebäude alle Personen mit mindestens einer E-Mail sammeln.
- Innerhalb eines Gebäudes nach Person-Name sortieren; E-Mail-Duplikate (case-insensitive) entfernen.

Ergebnistyp:
```ts
type BuildingWithMembers = {
  id: string;
  name: string;
  members: Array<{ name: string; email: string }>;
};
```

Diese Liste wird als neue Prop `buildings` an alle drei `RecipientField`-Instanzen (To/Cc/Bcc) übergeben.

## 2. RecipientField: Zwei-Stufen-Vorschläge

In `RecipientField` nur das Vorschlags-Dropdown (links neben dem Users-Picker-Button) erweitern. Der Picker-Popover rechts bleibt unverändert.

### Modus-Erkennung
- `lastSegment = (value.split(",").pop() || "").trim()`
- Beginnt `lastSegment` mit `/`: Gebäude-Modus aktiv, Suchquery = Text nach dem `/` (case-insensitive, `includes`).
- Sonst: bisherige Kontakt-Vorschläge (unverändert).

### Stufe A — Gebäude-Liste
- Vorschläge: Gebäude, deren `name` den Suchtext enthält. Bei leerem Suchtext (nur `/`) alle Gebäude (auf max. 8 begrenzt, Scroll nicht nötig — wir schneiden ab wie bisher).
- Darstellung pro Zeile: Building-Icon (lucide `Building2`), Gebäudename, kleinere Mitgliederzahl rechts/darunter, z. B. „Achweg 3-5 · 24 Personen".
- Klick/Enter auf ein Gebäude: **nicht** Adressen einfügen. Stattdessen lokalen State `selectedBuilding` setzen → Stufe B.

### Stufe B — Mitglieder des Gebäudes
- Kopfzeile (sticky, oben im Dropdown):
  - Kleine Zeile mit Building-Icon + Gebäudename + „X Mitglieder".
  - Darüber/darunter ein anklickbarer „← Zurück"-Eintrag, der `selectedBuilding` auf `null` zurücksetzt (führt zurück zur Gebäudesuche; Eingabefeld bleibt mit `/…` unverändert).
- Liste: eine Zeile pro Person — Name (oben) + E-Mail (unten, muted), klickbar.
- Bereits in `value` enthaltene Adressen werden mit Status „hinzugefügt" angezeigt: ausgegraut + kleines Häkchen, weiterhin klickbar (Klick fügt nicht erneut hinzu).
- Klick/Enter auf eine Person:
  - Fügt nur diese eine Adresse dedupliziert hinzu. Implementierung: gleiche Logik wie `addEmail` im Picker (Segment-Trick nicht anwenden, da der aktuelle `/…`-Text als Eingabesegment dient): Vor dem Anfügen wird das aktuelle `/…`-Segment im Input **gelöscht** und die E-Mail als neues Segment angehängt, sodass am Ende wieder ein leeres Eingabesegment für die nächste Eingabe entsteht.
  - **Wichtig:** Dropdown bleibt geöffnet, `selectedBuilding` bleibt gesetzt → mehrere Personen lassen sich nacheinander anklicken.

### Schließen / Reset
- Schließen per Klick außerhalb (bestehender `onBlur`-Timeout) und Esc (bestehender Keydown-Handler).
- Beim Schließen wird `selectedBuilding` zurückgesetzt.
- Wenn der User den führenden `/` aus dem Segment entfernt, automatisch zurück in Kontakt-Modus (`selectedBuilding = null`).

### Tastatur
- Hoch/Runter/Enter funktionieren in beiden Stufen über die aktuell sichtbare Vorschlagsliste (Indexreset bei Stufenwechsel).
- Esc schließt das Dropdown (wie bisher).

### Platzhalter
- Bestehender Platzhalter wird ergänzt um „… – oder /Gebäude". Geschieht in `FloatingComposeWindow` an den Stellen, an denen `placeholder` an `RecipientField` übergeben wird (To/Cc/Bcc).

## 3. Technische Hinweise (für Entwickler)

- Datei: ausschließlich `src/components/email/FloatingComposeWindow.tsx`.
- Neue Imports: `Building2`, `ArrowLeft` (lucide).
- Keine Änderungen am bestehenden Users-Picker-Popover, an Drafts oder am Versand.
- Keine Schema- oder Edge-Function-Änderungen — alle Daten kommen aus bestehenden Tabellen (`buildings`, `contact_building_assignments`, `contacts`, `contact_emails`).
- Performance: `useMemo` für Gebäude-Vorschläge (Abhängig von `lastSegment`, `buildings`) und für Mitglieder-Liste (Abhängig von `selectedBuilding`, `value`).
