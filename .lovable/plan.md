## Pre-Voting Instructions (Weisungsbefugnis) — Implemented

### Owner Portal (`src/pages/weg-owner/Meetings.tsx`)
- Owners who granted a proxy can open a **"Weisungen bearbeiten"** dialog from the proxy detail view
- Per agenda item (TOP), they choose: **Ja**, **Nein**, **Enthaltung**, or **Frei** (free discretion)
- Instructions are saved to `etv_attendees.pre_vote_instructions` (JSONB)
- A badge on the proxy card shows the number of set instructions (e.g., "3 W.")
- Instructions become read-only when proxy is locked (1h before meeting)
- The "Received Proxies" detail dialog now shows instructions with TOP names and color-coded vote labels

### Admin Live Voting (`src/components/meetings/LiveVotingManager.tsx`)
- When an admin starts a vote on a TOP, the system **auto-casts** votes for proxy attendees who have matching pre_vote_instructions
- Auto-cast votes use `is_manual_override: false` to distinguish from admin-entered votes
- In the manual vote list, attendees with pre-vote instructions show a "Weisung" badge
- The admin can still override any auto-cast vote manually

### Data Format
```json
// etv_attendees.pre_vote_instructions
{
  "<agenda_item_uuid>": "yes" | "no" | "abstain"
}
```
Items not listed = free discretion for the proxy holder.
