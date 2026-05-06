## Ziel

Wenn der Admin im Tab **Buchhaltung → Kassenprüfung** eine bestehende Prüfung öffnet, soll er nicht mehr die gleiche Bearbeitungs-UI wie der externe Prüfer sehen, sondern eine eigene **Admin-Review-Ansicht**: Übersicht über alle Befunde des Prüfers, mit Fokus auf Auffälligkeiten und direkten Korrektur-Aktionen.

Der Token-Modus (externer Prüfer via Link) bleibt unverändert.

## Layout

Beim Öffnen einer Kassenprüfung sieht der Admin:

```text
┌─────────────────────────────────────────────────────────────┐
│  ← Zurück   Kassenprüfung: <Gebäude>  [Geschäftsjahr] [Status]│
│  Prüfer: <Name>  · Letzte Aktivität: …                       │
├─────────────────────────────────────────────────────────────┤
│  Zusammenfassung (4 Kennzahl-Kacheln)                        │
│   • Geprüfte Konten   • Geprüfte Buchungen                   │
│   • Auffällige Konten • Auffällige Buchungen                 │
├─────────────────────────────────────────────────────────────┤
│  [Tab: Auffälligkeiten ⚠]  [Tab: Geprüft ✓]  [Tab: Notizen] │
├─────────────────────────────────────────────────────────────┤
│  Auffälligkeiten (Default-Tab):                              │
│  ─ Konto-Karte (z.B. 4210 Reparaturen) ⚠                     │
│     Notiz vom Prüfer: "Beleg fehlt"                          │
│     [Konto öffnen]                                           │
│     ─ Buchung 12.03. – Müller GmbH – 1.234,56 €              │
│        Notiz: "Doppelt?"                                     │
│        [Buchung bearbeiten]  [Konto öffnen]                  │
│        Badge: "Von der Verwaltung bearbeitet am 06.05."      │
│  ─ weitere auffällige Konten/Buchungen …                     │
└─────────────────────────────────────────────────────────────┘
```

- **Tab "Auffälligkeiten"** (Default) listet alle Konten + Buchungen, die der Prüfer mit `flag = "issue"` markiert hat, gruppiert nach Konto, mit den jeweiligen Prüfer-Notizen.
- **Tab "Geprüft"** zeigt die als `ok` markierten Konten/Buchungen kompakt (read-only).
- **Tab "Notizen"** zeigt Abschluss-Notes + Unterschrift falls vorhanden.

## Aktionen pro auffälliger Buchung / Konto

- **Buchung bearbeiten** → öffnet bestehenden `EditBookingDialog`. Nach erfolgreichem Speichern wird in `progress.adminReview[bookingId]` ein Eintrag `{ editedAt, editedBy }` gesetzt → Badge "Von der Verwaltung bearbeitet am …".
- **Konto öffnen** → Navigation in den Kontenplan / Kontoblatt-Ansicht der jeweiligen Liegenschaft (`/finanzen` mit Filter), in neuem Tab.

Das `progress`-JSON wird so erweitert, dass auch der externe Prüfer beim nächsten Öffnen den Vermerk "Von der Verwaltung bearbeitet" sehen kann.

## Sichtbarkeit / Routing

- `CashAuditTab.tsx`: Wenn der Admin (also `tokenMode !== true`) eine bestehende Prüfung mit Status `in_progress` oder `completed` öffnet, wird statt `CashAuditWizard` die neue Komponente `CashAuditAdminReview` gerendert. Bei Status `draft` (also gerade erstellt, noch nicht vom Prüfer angerührt) bleibt die alte UI (damit Verwaltung selbst Vorschau machen kann), wahlweise mit Umschalter "Prüfer-Sicht öffnen".
- Token-Modus (`/kassenpruefung/:token`) ruft weiterhin `CashAuditWizard` direkt auf — komplett unverändert.

## Technische Details

**Neue Datei:** `src/components/finance/CashAuditAdminReview.tsx`
- Lädt dieselben Daten wie der Wizard (`cash_audits` + `bookings` für `building_id`/`fiscal_year`).
- Liest `progress.accountFlags`, `progress.accountNotes`, `progress.bookingFlags`, `progress.bookingNotes`, `progress.adminReview`.
- Aggregiert: pro Konto die zugehörigen Buchungen aus dem bestehenden Booking-Hook (Wiederverwendung der Logik aus `CashAuditAccountSheet` — am besten kleine Hook-Extraktion `useAuditAccountBookings(buildingId, fiscalYear)`).
- 4 Summary-Tiles + Tabs (`Auffälligkeiten` / `Geprüft` / `Notizen`).
- Wiederverwendet `EditBookingDialog` für die Bearbeitung.
- Nach Save: ruft eine Helper-Funktion `markAdminEdited(auditId, bookingId)` auf, die `progress.adminReview[bookingId] = { editedAt: ISO, editedBy: profileFullName }` setzt und via `supabase.from("cash_audits").update(...)` speichert.

**Anpassung `CashAuditTab.tsx`:**
- Statt direkt `<CashAuditWizard>` zu rendern, eine kleine Weiche:
  - `audit.status === "draft"` → `CashAuditWizard` (Vorschau Verwaltung)
  - sonst → `CashAuditAdminReview`
- Optional: Toggle-Button "Prüfer-Sicht ansehen" oben rechts, der temporär den Wizard read-only öffnet.

**Helper-Hook `useAuditAccountBookings`:**
- Wird aus `CashAuditAccountSheet.tsx` extrahiert (Logik bleibt 1:1, nur als wiederverwendbarer Hook), damit Admin-Review dieselben Konto-/Buchungs-Aggregate nutzt.

**`CashAuditAccountSheet`** (Prüfer-Seite): Ergänzt minimal das Anzeigen eines kleinen Hinweises "Von der Verwaltung bearbeitet" auf Buchungszeilen, wenn `progress.adminReview[bookingId]` existiert (nur Lesehinweis, kein Verhalten).

**Keine Schemaänderung nötig** — alles läuft über das bestehende `progress` JSONB-Feld auf `cash_audits`.

## Out of scope

- Löschen von Buchungen aus der Admin-Review.
- Ändern des "Geprüft/Auffällig"-Status durch den Admin (das bleibt Hoheit des Prüfers).
- Backend/RPC-Änderungen.
