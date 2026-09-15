-- Schutz gegen doppelte Ordner.
--
-- ensure_stammakte_categories() legt die heutige Soll-Struktur an (8 Hauptordner
-- mit Slug). Aeltere Liegenschaften tragen aber eine andere, gewachsene Struktur
-- OHNE Slugs - etwa "Stammakte, Eigentuemer, Mieter, Dienstleister & Instandhaltung,
-- Finanzen, Altsystem / Uebernahme, Sonstiges". Da der Abgleich ueber den Slug
-- laeuft, wuerde die Funktion dort acht zusaetzliche Ordner anlegen: "Stammakte",
-- "Finanzen", "Eigentuemer" und "Sonstiges" erschienen dann doppelt.
--
-- Bisher fiel das nicht auf, weil die Funktion wegen des partiellen Unique-Index
-- immer abbrach (42P10). Seit dieser behoben ist, wuerde sie beim naechsten Oeffnen
-- des Dokumentenbereichs tatsaechlich laufen - deshalb dieser Riegel.
--
-- Umgesetzt als Wrapper um die unveraenderte Originalfunktion, damit deren 5792
-- Zeichen nicht fehleranfaellig abgeschrieben werden muessen. Der Name bleibt
-- gleich, alle vorhandenen Aufrufer (Trigger, FolderTree,
-- SaveAttachmentToBuildingDialog, resolveDmsFolder) greifen unveraendert.

alter function public.ensure_stammakte_categories(uuid)
  rename to ensure_stammakte_categories_raw;

create or replace function public.ensure_stammakte_categories(p_building_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if p_building_id is null then
    return;
  end if;

  -- Hat die Liegenschaft schon irgendeine Ordnerstruktur, bleibt sie unberuehrt.
  -- Die Funktion stellt sicher, DASS eine Struktur existiert - sie erzwingt nicht,
  -- dass es die aktuelle ist.
  if exists (
    select 1 from public.building_file_categories where building_id = p_building_id
  ) then
    return;
  end if;

  perform public.ensure_stammakte_categories_raw(p_building_id);
end;
$fn$;

comment on function public.ensure_stammakte_categories is
  'Legt die Standard-Ordnerstruktur an, aber nur fuer Liegenschaften ohne jede Ordnerstruktur. Bestehende - auch abweichende - Strukturen bleiben unveraendert.';

comment on function public.ensure_stammakte_categories_raw is
  'Originalfassung ohne Schutzpruefung. Nicht direkt aufrufen - legt die Soll-Struktur auch dann an, wenn bereits Ordner existieren, und erzeugt dadurch Dubletten.';
