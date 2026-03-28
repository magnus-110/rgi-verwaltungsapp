

## Redesign: Meeting Live Session Dashboard

### Current State
The "Durchführung" tab renders three separate `Card` components stacked vertically:
1. Eröffnung & Quorum card
2. Anwesenheitsliste & Vollmachten card  
3. Tagesordnungspunkte card

This feels disconnected and takes a lot of vertical space.

### New Layout: Unified Dashboard

Replace the three cards with a single cohesive dashboard using a grid layout:

```text
┌──────────────────────────────────────────────────────┐
│  VERSAMMLUNGS-COCKPIT                                │
├────────────┬────────────┬────────────┬───────────────┤
│  Anwesend  │  Vertreten │  MEA-Quote │   Status      │
│    1/3     │     0      │   33.3%    │ Beschlussfähig│
│  ████░░░░  │            │  ████░░░░  │   ● Grün      │
├────────────┴────────────┴────────────┴───────────────┤
│  [Versammlung eröffnen]        [Versammlung schließen]│
├──────────────────────────────────────────────────────┤
│  ANWESENHEIT                        [Eigentümer laden]│
│  ┌─ Magnus Göttinger  E0001  v.d. Andreas G.  [⬤] ──┐│
│  ├─ Magnus Göttinger  E0003  v.d. Cristina   [⬤] ──┤│
│  └─ Cristina van P.   E0002                  [ ] ──┘│
├──────────────────────────────────────────────────────┤
│  TAGESORDNUNG                   [+ Geschäftsbeschluss]│
│  TOP 1  Begrüßung                         ● Offen   >│
│  TOP 2  Jahresabrechnung          ✓ Angenommen       >│
│  TOP 3  Wirtschaftsplan           ✗ Abgelehnt        >│
└──────────────────────────────────────────────────────┘
```

### Design Details

1. **Stats bar** — 4 compact metric tiles in a responsive grid (`grid-cols-2 md:grid-cols-4`) replacing the quorum card. Each shows: icon, value, label, and a subtle colored background. No card borders, just `bg-muted/30 rounded-lg p-3`.

2. **Action buttons** — Inline below stats, not inside a card. `Versammlung eröffnen/schließen` as outline buttons.

3. **Attendance section** — A borderless section with a subtle heading. Each attendee row uses a cleaner layout: colored left-border indicator (green=present, blue=proxy, gray=absent) instead of separate icons. Toggle switch on the right.

4. **Agenda section** — Compact list items with left color-coded status dot, no nested cards. Hover highlights the row. Each row: `TOP n | Title | badges | status dot | chevron`.

5. **Visual polish**:
   - Remove nested `Card` inside `Card` for TOPs (currently `Card` inside `CardContent`)
   - Use `Separator` between sections instead of card borders
   - Consistent `text-sm` sizing throughout
   - Progress bars inside stat tiles instead of standalone

### Files to modify
- **`src/components/meetings/MeetingLiveSession.tsx`**: Rewrite the overview section (lines 775-921) with the unified dashboard layout. No logic changes needed.

