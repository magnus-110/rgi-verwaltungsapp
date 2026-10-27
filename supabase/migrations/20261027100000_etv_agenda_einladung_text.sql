-- Eigene Erläuterung je TOP für die Einladung (für Eigentümer), getrennt von der internen Beschreibung.
alter table public.etv_agenda_items add column if not exists einladung_text text;
update public.etv_agenda_items set einladung_text = description
  where include_description_in_invitation and coalesce(description,'') <> '' and einladung_text is null;
