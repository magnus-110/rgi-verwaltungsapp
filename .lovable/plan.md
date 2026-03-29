

## Progressive Proxy Dialog with Modern UI

### Current State
The proxy dialog (lines 1362-1543) shows all steps at once: type selection, person selection, and voting instructions all visible simultaneously.

### Changes to `src/pages/weg-owner/Meetings.tsx`

**1. Add a `proxyStep` state** to track which step is active (1 = type, 2 = person, 3 = instructions).

**2. Progressive reveal logic:**
- Step 1: Show proxy type as 3 visual cards (Verwalter / Eigentumer / Extern) instead of a Select dropdown. Each card has an icon, title, and short description. Clicking selects and auto-advances.
- Step 2: For "manager" — skip this step entirely (auto-advance to step 3). For "owner" — show owner select dropdown. For "external" — show name input + immediately show the link hint. Auto-advance when selection is made.
- Step 3: Show voting instructions section. Each TOP row is clickable to expand and show its description. Instructions buttons (Ja/Nein/Enthaltung/Frei) remain as-is.
- Final: "Vollmacht erteilen" button at the bottom.

**3. Modern type selection cards:**
Replace the Select dropdown with 3 styled cards:
```
[Shield icon]          [Users icon]         [ExternalLink icon]
Verwalter              Eigentumer            Externe Person
"Die Verwaltung        "Ein anderer          "Eine Person
stimmt fur Sie"        Eigentumer im Haus"   außerhalb der WEG"
```
Selected card gets a primary border/highlight. Unselected cards are muted.

**4. Clickable TOPs in instructions:**
Each TOP row gets a chevron toggle. Clicking the TOP title/area expands to show `item.description` below the title, before the vote buttons. Uses a simple open/close state per item.

**5. Step indicator:**
Small step dots or numbers at the top of the dialog (Step 1 of 3) showing progress.

**6. Reset `proxyStep` to 1** when opening the dialog, and handle the "manager" shortcut (type=manager skips step 2).

### Files to modify
- `src/pages/weg-owner/Meetings.tsx` — Proxy dialog UI restructure

