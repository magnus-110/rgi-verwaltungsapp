## Ziel
Vollmacht-Link `/etv-proxy/<token>` muss auch auf iPhone (Safari iOS) zuverlässig die laufende Abstimmung anzeigen — sowohl beim ersten Start einer Abstimmung als auch beim erneuten Öffnen.

## Ursache (vermutet)
iOS Safari pausiert/drosselt `setInterval`-basierte React-Query-Polls und beendet WebSocket-Verbindungen still, sobald der Tab kurz in den Hintergrund geht oder das Display dimmt. Beim Zurückkehren wird nicht automatisch neu gepollt. Auf Android Chrome funktioniert beides — daher Symptom „nur iPhone betroffen".

## Lösung in `src/pages/EtvProxy.tsx`

1. **Eigener `setInterval`-Poll statt React-Query-Intervall**
   - `refetchInterval` aus der useQuery entfernen.
   - Eigener `useEffect` mit `setInterval(() => refetch(), 3000)`. Beim Unmount aufräumen.

2. **iOS-Safari-spezifische Wake-Up-Hooks**
   - `document.addEventListener('visibilitychange', ...)` → bei `visibilityState === 'visible'` sofort `refetch()` aufrufen UND eine frische Realtime-Channel-Subscription neu aufbauen (alte schließen).
   - `window.addEventListener('pageshow', ...)` → wichtig für iOS-Safari bfcache (zurück-Navigation, Tab-Wechsel). Bei `event.persisted === true` sofort `refetch()`.
   - `window.addEventListener('focus', ...)` → zusätzliche Absicherung.

3. **Realtime-Channel robuster machen**
   - Channel auf `meeting-broadcast-<meetingId>` wird heute einmal aufgebaut. Wir packen ihn in eine `useEffect`, die bei Sichtbarkeitswechsel den Channel verwirft und neu anlegt (über einen `ref`-gesteuerten Re-Subscribe-Counter), damit nach iOS-Aufwachen wieder Empfang besteht.

4. **Sichtbares „Live"-Indikator + Notlösung**
   - Kleiner Hinweis unten („Aktualisiert: HH:mm:ss") aus dem letzten erfolgreichen Refetch-Zeitpunkt.
   - „Jetzt aktualisieren"-Button (Sekundär), der `refetch()` manuell triggert — falls iOS doch mal alles einfriert, hat der Bevollmächtigte einen Notausstieg.

5. **Diagnose-Logging**
   - `console.info('[proxy] poll tick', new Date().toISOString())` und `console.info('[proxy] visibility', ...)` einbauen, damit ein eventueller Folgefehler über Safari-Web-Inspector schnell auffindbar ist.

## Out of Scope
- Keine Änderung an `cast-proxy-vote`, RPC `get_proxy_meeting_state`, MeetingLiveSession Broadcast oder Migrationen.
- Keine PWA-/Service-Worker-Änderungen.

## Geänderte Dateien
- `src/pages/EtvProxy.tsx` (UI + Hooks)
