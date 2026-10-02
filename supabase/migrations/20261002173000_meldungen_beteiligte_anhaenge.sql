-- Meldungen: Beteiligte Kontakte und Anhänge in Antworten
--
-- 1. Die Verwaltung kann beim Erfassen einer Meldung Kontakte eines Gebäudes
--    auswählen. Wer davon ein App-Konto hat, sieht die Meldung im Portal.
-- 2. Melder dürfen bei freigegebenen Antworten Fotos und Dokumente anhängen.
-- 3. Die Verwaltung darf Anhänge lesen und beim Löschen einer Meldung entfernen.

create table if not exists public.report_participants (
  report_id uuid not null references public.reports(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (report_id, contact_id)
);

create index if not exists report_participants_user_id_idx on public.report_participants(user_id);

alter table public.report_participants enable row level security;

create policy report_participants_staff_all on public.report_participants
  for all using (public.user_has_admin_access(auth.uid()))
  with check (public.user_has_admin_access(auth.uid()));

create policy report_participants_self_select on public.report_participants
  for select using (user_id = auth.uid());

create or replace function public.is_report_member(p_report_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.reports r where r.id = p_report_id and r.reported_by = p_user_id)
      or exists (select 1 from public.report_participants p where p.report_id = p_report_id and p.user_id = p_user_id);
$$;

alter policy reports_reporter_select on public.reports
  using (public.is_report_member(id, auth.uid()));

alter policy report_events_reporter_select on public.report_events
  using (visible_to_reporter and public.is_report_member(report_id, auth.uid()));

alter table public.report_events add column if not exists attachments jsonb not null default '[]'::jsonb;

alter policy report_events_reporter_reply on public.report_events
  with check (
    kind = 'reply'
    and visible_to_reporter
    and not allow_reply
    and not sent_by_email
    and step_label is null
    and assigned_to is null
    and created_by = auth.uid()
    and public.is_report_member(report_id, auth.uid())
    and exists (
      select 1 from public.reports r
      where r.id = report_events.report_id and r.reply_open and r.status <> 'resolved'
    )
  );

create or replace function public.report_file_visible(p_name text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.reports r
    where r.attachments @> jsonb_build_array(jsonb_build_object('path', p_name))
      and public.is_report_member(r.id, auth.uid())
  ) or exists (
    select 1 from public.report_events e
    where e.visible_to_reporter
      and e.attachments @> jsonb_build_array(jsonb_build_object('path', p_name))
      and public.is_report_member(e.report_id, auth.uid())
  );
$$;

create policy "Staff can read report attachments" on storage.objects
  for select using (bucket_id = 'report-attachments' and public.user_has_admin_access(auth.uid()));

create policy "Staff can delete report attachments" on storage.objects
  for delete using (bucket_id = 'report-attachments' and public.user_has_admin_access(auth.uid()));

create policy "Report members can read report attachments" on storage.objects
  for select using (bucket_id = 'report-attachments' and public.report_file_visible(name));

alter publication supabase_realtime add table public.report_participants;
