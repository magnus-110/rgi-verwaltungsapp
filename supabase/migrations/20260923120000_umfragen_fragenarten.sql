-- =====================================================================
--  Umfragen: unabhängig vom Thema
--
--  Bisher kannte das Modul genau eine Sorte Frage: eine Maßnahme mit
--  Kostenstufe, Pflicht-Kennzeichen und der festen Antwort Ja/Neutral/Nein.
--  Ab hier hat jeder Punkt eine "Art" (kind). Die Art entscheidet, welche
--  Felder gefüllt werden und wie die Antwort aussieht.
--
--  Arten:
--    massnahme        — wie bisher: Kosten, Pflicht, Ja/Neutral/Nein, MEA
--    einfachauswahl   — eine von mehreren selbst geschriebenen Antworten
--    mehrfachauswahl  — mehrere davon
--    skala            — 1 bis n, mit Beschriftung an den Enden
--    freitext         — freie Antwort
--    datum            — ein Datum (z. B. Terminabfrage)
--    info             — nur Information, keine Antwort
--
--  Ausserdem: das Quorum entfällt, die Gewichtung nach Miteigentums-
--  anteilen wird pro Umfrage einstellbar.
-- =====================================================================

-- ---------- 1. Punkte: Art und die Felder je Art ----------
alter table public.survey_items
  add column if not exists kind             text,
  add column if not exists answer_options   text[],
  add column if not exists scale_max        int,
  add column if not exists scale_min_label  text,
  add column if not exists scale_max_label  text,
  add column if not exists is_required      boolean not null default true,
  add column if not exists depends_on_value text;

-- Bestehende Punkte einordnen: Info bleibt Info, alles andere ist eine Maßnahme.
update public.survey_items
   set kind = case when item_type = 'info' then 'info' else 'massnahme' end
 where kind is null;

alter table public.survey_items
  alter column kind set default 'massnahme',
  alter column kind set not null;

-- Alte Abhängigkeit (Ja/Neutral/Nein) in das allgemeine Feld übernehmen.
update public.survey_items
   set depends_on_value = depends_on_choice::text
 where depends_on_choice is not null
   and depends_on_value is null;

alter table public.survey_items drop constraint if exists survey_items_kind_check;
alter table public.survey_items
  add constraint survey_items_kind_check
  check (kind in ('massnahme','einfachauswahl','mehrfachauswahl','skala','freitext','datum','info'));

-- item_type gibt es weiter, damit älterer Code nichts merkt; es folgt der Art.
create or replace function public.survey_item_sync_type()
returns trigger language plpgsql set search_path = public as $$
begin
  new.item_type := case when new.kind = 'info' then 'info' else 'question' end;
  return new;
end $$;

drop trigger if exists trg_survey_item_sync_type on public.survey_items;
create trigger trg_survey_item_sync_type
  before insert or update on public.survey_items
  for each row execute function public.survey_item_sync_type();

-- ---------- 2. Antworten: ein Feld je Art ----------
alter table public.survey_votes
  add column if not exists option_indexes int[],   -- Einfach-/Mehrfachauswahl (Index in answer_options)
  add column if not exists scale_value    int,     -- Skala
  add column if not exists text_answer    text,    -- Freitext
  add column if not exists date_answer    date;    -- Datum

-- ---------- 3. Umfrage: Gewichtung einstellbar, kein Quorum mehr ----------
alter table public.surveys
  add column if not exists weight_by_mea boolean not null default true;

alter table public.surveys drop column if exists quorum_pct;
