-- Makler-Mails automatisch zuordnen:
--  * Anfragen von immowelt („Online-ID …: … wünscht Kontakt“) werden zum Objekt
--    (über portal_ids) als Interessent angelegt, die Mail wird verknüpft.
--  * Weitere Mails von/an einen bekannten Interessenten landen in seinem Verlauf.
-- Läuft bei jeder neuen Mail (Trigger) und einmalig für alle vorhandenen Mails.

alter table public.broker_properties add column if not exists portal_ids text[] not null default '{}';
create index if not exists broker_properties_portal_ids_idx on public.broker_properties using gin (portal_ids);

-- Bekannte immowelt-Nummern der Objekte
update public.broker_properties set portal_ids = array['2pfwl5e']
 where legacy_website_id = '23abffaf-ae08-45ed-bc4d-f934ad72e71a' and portal_ids = '{}';
update public.broker_properties set portal_ids = array['2nk675m','2qqlm59']
 where legacy_website_id = 'c47be482-1ab5-4ff4-a512-7e7e90d3a5e7' and portal_ids = '{}';
update public.broker_properties set portal_ids = array['2rlsl5m']
 where title = '2-Zi.-OG-Whg. , 1. OG re' and city = 'Oy-Mittelberg' and portal_ids = '{}';

-- Objekte, die bisher nur bei immowelt standen
insert into public.broker_properties (listing_type, title, postal_code, city, price_eur, living_space_sqm, rooms,
  commission_buyer_pct, commission_text, status, website_state, is_active, show_on_website, portal_ids, assigned_to, created_by)
select 'sale', '2-Zimmer-Wohnung mit Westbalkon und Bergblick', '87459', 'Pfronten', 220000, 55.36, 2,
  3.57, '3,57 % inkl. MwSt.', 'vermarktung', 'aktiv', true, false, array['2suad5k'], p.user_id, p.user_id
from (select user_id from public.profiles where email = 'regina.goettinger@rgi-immobilien.de' limit 1) p
where not exists (select 1 from public.broker_properties where '2suad5k' = any(portal_ids));

insert into public.broker_properties (listing_type, title, postal_code, city, commission_buyer_pct, commission_text,
  status, website_state, is_active, show_on_website, portal_ids, assigned_to, created_by)
select 'sale', 'Bezugsfertiges Personalwohnheim am Kurpark Pfronten', '87459', 'Pfronten', 2.38, '2,38 % inkl. MwSt.',
  'vermarktung', 'aktiv', true, false, array['2sh885k'], p.user_id, p.user_id
from (select user_id from public.profiles where email = 'regina.goettinger@rgi-immobilien.de' limit 1) p
where not exists (select 1 from public.broker_properties where '2sh885k' = any(portal_ids));

-- Angaben aus einer immowelt-Anfrage lesen
create or replace function public.makler_immowelt_daten(_text text)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'online_id', lower(substring(t from 'Online-ID: ?([A-Za-z0-9]+)')),
    'name', nullif(trim(regexp_replace(coalesce(substring(t from 'Name: (.*?) Firma:'), ''), '^(Herr|Frau|Divers) ', '')), ''),
    'telefon', coalesce(nullif(trim(substring(t from 'Mobil: (.*?) E-Mail:')), ''), nullif(trim(substring(t from 'Telefon: (.*?) Telefax:')), '')),
    'email', lower(nullif(trim(substring(t from 'E-Mail: ([^ ]+@[^ ]+)')), '')),
    'nachricht', nullif(trim(substring(t from 'Nachricht: (.*?) (Wie zufrieden|Mit freundlichen)')), '')
  )
  from (select regexp_replace(regexp_replace(coalesce(_text, ''), '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g') t) s;
$$;

-- Eine Mail zuordnen (falls möglich). Wirft nie einen Fehler nach außen.
create or replace function public.makler_mail_zuordnen(_email_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  e record;
  d jsonb;
  onr text;
  prop uuid;
  lead uuid;
  partner text;
  kontakt uuid;
begin
  select id, subject, from_address, from_name, to_addresses, date, body_text, body_html, broker_property_id, broker_lead_id
    into e from public.emails where id = _email_id and deleted_at is null;
  if not found or e.broker_lead_id is not null then return; end if;

  -- 1) immowelt-Anfrage
  if e.subject ~* 'Online-ID' and coalesce(e.from_address, '') ilike '%immowelt%' then
    d := public.makler_immowelt_daten(coalesce(nullif(e.body_text, ''), e.body_html));
    onr := coalesce(d->>'online_id', lower(substring(e.subject from '(?i)Online-ID ([A-Za-z0-9]+)')));
    select id into prop from public.broker_properties where onr = any(portal_ids) limit 1;
    if prop is null then return; end if;
    if d->>'email' is null and d->>'name' is null then
      update public.emails set broker_property_id = prop where id = e.id and broker_property_id is null;
      return;
    end if;
    select id into lead from public.broker_leads
     where property_id = prop
       and ((d->>'email' is not null and lower(external_email) = d->>'email')
            or (d->>'email' is null and external_name = d->>'name'))
     order by created_at limit 1;
    if lead is null then
      select ce.contact_id into kontakt from public.contact_emails ce where lower(ce.email) = d->>'email' limit 1;
      insert into public.broker_leads (property_id, contact_id, external_name, external_email, external_phone, status, notes, source, created_at, updated_at)
      values (prop, kontakt, d->>'name', d->>'email', d->>'telefon', 'neu', d->>'nachricht', 'immowelt', coalesce(e.date, now()), coalesce(e.date, now()))
      returning id into lead;
    end if;
    update public.emails set broker_property_id = prop, broker_lead_id = lead where id = e.id;
    if not exists (select 1 from public.broker_lead_events where email_id = e.id) then
      insert into public.broker_lead_events (lead_id, event_type, occurred_at, title, body, email_id)
      values (lead, 'note', coalesce(e.date, now()), 'Anfrage über immowelt', d->>'nachricht', e.id);
    end if;
    return;
  end if;

  -- 2) Mail von/an einen bekannten Interessenten.
  --    Verwaltungs-Themen nie dem Makler zuordnen (Interessenten können auch Eigentümer sein).
  if coalesce(e.subject, '') ~ '\mWEG\M'
     or coalesce(e.subject, '') ~* '(Eigentümer|Versammlung|Verwaltung|Hausgeld|Sonderumlage|Abrechnung|Wirtschaftsplan|Beirat|Protokoll|Pflaster|Hausmeister)' then
    return;
  end if;
  if coalesce(e.from_address, '') ilike '%@rgi-immobilien.de' then
    select lower(x) into partner from jsonb_array_elements_text(coalesce(e.to_addresses, '[]'::jsonb)) x
     where x not ilike '%@rgi-immobilien.de' limit 1;
  else
    partner := lower(e.from_address);
  end if;
  if partner is null or partner = '' or partner ilike '%immowelt%' then return; end if;
  select l.id, l.property_id into lead, prop from public.broker_leads l
   where lower(l.external_email) = partner
     and (e.broker_property_id is null or l.property_id = e.broker_property_id)
     and coalesce(e.date, now()) >= l.created_at - interval '1 day'
     and l.status not in ('abschluss', 'absage')
   order by l.created_at desc limit 1;
  if lead is null then return; end if;
  update public.emails set broker_property_id = prop, broker_lead_id = lead where id = e.id;
  if not exists (select 1 from public.broker_lead_events where email_id = e.id) then
    insert into public.broker_lead_events (lead_id, event_type, occurred_at, title, email_id)
    values (lead, 'email', coalesce(e.date, now()),
            case when e.from_address ilike '%@rgi-immobilien.de' then 'E-Mail gesendet: ' else 'E-Mail erhalten: ' end || coalesce(e.subject, '(ohne Betreff)'),
            e.id);
  end if;
exception when others then
  raise warning 'makler_mail_zuordnen(%): %', _email_id, sqlerrm;
end $$;

revoke execute on function public.makler_mail_zuordnen(uuid) from public, anon, authenticated;
revoke execute on function public.makler_immowelt_daten(text) from public, anon;

create or replace function public.emails_makler_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.broker_lead_id is null and new.deleted_at is null then
    perform public.makler_mail_zuordnen(new.id);
  end if;
  return null;
end $$;

drop trigger if exists emails_makler_zuordnen on public.emails;
create trigger emails_makler_zuordnen after insert or update of body_text on public.emails
  for each row execute function public.emails_makler_trigger();

-- Einmalig am 18.10.2026 (bereits erledigt, hier nur dokumentiert):
--  * makler_mail_zuordnen() für alle vorhandenen Mails ausgeführt
--  * Makler-Mails ohne immowelt-Nummer (Hopfen, Hotel/Alpenlodge, Personalwohnheim, Mietwohnung Oy)
--    über den Betreff einem Objekt zugeordnet und als Interessent (Quelle „E-Mail") angelegt
--  * Interessenten mit Antwort von RGI auf „kontaktiert" gesetzt
