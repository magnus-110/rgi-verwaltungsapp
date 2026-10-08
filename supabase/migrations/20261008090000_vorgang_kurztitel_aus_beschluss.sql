-- Vorgaenge aus Beschluessen: kurzer Titel (1-3 Woerter) per KI, ohne Beschlussnummer (08.10.2026)
--
-- Bisher: Titel = "2026-1: " + bis zu 120 Zeichen Beschlusstext.
-- Jetzt:  vorlaeufiger Titel aus dem Beschlusstext (ohne Nummer), danach benennt die
--         Edge Function case-short-title den Vorgang per KI kurz um.
-- Wiederholbar (idempotent).

-- Merker: Titel wurde automatisch vergeben und darf von der KI ersetzt werden.
alter table public.cases add column if not exists title_auto boolean not null default false;

-- Vorlaeufiger Titel, falls die KI nicht erreichbar ist: Beschlusstext ohne die
-- Einleitung "Die (Wohnungs)Eigentuemer beschliessen", gekuerzt auf 60 Zeichen.
create or replace function public.beschluss_vorlaeufiger_titel(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  with t as (
    select left(btrim(
      regexp_replace(
        regexp_replace(coalesce(p_text, ''), '[\s"„“”]+', ' ', 'g'),
        '^\s*(die\s+)?(wohnungs)?eigentümer(gemeinschaft|innen)?\s+(beschließen|beschliessen|beschließt|beschliesst)\s*,?\s*', '', 'i'
      )), 60) as x
  )
  select coalesce(nullif(upper(left(x, 1)) || substr(x, 2), ''), 'Beschlussumsetzung') from t
$$;

create or replace function public.handle_resolution_actionable()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_case_id uuid;
  v_uid uuid;
BEGIN
  v_uid := COALESCE(auth.uid(), NEW.created_by);

  -- Newly toggled ON and no case yet
  IF NEW.is_actionable = true AND (OLD IS NULL OR OLD.is_actionable = false) AND NEW.case_id IS NULL THEN
    INSERT INTO public.cases (
      building_id, management_mode, title, title_auto, description,
      category, status, priority, created_by
    ) VALUES (
      NEW.building_id,
      'weg',
      public.beschluss_vorlaeufiger_titel(NEW.resolution_text),
      true,
      'Automatisch aus Beschluss ' || COALESCE(NEW.resolution_number, '') || ' erstellt.' || E'\n\n' || COALESCE(NEW.resolution_text, ''),
      'instandhaltung',
      'open',
      'medium',
      v_uid
    )
    RETURNING id INTO v_case_id;

    NEW.case_id := v_case_id;
    NEW.actionable_status := 'open';

    -- Kurztitel per KI anstossen. pg_net sendet erst nach dem Speichern, der Vorgang
    -- existiert dann bereits. Schlaegt das fehl, bleibt der vorlaeufige Titel.
    BEGIN
      PERFORM net.http_post(
        url := 'https://eebphowrbarzawwixqcc.supabase.co/functions/v1/case-short-title',
        headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlYnBob3dyYmFyemF3d2l4cWNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0Mzc2NDksImV4cCI6MjA2OTAxMzY0OX0.Ntd9QxBmN09Xbyg6ken2GFrXukNpDk9Hc0oMIubT7tg","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlYnBob3dyYmFyemF3d2l4cWNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0Mzc2NDksImV4cCI6MjA2OTAxMzY0OX0.Ntd9QxBmN09Xbyg6ken2GFrXukNpDk9Hc0oMIubT7tg"}'::jsonb,
        body := jsonb_build_object('caseId', v_case_id)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'case-short-title konnte nicht angestossen werden: %', SQLERRM;
    END;
  END IF;

  -- Toggled OFF: archive linked case (if any) and reset status
  IF NEW.is_actionable = false AND OLD IS NOT NULL AND OLD.is_actionable = true THEN
    IF OLD.case_id IS NOT NULL THEN
      UPDATE public.cases
        SET status = 'archived', closed_at = COALESCE(closed_at, now())
        WHERE id = OLD.case_id AND status <> 'archived';
    END IF;
    NEW.actionable_status := 'open';
  END IF;

  RETURN NEW;
END;
$function$;

-- Bestehende Vorgaenge mit altem Automatik-Titel ("2026-4: Die Wohnungseigentuemer ...")
-- zum Umbenennen vormerken. Von Hand vergebene Titel bleiben unberuehrt.
update public.cases c
set title_auto = true
from public.etv_resolutions r
where r.case_id = c.id
  and r.resolution_number is not null
  and c.title like r.resolution_number || ': %'
  and c.status <> 'archived';
