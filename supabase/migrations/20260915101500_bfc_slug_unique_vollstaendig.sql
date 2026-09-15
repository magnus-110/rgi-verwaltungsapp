-- ensure_stammakte_categories() war unbrauchbar: Ihr INSERT endet auf
--   ON CONFLICT (building_id, slug) DO NOTHING
-- der zugehoerige Unique-Index bfc_building_slug_uidx war aber PARTIELL
--   (... WHERE building_id IS NOT NULL AND slug IS NOT NULL).
-- PostgreSQL akzeptiert einen partiellen Index bei ON CONFLICT nur, wenn dessen
-- WHERE-Bedingung dort woertlich wiederholt wird. Andernfalls bricht das Statement
-- mit 42P10 ab - "there is no unique or exclusion constraint matching the
-- ON CONFLICT specification".
--
-- Folge: Die Funktion schlug bei JEDEM Aufruf fehl, auch auf dem bisherigen Weg
-- ueber den Dokumentenbereich (FolderTree, SaveAttachmentToBuildingDialog,
-- resolveDmsFolder). Neu angelegte Gebaeude blieben deshalb dauerhaft ohne
-- Ordnerstruktur; die vorhandenen Ordner aelterer Liegenschaften stammen aus
-- frueheren Migrationen, nicht aus dieser Funktion.
--
-- Der Index wird vollstaendig gemacht statt die Bedingung in die Funktion zu
-- kopieren: Fachlich ist ein Slug je Gebaeude eindeutig, und genau das sagt der
-- volle Index aus. Das Verhalten aendert sich nicht - NULL-Werte gelten in einem
-- Unique-Index ohnehin als verschieden, sodass die 22 Firmen-Kategorien ohne
-- building_id und die 2567 Eintraege ohne slug unberuehrt bleiben. Geprueft:
-- keine echten Duplikate (building_id und slug beide gesetzt).

create unique index if not exists bfc_building_slug_uidx_v2
  on public.building_file_categories (building_id, slug);

drop index if exists public.bfc_building_slug_uidx;

alter index public.bfc_building_slug_uidx_v2 rename to bfc_building_slug_uidx;
