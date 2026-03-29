

## Auto-Mark Proxy Holders as "Present" (Represented)

### Problem
When owner A gives a proxy to owner B (or external person), and B checks in as present, owner A remains marked as "absent". The system blocks manual check-in for proxied attendees (`disabled={a.attendance_type === "proxy"}`). The user expects that if the proxy holder is present, the proxied owner should automatically count as "present (represented)".

### Solution
Change the logic so that when a proxy is assigned, the attendee's `attendance_type` is automatically derived from their proxy holder's presence — not manually toggled. The Switch for proxied attendees should reflect whether the proxy holder is checked in.

### Changes to `src/components/meetings/MeetingLiveSession.tsx`

**1. Derive "effective presence" for proxied attendees**

Add a helper function that checks if a proxied attendee's proxy holder is present:
- If `proxy_type === "manager"` → always considered present (manager runs the meeting)
- If `proxy_type === "owner"` → check if the owner with `proxy_contact_id` has an attendee record with `attendance_type === "present"`
- If `proxy_type === "external"` → check if `proxy_token_used === true` OR if the external person has been manually checked in (set `checked_in_at`)

**2. Update the check-in mutation for proxy holders**

When an owner who holds proxies from others is checked in/out, also update the `attendance_type` of all attendees who gave them a proxy:
- Check in owner B → find all attendees where `proxy_type === "owner"` and `proxy_contact_id === B's contact_id` → set their `attendance_type` to `"proxy"` and `checked_in_at` to now
- Check out owner B → set those proxied attendees back to `"absent"` and clear `checked_in_at`

**3. Auto-set proxy attendance when proxy is first assigned**

In `AttendeeManager.tsx`, when a proxy is granted (`setProxyMutation`):
- Set the attendee's `attendance_type` to `"proxy"` immediately (not just the proxy fields)
- If `proxy_type === "manager"`, also set `checked_in_at` to now (manager is always present)
- If `proxy_type === "owner"`, check if proxy holder is already checked in → if yes, set `checked_in_at`

**4. Update the Switch UI for proxied attendees**

Instead of disabling the Switch, show it as checked (green) when the proxy holder is present, with a tooltip "Vertreten durch [Name]". Keep it non-interactive (disabled) but visually reflecting the derived state.

**5. Update quorum calculation (already correct)**

Line 177-178 already counts `attendance_type === "proxy" && checked_in_at` — this will work correctly once we set `checked_in_at` properly on proxy assignment/check-in.

### Changes to `src/components/meetings/AttendeeManager.tsx`

**1. Update `setProxyMutation`** to also set `attendance_type: "proxy"` when granting a proxy.

**2. Add a "remove proxy" action** that resets `attendance_type` back to `"absent"` and clears all proxy fields.

### Files to modify
- `src/components/meetings/MeetingLiveSession.tsx` — checkInMutation cascade, Switch UI
- `src/components/meetings/AttendeeManager.tsx` — setProxyMutation sets attendance_type

