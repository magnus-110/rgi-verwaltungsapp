## Was geändert wird

### 1. Visuelles Design der Tour-Sprechblase
Aktuell ist die `driver.js`-Sprechblase weiß und schmucklos. Neu:
- Kopfzeile mit zartem Akzent-Streifen in Primärfarbe + kleinem Icon (Glühbirne)
- Sanfter Schatten, abgerundete 16 px Ecken, dezenter Rahmen
- Größerer Schritt-Indikator als Punktreihe (●●○○) statt nur Text
- Buttons mit klarer Hierarchie (Primär = orange/voll, Sekundär = outline), 48 px hoch
- Einfache `animate-fade-in` + `scale-in` Animation beim Erscheinen
- Mobile: Sprechblase wird automatisch nach oben/unten verschoben und nimmt max. 92 vw

### 2. Kein Überlappen mit hervorgehobenem Element
Problem auf dem Screenshot: Die Sprechblase „Schnellzugriff" verdeckt die Kacheln, die sie erklärt.
- `driver.js`-Option `popoverOffset` auf 16 px und `smoothScroll: true` setzen, damit das Element zuerst in die Bildmitte gescrollt wird und genug Platz für die Sprechblase entsteht.
- Eigener Placement-Hook: vor jedem Schritt prüfen, ob oben oder unten mehr Platz ist, und die Sprechblase entsprechend positionieren (statt `side: "bottom"` hart zu setzen).
- `stagePadding` von 6 → 12 px, damit das Highlight ein bisschen Luft hat.

### 3. Auto-Start auf jeder Seite beim ersten Besuch
`useAutoStartPageTour` existiert schon, ist aber nicht zuverlässig auf allen Unterseiten eingehängt bzw. wird vom Layout-globalen Auto-Start blockiert (globale Tour läuft → Seiten-Tour startet nicht).
- Reihenfolge fixieren: Globale Tour läuft nur einmal nach Login. Danach startet auf jeder neuen Seite automatisch die seitenspezifische Tour beim ersten Aufruf, einmalig.
- Hook in alle WEG-Owner-Seiten einhängen (Dashboard, Meldungen, Dokumente, Beschlüsse, Schwarzes Brett, Versammlungen, Chat, Einstellungen) und prüfen, dass `data-tour`-Selektoren wirklich existieren.
- Falls Selektor nicht da ist (z. B. leere Liste), Schritt überspringen statt Tour abzubrechen — ist schon im Provider, aber Wartezeit von 800 → 1500 ms erhöhen für lazy-geladene Inhalte.

### 4. Hervorhebung einzelner Teile auch auf Unterseiten
Auf Dashboard funktioniert das gut (Kreislauf, Schnellzugriff, Notfall). Auf den Unterseiten gibt es bisher meist nur 1–2 Schritte. Erweitern um konkrete Element-Highlights:
- **Meine Meldungen**: „Neue Meldung"-Button, Liste der eigenen Meldungen, Status-Badge.
- **Dokumente**: Ordnerbaum, Suchfeld, ein Beispiel-Dokument, Download-Knopf.
- **Beschlüsse**: Filter/Suchfeld, ein Beispiel-Eintrag, grünes/rotes Status-Symbol.
- **Schwarzes Brett**: Aushang-Liste, ggf. Filter (kein „neuer Beitrag"-Knopf, siehe Punkt 6).
- **Versammlungen**: Liste, eine konkrete Versammlung, Live-Voting-Hinweis.
- **Chat**: Eingabefeld, Beispiel-Frage-Vorschläge.
- **Einstellungen**: Passwort, Benachrichtigungen.

Dafür werden in den jeweiligen Seiten-Komponenten zusätzliche `data-tour="..."`-Attribute ergänzt (keine Layout-Änderung, nur Markierung).

### 5. Navigation im Hilfe-Menü = App-Navigation
Reihenfolge im Dropdown (unten links) wird angepasst an die Sidebar-Reihenfolge:
1. Dashboard
2. Meine Meldungen
3. Dokumente
4. Beschlüsse
5. Schwarzes Brett
6. Versammlungen
7. Chat
8. Einstellungen

**Kassenprüfung wird komplett aus dem Hilfe-Menü entfernt** (Tour-Definition bleibt im Code für später, taucht aber im Menü nicht mehr auf).

### 6. Textänderungen

**Schwarzes Brett — Tour-Text:**
- Alt: „Hier können Sie mit Ihren Miteigentümern Informationen austauschen – wie an einem echten Schwarzen Brett im Hausflur, nur digital."
- Neu: „Hier veröffentlicht Ihre Hausverwaltung wichtige Informationen, Aushänge und Mitteilungen rund um Ihre Liegenschaft."
- Schritt „Beitrag schreiben" entfällt.

**Beschlüsse — Tour-Text:**
- Alt: „Hier finden Sie alle gefassten Beschlüsse Ihrer Gemeinschaft – das ist Ihre rechtssichere Übersicht."
- Neu: „Hier finden Sie alle gefassten Beschlüsse Ihrer Gemeinschaft – jederzeit nachlesbar."

### 7. Videos
Aktuell sind in der Tour **keine Videos eingebunden** — es gibt nur ein Slot-Feld `mediaUrl` in den Tour-Schritten, aber keinen Player und keine produzierten Clips. Im Plan und in der ursprünglichen Beschreibung war das so vorgesehen: erst Tour-Gerüst, später iterativ kurze Lottie-/MP4-Clips nachreichen.

Ich schlage zwei Optionen vor — die Auswahl machen wir nach dieser Iteration in einer eigenen Runde:
- **a) Lottie-Clips (20–40 s, animiert)** — leicht, scharf, gut für Senioren, müssen aber gestaltet werden (ich kann das aus einer Beschreibung generieren).
- **b) Bildschirmaufnahmen (MP4)** — schnellste Variante, Sie nehmen mit OBS/Loom kurze Clips auf, ich binde sie ein.

In dieser Iteration baue ich nur den **„▶ Video ansehen"-Knopf inkl. Player-Modal** vorbereitend ein, damit Sie später nur noch Dateien einhängen müssen — ohne Code-Änderung pro Clip.

## Technische Umsetzung (kurz)

- `src/components/weg-owner/onboarding/GuidedTourProvider.tsx`: CSS für `.rgi-tour-popover` neu, dynamische Placement-Funktion, `stagePadding` 12, `smoothScrollIntoView`, Reihenfolge global → seitenspezifisch.
- `src/components/weg-owner/onboarding/tours.ts`: Texte (Schwarzes Brett, Beschlüsse) anpassen, Tour-Schritte für Unterseiten ausbauen, neue `data-tour`-Selektoren referenzieren.
- `src/components/weg-owner/onboarding/HelpButton.tsx`: Menü-Reihenfolge fixieren, Kassenprüfung herausfiltern.
- `TourMediaPlayer.tsx`: neue, kleine Komponente (Modal mit `<video>` oder Lottie), wird in `TourStepCard` eingebunden, wenn `mediaUrl` gesetzt ist.
- Pages unter `src/pages/weg-owner/`: `data-tour`-Attribute ergänzen, Auto-Start-Hook prüfen.

## Nicht in dieser Iteration
- Tatsächliche Video-/Lottie-Inhalte (erst nach Ihrer Auswahl a/b).
- Tour für Mieter-Bereich.
- Mehrsprachigkeit.
