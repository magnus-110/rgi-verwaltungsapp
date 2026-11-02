-- Elektronische Unterschrift: „Nur Link erstellen (ich verschicke selbst)“.
-- versand = 'mail' (Einladung per E-Mail von info@, bisheriges Verhalten)
--         | 'link' (kein Einladungsmail; der Link wird dem Büro einmalig angezeigt und selbst verschickt).
-- Die Methode bleibt 'online'; die E-Mail-Adresse ist bei 'link' optional
-- (nur für Erinnerungen und die Kopie nach dem Unterschreiben).
alter table public.sign_request_signers
  add column if not exists versand text not null default 'mail';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sign_request_signers_versand_check') then
    alter table public.sign_request_signers
      add constraint sign_request_signers_versand_check check (versand in ('mail', 'link'));
  end if;
end $$;

comment on column public.sign_request_signers.versand is
  'mail = Einladung per E-Mail · link = Link wird nur im Büro angezeigt und selbst verschickt (E-Mail optional)';
