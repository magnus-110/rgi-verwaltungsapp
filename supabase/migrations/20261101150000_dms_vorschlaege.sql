-- KI-Vorschlag für die DMS-Ablage von Mail-Anhängen (Objekt, Ordner, Wirtschaftsjahr).
-- Wird im Hintergrund nach dem Lesen des Anhangs erstellt; der Ablage-Dialog wählt ihn vor.
create table if not exists public.dms_vorschlaege (
  attachment_id uuid primary key references public.email_attachments(id) on delete cascade,
  building_id uuid references public.buildings(id) on delete set null,
  category_slug text,
  wirtschaftsjahr int,
  dokumentart text,
  quelle text not null default 'ki',          -- ki | gleiche_datei | ohne_text
  erstellt_am timestamptz not null default now(),
  -- Rückmeldung beim Ablegen: übernommen oder geändert (zum Messen und Lernen)
  abgelegt_am timestamptz,
  abgelegt_building_id uuid,
  abgelegt_category_id uuid,
  abgelegt_wirtschaftsjahr int,
  geaendert boolean
);

alter table public.dms_vorschlaege enable row level security;
drop policy if exists "Buero liest und meldet DMS-Vorschlaege" on public.dms_vorschlaege;
create policy "Buero liest und meldet DMS-Vorschlaege" on public.dms_vorschlaege
  for all to authenticated
  using (public.is_rgi_staff()) with check (public.is_rgi_staff());
