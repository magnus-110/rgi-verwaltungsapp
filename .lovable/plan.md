

## Fix VotingPopup: Make It Work for All Participants

### Problems Identified

1. **VotingPopup only lives in `WegOwnerLayout`** — only `weg_owner` role users see it. Admins on the `/versammlungen` page (admin layout) never see it (expected), but the filter on line 25 (`profile?.role !== "weg_owner"`) and line 148 blocks everyone else.

2. **Line 69 skips proxy holders**: `if (!attendee || attendee.attendance_type === "proxy") continue;` — this skips units where the owner gave a proxy. But the popup never looks for units where the current user *received* a proxy from someone else (via `proxy_contact_id`).

3. **EtvProxy page has NO voting UI** — external proxy holders see a static info page with no realtime voting capability.

4. **Initial load problem**: The popup only listens for UPDATE events. If the owner opens the app AFTER voting already started, they won't see the popup (no UPDATE fires for them).

---

### Plan

#### 1. Fix VotingPopup to include proxy-received units (`VotingPopup.tsx`)

After fetching the user's own assignments (lines 50-90), add a second query:
- Query `etv_attendees` where `proxy_contact_id = contact.id` AND `meeting_id = meeting.id` AND `attendance_type = "proxy"`
- For each such attendee, fetch the linked `assignment_id`, get the assignment's `unit_number` and MEA share
- Check for existing votes, then add to `validAssignments`
- This ensures a proxy holder votes for all units they represent

#### 2. Add initial check on mount (`VotingPopup.tsx`)

Add a second `useEffect` that runs on mount (when the component first loads):
- Query `etv_agenda_items` where `status = 'voting'`
- For each found item, run the same logic as the realtime handler to check if the user should vote
- This handles the case where the user opens the app after voting already started

#### 3. Add expandable description to VotingPopup

Add a toggle state. Below the TOP title, show a "Beschreibung anzeigen" link that expands `votingItem.description` if present.

#### 4. Add voting UI to EtvProxy page (`EtvProxy.tsx`)

For external proxy holders accessing via token link:
- Add Supabase Realtime subscription listening for `etv_agenda_items` UPDATE to `status = 'voting'`
- Filter to only the meeting this proxy is for (from the token data)
- When voting starts, show a voting overlay (similar to VotingPopup) with Ja/Nein/Enthaltung buttons
- Cast votes using the attendee's `assignment_id` from the token data
- Also check on initial load if a vote is already active

#### 5. Keep existing filters correct

- Own units with `attendance_type === "proxy"` (gave proxy away) are correctly skipped
- Only add units where user is the proxy *holder* (received proxy)

### Files to modify
- `src/components/meetings/VotingPopup.tsx` — add proxy-received units query, initial load check, expandable description
- `src/pages/EtvProxy.tsx` — add realtime voting UI for external proxy holders

