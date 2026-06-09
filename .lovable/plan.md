## Änderungen an `src/pages/weg-owner/Files.tsx`

### 1) Farben entfernen
- Im Ordner-Icon: keinen `style={{ backgroundColor: color + "1f", color }}` mehr verwenden.
- Stattdessen neutrale Tokens: `bg-muted text-muted-foreground` für das Icon-Quadrat.
- Card-Hover bleibt neutral (`hover:bg-muted/50`, kein `hover:border-primary/40`).

### 2) Inline-Aufklappen statt Drill-Down
- `selectedCatId` durch ein `expandedIds: Set<string>` ersetzen.
- Klick auf eine Karte toggelt die Kategorie: Karte bleibt sichtbar, darunter erscheinen die Dokumente (oder collapse).
- Kein "Zurück"-Button mehr; mehrere Ordner können gleichzeitig offen sein.
- Layout: statt `grid grid-cols-3` eine vertikale Liste (`space-y-2`), damit aufgeklappte Inhalte sauber unter der jeweiligen Karte stehen. Auf Desktop bleibt die Liste angenehm lesbar (max-width).
- Chevron-Icon (rechts) zeigt offen/zu an.

### 3) Dokument öffnen ohne `about:blank`-Hänger
Aktuell wird `window.open("")` **vor** dem Holen der Signed-URL gerufen. Browser blocken das oft als Popup, oder der Tab bleibt auf `about:blank` stehen, wenn das Edge-Function-Fetch scheitert.

Neuer Ablauf:
- Erst `getSignedUrl(file)` aufrufen (await).
- Bei Erfolg: `window.open(url, "_blank", "noopener,noreferrer")` — direkt mit der echten URL, so dass der neue Tab sofort das PDF lädt und der Browser-Zurück-Button wieder zum App-Tab zurückführt.
- Bei Fehler: Toast wie bisher, **kein** leeres Fenster.
- Loading-Spinner bleibt am Listeneintrag während des Fetches.

### Nicht betroffen
- Daten-Layer (`fetchFiles`, Queries, RLS) bleibt unverändert.
- Tabs-Struktur (Persönlich / Gebäude), Suche, Wirtschaftsjahr-Filter bleiben.
- Keine Backend-Migration nötig.
