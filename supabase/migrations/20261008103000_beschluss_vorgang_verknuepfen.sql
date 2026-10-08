-- Beschluss zur Umsetzung: bestehenden Vorgang verknuepfen statt immer neu anlegen (08.10.2026)
--
-- Gab es zum Thema schon einen Vorgang, entstand bisher trotzdem ein zweiter. Jetzt:
--  - TOP (etv_agenda_items.case_id) und Beschluss koennen einen vorhandenen Vorgang tragen.
--    Ist case_id gesetzt, legt der Trigger keinen neuen Vorgang an.
--  - etv_resolutions.case_auto_created merkt, ob der Vorgang automatisch entstand.
--    Nur solche werden beim Abschalten von "umzusetzen" archiviert. Ein verknuepfter,
--    vorhandener Vorgang wird nur geloest - nie archiviert.
-- Wiederholbar (idempotent).

alter table public.etv_agenda_items
  add column if not exists case_id uuid references public.cases(id) on delete set null;

alter table public.etv_resolutions
  add column if not exists case_auto_created boolean not null default false;

-- Bestand: automatisch angelegte Vorgaenge erkennen (Beschreibung des alten Triggers).
update public.etv_resolutions r
set case_auto_created = true
from public.cases c
where c.id = r.case_id
  and c.description like 'Automatisch aus Beschluss%'
  and r.case_auto_created = false;

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

  -- Umzusetzen und noch kein Vorgang: neuen anlegen
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
    NEW.case_auto_created := true;
    NEW.actionable_status := 'open';

    -- Kurztitel per KI anstossen (siehe Edge Function case-short-title)
    BEGIN
      PERFORM net.http_post(
        url := 'https://eebphowrbarzawwixqcc.supabase.co/functions/v1/case-short-title',
        headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlYnBob3dyYmFyemF3d2l4cWNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0Mzc2NDksImV4cCI6MjA2OTAxMzY0OX0.Ntd9QxBmN09Xbyg6ken2GFrXukNpDk9Hc0oMIubT7tg","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlYnBob3dyYmFyemF3d2l4cWNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0Mzc2NDksImV4cCI6MjA2OTAxMzY0OX0.Ntd9QxBmN09Xbyg6ken2GFrXukNpDk9Hc0oMIubT7tg"}'::jsonb,
        body := jsonb_build_object('caseId', v_case_id)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'case-short-title konnte nicht angestossen werden: %', SQLERRM;
    END;

  -- Umzusetzen mit vorhandenem Vorgang (verknuepft statt neu)
  ELSIF NEW.is_actionable = true AND NEW.case_id IS NOT NULL
        AND (OLD IS NULL OR OLD.is_actionable = false OR OLD.case_id IS DISTINCT FROM NEW.case_id) THEN
    IF OLD IS NULL OR OLD.is_actionable = false THEN
      NEW.actionable_status := 'open';
    END IF;
    -- Nur bei echter Neu-Verknuepfung im Verlauf vermerken (nicht bei jedem Neu-Uebertragen
    -- der Beschluss-Sammlung, das ist ein INSERT mit unveraendertem Vorgang).
    -- Von Hand gewaehlter Vorgang: gilt nie als automatisch angelegt
    IF TG_OP = 'UPDATE' AND OLD.case_id IS DISTINCT FROM NEW.case_id THEN
      NEW.case_auto_created := false;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.case_id IS DISTINCT FROM NEW.case_id THEN
      INSERT INTO public.case_events (case_id, building_id, event_type, title, body, created_by)
      SELECT c.id, c.building_id, 'note',
             'Beschluss ' || COALESCE(NEW.resolution_number, '') || ' verknüpft',
             'Dieser Vorgang setzt den Beschluss ' || COALESCE(NEW.resolution_number, '') || ' um.' || E'\n\n' || COALESCE(NEW.resolution_text, ''),
             COALESCE(v_uid, c.created_by)
      FROM public.cases c
      WHERE c.id = NEW.case_id AND COALESCE(v_uid, c.created_by) IS NOT NULL;
    END IF;
  END IF;

  -- Abgeschaltet: nur automatisch angelegte Vorgaenge archivieren, vorhandene nur loesen
  IF NEW.is_actionable = false AND OLD IS NOT NULL AND OLD.is_actionable = true THEN
    IF OLD.case_id IS NOT NULL AND OLD.case_auto_created THEN
      UPDATE public.cases
        SET status = 'archived', closed_at = COALESCE(closed_at, now())
        WHERE id = OLD.case_id AND status <> 'archived';
    ELSIF OLD.case_id IS NOT NULL THEN
      NEW.case_id := NULL;
    END IF;
    NEW.actionable_status := 'open';
  END IF;

  RETURN NEW;
END;
$function$;

-- Trigger auch beim Wechsel des verknuepften Vorgangs ausloesen
drop trigger if exists trg_resolution_actionable on public.etv_resolutions;
create trigger trg_resolution_actionable
  before insert or update of is_actionable, case_id on public.etv_resolutions
  for each row execute function public.handle_resolution_actionable();
