

## Problem

Magnus Göttinger's data is correctly set up — his contact has `user_id` linked, and he has 2 active assignments in Beispielgebäude (unit 0001 as Beirat, unit 0003 as Eigentümer). The issue is **RLS (Row-Level Security)**: the `contact_building_assignments` table only allows admin access. When Magnus (role: `weg_owner`) queries it, Supabase returns zero rows — so the UI shows "not linked".

The same problem applies to the `contacts` table — also admin-only RLS. So the initial `contacts` lookup by `user_id` also fails silently.

## Fix

### 1. Add RLS policies for WEG owners to read their own data

**Migration**: Add SELECT policies so WEG owners can read:
- Their own `contacts` record (where `user_id = auth.uid()`)
- Their own `contact_building_assignments` (via contact → user_id chain)
- Their own `contact_building_shares` (via assignment → contact → user_id chain)

```sql
-- Owners can read their own contact record
CREATE POLICY "WEG owners can view own contact"
ON contacts FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Owners can read their own building assignments
CREATE POLICY "WEG owners can view own building assignments"
ON contact_building_assignments FOR SELECT TO authenticated
USING (
  contact_id IN (
    SELECT id FROM contacts WHERE user_id = auth.uid()
  )
);

-- Owners can read their own building shares
CREATE POLICY "WEG owners can view own building shares"
ON contact_building_shares FOR SELECT TO authenticated
USING (
  assignment_id IN (
    SELECT cba.id FROM contact_building_assignments cba
    JOIN contacts c ON c.id = cba.contact_id
    WHERE c.user_id = auth.uid()
  )
);
```

### 2. No code changes needed

The existing queries in `src/pages/weg-owner/Meetings.tsx` and `src/components/meetings/VotingPopup.tsx` are already correct — they just silently fail due to RLS blocking.

### Files
- **New migration**: 3 RLS policies on `contacts`, `contact_building_assignments`, `contact_building_shares`
- **No application code changes**

