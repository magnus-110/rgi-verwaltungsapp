

## Realtime Voting Updates, Anonymous/Public Toggle, Proxy Live Dashboard

### Changes

#### 1. Migration: Add `is_secret_ballot` column to `etv_meetings`
- `ALTER TABLE etv_meetings ADD COLUMN is_secret_ballot boolean NOT NULL DEFAULT true;`
- Default to secret (anonymous) voting — admin can toggle to public

#### 2. Admin UI: Add anonymous/public toggle (`MeetingLiveSession.tsx`)
- In the overview dashboard area (around line 847), add a Switch labeled "Geheime Abstimmung" that toggles `is_secret_ballot` on the meeting
- New mutation to update `etv_meetings.is_secret_ballot`

#### 3. Realtime for VotingPopup (`VotingPopup.tsx`)
- Currently uses `refetchInterval: 2000` for votes in admin — replace/supplement with Supabase Realtime channel on `etv_votes` for live updates
- The VotingPopup already has realtime for `etv_agenda_items` — this is working. Just ensure the realtime subscription triggers immediately (no polling delay)

#### 4. Show live results to owners in VotingPopup after voting (`VotingPopup.tsx`)
- After the user has voted for all their units (`allDone` state), instead of auto-closing after 2s, show live voting results (Ja/Nein/Enthaltung counts) with realtime subscription on `etv_votes`
- If `is_secret_ballot === false` (public), also show who voted what (fetch votes with assignment contact names)
- Keep showing until the voting item status changes away from "voting" (realtime already handles this)

#### 5. Show live results in OwnerLiveDashboard (`OwnerLiveDashboard.tsx`)
- Already has realtime for votes and agenda items — good
- If meeting `is_secret_ballot === false`, show per-voter breakdown (who voted what) in addition to counts
- Fetch the meeting's `is_secret_ballot` flag

#### 6. Add Live Dashboard to EtvProxy page (`EtvProxy.tsx`)
- When no voting is active, show a simplified live dashboard similar to `OwnerLiveDashboard`:
  - Quorum status (present count / total)
  - Active voting item with live results (Ja/Nein/Enthaltung)
  - If public ballot, show who voted what
- Use Supabase Realtime on `etv_votes` and `etv_attendees` for the meeting
- After casting vote, show live results instead of auto-closing

#### 7. Update `get_attendee_by_proxy_token` RPC
- Also return `is_secret_ballot` from the meeting in the JSON so the proxy page knows the voting mode

### Files to modify
- **Migration**: Add `is_secret_ballot` to `etv_meetings`
- **DB function**: Update `get_attendee_by_proxy_token` to include `is_secret_ballot`
- `src/components/meetings/MeetingLiveSession.tsx` — add secret ballot toggle
- `src/components/meetings/VotingPopup.tsx` — show live results after voting, respect public/secret
- `src/components/meetings/OwnerLiveDashboard.tsx` — show voter names when public
- `src/pages/EtvProxy.tsx` — add live dashboard, show results after voting

