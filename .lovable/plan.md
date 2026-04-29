# Onboarding-Wizard ↔ Admin-Onboarding: korrekte Verknüpfung pro Einheit

## Befund (anhand Maxi Göttinger)

Maxi Göttinger besitzt 3 Einheiten im Beispielgebäude (0007, 0008, 0009) und hat im Wizard pro Einheit unterschiedliche Werte eingegeben (m², MEA, Hausgeld + Nebeneinheiten). Die Daten landen aktuell **nicht korrekt** auf der Admin-Onboarding-Seite:

1. **Step 2 wird als ein einziges Submission-Row gespeichert** (`payload.per_unit = {assignmentId: {...}}`, `assignment_id = null`). Die Admin-Übersicht liest aber `payload.square_meters / mea_share / monthly_fee` direkt → für Multi-Unit-Owner werden **gar keine Werte angezeigt** (nur "—").
2. **Eigentümer-Lookup ist user-basiert** (`assignmentByUser` per `user_id`). Bei 3 Einheiten desselben Owners wird nur **eine** Einheitennummer angezeigt; im Screenshot taucht für einen anderen Eigentümer sogar nur die UUID `866a292b…` als Name auf, weil kein Contact für diese User-ID im Building gefunden wird.
3. **Apply-Field für `qm/mea/hausgeld` ignoriert die Einheit** (`limit(1)` über alle Assignments des Contacts) → "Übernehmen" schreibt im Multi-Unit-Fall **auf die falsche Einheit**.
4. **Nebeneinheiten** (Tiefgarage / Stellplatz / Keller mit eigenen MEA/Hausgeld-Werten) aus Step 2 werden in der Admin-Übersicht nirgends angezeigt und haben keinen Übernehmen-Button.
5. **Step 3 Problem-Notizen** (`problem_notes[area]`), **`general_impression_score`** und **`refill_contact`** werden weder angezeigt noch sind sie übernehmbar.
6. **Step 4 Custom-Provider** (Freitexteinträge mit `phone/email`) werden zwar aggregiert, aber `phone/email` werden beim Anlegen der Firma nicht durchgereicht; Trade-Label fehlt für Custom-Kategorien.
7. **Step 1 Multi-Unit-Daten** werden zwar korrekt in `*_override`-Spalten geschrieben, aber im Admin-Onboarding-Tab gibt es **keine Übersicht** der per Einheit unterschiedlichen Adresse/Telefon/IBAN-Overrides — nur Step 2–5 sind sichtbar.

## Was wir bauen

### A. Backend — pro-Einheit-Submissions garantieren

`supabase/functions/submit-onboarding-step` ist bereits darauf vorbereitet, Step 2 mit `payload.per_unit` in N Rows zu splitten (jeweils mit `assignment_id`). Bestehender Datensatz für Maxi liegt aber als 1 Row vor → Edge Function neu deployen + **Migration**, die existierende `wohnungsdaten`-Submissions mit `payload.per_unit` in N Rows aufsplittet (`assignment_id` setzen, alte Sammelzeile löschen).

### B. Admin-Übersicht (`OnboardingStepOverviews.tsx`)

- **Step-2-Tabelle** umbauen: pro Submission **eine Zeile pro Einheit** rendern.
  - Wenn `assignment_id` gesetzt ist → diese Einheit anzeigen.
  - Wenn (Legacy) noch `payload.per_unit` vorhanden ist → für jeden Key eine Zeile rendern.
  - Spalte „Einheit" zeigt die korrekte `unit_number` aus `assignments` per `assignment_id` (nicht user-basiert).
- **Eigentümer-Lookup** zusätzlich per `assignment_id` und `contact_id` (nicht nur `user_id`), Fallback auf Contact-Name statt UUID.
- **Dedupe-Logik**: nicht mehr nur „latest pro user", sondern „latest pro `(user_id, assignment_id)`" für Step 2.
- **Sub-Einheiten-Subtable**: unter jeder Hauptzeile eine kompakte Liste der `secondary_units` (Tiefgarage, Stellplatz, Keller…) mit eigenen Übernehmen-Buttons.
- **Step 3**: Problemnotizen je Bereich anzeigen (`problem_notes[area]`), `refill_contact` als eigenes Feld, `general_impression_score` als zusätzliche Bewertung neben `condition_rating`.
- **Step 4 Custom**: `phone`/`email`/Notiz aus `payload.custom[i]` durchreichen an Apply.

### C. Apply-Field-Function (`onboarding-apply-field`)

- Neue Felder akzeptieren: `qm | mea | hausgeld` mit **`assignment_id`** im `value` (Pflicht im Multi-Modus). Lookup-Reihenfolge:
  1. `value.assignment_id` falls vorhanden
  2. `submission.assignment_id` falls vorhanden
  3. Fallback (Single-Unit): erste Zuordnung für Contact+Building.
- Wenn Submission per_unit-Legacy-Format hat: Wert aus `payload.per_unit[assignment_id]` lesen statt `payload.*`.
- Neue Felder:
  - `secondary_unit` → legt Sub-Assignment an (`parent_assignment_id` = Hauptzuordnung, `unit_kind`, `unit_number`) + optional `mea_share` / `monthly_fee` über die bestehenden Tabellen `contact_building_shares` / `contact_building_costs`.
  - `problem_note` → schreibt `problem_areas` + `notes` korrekt zusammen.
  - `refill_contact` → optional auf `building.refill_contact_note` (oder Assessment-Notiz).
- `applied_fields`-Key wird einheitenspezifisch gemacht: `qm:<assignment_id>` etc., damit der Übernehmen-Status pro Einheit korrekt ist.

### D. Step 1 Übersicht (neu, klein)

In `OnboardingStepOverviews` ein neues Accordion **„Schritt 1: Stammdaten"** ergänzen, das pro Eigentümer×Einheit die `*_override`-Werte aus `contact_building_assignments` (Adresse, Telefon, E-Mail, IBAN, Kontakt-Wahl) anzeigt — read-only (Step 1 wird ohnehin direkt geschrieben), aber sichtbar fürs Audit.

### E. UX-Detail (Screenshot-Bug "866a292b")

Im `nameOf`-Fallback statt der Hex-UUID „Unbekannter Eigentümer" + Kontakt-ID-Suffix anzeigen, und zusätzlich eine Warn-Badge „Kontakt nicht zugeordnet" rendern, damit Admin den Datenfehler sieht.

## Technische Details

- Migration: SQL splittet bestehende Legacy-Wohnungsdaten-Submissions:
  ```text
  for row in onboarding_submissions where category='wohnungsdaten' and payload?'per_unit':
    for (aid, data) in jsonb_each(payload->'per_unit'):
      insert (..., assignment_id=aid, payload=data)
    delete row
  ```
- `applied_fields` migrieren: alte Keys `qm/mea/hausgeld` (ohne assignment_id) bleiben gültig, neue Keys werden `qm:<aid>` schreiben; Übersicht prüft beide.
- Komponenten betroffen:
  - `src/components/buildings/onboarding/OnboardingStepOverviews.tsx`
  - `src/components/buildings/onboarding/ApplyFieldButton.tsx` (akzeptiert beliebiges `value`-Objekt — schon ok, nur Aufrufer ändern)
  - Edge Functions: `onboarding-apply-field`, ggf. `submit-onboarding-step` (nur Re-Deploy)
- Keine Änderung am Wizard-Frontend (Step 1–5 senden bereits korrekte Strukturen).

## Ergebnis

Nach der Umsetzung sehen Admins:
- Pro Einheit eine Zeile mit korrekter Einheitennummer und korrektem Eigentümernamen.
- Pro Einheit unterschiedliche m²/MEA/Hausgeld-Werte mit jeweils eigenem „Übernehmen"-Button, der **genau diese Einheit** befüllt.
- Nebeneinheiten (TG, Stellplatz, Keller) inkl. Übernehmen-Aktion.
- Step 3 Problemnotizen, Step 4 Custom-Provider mit Phone/Email, Step 5 unverändert.
- Neuer Step-1-Audit-Block mit Override-Werten pro Einheit.
