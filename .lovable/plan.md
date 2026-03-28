

## Problem

1. **Proxy name not shown**: When a proxy is assigned to another owner, the badge only says "durch Eigentümer" — it doesn't show the actual name (e.g. "durch Cristina van Praag"). The `myAttendees` query fetches `select("*")` which includes `proxy_contact_id` but not the related contact's name.

2. **External proxy link not prominent enough**: The link exists but is small and lacks explanation text for how to share it.

## Plan

### 1. Enhance `myAttendees` query to include proxy contact name

Change the query from `select("*")` to include the proxy contact's name:
```typescript
.select("*, proxy_contact:contacts!proxy_contact_id(first_name, last_name, company_name)")
```

This joins the `contacts` table via `proxy_contact_id` so we get the proxy's name.

### 2. Update badge display to show actual name

In the attendee card (line 686-688), update the badge text:
- **Manager**: "Vollmacht: Verwalter" (keep as is)
- **Owner**: "Vollmacht: [First Last Name]" — use the joined contact data
- **External**: "Vollmacht: [External Name]" (already works via `proxy_external_name`)

### 3. Improve external proxy link section

When an external proxy is active, show a more prominent card with:
- Explanation text: "Teilen Sie diesen Link mit der bevollmächtigten Person. Über den Link kann sie an Abstimmungen teilnehmen. Der Link ist gültig bis die Vollmacht zurückgezogen wird."
- Larger, more visible link display
- Copy button + native Share button (if `navigator.share` is available)

### Files to modify
- **`src/pages/weg-owner/Meetings.tsx`**: attendees query select, badge display, external link section

