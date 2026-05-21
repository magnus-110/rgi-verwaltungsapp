## Problem

Im externen Token-Link (`EtvProxy`) erscheint der Abstimmungsdialog sofort, sobald der Admin eine Abstimmung freischaltet. Im eingeloggten Owner-Portal (`/weg-owner/...`) passiert dagegen nichts in Echtzeit — der Nutzer muss die Seite neu laden, damit der `VotingPopup` erscheint oder der Agenda-Status auf „Abstimmung läuft" springt.

## Ursachenanalyse

- `etv_agenda_items` ist korrekt in `supabase_realtime` publiziert und hat `REPLICA IDENTITY FULL`. Realtime ist serverseitig also bereit.
- `VotingPopup` (global in `WegOwnerLayout` gemountet) abonniert zwar `postgres_changes` auf `etv_agenda_items`, hat aber drei Schwachstellen:
  1. Das Subscription-`useEffect` hat `votingItem?.id` und `checkVotingForItem` (das wiederum von `profile?.user_id` abhängt) als Dependencies → der Channel wird bei jeder Zustandsänderung neu auf-/abgebaut, dabei können UPDATE-Events verloren gehen.
  2. Es gibt keinen expliziten `supabase.realtime.setAuth(accessToken)`-Aufruf nach Login. Bei RLS-gefilterten `postgres_changes` für authentifizierte Nutzer ist das in vielen Setups nötig, sonst werden Events serverseitig verworfen (genau das erklärt, warum der unauth. Proxy-Link funktioniert, der eingeloggte Owner aber nicht).
  3. Es existiert kein Fallback-Polling. Wenn der WebSocket aus irgendeinem Grund kurz disconnected, bleibt der Popup für immer aus.
- Die Detailansicht in `src/pages/weg-owner/Meetings.tsx` abonniert nur `etv_attendees`, nicht `etv_agenda_items` und nicht `etv_votes`. Selbst wenn der Popup erscheint, aktualisiert sich der Status „Abstimmung läuft" / „Geschlossen" sowie die Live-Ergebnisse in der geöffneten Versammlungs-Detailansicht nicht ohne Reload.

## Lösung

### 1. Realtime-Auth zentral setzen
- In `src/integrations/supabase/client.ts` (bzw. `src/hooks/useAuth.tsx`) nach jedem `onAuthStateChange` / `getSession` `supabase.realtime.setAuth(session?.access_token ?? null)` aufrufen, damit RLS-gefilterte Postgres-Changes für eingeloggte Nutzer geliefert werden.

### 2. `VotingPopup` stabilisieren
- Subscription-`useEffect` so umbauen, dass es nur von `profile?.user_id` und `profile?.role` abhängt — Channel bleibt während der gesamten Session offen.
- Dazu `votingItem`/`checkVotingForItem` via `useRef` referenzieren, damit der Handler immer die aktuelle Funktion aufruft, ohne dass die Subscription neu aufgebaut wird.
- Beim WebSocket-Reconnect (`SUBSCRIBED`-Event) einmalig `checkActiveVotes()` ausführen, um verpasste Statuswechsel nachzuholen.
- Zusätzlich leichter Fallback-Polling-Interval (z. B. alle 15 s) auf „gibt es offene Agenda-Items mit status='voting' in meinen Buildings" — als Sicherheitsnetz.

### 3. Live-Update in der Versammlungs-Detailansicht
- In `src/pages/weg-owner/Meetings.tsx` einen zweiten Realtime-Channel `owner-agenda-${selectedMeetingId}` einrichten, der `etv_agenda_items` (filter `meeting_id=eq.…`) und `etv_votes` abonniert und die jeweiligen React-Query-Caches (`weg-owner-agenda`, ggf. Live-Vote-Queries) invalidiert.

### 4. Verifizierung
- In zwei Browser-Sessions testen: Admin schaltet TOP auf „voting" → Owner-Portal soll den `VotingPopup` ohne Reload zeigen. Admin schließt Abstimmung → Popup verschwindet und Detailansicht zeigt Ergebnis live.
- Edge-Function-Logs / Console auf eventuelle Realtime-Errors prüfen.

## Betroffene Dateien
- `src/hooks/useAuth.tsx` (oder `src/integrations/supabase/client.ts`) — `realtime.setAuth` setzen
- `src/components/meetings/VotingPopup.tsx` — Subscription-Refactor + Fallback-Polling
- `src/pages/weg-owner/Meetings.tsx` — zusätzlicher Realtime-Channel für Agenda/Votes

Keine DB- oder Edge-Function-Änderungen nötig.
