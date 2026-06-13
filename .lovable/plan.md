## Ziel
Auf der öffentlichen Proxy-Seite (`/etv-proxy/<token>`) sollen laufende Abstimmungen sofort erscheinen — sowohl beim erstmaligen/erneuten Öffnen einer Abstimmung durch den Admin als auch nach einem Browser-Reload.

## Ursache
Die Seite ist nicht eingeloggt. Anon hat auf `etv_agenda_items`, `etv_votes`, `etv_attendees` keine SELECT-Policy. Direkt-Queries liefern leer, und Supabase-Realtime liefert für anon ebenfalls keine Postgres-Changes (Realtime wendet RLS an). Deshalb kommt weder ein Live-Push noch funktioniert „Aktualisieren".

## Lösung

### 1. Security-Definer-RPC `get_proxy_meeting_state(p_token uuid)`
Migration anlegen. Validiert Token gegen `etv_attendees.proxy_token` und gibt als JSON zurück:
- `meeting` (id, status, is_secret_ballot, building, meeting_date)
- `assignment` (id, unit_number)
- `active_voting_item` (id, title, description, resolution_text, voting_principle) — nur wenn ein Item `status='voting'` existiert
- `has_voted` (true wenn für `active_voting_item` bereits eine Stimme der eigenen `assignment_id` existiert)
- `live_votes` Aggregat: `yes_count`, `no_count`, `abstain_count`, `yes_mea`, `no_mea`, `abstain_mea`
- `single_votes` (nur wenn `is_secret_ballot=false`): Liste mit Name, Einheit, Stimme
- `agenda_summary`: Liste aller Items mit id/title/status/result
- `attendee_summary`: present_count, proxy_checked_in_count

GRANT EXECUTE TO anon, authenticated.

### 2. EtvProxy.tsx umbauen
- Alle bisherigen direkten Selects auf `etv_agenda_items` / `etv_votes` / `etv_attendees` / `contact_building_assignments` entfernen.
- Eine zentrale React-Query `["proxy-state", token]` ruft die neue RPC.
- `refetchInterval: 3000` (Polling-Fallback, da Realtime für anon nicht zuverlässig).
- `votingItem`, `hasVoted`, `liveVotes`-Aggregate werden aus dem RPC-Result abgeleitet (kein lokaler State mehr nötig für die Sichtbarkeitsumschaltung; nur `selectedVote` und `descOpen` bleiben).
- Beim Übergang von „voting" auf „nicht mehr voting" via Polling: Voting-Overlay schließen, optional Ergebnis-Toast.

### 3. Optionaler Broadcast für sofortigen Push
In `MeetingLiveSession.reopenVotingMutation` und `startVotingMutation` zusätzlich ein Supabase Broadcast auf Kanal `meeting-<meetingId>` senden (`event: 'voting-changed'`). EtvProxy abonniert denselben Broadcast-Kanal (Broadcast benötigt kein RLS) und triggert dann sofort `refetch()` der RPC — so haben wir Push-Latenz nahe Null, ohne auf Postgres-Changes für anon angewiesen zu sein.

### 4. Reopen-Verhalten
Da `reopenVotingMutation` bereits bestehende Votes löscht, liefert die RPC danach `has_voted=false` → das Voting-Overlay erscheint beim Proxy-Nutzer erneut.

## Technische Details
- Neue Migration: `create or replace function public.get_proxy_meeting_state(p_token uuid) returns jsonb language plpgsql security definer set search_path = public ...` + `grant execute on function public.get_proxy_meeting_state(uuid) to anon, authenticated;`
- Keine RLS-Änderungen an Basistabellen nötig.
- `castVoteMutation` bleibt unverändert (geht bereits über `cast-proxy-vote` Edge Function).
- Polling 3 s ist günstig genug; Broadcast macht es zusätzlich „instant".

## Dateien
- neu: `supabase/migrations/<ts>_proxy_meeting_state_rpc.sql`
- edit: `src/pages/EtvProxy.tsx`
- edit: `src/components/meetings/MeetingLiveSession.tsx` (Broadcast bei start/reopen voting)
