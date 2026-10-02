-- =====================================================================
-- Meldungen im Postfach
--
-- Bisher lagen Meldungen in zwei getrennten Tabellen (weg_reports und
-- miete_reports) mit fast identischem Aufbau. Jede Stelle im Code musste
-- zwischen beiden unterscheiden. Ab jetzt gibt es eine Tabelle "reports"
-- mit dem Feld management_mode.
--
-- Dazu kommen:
--   * report_events  — der Verlauf einer Meldung: Stände für den Melder,
--                      Nachrichten (in beide Richtungen), interne Notizen,
--                      Übergaben und Systemeinträge.
--   * report_steps   — die Liste der Schritte, aus denen beim
--                      „Stand aktualisieren“ gewählt wird.
--   * Meldungsnummern im Format M-26-0001, fortlaufend je Jahr.
--
-- Die alten Felder admin_notes (für den Melder sichtbar) und
-- internal_notes (nur Büro) werden in den Verlauf übernommen.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Schritte für den Melder
-- ---------------------------------------------------------------------
create table public.report_steps (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  status text not null check (status in ('in_progress', 'waiting')),
  default_text text not null default '',
  -- Bei diesem Schritt darf der Melder standardmäßig antworten (Rückfrage).
  asks_reply boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger update_report_steps_updated_at
  before update on public.report_steps
  for each row execute function public.update_updated_at_column();

insert into public.report_steps (label, status, default_text, asks_reply, sort_order) values
  ('In Bearbeitung',           'in_progress', 'Wir kümmern uns um Ihr Anliegen.',                        false, 10),
  ('Handwerker beauftragt',    'in_progress', 'Wir haben einen Fachbetrieb beauftragt.',                 false, 20),
  ('Termin vereinbart',        'in_progress', 'Ein Termin vor Ort ist vereinbart.',                      false, 30),
  ('Wartet auf Angebot',       'waiting',     'Wir warten auf ein Angebot des Fachbetriebs.',            false, 40),
  ('Rückfrage an Sie',         'waiting',     'Wir benötigen noch eine Information von Ihnen.',          true,  50),
  ('Wartet auf Beschluss',     'waiting',     'Über die Maßnahme müssen die Eigentümer entscheiden.',    false, 60),
  ('An Versicherung gemeldet', 'waiting',     'Der Schaden ist der Gebäudeversicherung gemeldet.',       false, 70);

alter table public.report_steps enable row level security;

create policy report_steps_staff_all on public.report_steps
  for all to authenticated
  using (public.user_has_admin_access(auth.uid()))
  with check (public.user_has_admin_access(auth.uid()));

-- ---------------------------------------------------------------------
-- 2. Meldungsnummern
-- ---------------------------------------------------------------------
create table public.report_number_counters (
  year integer primary key,
  last_value integer not null default 0
);
alter table public.report_number_counters enable row level security;
-- Keine Policies: nur die Funktion unten schreibt hier.

create or replace function public.next_report_number(p_at timestamptz default now())
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_year integer := extract(year from p_at)::integer;
  v_n integer;
begin
  insert into public.report_number_counters (year, last_value)
  values (v_year, 1)
  on conflict (year) do update set last_value = public.report_number_counters.last_value + 1
  returning last_value into v_n;
  return 'M-' || to_char(p_at, 'YY') || '-' || lpad(v_n::text, 4, '0');
end;
$$;
revoke execute on function public.next_report_number(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Meldungen
-- ---------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  report_number text not null unique,
  management_mode public.management_mode not null,
  building_id uuid references public.buildings(id) on delete cascade,
  title text not null,
  description text,
  attachments jsonb not null default '[]'::jsonb,
  reported_by uuid references auth.users(id) on delete set null,
  contact_name text,
  contact_email text,
  contact_phone text,
  contact_address text,
  channel text not null default 'portal'
    check (channel in ('portal', 'email', 'phone', 'letter', 'in_person', 'chatbot')),
  source_email_id uuid references public.emails(id) on delete set null,
  -- open = neu, noch niemand zuständig · in_progress / waiting = in Bearbeitung · resolved = erledigt
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'waiting', 'resolved')),
  -- Der zuletzt eingetragene Stand (Bezeichnung des Schritts), für Listen und Portal.
  current_step text,
  priority text not null default 'normal' check (priority in ('normal', 'urgent')),
  assigned_to uuid references public.profiles(user_id) on delete set null,
  case_id uuid references public.cases(id) on delete set null,
  -- Darf der Melder gerade im Portal antworten?
  reply_open boolean not null default false,
  -- Hat das Büro die Meldung seit der letzten Aktivität des Melders gesehen?
  is_read boolean not null default false,
  has_new_reply boolean not null default false,
  resolved_at timestamptz,
  resolved_reason text,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reports_status_activity_idx on public.reports (status, last_activity_at desc);
create index reports_building_idx on public.reports (building_id);
create index reports_reported_by_idx on public.reports (reported_by);
create index reports_assigned_to_idx on public.reports (assigned_to);
create index reports_case_idx on public.reports (case_id);

create trigger update_reports_updated_at
  before update on public.reports
  for each row execute function public.update_updated_at_column();

-- Nummer vergeben; Melder können beim Anlegen nur die eigenen Angaben setzen.
create or replace function public.reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.report_number is null then
    new.report_number := public.next_report_number(coalesce(new.created_at, now()));
  end if;

  if auth.uid() is not null and not public.user_has_admin_access(auth.uid()) then
    new.status := 'open';
    new.current_step := null;
    new.priority := 'normal';
    new.assigned_to := null;
    new.case_id := null;
    new.reply_open := false;
    new.is_read := false;
    new.has_new_reply := false;
    new.resolved_at := null;
    new.resolved_reason := null;
    new.source_email_id := null;
    if new.channel not in ('portal', 'chatbot') then
      new.channel := 'portal';
    end if;
  end if;

  new.last_activity_at := coalesce(new.created_at, now());
  return new;
end;
$$;

create trigger reports_before_insert
  before insert on public.reports
  for each row execute function public.reports_before_insert();

alter table public.reports enable row level security;

create policy reports_staff_all on public.reports
  for all to authenticated
  using (public.user_has_admin_access(auth.uid()))
  with check (public.user_has_admin_access(auth.uid()));

create policy reports_reporter_select on public.reports
  for select to authenticated
  using (reported_by = auth.uid());

create policy reports_reporter_insert on public.reports
  for insert to authenticated
  with check (
    reported_by = auth.uid()
    and (
      (public.get_user_role(auth.uid()) = 'weg_owner'::public.app_role and management_mode = 'weg')
      or (public.get_user_role(auth.uid()) = 'tenant'::public.app_role and management_mode = 'rent')
    )
  );

-- ---------------------------------------------------------------------
-- 4. Verlauf einer Meldung
-- ---------------------------------------------------------------------
create table public.report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  -- step = neuer Stand · message = Nachricht an den Melder · reply = Antwort des Melders
  -- note = interne Notiz · assignment = Übergabe · system = automatischer Eintrag
  kind text not null check (kind in ('step', 'message', 'reply', 'note', 'assignment', 'system')),
  body text,
  step_label text,
  visible_to_reporter boolean not null default false,
  allow_reply boolean not null default false,
  sent_by_email boolean not null default false,
  assigned_to uuid references public.profiles(user_id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index report_events_report_idx on public.report_events (report_id, created_at);

alter table public.report_events enable row level security;

create policy report_events_staff_all on public.report_events
  for all to authenticated
  using (public.user_has_admin_access(auth.uid()))
  with check (public.user_has_admin_access(auth.uid()));

create policy report_events_reporter_select on public.report_events
  for select to authenticated
  using (
    visible_to_reporter
    and exists (
      select 1 from public.reports r
      where r.id = report_events.report_id and r.reported_by = auth.uid()
    )
  );

-- Melder dürfen nur antworten, wenn die Verwaltung das freigegeben hat.
create policy report_events_reporter_reply on public.report_events
  for insert to authenticated
  with check (
    kind = 'reply'
    and visible_to_reporter
    and not allow_reply
    and not sent_by_email
    and step_label is null
    and assigned_to is null
    and created_by = auth.uid()
    and exists (
      select 1 from public.reports r
      where r.id = report_events.report_id
        and r.reported_by = auth.uid()
        and r.reply_open
        and r.status <> 'resolved'
    )
  );

-- Nach jedem Eintrag: Aktivität merken. Antwortet der Melder, schließt sich
-- das Antwortfeld, die Meldung wird als ungelesen markiert und die zuständige
-- Person bekommt einen Hinweis. Bei einer Übergabe wird die neue Person
-- benachrichtigt.
create or replace function public.report_events_after_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
begin
  update public.reports
     set last_activity_at = new.created_at,
         reply_open    = case when new.kind = 'reply' then false else reply_open end,
         is_read       = case when new.kind = 'reply' then false else is_read end,
         has_new_reply = case when new.kind = 'reply' then true else has_new_reply end
   where id = new.report_id
   returning id, report_number, title, assigned_to into r;

  if new.kind = 'reply' and r.assigned_to is not null then
    insert into public.notifications (user_id, type, title, body, url, ref_type, ref_id, actor_user_id)
    values (
      r.assigned_to,
      'report_reply',
      'Antwort auf Meldung ' || r.report_number,
      left(coalesce(new.body, ''), 160),
      '/postfach?meldung=' || r.id,
      'report',
      r.id,
      new.created_by
    );
  end if;

  if new.kind = 'assignment'
     and new.assigned_to is not null
     and new.assigned_to is distinct from new.created_by then
    insert into public.notifications (user_id, type, title, body, url, ref_type, ref_id, actor_user_id)
    values (
      new.assigned_to,
      'report_assigned',
      'Meldung ' || r.report_number || ' übergeben',
      coalesce(nullif(btrim(coalesce(new.body, '')), ''), r.title),
      '/postfach?meldung=' || r.id,
      'report',
      r.id,
      new.created_by
    );
  end if;

  return new;
end;
$$;

create trigger report_events_after_insert
  after insert on public.report_events
  for each row execute function public.report_events_after_insert();

-- ---------------------------------------------------------------------
-- 5. Bestehende Meldungen übernehmen
-- ---------------------------------------------------------------------
with alle as (
  select id, 'weg'::public.management_mode as mode, building_id, title, description,
         coalesce(attachments, '[]'::jsonb) as attachments, reported_by,
         contact_name, contact_email, contact_phone, contact_address,
         status, 'normal'::text as priority, case_id, created_at, updated_at
    from public.weg_reports
  union all
  select id, 'rent'::public.management_mode, building_id, title, description,
         coalesce(attachments, '[]'::jsonb), reported_by,
         contact_name, contact_email, contact_phone, contact_address,
         status, case when priority = 'high' then 'urgent' else 'normal' end, case_id, created_at, updated_at
    from public.miete_reports
),
nummeriert as (
  select a.*,
         'M-' || to_char(a.created_at, 'YY') || '-' ||
         lpad(row_number() over (partition by extract(year from a.created_at) order by a.created_at, a.id)::text, 4, '0') as nr
    from alle a
)
insert into public.reports (
  id, report_number, management_mode, building_id, title, description, attachments,
  reported_by, contact_name, contact_email, contact_phone, contact_address,
  channel, status, current_step, priority, case_id, is_read,
  resolved_at, last_activity_at, created_at, updated_at
)
select id, nr, mode, building_id, title, description, attachments,
       (select u.id from auth.users u where u.id = n.reported_by),
       contact_name, contact_email, contact_phone, contact_address,
       'portal', status,
       case status when 'in_progress' then 'In Bearbeitung' when 'resolved' then 'Erledigt' end,
       priority, case_id, true,
       case when status = 'resolved' then updated_at end,
       updated_at, created_at, updated_at
  from nummeriert n;

-- Zähler auf den höchsten vergebenen Wert je Jahr setzen.
insert into public.report_number_counters (year, last_value)
select extract(year from created_at)::integer, count(*)
  from public.reports
 group by 1
on conflict (year) do update set last_value = excluded.last_value;

-- Bisherige „Verwalter-Notiz“ (für den Melder sichtbar) → Nachricht im Verlauf
insert into public.report_events (report_id, kind, body, visible_to_reporter, created_at)
select id, 'message', btrim(admin_notes), true, updated_at
  from public.weg_reports where btrim(coalesce(admin_notes, '')) <> ''
union all
select id, 'message', btrim(admin_notes), true, updated_at
  from public.miete_reports where btrim(coalesce(admin_notes, '')) <> '';

-- Bisherige „Interne Notizen“ → interne Notiz im Verlauf
insert into public.report_events (report_id, kind, body, visible_to_reporter, created_at)
select id, 'note', btrim(internal_notes), false, updated_at
  from public.weg_reports where btrim(coalesce(internal_notes, '')) <> ''
union all
select id, 'note', btrim(internal_notes), false, updated_at
  from public.miete_reports where btrim(coalesce(internal_notes, '')) <> '';

-- Die Einträge oben dürfen die Aktivität nicht auf "jetzt" setzen.
update public.reports r set last_activity_at = greatest(r.updated_at, r.created_at);

-- Verknüpfungen in Vorgängen auf die neue Tabelle zeigen lassen.
update public.case_events set source_table = 'reports'
 where source_table in ('weg_reports', 'miete_reports');

-- Die alten Tabellen weg_reports und miete_reports bleiben vorerst als
-- Sicherung stehen und werden nicht mehr beschrieben. Entfernen, sobald alles
-- geprüft ist:
--   drop table public.weg_reports;
--   drop table public.miete_reports;

alter publication supabase_realtime add table public.reports;
alter publication supabase_realtime add table public.report_events;

-- ---------------------------------------------------------------------
-- 6. Aufgaben aus Meldungen
-- ---------------------------------------------------------------------
alter table public.todos drop constraint todos_source_type_check;
alter table public.todos add constraint todos_source_type_check
  check (source_type = any (array['manual', 'maintenance', 'annual_cycle', 'case', 'dunning', 'meeting', 'report']));

create index if not exists todos_source_idx on public.todos (source_type, source_id);

-- Wird eine Aufgabe aus einer Meldung erledigt, steht das im Verlauf der Meldung.
create or replace function public.todo_done_writes_report_event()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.source_type <> 'report' or new.source_id is null then return new; end if;
  if new.status is not distinct from old.status then return new; end if;
  if new.status <> 'done' then return new; end if;
  if not exists (select 1 from public.reports where id = new.source_id) then return new; end if;

  insert into public.report_events (report_id, kind, body, created_by)
  values (new.source_id, 'system', 'Aufgabe erledigt: ' || new.title, auth.uid());
  return new;
end;
$$;

create trigger todos_done_report_event
  after update on public.todos
  for each row execute function public.todo_done_writes_report_event();

-- ---------------------------------------------------------------------
-- 7. Antwortvorlagen zu den E-Mail-Vorlagen umziehen
-- ---------------------------------------------------------------------
-- Die beiden Textbausteine der alten Meldungsseite lagen in report_templates
-- (eigentlich für Abrechnungs-Vorlagen gedacht). Antworten auf Meldungen
-- nutzen jetzt die E-Mail-Vorlagen, Kategorie „Meldungen“.
insert into public.email_templates (created_by, name, category, subject, body, is_shared)
select (select user_id from public.profiles where role = 'admin' order by created_at limit 1),
       t.name, 'Meldungen', null, coalesce(t.content, t.name), true
  from public.report_templates t
 where t.name in ('Handwerker wurde informiert und kümmert sich drum', 'Heizöl wurden bestellt')
   and t.background_pdf_url is null
   and exists (select 1 from public.profiles where role = 'admin');

-- Die beiden alten Einträge in report_templates können danach entfernt werden:
--   delete from public.report_templates
--    where name in ('Handwerker wurde informiert und kümmert sich drum', 'Heizöl wurden bestellt')
--      and background_pdf_url is null;

-- ---------------------------------------------------------------------
-- 8. Auswertungen auf die neue Tabelle umstellen
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dashboard_global_stats(p_management_mode management_mode)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_building_ids uuid[];
  v_subscribed_account_ids uuid[];
  v_inbox_folder_ids uuid[];
  v_open_reports int := 0;
  v_open_cases int := 0;
  v_open_invoices int := 0;
  v_unread_emails int := 0;
  v_today_tasks jsonb := '[]'::jsonb;
  v_week_tasks jsonb := '[]'::jsonb;
  v_today_maintenance jsonb := '[]'::jsonb;
  v_week_maintenance jsonb := '[]'::jsonb;
  v_upcoming_maintenance jsonb := '[]'::jsonb;
  v_recent_activity jsonb := '[]'::jsonb;
  v_buildings_summary jsonb := '[]'::jsonb;
BEGIN
  BEGIN
    SELECT public.user_has_admin_access(v_user_id) INTO v_is_admin;
  EXCEPTION WHEN OTHERS THEN v_is_admin := false;
  END;

  IF v_is_admin THEN
    SELECT array_agg(id) INTO v_building_ids FROM buildings WHERE management_mode = p_management_mode;
  ELSE
    SELECT array_agg(b.id) INTO v_building_ids
    FROM buildings b
    JOIN building_managers bm ON bm.building_id = b.id
    WHERE bm.user_id = v_user_id AND b.management_mode = p_management_mode;
  END IF;

  IF v_building_ids IS NULL OR array_length(v_building_ids, 1) IS NULL THEN
    v_building_ids := ARRAY[]::uuid[];
  END IF;

  SELECT count(*) INTO v_open_reports FROM reports
  WHERE status = 'open' AND management_mode = p_management_mode AND building_id = ANY(v_building_ids);

  SELECT count(*) INTO v_open_cases FROM cases
  WHERE building_id = ANY(v_building_ids)
    AND status::text IN ('open','in_progress','waiting_external')
    AND management_mode = p_management_mode;

  BEGIN
    SELECT count(*) INTO v_open_invoices FROM invoices
    WHERE status = 'open'
      AND (building_id = ANY(v_building_ids) OR (v_is_admin AND building_id IS NULL));
  EXCEPTION WHEN OTHERS THEN v_open_invoices := 0; END;

  -- Unread emails: only mailboxes the user subscribed to (in_app_email_subscriptions),
  -- only in the system "Eingang" folder, excluding drafts.
  BEGIN
    SELECT array_agg(account_id) INTO v_subscribed_account_ids
    FROM in_app_email_subscriptions
    WHERE user_id = v_user_id;
  EXCEPTION WHEN OTHERS THEN v_subscribed_account_ids := NULL; END;

  BEGIN
    SELECT array_agg(id) INTO v_inbox_folder_ids
    FROM email_folders WHERE name = 'Eingang' AND is_system = true;
  EXCEPTION WHEN OTHERS THEN v_inbox_folder_ids := NULL; END;

  BEGIN
    IF v_subscribed_account_ids IS NULL OR array_length(v_subscribed_account_ids, 1) IS NULL THEN
      v_unread_emails := 0;
    ELSE
      SELECT count(*) INTO v_unread_emails FROM emails
      WHERE coalesce(is_read, false) = false
        AND deleted_at IS NULL
        AND coalesce(is_draft, false) = false
        AND account_id = ANY(v_subscribed_account_ids)
        AND (v_inbox_folder_ids IS NULL OR folder_id = ANY(v_inbox_folder_ids));
    END IF;
  EXCEPTION WHEN OTHERS THEN v_unread_emails := 0; END;

  BEGIN
    SELECT coalesce(jsonb_agg(t ORDER BY (t->>'due_date')), '[]'::jsonb) INTO v_today_tasks
    FROM (
      SELECT DISTINCT ON (td.id) jsonb_build_object(
        'id', td.id, 'title', td.title, 'priority', td.priority,
        'due_date', td.due_date, 'status', td.status,
        'is_overdue', (td.due_date::date < current_date)
      ) as t, td.due_date, td.id
      FROM todos td
      LEFT JOIN todo_assignments ta ON ta.todo_id = td.id
      WHERE td.status != 'done'
        AND td.due_date::date <= current_date
        AND (td.created_by = v_user_id OR ta.user_id = v_user_id
             OR (v_is_admin AND td.building_id = ANY(v_building_ids)))
    ) sub;
  EXCEPTION WHEN OTHERS THEN v_today_tasks := '[]'::jsonb; END;

  BEGIN
    SELECT coalesce(jsonb_agg(t ORDER BY (t->>'due_date')), '[]'::jsonb) INTO v_week_tasks
    FROM (
      SELECT DISTINCT ON (td.id) jsonb_build_object(
        'id', td.id, 'title', td.title, 'priority', td.priority,
        'due_date', td.due_date, 'status', td.status
      ) as t, td.due_date, td.id
      FROM todos td
      LEFT JOIN todo_assignments ta ON ta.todo_id = td.id
      WHERE td.status != 'done'
        AND td.due_date::date > current_date
        AND td.due_date::date <= current_date + interval '7 days'
        AND (td.created_by = v_user_id OR ta.user_id = v_user_id
             OR (v_is_admin AND td.building_id = ANY(v_building_ids)))
    ) sub;
  EXCEPTION WHEN OTHERS THEN v_week_tasks := '[]'::jsonb; END;

  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'title', m.title, 'building_name', b.name,
      'due_date', m.due_date, 'maintenance_type', m.maintenance_type
    ) ORDER BY m.due_date), '[]'::jsonb) INTO v_today_maintenance
    FROM maintenance_schedule m
    JOIN buildings b ON b.id = m.building_id
    WHERE m.building_id = ANY(v_building_ids)
      AND m.status = 'pending'
      AND m.due_date::date = current_date;
  EXCEPTION WHEN OTHERS THEN v_today_maintenance := '[]'::jsonb; END;

  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'title', m.title, 'building_name', b.name,
      'due_date', m.due_date, 'maintenance_type', m.maintenance_type
    ) ORDER BY m.due_date), '[]'::jsonb) INTO v_week_maintenance
    FROM maintenance_schedule m
    JOIN buildings b ON b.id = m.building_id
    WHERE m.building_id = ANY(v_building_ids)
      AND m.status = 'pending'
      AND m.due_date::date > current_date
      AND m.due_date::date <= current_date + interval '7 days';
  EXCEPTION WHEN OTHERS THEN v_week_maintenance := '[]'::jsonb; END;

  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'title', m.title, 'building_name', b.name,
      'due_date', m.due_date, 'maintenance_type', m.maintenance_type
    ) ORDER BY m.due_date), '[]'::jsonb) INTO v_upcoming_maintenance
    FROM maintenance_schedule m
    JOIN buildings b ON b.id = m.building_id
    WHERE m.building_id = ANY(v_building_ids)
      AND m.status = 'pending'
      AND m.due_date::date > current_date + interval '7 days'
      AND m.due_date::date <= current_date + interval '30 days';
  EXCEPTION WHEN OTHERS THEN v_upcoming_maintenance := '[]'::jsonb; END;

  BEGIN
    SELECT coalesce(jsonb_agg(act ORDER BY (act->>'occurred_at') DESC), '[]'::jsonb)
    INTO v_recent_activity
    FROM (
      SELECT jsonb_build_object('type','report','id',r.id,'title',r.title,'building_name',b.name,'occurred_at',r.created_at) as act
      FROM reports r JOIN buildings b ON b.id = r.building_id
      WHERE r.building_id = ANY(v_building_ids) AND r.created_at > now() - interval '7 days'
        AND r.management_mode = p_management_mode
      UNION ALL
      SELECT jsonb_build_object('type','case','id',c.id,'title',c.title,'building_name',b.name,'occurred_at',c.created_at)
      FROM cases c JOIN buildings b ON b.id = c.building_id
      WHERE c.building_id = ANY(v_building_ids) AND c.created_at > now() - interval '7 days' AND c.management_mode = p_management_mode
      ORDER BY 1 DESC LIMIT 10
    ) sub;
  EXCEPTION WHEN OTHERS THEN v_recent_activity := '[]'::jsonb; END;

  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'name', b.name, 'address', b.address,
      'open_reports', coalesce((SELECT count(*) FROM reports WHERE building_id = b.id AND status = 'open'), 0),
      'open_cases', coalesce((SELECT count(*) FROM cases WHERE building_id = b.id AND status::text IN ('open','in_progress','waiting_external') AND management_mode = p_management_mode),0)
    ) ORDER BY b.name), '[]'::jsonb) INTO v_buildings_summary
    FROM buildings b WHERE b.id = ANY(v_building_ids);
  EXCEPTION WHEN OTHERS THEN v_buildings_summary := '[]'::jsonb; END;

  RETURN jsonb_build_object(
    'open_reports', v_open_reports,
    'open_cases', v_open_cases,
    'open_invoices', v_open_invoices,
    'unread_emails', v_unread_emails,
    'today_tasks', v_today_tasks,
    'week_tasks', v_week_tasks,
    'today_maintenance', v_today_maintenance,
    'week_maintenance', v_week_maintenance,
    'upcoming_maintenance', v_upcoming_maintenance,
    'recent_activity', v_recent_activity,
    'buildings_summary', v_buildings_summary
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_building_overview(p_building_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mode management_mode;
  v_open_reports int := 0;
  v_open_cases int := 0;
  v_booking_total int := 0;
  v_booking_done int := 0;
  v_booking_pct numeric := 0;
  v_period_label text := '';
  v_period_from date;
  v_period_to date;
  v_top_reports jsonb := '[]'::jsonb;
  v_top_cases jsonb := '[]'::jsonb;
  v_owners jsonb := '[]'::jsonb;
  v_providers jsonb := '[]'::jsonb;
BEGIN
  SELECT management_mode INTO v_mode FROM buildings WHERE id = p_building_id;
  IF v_mode IS NULL THEN
    RETURN jsonb_build_object('error', 'building_not_found');
  END IF;

  SELECT count(*) INTO v_open_reports FROM reports WHERE building_id = p_building_id AND status = 'open';
  SELECT coalesce(jsonb_agg(r ORDER BY (r->>'created_at') DESC), '[]'::jsonb) INTO v_top_reports
  FROM (
    SELECT jsonb_build_object(
      'id', id, 'report_number', report_number, 'title', title, 'description', description,
      'priority', priority, 'created_at', created_at,
      'contact_name', contact_name
    ) as r
    FROM reports
    WHERE building_id = p_building_id AND status = 'open'
    ORDER BY created_at DESC LIMIT 5
  ) sub;

  SELECT count(*) INTO v_open_cases FROM cases
  WHERE building_id = p_building_id AND status::text IN ('open','in_progress','waiting_external');

  SELECT coalesce(jsonb_agg(c ORDER BY (c->>'created_at') DESC), '[]'::jsonb) INTO v_top_cases
  FROM (
    SELECT jsonb_build_object(
      'id', id, 'title', title, 'priority', priority::text,
      'status', status::text, 'category', category::text,
      'created_at', created_at, 'unit_number', unit_number
    ) as c
    FROM cases
    WHERE building_id = p_building_id AND status::text IN ('open','in_progress','waiting_external')
    ORDER BY
      CASE priority::text
        WHEN 'urgent' THEN 0 WHEN 'high' THEN 1
        WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
      created_at DESC
    LIMIT 5
  ) sub;

  v_period_to := date_trunc('month', current_date)::date - 1;
  v_period_from := date_trunc('month', v_period_to)::date;
  v_period_label := to_char(v_period_from, 'TMMonth YYYY');

  SELECT count(*) INTO v_booking_total
  FROM bank_transactions
  WHERE building_id = p_building_id
    AND booking_date BETWEEN v_period_from AND v_period_to;

  SELECT count(*) INTO v_booking_done
  FROM bank_transactions
  WHERE building_id = p_building_id
    AND booking_date BETWEEN v_period_from AND v_period_to
    AND (booking_id IS NOT NULL OR matched_invoice_id IS NOT NULL OR matched_template_id IS NOT NULL);

  IF v_booking_total > 0 THEN
    v_booking_pct := round((v_booking_done::numeric / v_booking_total::numeric) * 100, 0);
  END IF;

  SELECT coalesce(jsonb_agg(o ORDER BY (o->>'unit_number') NULLS LAST, (o->>'name')), '[]'::jsonb) INTO v_owners
  FROM (
    SELECT jsonb_build_object(
      'assignment_id', cba.id,
      'contact_id', cba.contact_id,
      'unit_number', cba.unit_number,
      'name', coalesce(
        nullif(trim(coalesce(cp.first_name,'') || ' ' || coalesce(cp.last_name,'')), ''),
        c.company_name,
        nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''),
        c.short_name,
        'Unbenannt'
      ),
      'email', (
        SELECT ce.email FROM contact_emails ce
        WHERE ce.contact_id = c.id
        ORDER BY ce.is_primary DESC NULLS LAST LIMIT 1
      ),
      'phone', (
        SELECT cph.phone_number FROM contact_phones cph
        WHERE cph.contact_id = c.id
        ORDER BY cph.id LIMIT 1
      )
    ) as o
    FROM contact_building_assignments cba
    JOIN contacts c ON c.id = cba.contact_id
    LEFT JOIN contact_persons cp ON cp.contact_id = c.id AND cp.is_primary = true
    WHERE cba.building_id = p_building_id
      AND cba.role_in_building::text = 'eigentuemer'
      AND coalesce(cba.is_active, true) = true
  ) sub;

  SELECT coalesce(jsonb_agg(d ORDER BY (d->>'name')), '[]'::jsonb) INTO v_providers
  FROM (
    SELECT DISTINCT ON (c.id) jsonb_build_object(
      'assignment_id', cba.id,
      'contact_id', cba.contact_id,
      'name', coalesce(c.company_name, nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''), c.short_name, 'Dienstleister'),
      'service_category', cba.service_category,
      'email', (
        SELECT ce.email FROM contact_emails ce
        WHERE ce.contact_id = c.id
        ORDER BY ce.is_primary DESC NULLS LAST LIMIT 1
      ),
      'phone', (
        SELECT cph.phone_number FROM contact_phones cph
        WHERE cph.contact_id = c.id
        ORDER BY cph.id LIMIT 1
      )
    ) as d
    FROM contact_building_assignments cba
    JOIN contacts c ON c.id = cba.contact_id
    WHERE cba.building_id = p_building_id
      AND cba.role_in_building::text = 'dienstleister'
      AND coalesce(cba.is_active, true) = true
  ) sub;

  RETURN jsonb_build_object(
    'open_reports_count', v_open_reports,
    'open_cases_count', v_open_cases,
    'booking_progress', jsonb_build_object(
      'period_label', v_period_label,
      'period_from', v_period_from,
      'period_to', v_period_to,
      'total', v_booking_total,
      'done', v_booking_done,
      'percent', v_booking_pct
    ),
    'top_reports', v_top_reports,
    'top_cases', v_top_cases,
    'owners', v_owners,
    'providers', v_providers
  );
END;
$function$;
