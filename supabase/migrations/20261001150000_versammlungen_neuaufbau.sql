-- =====================================================================
--  Versammlungen – Neuaufbau (Okt. 2026)
--
--  1) etv_meetings: Versanddatum der Einladung (Ladungsfrist),
--     Standard-Abstimmungsart und deren Grundlage
--  2) etv_topic_states: Themenspeicher – ein gemeinsamer Status für
--     Portal-Anträge, ETV-relevante E-Mails und eigene Notizen
--     (neu / eingeplant / zurückgestellt / erledigt)
--  3) etv_protocol_sign_requests: Protokoll per Link unterschreiben
--     lassen (z. B. durch einen Eigentümer) – ohne Anmeldung
--
--  Alles rein ergänzend, nichts Bestehendes wird verändert.
-- =====================================================================

-- 1) Versammlung -------------------------------------------------------
alter table public.etv_meetings
  add column if not exists invitation_sent_at date,
  add column if not exists default_voting_principle text,
  add column if not exists voting_basis_note text;

-- 2) Themenspeicher -----------------------------------------------------
create table if not exists public.etv_topic_states (
  source_type    text not null check (source_type in ('portal', 'email', 'note')),
  source_id      uuid not null,
  building_id    uuid references public.buildings(id) on delete cascade,
  status         text not null default 'neu'
                 check (status in ('neu', 'eingeplant', 'zurueckgestellt', 'erledigt')),
  -- bei „erledigt“: wie? (behandelt, ohne_versammlung, abgelehnt, gebuendelt, zurueckgezogen)
  outcome        text,
  reason         text,
  meeting_id     uuid references public.etv_meetings(id) on delete set null,
  -- Wird der Tagesordnungspunkt gelöscht, fällt das Thema zurück auf „neu“
  agenda_item_id uuid references public.etv_agenda_items(id) on delete cascade,
  merged_into    text,
  updated_by     uuid default auth.uid(),
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  primary key (source_type, source_id)
);

create index if not exists idx_etv_topic_states_building on public.etv_topic_states(building_id);
create index if not exists idx_etv_topic_states_meeting on public.etv_topic_states(meeting_id);

alter table public.etv_topic_states enable row level security;

drop policy if exists "Admins manage topic states" on public.etv_topic_states;
create policy "Admins manage topic states"
  on public.etv_topic_states for all
  using (public.user_has_admin_access(auth.uid()))
  with check (public.user_has_admin_access(auth.uid()));

-- 3) Unterschrift per Link ----------------------------------------------
create table if not exists public.etv_protocol_sign_requests (
  id                uuid primary key default gen_random_uuid(),
  meeting_id        uuid not null references public.etv_meetings(id) on delete cascade,
  role              text not null check (role in ('leiter', 'protokollant', 'eigentuemer')),
  signer_name       text not null,
  signer_contact_id uuid references public.contacts(id) on delete set null,
  email             text,
  token             text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  status            text not null default 'offen'
                    check (status in ('offen', 'unterschrieben', 'zurueckgezogen')),
  expires_at        timestamptz not null default (now() + interval '30 days'),
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  signed_at         timestamptz
);

create index if not exists idx_etv_sign_requests_meeting on public.etv_protocol_sign_requests(meeting_id);

alter table public.etv_protocol_sign_requests enable row level security;

drop policy if exists "Admins manage sign requests" on public.etv_protocol_sign_requests;
create policy "Admins manage sign requests"
  on public.etv_protocol_sign_requests for all
  using (public.user_has_admin_access(auth.uid()))
  with check (public.user_has_admin_access(auth.uid()));
-- Öffentlicher Zugriff läuft ausschließlich über die Edge Function
-- „etv-protocol-sign“ (Service-Rolle, prüft Token, Ablauf und Status).

-- 4) Protokoll unterschrieben und in den Gebäude-Dokumenten abgelegt
alter table public.etv_meetings add column if not exists protocol_filed_at timestamptz;
