-- Endnutzer-Zugriff auf Dokument-Chunks fuer die Chat-Suche (Eigentuemer- und Mieterportal).
--
-- Bisher hatte document_chunks ausschliesslich eine Admin-Policy. Der Chat konnte deshalb
-- keine Dokumente heranziehen, ohne mit dem Service-Role-Key an der Berechtigung vorbei
-- zu lesen - was Auszuege aus fremden Einzelabrechnungen in die Antwort holen koennte.
--
-- Die Sichtbarkeitsregeln werden hier bewusst NICHT dupliziert: Der EXISTS-Subselect auf
-- building_files unterliegt selbst der RLS dieser Tabelle. Damit gilt automatisch dieselbe
-- Regel wie im Dokumentenbereich des Portals, und eine spaetere Aenderung dort wirkt hier
-- sofort mit. Chunks ohne file_id (Quelle building_documents) bleiben aussen vor, weil es
-- fuer building_documents keine Endnutzer-Policy gibt.

create policy "Endnutzer lesen Chunks freigegebener Dateien"
  on public.document_chunks
  for select
  to authenticated
  using (
    file_id is not null
    and exists (
      select 1
      from public.building_files bf
      where bf.id = document_chunks.file_id
    )
  );

-- Vektorsuche fuer den Endnutzer-Chat.
-- SECURITY INVOKER ist hier der entscheidende Teil: Die Funktion laeuft mit den Rechten
-- des fragenden Nutzers, sodass die Policy oben greift. Mit SECURITY DEFINER waere die
-- Berechtigungspruefung ausgehebelt.
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
  select
    dc.id,
    dc.file_id,
    dc.building_id,
    dc.content,
    (1 - (dc.embedding <=> query_embedding))::double precision as similarity,
    coalesce(bf.display_name, dc.metadata ->> 'display_name') as file_name,
    dc.category_path,
    nullif(dc.metadata ->> 'page_start', '')::integer,
    nullif(dc.metadata ->> 'page_end', '')::integer
  from public.document_chunks dc
  join public.building_files bf on bf.id = dc.file_id
  where dc.embedding is not null
    and (filter_building_id is null or dc.building_id = filter_building_id)
  order by dc.embedding <=> query_embedding
  limit greatest(coalesce(match_count, 8), 1)
$$;

grant execute on function public.search_document_chunks_for_user(vector, integer, uuid) to authenticated;

comment on function public.search_document_chunks_for_user is
  'Vektorsuche ueber Dokument-Chunks mit den Rechten des aufrufenden Nutzers. Liefert nur Abschnitte aus Dateien, die dieser Nutzer laut RLS auf building_files sehen darf.';
