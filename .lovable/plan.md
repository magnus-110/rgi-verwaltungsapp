

## Plan: Hover-Dropdown für "Buchen" Tab

**Konzept**: Der "Buchen"-Tab bekommt ein Hover-Dropdown, das die drei Sub-Optionen (Vorlagen, Kontoauszüge, Buchungen) anzeigt. Nach Auswahl wird der gewählte Sub-Tab im Button-Label angezeigt, z.B. "Buchen · Kontoauszüge". Die zweite Tab-Zeile verschwindet komplett.

### Visuelles Ergebnis

```text
┌──────────────────────────────────────────────────────────────────┐
│  [Buchen · Vorlagen ▾]  [Abrechnung]  [Planung]  [Kassenprüfung] │
│        ┌─────────────┐                                            │
│        │ Vorlagen     │  ← Dropdown erscheint bei Hover           │
│        │ Kontoauszüge │                                            │
│        │ Buchungen    │                                            │
│        └─────────────┘                                            │
└──────────────────────────────────────────────────────────────────┘
```

### Technische Umsetzung

**`src/pages/Finance.tsx`**:

1. **Verschachteltes `<Tabs>` entfernen** — kein zweites `<Tabs>`/`<TabsList>` mehr für die Sub-Navigation
2. **Custom Hover-Dropdown auf dem "Buchen"-Trigger**: Statt eines normalen `<TabsTrigger>` wird der "Buchen"-Slot ein `div` mit `onMouseEnter`/`onMouseLeave` und absolutem Dropdown-Menü
3. **Label-Logik**: Der angezeigte Text im Buchen-Tab wird dynamisch: `"Buchen · {SubTab-Name}"` (z.B. "Buchen · Kontoauszüge")
4. **Klick auf Haupt-Button**: Aktiviert den `buchen`-Tab mit dem zuletzt gewählten Sub-Tab
5. **Klick auf Dropdown-Item**: Setzt `activeTab="buchen"` + `activeSubTab` auf den gewählten Wert, Dropdown schließt sich
6. **Content-Rendering**: `TabsContent` für `buchen` rendert direkt basierend auf `activeSubTab` (ohne verschachteltes Tabs-Komponente)

### Sub-Tab Labels
- `templates` → "Vorlagen"
- `statements` → "Kontoauszüge"  
- `bookings` → "Buchungen"

