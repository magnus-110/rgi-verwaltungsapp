# Mit-Eigentümer & Inline-Editing im Gebäude

## Hintergrund
Frau Bronold (Wohnung 0025, Achweg 3-5) ist hälftige Mit-Eigentümerin gemeinsam mit Sandra Bronold. Aktuell liegt die Wohnung auf **einem** Kontakt "Christina und Sandra Bronold" mit zwei Personen. Sie möchte eigene Anschreiben/Rundmails. Außerdem soll man im Gebäude-Tab Name und Adresse direkt ändern können.

Das Datenmodell unterstützt bereits beides im Ansatz:
- `contact_building_assignments.parent_assignment_id` → Mehrfach-Zuordnung einer Einheit
- `*_override`-Spalten (`first_name_override`, `last_name_override`, `salutation_override`, `address_street_override`, …) → individuelle Stammdaten je Zuordnung

Es fehlt UI + Render-Logik.

## Umfang

### 1. Mit-Eigentümer pro Einheit
In `BuildingContactsList.tsx` (Tab "Personen" im Gebäude):
- Pro Einheit-Karte neuer Button **"+ Mit-Eigentümer"**.
- Öffnet `AssignContactDialog` im Modus "Mit-Eigentümer hinzufügen": wählt einen bestehenden Kontakt oder legt einen neuen an und erzeugt eine zweite Zeile in `contact_building_assignments` für dieselbe Einheit, mit `parent_assignment_id = id` der bestehenden Zuordnung, gleiche `unit_number`, `unit_kind`, `usage_type`.
- Darstellung: Mit-Eigentümer werden direkt unter dem Haupt-Eigentümer als eingerückter Sub-Eintrag angezeigt, mit Badge "Mit-Eigentümer" und eigener Anteils-Anzeige (z. B. 1/2). Anteile (MEA, Hausgeld) lassen sich je Person über das bestehende `contact_building_shares`-System pflegen.
- Neue Spalte (Migration) `contact_building_assignments.address_as_separate_letter boolean default true` — Checkbox "Eigenes Anschreiben/Rundmail erhalten" je Mit-Eigentümer. Bei `false` wird der Mit-Eigentümer in der Anrede des Haupt-Eigentümers mit-adressiert, aber kein separates Schreiben erzeugt.

### 2. Empfänger-Logik (Rundmail/Brief)
In `supabase/functions/_shared/comm-vars.ts`:
- Beim Laden der Empfänger pro Einheit alle Zuordnungen (Haupt + Mit-Eigentümer) einsammeln.
- Pro Zuordnung mit `address_as_separate_letter = true` ein eigener Empfänger-Datensatz mit eigenem `adresse_block`, `anrede_brief`, E-Mail.
- Wenn am Haupt-Eigentümer Mit-Eigentümer mit `address_as_separate_letter = false` hängen, werden deren Namen in `adresse_block` und `anrede_brief` zusammengeführt (z. B. "Frau Christina Bronold\nFrau Sandra Bronold" / "Sehr geehrte Frau Bronold, sehr geehrte Frau Bronold,").
- Neue Variablen `{{mit_eigentuemer_namen}}` und `{{mit_eigentuemer_anrede}}` für Vorlagen.

### 3. Inline-Edit Name & Adresse im Gebäude
In der bestehenden Einheit-Karte (`BuildingContactsList.tsx`, Tab "Übersicht"):
- Name (Anrede / Vorname / Nachname / Firma) und Adresse (Straße / PLZ / Ort) werden inline editierbar (analog zu den vorhandenen `InlineEditField`-Mustern für Telefon/E-Mail).
- Geschrieben wird in die `*_override`-Spalten der `contact_building_assignments`-Zeile, **nicht** in `contacts`. Der globale Kontakt bleibt unverändert; nur die gebäudespezifische Anschrift ändert sich.
- Hinweis-Text bleibt: "Adresse wird auch über die Kontaktseite verwaltet — Überschreibung gilt nur für dieses Gebäude."
- Vorhandene Auflöselogik (`*_override` schlägt `contacts.*` bei Render und Empfängerladen) wird einmal zentral in `comm-vars.ts` und in der UI-Anzeigefunktion `getDisplayName` ergänzt.

## Migration
```sql
ALTER TABLE public.contact_building_assignments
  ADD COLUMN IF NOT EXISTS address_as_separate_letter boolean NOT NULL DEFAULT true;
```
Keine RLS-Änderung nötig (bestehende Policies greifen).

## Konkreter Use-Case Achweg 3-5 / 0025
Nach Rollout wird die bestehende Zuordnung in zwei separate Zuordnungen aufgeteilt:
- Haupt: **Sandra Bronold** (eigener Kontakt) – Wohnung 0025, MEA-Anteil 1/2
- Mit-Eigentümer: **Christina Bronold** (eigener Kontakt) – Wohnung 0025, MEA-Anteil 1/2, separat adressiert ✓

Die Aufteilung erfolgt manuell durch dich nach dem Build (UI bietet "Mit-Eigentümer hinzufügen" + ggf. Wechsel des Haupt-Eigentümers). Falls gewünscht, kann ich die DB-Trennung des aktuellen Kontakts als Folgeschritt direkt ausführen.

## Nicht im Umfang
- Anteilsberechnung (MEA-Validierung 1/1) bleibt unverändert.
- Eigentümer-Portal-Zugang (Auth) für Mit-Eigentümer wird separat eingeladen über bestehenden Workflow.
- ETV-Stimmrechte je Mit-Eigentümer (separate Story).
