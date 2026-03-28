

## Problem

1. **No real-time updates**: After setting a proxy, the badge doesn't update instantly — user must manually refetch
2. **Withdraw proxy has no confirmation**: Clicking "Zurückziehen" immediately executes without asking
3. **External proxy link disappears**: Link is only copied to clipboard on save, not persistently shown
4. **Proxy info not clickable**: User wants to tap the entire proxy card/badge area to open a detail dialog showing all info (proxy name, type, link for external)

## Plan

### 1. Add Supabase Realtime subscription for attendees

Subscribe to `etv_attendees` changes for the selected meeting. On any INSERT/UPDATE, invalidate the `my-attendees` query so badges update instantly after proxy assignment/withdrawal.

```typescript
useEffect(() => {
  if (!selectedMeetingId) return;
  const channel = supabase
    .channel(`attendees-${selectedMeetingId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'etv_attendees', filter: `meeting_id=eq.${selectedMeetingId}` },
      () => queryClient.invalidateQueries({ queryKey: ["my-attendees"] })
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, [selectedMeetingId]);
```

### 2. Add AlertDialog confirmation for proxy withdrawal

Replace the direct `withdrawProxyMutation.mutate()` call with a state-driven AlertDialog asking "Vollmacht wirklich zurückziehen?" with Cancel/Confirm buttons.

New state: `withdrawAttendeeId` — when set, shows the AlertDialog. On confirm, calls `withdrawProxyMutation.mutate(withdrawAttendeeId)`.

### 3. Replace inline proxy display with clickable detail dialog

Replace the current layout (badge + external link card + buttons in each assignment card) with:

- **The entire proxy area is a clickable card** — tapping it opens a `proxyDetailAttendeeId` dialog
- **The dialog shows**:
  - Proxy type (Verwalter / Eigentümer / Extern)
  - Proxy name
  - For external: the link with copy + share buttons + explanation text
  - "Vollmacht zurückziehen" button (which triggers the confirmation AlertDialog)
- **When no proxy is set**: tapping the card opens the existing proxy assignment dialog

This consolidates the UI: one tap = see everything or assign.

### 4. Mobile-optimized layout

- Cards use full width, no `justify-between` with side-by-side layout
- Badge is prominent and tappable
- External link section uses word-break for long URLs on small screens

### Files to modify
- **`src/pages/weg-owner/Meetings.tsx`**: realtime subscription, withdrawal confirmation, clickable proxy detail dialog, mobile layout

