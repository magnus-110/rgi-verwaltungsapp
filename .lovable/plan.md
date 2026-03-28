

## Problem

Currently the system treats each owner as having **one** assignment per building. But owners can have multiple units (e.g. Magnus Göttinger has 2 units in one building and 1 in another). Each unit assignment should have its own:
- Attendee record (for check-in/quorum)
- Proxy (Vollmacht) — independently per unit
- Vote — independently per unit

The root issue: everywhere the code uses `.maybeSingle()` or `.limit(1)` to find the owner's `contact_building_assignment`, which only returns 1 of potentially N assignments.

## Plan

### 1. Owner Portal — Multi-Assignment Support (`src/pages/weg-owner/Meetings.tsx`)

**Query change**: `myAssignment` query (line 125-147) must return an **array** of all assignments (with `unit_number`) instead of a single record. Rename to `myAssignments`.

**Auto-register**: Create attendee records for ALL assignments, not just one (line 166-199).

**Proxy UI**: Replace the single proxy section (line 632-708) with a **loop over each assignment**. Each unit shows:
- Unit number + status badge
- Its own "Vollmacht erteilen" / "zurückziehen" button
- The proxy/attendee mutations must accept an `assignmentId` and `attendeeId` parameter

**Attendee query**: `myAttendee` (line 150-163) becomes `myAttendees` — fetch all attendee records for all of the user's assignments in this meeting.

### 2. Global Voting Popup — Multi-Unit Voting (`src/components/meetings/VotingPopup.tsx`)

**Assignment lookup** (line 45-51): Change `.maybeSingle()` to return all assignments. Store as array.

**Vote submission**: When a vote is cast, insert a vote for **each** assignment that has an attendee record with `attendance_type !== "proxy"`. Each vote carries its own MEA/SQM weight from the respective assignment's shares.

**UI**: Show which units are being voted for (e.g. "Sie stimmen für 2 Einheiten ab: 0001, 0002").

### 3. Admin Attendee Manager (`src/components/meetings/AttendeeManager.tsx`)

Already loads all `contact_building_assignments` as separate attendee rows — **no changes needed**. Each unit is already a separate attendee entry on the admin side.

### Files to modify
- `src/pages/weg-owner/Meetings.tsx` — main changes (multi-assignment queries, per-unit proxy UI)
- `src/components/meetings/VotingPopup.tsx` — multi-assignment voting
- No database schema changes needed (the data model already supports this via `contact_building_assignments` + `etv_attendees`)

