

# Plan: Tab-Hierarchie mit visuell unterschiedlichen Ebenen

## Analyse: Aktuelle Tab-Nutzung

Die App verwendet Tabs auf **4 verschiedenen hierarchischen Ebenen**, die aktuell aber alle gleich aussehen:

| Ebene | Beispiel | Zweck |
|---|---|---|
| **Level 1 — Seitennavigation** | Finance: Buchen / Abrechnung / Wirtschaftsplan | Hauptbereiche einer Seite |
| **Level 2 — Unternavigation** | Buchen → Rechnungen / Vorlagen / Kontoauszüge / Buchungen | Sub-Bereiche innerhalb eines Bereichs |
| **Level 3 — Inhalts-Tabs** | BillingSettlement: Kostenübersicht / Eigentümer / Vermögensbericht | Ansichtswechsel innerhalb eines Moduls |
| **Spezial — Underline-Tabs** | BuildingDashboard: Übersicht / Personen / Meldungen / ... | Bereits custom gestylt mit Border-Bottom |

Alle Stellen, die angepasst werden:

- **Level 1**: `Finance.tsx` (Buchen/Abrechnung/Wirtschaftsplan), `Settings.tsx` (5 Tabs), `ContactDetail.tsx` (3 Tabs)
- **Level 2**: `Finance.tsx` innere Tabs (4 Tabs), `weg-owner/Files.tsx` (2 Tabs), `tenant/Files.tsx` (2 Tabs)
- **Level 3**: `BillingSettlement.tsx`, `Reports.tsx`, `DocumentSourcesList.tsx`, `BuildingContactsList.tsx`
- **Spezial**: `BuildingDashboard.tsx` (bereits Underline-Style)

## Design-Konzept: 3 visuell unterschiedliche Tab-Ebenen

### Level 1 — Segment Control (Hauptnavigation)
Groß, prominent, farbiger Hintergrund. Aktiver Tab mit Primary-Farbe.
```text
┌──────────────────────────────────────────────┐
│  [ Buchen ]  [ Abrechnung ]  [ Wirtschafts… ]│
│   ▲ active = bg-primary, text-white          │
│   andere = bg-transparent, text-muted        │
└──────────────────────────────────────────────┘
```
- Hintergrund: `bg-muted/50` mit `rounded-lg p-1`
- Aktiv: `bg-primary text-primary-foreground shadow-sm`
- Inaktiv: `text-muted-foreground hover:text-foreground`
- Größe: `h-11 px-6 text-sm font-medium`

### Level 2 — Pill Tabs (Unternavigation)
Kleiner, subtiler, Pill-förmig ohne starken Kontrast.
```text
  ( Rechnungen )  ( Vorlagen )  ( Kontoauszüge )  ( Buchungen )
    ▲ active = bg-background border shadow-sm
```
- Hintergrund: `bg-muted/30 rounded-md p-0.5`
- Aktiv: `bg-background text-foreground border border-border shadow-sm`
- Inaktiv: `text-muted-foreground`
- Größe: `h-9 px-4 text-xs font-medium`

### Level 3 — Underline Tabs (Inhalts-Tabs)
Minimalistisch, nur eine Unterlinie zeigt den aktiven Tab.
```text
  Kostenübersicht    Eigentümer    Vermögensbericht
  ═══════════════    
```
- Kein Hintergrund (`bg-transparent`)
- Aktiv: `border-b-2 border-primary text-foreground`
- Inaktiv: `text-muted-foreground border-b-2 border-transparent`
- Größe: `h-9 px-3 text-sm`

## Umsetzung

### 1. `src/components/ui/tabs.tsx` — Varianten einführen

Neue Props `variant` für `TabsList` und `TabsTrigger`:
- `variant="segment"` (Level 1)
- `variant="pill"` (Level 2, default — bisheriges Verhalten ähnlich)
- `variant="underline"` (Level 3)

Verwendet `cva` (class-variance-authority) für saubere Varianten-Verwaltung.

### 2. Alle Tab-Stellen aktualisieren

| Datei | Aktuelle Ebene | Neue Variante |
|---|---|---|
| `Finance.tsx` — äußere Tabs | L1 | `variant="segment"` |
| `Finance.tsx` — innere Tabs | L2 | `variant="pill"` |
| `Settings.tsx` | L1 | `variant="segment"` |
| `ContactDetail.tsx` | L1 | `variant="segment"` |
| `BuildingDashboard.tsx` | Spezial | `variant="underline"` (formalisiert) |
| `BillingSettlement.tsx` | L3 | `variant="underline"` |
| `Reports.tsx` | L3 | `variant="underline"` |
| `DocumentSourcesList.tsx` | L3 | `variant="underline"` |
| `BuildingContactsList.tsx` | L3 | `variant="underline"` |
| `weg-owner/Files.tsx` | L2 | `variant="pill"` |
| `tenant/Files.tsx` | L2 | `variant="pill"` |
| `TermsAcceptanceDialog.tsx` | L2 | `variant="pill"` |
| `LegalDocumentsSheet.tsx` | L2 | `variant="pill"` |

### Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/components/ui/tabs.tsx` | Varianten-System mit `cva` einbauen |
| 13 Dateien (oben gelistet) | `variant` Prop setzen, custom classNames entfernen |

