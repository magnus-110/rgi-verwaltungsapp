# Fehler "Diese Seite konnte nicht geladen werden" (Zeiterfassung)

## Wie es dazu kommt

Die Zeiterfassung wird an zwei Stellen gleichzeitig verwendet: in der Erinnerung, die im Hintergrund der ganzen Verwaltungsansicht läuft, und im Zeiterfassungs-Button auf dem Dashboard. Beide öffnen eine Live-Verbindung mit exakt demselben Namen (`timeclock-<Benutzer-ID>`).

Die zweite Stelle erhält dadurch die bereits laufende Verbindung der ersten und versucht, nachträglich einen Zuhörer anzuhängen. Genau das ist nicht erlaubt und löst die gezeigte Meldung aus. Weil der Fehler beim Aufbau der Seite auftritt, bricht die ganze Seite ab statt nur die Live-Aktualisierung.

## Was geändert wird

1. Jede Verwendung bekommt einen eigenen, eindeutigen Verbindungsnamen, sodass sich die beiden Stellen nicht mehr in die Quere kommen.
2. Der Verbindungsaufbau wird abgesichert: Schlägt er fehl, bleibt die Seite trotzdem nutzbar (nur ohne sofortige Live-Aktualisierung), statt komplett abzubrechen.

## Technische Details

- `src/hooks/useTimeClock.ts`: In `useActiveTimeEntry` den Channel-Namen pro Hook-Instanz eindeutig machen (z. B. `timeclock-${uid}-${useId()}` bzw. eine in einem `useRef` gehaltene `crypto.randomUUID()`), damit kein Topic-Reuse eines bereits subscribten Channels stattfindet.
- Denselben `useEffect` in ein `try/catch` legen und im Fehlerfall nur `console.warn` ausgeben, damit ein Realtime-Fehler nicht bis zur ErrorBoundary hochschlägt; Cleanup weiterhin über `supabase.removeChannel`.
- Keine Datenbank- oder Edge-Function-Änderungen nötig.
