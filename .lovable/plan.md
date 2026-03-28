

## Problem Analysis

Three issues:

1. **Other owners dropdown empty**: The `otherOwners` query (line 212) fetches all `contact_building_assignments` with `role_in_building = "eigentuemer"`, but the RLS policy only allows reading YOUR OWN assignments (`user_id = auth.uid()`). Other owners' records are invisible.

2. **No "external" option**: The proxy dialog (line 1136) only has "Verwalter" and "Anderen Eigentümer" — missing the "Externe Person" option.

3. **No external proxy functionality**: No name input, no token generation, no link copy/share UI, no link deactivation on withdrawal.

## Plan

### 1. RLS Policy — Allow owners to see other owners in same building

Add a new migration with a SELECT policy on `contact_building_assignments` that allows authenticated users to see other owners in the same buildings they belong to. This is needed for the proxy dropdown.

```sql
CREATE POLICY "WEG owners can view other owners in same building"
ON contact_building_assignments FOR SELECT TO authenticated
USING (
  building_id IN (
    SELECT cba2.building_id FROM contact_building_assignments cba2
    JOIN contacts c ON c.id = cba2.contact_id
    WHERE c.user_id = auth.uid()
  )
  AND role_in_building = 'eigentuemer'
);
```

Also allow reading the contact names (first_name, last_name, company_name) for these owners:

```sql
CREATE POLICY "WEG owners can view contacts of same building owners"
ON contacts FOR SELECT TO authenticated
USING (
  id IN (
    SELECT cba.contact_id FROM contact_building_assignments cba
    WHERE cba.building_id IN (
      SELECT cba2.building_id FROM contact_building_assignments cba2
      JOIN contacts c ON c.id = cba2.contact_id
      WHERE c.user_id = auth.uid()
    )
    AND cba.role_in_building = 'eigentuemer'
  )
);
```

### 2. Add `proxy_external_name` column to `etv_attendees`

For external proxies, store the name of the external person. Add column via migration:

```sql
ALTER TABLE public.etv_attendees ADD COLUMN proxy_external_name TEXT;
```

### 3. Update owner proxy dialog (`src/pages/weg-owner/Meetings.tsx`)

- Add "Externe Person" as third option in the Select
- When "external" is selected, show a text input for the external person's name
- On submit: generate `proxy_token` via `crypto.randomUUID()`, store `proxy_external_name`, set `proxy_type = "external"`
- After saving, show the token link with copy button
- Update the badge display to show "Extern: [Name]" when proxy type is external
- On withdrawal (`withdrawProxyMutation`): also clear `proxy_token`, `proxy_external_name`, set `proxy_token_used = false` to deactivate the link

### 4. Update proxy status display

In the attendee card (line 671-674), update the badge to also handle `external` type: "Vertreten — durch [External Name]"

### 5. Token link display after proxy is set

When an external proxy is active, show the token link with copy and share buttons directly on the attendee card (similar to how AttendeeManager.tsx already does it on the admin side).

### Files to modify
- **New migration**: RLS policies + `proxy_external_name` column
- **`src/pages/weg-owner/Meetings.tsx`**: proxy dialog (add external option, name input, token generation), withdrawal mutation (clear token), badge display, link copy UI

