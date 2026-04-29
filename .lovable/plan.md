## Ziel

Notfallkontakte bleiben inhaltlich strukturiert wie der Aushang (drei Sektionen + WICHTIG-Hinweis), werden aber im **cleanen Onboarding-Wizard-Stil** dargestellt: jede Sektion ist eine eigene weiche Card, die einzeln aus- und einklappbar ist. Default: alle drei zugeklappt.

## Layout-Struktur

```
┌────────────────────────────────────────────────┐
│ [Shield-Icon]  Notfall-Nummern           [v]   │ ← äußerer Toggle (bleibt)
├────────────────────────────────────────────────┤
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ ⚠ WICHTIG: Bitte zuerst die Haus-        │  │ ← weicher Hinweis (rounded-[14px])
│  │   verwaltung kontaktieren …              │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ ▔▔▔▔▔▔▔▔▔ (1px orange top-bar)          │  │
│  │ [◆] Verwaltung & Betreuung         [v]   │  │ ← Card-Header, klickbar
│  └──────────────────────────────────────────┘  │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ ▔▔▔▔▔▔▔▔▔                                │  │
│  │ [◆] Technische Betreuung           [^]   │  │ ← geöffnet
│  │ ────────────────────────────────────────  │  │
│  │   Heizung & Sanitär: Leser …             │  │
│  │   Nur bei Totalausfall …                 │  │
│  │   Rohrreinigung: Scherer …               │  │
│  │   …                                      │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ ▔▔▔▔▔▔▔▔▔ (1px destructive top-bar)      │  │
│  │ [⚡] Öffentliche Notrufe            [v]   │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  📞 08363 / 96 06 56     ✉ info@rgi…           │ ← Footer-Leiste
└────────────────────────────────────────────────┘
```

## Änderungen

### `src/components/forum/EmergencyContactsWidget.tsx` (Neufassung)

**Sektions-Cards** (Onboarding-Wizard-Stil):
- Jede Sektion = eigene Card: `rounded-[16px] border border-border/50 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.02)] overflow-hidden`
- **Top-Akzent-Bar** `h-1`: Verwaltung & Technik in `bg-rgi-orange`, Notrufe in `bg-destructive`
- **Header** als Button: links eine runde Icon-Pille (`size-9 rounded-full bg-rgi-orange/10 text-rgi-orange`, bei Notrufen `bg-destructive/10 text-destructive`), Sektionstitel mittig, ChevronDown rechts (rotiert beim Öffnen)
- Default `expandedSection: null` — nichts offen, Nutzer öffnet einzeln
- Optional: nur eine Sektion gleichzeitig offen (Akkordeon-Verhalten)

**Sektions-Inhalt** (nach Aufklappen):
- Trennlinie `border-t border-border/50` unter dem Header
- Padding `px-5 py-4`, Liste mit Einträgen im Stil:
  - **Fettes Label** + Telefonnummer als `tel:`-Link (Hover → orange)
  - Darunter kursiver Erklärtext in `text-muted-foreground`
- Sanftes Aufklappen via `animate-accordion-down`

**WICHTIG-Hinweis**:
- Eigene kleine Card mit dezentem Orange-Tint: `rounded-[14px] bg-rgi-orange/[0.05] border border-rgi-orange/20 px-4 py-3`
- Fettes „WICHTIG:" in `text-rgi-orange-dark`, Resttext normal

**Footer-Leiste**:
- Telefon + Mail als Inline-Links mit kleinen orangenen Icons, dezent in `text-muted-foreground`

### Sektionen & Datenquelle

1. **Verwaltung & Betreuung** — RGI-Hausverwaltung (fix) + alle Einträge mit Kategorie „Hausmeister"
2. **Technische Betreuung** — alle übrigen Handwerker-Kategorien
3. **Öffentliche Notrufe** — Feuerwehr, Rettungsdienst, Polizei (aus `PUBLIC_EMERGENCY_NUMBERS`)

DB-Schema und `emergencyContactInfo.ts` bleiben unverändert.

### Out of Scope

- Admin-UI (`BuildingServiceProvidersTab`) wird nicht angefasst
- Keine Migrations
