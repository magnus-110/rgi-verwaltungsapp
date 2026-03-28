

## Problem

The `etv_attendees` table has **15 duplicate rows** for Magnus Göttinger — 8 rows for assignment `0cb25a7f` (unit 0001/Beirat) and 7 rows for assignment `8556ff2e` (unit 0003/Eigentümer). Each assignment should have exactly **one** row per meeting.

**Root causes:**
1. The auto-init logic (`initMutation`) ran multiple times, inserting duplicates because there's no unique constraint on `(meeting_id, assignment_id)`
2. Proxy mutations insert new rows or don't clean up old ones properly

## Plan

### 1. Database migration: Clean up duplicates + add unique constraint

```sql
-- Keep only the most recent row per (meeting_id, assignment_id)
DELETE FROM etv_attendees
WHERE id NOT IN (
  SELECT DISTINCT ON (meeting_id, assignment_id) id
  FROM etv_attendees
  ORDER BY meeting_id, assignment_id, created_at DESC
);

-- Prevent future duplicates
ALTER TABLE etv_attendees
ADD CONSTRAINT etv_attendees_meeting_assignment_unique
UNIQUE (meeting_id, assignment_id);
```

### 2. Fix `AttendeeManager.tsx` init logic

Update the `initMutation` to use `upsert` instead of `insert` so re-runs are idempotent:
```typescript
const { error } = await supabase
  .from("etv_attendees")
  .upsert(newAttendees, { onConflict: "meeting_id,assignment_id" });
```

### 3. Fix auto-init guard

The `autoInitRef` guard is fragile — if the query refetches and returns 0 attendees temporarily (e.g. RLS race), it re-triggers. Add the `meetingId` to the ref tracking to make it more robust, and also check `loadingAttendees` is stable before running.

### Files
- **New migration**: Delete duplicates + add unique constraint
- **`src/components/meetings/AttendeeManager.tsx`**: Change `insert` to `upsert`, improve auto-init guard

