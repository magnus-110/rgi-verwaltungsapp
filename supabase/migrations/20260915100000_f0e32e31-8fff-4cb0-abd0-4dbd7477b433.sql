-- Stammakte-Ordnerstruktur beim Anlegen eines Gebaeudes erzeugen.
--
-- ensure_stammakte_categories() gibt es laengst, sie wurde aber nur nachtraeglich
-- aufgerufen - naemlich erst, wenn jemand den Dokumentenbereich eines Gebaeudes
-- oeffnet (FolderTree, SaveAttachmentToBuildingDialog, resolveDmsFolder). Ein frisch
-- angelegtes Gebaeude stand deshalb ohne Ordner da, bis es zufaellig jemand aufrief.
-- Beim Makler-Objekt wird das Gegenstueck ensure_broker_categories direkt nach dem
-- Anlegen aufgerufen; bei Gebaeuden fehlte dieser Schritt.
--
-- Als Trigger und nicht im Frontend, weil Gebaeude ueber die App, ueber Lovable und
-- direkt per SQL entstehen. Die Funktion ist idempotent (ON CONFLICT DO NOTHING),
-- ein zusaetzlicher Aufruf schadet also nie.

create or replace function public.trg_ensure_stammakte_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.ensure_stammakte_categories(NEW.id);
  return NEW;
exception when others then
  -- Ein Gebaeude muss auch dann anlegbar bleiben, wenn die Ordnerstruktur klemmt.
  -- Der bisherige Weg ueber den Dokumentenbereich zieht sie dann nach.
  raise warning 'Stammakte-Ordner fuer Gebaeude % konnten nicht angelegt werden: %', NEW.id, sqlerrm;
  return NEW;
end;
$fn$;

drop trigger if exists ensure_stammakte_after_insert on public.buildings;
create trigger ensure_stammakte_after_insert
  after insert on public.buildings
  for each row execute function public.trg_ensure_stammakte_categories();

comment on function public.trg_ensure_stammakte_categories is
  'Legt die Standard-Ordnerstruktur (Stammakte) direkt beim Anlegen eines Gebaeudes an.';
