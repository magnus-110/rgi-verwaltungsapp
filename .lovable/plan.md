## Ziel
Im "Jahreszyklus"-Widget des Eigentümer-Dashboards soll (1) das gesamte Widget zum Aufklappen genutzt werden – nicht nur die Überschrift – und (2) in der aufgeklappten Ansicht jede einzelne Position klickbar sein und eine kurze Erklärung anzeigen.

## Änderungen in `src/components/dashboard/OwnerAnnualCycleWidget.tsx`

### 1. Gesamte eingeklappte Ansicht klickbar
- In der eingeklappten Variante (die kompakte Zeile mit den 5 Punkten) wird der gesamte Karten-Container zu einem `<button>`, der `setCollapsed(false)` auslöst.
- Der bestehende Toggle in der Überschrift bleibt erhalten (zum erneuten Einklappen).
- Hover/Cursor-Styles (`cursor-pointer`, leichte Hintergrund-Hervorhebung) machen die Klickbarkeit sichtbar.
- Die Selects (Gebäude/Jahr) sind weiterhin separat in der Headerzeile und nicht Teil der klickbaren Fläche.

### 2. Einzelne Positionen aufklappbar mit Erklärung
- Jede Milestone-Zeile in der aufgeklappten Liste wird ein `<button>`, der einen lokalen State `expandedKey` umschaltet (Akkordeon: nur eine Position gleichzeitig offen).
- Beim Aufklappen erscheint unterhalb der Zeile ein kleiner Erklärungsblock (`text-[13px] text-muted-foreground`, dezenter Hintergrund) mit 1–2 Sätzen pro Meilenstein.
- Ein `ChevronDown`-Icon rechts zeigt den Zustand an (rotiert bei offen).

### 3. Erklärungstexte (neu in `OWNER_MILESTONES`)
Feld `description` pro Eintrag:
- **Beschlüsse umgesetzt**: "Alle in der letzten Eigentümerversammlung gefassten Beschlüsse wurden umgesetzt oder beauftragt."
- **Heizkostenabrechnung eingereicht**: "Die Verbrauchsdaten wurden an den Messdienstleister (z. B. Brunata) übergeben, damit die Heizkostenabrechnung erstellt werden kann."
- **Jahresabrechnung erstellt**: "Die Jahresabrechnung des abgelaufenen Wirtschaftsjahres wurde fertiggestellt und steht zur Prüfung bereit."
- **Kassenprüfung**: "Der gewählte Kassenprüfer hat die Belege und Konten geprüft und das Ergebnis dokumentiert."
- **Eigentümerversammlung**: "Die jährliche Eigentümerversammlung wurde durchgeführt und das Protokoll versendet."

## Außerhalb des Scopes
- Keine Änderungen an Datenmodell oder Queries.
- Keine Änderungen am Header-Layout, an Selects oder am eingeklappten Ampel-Layout selbst (außer Klickbarkeit).
