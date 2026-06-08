## Ziel
Auf der WEG-Owner-Startseite bekommen die Kacheln **Schwarzes Brett**, **Dokumente** und **Versammlungen** ein rotes Zähler-Badge oben rechts (WhatsApp-Stil), sobald es seit dem letzten Besuch neue Einträge gibt. Nach einem Klick auf die Kachel verschwindet das Badge bis zum nächsten neuen Eintrag.

## Wie der „ungelesen"-Status funktioniert
Pro Nutzer und pro Bereich wird ein „zuletzt gesehen"-Zeitstempel in `localStorage` gespeichert (z. B. `rgi:lastSeen:forum:<userId>`, `…:files:<userId>`, `…:meetings:<userId>`).
- **Beim Laden des Dashboards**: für jeden Bereich wird gezählt, wie viele Einträge ein `created_at` (bzw. `published_at` bei Versammlungen) **nach** diesem Zeitstempel haben — beschränkt auf die Gebäude des Nutzers.
- **Beim ersten Aufruf** (kein Wert vorhanden): Zeitstempel wird auf „jetzt" gesetzt → keine alten Einträge erscheinen als ungelesen.
- **Beim Klick auf eine Kachel**: Zeitstempel wird auf „jetzt" aktualisiert, die lokale Zahl im UI sofort auf 0 gesetzt, dann navigiert.

Reine Frontend-Lösung, keine DB-Änderung nötig.

## Zählquellen
- **Schwarzes Brett**: `forum_posts` mit `building_id IN buildingIds`, `management_mode = 'weg'`, `created_at > lastSeen`.
- **Dokumente**: sichtbare Dateien für den Nutzer — gleiche Logik wie `useHasVisibleFiles`, erweitert um Count + `created_at > lastSeen`. Vermutlich `building_files` gefiltert über `building_file_visibility` / Assignments. Genaue Query wird beim Implementieren an `useHasVisibleFiles` angelehnt.
- **Versammlungen**: `etv_meetings` mit `building_id IN buildingIds` und einem Veröffentlichungs-/Erstellungs-Zeitstempel (`published_at` bzw. `created_at`) `> lastSeen`. Nur veröffentlichte Meetings zählen.

## UI-Änderungen
- `src/pages/weg-owner/Dashboard.tsx`:
  - Neue States: `unreadForum`, `unreadFiles`, `unreadMeetings`.
  - Im `load()` zusätzlich die drei Counts ermitteln.
  - `actions`-Array bekommt pro Eintrag ein optionales `unreadCount`.
  - Klick-Handler setzt vor `navigate(path)` den passenden `localStorage`-Key auf `new Date().toISOString()` und den lokalen State auf 0.
- Quick-Action-Button (die Kachel im `Schnellzugriff`-Grid):
  - `relative` Wrapper, das `Icon`-Quadrat bleibt unverändert.
  - Badge: kleines, rundes Pill oben rechts (`absolute -top-1 -right-1`), `bg-red-500 text-white`, `min-w-[20px] h-5 px-1.5 rounded-full`, `text-[11px] font-semibold tabular-nums`, Anzeige `count > 99 ? "99+" : count`. Nur sichtbar wenn `count > 0`.
  - Optional `aria-label` ergänzt um „X neue Einträge".

## Edge Cases
- Nutzer ohne Gebäude → alle Counts = 0, keine Badges.
- „Dokumente"-Kachel wird ohnehin nur gerendert wenn `hasVisibleFiles` — Badge-Logik daran gekoppelt.
- `localStorage` nicht verfügbar (SSR/Private Mode) → defensive `try/catch`, im Zweifel Count = 0.
- Mehrere Tabs: beim Fokus-Event `visibilitychange` werden die Counts neu geladen, damit ein Mark-as-read in Tab A sich in Tab B aktualisiert (leichte Verbesserung, optional).

## Out of scope
- Keine serverseitige „read receipts"-Tabelle.
- Keine Push-Benachrichtigungen.
- Andere Tiles (Chat, Meldungen, Beschlüsse) bleiben unverändert — die haben bereits eigene Zähler.
