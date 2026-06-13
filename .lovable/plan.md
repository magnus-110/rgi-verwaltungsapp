## Ziel
Die Live-Abstimmung soll über den öffentlichen Proxy-Link auf iPhone/Safari zuverlässig erscheinen – genauso wie im eingeloggten Owner-Portal.

## Beobachtete Ursache
Der eingeloggte Bereich bekommt Live-Updates über normale Datenbank-Realtime-Events. Der Proxy-Link nutzt dagegen eine eigene RPC-Abfrage plus Broadcast/Polling. Auf iPhone/Safari ist dieser Push-Pfad weiterhin unzuverlässig; außerdem zeigt die Fehleransicht aktuell keine konkrete Fehlermeldung, wodurch die Diagnose erschwert wird.

## Umsetzung
1. **Proxy-Link auf DB-Realtime statt Broadcast absichern**
   - In `EtvProxy.tsx` zusätzlich zu Polling/Broadcast eine Realtime-Subscription auf `etv_agenda_items` für die Meeting-ID einbauen.
   - Bei Änderungen an TOP-Status (`voting`, `closed`, `voted`, `open`) sofort `refetch()` auslösen.
   - Cleanup mit `supabase.removeChannel(channel)` beibehalten.

2. **Polling robuster machen**
   - Polling kurzzeitig beschleunigen, wenn die Versammlung läuft oder eine Abstimmung aktiv ist.
   - iPhone-Wake-Events (`visibilitychange`, `pageshow`, `focus`) bleiben erhalten.
   - Optional zusätzliche `online`-Refetch-Logik ergänzen.

3. **Fehler sichtbar machen**
   - In der Proxy-Fehlerkarte die echte Fehlermeldung anzeigen, z. B. RPC-/Netzwerkfehler statt nur „Ein unerwarteter Fehler ist aufgetreten“.
   - Dadurch sieht man beim nächsten iPhone-Test sofort, ob es ein Token-, RPC-, Netzwerk- oder Berechtigungsproblem ist.

4. **Admin-Senden vereinheitlichen**
   - Beim Starten/erneuten Öffnen/Beenden einer Abstimmung weiterhin Query-Invalidation nutzen.
   - Broadcast bleibt als Zusatz bestehen, aber die Proxy-Seite verlässt sich nicht mehr ausschließlich darauf.

## Dateien
- `src/pages/EtvProxy.tsx`
- ggf. kleiner Zusatz in `src/components/meetings/MeetingLiveSession.tsx`, falls das Beenden der Abstimmung ebenfalls einen expliziten Push auslösen soll.

## Nicht enthalten
- Keine Änderung am Abstimmungsmodell.
- Keine Änderung an Vollmacht-Erstellung oder Einlösung.
- Keine neue Datenbanktabelle.