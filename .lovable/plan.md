## Ziel

Auf dem Smartphone sollen die drei Prüfmodi nicht mehr versuchen, beide Spalten (links Liste / rechts Detail) gleichzeitig auf den schmalen Bildschirm zu quetschen. Stattdessen soll man durch horizontales Wischen zwischen "Liste" und "Detail" hin- und her wechseln können — analog zu Gmail/Outlook auf dem Handy.

Auf Tablet/Desktop (≥ 768px) bleibt das bestehende Side-by-Side-Layout 1:1 unverändert.

## Betroffene Prüfmodi (alle gefunden)

1. **`src/components/finance/TransactionReviewMode.tsx`** — Prüfmodus für Bank-Kontoauszüge / offene Transaktionen
   - Aktuell: zwei `w-1/2`-Spalten (Zeilen ~1323 + ~1457)
2. **`src/components/finance/BookingReviewMode.tsx`** — Prüfmodus für bestehende Buchungen
   - Aktuell: zwei `w-1/2`-Spalten (Zeilen ~228 + ~303)
3. **`src/components/transfers/TransferReviewMode.tsx`** — Prüfmodus für Überweisungen / Zahlungen
   - Aktuell: zwei `w-1/2`-Spalten (Zeilen ~408 + ~657)

Andere Treffer (`EconomicPlanEditor`, `useSuggestMatchContext`, `BankStatementsTab`) sind keine Split-View-Prüfmodi und werden nicht angefasst.

## Vorgehen (pro Komponente identisch)

1. `useIsMobile()` aus `@/hooks/use-mobile` einbinden.
2. Neuen lokalen State `mobileView: "list" | "detail"` einführen (Default: `"list"`).
3. Den äußeren Container in zwei Modi rendern:
   - **Desktop (`!isMobile`)**: bestehendes `flex` mit beiden `w-1/2`-Panels — unverändert.
   - **Mobile (`isMobile`)**: nur das aktive Panel zeigen (`w-full` statt `w-1/2`, `border-r` weg). Das jeweils inaktive Panel wird nicht gerendert (besser für Performance & Fokus).
4. **Swipe-Handler** auf dem Container (`onTouchStart` / `onTouchEnd`):
   - Swipe nach links (dx ≤ −50px, |dy| ≤ 0,7·|dx|, < 800ms) → wechsle zu `"detail"`.
   - Swipe nach rechts → zurück zu `"list"`.
   - Logik & Schwellwerte aus `MobileHeader.tsx` wiederverwenden, damit sich das Verhalten konsistent anfühlt.
5. **Sichtbare Navigations-Hilfen** (oben in der mobilen Ansicht):
   - Kleine Tab-/Pill-Leiste mit zwei Buttons "Liste" ⇄ "Detail" inkl. Pfeil-Icons (`ChevronLeft` / `ChevronRight`), damit Nutzer ohne Swipen verstehen, dass es zwei Seiten gibt.
   - Indikator-Punkte (●○ / ○●) als visueller Page-Indicator.
6. **Auto-Switch bei Auswahl**: sobald in der Liste ein Eintrag (Transaktion / Buchung / Überweisung) angetippt wird, automatisch zu `mobileView = "detail"` wechseln. Das ist die natürlichste UX.
7. **Zurück-Geste**: Im Detail-Header einen kleinen `ArrowLeft`-Button ergänzen, der zurück auf die Liste geht (Mobile only).

## Technische Hinweise

- Keine neuen Libraries — reine Touch-Event-Handler genügen, identisch zum Pattern in `MobileHeader.tsx`.
- Z-Index der bestehenden Overlays (`fixed inset-0 z-50`) bleibt unverändert.
- Innere `grid-cols-2`-Layouts in den Detail-Karten (z. B. Felder nebeneinander) **nicht** anfassen — die sind innerhalb der Detail-Spalte und funktionieren auch auf 411px noch ok. Falls einzelne sehr schmal werden, optional auf `grid-cols-1 sm:grid-cols-2` umstellen — wird beim Umsetzen pro Stelle entschieden.
- Tastatur-Shortcuts (Enter, Pfeiltasten) in `TransactionReviewMode` bleiben für Desktop erhalten; auf Mobile sind sie ohnehin irrelevant.
- Keine Änderungen an Datenflüssen, Queries, Mutationen oder Business-Logik — rein Layout/UX.

## ASCII-Skizze Mobile

```text
┌──────────────────────────────┐    Swipe ←
│ [Liste] ○●  [Detail]         │   ───────►
│ ──────  ─────────            │
│                              │
│   Aktive Spalte (Liste       │
│   ODER Detail) full-width    │
│                              │
└──────────────────────────────┘
```

## Out of Scope

- Animationen / Transition-Effekte beim Swipen (kann später ergänzt werden).
- Änderungen an Desktop-Layout, Drei-Spalten-Varianten oder den Tabs innerhalb der Detail-Spalte.
