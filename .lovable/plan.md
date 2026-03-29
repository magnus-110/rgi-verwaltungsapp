

## Fix Voting Results, Fullscreen Popup, Owner Live Dashboard, Proxy Badges

### Issues Identified

1. **Voting result possibly wrong**: The `computeResult` function in `MeetingLiveSession.tsx` (line 221) is correct for headcount (`yesVotes.length > noVotes.length`), so 2 yes vs 1 no should show "passed". The likely cause: the voting principle is set to **MEA** (not headcount), and the `mea_weight` stored in votes is 0 (because the VotingPopup or pre-vote logic didn't correctly fetch MEA weights). When all MEA weights are 0, `totalVotedMea = 0` → `yesMea > 0/2` is false → "failed". Need to verify and fix MEA weight propagation in VotingPopup's `castVoteMutation`.

2. **VotingPopup not fullscreen**: Currently `max-w-lg w-[95vw]` — needs to be truly fullscreen (`fixed inset-0 z-50` or `max-w-none w-screen h-screen`).

3. **No owner live dashboard**: When owners click into a meeting, they see TOPs and proxy management but no live voting results, quorum status, or attendance stats like the admin cockpit shows.

4. **No proxy badge in admin voting list**: In `MeetingLiveSession.tsx` lines 655-682, the manual vote rows only show the contact name — no unit number badge and no proxy badge (unlike the attendance list at line 880-889).

---

### Plan

#### 1. Make VotingPopup fullscreen (`VotingPopup.tsx`)

Replace the `DialogContent` with a fullscreen overlay using `fixed inset-0 z-[100]` instead of the centered dialog. Content centered vertically with large buttons. Remove `Dialog` wrapper entirely and use a custom fullscreen div with backdrop.

#### 2. Fix result display — add unit number + proxy badge to admin voting rows (`MeetingLiveSession.tsx`)

In the "Manuelle Stimmabgabe" sections (lines ~655-682 and ~471-503), for each attendee row:
- Show unit number badge: `E{cba.unit_number}` (like the attendance list)
- Show proxy badge if `a.proxy_type` is set: blue badge with "v.d. Verwalter/Eigentümer/Extern" (same logic as attendance list lines 882-889)

#### 3. Add live dashboard section to owner meeting view (`src/pages/weg-owner/Meetings.tsx`)

When an owner views a meeting that is `in_progress`:
- Add a "Live Dashboard" card at the top showing:
  - Quorum status (present/represented count, MEA quota)
  - Current TOP being voted on
  - Live voting results (Ja/Nein/Enthaltung counts) with realtime subscription
  - Voted TOPs with results (passed/failed badges)
- Subscribe to `etv_agenda_items` changes via Supabase Realtime
- Subscribe to `etv_votes` changes for the active voting item

#### 4. Debug MEA weight issue in vote casting

Check that `VotingPopup.tsx`'s `castVoteMutation` correctly passes `mea_weight` from `assignment.mea_weight` — it does (line 185). The issue may be that the `contact_building_shares` query in `checkVotingForItem` isn't returning data due to RLS. Verify the RLS policy on `contact_building_shares` allows `weg_owner` to read their own shares (it does — line-level check shows the SELECT policy exists). If shares are still 0, add a fallback: look up the share server-side or ensure the query returns correctly.

### Files to modify
- `src/components/meetings/VotingPopup.tsx` — fullscreen overlay, verify MEA weight
- `src/components/meetings/MeetingLiveSession.tsx` — add unit number + proxy badges to voting rows
- `src/pages/weg-owner/Meetings.tsx` — add live dashboard section for in-progress meetings

