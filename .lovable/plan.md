## Warum nur eine Datei ankam

Das Upload-Feld für den Schließplan in `src/components/buildings/keys/BuildingKeysTab.tsx` (Zeile 250) ist ein einzelnes File-Input **ohne `multiple`**. Auch das Datenmodell in `key_property_settings` speichert nur genau **einen** Schließplan pro Liegenschaft (`closing_plan_path`, `closing_plan_name`, `closing_plan_uploaded_at`, `closing_plan_uploaded_by`).

Beim Markieren von zwei Dateien nimmt der Browser deshalb nur die erste (`e.target.files?.[0]`) — die zweite wird verworfen. Das ist kein Berechtigungs-/RLS-Fehler, sondern eine bewusste Einschränkung, die jetzt aufgehoben werden soll.

## Ziel

Man soll unter „Schlüssel → Stammdaten" **beliebig viele Schließpläne** ablegen, ansehen und löschen können (z. B. mehrere Schließanlagen oder Nachträge pro Liegenschaft).

## Umsetzung

### 1. Neue Tabelle für Schließplan-Dateien

Migration:

```
create table public.key_closing_plan_files (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  file_path text not null,      -- Objekt in Bucket "key-files"
  file_name text not null,
  file_size bigint,
  mime_type text,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);
create index on public.key_closing_plan_files(building_id);

grant select, insert, update, delete on public.key_closing_plan_files to authenticated;
grant all on public.key_closing_plan_files to service_role;

alter table public.key_closing_plan_files enable row level security;
-- Zugriff analog zu key_tag_files: Nutzer mit Sichtbarkeit auf das Gebäude
create policy "keys files: read"   on public.key_closing_plan_files for select to authenticated using (public.can_view_building(building_id));
create policy "keys files: write"  on public.key_closing_plan_files for insert to authenticated with check (public.can_view_building(building_id));
create policy "keys files: delete" on public.key_closing_plan_files for delete to authenticated using (public.can_view_building(building_id));
```

(Policy-Helfer wird an das gleiche Muster angelehnt, das `key_tag_files` bereits nutzt; wenn dort ein anderer Helper existiert, wird derselbe verwendet.)

Speicher: Bestehender Bucket `key-files`, Pfad `${buildingId}/closing-plans/${timestamp}-${sanitizedName}`.

### 2. Frontend — `BuildingKeysTab.tsx`

- `<Input type="file" multiple accept="application/pdf,image/*" />` und Loop über alle ausgewählten Dateien.
- Neue Query `key-closing-plan-files` mit Liste unter dem Upload-Feld: Dateiname, Größe, Datum, „Öffnen" (signed URL) und „Löschen" (mit Storage-Remove und DB-Delete).
- Bestehende Einzel-Felder (`closing_plan_path/name/...` in `key_property_settings`) bleiben zunächst zur Anzeige des Erst-Uploads erhalten; neue Uploads landen ausschließlich in der neuen Tabelle. Ein kleiner Migrationsschritt zeigt den Alt-Wert weiterhin bis er gelöscht wird.
- Toast bei Teilerfolg: „X von Y Dateien hochgeladen" plus Fehlermeldung je Datei.

### 3. Kein Change an anderen Stellen

Keine Änderungen an `KeyTagDialog`, Leih-Flow, Webhooks oder RLS anderer Tabellen — der Fehler betraf ausschließlich den Schließplan-Upload.

## Verifikation

- Zwei PDFs (~2–3 MB) gleichzeitig auswählen → beide erscheinen in der Liste, beide via signierter URL öffenbar.
- Löschen einer Datei entfernt sowohl Storage-Objekt als auch DB-Zeile.
- Bestehende Alt-Dateien in `key_property_settings.closing_plan_path` sind weiter sichtbar.
