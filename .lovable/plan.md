Aktuell sind viele Fragen reine Text-/Textarea-Felder, obwohl die Antwort fast immer aus einer kleinen Liste stammt (Heizungsart, Vertrag ja/nein, etc.). Ich erweitere den Fragenkatalog um zwei neue Frage-Typen und stelle möglichst viele Fragen auf Klick-Auswahl um.

## Neue Frage-Typen
- `select` – Einfachauswahl aus festen Optionen (Buttons/Chips), optional mit Freitext-Feld bei "Sonstiges"
- `multiselect` – Mehrfachauswahl per Klick (Chips), optional mit Freitext

`bool` bleibt, wird aber als großes Ja/Nein-Buttonpaar dargestellt (statt Switch).

## Umstellungen je Sektion

**1. Rundgang**
- Hausmeister / Winterdienst / Gartenservice: bleiben Text (Firmenname) – ABER vorgelagerte Ja/Nein-Frage "vorhanden?" als `bool`; nur bei Ja Eingabefeld für Name
- Vertrag/Leistungsverzeichnis vorhanden? → `select` (Ja / Nein / Teilweise)
- Parkplätze-Zuordnung: zusätzlich `select` für "Sondereigentum / Sondernutzungsrecht / Gemischt"

**2. Gemeinschaftseigentum**
- Feuerlöscher-Wartung: Ja/Nein + Firmenname
- Aufzug vorhanden? → `bool`; Lüftung vorhanden? → `bool` (statt einem Textfeld "weitere Verträge")

**3. Heizung**
- Heizungsart → `select` (Öl, Gas, Wärmepumpe, Fernwärme, Pellets, Sonstiges)
- Anzeige stimmt? bleibt `bool`
- Wartungsvertrag: Ja/Nein + Firmenname
- Enthärtungsanlage / Funkzähler: bleibt `bool`
- "Wer meldet niedrigen Ölstand?" → `select` (Hausmeister / Eigentümer / Tankfirma / Sonstiges)

**4. Allgemeine Verwaltung**
- Wirtschaftsjahr → `select` (01.01.–31.12. / 01.07.–30.06. / Sonstiges)
- Schließanlage vorhanden? → `bool` + bei Ja Textfeld "Wo ist die Karte?"
- Eigentümerkontakte / Beschlusssammlung / Offene Beschlüsse (Ja/Nein) / TE & Aufteilungsplan / Hausordnung / Übergabeunterlagen: bleiben `bool`
- "Offene Beschlüsse" wird gesplittet: `bool` (gibt es welche?) + bedingtes Textarea (welche?)
- Angestellte → `bool` + bedingtes Textfeld "Lohnbuchhaltung durch"
- Laufende Kredite → `bool` + bedingtes Textarea Details
- Geplante bauliche Maßnahmen → `bool` + bedingtes Textarea
- Beirat-Mitglieder bleibt Textarea (Namensliste)

## Technische Umsetzung
1. `questions.ts`: 
   - Typ-Erweiterung: `QuestionType += "select" | "multiselect"`, neue Felder `options?: string[]`, `allowOther?: boolean`, `dependsOn?: { key: string; equals: any }` für bedingte Folgefragen
2. `QuestionRow.tsx`:
   - Render-Branch für `select` → Button-Gruppe (Toggle-Style, shadcn `ToggleGroup` oder Buttons mit `variant` default/outline)
   - Render-Branch für `multiselect` → Chip-Buttons
   - `bool` neu als Ja/Nein-Buttonpaar
   - Bedingte Anzeige: Folgefrage nur rendern, wenn `dependsOn` erfüllt (Wert kommt aus geladenen Answers)
   - Auto-Save direkt beim Klick (kein Speichern-Button bei select/bool)
3. `applyHandlers.ts`: bei `buildings.heating_type` Map vom Anzeige-Label zum DB-Enum, falls nötig (sonst direkt String speichern)
4. DB: Werte landen weiterhin in `value_text` (select) bzw. `value_bool`; für `multiselect` als JSON-String in `value_text`. Keine Migration nötig.

## Nicht im Scope
- Keine Änderung an Voice-Input, Apply-Logik bleibt erhalten
- Keine UI-Umbauten am Tab/Accordion-Layout
