

## Fixes: Attendance Count & Received Proxies Visibility

### Issue 1: "Anwesend" shows -1

**Root cause**: Line 798 calculates `presentCount - proxyCount`. `presentCount` only includes attendees with `attendance_type === "present"` OR `(attendance_type === "proxy" AND checked_in_at IS NOT NULL)`. When nobody is checked in but a proxy is assigned, `proxyCount = 1` and `presentCount = 0`, giving `-1`.

**Fix in `src/components/meetings/MeetingLiveSession.tsx`**:
- Add `physicallyPresent = attendees.filter(a => a.attendance_type === "present").length`
- Use `physicallyPresent` for the "Anwesend" tile (line 798) instead of `presentCount - proxyCount`
- Keep "Vertreten" showing `proxyCount` (only those with `checked_in_at` set)
- Keep the Status tile using `presentCount` (total present + represented)

### Issue 2: Cristina can't see received proxies

**Root cause**: RLS policy on `etv_attendees` only allows WEG owners to SELECT rows where `assignment_id` links to **their own** contact. Received proxies are rows belonging to **other** owners where `proxy_contact_id` = Cristina's contact ID. These rows are blocked by RLS.

**Fix — new RLS policy via migration**:
```sql
CREATE POLICY "WEG owners can view proxies granted to them"
ON public.etv_attendees
FOR SELECT TO authenticated
USING (
  proxy_contact_id IN (
    SELECT c.id FROM contacts c WHERE c.user_id = auth.uid()
  )
);
```

This lets owners read attendee rows where they are the designated proxy holder, without granting broader access.

### Files to modify
1. **`src/components/meetings/MeetingLiveSession.tsx`** — Fix the "Anwesend" stat tile calculation
2. **New migration** — Add RLS policy for proxy visibility on `etv_attendees`

