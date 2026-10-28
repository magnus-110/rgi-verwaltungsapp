-- Gemeinsamer Speicher für erkannte Texte: jede Datei wird nur einmal per OCR gelesen.
create table if not exists public.ocr_cache (
  sha256 text primary key,
  seiten jsonb not null,
  seitenzahl int,
  groesse bigint,
  quelle text,
  treffer int not null default 0,
  zuletzt_genutzt timestamptz,
  created_at timestamptz not null default now()
);
alter table public.ocr_cache enable row level security; -- nur Server-Funktionen (Service-Rolle)

create or replace function public.ocr_cache_treffer(p_sha text) returns void
language sql security definer set search_path = public as $$
  update ocr_cache set treffer = treffer + 1, zuletzt_genutzt = now() where sha256 = p_sha;
$$;
revoke execute on function public.ocr_cache_treffer(text) from public, anon, authenticated;

alter table public.email_attachments add column if not exists sha256 text;
create index if not exists email_attachments_sha256 on public.email_attachments (sha256);
