-- E-Mail-Signaturen im RGI-Design
-- 1) Je Postfach: Formularfelder + daraus erzeugte HTML- und Textsignatur.
--    signature_html bleibt bestehen (historisch Text, wird von Vorlagen/Rundmails genutzt).
-- 2) Zentrale Pflichtangaben (§ 125 i. V. m. § 177a HGB, § 35a GmbHG) und Logo-URL
--    für alle Signaturen in einer eigenen Einzeilen-Tabelle. Bewusst getrennt von
--    rgi_company_settings, das für Rechnungen verwendet wird.

alter table public.email_accounts
  add column if not exists signature_fields jsonb,
  add column if not exists signature_text text,
  add column if not exists signature_rich_html text;

comment on column public.email_accounts.signature_fields is 'Formularfelder der Signatur (greeting, name, title, qualification, phone, email)';
comment on column public.email_accounts.signature_text is 'Erzeugte Textversion der Signatur (Text-Teil der Mail)';
comment on column public.email_accounts.signature_rich_html is 'Erzeugte HTML-Signatur (HTML-Teil der Mail)';

create table if not exists public.email_signature_settings (
  id boolean primary key default true check (id),
  logo_url text not null default 'https://rgi-immobilien.de/lovable-uploads/4a83f87f-ad41-4d60-9f25-40128b981ab0.png',
  website text not null default 'rgi-immobilien.de',
  address text not null default 'Vilstalstr. 4 · 87459 Pfronten',
  kg_name text not null default 'RGI-Immobilien GmbH & Co. KG',
  kg_seat text not null default 'Pfronten',
  kg_register text not null default 'Amtsgericht Kempten (Allgäu) HRA 11535',
  kg_vat_id text not null default 'DE369781249',
  gp_name text not null default 'RGI-Immobilien Verwaltungs GmbH',
  gp_seat text not null default 'Pfronten',
  gp_register text not null default 'Amtsgericht Kempten (Allgäu) HRB 17733',
  managing_directors text not null default 'Regina Göttinger, Andreas Göttinger, Maximilian Göttinger',
  updated_at timestamptz not null default now()
);

insert into public.email_signature_settings (id) values (true) on conflict (id) do nothing;

alter table public.email_signature_settings enable row level security;

drop policy if exists "Admins can manage email_signature_settings" on public.email_signature_settings;
create policy "Admins can manage email_signature_settings"
  on public.email_signature_settings
  for all
  to authenticated
  using (public.user_has_admin_access(auth.uid()))
  with check (public.user_has_admin_access(auth.uid()));
