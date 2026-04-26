# Plan: Duplikate bereinigen & granulare Übernahme-Buttons

## Problem
1. In `onboarding_submissions` liegen pro Eigentümer/Kategorie mehrere identische Einreichungen (z. B. 3× `bewertung` von Magnus). UI zeigt zwar nur die neueste, die DB ist aber unsauber.
2. Aktuell kann ein Admin nur die ganze Submission über das Side-Panel komplett übernehmen. Es fehlt die Möglichkeit, **einzelne Werte** (z. B. „Elektrotechnik Munz übernehmen", „Magnus als Kassenprüfer setzen") gezielt mit einem Klick zu bestätigen — und diese danach grün als „übernommen" zu markieren.

---

## Schritt 1 — Datenbank-Bereinigung (Migration)

SQL-Migration, die pro `(building_id, user_id, category)` nur die **jüngste** Submission behält:

```sql
DELETE FROM onboarding_submissions a
USING onboarding_submissions b
WHERE a.building_id = b.building_id
  AND a.user_id    = b.user_id
  AND a.category   = b.category
  AND a.created_at < b.created_at;
```

Zusätzlich: **Partial Unique Index**, damit künftig keine Duplikate entstehen können — neue Einreichungen sollen die alte überschreiben (Upsert in `submit-onboarding-step` anpassen):

```sql
CREATE UNIQUE INDEX onboarding_submissions_unique_pending
  ON onboarding_submissions (building_id, user_id, category)
  WHERE status = 'pending';
```

→ `supabase/functions/submit-onboarding-step/index.ts`: Vor dem `INSERT` ein `DELETE WHERE status='pending' AND building_id+user_id+category` einfügen, damit Re-Submits sauber ersetzt werden.

---

## Schritt 2 — Neue Edge Function: `onboarding-apply-field`

Granularer Endpunkt, der **ein einzelnes Feld** aus einer Submission in die Zieltabellen schreibt — ohne die Submission als Ganzes auf `approved` zu setzen.

Body:
```ts
{
  submission_id: string,
  field: 
    | "provider"           // Step 4: einzelner Dienstleister (übergibt {trade, name, contact_id?})
    | "cash_auditor"       // Step 5: Markiere user als Kassenprüfer
    | "beirat_member"      // Step 5: Markiere user als Verwaltungsbeirat
    | "etv_location"       // Step 5: Speichere Vorschlag als building.etv_location_suggestion
    | "mea" | "qm" | "hausgeld"  // Step 2: einzelne Wohnungsdaten-Felder
    | "heating_type" | "problem_areas",  // Step 3
  value?: any              // optional, z. B. konkreter Provider aus dem custom-Array
}
```

Logik je Feld nutzt dieselben Merge-Patterns wie `onboarding-approve-submission`, aber **isoliert pro Feld**.

Tracking, was bereits übernommen wurde → neue Spalte:
```sql
ALTER TABLE onboarding_submissions
  ADD COLUMN applied_fields jsonb NOT NULL DEFAULT '[]'::jsonb;
```
Jeder Übernahme-Aufruf appendet z. B. `"provider:elektro:Munz"` oder `"cash_auditor"` in dieses Array. Wenn am Ende alle relevanten Felder übernommen sind, kann die Submission optional automatisch auf `approved` gesetzt werden.

---

## Schritt 3 — UI: Aktionsbuttons je Feld in `OnboardingStepOverviews.tsx`

Ein wiederverwendbarer kleiner Button neben jedem ausgegebenen Wert:

```tsx
<ApplyFieldButton 
  submissionId={s.id} 
  field="cash_auditor" 
  applied={s.applied_fields?.includes("cash_auditor")}
  label="Als Kassenprüfer übernehmen"
/>
```

**Verhalten**
- Default: Outline-Button mit Check-Icon → „Übernehmen"
- Loading: Spinner
- Nach Erfolg: grüner gefüllter Badge-/Button-Stil + Häkchen + Text „Übernommen"
- Container des Feldes bekommt zusätzlich einen grünen Hintergrund (`bg-success/10 border-success/40`)

**Konkret pro Step**
- **Step 2 (Wohnungsdaten):** je Zeile drei Mini-Buttons: m², MEA, Hausgeld — jeder einzeln übernehmbar
- **Step 3 (Gebäude):** Heizungsart-Liste je Eintrag „Übernehmen" (schreibt in `buildings.heating_type`); Problembereiche je Item übernehmbar (legt To-Do/Inspektionsvorschlag an oder speichert in `building_assessments`)
- **Step 4 (Dienstleister):** Bei jedem aggregierten Provider-Eintrag ein „Übernehmen"-Button → ruft Endpoint mit `field: "provider"` und identifiziert den Dienstleister via `(name, category)`. Bereits in `building_service_providers` vorhandene Einträge werden erkannt und automatisch grün markiert.
- **Step 5:** je Eintrag in „Freiwillige Kassenprüfer" / „Mitglieder Verwaltungsbeirat" / „ETV-Orte" jeweils ein Übernahme-Button. Cash Auditor → setzt `is_cash_auditor=true` auf der Assignment; Beirat → `role_in_building='beirat'`; ETV-Ort → speichert auf `buildings.etv_location_suggestion`.

---

## Schritt 4 — React Query Invalidation

Nach jedem erfolgreichen Apply:
- `["onb-overview-submissions", buildingId]`
- `["onb-overview-providers", buildingId]`
- `["onb-overview-assignments", buildingId]`
- `["onb-overview-assessments", buildingId]`

werden invalidiert, damit die grünen Statusanzeigen sofort konsistent sind.

---

## Dateien
**Neu**
- `supabase/migrations/<ts>_dedupe_onboarding_submissions.sql`
- `supabase/functions/onboarding-apply-field/index.ts`
- `src/components/buildings/onboarding/ApplyFieldButton.tsx`

**Geändert**
- `src/components/buildings/onboarding/OnboardingStepOverviews.tsx` — Buttons in alle 4 Step-Sektionen einbauen, applied-Status visuell anzeigen
- `supabase/functions/submit-onboarding-step/index.ts` — vor INSERT alte pending-Submission gleicher (building, user, category) löschen, damit künftig keine Duplikate entstehen
- `supabase/config.toml` — neue Function registrieren (verify_jwt = true)

---

## Ergebnis
- DB enthält pro Eigentümer + Schritt nur **eine** Submission (jüngste).
- Admin kann **jeden einzelnen Wert** mit einem Klick übernehmen, ohne die ganze Submission „pauschal" akzeptieren zu müssen.
- Übernommene Werte sind sofort **grün** sichtbar, mit Häkchen und „Übernommen"-Label.
- Künftige Re-Submissions desselben Eigentümers überschreiben sauber die alte pending-Eingabe.
