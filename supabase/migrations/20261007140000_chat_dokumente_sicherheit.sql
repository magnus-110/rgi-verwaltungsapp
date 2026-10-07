-- Eigentuemer-Chat: Dokumente sicher und zuverlaessig auffindbar machen (07.10.2026)
--
-- 1. Alte Vektorsuchen ohne Rechtepruefung sperren. Sie liefen als SECURITY DEFINER
--    und waren fuer anon/authenticated ausfuehrbar - damit konnte jeder Text aus allen
--    Dokumenten aller Gebaeude abrufen. Sie werden im Code nicht mehr benutzt.
-- 2. Dateispeicher "building-files": Lesen nur noch fuer Verwaltung, fuer Dateien, die der
--    Nutzer laut building_files-RLS sehen darf, und fuer ETV-Anhaenge der eigenen Gebaeude.
-- 3. Suche fuer den Endnutzer-Chat: erst auf erlaubte Dateien filtern, dann sortieren.
--    Vorher hat der HNSW-Index die ~40 aehnlichsten Abschnitte ALLER Gebaeude geholt und
--    erst danach gefiltert - fuer ein einzelnes Gebaeude blieb fast nie etwas uebrig.
--    Ausserdem greift jetzt der Schalter "KI-Indexierung" (rag_enabled).
-- 4. KI-Indexierung standardmaessig an; Warteschlange fuer noch nicht ausgelesene Dateien.
-- Alle Schritte sind wiederholbar (idempotent).

-- ---------------------------------------------------------------- 1. Alte Suchen sperren
do $$
begin
  if to_regprocedure('public.search_document_chunks(vector, uuid, boolean, integer)') is not null then
    revoke execute on function public.search_document_chunks(vector, uuid, boolean, integer) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.search_document_chunks(vector, uuid, boolean, integer, boolean)') is not null then
    revoke execute on function public.search_document_chunks(vector, uuid, boolean, integer, boolean) from public, anon;
  end if;
  if to_regprocedure('public.search_document_chunks_with_metadata(vector, uuid, boolean, integer, boolean, text[], text[])') is not null then
    revoke execute on function public.search_document_chunks_with_metadata(vector, uuid, boolean, integer, boolean, text[], text[]) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.search_chunks_by_category(vector, uuid, text[], integer, double precision)') is not null then
    revoke execute on function public.search_chunks_by_category(vector, uuid, text[], integer, double precision) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.get_building_dashboard_stats(uuid)') is not null then
    revoke execute on function public.get_building_dashboard_stats(uuid) from public, anon;
  end if;
end $$;

revoke execute on function public.search_document_chunks_for_user(vector, integer, uuid) from public, anon;

-- ---------------------------------------------------------------- 2. Dateispeicher
create index if not exists idx_building_files_file_path on public.building_files (file_path);

drop policy if exists "Authenticated users can read building files" on storage.objects;
drop policy if exists "Building files lesen nach Freigabe" on storage.objects;
create policy "Building files lesen nach Freigabe" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'building-files'
    and name not like 'rgi/%'
    and (
      public.user_has_admin_access(auth.uid())
      -- Unterliegt der RLS auf building_files: nur freigegebene Dateien
      or exists (
        select 1 from public.building_files bf
        where bf.file_path = storage.objects.name and bf.deleted_at is null
      )
      -- TOP-Anhaenge der Eigentuemerversammlung: etv-attachments/{gebaeude}/...
      or (
        (storage.foldername(name))[1] = 'etv-attachments'
        and (storage.foldername(name))[2] in (
          select wob.building_id::text from public.weg_owner_buildings wob where wob.user_id = auth.uid()
        )
      )
    )
  );

-- ---------------------------------------------------------------- 3. Suche fuer Endnutzer
create or replace function public.search_document_chunks_for_user(
  query_embedding vector(1024),
  match_count integer default 8,
  filter_building_id uuid default null
)
returns table (
  chunk_id uuid,
  file_id uuid,
  building_id uuid,
  content text,
  similarity double precision,
  file_name text,
  category_path text[],
  page_start integer,
  page_end integer
)
language sql
stable
security invoker
set search_path = public
as $$
  -- "materialized" verhindert, dass der Vektorindex vor dem Rechte-/Gebaeudefilter
  -- greift. Je Gebaeude sind es nur einige hundert Abschnitte - exakte Suche ist schnell.
  with kandidaten as materialized (
    select dc.id, dc.file_id, dc.building_id, dc.content, dc.embedding, dc.category_path,
           dc.metadata, bf.display_name
    from public.document_chunks dc
    join public.building_files bf on bf.id = dc.file_id
    where dc.embedding is not null
      and bf.deleted_at is null
      and bf.rag_enabled
      and bf.is_current_version is not false
      and (filter_building_id is null or dc.building_id = filter_building_id)
  )
  select
    k.id,
    k.file_id,
    k.building_id,
    k.content,
    (1 - (k.embedding <=> query_embedding))::double precision as similarity,
    coalesce(k.display_name, k.metadata ->> 'display_name') as file_name,
    k.category_path,
    nullif(k.metadata ->> 'page_start', '')::integer,
    nullif(k.metadata ->> 'page_end', '')::integer
  from kandidaten k
  order by k.embedding <=> query_embedding
  limit greatest(coalesce(match_count, 8), 1)
$$;

grant execute on function public.search_document_chunks_for_user(vector, integer, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- 4. KI-Indexierung
-- Standard: an. Wer ein Dokument sehen darf, soll den Chat dazu fragen koennen.
-- Abschalten je Dokument bleibt moeglich und wirkt jetzt tatsaechlich.
alter table public.building_files alter column rag_enabled set default true;

-- Bisher hat nie jemand die KI-Indexierung bewusst abgeschaltet (alle "aus"-Werte stammen
-- vom alten Standard oder von Rechnungen). Ausnahme: Rechnungen bleiben aus.
update public.building_files
set rag_enabled = true
where rag_enabled = false
  and deleted_at is null
  and coalesce(source::text, '') <> 'invoice'
  and processing_status in ('pending', 'done', 'processing');

-- Warteschlange: Dateien, die Eigentuemer/Mieter sehen koennen, aber noch keine
-- Textabschnitte haben (nie ausgelesen, abgebrochen oder Abschnitte verloren).
create or replace function public.building_files_index_queue(p_limit integer default 3)
returns table (id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select bf.id
  from public.building_files bf
  where bf.deleted_at is null
    and bf.is_company = false
    and bf.rag_enabled
    and bf.visibility_role <> 'intern'
    and (
      bf.mime_type in ('application/pdf','image/jpeg','image/png','image/webp',
                       'text/plain','text/markdown','text/csv','application/json')
      or coalesce(length(bf.extracted_text), 0) > 0
    )
    and (
      bf.processing_status in ('pending', 'done')
      or (bf.processing_status = 'processing' and bf.updated_at < now() - interval '1 hour')
    )
    and not exists (select 1 from public.document_chunks dc where dc.file_id = bf.id)
  order by bf.created_at desc
  limit greatest(coalesce(p_limit, 3), 1)
$$;

revoke execute on function public.building_files_index_queue(integer) from public, anon, authenticated;
grant execute on function public.building_files_index_queue(integer) to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'building-files-index-queue') then
    perform cron.unschedule('building-files-index-queue');
  end if;
end $$;

select cron.schedule(
  'building-files-index-queue',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://eebphowrbarzawwixqcc.supabase.co/functions/v1/process-building-file',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlYnBob3dyYmFyemF3d2l4cWNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0Mzc2NDksImV4cCI6MjA2OTAxMzY0OX0.Ntd9QxBmN09Xbyg6ken2GFrXukNpDk9Hc0oMIubT7tg","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlYnBob3dyYmFyemF3d2l4cWNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0Mzc2NDksImV4cCI6MjA2OTAxMzY0OX0.Ntd9QxBmN09Xbyg6ken2GFrXukNpDk9Hc0oMIubT7tg"}'::jsonb,
    body := '{"queue":true}'::jsonb
  );
  $$
);
