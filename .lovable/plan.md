

## Fix VotingPopup: Larger Dialog, Per-Unit Pagination, Confirmation Step, Fix RLS

### Problems
1. **Dialog too small** — `max-w-md` is cramped
2. **Votes not saving** — RLS INSERT policy on `etv_votes` requires `c.user_id = auth.uid()`, which fails for proxy holders voting on someone else's unit. External proxy holders (no auth) can't insert at all.
3. **No confirmation step** — votes are cast immediately on button click
4. **Multiple units vote all at once** — user with 3 units votes identically for all with one click; should be per-unit with separate pages

### Plan

#### 1. Fix RLS on `etv_votes` (migration)

Update the INSERT policy to also allow proxy holders:
```sql
-- Drop old policy
DROP POLICY "WEG owners can insert their own votes" ON etv_votes;

-- New policy: allow insert if user owns the unit OR is the proxy holder
CREATE POLICY "Owners and proxy holders can insert votes" ON etv_votes
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM etv_attendees ea
    JOIN contact_building_assignments cba ON cba.id = ea.assignment_id
    JOIN contacts c ON c.id = cba.contact_id
    WHERE ea.assignment_id = etv_votes.assignment_id
    AND (c.user_id = auth.uid() OR ea.proxy_contact_id = (
      SELECT id FROM contacts WHERE user_id = auth.uid() LIMIT 1
    ))
  )
);
```

For external proxy holders (unauthenticated), create an edge function `cast-proxy-vote` that validates the proxy token and inserts the vote server-side with service role key.

#### 2. Rewrite VotingPopup with per-unit pagination (`VotingPopup.tsx`)

- **`currentUnitIndex`** state tracks which unit (0-based) the user is voting for
- Show one unit at a time: unit number, TOP title, expandable description, resolution text
- Three vote buttons (Ja/Nein/Enthaltung) set a **local selection** state — not submitted yet
- **Confirm button** ("Stimme bestätigen") appears after selection, submits only that unit's vote
- On confirm success, advance to next unit (`currentUnitIndex + 1`)
- After last unit, show success screen, then close
- Progress indicator: "Einheit 1 von 3" with dots/steps
- Dialog size: `max-w-lg` with more padding

#### 3. Update EtvProxy voting UI (`EtvProxy.tsx`)

- Same confirmation flow (select then confirm)
- Call new `cast-proxy-vote` edge function instead of direct supabase insert
- Larger card layout

#### 4. Create `cast-proxy-vote` edge function

- Accepts `{ token, agenda_item_id, vote }`
- Validates token against `etv_attendees.proxy_token`
- Fetches assignment_id and MEA weight
- Inserts vote with service role client
- Returns success/error

### Files to modify
- **Migration**: Update RLS policy on `etv_votes`
- `src/components/meetings/VotingPopup.tsx` — per-unit pagination, confirmation step, larger dialog
- `src/pages/EtvProxy.tsx` — confirmation step, call edge function
- `supabase/functions/cast-proxy-vote/index.ts` — new edge function for external votes

